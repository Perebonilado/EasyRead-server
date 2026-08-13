import { Inject, Injectable } from '@nestjs/common';
import type {
  AssessmentKind,
  LearnerProfileDto,
  MasteryResponse,
} from '../../../contracts';
import {
  autoAdjustProfile,
  computeMastery,
  recommendTutor,
} from '../../domain/learning';
import { ValidationError } from '../../domain/errors/errors';
import {
  ASSESSMENT_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type {
  AssessmentRepository,
  LearnerProfileRepository,
} from '../../repositories/learning.repository';
import { DEFAULT_LEARNER_PROFILE } from '../../repositories/learning.repository';
import type { TopicRepository } from '../../repositories/misc.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

/** Mastery only ever reads the recent past; older evidence has decayed anyway. */
const EVENT_WINDOW = 200;

export interface RecordAssessmentRequest {
  userId: string;
  documentId: string;
  topicId: string | null;
  kind: AssessmentKind;
  score: number;
  payload?: unknown;
}

/**
 * One answered quiz, flipped flashcard or tutor rating.
 *
 * Recording also runs the automatic half of the adaptive loop: a run of
 * misses slows the learner profile down without waiting for the model to
 * notice — the tutor's tool is the deliberate channel, this is the reflex.
 */
@Injectable()
export class RecordAssessmentHandler extends AbstractRequestHandlerTemplate<
  RecordAssessmentRequest,
  { profileAdjusted: boolean }
> {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: RecordAssessmentRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    if (cmd.topicId) {
      // A topic id from another document must not launder events in.
      const ok = await this.topics.belongToUser([cmd.topicId], cmd.userId);
      if (!ok) throw new ValidationError('That topic is not in this document');
    }

    await this.assessments.record({
      userId: cmd.userId,
      documentId: cmd.documentId,
      topicId: cmd.topicId,
      kind: cmd.kind,
      score: cmd.score,
      payload: cmd.payload,
    });

    const recent = await this.assessments.recent(cmd.userId, cmd.documentId, 5);
    const profile =
      (await this.profiles.find(cmd.userId)) ?? DEFAULT_LEARNER_PROFILE;
    const patch = autoAdjustProfile(recent, profile);
    if (patch) await this.profiles.upsert(cmd.userId, patch);

    return CommandResponse.of({ profileAdjusted: Boolean(patch) });
  }
}

export interface GetMasteryRequest {
  userId: string;
  documentId: string;
  /** The tutor the student currently uses, for the recommendation. */
  currentTutorId?: string;
}

@Injectable()
export class GetMasteryHandler extends AbstractRequestHandlerTemplate<
  GetMasteryRequest,
  MasteryResponse
> {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: GetMasteryRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const [topics, events, profile] = await Promise.all([
      this.topics.listWithReadState(cmd.documentId, cmd.userId),
      this.assessments.recent(cmd.userId, cmd.documentId, EVENT_WINDOW),
      this.profiles.find(cmd.userId),
    ]);

    const mastery = computeMastery(
      events,
      topics.map((topic) => topic.id),
    );
    const byId = new Map(mastery.map((entry) => [entry.topicId, entry]));
    const weak = mastery.filter((entry) => entry.needsRevisit).length;

    return CommandResponse.of({
      topics: topics.map((topic) => ({
        topicId: topic.id,
        title: topic.title,
        score: byId.get(topic.id)?.score ?? null,
        events: byId.get(topic.id)?.events ?? 0,
        needsRevisit: byId.get(topic.id)?.needsRevisit ?? false,
      })),
      recommendedTutorId: recommendTutor(
        profile ?? DEFAULT_LEARNER_PROFILE,
        weak,
        cmd.currentTutorId ?? 'maya',
      ),
    });
  }
}

export interface UpdateProfileRequest {
  userId: string;
  pace?: LearnerProfileDto['pace'];
  depth?: LearnerProfileDto['depth'];
  interactivity?: LearnerProfileDto['interactivity'];
  /** Appended, never replacing — the model must not rewrite its own history. */
  note?: string;
}

const MAX_NOTES_CHARS = 600;

@Injectable()
export class UpdateLearnerProfileHandler extends AbstractRequestHandlerTemplate<
  UpdateProfileRequest,
  LearnerProfileDto
> {
  constructor(
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: UpdateProfileRequest) {
    const current = await this.profiles.find(cmd.userId);

    let styleNotes = current?.styleNotes ?? null;
    if (cmd.note?.trim()) {
      // Newest observations first; the tail falls off rather than the head
      // growing without bound.
      const combined = [cmd.note.trim(), styleNotes ?? '']
        .filter(Boolean)
        .join(' · ');
      styleNotes = combined.slice(0, MAX_NOTES_CHARS);
    }

    const updated = await this.profiles.upsert(cmd.userId, {
      ...(cmd.pace ? { pace: cmd.pace } : {}),
      ...(cmd.depth ? { depth: cmd.depth } : {}),
      ...(cmd.interactivity ? { interactivity: cmd.interactivity } : {}),
      ...(styleNotes !== (current?.styleNotes ?? null) ? { styleNotes } : {}),
    });

    return CommandResponse.of(updated);
  }
}
