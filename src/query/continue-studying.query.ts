import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { StudySnapshot } from '../contracts';
import { computeMastery } from '../business/domain/learning';
import {
  AssessmentEventModel,
  ReadingPositionModel,
} from '../web/database/models';
import { DocumentListQuery } from './document-list.query';
import { ReaderQuery } from './reader.query';

/** Mastery reads the recent past; older evidence has decayed anyway. */
const EVENT_WINDOW = 200;

/**
 * "Pick up where you left off" (§8).
 *
 * Nothing new is recorded to answer this. The reader already saves a position
 * on every page turn, the topics table already knows how much of the syllabus
 * has been taught, and the assessment events already say how well it landed —
 * this is the join across the three, so a student opening the library can
 * resume without hunting for the document.
 *
 * Returns null when there is no history: a library with nothing studied
 * should show no resume card rather than an empty one.
 */
@Injectable()
export class ContinueStudyingQuery {
  constructor(
    @InjectModel(ReadingPositionModel)
    private readonly positions: typeof ReadingPositionModel,
    @InjectModel(AssessmentEventModel)
    private readonly assessments: typeof AssessmentEventModel,
    private readonly documents: DocumentListQuery,
    private readonly reader: ReaderQuery,
  ) {}

  async execute(userId: string): Promise<StudySnapshot | null> {
    // Already filtered to documents that still exist and are readable.
    const [recent] = await this.documents.recentlyRead(userId, 1);
    if (!recent) return null;

    const [position, topics, events] = await Promise.all([
      this.positions.findOne({
        where: { documentId: recent.id, userId } as never,
      }),
      this.reader.topicList(recent.id, userId),
      this.assessments.findAll({
        where: { userId, documentId: recent.id } as never,
        order: [['createdAt', 'DESC']] as never,
        limit: EVENT_WINDOW,
      }),
    ]);

    const lastPage = position?.lastPage ?? 1;

    const mastery = computeMastery(
      events.map((event) => ({
        topicId: event.topicId,
        kind: event.kind,
        payload: null,
        score: event.score,
        createdAt: event.get('createdAt') as Date,
      })),
      topics.map((topic) => topic.id),
    );
    const scored = mastery.filter((entry) => entry.score !== null);

    return {
      document: recent,
      lastStudiedAt: (
        (position?.get('updatedAt') as Date | undefined) ?? new Date()
      ).toISOString(),
      reading: {
        lastPage,
        level: position?.level ?? 'standard',
      },
      lesson: {
        topicsTaught: topics.filter((topic) => topic.isRead).length,
        topicsTotal: topics.length,
        currentTopic:
          topics.find(
            (topic) => lastPage >= topic.startPage && lastPage <= topic.endPage,
          )?.title ?? null,
      },
      understanding: {
        // The average of what has actually been tested. Untested topics are
        // left out rather than counted as zero, which would punish a reader
        // for questions nobody asked them.
        score: scored.length
          ? Math.round(
              scored.reduce((sum, entry) => sum + (entry.score ?? 0), 0) /
                scored.length,
            )
          : null,
        testedTopics: scored.length,
        weakTopics: mastery.filter((entry) => entry.needsRevisit).length,
      },
    };
  }
}
