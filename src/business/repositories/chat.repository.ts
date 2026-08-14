import type { ChatOrigin, ChatRole } from '../../contracts';

export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  text: string;
  highlightAction: ChatOrigin | null;
  quotedText: string | null;
  pageNumber: number | null;
  sources: { pageNumber: number; text: string }[] | null;
  createdAt: Date;
}

export interface AppendChatMessageInput {
  documentId: string;
  userId: string;
  role: ChatRole;
  text: string;
  highlightAction?: ChatOrigin | null;
  quotedText?: string | null;
  pageNumber?: number | null;
  sources?: { pageNumber: number; text: string }[] | null;
}

/**
 * A document's chat thread. There is no conversation row: a thread is every
 * message sharing a (document, user) pair, which is exactly the scope the
 * reader panel shows.
 */
export interface ChatRepository {
  append(input: AppendChatMessageInput): Promise<ChatMessageRecord>;

  /**
   * A page of the thread, newest-first internally but returned oldest-first
   * for rendering. `before` is a keyset cursor — the createdAt of the oldest
   * message already on screen — so scrolling back never repeats or skips.
   */
  page(
    documentId: string,
    userId: string,
    limit: number,
    before?: Date,
  ): Promise<{ messages: ChatMessageRecord[]; hasMore: boolean }>;

  /** The most recent turns, oldest-first, for replay into the next prompt. */
  recent(
    documentId: string,
    userId: string,
    limit: number,
  ): Promise<ChatMessageRecord[]>;
}
