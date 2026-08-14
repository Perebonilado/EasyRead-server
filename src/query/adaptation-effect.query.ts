import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { computeMastery } from '../business/domain/learning';
import type { AssessmentEventRecord } from '../business/repositories/learning.repository';
import { AssessmentEventModel } from '../web/database/models';
import { ProfileChangeModel } from '../web/database/models/profile-change.model';
import { StruggleSignalModel } from '../web/database/models/struggle-signal.model';

/**
 * Does any of this actually help?
 *
 * For each automatic profile change, compare the chapters a reader was
 * working on in the fortnight *before* it with those in the fortnight
 * *after*: did understanding improve, and did the visible signs of struggle
 * go down? Nothing here is stored — it reads history that already exists, so
 * asking the question costs nothing and changes nothing.
 *
 * The point is to be able to delete theatre. If slowing readers down never
 * moves either number, the reflex is decoration and should go — and this
 * refuses to answer at all below a usable sample, rather than printing noise
 * that would be quoted as evidence.
 */

/** Below this many observations, report the count and no conclusion. */
export const MIN_SAMPLE = 10;

const WINDOW_DAYS = 14;
const WINDOW_MS = WINDOW_DAYS * 86_400_000;

/** Signals that mean "I don't understand", as opposed to engagement. */
const STRUGGLE_KINDS = [
  'still_not_clear',
  'prereq_requested',
  'quiz_wrong',
  'long_dwell',
] as const;

export interface AdaptationEffect {
  /** e.g. "pace→slower" */
  change: string;
  observations: number;
  masteryBefore: number | null;
  masteryAfter: number | null;
  masteryDelta: number | null;
  strugglePerDayBefore: number | null;
  strugglePerDayAfter: number | null;
  /** Null until the sample is big enough to mean anything. */
  verdict: 'helped' | 'no effect' | 'hurt' | null;
}

export interface AdaptationEffectReport {
  windowDays: number;
  minSample: number;
  effects: AdaptationEffect[];
  note: string;
}

interface Observation {
  masteryBefore: number | null;
  masteryAfter: number | null;
  struggleBefore: number;
  struggleAfter: number;
}

@Injectable()
export class AdaptationEffectQuery {
  constructor(
    @InjectModel(ProfileChangeModel)
    private readonly changes: typeof ProfileChangeModel,
    @InjectModel(AssessmentEventModel)
    private readonly events: typeof AssessmentEventModel,
    @InjectModel(StruggleSignalModel)
    private readonly signals: typeof StruggleSignalModel,
  ) {}

  async execute(): Promise<AdaptationEffectReport> {
    const changes = await this.changes.findAll({
      where: { source: 'auto', field: { [Op.ne]: 'style_notes' } } as never,
      order: [['createdAt', 'ASC']] as never,
      limit: 5_000,
    });

    const buckets = new Map<string, Observation[]>();

    for (const change of changes) {
      const at = change.get('createdAt') as Date;
      const observation = await this.observe(change.userId, at);
      if (!observation) continue;
      const key = `${change.field}→${change.toValue}`;
      buckets.set(key, [...(buckets.get(key) ?? []), observation]);
    }

    const effects = [...buckets.entries()]
      .map(([change, observations]) => this.summarise(change, observations))
      .sort((a, b) => b.observations - a.observations);

    return {
      windowDays: WINDOW_DAYS,
      minSample: MIN_SAMPLE,
      effects,
      note:
        'Observational, not causal: readers who trigger an adjustment are ' +
        'already having a hard time, so some improvement is regression to ' +
        'the mean. Use it to spot adaptations that do nothing, not to prove ' +
        'the ones that do.',
    };
  }

  /** One change, measured either side of the moment it happened. */
  private async observe(userId: string, at: Date): Promise<Observation | null> {
    const from = new Date(at.getTime() - WINDOW_MS);
    const to = new Date(at.getTime() + WINDOW_MS);

    const rows = await this.events.findAll({
      where: { userId, createdAt: { [Op.between]: [from, to] } } as never,
      order: [['createdAt', 'ASC']] as never,
    });
    // Both sides must have evidence, or the comparison is with nothing.
    const before = rows.filter((row) => (row.get('createdAt') as Date) < at);
    const after = rows.filter((row) => (row.get('createdAt') as Date) >= at);
    if (!before.length || !after.length) return null;

    const [struggleBefore, struggleAfter] = await Promise.all([
      this.countStruggle(userId, from, at),
      this.countStruggle(userId, at, to),
    ]);

    return {
      masteryBefore: meanMastery(before.map(toEventRecord)),
      masteryAfter: meanMastery(after.map(toEventRecord)),
      struggleBefore: struggleBefore / WINDOW_DAYS,
      struggleAfter: struggleAfter / WINDOW_DAYS,
    };
  }

  private async countStruggle(userId: string, from: Date, to: Date) {
    return this.signals.count({
      where: {
        userId,
        kind: { [Op.in]: STRUGGLE_KINDS },
        createdAt: { [Op.between]: [from, to] },
      } as never,
    });
  }

  private summarise(
    change: string,
    observations: Observation[],
  ): AdaptationEffect {
    const withMastery = observations.filter(
      (o) => o.masteryBefore !== null && o.masteryAfter !== null,
    );
    const masteryBefore = median(
      withMastery.map((o) => o.masteryBefore as number),
    );
    const masteryAfter = median(
      withMastery.map((o) => o.masteryAfter as number),
    );
    const strugglePerDayBefore = median(
      observations.map((o) => o.struggleBefore),
    );
    const strugglePerDayAfter = median(
      observations.map((o) => o.struggleAfter),
    );

    const masteryDelta =
      masteryBefore !== null && masteryAfter !== null
        ? round(masteryAfter - masteryBefore)
        : null;

    // Refuse to conclude on a handful of readers — an early sample would be
    // quoted forever as if it were a finding.
    let verdict: AdaptationEffect['verdict'] = null;
    if (observations.length >= MIN_SAMPLE && masteryDelta !== null) {
      const struggleFell =
        strugglePerDayAfter !== null &&
        strugglePerDayBefore !== null &&
        strugglePerDayAfter < strugglePerDayBefore;
      verdict =
        masteryDelta > 3 || (masteryDelta > 0 && struggleFell)
          ? 'helped'
          : masteryDelta < -3
            ? 'hurt'
            : 'no effect';
    }

    return {
      change,
      observations: observations.length,
      masteryBefore: round(masteryBefore),
      masteryAfter: round(masteryAfter),
      masteryDelta,
      strugglePerDayBefore: round(strugglePerDayBefore),
      strugglePerDayAfter: round(strugglePerDayAfter),
      verdict,
    };
  }
}

function toEventRecord(row: AssessmentEventModel): AssessmentEventRecord {
  return {
    topicId: row.topicId,
    kind: row.kind,
    score: row.score,
    createdAt: row.get('createdAt') as Date,
  };
}

/** Mean mastery across the topics with enough evidence to score. */
function meanMastery(events: AssessmentEventRecord[]): number | null {
  // Only the topics this window actually touched — an untested chapter has
  // no opinion to contribute either way.
  const topicIds = [
    ...new Set(
      events
        .map((event) => event.topicId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const scored = computeMastery(events, topicIds)
    .map((topic) => topic.score)
    .filter((score): score is number => score !== null);
  if (!scored.length) return null;
  return scored.reduce((sum, score) => sum + score, 0) / scored.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}
