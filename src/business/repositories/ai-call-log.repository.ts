export interface AiCallLogInput {
  documentId: string | null;
  task: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  outcome: 'ok' | 'failed';
}

/**
 * The cost ledger (§6.2). Every model call lands here so spend per document
 * and per task is answerable from SQL rather than the provider's dashboard.
 */
export interface AiCallLogRepository {
  record(input: AiCallLogInput): Promise<void>;
}
