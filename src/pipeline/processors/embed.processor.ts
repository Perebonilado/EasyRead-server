import { Inject, Injectable } from '@nestjs/common';
import type { PipelineStep } from '../../contracts';
import { LLM_GATEWAY, VECTOR_STORE } from '../../business/ports/tokens';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type {
  Chunk,
  VectorStorePort,
} from '../../business/ports/vector-store.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  DocumentPageRepository,
  PageText,
} from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { PipelineRunRepository } from '../../business/repositories/misc.repository';
import type { BaseJobData } from '../queues';
import { BasePipelineProcessor, type JobContext } from './base.processor';

const MAX_PAGES = 5_000;
const CHUNK_CHARS = 1_200;
const CHUNK_OVERLAP = 150;
/** Batch size for the embeddings call — keeps request bodies sane. */
const EMBED_BATCH = 64;

/**
 * Builds the retrieval index behind the highlight actions (§7).
 *
 * Chunks overlap so a sentence spanning a boundary is still retrievable in
 * full from at least one of them; without the overlap, definitions that
 * straddle a chunk edge simply can't be found.
 */
@Injectable()
export class EmbedProcessor extends BasePipelineProcessor<BaseJobData> {
  protected readonly step: PipelineStep = 'embed';

  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    protected readonly documents: DocumentRepository,
    @Inject(PIPELINE_RUN_REPOSITORY)
    protected readonly runs: PipelineRunRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
  ) {
    super();
  }

  async process(job: BaseJobData, context: JobContext): Promise<void> {
    // Nothing downstream waits on embed alone, so `alreadyDone` needs no
    // hand-off — the committed work is the whole job.
    const run = await this.begin(job);
    if (!run || run.alreadyDone) return;
    const { doc } = run;

    try {
      const pieces = this.chunk(
        await this.pages.findRange(doc.id, 1, MAX_PAGES),
      );
      if (!pieces.length) {
        await this.runs.skip(doc.id, this.step);
        return;
      }

      // Re-embedding replaces the previous version's vectors wholesale, so a
      // re-upload can't leave stale passages in the index.
      await this.vectors.deleteByDocument(doc.id);

      for (let index = 0; index < pieces.length; index += EMBED_BATCH) {
        const batch = pieces.slice(index, index + EMBED_BATCH);
        const result = await this.llm.embed({
          texts: batch.map((piece) => piece.text),
        });

        const chunks: Chunk[] = batch.map((piece, offset) => ({
          ...piece,
          embedding: result.value[offset],
        }));
        await this.vectors.upsertChunks({ documentId: doc.id, chunks });

        await this.calls.record({
          documentId: doc.id,
          task: 'embed',
          model: result.usage.model,
          tokensIn: result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
          latencyMs: result.usage.latencyMs,
          outcome: 'ok',
        });
      }

      await this.succeed(job);
    } catch (error) {
      // Retrieval is a feature, not the document. Losing it degrades the
      // highlight actions; it must never fail the upload.
      if (context.isFinalAttempt) {
        this.logger.warn(
          `${doc.id}: embeddings unavailable — ${(error as Error).message}`,
        );
        await this.runs.skip(doc.id, this.step);
        return;
      }
      throw error;
    }
  }

  private chunk(pages: PageText[]): Omit<Chunk, 'embedding'>[] {
    const chunks: Omit<Chunk, 'embedding'>[] = [];

    for (const page of pages) {
      if (page.isEmpty) continue;
      const text = page.text.trim();
      let index = 0;

      for (
        let start = 0;
        start < text.length;
        start += CHUNK_CHARS - CHUNK_OVERLAP
      ) {
        const slice = text.slice(start, start + CHUNK_CHARS).trim();
        if (slice.length < 40) continue;
        chunks.push({
          pageNumber: page.pageNumber,
          chunkIndex: index++,
          text: slice,
        });
      }
    }

    return chunks;
  }
}
