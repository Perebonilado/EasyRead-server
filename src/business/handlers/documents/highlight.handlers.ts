import { Inject, Injectable } from '@nestjs/common';
import type { HighlightAction, LookupDto } from '../../../contracts';
import { ValidationError } from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { IMAGE_SEARCH, LLM_GATEWAY, VECTOR_STORE } from '../../ports/tokens';
import type { ImageSearchPort } from '../../ports/image-search.port';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type { VectorStorePort } from '../../ports/vector-store.port';
import {
  LOOKUP_REPOSITORY,
  SUMMARY_REPOSITORY,
} from '../../repositories/tokens';
import type {
  LookupRepository,
  SummaryRepository,
} from '../../repositories/misc.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

const MIN_SELECTION = 2;
const MAX_SELECTION = 1000;
const TOP_K = 6;

/** The port's task names, keyed by the action the reader sent. */
const TASK_FOR_ACTION = {
  explain: 'highlight_explain',
  simplify: 'highlight_simplify',
  define: 'highlight_define',
} as const;

export interface HighlightRequest {
  userId: string;
  documentId: string;
  action: Exclude<HighlightAction, 'visualize'>;
  selection: string;
  pageNumber: number;
  /** Streams tokens to the client as they arrive. */
  onToken?: (chunk: string) => void;
}

/**
 * Explain / Simplify / Define, grounded in the document (§8).
 *
 * Retrieval first, then a model call constrained to that context — the answer
 * is meant to come from the document rather than the model's general knowledge,
 * which is what makes it trustworthy for exam revision.
 */
@Injectable()
export class HighlightHandler extends AbstractRequestHandlerTemplate<
  HighlightRequest,
  string
> {
  constructor(
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(LOOKUP_REPOSITORY) private readonly lookups: LookupRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: HighlightRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const selection = cmd.selection.trim();
    if (selection.length < MIN_SELECTION || selection.length > MAX_SELECTION) {
      throw new ValidationError('Select between 2 and 1000 characters');
    }

    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.HIGHLIGHT_ACTIONS,
      (e) => e.assertCanUseHighlight(),
    );

    const summary = await this.summaries.find(cmd.documentId);

    // Retrieve passages near the selection, cited by page.
    const [embedding] = (await this.llm.embed({ texts: [selection] })).value;
    const chunks = await this.vectors.query({
      documentId: cmd.documentId,
      embedding,
      topK: TOP_K,
    });
    const context = chunks
      .map((chunk) => `[p.${chunk.pageNumber}] ${chunk.text}`)
      .join('\n\n');

    const result = await this.llm.answerHighlight({
      task: TASK_FOR_ACTION[cmd.action],
      selection,
      context,
      summary,
      onToken: cmd.onToken,
    });

    await this.lookups.record({
      documentId: cmd.documentId,
      userId: cmd.userId,
      action: cmd.action,
      selection,
      pageNumber: cmd.pageNumber,
      answer: result.value,
    });

    return CommandResponse.of(result.value);
  }
}

export interface VisualizeRequest {
  userId: string;
  documentId: string;
  selection: string;
}

/**
 * Turns a selection into an image search. The query is rewritten with the
 * document summary as context so "beta receptors" in a pharmacology deck finds
 * pharmacology diagrams (port of AI Examiner's query rewrite, §8).
 */
@Injectable()
export class VisualizeHandler extends AbstractRequestHandlerTemplate<
  VisualizeRequest,
  { url: string; thumbnail: string; source: string }[]
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(IMAGE_SEARCH) private readonly images: ImageSearchPort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(LOOKUP_REPOSITORY) private readonly lookups: LookupRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: VisualizeRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const selection = cmd.selection.trim();
    if (selection.length < MIN_SELECTION || selection.length > MAX_SELECTION) {
      throw new ValidationError('Select between 2 and 1000 characters');
    }

    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.HIGHLIGHT_ACTIONS,
      (e) => e.assertCanUseHighlight(),
    );

    const summary = await this.summaries.find(cmd.documentId);
    const query = (await this.llm.rewriteImageQuery({ selection, summary }))
      .value;
    const results = await this.images.search(query, 8);

    await this.lookups.record({
      documentId: cmd.documentId,
      userId: cmd.userId,
      action: 'visualize',
      selection,
      pageNumber: null,
      answer: results,
    });

    return CommandResponse.of(results);
  }
}

export interface ListLookupsRequest {
  userId: string;
  documentId: string;
}

@Injectable()
export class ListLookupsHandler extends AbstractRequestHandlerTemplate<
  ListLookupsRequest,
  LookupDto[]
> {
  constructor(
    @Inject(LOOKUP_REPOSITORY) private readonly lookups: LookupRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ListLookupsRequest) {
    await this.access.require(cmd.documentId, cmd.userId);
    const records = await this.lookups.list(cmd.documentId, cmd.userId, 50);

    return CommandResponse.of(
      records.map((record) => ({
        id: record.id,
        action: record.action,
        selection: record.selection,
        pageNumber: record.pageNumber,
        answer: record.answer,
        createdAt: record.createdAt.toISOString(),
      })),
    );
  }
}
