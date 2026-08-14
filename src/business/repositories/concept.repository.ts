/**
 * The reader's ledger of external concepts — things their documents assumed
 * and they said they didn't know. `unclear` on first flag, `taught` once the
 * chat or the tutor has actually explained it; taught concepts stop
 * appearing anywhere. Only external prerequisites land here: internal ones
 * are answered by topic read state.
 */
export interface ConceptKnowledgeRepository {
  markUnclear(userId: string, concept: string): Promise<void>;
  markTaught(
    userId: string,
    concept: string,
    resolvedDocumentId: string | null,
  ): Promise<void>;
  /** Normalised concepts this user has been taught. */
  listTaught(userId: string): Promise<string[]>;
}
