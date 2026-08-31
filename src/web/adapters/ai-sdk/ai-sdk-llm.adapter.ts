import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LanguageModelUsage } from 'ai';
import type { Block, RecapBody, TopicPreviewBody } from '../../../contracts';
import type {
  GeneratedItem,
  ItemVerdict,
  LlmGatewayPort,
  LlmResult,
  LlmTask,
  LlmUsage,
  TopicDraft,
} from '../../../business/ports/llm.port';
import { PROMPTS } from '../prompts';
import { ModelRegistry, type ModelRef } from './models';
import {
  blocksSchema,
  diagramClozeSchema,
  diagramSchema,
  sketchSchema,
  itemBatchSchema,
  itemVerdictSchema,
  topicQuizSchema,
  previewSchema,
  recallGradeSchema,
  questionCheckSchema,
  interviewSchema,
  ocrPageSchema,
  outlineSchema,
  prerequisitesSchema,
  recapSchema,
  topicsSchema,
} from './schemas';

/**
 * The model gateway, on the Vercel AI SDK.
 *
 * Two things the SDK buys us that hand-rolled HTTP did not: provider choice is
 * per task rather than per deployment (`AI_MODEL_SIMPLIFY_STANDARD` can be a
 * cheap model while highlights use a stronger one), and structured output is
 * schema-validated by the SDK instead of parsed out of prose here.
 *
 * Every model call in the product goes through this class, so it stays the one
 * place to add rate limiting, retries and the cost ledger (§6.2).
 */
@Injectable()
export class AiSdkLlmAdapter implements LlmGatewayPort, OnModuleInit {
  private readonly logger = new Logger(AiSdkLlmAdapter.name);
  private readonly registry: ModelRegistry;

  constructor(private readonly config: ConfigService) {
    this.registry = new ModelRegistry(config);
  }

  /** Fail at boot on a missing key, not on the first upload. */
  onModuleInit(): void {
    this.registry.assertConfigured();
  }

  async ocrPage(input: {
    png: Buffer;
    pageNumber: number;
  }): Promise<LlmResult<{ blocks: Block[]; handwritten: boolean }>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('ocr_page');

    const result = await generateObject({
      model,
      schema: ocrPageSchema,
      system: PROMPTS.ocrPage,
      messages: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'image' as const,
              image: input.png,
              mediaType: 'image/png',
            },
            {
              type: 'text' as const,
              text: `Transcribe this scanned page (page ${input.pageNumber}).`,
            },
          ],
        },
      ],
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async summarize(input: {
    title: string;
    text: string;
  }): Promise<LlmResult<string>> {
    return this.text(
      'summarize',
      PROMPTS.summarize,
      `Title: ${input.title}\n\n${input.text}`,
    );
  }

  async outlineTopics(input: {
    digest: string;
    pageCount: number;
  }): Promise<LlmResult<TopicDraft[]>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('topics_outline');

    const result = await generateObject({
      model,
      schema: topicsSchema,
      system: PROMPTS.topics(input.pageCount),
      prompt: input.digest,
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object.topics,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async simplifyPage(input: {
    task: 'simplify_standard' | 'simplify_easiest';
    pageText: string;
    summary: string | null;
    pageNumber: number;
  }): Promise<LlmResult<Block[]>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel(input.task);

    const context = input.summary
      ? `Document summary:\n${input.summary}\n\n`
      : '';

    const result = await generateObject({
      model,
      schema: blocksSchema,
      system:
        input.task === 'simplify_easiest'
          ? PROMPTS.simplifyEasiest
          : PROMPTS.simplifyStandard,
      prompt: `${context}Page ${input.pageNumber}:\n${input.pageText}`,
      maxRetries: this.maxRetries(),
    });

    // The schema guarantees at least one block, but never trust a page to
    // silently become empty — a page that wasn't simplified still beats a
    // blank one in the reader.
    const blocks = result.object.blocks.length
      ? result.object.blocks
      : this.asParagraphs(input.pageText);

    return { value: blocks, usage: this.usage(ref, result.usage, started) };
  }

  async answerHighlight(input: {
    task: 'highlight_explain' | 'highlight_simplify' | 'highlight_define';
    selection: string;
    context: string;
    summary: string | null;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>> {
    const prompt = [
      input.summary ? `Document summary:\n${input.summary}` : null,
      input.context ? `Passages from the document:\n${input.context}` : null,
      `Selected text:\n${input.selection}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const system = PROMPTS.highlight[input.task];
    if (!input.onToken) return this.text(input.task, system, prompt);

    const started = Date.now();
    const { streamText } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel(input.task);

    const result = streamText({
      model,
      system,
      prompt,
      maxRetries: this.maxRetries(),
    });

    let answer = '';
    for await (const chunk of result.textStream) {
      answer += chunk;
      input.onToken(chunk);
    }

    return {
      value: answer.trim(),
      usage: this.usage(ref, await result.usage, started),
    };
  }

  async chatWithDocument(input: {
    history: { role: 'user' | 'assistant'; content: string }[];
    question: string;
    context: string;
    summary: string | null;
    profile: string;
    /** The reader pressed "Still not clear": climb down a rung. */
    simpler?: boolean;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>> {
    // The passages ride with the turn they answer, so a later follow-up can
    // still see the evidence an earlier answer was built on.
    const turn = [
      input.summary ? `Document summary:\n${input.summary}` : null,
      input.context ? `Passages from the document:\n${input.context}` : null,
      `Question:\n${input.question}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const messages = [
      ...input.history,
      { role: 'user' as const, content: turn },
    ];

    const started = Date.now();
    const { streamText, generateText } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel(
      input.simpler ? 'chat_clarify' : 'chat_document',
    );
    // The profile rides in the system turn — standing instruction, not
    // content — so it shapes the first answer, not just retries.
    //
    // A ladder press swaps the prompt wholesale rather than appending to it:
    // the chat prompt carries its own structural rules, and appending an
    // instruction to change structure left the model obeying the older,
    // longer one — the same answer in smaller words.
    const system = [
      input.simpler ? PROMPTS.chatClarify : PROMPTS.chat,
      input.profile,
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!input.onToken) {
      const result = await generateText({
        model,
        system,
        messages,
        maxRetries: this.maxRetries(),
      });
      return {
        value: result.text.trim(),
        usage: this.usage(ref, result.usage, started),
      };
    }

    const result = streamText({
      model,
      system,
      messages,
      maxRetries: this.maxRetries(),
    });

    let answer = '';
    for await (const chunk of result.textStream) {
      answer += chunk;
      input.onToken(chunk);
    }

    return {
      value: answer.trim(),
      usage: this.usage(ref, await result.usage, started),
    };
  }

  async outlinePrerequisites(input: {
    summary: string | null;
    chapters: { title: string; description: string | null }[];
  }) {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('topics_prereqs');

    const outline = input.chapters
      .map(
        (chapter, index) =>
          `${index + 1}. ${chapter.title}${chapter.description ? ` — ${chapter.description}` : ''}`,
      )
      .join('\n');

    const result = await generateObject({
      model,
      schema: prerequisitesSchema,
      system: PROMPTS.topicPrereqs,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        `Chapters, in reading order:\n${outline}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object.prerequisites,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async interviewForTopic(input: { topic: string }) {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('learn_interview');

    const result = await generateObject({
      model,
      schema: interviewSchema,
      system: PROMPTS.learnInterview,
      prompt: `The reader wants to learn: ${input.topic}`,
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async outlineTopic(input: {
    topic: string;
    brief: string;
    targetPages: number;
    mustCover?: string[];
  }) {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('learn_outline');

    const result = await generateObject({
      model,
      schema: outlineSchema,
      system: PROMPTS.learnOutline,
      prompt: [
        `Topic: ${input.topic}`,
        `About this reader:\n${input.brief}`,
        `Total length: about ${input.targetPages} pages.`,
        input.mustCover?.length
          ? `This is an expansion of an earlier, shorter document. It must now also cover, properly rather than in passing:\n${input.mustCover
              .map((topic) => `- ${topic}`)
              .join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async writeChapter(input: {
    topic: string;
    brief: string;
    documentTitle: string;
    chapter: { title: string; summary: string; pages: number };
    outline: string[];
  }) {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('learn_write');

    const result = await generateObject({
      model,
      schema: blocksSchema,
      system: PROMPTS.learnWrite,
      prompt: [
        `Document: "${input.documentTitle}" — a study document about ${input.topic}.`,
        `About this reader:\n${input.brief}`,
        `The full chapter list, in order:\n${input.outline
          .map((title, index) => `${index + 1}. ${title}`)
          .join('\n')}`,
        `Write this chapter and only this chapter:\n"${input.chapter.title}" — ${input.chapter.summary}`,
        // Roughly 450 words a page at the reader's type scale; the model is
        // far better at a word count than at imagining a page.
        `Length: about ${input.chapter.pages * 450} words.`,
      ].join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: { blocks: result.object.blocks },
      usage: this.usage(ref, result.usage, started),
    };
  }

  async rewriteImageQuery(input: {
    selection: string;
    summary: string | null;
  }): Promise<LlmResult<string>> {
    const result = await this.text(
      'visualize_query',
      PROMPTS.imageQuery,
      [
        input.summary ? `Subject area: ${input.summary.slice(0, 500)}` : null,
        input.selection,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );

    return {
      value: result.value.replace(/^["']|["']$/g, '').slice(0, 200),
      usage: result.usage,
    };
  }

  async drawDiagram(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; mermaid: string }>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('diagram');

    const result = await generateObject({
      model,
      schema: diagramSchema,
      system: PROMPTS.diagram,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        input.context ? `Passages from the document:\n${input.context}` : null,
        `Draw: ${input.description}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    // Models love wrapping Mermaid in fences whatever the prompt says.
    const mermaid = result.object.mermaid
      .replace(/^```(?:mermaid)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    return {
      value: { title: result.object.title, mermaid },
      usage: this.usage(ref, result.usage, started),
    };
  }

  async generateTopicQuiz(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
    focus?: string[];
  }): Promise<
    LlmResult<{
      questions: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }[];
    }>
  > {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('topic_quiz');

    const result = await generateObject({
      model,
      schema: topicQuizSchema,
      system: PROMPTS.topicQuiz,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        `Chapter: ${input.topicTitle}`,
        input.focus?.length
          ? [
              'The reader is rereading this chapter because these ideas',
              'have not stuck. Aim most of the questions squarely at them,',
              'still grounded only in the passages:\n- ' +
                input.focus.join('\n- '),
            ].join(' ')
          : null,
        `The chapter's text:\n${input.pagesText}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    // Clamp schema-legal lies the way the cloze does.
    const questions = result.object.questions.map((q) => ({
      ...q,
      correctIndex: Math.min(q.correctIndex, q.options.length - 1),
    }));

    return {
      value: { questions },
      usage: this.usage(ref, result.usage, started),
    };
  }

  async generateItems(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
    kind: 'mcq' | 'flashcard' | 'cloze' | 'true_false' | 'mixed';
    count: number;
    avoidStems?: string[];
    focus?: string[];
    fromQuote?: string;
  }): Promise<LlmResult<GeneratedItem[]>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('item_write');

    const result = await generateObject({
      model,
      schema: itemBatchSchema,
      system: PROMPTS.itemWrite,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        `Chapter: ${input.topicTitle}`,
        `Write ${input.count} items.`,
        input.kind === 'mixed'
          ? 'Mix the kinds: mostly mcq, with some cloze and true_false.'
          : `Every item must be of kind "${input.kind}".`,
        input.fromQuote
          ? [
              'Build every item from THIS sentence, which the reader',
              'highlighted. Do not range across the rest of the passage:',
              `\n"${input.fromQuote}"`,
            ].join(' ')
          : null,
        input.focus?.length
          ? 'Aim most items at these ideas, which the reader keeps missing:\n- ' +
            input.focus.join('\n- ')
          : null,
        // Cheaper and more reliable than asking it to remember: the stems
        // it must not rewrite are listed outright.
        input.avoidStems?.length
          ? 'Do NOT rewrite any of these existing questions:\n- ' +
            input.avoidStems.slice(0, 40).join('\n- ')
          : null,
        `The passage:\n${input.pagesText}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    // Clamp schema-legal lies, as the quiz path does.
    const items = result.object.items.map((item) => ({
      ...item,
      correctIndex: Math.min(
        Math.max(0, item.correctIndex),
        item.options.length - 1,
      ),
    }));

    return { value: items, usage: this.usage(ref, result.usage, started) };
  }

  async verifyItem(input: {
    stem: string;
    options: string[];
    pagesText: string;
  }): Promise<LlmResult<ItemVerdict>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('item_verify');

    const result = await generateObject({
      model,
      schema: itemVerdictSchema,
      system: PROMPTS.itemVerify,
      // The intended answer is deliberately absent from this prompt.
      prompt: [
        `Passage:\n${input.pagesText}`,
        `Question: ${input.stem}`,
        'Options:',
        input.options.map((option, i) => `${i}. ${option}`).join('\n'),
      ].join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    const verdict = result.object;
    return {
      value: {
        ...verdict,
        // Out-of-range means "no opinion", never a coincidental match.
        answerIndex:
          verdict.answerIndex >= input.options.length
            ? -1
            : verdict.answerIndex,
      },
      usage: this.usage(ref, result.usage, started),
    };
  }

  async drawDiagramCloze(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<
    LlmResult<{
      title: string;
      mermaid: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }>
  > {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('diagram');

    const result = await generateObject({
      model,
      schema: diagramClozeSchema,
      system: PROMPTS.diagramCloze,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        input.context ? `Passages from the document:\n${input.context}` : null,
        `Draw with a blank: ${input.description}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    const mermaid = result.object.mermaid
      .replace(/^```(?:mermaid)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    // A correctIndex past the options is a schema-legal lie; clamp it.
    const correctIndex = Math.min(
      result.object.correctIndex,
      result.object.options.length - 1,
    );

    return {
      value: { ...result.object, mermaid, correctIndex },
      usage: this.usage(ref, result.usage, started),
    };
  }

  async generateTopicPreview(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
  }): Promise<LlmResult<TopicPreviewBody>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('preview');

    const result = await generateObject({
      model,
      schema: previewSchema,
      system: PROMPTS.preview,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        `Chapter: ${input.topicTitle}`,
        `The chapter's text:\n${input.pagesText}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async gradeRecall(input: {
    topicTitle: string;
    pagesText: string;
    recall: string;
    previouslyMissed?: string[];
  }): Promise<
    LlmResult<{
      score: number;
      nailed: string[];
      missed: string[];
      focus: string[];
      nowCovered: number[];
    }>
  > {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('recall_grade');

    const result = await generateObject({
      model,
      schema: recallGradeSchema,
      system: PROMPTS.recallGrade,
      prompt: [
        `Chapter: ${input.topicTitle}`,
        `The chapter's text:\n${input.pagesText}`,
        `The reader's recall, from memory:\n${input.recall}`,
        input.previouslyMissed?.length
          ? `Ideas missed on earlier attempts, numbered from 0:\n${input.previouslyMissed
              .map((idea, index) => `${index}. ${idea}`)
              .join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    // The schema bounds it, but clamp anyway — this number feeds mastery.
    const score = Math.min(1, Math.max(0, result.object.score));
    // Indices past the list are a schema-legal lie; drop them rather than
    // let them resolve the wrong idea.
    const asked = input.previouslyMissed?.length ?? 0;
    const nowCovered = result.object.nowCovered.filter(
      (index) => index < asked,
    );

    return {
      value: { ...result.object, score, nowCovered },
      usage: this.usage(ref, result.usage, started),
    };
  }

  async checkQuestionAnswer(input: {
    question: string;
    answer: string;
    context: string;
    summary: string | null;
  }): Promise<
    LlmResult<{
      verdict: 'correct' | 'partial' | 'incorrect';
      explanation: string;
      page: number;
    }>
  > {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('question_check');

    const result = await generateObject({
      model,
      schema: questionCheckSchema,
      system: PROMPTS.questionCheck,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        input.context ? `Passages from the document:\n${input.context}` : null,
        `The reader's question, posed before reading:\n${input.question}`,
        `The reader's answer, in their own words:\n${input.answer}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async drawSketch(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; svg: string }>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('sketch');

    const result = await generateObject({
      model,
      schema: sketchSchema,
      system: PROMPTS.sketch,
      prompt: [
        input.summary ? `Document summary:\n${input.summary}` : null,
        input.context ? `Passages from the document:\n${input.context}` : null,
        `Sketch: ${input.description}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    // Same fence-stripping reflex as diagrams — models wrap markup whatever
    // the prompt says. The client sanitizes; this only tidies.
    const svg = result.object.svg
      .replace(/^```(?:svg|xml|html)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    return {
      value: { title: result.object.title, svg },
      usage: this.usage(ref, result.usage, started),
    };
  }

  async writeRecap(input: {
    documentTitle: string;
    fromPage: number;
    toPage: number;
    pages: { pageNumber: number; text: string }[];
    topics: { title: string; startPage: number; endPage: number }[];
    questions: string[];
    checks: { kind: string; score: number }[];
    prerequisitesAsked: string[];
    profile: string;
  }): Promise<LlmResult<RecapBody>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('session_recap');

    // Scored out of 10 rather than as raw floats: the model reads "4/10" far
    // more reliably than "0.38", and the exact value adds nothing here.
    const checks = input.checks.length
      ? input.checks
          .map((check) => `${check.kind}: ${Math.round(check.score * 10)}/10`)
          .join(', ')
      : 'none answered';

    const result = await generateObject({
      model,
      schema: recapSchema,
      system: PROMPTS.sessionRecap,
      prompt: [
        `Document: ${input.documentTitle}`,
        `Pages read this session: ${input.fromPage}–${input.toPage}`,
        input.topics.length
          ? `Chapters covered:\n${input.topics
              .map((t) => `- ${t.title} (pages ${t.startPage}-${t.endPage})`)
              .join('\n')}`
          : null,
        `The pages themselves:\n${input.pages
          .map((page) => `[p.${page.pageNumber}] ${page.text}`)
          .join('\n\n')}`,
        input.questions.length
          ? `What they asked, in order:\n${input.questions
              .map((q) => `- ${q}`)
              .join('\n')}`
          : 'They asked nothing this session.',
        `Comprehension checks: ${checks}`,
        input.prerequisitesAsked.length
          ? `They said they did not know: ${input.prerequisitesAsked.join('; ')}`
          : null,
        input.profile ? `How this reader learns:\n${input.profile}` : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async embed(input: { texts: string[] }): Promise<LlmResult<number[][]>> {
    const started = Date.now();
    const { embedMany } = await this.registry.modules();
    const { model, ref } = await this.registry.embeddingModel();

    const result = await embedMany({
      model,
      values: input.texts,
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.embeddings,
      usage: {
        model: `${ref.provider}:${ref.modelId}`,
        tokensIn: result.usage.tokens,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  private async text(
    task: LlmTask,
    system: string,
    prompt: string,
  ): Promise<LlmResult<string>> {
    const started = Date.now();
    const { generateText } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel(task);

    const result = await generateText({
      model,
      system,
      prompt,
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.text.trim(),
      usage: this.usage(ref, result.usage, started),
    };
  }

  /** Recorded per call, so cost is answerable per document and per task. */
  private usage(
    ref: ModelRef,
    usage: LanguageModelUsage,
    startedAt: number,
  ): LlmUsage {
    return {
      model: `${ref.provider}:${ref.modelId}`,
      tokensIn: usage.inputTokens ?? 0,
      tokensOut: usage.outputTokens ?? 0,
      latencyMs: Date.now() - startedAt,
    };
  }

  private maxRetries(): number {
    // The queue already retries the whole job with backoff; a couple of
    // in-call retries only cover transient rate limits.
    return Number(this.config.get<string>('AI_MAX_RETRIES', '2'));
  }

  private asParagraphs(text: string): Block[] {
    this.logger.warn(
      'Model returned no blocks; falling back to the original text',
    );
    return text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => ({ type: 'paragraph' as const, text: paragraph }));
  }
}
