import { Inject, Injectable } from '@nestjs/common';
import type {
  AssessmentKind,
  LearnerProfileDto,
  MasteryResponse,
} from '../../../contracts';
import { computeMastery, recommendTutor } from '../../domain/learning';
import { ValidationError } from '../../domain/errors/errors';
import {
  DOCUMENT_LEARNING_STATE_REPOSITORY,
  PROFILE_CHANGE_REPOSITORY,
  ASSESSMENT_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type {
  DocumentLearningStateRepository,
  ProfileChangeRepository,
  LearnerProfileRecord,
  AssessmentRepository,
  LearnerProfileRepository,
} from '../../repositories/learning.repository';
import { DEFAULT_LEARNER_PROFILE } from '../../repositories/learning.repository';
import type { TopicRepository } from '../../repositories/misc.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { StruggleRecorder } from './struggle-recorder.service';

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
    @Inject(PROFILE_CHANGE_REPOSITORY)
    private readonly changes: ProfileChangeRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    private readonly access: DocumentAccessService,
    private readonly struggles: StruggleRecorder,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
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

    // Mirror into the struggle stream. Clear results only: a middling
    // flashcard self-grade is neither evidence of effort nor of recovery.
    if (cmd.score < 0.5 || cmd.score >= 0.85) {
      await this.struggles.record({
        userId: cmd.userId,
        documentId: cmd.documentId,
        topicId: cmd.topicId,
        kind: cmd.score < 0.5 ? 'quiz_wrong' : 'quiz_right',
      });
    }

    // Adaptation itself lives in the struggle stream now (see
    // AdaptationService): quiz scores alone were both too narrow — they miss
    // the reader who never opens a quiz — and too eager, moving the *global*
    // profile on one document's evidence. The signal write above feeds the
    // two-speed loop, which adjusts this document first and only generalises
    // once several documents agree.
    const local = await this.docStates
      .find(cmd.userId, cmd.documentId)
      .catch(() => null);
    const adjusted = Boolean(
      local && (local.paceDelta !== 'none' || local.depthDelta !== 'none'),
    );

    return CommandResponse.of({ profileAdjusted: adjusted });
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

export type ProfileUpdateSource = 'manual' | 'tutor';

export interface UpdateProfileRequest {
  userId: string;
  /**
   * Who is asking. `manual` (the settings screen) pins each changed dial
   * against the reflex; `tutor` (the lesson tool) records an observation
   * that stays overridable.
   */
  source: ProfileUpdateSource;
  /** Release a pinned dial back to automatic adjustment. */
  release?: ('pace' | 'depth' | 'interactivity')[];
  /** Erase the accumulated style notes — the reader owns their own record. */
  clearNotes?: boolean;
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
    @Inject(PROFILE_CHANGE_REPOSITORY)
    private readonly changes: ProfileChangeRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: UpdateProfileRequest) {
    const current = (await this.profiles.find(cmd.userId)) ?? null;
    const before = current ?? DEFAULT_LEARNER_PROFILE;

    let styleNotes = cmd.clearNotes ? null : (current?.styleNotes ?? null);
    if (cmd.note?.trim()) {
      // Newest observations first; the tail falls off rather than the head
      // growing without bound.
      const combined = [cmd.note.trim(), styleNotes ?? '']
        .filter(Boolean)
        .join(' · ');
      styleNotes = combined.slice(0, MAX_NOTES_CHARS);
    }

    // A hand-set dial is pinned; a tutor observation stays overridable.
    const dialSource = cmd.source === 'manual' ? 'manual' : 'auto';
    const patch: Partial<LearnerProfileRecord> = {
      ...(cmd.pace ? { pace: cmd.pace, paceSource: dialSource } : {}),
      ...(cmd.depth ? { depth: cmd.depth, depthSource: dialSource } : {}),
      ...(cmd.interactivity
        ? { interactivity: cmd.interactivity, interactivitySource: dialSource }
        : {}),
      ...(styleNotes !== (current?.styleNotes ?? null) ? { styleNotes } : {}),
    };
    // Releasing a pin: the value stays, the promise is withdrawn.
    for (const field of cmd.release ?? []) {
      patch[`${field}Source`] = 'auto';
    }

    const updated = await this.profiles.upsert(cmd.userId, patch);

    // History, best-effort: a failed log line must never fail the update.
    const dialChanges = (['pace', 'depth', 'interactivity'] as const)
      .filter((field) => cmd[field] && cmd[field] !== before[field])
      .map((field) =>
        this.changes.record({
          userId: cmd.userId,
          field,
          fromValue: before[field],
          toValue: cmd[field] as string,
          source: cmd.source,
          reason:
            cmd.source === 'tutor'
              ? 'your tutor noticed this while teaching'
              : null,
        }),
      );
    if (cmd.note?.trim()) {
      dialChanges.push(
        this.changes.record({
          userId: cmd.userId,
          field: 'style_notes',
          fromValue: null,
          toValue: cmd.note.trim().slice(0, 300),
          source: cmd.source,
          reason:
            cmd.source === 'tutor'
              ? 'your tutor noticed this while teaching'
              : null,
        }),
      );
    }
    await Promise.all(dialChanges.map((p) => p.catch(() => undefined)));

    return CommandResponse.of(updated);
  }
}
