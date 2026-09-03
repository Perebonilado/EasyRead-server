import { Inject, Injectable, Logger } from '@nestjs/common';
import { LECTURE_STYLE_KEYS } from '../../contracts';
import { LLM_GATEWAY } from '../../business/ports/tokens';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  LECTURE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../business/repositories/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { LectureRepository } from '../../business/repositories/lecture.repository';
import type { TopicRepository } from '../../business/repositories/misc.repository';
import {
  findAnchor,
  type BoardTimeline,
  type DiagramGeometry,
} from '../../business/domain/board';
import {
  diagramProblems,
  geometryProblems,
  layoutDiagram,
  type DiagramPlan,
} from '../../business/domain/diagram';
import { scriptForTts, type LecturePlan } from '../../business/domain/lecture';
import type { LectureDiagramJobData } from '../queues';
import type { JobContext } from './base.processor';
import { LectureBoardService } from './lecture-board.service';

/**
 * Draws the one figure a page's beat asked for.
 *
 * The model says what the drawing contains and which phrase each part
 * belongs to; layout is computed here, checked, and repaired once by
 * asking for fewer parts. The geometry is shared across styles: the first
 * style to get here computes it and the others copy it, since the
 * drawing is about the idea, not the wording. A page whose diagram
 * cannot be drawn keeps its board without one, never with a broken one.
 */
@Injectable()
export class LectureDiagramProcessor {
  private readonly logger = new Logger(LectureDiagramProcessor.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(LECTURE_REPOSITORY) private readonly lectures: LectureRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    private readonly boards: LectureBoardService,
  ) {}

  async process(
    job: LectureDiagramJobData,
    context: JobContext,
  ): Promise<void> {
    const { documentId, topicId, pageNumber, contentVersion } = job;
    const style = job.style ?? 'steady';
    const key = {
      documentId,
      contentVersion,
      pageNumber,
      style,
      kind: 'page' as const,
    };

    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== contentVersion) return;

    const row = await this.lectures.findSegment(
      documentId,
      pageNumber,
      contentVersion,
      style,
      'page',
    );
    if (!row?.scriptText) return;
    const timeline = row.board as BoardTimeline | null;
    if (
      !timeline ||
      row.boardStatus === 'failed' ||
      row.boardStatus === 'skipped'
    ) {
      return;
    }
    const diagramId = `d${pageNumber}`;
    if (timeline.diagrams.some((entry) => entry.id === diagramId)) return;

    // Another style may already have drawn this page.
    for (const other of LECTURE_STYLE_KEYS) {
      if (other === style) continue;
      const sibling = await this.lectures.findSegment(
        documentId,
        pageNumber,
        contentVersion,
        other,
        'page',
      );
      const geometry = (sibling?.board as BoardTimeline | null)?.diagrams.find(
        (entry) => entry.id === diagramId,
      );
      if (geometry) {
        await this.boards.attachDiagram({
          key,
          geometry: retarget(geometry, row.scriptText),
        });
        return;
      }
    }

    const planRecord = await this.lectures.findPlan(
      documentId,
      topicId,
      contentVersion,
    );
    const plan = planRecord?.plan as LecturePlan | null;
    if (!plan) return;
    const figure = this.boards.figureFor(plan, pageNumber);
    if (!figure || figure.kind === 'none' || !figure.shows) return;
    const topic = (await this.topics.listByDocument(documentId)).find(
      (candidate) => candidate.id === topicId,
    );
    const page = await this.pages.findOne(documentId, pageNumber);
    const spoken = scriptForTts(row.scriptText);
    const pageText = page?.text ?? '';

    try {
      let correction: string | undefined;
      let geometry: DiagramGeometry | null = null;
      for (let attempt = 1; attempt <= 2 && !geometry; attempt += 1) {
        const result = await this.llm.lectureDiagram({
          topicTitle: topic?.title ?? 'this chapter',
          figure: { kind: figure.kind, shows: figure.shows },
          spoken,
          pageText,
          context: pageText.slice(0, 4000),
          correction,
        });
        await this.calls.record({
          documentId,
          task: 'lecture_diagram',
          model: result.usage.model,
          tokensIn: result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
          latencyMs: result.usage.latencyMs,
          outcome: 'ok',
        });
        const draft: DiagramPlan = result.value;
        const problems = diagramProblems(draft, spoken, pageText);
        if (problems.length) {
          correction = `${problems
            .map((problem) => `${problem.kind}: ${problem.detail}`)
            .slice(0, 6)
            .join(
              '; ',
            )}. Use fewer parts, and only phrases that are said on the page.`;
          continue;
        }
        let laid = layoutDiagram(draft, figure.kind, spoken, diagramId);
        if (geometryProblems(laid).length) {
          laid = layoutDiagram(draft, figure.kind, spoken, diagramId, 110);
        }
        const remaining = geometryProblems(laid);
        if (remaining.length) {
          correction = `The drawing did not fit: ${remaining
            .map((problem) => problem.detail)
            .join('; ')}. Use fewer or shorter parts.`;
          continue;
        }
        geometry = laid;
      }
      if (!geometry) {
        this.logger.warn(
          `${documentId} p${pageNumber}: no drawable diagram after two tries; the board stays without one`,
        );
        return;
      }
      await this.boards.attachDiagram({ key, geometry });
    } catch (error) {
      if (!context.isFinalAttempt) throw error;
      this.logger.warn(
        `${documentId} p${pageNumber}: diagram gave up — ${(error as Error).message}`,
      );
    }
  }
}

/**
 * A diagram drawn for one style, carried to another: the shapes are the
 * same, the anchors are found again in this style's words. A phrase this
 * style does not say lands at the start of the page.
 */
function retarget(geometry: DiagramGeometry, script: string): DiagramGeometry {
  const spoken = scriptForTts(script);
  const nodes = geometry.nodes.map((node) => ({
    ...node,
    anchor: findAnchor(spoken, node.label) ?? { charStart: 0, charEnd: 0 },
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return {
    ...geometry,
    nodes,
    edges: geometry.edges.map((edge) => ({
      ...edge,
      anchor: byId.get(edge.to)?.anchor ?? { charStart: 0, charEnd: 0 },
    })),
  };
}
