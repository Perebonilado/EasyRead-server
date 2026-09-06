import { Inject, Injectable } from '@nestjs/common';
import type { LectureBookFindResponse } from '../../../contracts';
import { LLM_GATEWAY, VECTOR_STORE } from '../../ports/tokens';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type { VectorStorePort } from '../../ports/vector-store.port';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

export interface BookFindRequest {
  userId: string;
  documentId: string;
  /** What the tutor wants to find in the book, in its own words. */
  query: string;
}

const PASSAGES = 6;
const PASSAGE_CHARS = 700;

/**
 * The tutor's lookup mid-conversation: the whole book searched for a
 * question that reaches beyond the page, answered with passages and the
 * page each is on, so the tutor can say where a thing is instead of
 * saying the book does not cover it.
 */
@Injectable()
export class BookFindHandler extends AbstractRequestHandlerTemplate<
  BookFindRequest,
  LectureBookFindResponse
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: BookFindRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const [embedding] = (await this.llm.embed({ texts: [cmd.query] })).value;
    const chunks = await this.vectors.query({
      documentId: doc.id,
      embedding,
      topK: PASSAGES,
    });
    return CommandResponse.of<LectureBookFindResponse>({
      passages: chunks
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((chunk) => ({
          pageNumber: chunk.pageNumber,
          text: chunk.text.replace(/\s+/g, ' ').trim().slice(0, PASSAGE_CHARS),
        })),
    });
  }
}
