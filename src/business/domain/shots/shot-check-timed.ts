/**
 * The timed half of the shot checks (explainer-animation-tech.md §4.1;
 * the plan half, on the board's words, is shot-check.ts): a scene's shots
 * on the voice's clock held to the pace the rules set (research §3.2).
 *
 *  - Information events at least PACE.minGapMs apart, a sub-step (part of
 *    the event before, on the same subject, within PACE.subStepMs) aside.
 *  - No still stretch over PACE.maxGapMs outside a declared hold.
 *  - One attention cue at a time, and at most two things moving in the
 *    information layer (ATTENTION).
 *  - Text up long enough to read (dwellMs).
 *  - The episode's first change by PACE.firstChangeMs.
 *
 * mendTimed puts right what it can, silently: a crowded event moved a
 * little later (within the next words) or the one before it a little
 * earlier (within the lead the sync rule allows), a label held longer, a
 * still stretch filled with a slow camera move on the shot's subject,
 * never with words. What it cannot put right is left for the log.
 */
import type {
  ShotCameraDto,
  ShotDto,
  ShotInfoDto,
  ShotInfoRecipe,
  ShotTargetDto,
} from '../../../contracts';
import { ATTENTION, PACE, dwellMs } from '../studio/explainer-rules';
import {
  CAMERA_AMOUNT,
  CAMERA_MS,
  DRIFT_MS,
  SETTLE_LEAD_MS,
} from './shot-time';
import type { ShotProblem } from './types';

/** Recipes that put a new fact on screen: the information events gaps are counted between. */
const FACTS: ReadonlySet<ShotInfoRecipe> = new Set<ShotInfoRecipe>([
  'draw',
  'label',
  'pin',
  'fill',
  'seam',
  'count',
  'grow',
  'transfer',
  'morph',
  'run',
  'strike',
  'stamp',
  'enter',
  'ask',
]);

/** Recipes that point at what is there: one at a time. */
const CUES: ReadonlySet<ShotInfoRecipe> = new Set<ShotInfoRecipe>([
  'flow',
  'spotlight',
  'mark',
]);

/** The most a crowded event is moved later: into the next couple of words, no further. */
export const MEND_DELAY_MS = 600;

/** The most a change may settle before its word (the rules' lead), less the lead it was timed with. */
const LEAD_ROOM_MS = PACE.settleMaxLeadMs - SETTLE_LEAD_MS;

/** A still stretch is broken every so often: at most the explain passage's median gap. */
const FILL_EVERY_MS = PACE.explainMedianGapMs[1];

/** What the checks are told beyond the shots. */
export interface TimedOptions {
  /** The scene opens its episode: its first change comes by PACE.firstChangeMs. */
  first?: boolean;
  /** Stretches the script holds on (an editor's held row): still on purpose. */
  holds?: readonly (readonly [number, number])[];
}

/** A target as a key, to tell two changes on the same subject. */
function targetKey(target?: ShotTargetDto): string {
  if (!target) return '';
  switch (target.kind) {
    case 'asset':
      return `a:${target.asset}:${target.part ?? ''}`;
    case 'actor':
      return `r:${target.actor}:${target.part ?? ''}`;
    case 'feature':
      return `f:${target.asset}:${target.id}`;
    case 'geo':
      return `g:${target.lng.toFixed(3)},${target.lat.toFixed(3)}`;
    case 'box':
      return `b:${target.box.map((n) => Math.round(n)).join(',')}`;
  }
}

/** The words a piece of information puts on screen, for how long it must stay. */
export function wordsShown(item: ShotInfoDto): number {
  const count = (text?: string) =>
    text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  return (
    count(item.text) +
    count(item.replace) +
    (item.value !== undefined ? 1 + count(item.unit) : 0)
  );
}

/** Whether two shots show the same set, carried on. */
function sameSet(a: ShotDto, b: ShotDto): boolean {
  return (
    a.set.kind === b.set.kind &&
    ('asset' in a.set ? a.set.asset : null) ===
      ('asset' in b.set ? b.set.asset : null)
  );
}

/** A change on the clock: when it lands, and what it is about. */
interface Landing {
  shot: number;
  at: number;
  target: string;
  /** A new set cut to: its picture is the event. */
  cut: boolean;
  item?: ShotInfoDto;
}

/** The information events in order: new sets cut to and facts landing, with sub-steps marked off. */
function landings(shots: readonly ShotDto[]): (Landing & { sub: boolean })[] {
  const all: Landing[] = [];
  shots.forEach((shot, i) => {
    if (i > 0 && !sameSet(shots[i - 1], shot))
      all.push({ shot: i, at: shot.startMs, target: '', cut: true });
    for (const item of shot.info)
      if (FACTS.has(item.recipe))
        all.push({
          shot: i,
          at: item.atMs + item.durMs,
          target: targetKey(item.target),
          cut: false,
          item,
        });
  });
  all.sort((a, b) => a.at - b.at);
  // A sub-step is part of the event before it: the label of the pin just
  // dropped, the first fact of a set just cut to.
  return all.map((one, k) => {
    const before = all[k - 1];
    const sub =
      !!before &&
      !one.cut &&
      one.at - before.at < PACE.subStepMs &&
      (before.cut ? before.shot === one.shot : before.target === one.target);
    return { ...one, sub };
  });
}

/** Stretches of a scene in which something moves: the stage's changes, its camera and its actors. */
function busySpans(shots: readonly ShotDto[]): [number, number][] {
  const spans: [number, number][] = [];
  shots.forEach((shot, i) => {
    if (i > 0 && !sameSet(shots[i - 1], shot))
      spans.push([shot.startMs, shot.startMs + Math.max(1, shot.joinMs)]);
    for (const item of shot.info)
      spans.push([item.atMs, item.atMs + Math.max(1, item.durMs)]);
    for (const move of shot.camera)
      if (move.move !== 'hold')
        spans.push([move.atMs, move.atMs + Math.max(1, move.durMs)]);
    for (const actor of shot.actors)
      for (const move of actor.moves)
        spans.push([move.atMs, move.atMs + Math.max(1, move.durMs)]);
  });
  return spans.sort((a, b) => a[0] - b[0]);
}

/** Stretches still on purpose: a camera's hold, the quiet after a question, the script's held rows. */
function holdSpans(
  shots: readonly ShotDto[],
  options: TimedOptions,
): [number, number][] {
  const spans: [number, number][] = (options.holds ?? []).map(
    ([a, b]) => [a, b] as [number, number],
  );
  for (const shot of shots) {
    for (const move of shot.camera)
      if (move.move === 'hold') spans.push([move.atMs, move.atMs + move.durMs]);
    for (const item of shot.info)
      if (item.recipe === 'ask') {
        const land = item.atMs + item.durMs;
        spans.push([land, land + PACE.askQuietMs]);
      }
  }
  return spans;
}

/** How much of [a, b] the spans cover. */
function covered(a: number, b: number, spans: readonly [number, number][]) {
  const inside = spans
    .map(([x, y]) => [Math.max(a, x), Math.min(b, y)] as [number, number])
    .filter(([x, y]) => y > x)
    .sort((p, q) => p[0] - q[0]);
  let total = 0;
  let reach = a;
  for (const [x, y] of inside) {
    const from = Math.max(x, reach);
    if (y > from) total += y - from;
    reach = Math.max(reach, y);
  }
  return total;
}

/** The still stretches of a scene longer than the rules allow, holds aside: [from, to]. */
function quietStretches(
  shots: readonly ShotDto[],
  durationMs: number,
  options: TimedOptions,
): [number, number][] {
  const busy = busySpans(shots);
  const holds = holdSpans(shots, options);
  const out: [number, number][] = [];
  let reach = 0;
  const still = (from: number, to: number) => {
    if (to - from - covered(from, to, holds) > PACE.maxGapMs)
      out.push([from, to]);
  };
  for (const [a, b] of busy) {
    if (a > reach) still(reach, a);
    reach = Math.max(reach, b);
  }
  if (durationMs > reach) still(reach, durationMs);
  return out;
}

/** How long an attention cue holds the eye: a spotlight's dimming and a mark stay until released; a flow runs its length. */
function cueSpan(item: ShotInfoDto, shot: ShotDto): [number, number] {
  const to =
    item.untilMs ??
    (item.recipe === 'flow' ? item.atMs + item.durMs : shot.endMs);
  return [item.atMs, Math.max(item.atMs, to)];
}

/** The most moving at once among spans, and the first moment it happens. */
function mostAtOnce(spans: readonly [number, number][]): {
  most: number;
  at: number;
} {
  const edges = spans.flatMap(([a, b]) => [
    { t: a, d: 1 },
    { t: b, d: -1 },
  ]);
  edges.sort((x, y) => x.t - y.t || x.d - y.d);
  let now = 0;
  let most = 0;
  let at = 0;
  for (const edge of edges) {
    now += edge.d;
    if (now > most) [most, at] = [now, edge.t];
  }
  return { most, at };
}

const shotAt = (shots: readonly ShotDto[], ms: number) =>
  Math.max(
    0,
    shots.findIndex((shot) => ms >= shot.startMs && ms < shot.endMs),
  );

/** The first change after the scene opens: any motion, or a cut to a new set. */
function firstChange(shots: readonly ShotDto[]): number {
  const starts = busySpans(shots).map(([a]) => a);
  for (const shot of shots)
    for (const move of shot.camera)
      if (move.move === 'hold') starts.push(move.atMs);
  return starts.length ? Math.min(...starts) : Infinity;
}

/**
 * What is wrong with a scene's timing, by the rules: each problem with
 * the shot it is in and a plain message, for the log and the critic.
 */
export function checkTimed(
  shots: readonly ShotDto[],
  durationMs: number,
  options: TimedOptions = {},
): ShotProblem[] {
  const problems: ShotProblem[] = [];
  const events = landings(shots);
  let last: (typeof events)[number] | null = null;
  for (const one of events) {
    if (one.sub) continue;
    if (last && one.at - last.at < PACE.minGapMs)
      problems.push({
        shot: one.shot,
        code: 'crowded',
        message: `${one.cut ? 'the cut' : (one.item?.recipe ?? 'a change')} at ${Math.round(one.at)}ms lands ${Math.round(one.at - last.at)}ms after the one before (at least ${PACE.minGapMs}ms)`,
      });
    last = one;
  }
  for (const [from, to] of quietStretches(shots, durationMs, options))
    problems.push({
      shot: shotAt(shots, from),
      code: 'quiet',
      message: `nothing changes for ${((to - from) / 1000).toFixed(1)}s from ${Math.round(from)}ms (at most ${PACE.maxGapMs / 1000}s outside a hold)`,
    });
  shots.forEach((shot, i) => {
    const cues = shot.info
      .filter((item) => CUES.has(item.recipe))
      .map((item) => ({ item, span: cueSpan(item, shot) }));
    const together = mostAtOnce(cues.map((c) => c.span));
    if (together.most > ATTENTION.cues)
      problems.push({
        shot: i,
        code: 'cues',
        message: `${together.most} attention cues at once at ${Math.round(together.at)}ms (at most ${ATTENTION.cues})`,
      });
  });
  const moving = mostAtOnce([
    ...shots.flatMap((shot) =>
      shot.info
        .filter((item) => item.durMs > 0)
        .map((item) => [item.atMs, item.atMs + item.durMs] as [number, number]),
    ),
    ...shots.flatMap((shot) =>
      shot.actors.flatMap((actor) =>
        actor.moves.map(
          (move) => [move.atMs, move.atMs + move.durMs] as [number, number],
        ),
      ),
    ),
  ]);
  if (moving.most > ATTENTION.moving)
    problems.push({
      shot: shotAt(shots, moving.at),
      code: 'moving',
      message: `${moving.most} things move at once at ${Math.round(moving.at)}ms (at most ${ATTENTION.moving})`,
    });
  shots.forEach((shot, i) => {
    for (const item of shot.info) {
      const words = wordsShown(item);
      if (!words) continue;
      const shown = (item.untilMs ?? shot.endMs) - (item.atMs + item.durMs);
      if (shown < dwellMs(words))
        problems.push({
          shot: i,
          code: 'dwell',
          message: `${item.recipe} "${item.text ?? item.value ?? ''}" is up ${Math.round(shown)}ms, ${dwellMs(words)}ms to read`,
        });
    }
  });
  if (options.first && shots.length) {
    const at = firstChange(shots);
    if (at > PACE.firstChangeMs)
      problems.push({
        shot: 0,
        code: 'first-change',
        message: `the first change comes at ${Number.isFinite(at) ? `${Math.round(at)}ms` : 'no time'} (by ${PACE.firstChangeMs}ms)`,
      });
  }
  return problems;
}

/** A copy of the shots that can be put right in place. */
const copyOf = (shots: readonly ShotDto[]): ShotDto[] =>
  JSON.parse(JSON.stringify(shots)) as ShotDto[];

/**
 * The shots with their timing put right where it can be, silently, and
 * what was done, for the log: crowded events spaced, two cues or three
 * movers at once taken apart, text held to be read, still stretches
 * broken by a slow camera move on the subject, and an opening that moves
 * from its first moment.
 */
export function mendTimed(
  shots: readonly ShotDto[],
  durationMs: number,
  options: TimedOptions = {},
): { shots: ShotDto[]; mended: string[] } {
  const out = copyOf(shots);
  const mended: string[] = [];
  const shotOf = (item: ShotInfoDto) =>
    out[
      Math.max(
        0,
        out.findIndex((shot) => shot.info.includes(item)),
      )
    ];
  /** How far an item can move later and still finish inside its shot. */
  const roomLater = (item: ShotInfoDto) =>
    Math.max(0, shotOf(item).endMs - (item.atMs + item.durMs));
  /** Move an item later by up to `by`, inside its shot; how far it went. */
  const later = (item: ShotInfoDto, by: number): number => {
    const step = Math.max(0, Math.min(by, roomLater(item)));
    item.atMs = Math.round(item.atMs + step);
    if (item.untilMs !== undefined)
      item.untilMs = Math.max(item.untilMs, item.atMs + item.durMs);
    return step;
  };
  /** Move an item earlier by up to `by`, inside its shot; how far it went. */
  const earlier = (item: ShotInfoDto, by: number): number => {
    const step = Math.max(0, Math.min(by, item.atMs - shotOf(item).startMs));
    item.atMs = Math.round(item.atMs - step);
    return step;
  };

  // One attention cue at a time: the one before lets go as the next comes,
  // or the next waits until the one before has drawn the eye.
  out.forEach((shot, i) => {
    const cues = shot.info
      .filter((item) => CUES.has(item.recipe))
      .sort((a, b) => a.atMs - b.atMs);
    for (let k = 1; k < cues.length; k += 1) {
      const [before, next] = [cues[k - 1], cues[k]];
      const [, ends] = cueSpan(before, shot);
      if (ends <= next.atMs) continue;
      const drawn = before.atMs + before.durMs;
      const wait = drawn - next.atMs;
      if (wait > 0 && (wait > MEND_DELAY_MS || roomLater(next) < wait))
        continue;
      if (wait > 0) later(next, wait);
      before.untilMs = next.atMs;
      mended.push(
        `shot ${i + 1}: ${before.recipe} lets go as ${next.recipe} comes${wait > 0 ? `, ${Math.round(wait)}ms later` : ''}`,
      );
    }
  });

  // At most two moving at once: a third waits for one to finish, within
  // the next words.
  const motions = () =>
    out
      .flatMap((shot) => shot.info)
      .filter((item) => item.durMs > 0)
      .sort((a, b) => a.atMs - b.atMs);
  for (const item of motions()) {
    const others = motions().filter(
      (other) =>
        other !== item &&
        other.atMs <= item.atMs &&
        other.atMs + other.durMs > item.atMs,
    );
    if (others.length < ATTENTION.moving) continue;
    const need = Math.min(...others.map((o) => o.atMs + o.durMs)) - item.atMs;
    if (need > MEND_DELAY_MS || roomLater(item) < need) continue;
    later(item, need);
    mended.push(`${item.id}: waits ${Math.round(need)}ms for room to move`);
  }

  // Events apart: the later one a little later, then the earlier one a
  // little earlier, each within what the sync rule allows and never into
  // the event before it.
  const timeOf = (one: Landing) =>
    one.item ? one.item.atMs + one.item.durMs : one.at;
  for (let pass = 0; pass < 2; pass += 1) {
    let last: Landing | null = null;
    let before = -Infinity;
    for (const one of landings(out)) {
      if (one.sub) continue;
      if (last) {
        const gap = timeOf(one) - timeOf(last);
        if (gap < PACE.minGapMs) {
          let need = PACE.minGapMs - gap;
          if (one.item) need -= later(one.item, Math.min(need, MEND_DELAY_MS));
          if (need > 0 && last.item)
            need -= earlier(
              last.item,
              Math.min(
                need,
                LEAD_ROOM_MS,
                Math.max(0, timeOf(last) - (before + PACE.minGapMs)),
              ),
            );
          if (need < PACE.minGapMs - gap)
            mended.push(
              `shot ${one.shot + 1}: ${one.item?.recipe ?? 'the cut'} spaced from the change before`,
            );
        }
        before = timeOf(last);
      }
      last = one;
    }
  }

  // Text held to be read: kept up longer, or brought in earlier.
  out.forEach((shot, i) => {
    for (const item of shot.info) {
      const words = wordsShown(item);
      if (!words) continue;
      const need = dwellMs(words);
      const shown = () =>
        (item.untilMs ?? shot.endMs) - (item.atMs + item.durMs);
      const was = shown();
      if (was >= need) continue;
      if (item.untilMs !== undefined)
        item.untilMs = Math.round(
          Math.min(shot.endMs, item.atMs + item.durMs + need),
        );
      if (shown() < need) earlier(item, Math.min(need - shown(), LEAD_ROOM_MS));
      if (shown() > was)
        mended.push(
          `shot ${i + 1}: ${item.recipe} up ${Math.round(shown())}ms to be read (was ${Math.round(was)}ms)`,
        );
    }
  });

  // Still stretches broken by a slow push or pull on the shot's subject,
  // never by words.
  for (const [from, to] of quietStretches(out, durationMs, options)) {
    const length = to - from;
    const k = Math.max(1, Math.ceil(length / FILL_EVERY_MS) - 1);
    for (let j = 1; j <= k; j += 1) {
      const middle = from + (j * length) / (k + 1);
      const i = shotAt(out, middle);
      const shot = out[i];
      const runs = Math.min(DRIFT_MS, shot.endMs - shot.startMs);
      if (runs < DRIFT_MS / 2) continue;
      const atMs = Math.round(
        Math.max(shot.startMs, Math.min(middle - runs / 2, shot.endMs - runs)),
      );
      const move: ShotCameraDto = {
        move: j % 2 ? 'push' : 'pull',
        atMs,
        durMs: Math.round(runs),
        amount: CAMERA_AMOUNT.small,
        ...(shot.focal ? { target: shot.focal } : {}),
      };
      shot.camera = [...shot.camera, move].sort((a, b) => a.atMs - b.atMs);
      mended.push(
        `shot ${i + 1}: a slow ${move.move} at ${atMs}ms breaks ${(length / 1000).toFixed(1)}s of stillness`,
      );
    }
  }

  // The episode opens moving: an establishing move from its first frame.
  if (options.first && out.length && firstChange(out) > PACE.firstChangeMs) {
    const shot = out[0];
    shot.camera = [
      {
        move: 'establish',
        atMs: 0,
        durMs: Math.round(
          Math.min(CAMERA_MS.establish, shot.endMs - shot.startMs),
        ),
        ...(shot.focal ? { target: shot.focal } : {}),
      },
      ...shot.camera,
    ];
    mended.push('shot 1: opens on an establishing move');
  }
  return { shots: out, mended };
}
