import { Inject, Injectable } from '@nestjs/common';
import type {
  CheckDto,
  DocumentReportResponse,
  MissedIdeaDto,
  OwnQuestionDto,
  TopicBand,
  TopicReportDto,
  TutorNoteDto,
} from '../../../contracts';
import {
  computeCalibration,
  openMissedIdeas,
  splitIntoPasses,
  topicReport,
  WEAK_THRESHOLD,
} from '../../domain/learning';
import type { AssessmentEventRecord } from '../../repositories/learning.repository';
import type { AssessmentRepository } from '../../repositories/learning.repository';
import {
  ASSESSMENT_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { TopicRepository } from '../../repositories/misc.repository';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

/**
 * The understanding report: how the reading actually went, chapter by
 * chapter (understanding-report plan, Phase 2).
 *
 * Composed at read time from events that already exist, and deliberately
 * mechanical — no model call, no stored rollup. Every number here can be
 * traced back to named events, which is what makes the screen worth
 * trusting; a generated summary would read better and mean less.
 */

/** History deep enough for passes, shallow enough to stay one cheap query. */
const EVENT_LIMIT = 1000;

/** Below this many events a topic is not called a strength, however high. */
const STRENGTH_MIN_EVENTS = 4;

/** A strength has to be comfortably clear of the revisit threshold. */
const STRONG_SCORE = 75;

export interface DocumentReportRequest {
  userId: string;
  documentId: string;
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** The reader's own questions, in the order they were answered. */
function ownQuestions(events: AssessmentEventRecord[]): OwnQuestionDto[] {
  return events
    .filter((event) => event.payload?.ownQuestion === true)
    .map((event) => {
      const verdict = event.payload?.verdict;
      const page = event.payload?.page;
      const settled: OwnQuestionDto['verdict'] =
        verdict === 'correct' || verdict === 'incorrect' ? verdict : 'partial';
      return {
        question: asString(event.payload?.question) ?? '',
        verdict: settled,
        explanation: asString(event.payload?.explanation),
        page: typeof page === 'number' && page > 0 ? page : null,
        answeredAt: event.createdAt.toISOString(),
      };
    })
    .filter((question) => question.question.length > 0);
}

/** What the tutor said about a chapter, newest last. */
function tutorNotes(events: AssessmentEventRecord[]): TutorNoteDto[] {
  return events
    .filter(
      (event) => event.payload?.tutor === true && asString(event.payload?.note),
    )
    .map((event) => ({
      note: asString(event.payload?.note) as string,
      rating:
        typeof event.payload?.rating === 'number' ? event.payload.rating : null,
      at: event.createdAt.toISOString(),
    }));
}

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/**
 * Every check on one chapter, newest first, each tagged with the pass it
 * belongs to. Pass numbers come from the same split the scores use, so the
 * drill-in and the headline can never disagree about what a reread was.
 */
function checksOf(events: AssessmentEventRecord[]): CheckDto[] {
  const passes = splitIntoPasses(events);
  const passOf = new Map<AssessmentEventRecord, number>();
  passes.forEach((pass, index) => {
    for (const event of pass.events) passOf.set(event, index + 1);
  });

  return [...events]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((event) => {
      const payload = event.payload ?? {};
      const verdict = payload.verdict;
      const isRecall = payload.recall === true;
      return {
        at: event.createdAt.toISOString(),
        kind: event.kind,
        score: event.score,
        pass: passOf.get(event) ?? 1,
        prompt: asString(payload.question) ?? asString(payload.front) ?? null,
        confidence:
          typeof payload.confidence === 'number' ? payload.confidence : null,
        source:
          payload.tutor === true
            ? ('tutor' as const)
            : payload.guided === true
              ? ('guided' as const)
              : ('solo' as const),
        verdict:
          payload.ownQuestion === true &&
          (verdict === 'correct' ||
            verdict === 'partial' ||
            verdict === 'incorrect')
            ? verdict
            : null,
        diagram: payload.diagram === true,
        explanation: asString(payload.explanation),
        correctAnswer: asString(payload.correctAnswer),
        yourAnswer: asString(payload.yourAnswer),
        recall: isRecall
          ? {
              nailed: stringsOf(payload.nailed),
              missed: stringsOf(payload.missed),
              focus: stringsOf(payload.focus),
              resolved: stringsOf(payload.resolved),
            }
          : null,
      };
    });
}

/** A score between weak and strong: real progress, still settling in. */
const SETTLING_FLOOR = WEAK_THRESHOLD;
const SOLID_FLOOR = 75;

function bandOf(
  score: number | null,
  events: number,
  isRead: boolean,
): TopicBand | null {
  if (events === 0) return isRead ? 'unverified' : null;
  if (score === null) return null;
  if (score < SETTLING_FLOOR) return 'revisit';
  if (score < SOLID_FLOOR) return 'settling';
  return 'solid';
}

/**
 * What a reread should watch for: the still-open missed ideas lead, and the
 * latest recall's own "look for" pointers fill the rest. Capped at three —
 * an unranked list of five pointers is zero pointers.
 */
function nextStepPointers(
  missed: MissedIdeaDto[],
  checks: CheckDto[],
): string[] {
  const pointers: string[] = [];
  for (const idea of missed) {
    if (!idea.resolvedAt) pointers.push(idea.text);
  }
  const latestRecall = checks.find((check) => check.recall !== null);
  for (const focus of latestRecall?.recall?.focus ?? []) {
    pointers.push(focus);
  }
  const seen = new Set<string>();
  return pointers
    .filter((text) => {
      const key = text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

const toMissedDto = (idea: {
  text: string;
  timesMissed: number;
  firstMissedAt: Date;
  resolvedAt: Date | null;
}): MissedIdeaDto => ({
  text: idea.text,
  timesMissed: idea.timesMissed,
  firstMissedAt: idea.firstMissedAt.toISOString(),
  resolvedAt: idea.resolvedAt ? idea.resolvedAt.toISOString() : null,
});

@Injectable()
export class GetDocumentReportHandler extends AbstractRequestHandlerTemplate<
  DocumentReportRequest,
  DocumentReportResponse
> {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: DocumentReportRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const [topics, events] = await Promise.all([
      this.topics.listWithReadState(cmd.documentId, cmd.userId),
      this.assessments.recent(cmd.userId, cmd.documentId, EVENT_LIMIT),
    ]);
    const now = this.clock.now();

    const reports: TopicReportDto[] = topics.map((topic) => {
      const own = events.filter((event) => event.topicId === topic.id);
      const stats = topicReport(topic.id, own, now);
      const missedIdeas = openMissedIdeas(own).map(toMissedDto);
      const checks = checksOf(own);
      return {
        topicId: topic.id,
        title: topic.title,
        startPage: topic.startPage,
        endPage: topic.endPage,
        score: stats.score,
        passScores: stats.passScores,
        delta: stats.delta,
        passes: stats.passes,
        events: stats.events,
        lastEvidenceAt: stats.lastEvidenceAt
          ? stats.lastEvidenceAt.toISOString()
          : null,
        stale: stats.stale,
        needsRevisit: stats.needsRevisit,
        missedIdeas,
        ownQuestions: ownQuestions(own),
        tutorNotes: tutorNotes(own),
        checks,
        band: bandOf(stats.score, stats.events, topic.isRead),
        nextStepPointers: nextStepPointers(missedIdeas, checks),
      };
    });

    // Weakest first; among equals, the one left longest. Topics with no
    // score are not guesses about the reader, so they never queue here.
    const revisitQueue = reports
      .filter((topic) => topic.needsRevisit)
      .sort(
        (a, b) =>
          (a.score ?? 0) - (b.score ?? 0) ||
          (a.lastEvidenceAt ?? '').localeCompare(b.lastEvidenceAt ?? ''),
      )
      .map((topic) => topic.topicId);

    const strengths = reports
      .filter(
        (topic) =>
          topic.score !== null &&
          topic.score >= STRONG_SCORE &&
          topic.events >= STRENGTH_MIN_EVENTS,
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map((topic) => topic.topicId);

    // Read, but never checked: the report says so rather than assuming
    // either way, and the UI offers one check.
    const unverified = topics
      .filter((topic) => {
        const report = reports.find((r) => r.topicId === topic.id);
        return topic.isRead && report !== undefined && report.events === 0;
      })
      .map((topic) => topic.id);

    return CommandResponse.of({
      topics: reports,
      revisitQueue,
      strengths,
      unverified,
      calibration: computeCalibration(events),
      totals: {
        checks: events.length,
        chaptersWithEvidence: reports.filter((topic) => topic.events > 0)
          .length,
        reread: reports.filter((topic) => topic.passes > 1).length,
      },
    });
  }
}

export { WEAK_THRESHOLD };
