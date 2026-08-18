import type {
  LearnQuestion,
  Block,
  RecapBody,
  TopicPreviewBody,
} from '../../contracts';

export type LlmTask =
  | 'ocr_page'
  | 'summarize'
  | 'topics_outline'
  | 'topics_page_tag'
  | 'topics_prereqs'
  | 'simplify_standard'
  | 'simplify_easiest'
  | 'highlight_explain'
  | 'highlight_simplify'
  | 'highlight_define'
  | 'chat_document'
  | 'chat_clarify'
  | 'session_recap'
  | 'learn_interview'
  | 'learn_outline'
  | 'learn_write'
  | 'visualize_query'
  | 'diagram'
  | 'sketch'
  | 'topic_quiz'
  | 'preview'
  | 'recall_grade'
  | 'question_check'
  | 'embed';

export interface LlmUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export interface LlmResult<T> {
  value: T;
  usage: LlmUsage;
}

export interface TopicDraft {
  title: string;
  shortDescription: string | null;
  startPage: number;
  endPage: number;
}

/**
 * Every model call goes through here — that's what makes model choice a config
 * change rather than a code change, and gives one place for rate limiting,
 * retries and the cost ledger (§6.2).
 */
export interface LlmGatewayPort {
  /**
   * Reads one scanned page — printed or handwritten — from its image.
   * Returns the transcription as blocks; empty blocks mean the page holds
   * nothing readable.
   */
  ocrPage(input: {
    png: Buffer;
    pageNumber: number;
  }): Promise<LlmResult<{ blocks: Block[]; handwritten: boolean }>>;

  summarize(input: { title: string; text: string }): Promise<LlmResult<string>>;

  outlineTopics(input: {
    digest: string;
    pageCount: number;
  }): Promise<LlmResult<TopicDraft[]>>;

  simplifyPage(input: {
    task: 'simplify_standard' | 'simplify_easiest';
    pageText: string;
    summary: string | null;
    pageNumber: number;
  }): Promise<LlmResult<Block[]>>;

  /** Streams tokens for the answer panel; resolves with the full text. */
  answerHighlight(input: {
    task: 'highlight_explain' | 'highlight_simplify' | 'highlight_define';
    selection: string;
    context: string;
    summary: string | null;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>>;

  /**
   * A turn in the document chat. `history` is the thread so far, oldest
   * first; `question` is what the reader just asked, already expanded from a
   * highlight action where there was one.
   */
  chatWithDocument(input: {
    history: { role: 'user' | 'assistant'; content: string }[];
    question: string;
    context: string;
    summary: string | null;
    /** The learner profile as standing instructions, written register. */
    profile: string;
    /**
     * Set when the reader pressed "Still not clear" on the previous answer:
     * the same question, explained a different way and one rung simpler.
     */
    simpler?: boolean;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>>;

  /**
   * What each chapter assumes the reader already knows.
   *
   * Takes the whole outline in order — that context is the only way the
   * model can tell "chapter 7 leans on chapter 3" apart from "chapter 7
   * leans on knowledge the document never provides".
   */
  outlinePrerequisites(input: {
    summary: string | null;
    chapters: { title: string; description: string | null }[];
  }): Promise<
    LlmResult<
      {
        /** 1-based chapter this prerequisite belongs to. */
        chapter: number;
        concept: string;
        why: string;
        /** 1-based earlier chapter that covers it, or 0 when none does. */
        coveredByChapter: number;
      }[]
    >
  >;

  /** Questions worth asking before writing about this particular topic. */
  interviewForTopic(input: {
    topic: string;
  }): Promise<LlmResult<{ topic: string; questions: LearnQuestion[] }>>;

  /** The chapter plan, sized to a page budget. */
  outlineTopic(input: {
    topic: string;
    brief: string;
    targetPages: number;
    /** Topics an expansion must cover, on top of the model's own plan. */
    mustCover?: string[];
  }): Promise<
    LlmResult<{
      title: string;
      chapters: { title: string; summary: string; pages: number }[];
      furtherTopics?: string[];
    }>
  >;

  /** One chapter, written to length and in the document's own voice. */
  writeChapter(input: {
    topic: string;
    brief: string;
    documentTitle: string;
    chapter: { title: string; summary: string; pages: number };
    /** Chapter titles either side, so the prose joins up. */
    outline: string[];
  }): Promise<LlmResult<{ blocks: Block[] }>>;

  rewriteImageQuery(input: {
    selection: string;
    summary: string | null;
  }): Promise<LlmResult<string>>;

  /** A Mermaid diagram of a concept, grounded in passages from the document. */
  drawDiagram(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; mermaid: string }>>;

  /**
   * A free-form labelled sketch as constrained SVG — pictures of things
   * (anatomy, apparatus, spatial layouts) that boxes-and-arrows can't say.
   * The SVG is model-authored and untrusted: the client sanitizes it.
   */
  drawSketch(input: {
    description: string;
    context: string;
    summary: string | null;
  }): Promise<LlmResult<{ title: string; svg: string }>>;

  /** Self-serve checks for solo study: 2-3 grounded MCQs on one topic. */
  generateTopicQuiz(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
  }): Promise<
    LlmResult<{
      questions: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }[];
    }>
  >;

  /**
   * A chapter preview written to aid comprehension (guided reading) — the
   * skim ritual's material: what it's about, the shape of the argument, the
   * terms it turns on, and where it lands.
   */
  generateTopicPreview(input: {
    topicTitle: string;
    pagesText: string;
    summary: string | null;
  }): Promise<LlmResult<TopicPreviewBody>>;

  /**
   * Grades a book-closed recall against the chapter's own text. The reader
   * predicted first; this is the independent measure their prediction is
   * compared with, so it must never see the prediction.
   */
  gradeRecall(input: {
    topicTitle: string;
    pagesText: string;
    recall: string;
  }): Promise<
    LlmResult<{
      score: number;
      nailed: string[];
      missed: string[];
      focus: string[];
    }>
  >;

  /**
   * Verdict on the reader answering their own pre-reading question, judged
   * against retrieved passages. `page` is 0 when the answer can't be placed.
   */
  checkQuestionAnswer(input: {
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
  >;

  /** A diagram with one "?" node — the visual check the student completes. */
  drawDiagramCloze(input: {
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
  >;

  /**
   * A recap of one sitting, written from what the reader did rather than
   * from the document as a whole.
   */
  writeRecap(input: {
    documentTitle: string;
    fromPage: number;
    toPage: number;
    /** The simplified text of the pages in the window. */
    pages: { pageNumber: number; text: string }[];
    /** Chapters the window overlaps. */
    topics: { title: string; startPage: number; endPage: number }[];
    /** What the reader asked, in order. */
    questions: string[];
    /** Checks answered in the window, with how they went. */
    checks: { kind: string; score: number }[];
    /** Concepts the reader admitted to not knowing this session. */
    prerequisitesAsked: string[];
    profile: string;
  }): Promise<LlmResult<RecapBody>>;

  embed(input: { texts: string[] }): Promise<LlmResult<number[][]>>;
}
