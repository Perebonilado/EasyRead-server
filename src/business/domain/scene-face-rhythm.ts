/**
 * The face rhythm check (studio-faces-plan): how often a made film's
 * rigged faces change, and whether the changes make sense, read from the
 * scene alone, for the log and the tests. Someone's face at a moment is
 * the acted face on then (SceneActingDto.face), else the face they rest
 * at: the scene's rest for them (SceneActingDto.rest), or, in a scene
 * made before rests, the kit's face they wear (the effects' shows). It
 * reports, for each one with a face:
 *
 *  - changes: a change of what the face says or feels (strength alone is
 *    no change), a minute, and how long each face is held;
 *  - short holds: a face held less than MIN_FACE_HOLD_MS between two
 *    changes;
 *  - crowded: a change less than FACE_GAP_MS after the one before;
 *  - swings: a change to the opposite of a face on less than SWING_MS
 *    (glad to low, low to glad: delight, furious, joy within seconds);
 *  - mismatched reactions: a listener's face, as a line is said or just
 *    after, the opposite of the line's (a tender line met with fear), or
 *    fear or anger at a line said calmly;
 *  - how many recipes, and how much of the time a face is at full
 *    strength.
 *
 * Blinks, darts and the mouth's shapes are the face's life, not changes.
 * Pure.
 */
import type { SceneDto } from '../../contracts';
import { GLAD_RECIPES, RECIPE_OF_FACE } from './scene-face-rig';

/** Shorter than this, a face is not held long enough to be read. */
export const MIN_FACE_HOLD_MS = 1500;
/** A change sooner than this after the one before crowds it. */
export const FACE_GAP_MS = 3000;
/** Opposite faces this close together are a swing. */
export const SWING_MS = 3000;
/** How long after a line a face that changes is still taken as a reaction to it. */
const REACT_AFTER_MS = 1500;

/** Faces that sink someone's mood: the other side of GLAD_RECIPES. */
const LOW: ReadonlySet<string> = new Set([
  'sad',
  'heartbroken',
  'fear',
  'terror',
  'worried',
  'guilty',
  'embarrassed',
  'pain',
  'angry',
  'furious',
  'annoyed',
  'disgust',
  'pleading',
  'exasperated',
]);
/** The low faces that are hostile or frightened: never a fair answer to a line said calmly or kindly. */
const HARSH: ReadonlySet<string> = new Set([
  'fear',
  'terror',
  'angry',
  'furious',
  'annoyed',
  'disgust',
  'shock',
]);

/** A face's side: 1 glad, -1 low, 0 neither (thinking, surprise, determined). */
export function valenceOf(recipe: string | null | undefined): -1 | 0 | 1 {
  if (!recipe) return 0;
  if (GLAD_RECIPES.has(recipe) && recipe !== 'sarcastic') return 1;
  if (LOW.has(recipe)) return -1;
  return 0;
}

/** Whether two faces are opposites: one glad, the other low. */
export const opposite = (a: string | null, b: string | null): boolean =>
  valenceOf(a) * valenceOf(b) < 0;

/** A face as the check reads it: what it says, what it feels beneath, how strongly. */
export interface FaceRead {
  said: string;
  felt: string | null;
  strength: number;
  /** Acted over the rest (a key), not the rest itself. */
  acted: boolean;
}

/** A stretch of one face. */
export interface FaceSpan extends FaceRead {
  from: number;
  to: number;
}

const sameFace = (a: FaceRead, b: FaceRead) =>
  a.said === b.said && (a.felt ?? a.said) === (b.felt ?? b.said);

/** The kit's faces someone wears over a scene: from when, which, as a recipe. */
function kitFaces(
  scene: Pick<SceneDto, 'effects'>,
  id: string,
): [number, string][] {
  const out: [number, string][] = [];
  for (const e of [...(scene.effects ?? [])].sort((a, b) => a.atMs - b.atMs))
    if (
      e.target === id &&
      e.do === 'show' &&
      e.part &&
      RECIPE_OF_FACE[e.part] !== undefined
    )
      out.push([e.atMs, RECIPE_OF_FACE[e.part]]);
  return out;
}

/** Someone's face over a scene, stretch by stretch, as the player shows it (the eases left out). */
export function faceSpans(
  scene: Pick<SceneDto, 'effects' | 'acting' | 'durationMs'>,
  id: string,
): FaceSpan[] {
  const acting = scene.acting?.[id];
  const keys = [...(acting?.face ?? [])].sort((a, b) => a[0] - b[0]);
  const rests: [number, string, number][] = acting?.rest?.length
    ? acting.rest.map(([at, recipe, s]) => [at, recipe, s])
    : kitFaces(scene, id).map(([at, recipe]) => [at, recipe, 1]);
  const end = scene.durationMs;
  const times = new Set<number>([0]);
  for (const k of keys) {
    times.add(k[0]);
    times.add(k[0] + k[5]);
  }
  for (const r of rests) times.add(r[0]);
  const at = [...times].filter((t) => t >= 0 && t < end).sort((a, b) => a - b);
  const readAt = (t: number): FaceRead => {
    let key: (typeof keys)[number] | null = null;
    for (const k of keys)
      if (k[0] <= t) key = k;
      else break;
    if (key && t < key[0] + key[5])
      return {
        said: key[1],
        felt: key[3] && key[3] !== key[1] ? key[3] : null,
        strength: key[2],
        acted: true,
      };
    let rest: [number, string, number] | null = null;
    for (const r of rests) if (r[0] <= t) rest = r;
    return {
      said: rest?.[1] ?? 'neutral',
      felt: null,
      strength: rest?.[2] ?? 1,
      acted: false,
    };
  };
  const out: FaceSpan[] = [];
  at.forEach((t, i) => {
    const face = readAt(t);
    const to = at[i + 1] ?? end;
    const last = out[out.length - 1];
    if (last && sameFace(last, face) && last.strength === face.strength) {
      last.to = to;
      return;
    }
    out.push({ ...face, from: t, to });
  });
  return out;
}

/** A change of someone's face: from what, to what, when. */
export interface FaceChange {
  atMs: number;
  from: FaceRead;
  to: FaceRead;
}

/** The changes in a run of stretches: what is said or felt changing, not strength alone. */
export function faceChanges(spans: readonly FaceSpan[]): FaceChange[] {
  const out: FaceChange[] = [];
  let was = spans[0];
  for (const span of spans.slice(1)) {
    if (!sameFace(was, span))
      out.push({ atMs: span.from, from: was, to: span });
    was = span;
  }
  return out;
}

export type FaceIssueKind = 'short-hold' | 'crowded' | 'swing' | 'mismatch';

export interface FaceIssue {
  id: string;
  kind: FaceIssueKind;
  atMs: number;
  /** e.g. "delight→furious after 900ms", "tender line, fear". */
  what: string;
}

export interface FacesOfOne {
  id: string;
  changes: number;
  perMinute: number;
  /** The shortest and the middle hold between two changes, ms. */
  shortestHoldMs: number | null;
  medianHoldMs: number | null;
  /** The recipes their face shows, rest and acted. */
  recipes: string[];
  /** How much of the time their face is acted at full strength (0.9 and over). */
  fullShare: number;
}

export interface FaceReport {
  people: FacesOfOne[];
  issues: FaceIssue[];
  counts: Record<FaceIssueKind, number> & { changes: number };
}

/** A face's side for a swing: what is felt beneath, where it is felt otherwise (a brave smile over fear is low). */
const sideOf = (f: FaceRead) => f.felt ?? f.said;

const label = (f: FaceRead) => (f.felt ? `${f.said}/${f.felt}` : f.said);

/** A line said, as the check reads its feeling: the speaker's acted face while they say it, else the face they wear. */
function linesOf(
  scene: Pick<SceneDto, 'effects' | 'acting' | 'durationMs'>,
  spans: ReadonlyMap<string, FaceSpan[]>,
): { who: string; from: number; to: number; said: string }[] {
  const out: { who: string; from: number; to: number; said: string }[] = [];
  for (const e of scene.effects ?? []) {
    if (e.do !== 'say' || !e.say || e.say.from) continue;
    const to = e.say.saidUntilMs ?? e.say.untilMs ?? e.atMs;
    const own = spans.get(e.target) ?? [];
    const mid = e.atMs + Math.min(900, (to - e.atMs) / 2);
    // The face acted for it, else the one worn as it is said.
    const span =
      own.find(
        (s) =>
          s.acted &&
          s.to - s.from >= 300 &&
          s.from >= e.atMs - 450 &&
          s.from < to,
      ) ?? own.find((s) => s.from <= mid && mid < s.to);
    out.push({
      who: e.target,
      from: e.atMs,
      to,
      said: span?.said ?? 'neutral',
    });
  }
  return out.sort((a, b) => a.from - b.from);
}

/** Low faces that are someone hurting or afraid, not hostile: met with care, never with anger. */
const TENDER_LOW: ReadonlySet<string> = new Set([
  'sad',
  'heartbroken',
  'fear',
  'terror',
  'worried',
  'guilty',
  'embarrassed',
  'pain',
  'pleading',
]);
const HOSTILE: ReadonlySet<string> = new Set([
  'angry',
  'furious',
  'annoyed',
  'disgust',
  'exasperated',
]);

/** Whether a listener's face fits a line said with `said`: never its opposite, never fear or anger at a line said calmly or kindly, never anger at someone hurting or afraid. */
export function reactionFits(said: string, reaction: string): boolean {
  // Someone hurting or afraid may be met tenderly: a comfort, not a smile.
  if (TENDER_LOW.has(said) && (reaction === 'tender' || reaction === 'love'))
    return true;
  if (opposite(said, reaction)) return false;
  if (valenceOf(said) >= 0 && HARSH.has(reaction) && said !== 'surprise')
    return false;
  if (TENDER_LOW.has(said) && HOSTILE.has(reaction)) return false;
  return true;
}

/** The face rhythm check of a made scene. */
export function faceRhythm(
  scene: Pick<SceneDto, 'effects' | 'acting' | 'durationMs'>,
): FaceReport {
  const minutes = Math.max(1, scene.durationMs) / 60000;
  const ids = Object.keys(scene.acting ?? {}).filter(
    (id) =>
      scene.acting?.[id]?.face?.length ||
      scene.acting?.[id]?.rest?.length ||
      kitFaces(scene, id).length,
  );
  const spans = new Map(ids.map((id) => [id, faceSpans(scene, id)]));
  const lines = linesOf(scene, spans);
  const people: FacesOfOne[] = [];
  const issues: FaceIssue[] = [];
  for (const id of ids) {
    const own = spans.get(id)!;
    const changes = faceChanges(own);
    const holds = changes
      .slice(1)
      .map((c, k) => c.atMs - changes[k].atMs)
      .sort((a, b) => a - b);
    const full = own
      .filter((s) => s.acted && s.strength >= 0.9)
      .reduce((n, s) => n + (s.to - s.from), 0);
    people.push({
      id,
      changes: changes.length,
      perMinute: Math.round((changes.length / minutes) * 10) / 10,
      shortestHoldMs: holds.length ? holds[0] : null,
      medianHoldMs: holds.length ? holds[Math.floor(holds.length / 2)] : null,
      recipes: [
        ...new Set(own.flatMap((s) => (s.felt ? [s.said, s.felt] : [s.said]))),
      ].sort(),
      fullShare: Math.round((full / Math.max(1, scene.durationMs)) * 100) / 100,
    });
    changes.forEach((c, k) => {
      const before = changes[k - 1];
      const after = changes[k + 1];
      const held = before ? c.atMs - before.atMs : Infinity;
      if (before && after && after.atMs - c.atMs < MIN_FACE_HOLD_MS)
        issues.push({
          id,
          kind: 'short-hold',
          atMs: c.atMs,
          what: `${label(c.to)} held ${after.atMs - c.atMs}ms`,
        });
      if (held < FACE_GAP_MS)
        issues.push({
          id,
          kind: 'crowded',
          atMs: c.atMs,
          what: `${label(c.from)}→${label(c.to)} after ${held}ms`,
        });
      if (held < SWING_MS && opposite(sideOf(c.from), sideOf(c.to)))
        issues.push({
          id,
          kind: 'swing',
          atMs: c.atMs,
          what: `${label(c.from)}→${label(c.to)} after ${held}ms`,
        });
      // A reaction: a face put on as someone else's line is said, or just
      // after (a rest changing is not one; the kit's faces worn in a scene
      // made before rests are).
      const reacts = c.to.acted || !scene.acting?.[id]?.rest?.length;
      const line =
        reacts &&
        [...lines]
          .reverse()
          .find(
            (l) =>
              l.who !== id &&
              l.from <= c.atMs &&
              c.atMs <= l.to + REACT_AFTER_MS &&
              !lines.some(
                (m) => m.who === id && m.from - 450 <= c.atMs && c.atMs <= m.to,
              ),
          );
      if (
        line &&
        c.to.said !== 'neutral' &&
        !reactionFits(line.said, c.to.said)
      )
        issues.push({
          id,
          kind: 'mismatch',
          atMs: c.atMs,
          what: `${line.said} line, ${label(c.to)}`,
        });
    });
  }
  const counts = {
    changes: people.reduce((n, p) => n + p.changes, 0),
    'short-hold': 0,
    crowded: 0,
    swing: 0,
    mismatch: 0,
  };
  for (const issue of issues) counts[issue.kind] += 1;
  return { people, issues, counts };
}

/** The check in a line, for the log. */
export function faceRhythmLine(report: FaceReport): string {
  const who = report.people
    .map(
      (p) =>
        `${p.id} ${p.perMinute}/min (${p.recipes.length} faces${
          p.medianHoldMs !== null ? `, held ${p.medianHoldMs}ms` : ''
        })`,
    )
    .join(', ');
  const { counts } = report;
  const faults = (['short-hold', 'crowded', 'swing', 'mismatch'] as const)
    .filter((k) => counts[k])
    .map((k) => `${counts[k]} ${k}${counts[k] === 1 ? '' : 's'}`);
  const first = report.issues
    .slice(0, 4)
    .map((i) => `${i.id} ${i.kind} at ${i.atMs}ms (${i.what})`);
  return `${counts.changes} face changes: ${who || 'no faces'}; ${
    faults.length ? faults.join(', ') : 'every face held and fitting'
  }${first.length ? `; ${first.join('; ')}` : ''}`;
}
