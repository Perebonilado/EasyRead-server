import type { Block } from '../../contracts';

export type LlmTask =
  | 'summarize'
  | 'topics_outline'
  | 'topics_page_tag'
  | 'simplify_standard'
  | 'simplify_easiest'
  | 'highlight_explain'
  | 'highlight_simplify'
  | 'highlight_define'
  | 'chat_document'
  | 'visualize_query'
  | 'diagram'
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
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>>;

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

  embed(input: { texts: string[] }): Promise<LlmResult<number[][]>>;
}
