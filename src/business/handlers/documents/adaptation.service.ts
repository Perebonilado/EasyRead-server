import { Inject, Injectable, Logger } from '@nestjs/common';
import { assessStruggle } from '../../domain/struggle';
import { findPromotions, respectPins } from '../../domain/learning';
import { describeChange } from '../../domain/values/profile-changes';
import type {
  DocumentLearningStateRepository,
  LearnerProfileRepository,
  ProfileChangeRepository,
} from '../../repositories/learning.repository';
import { DEFAULT_LEARNER_PROFILE } from '../../repositories/learning.repository';
import type { StruggleSignalRepository } from '../../repositories/struggle.repository';
import {
  DOCUMENT_LEARNING_STATE_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  PROFILE_CHANGE_REPOSITORY,
  STRUGGLE_SIGNAL_REPOSITORY,
} from '../../repositories/tokens';

/** How far back the local assessment looks. */
const WINDOW_DAYS = 7;
const WINDOW_LIMIT = 60;

/**
 * The two-speed adaptive loop.
 *
 * **Fast (local):** after every signal, judge this document's stream and set
 * a per-document delta. Reacts inside one session, and is wrong cheaply —
 * it only ever affects the document in hand.
 *
 * **Slow (global):** when the same delta holds in several documents at once,
 * the pattern is about the reader rather than the subject, so it is promoted
 * into the stored profile and the local deltas are cleared. Reaching the
 * global profile therefore requires agreement across documents *and* the
 * corroboration rule inside `assessStruggle` — deliberately hard.
 */
@Injectable()
export class AdaptationService {
  private readonly logger = new Logger(AdaptationService.name);

  constructor(
    @Inject(STRUGGLE_SIGNAL_REPOSITORY)
    private readonly signals: StruggleSignalRepository,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly states: DocumentLearningStateRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(PROFILE_CHANGE_REPOSITORY)
    private readonly changes: ProfileChangeRepository,
  ) {}

  /** Never throws — adaptation must not fail the request that triggered it. */
  async reassess(userId: string, documentId: string): Promise<void> {
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
      const window = await this.signals.window(
        userId,
        documentId,
        since,
        WINDOW_LIMIT,
      );
      const assessment = assessStruggle(window);

      const paceDelta = assessment.struggling
        ? 'slower'
        : assessment.cruising
          ? 'faster'
          : 'none';
      const depthDelta = assessment.struggling ? 'deeper' : 'none';

      const current = await this.states.find(userId, documentId);
      if (
        current?.paceDelta === paceDelta &&
        current?.depthDelta === depthDelta
      ) {
        return;
      }

      await this.states.upsert(userId, documentId, {
        paceDelta,
        depthDelta,
        reason: assessment.struggling
          ? `${assessment.positiveKinds.join(' + ')} in this document`
          : assessment.cruising
            ? 'answering confidently in this document'
            : null,
      });

      await this.promote(userId);
    } catch (error) {
      this.logger.warn(`reassess skipped: ${(error as Error).message}`);
    }
  }

  /** The slow half: local agreement becomes a global change. */
  private async promote(userId: string): Promise<void> {
    const [profile, active] = await Promise.all([
      this.profiles.find(userId).catch(() => null),
      this.states.active(userId),
    ]);
    const resolved = profile ?? DEFAULT_LEARNER_PROFILE;
    const promotions = findPromotions(resolved, active);

    for (const promotion of promotions) {
      // A pin is a promise: agreement across documents does not override
      // what the reader said about themselves by hand.
      const patch = respectPins(
        {
          [promotion.field]: promotion.value,
          [`${promotion.field}Source`]: 'auto',
        },
        resolved,
      );
      if (!patch) continue;

      if (promotion.alreadyGlobal) {
        // Nothing to change — but the deltas now describe a difference that
        // does not exist, so retire them quietly.
        await this.states.clearDelta(
          userId,
          promotion.documentIds,
          promotion.field,
        );
        continue;
      }

      await this.profiles.upsert(userId, patch);
      await this.changes.record({
        userId,
        field: promotion.field,
        fromValue: resolved[promotion.field],
        toValue: promotion.value,
        source: 'auto',
        reason: promotion.reason,
      });
      await this.states.clearDelta(
        userId,
        promotion.documentIds,
        promotion.field,
      );
      this.logger.log(
        `promoted ${promotion.field}: ${describeChange(
          promotion.field,
          promotion.value,
        )} — ${promotion.reason}`,
      );
    }
  }
}
