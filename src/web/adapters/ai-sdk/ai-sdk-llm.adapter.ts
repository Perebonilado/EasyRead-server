import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LanguageModelUsage } from 'ai';
import type { Block } from '../../../contracts';
import type {
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
  diagramSchema,
  interviewSchema,
  outlineSchema,
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
    const { model, ref } = await this.registry.languageModel('chat_document');
    const system = PROMPTS.chat;

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
