export interface AiCallLogInput {
  documentId: string | null;
  task: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  outcome: 'ok' | 'failed';
  /** Known by the caller, for providers billed by the second; otherwise priced from tokens. */
  costUsd?: number | null;
  /** Of `tokensIn`, those the provider served from its cache: priced, not stored. */
  tokensCached?: number | null;
}

/**
 * The cost ledger (§6.2). Every model call lands here so spend per document
 * and per task is answerable from SQL rather than the provider's dashboard.
 */
export interface AiCallLogRepository {
  record(input: AiCallLogInput): Promise<void>;
  /**
   * Dollars spent on one task's calls to models whose name starts so
   * ("elevenlabs:"): for one document, since a moment, or both. For a
   * spending cap; a ledger that cannot say leaves it out.
   */
  spentUsd?(filter: {
    task: string;
    modelPrefix: string;
    documentId?: string;
    since?: Date;
  }): Promise<number>;
}
