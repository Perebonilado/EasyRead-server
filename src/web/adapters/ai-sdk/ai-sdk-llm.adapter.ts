import { numberedSentences } from '../../../business/domain/board';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LanguageModelUsage } from 'ai';
import type { Block, RecapBody, TopicPreviewBody } from '../../../contracts';
import type {
  GeneratedItem,
  ItemVerdict,
  LectureOutlineDraft,
  LectureSegmentDraft,
  LlmGatewayPort,
  LlmResult,
  LlmTask,
  LlmUsage,
  TopicDraft,
  LectureBoardDraft,
  LectureBoardPlanDraft,
  LectureDiagramDraft,
} from '../../../business/ports/llm.port';
import { PROMPTS } from '../prompts';
import { ModelRegistry, type ModelRef } from './models';
import {
  blocksSchema,
  diagramClozeSchema,
  diagramSchema,
  sketchSchema,
  itemBatchSchema,
  lectureBoardPlanSchema,
  lectureBoardSchema,
  lectureDiagramSchema,
  lectureExtraSchema,
  lectureOutlineSchema,
  lectureSegmentSchema,
  lectureVerifySchema,
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

  async lectureOutline(input: {
    title: string;
    topicTitle: string;
    pages: { pageNumber: number; text: string }[];
    priorTopics: string[];
    priorOpenings: string[];
    suggestedShape: { name: string; direction: string; example: string };
    taughtEarlier: string[];
    correction?: string;
  }): Promise<LlmResult<LectureOutlineDraft>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('lecture_outline');

    const result = await generateObject({
      model,
      schema: lectureOutlineSchema,
      system: PROMPTS.lectureOutline,
      prompt: [
        `Document: ${input.title}`,
        `Chapter: ${input.topicTitle}`,
        input.priorTopics.length
          ? `Chapters before this one in the document. The student may have read them, and has heard the ones marked "already lectured":\n- ${input.priorTopics.join('\n- ')}`
          : 'This is the first chapter of the document, so there is nothing earlier to call back to.',
        `Open with ${input.suggestedShape.name}: ${input.suggestedShape.direction}`,
        `An opening of this shape, from an unrelated subject: "${input.suggestedShape.example}". Match the move, not the words.`,
        input.priorOpenings.length
          ? `Earlier chapters of this lecture opened like this. This one must open differently: a different shape, a different first word.\n- "${input.priorOpenings.join('"\n- "')}"`
          : null,
        input.taughtEarlier.length
          ? `What earlier chapters of this lecture already taught. Do not plan to teach it again; plan to build on it:\n- ${input.taughtEarlier.join('\n- ')}`
          : null,
        input.correction
          ? `Your previous plan was rejected: ${input.correction}. Fix exactly that and keep the rest.`
          : null,
        `Plan a beat for each of these pages: ${input.pages
          .map((page) => page.pageNumber)
          .join(', ')}.`,
        ...input.pages.map(
          (page) => `\nPage ${page.pageNumber}:\n${page.text}`,
        ),
      ]
        .filter(Boolean)
        .join('\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async lectureSegment(input: {
    topicTitle: string;
    hook: string;
    arc: string;
    beat: {
      goal: string;
      callback: string | null;
      foreshadow: string | null;
      newHere: string | null;
      skip: string | null;
      weight: 'full' | 'light';
      moves: string[];
      pitfall: string | null;
      turn: boolean;
    };
    problem: string | null;
    pageIndex: number;
    pageCount: number;
    style: 'gentle' | 'steady' | 'brisk';
    styleDirection: string;
    budget: { min: number; max: number };
    pageText: string;
    noteAddressed: string | null;
    prevTail: string;
    isFirstOfTopic: boolean;
    isLastOfTopic: boolean;
    bridge: boolean;
    payoff: string | null;
    opening: string | null;
    taughtSoFar: string[];
    comingLater: string[];
    list: { items: number } | null;
    board: {
      heading: string;
      lines: {
        number: number;
        move: number;
        kind: 'term' | 'point' | 'figure';
        text: string;
        meaning: string | null;
      }[];
    } | null;
    correction?: string;
    styleCorrection?: string;
    strict?: boolean;
  }): Promise<LlmResult<LectureSegmentDraft>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('lecture_segment');

    const place = input.opening
      ? `The chapter has just opened with these exact words, which the listener has just heard: "${input.opening}". Do not repeat or rephrase them. Carry straight on into the first idea.`
      : input.isFirstOfTopic
        ? `This is the OPENING of the chapter. Open it yourself in one or two sentences that make this hook's point without its words, then get into the first idea. The hook: ${input.hook}`
        : input.prevTail
          ? `You are mid-chapter. The last thing you said was:\n"${input.prevTail}"\nCarry straight on from it.`
          : 'You are mid-chapter. Carry on with the chapter without greeting the student or starting it over.';

    const list = input.list
      ? input.list.items <= 6
        ? `The page carries a list of ${input.list.items} items. Name them briefly first, in one breath, so the listener has the map, then explain only the ones that need it.`
        : `The page carries a list of ${input.list.items} items. Do not read it out. Give the count, the two or three that carry the weight, and where the rest sit.`
      : null;

    const moves =
      input.beat.moves.length > 1
        ? `Write one section per move, in this order, each with its move number:\n${input.beat.moves
            .map((move, index) => `${index}: ${move}`)
            .join('\n')}`
        : `This page has one move: ${input.beat.moves[0] ?? input.beat.goal}. Return one section, move 0.`;

    const result = await generateObject({
      model,
      schema: lectureSegmentSchema,
      system: PROMPTS.lectureSegment,
      prompt: [
        `Chapter: ${input.topicTitle}`,
        `The shape of this chapter: ${input.arc}`,
        place,
        `What this stretch must accomplish: ${input.beat.goal}`,
        input.beat.newHere
          ? `New on this page, and where your words go: ${input.beat.newHere}`
          : null,
        input.beat.skip
          ? `The page also repeats this, which the listener already has: ${input.beat.skip}. A clause at most, or nothing.`
          : null,
        moves,
        `HOW TO TEACH IT (the ${input.style} style): ${input.styleDirection}`,
        input.pageCount > 1
          ? `This is page ${input.pageIndex + 1} of ${input.pageCount} in the chapter${input.style === 'gentle' ? ((input.pageIndex + 1) * 2 <= input.pageCount ? ': an early page, so restate the idea fully' : ': a late page, so restate in a clause at most') : ''}.`
          : null,
        input.beat.pitfall
          ? `PITFALL, the mistake a student is most likely to make here: ${input.beat.pitfall}. Say the trap and why the idea avoids it, in a sentence.`
          : null,
        input.beat.turn && !input.bridge
          ? "This page carries the chapter's TURN: at the moment the listener could predict what comes next, ask them to, put [pause] on its own line, then give the answer from the page."
          : null,
        input.problem && input.style === 'brisk' && !input.opening
          ? `Open on the problem this chapter answers, in one line, before the principle: ${input.problem}`
          : null,
        input.bridge
          ? 'This page carries almost nothing: a figure or a divider. Say ONE short sentence that carries the student across it, and nothing more.'
          : `Length: ${input.budget.min} to ${input.budget.max} words across all sections${input.beat.weight === 'light' ? ' (a light page: say what is new and move on)' : ''}.`,
        input.taughtSoFar.length
          ? `Already taught in this lecture. Do not teach it again; if the page repeats it, a clause at most:\n- ${input.taughtSoFar.join('\n- ')}`
          : null,
        input.comingLater.length
          ? `Still to come in this chapter, so leave it for then:\n- ${input.comingLater.join('\n- ')}`
          : null,
        list,
        input.beat.callback
          ? `Tie back to this earlier idea in passing: ${input.beat.callback}`
          : null,
        input.beat.foreshadow
          ? `Plant this for later, in one line: ${input.beat.foreshadow}`
          : null,
        input.isLastOfTopic
          ? `This is the END of the chapter. Land this payoff in one sentence, in your own words, then stop. No summary, no preview of the next chapter. The payoff: ${input.payoff ?? 'the idea this chapter turned on'}`
          : null,
        input.correction
          ? `Your previous attempt was rejected for going beyond the page: ${input.correction}. Rewrite it using ONLY what the page below supports.`
          : null,
        input.styleCorrection
          ? `Your previous attempt was rejected for how it read: ${input.styleCorrection}. Rewrite it fixing exactly that, and keep every fact.`
          : null,
        input.strict
          ? 'STRICT: this page has been rejected twice for leaving the page. Teach only what is written on the page below, in its own terms. No hook, no callback, no foreshadowing, no claims about why it matters beyond what the page itself says, and no number or name the page does not state.'
          : null,
        input.board?.lines.length
          ? `THE BOARD for this page, in writing order. You write every one of these lines, exactly once, in the section of its move: [write n], then the line said word for word as its own sentence, then its explanation in everyday words, for example: "[write 2] Refill rate: ten tokens a second. That means every second, ten more tokens arrive, whatever else is happening."\n${input.board.lines
              .map(
                (line) =>
                  `${line.number}. (move ${line.move}) ${line.text}${line.meaning ? `: ${line.meaning}` : ''}`,
              )
              .join('\n')}`
          : 'This page has no board: no [write] or [point] marks.',
        input.noteAddressed
          ? `For each section, \`teaches\` lists the addresses of the sentences below it explains, in the order you explain them ("2.1"; a whole block as "5"), and is empty for a section that is your own example, a bridge or a callback.\nThe page you are teaching, every block and sentence addressed:\n${input.noteAddressed}`
          : `\`teaches\` is empty for every section: this page has no addressed note.\nThe page you are teaching:\n${input.pageText}`,
      ]
        .filter(Boolean)
        .join('\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async lectureExtra(input: {
    kind: 'terms' | 'check' | 'review';
    topicTitle: string;
    style: 'gentle' | 'steady' | 'brisk';
    styleDirection: string;
    terms: { term: string; meaning: string }[];
    taught: string[];
    payoff: string | null;
    daysAway: number | null;
    budget: { min: number; max: number };
  }): Promise<LlmResult<{ script: string }>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('lecture_segment');

    const result = await generateObject({
      model,
      schema: lectureExtraSchema,
      system: PROMPTS.lectureExtra,
      prompt: [
        `Write the ${input.kind.toUpperCase()} segment for the chapter "${input.topicTitle}".`,
        `The listener is a ${input.style === 'gentle' ? 'slow' : input.style === 'brisk' ? 'quick' : 'normal-paced'} learner. HOW TO SPEAK TO THEM: ${input.styleDirection}`,
        `Length: ${input.budget.min} to ${input.budget.max} words.`,
        input.kind === 'terms'
          ? `The words and their plain meanings, in order:\n${input.terms.map((entry) => `- ${entry.term}: ${entry.meaning}`).join('\n')}`
          : `The ideas the chapter taught, in order:\n- ${input.taught.join('\n- ')}`,
        input.kind === 'terms' && input.style === 'gentle'
          ? 'For this slow learner: for each word, say what the thing is or does in everyday words first, then give it its name, in two short sentences at most; one word per sentence, never two; no other technical term inside a meaning.'
          : null,
        input.kind !== 'terms' && input.payoff
          ? `What the listener can now do: ${input.payoff}`
          : null,
        input.kind === 'review' && input.daysAway !== null
          ? `They last listened ${input.daysAway === 1 ? 'a day' : `${input.daysAway} days`} ago.`
          : null,
      ]
        .filter(Boolean)
        .join('\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async lectureBoardPlan(input: {
    topicTitle: string;
    pageText: string;
    goal: string;
    newHere: string | null;
    pitfall: string | null;
    moves: string[];
    terms: { term: string; meaning: string }[];
    style: 'gentle' | 'steady' | 'brisk';
    light: boolean;
    correction?: string;
  }): Promise<LlmResult<LectureBoardPlanDraft>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('lecture_board');

    const density =
      input.style === 'gentle'
        ? 'a slow learner: a term with its meaning for every new word, the meaning in everyday words a friend would use ("a rule that turns any name into a number", not "a function mapping input to a fixed-size digest"), with no other technical term inside it, a short phrase of at most twelve words; a point for every claim and every step, in everyday words too; a figure for every number; a level 2 line for each detail under its parent. Six to twelve lines on a full page.'
        : input.style === 'brisk'
          ? 'a quick learner: terms and figures only, no meanings, a point only for a claim the term does not carry. Two to five lines.'
          : 'a normal pace: a term for each new word with a meaning only where the word is new, the claim each move makes, each figure. Four to eight lines.';

    const result = await generateObject({
      model,
      schema: lectureBoardPlanSchema,
      system: PROMPTS.lectureBoardPlan,
      prompt: [
        `Chapter: ${input.topicTitle}`,
        `The page's idea: ${input.goal}`,
        input.newHere ? `New on this page: ${input.newHere}` : null,
        `The moves the page teaches, in order; each line names the number of the move it is written during:\n${input.moves
          .map((move, index) => `${index}: ${move}`)
          .join('\n')}`,
        input.pitfall
          ? `A pitfall the page warns about: ${input.pitfall}`
          : null,
        input.terms.length
          ? input.style === 'gentle'
            ? `The chapter's terms, whose names the board keeps: ${input.terms
                .map((entry) => entry.term)
                .join(
                  '; ',
                )}. Write each meaning yourself, from the page, in everyday words: never a definition copied from anywhere.`
            : `The chapter's terms and their plain meanings: ${input.terms
                .map((entry) => `${entry.term} (${entry.meaning})`)
                .join('; ')}`
          : null,
        `LEARNER: ${density}${input.light ? ' This is a light page that mostly restates: only what is new goes on the board, two or three lines.' : ''}`,
        input.correction
          ? `Your previous plan broke the rules: ${input.correction}. Keep every other line word for word, in the same order, and fix only what was flagged: a word the page does not use is replaced by the page's own word; a sentence becomes a note; a topic label gains the claim that makes it a note; a line that stops mid-phrase is finished shorter; a line over its length loses whole words, and a word is never cut short.`
          : null,
        `\nThe page:\n${input.pageText.slice(0, 6000)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async lectureBoard(input: {
    topicTitle: string;
    spoken: string;
    pageText: string;
    moves: string[];
    goal: string;
    newHere: string | null;
    pitfall: string | null;
    terms: { term: string; meaning: string }[];
    style: 'gentle' | 'steady' | 'brisk';
    continues: boolean;
    budget: { min: number; max: number };
    correction?: string;
    repair?: {
      kind: string;
      text: string;
      meaning: string | null;
      reason: string;
    }[];
  }): Promise<LlmResult<LectureBoardDraft>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('lecture_board');

    const result = await generateObject({
      model,
      schema: lectureBoardSchema,
      system: PROMPTS.lectureBoard,
      prompt: [
        `Chapter: ${input.topicTitle}`,
        `The page's idea: ${input.goal}`,
        input.newHere ? `New on this page: ${input.newHere}` : null,
        input.moves.length > 1
          ? `The moves the page teaches, in order (write what each establishes, never its name): ${input.moves.join('; ')}`
          : null,
        input.pitfall
          ? `A pitfall the page warns about: ${input.pitfall}`
          : null,
        input.terms.length
          ? `The chapter's terms and their plain meanings: ${input.terms
              .map((entry) => `${entry.term} (${entry.meaning})`)
              .join('; ')}`
          : null,
        `LEARNER: ${
          input.style === 'gentle'
            ? 'a slow learner. A term with its plain meaning for each new word the moves introduce, a point for each step of the idea, a level 2 point for a detail that belongs under a step, and a cue when the speech comes back to something written. Fuller, but every item still earns its place.'
            : input.style === 'brisk'
              ? 'a quick learner. Terms and figures, a point only for a step that is not obvious from the term, no meanings. Sparse board.'
              : 'a normal pace. Terms with a meaning only for the words that are new, a point for each step that carries the page, one relation where two ideas are set against each other, and a cue on the idea being explained.'
        }`,
        input.continues
          ? 'This page CONTINUES a board that already has its heading: return heading null and add only new items.'
          : "This page opens a fresh board: give it a heading of two to five words, in the page's own terms.",
        `The page teaches ${input.budget.min} move${input.budget.min === 1 ? '' : 's'}; the pen can manage up to ${input.budget.max} written items (terms, points, figures) on it. Every useful point goes on the board, condensed; nothing is added just to reach a number, and nothing useful is left off to stay short.`,
        input.repair?.length
          ? `REPAIR. These lines were refused and nothing replaced them, so the board is missing what they carried. Return ONLY replacements, one per line below, in the same order, as the lecturer's own claim with a verb, each naming the number of the sentence it is written during; a line that names a subject becomes what the lecturer says is true of it; a meaning becomes the definition the lecturer gives. Return heading null and no other items.\n${input.repair
              .map(
                (line, index) =>
                  `${index + 1}. ${line.kind} "${line.text}"${line.meaning ? ` : "${line.meaning}"` : ''} (refused: ${line.reason})`,
              )
              .join('\n')}`
          : null,
        input.correction
          ? `Your previous draft broke the rules: ${input.correction}. For each item named, keep it on the board and fix only what was flagged: a sentence number that does not exist is replaced by the number of the sentence the item is written during; a word the page does not use is replaced by the lecturer's own word for it; a sentence is split into a point and a level-2 detail; a topic label gains the who, how or example that makes it a claim. Do not drop a flagged item, and do not change any item that was not named: return those word for word, in the same order. Your second draft must carry at least as many written items as the first and keep every level-2 item at level 2; a draft that is shorter than the first is discarded.`
          : null,
        `\nThe SPOKEN WORDS of the page, one numbered sentence a line. Every item names the number of the sentence it is written during:\n${numberedSentences(input.spoken)}`,
        `\nThe page itself, for reference (the chapter's vocabulary):\n${input.pageText.slice(0, 5000)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async lectureDiagram(input: {
    topicTitle: string;
    figure: { kind: 'process' | 'structure' | 'comparison'; shows: string };
    spoken: string;
    pageText: string;
    context: string;
    correction?: string;
  }): Promise<LlmResult<LectureDiagramDraft>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('lecture_diagram');

    const result = await generateObject({
      model,
      schema: lectureDiagramSchema,
      system: PROMPTS.lectureDiagram,
      prompt: [
        `Chapter: ${input.topicTitle}`,
        `Draw a ${input.figure.kind}: ${input.figure.shows}`,
        input.figure.kind === 'process'
          ? 'A process: the steps as nodes in order, an edge from each to the next, labels on edges only where the page names the transition.'
          : input.figure.kind === 'structure'
            ? 'A structure: the parts as nodes, edges for how they connect or contain, at most one group where the page groups parts.'
            : 'A comparison: the two things as two groups of nodes, their attributes as nodes inside each, edges only where the page relates them.',
        input.correction
          ? `Your previous drawing was rejected: ${input.correction}`
          : null,
        `\nThe spoken words of the page, which every anchor must be copied from exactly:\n${input.spoken}`,
        `\nThe page itself, which every label must come from:\n${input.context}`,
      ]
        .filter(Boolean)
        .join('\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async lectureVerify(input: {
    script: string;
    pageText: string;
    context: {
      plan: string;
      prevTail: string;
      neighbours: { pageNumber: number; text: string }[];
    };
  }): Promise<LlmResult<{ grounded: boolean; problems: string[] }>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('lecture_verify');

    const result = await generateObject({
      model,
      schema: lectureVerifySchema,
      system: PROMPTS.lectureVerify,
      prompt: [
        `The lecturer's plan for this chapter, drawn from all of its pages:\n${input.context.plan}`,
        input.context.prevTail
          ? `\nSpoken just before this segment:\n"${input.context.prevTail}"`
          : null,
        ...input.context.neighbours.map(
          (page) =>
            `\nNeighbouring page ${page.pageNumber} of the same chapter, for context:\n${page.text}`,
        ),
        `\nThe page this segment teaches:\n${input.pageText}`,
        `\nScript:\n${input.script}`,
      ]
        .filter(Boolean)
        .join('\n'),
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object,
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

  async embed(input: {
    texts: string[];
    dimensions?: number;
  }): Promise<LlmResult<number[][]>> {
    const started = Date.now();
    const { embedMany } = await this.registry.modules();
    const { model, ref } = await this.registry.embeddingModel();

    const result = await embedMany({
      model,
      values: input.texts,
      maxRetries: this.maxRetries(),
      // A shortened vector where the provider offers one; ignored elsewhere.
      ...(input.dimensions
        ? { providerOptions: { openai: { dimensions: input.dimensions } } }
        : {}),
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
