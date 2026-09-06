import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LectureBoardDiagramResponse } from '../../../contracts';
import { LLM_GATEWAY, VECTOR_STORE } from '../../ports/tokens';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type {
  ScoredChunk,
  VectorStorePort,
} from '../../ports/vector-store.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type {
  SimplifiedPageRecord,
  SimplifiedPageRepository,
} from '../../repositories/simplified-page.repository';
import type {
  TopicRecord,
  TopicRepository,
} from '../../repositories/misc.repository';
import { liveMaterial } from '../../domain/diagram';
import {
  describeSketch,
  graphPlan,
  layoutSketch,
  repairDraft,
  repairSketch,
  sketchGeometryProblems,
  sketchOrder,
  sketchProblems,
  templateHint,
  type SketchDraft,
} from '../../domain/sketch';
import type { DiagramGeometry } from '../../domain/board';
import { noteProse } from '../../domain/follow';
import { ValidationError } from '../../domain/errors/errors';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

export interface BoardDiagramRequest {
  userId: string;
  documentId: string;
  pageNumber: number;
  /** What the tutor asked to draw, in its own words. */
  description: string;
  /** The region the board will draw into, in board units, so the layout is made for its shape. */
  region?: { w: number; h: number } | null;
  /** The last few turns of the conversation; the tutor's own words are part of what may be drawn. */
  recent?: { role: 'learner' | 'tutor'; text: string }[] | null;
}

/** How many pages either side of the learner's, within the chapter, count as material. */
const NEIGHBOUR_PAGES = 2;
const PASSAGES_PER_QUERY = 6;

/**
 * A pen-drawn diagram for the tutor's live board, mid-conversation.
 *
 * The same split as the lesson's pencil: the voice model says what to
 * draw, a text model draws it from the book's own words, so it cannot
 * invent a step. The picture has a shape: the writer picks a template, a
 * ring, a line, layers, a grid or a graph, and the layout is deterministic
 * for the region the board will draw into. The material is the book, not the page: the page's note,
 * its neighbours in the chapter, passages found for the description and
 * for what the tutor just said, and the tutor's own recent words. The
 * lecture's anchors are not required here, since there is no audio to
 * time the pen to; grounding of every label in the material is. The
 * geometry comes back laid out for the region the client will draw it
 * in, so it arrives at the size it is shown. Two tries: a draft that
 * names things the material does not, or lays out badly, is asked for
 * once more with the problems named.
 */
@Injectable()
export class BoardDiagramHandler extends AbstractRequestHandlerTemplate<
  BoardDiagramRequest,
  LectureBoardDiagramResponse
> {
  private readonly log = new Logger(BoardDiagramHandler.name);

  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: BoardDiagramRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);
    const recent = cmd.recent ?? [];
    const lastSaid =
      [...recent].reverse().find((line) => line.role === 'tutor')?.text ?? '';

    const [note, page, topics] = await Promise.all([
      this.simplified
        .find(doc.id, 'standard', cmd.pageNumber)
        .catch(() => null),
      this.pages.findOne(doc.id, cmd.pageNumber).catch(() => null),
      this.topics.listByDocument(doc.id).catch((): TopicRecord[] => []),
    ]);
    const pageText = note?.blocks?.length
      ? noteProse(note.blocks)
      : (page?.text ?? '');
    const topic =
      topics.find(
        (candidate) =>
          cmd.pageNumber >= candidate.startPage &&
          cmd.pageNumber <= candidate.endPage,
      ) ?? null;

    // The chapter's neighbouring pages and the passages nearest the ask.
    const from = Math.max(
      topic?.startPage ?? 1,
      cmd.pageNumber - NEIGHBOUR_PAGES,
    );
    const to = Math.min(
      topic?.endPage ?? cmd.pageNumber + NEIGHBOUR_PAGES,
      cmd.pageNumber + NEIGHBOUR_PAGES,
    );
    const queries = [cmd.description, lastSaid].filter(Boolean);
    const [neighbourNotes, embeddings] = await Promise.all([
      this.simplified
        .findRange(doc.id, 'standard', from, to)
        .catch((): SimplifiedPageRecord[] => []),
      this.llm
        .embed({ texts: queries })
        .then((result) => result.value)
        .catch((): number[][] => []),
    ]);
    const found = (
      await Promise.all(
        embeddings.map((embedding) =>
          this.vectors
            .query({ documentId: doc.id, embedding, topK: PASSAGES_PER_QUERY })
            .catch((): ScoredChunk[] => []),
        ),
      )
    ).flat();
    const passages = found
      .filter(
        (chunk, index) =>
          found.findIndex(
            (other) =>
              other.pageNumber === chunk.pageNumber &&
              other.chunkIndex === chunk.chunkIndex,
          ) === index,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const material = liveMaterial({
      pageNumber: cmd.pageNumber,
      pageText,
      neighbours: neighbourNotes
        .filter((record) => record.blocks?.length)
        .map((record) => ({
          pageNumber: record.pageNumber,
          text: noteProse(record.blocks ?? []),
        })),
      passages,
      recent,
    });

    const hint = templateHint(cmd.description);
    const diagramId = `live-${Date.now().toString(36)}`;

    let correction: string | undefined;
    let geometry: DiagramGeometry | null = null;
    let caption = '';
    for (let attempt = 1; attempt <= 2 && !geometry; attempt += 1) {
      const result = await this.llm.lectureSketch({
        topicTitle: topic?.title ?? doc.props.title,
        shows: cmd.description,
        hint,
        material,
        pageText: pageText.slice(0, 4_000),
        correction,
      });
      await this.calls.record({
        documentId: doc.id,
        task: 'lecture_board_diagram',
        model: result.usage.model,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        latencyMs: result.usage.latencyMs,
        outcome: 'ok',
      });
      // A graph is mended where it can be before it is judged; only what
      // cannot be mended costs a second call.
      const draft: SketchDraft =
        result.value.template === 'graph'
          ? { ...result.value, ...repairDraft(graphPlan(result.value)) }
          : repairSketch(result.value);
      const problems = sketchProblems(draft, material, cmd.description);
      this.log.log(
        `${doc.id} p${cmd.pageNumber} sketch "${cmd.description}" try ${attempt}: ${draft.template}${
          problems.length
            ? `, problems: ${problems
                .map((problem) => `${problem.kind} (${problem.detail})`)
                .join('; ')}`
            : ', ok'
        }`,
      );
      if (problems.length) {
        correction = `${problems
          .map((problem) => `${problem.kind}: ${problem.detail}`)
          .slice(0, 6)
          .join(
            '; ',
          )}. Use fewer parts, with labels built from words in the material; a process or a comparison is a graph, a ring needs its points.`;
        continue;
      }
      let laid = layoutSketch(
        draft,
        material,
        diagramId,
        cmd.region,
        60,
        cmd.description,
      );
      if (sketchGeometryProblems(laid).length) {
        laid = layoutSketch(
          draft,
          material,
          diagramId,
          cmd.region,
          110,
          cmd.description,
        );
      }
      const remaining = sketchGeometryProblems(laid);
      if (remaining.length) {
        correction = `The drawing did not fit: ${remaining
          .map((problem) => problem.detail)
          .join('; ')}. Use fewer or shorter parts.`;
        continue;
      }
      geometry = laid;
      caption = describeSketch(draft);
    }
    if (!geometry) {
      this.log.warn(
        `${doc.id} p${cmd.pageNumber}: no drawable sketch for "${cmd.description}" after two tries`,
      );
      throw new ValidationError(
        'That could not be drawn from what the book says',
      );
    }
    return CommandResponse.of<LectureBoardDiagramResponse>({
      geometry,
      elementOrder: sketchOrder(geometry),
      caption,
    });
  }
}
