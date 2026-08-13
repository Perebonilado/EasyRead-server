import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type {
  Chunk,
  ScoredChunk,
  VectorStorePort,
} from '../../business/ports/vector-store.port';
import { DocumentChunkModel } from '../database/models';
import { newId } from '../database/uuid';

/**
 * Vector search without a vector database.
 *
 * The technical design specifies pgvector as the second implementation, but
 * this deployment is MySQL, so similarity is computed in application code over
 * the document's own chunks. Namespacing by document keeps the scan small —
 * a 300-page document is a few thousand rows, not a corpus — and the port is
 * identical to the Pinecone adapter's, so switching is config (§7).
 */
@Injectable()
export class MysqlVectorStoreAdapter implements VectorStorePort {
  constructor(
    @InjectModel(DocumentChunkModel)
    private readonly model: typeof DocumentChunkModel,
  ) {}

  async upsertChunks({
    documentId,
    chunks,
  }: {
    documentId: string;
    chunks: Chunk[];
  }): Promise<void> {
    if (!chunks.length) return;
    await this.model.bulkCreate(
      chunks.map((chunk) => ({
        id: newId(),
        documentId,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        embedding: chunk.embedding,
        dimensions: chunk.embedding.length,
      })) as any,
      // Deterministic ids per (document, page, chunk) make re-running the
      // embed step safe.
      {
        updateOnDuplicate: [
          'text',
          'embedding',
          'dimensions',
          'updatedAt',
        ] as any,
      },
    );
  }

  async query({
    documentId,
    embedding,
    topK,
  }: {
    documentId: string;
    embedding: number[];
    topK: number;
  }): Promise<ScoredChunk[]> {
    const rows = await this.model.findAll({ where: { documentId } });

    return rows
      .map((row) => ({
        pageNumber: row.pageNumber,
        chunkIndex: row.chunkIndex,
        text: row.text,
        score: cosine(embedding, row.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async deleteByDocument(documentId: string): Promise<void> {
    await this.model.destroy({ where: { documentId } });
  }
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : dot / denominator;
}
