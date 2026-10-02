/**
 * The critic calibrated (explainer-animation-plan §9.3, decision 6): the
 * same critic scores contact sheets of human-made editorial explainers
 * (the references) and of our own films, and the numbers say whether an
 * 8 means "as good as those": the references should land about 8 to 9,
 * our old films well under, for the right reasons. Here are the sums:
 * each group's scores by axis (mean, median, spread), how far apart the
 * groups are, and the chance a reference sheet outscores one of ours (the
 * area under the curve, ties counting half). Pure; the CLI is
 * scripts/critic-calibrate.ts.
 */
import { CRITIC_AXES, LOOP, type CriticAxis } from '../studio/explainer-rules';

/** One sheet as the critic scored it. */
export interface CalibrationSheet {
  /** Its group: "refs", "before", "after"… */
  group: string;
  /** Where it is from: a channel, an episode and its scene. */
  source: string;
  sheet: string;
  scores: Partial<Record<CriticAxis, number>>;
  why?: Partial<Record<CriticAxis, string>>;
  verdict?: string;
  costUsd?: number;
}

export interface Spread {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A list of numbers' mean, median, least and most; null for none. */
export function spreadOf(values: readonly number[]): Spread | null {
  const all = values.filter((v) => Number.isFinite(v));
  if (!all.length) return null;
  const sorted = [...all].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return {
    n: all.length,
    mean: round2(all.reduce((a, b) => a + b, 0) / all.length),
    median: round2(
      sorted.length % 2
        ? sorted[Math.floor(mid)]
        : (sorted[mid - 1] + sorted[mid]) / 2,
    ),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/** A sheet's own score: the mean of its axes (the hook left out, as only openings have one). */
export function sheetScore(
  sheet: Pick<CalibrationSheet, 'scores'>,
): number | null {
  const values = CRITIC_AXES.filter((axis) => axis !== 'hook').flatMap(
    (axis) => (sheet.scores[axis] !== undefined ? [sheet.scores[axis]] : []),
  );
  return values.length
    ? round2(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
}

/**
 * The chance a sheet of group A scores above one of group B (each pair
 * once, a tie half): 1 when every A is above every B, 0.5 when the critic
 * cannot tell them apart. Null when either has none.
 */
export function aucOf(
  a: readonly number[],
  b: readonly number[],
): number | null {
  if (!a.length || !b.length) return null;
  let wins = 0;
  for (const x of a) for (const y of b) wins += x > y ? 1 : x === y ? 0.5 : 0;
  return round2(wins / (a.length * b.length));
}

export interface GroupCalibration {
  group: string;
  sheets: number;
  /** Each axis's spread over the group's sheets. */
  axes: Partial<Record<CriticAxis, Spread>>;
  /** The spread of its sheets' own scores. */
  overall: Spread | null;
  /** The share of its sheets whose own score is the pass or over. */
  passing: number;
  /** Each source's mean own score. */
  sources: Record<string, number>;
  costUsd: number;
}

export interface Calibration {
  groups: GroupCalibration[];
  /** Against the first group (the references): how far each other group's mean is under it, by axis and overall, and the AUC. */
  against: {
    group: string;
    gap: Partial<Record<CriticAxis, number>>;
    overallGap: number | null;
    auc: number | null;
  }[];
  /** Whether the references land where an 8 means "as good as those": their median own score in [8, 9.5]. */
  refsInBand: boolean;
}

/** The calibration of a run: each group, and every other group against the first. */
export function calibrationOf(
  sheets: readonly CalibrationSheet[],
  order?: readonly string[],
): Calibration {
  const names = [
    ...new Set([...(order ?? []), ...sheets.map((s) => s.group)]),
  ].filter((name) => sheets.some((s) => s.group === name));
  const groups = names.map((group): GroupCalibration => {
    const mine = sheets.filter((s) => s.group === group);
    const own = mine.flatMap((s) => {
      const score = sheetScore(s);
      return score === null ? [] : [score];
    });
    const sources: Record<string, number[]> = {};
    for (const s of mine) {
      const score = sheetScore(s);
      if (score !== null) (sources[s.source] ??= []).push(score);
    }
    return {
      group,
      sheets: mine.length,
      axes: Object.fromEntries(
        CRITIC_AXES.flatMap((axis) => {
          const spread = spreadOf(
            mine.flatMap((s) =>
              s.scores[axis] !== undefined ? [s.scores[axis]] : [],
            ),
          );
          return spread ? [[axis, spread]] : [];
        }),
      ),
      overall: spreadOf(own),
      passing: own.length
        ? round2(own.filter((v) => v >= LOOP.passScore).length / own.length)
        : 0,
      sources: Object.fromEntries(
        Object.entries(sources).map(([source, values]) => [
          source,
          spreadOf(values)!.mean,
        ]),
      ),
      costUsd:
        Math.round(mine.reduce((n, s) => n + (s.costUsd ?? 0), 0) * 1e4) / 1e4,
    };
  });
  const [first, ...rest] = groups;
  const ownOf = (group: string) =>
    sheets
      .filter((s) => s.group === group)
      .flatMap((s) => {
        const score = sheetScore(s);
        return score === null ? [] : [score];
      });
  return {
    groups,
    against: first
      ? rest.map((other) => ({
          group: other.group,
          gap: Object.fromEntries(
            CRITIC_AXES.flatMap((axis) =>
              first.axes[axis] && other.axes[axis]
                ? [
                    [
                      axis,
                      round2(first.axes[axis].mean - other.axes[axis].mean),
                    ],
                  ]
                : [],
            ),
          ),
          overallGap:
            first.overall && other.overall
              ? round2(first.overall.mean - other.overall.mean)
              : null,
          auc: aucOf(ownOf(first.group), ownOf(other.group)),
        }))
      : [],
    refsInBand: Boolean(
      first?.overall &&
      first.overall.median >= LOOP.passScore &&
      first.overall.median <= 9.5,
    ),
  };
}

/** A calibration as a report's tables: each group by axis, then each group against the first. */
export function calibrationMarkdown(c: Calibration): string {
  const axes = CRITIC_AXES;
  const cell = (s: Spread | undefined) => (s ? `${s.mean}` : '–');
  const lines = [
    `| Group | Sheets | ${axes.join(' | ')} | Own score (median, range) | Passing |`,
    `|---|---|${axes.map(() => '---').join('|')}|---|---|`,
    ...c.groups.map(
      (g) =>
        `| ${g.group} | ${g.sheets} | ${axes.map((a) => cell(g.axes[a])).join(' | ')} | ${g.overall ? `${g.overall.mean} (${g.overall.median}, ${g.overall.min}–${g.overall.max})` : '–'} | ${Math.round(g.passing * 100)}% |`,
    ),
  ];
  if (c.against.length)
    lines.push(
      '',
      `| Against ${c.groups[0].group} | ${axes.join(' | ')} | Own score | AUC |`,
      `|---|${axes.map(() => '---').join('|')}|---|---|`,
      ...c.against.map(
        (a) =>
          `| ${a.group} | ${axes.map((x) => (a.gap[x] !== undefined ? `${a.gap[x] > 0 ? '+' : ''}${a.gap[x]}` : '–')).join(' | ')} | ${a.overallGap ?? '–'} | ${a.auc ?? '–'} |`,
      ),
    );
  lines.push(
    '',
    `References in the band (median own score 8 to 9.5): ${c.refsInBand ? 'yes' : 'no'}.`,
  );
  return lines.join('\n');
}
