export interface Chunk {
  pageNumber: number;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export interface ScoredChunk {
  pageNumber: number;
  chunkIndex: number;
  text: string;
  score: number;
}

/**
 * Embeddings are produced gateway-side and only stored/queried here, so
 * switching stores never changes the embeddings themselves (§7).
 */
export interface VectorStorePort {
  upsertChunks(input: { documentId: string; chunks: Chunk[] }): Promise<void>;
  query(input: {
    documentId: string;
    embedding: number[];
    topK: number;
  }): Promise<ScoredChunk[]>;
  deleteByDocument(documentId: string): Promise<void>;
}
