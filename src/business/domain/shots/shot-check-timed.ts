/**
 * The timed half of the shot checks (explainer-animation-tech.md §4.1;
 * the plan half, on the board's words, is shot-check.ts): a scene's shots
 * on the voice's clock held to the pace the rules set (research §3.2).
 *
 * What counts as an event is the frames checker's own (frame-checks'
 * shotEvents and paceOf): each shot, each piece of information, each
 * camera move to a new subject, a change within PACE.subStepMs of the one
 * before being part of it. So the plan, the timing and the frames agree:
 *
 *  - Information events at least PACE.minGapMs apart.
 *  - No stretch over PACE.maxGapMs with nothing new while the voice
 *    speaks, outside a declared rest (a camera's hold, an ask's quiet, an
 *    editor's held row).
 *  - One attention cue at a time, and at most two things moving in the
 *    information layer (ATTENTION).
 *  - Text up long enough to read (dwellMs).
 *  - The episode's first change by PACE.firstChangeMs.
 *
 * mendTimed puts right what it can, silently: a crowded change waits a
 * little (within the next words) or joins the change before it as a part
 * of it, a label is held longer, the opening's first change is brought
 * into its first second and a half. A long stretch with nothing new is
 * the board's to fill (shot-board's withPace), never camera drift's: the
 * check names it for the log.
 */
import type { ShotDto, ShotInfoDto, ShotInfoRecipe } from '../../../contracts';
import { ATTENTION, PACE, dwellMs } from '../studio/explainer-rules';
import { paceOf, reframesShot, shotEvents, shotHolds } from './frame-checks';
import { CAMERA_MS, SETTLE_LEAD_MS } from './shot-time';
import type { ShotProblem } from './types';

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

/** What the checks are told beyond the shots. */
export interface TimedOptions {
  /** The scene opens its episode: its first change comes by PACE.firstChangeMs. */
  first?: boolean;
  /** Stretches the script holds on (an editor's held row): still on purpose. */
  holds?: readonly (readonly [number, number])[];
  /** When the voice speaks, its first word to its last: what the pace is held over (absent, the whole scene). */
  voice?: readonly [number, number];
}

/** The words a piece of information puts on screen, for how long it must stay. An entrance's or an exit's text is its way in or out, not words. */
export function wordsShown(item: ShotInfoDto): number {
  if (item.recipe === 'enter' || item.recipe === 'exit') return 0;
  const count = (text?: string) =>
    text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  return (
    count(item.text) +
    count(item.replace) +
    (item.value !== undefined ? 1 + count(item.unit) : 0)
  );
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
  const pace = paceOf(
    shotEvents(shots),
    [...shotHolds(shots), ...(options.holds ?? [])],
    options.voice ?? [0, durationMs],
  );
  for (const { at, gap } of pace.short)
    problems.push({
      shot: shotAt(shots, at),
      code: 'crowded',
      message: `a change at ${Math.round(at)}ms comes ${Math.round(gap)}ms after the one before (at least ${PACE.minGapMs}ms)`,
    });
  for (const { from, to } of pace.long)
    problems.push({
      shot: shotAt(shots, from),
      code: 'quiet',
      message: `nothing new for ${((to - from) / 1000).toFixed(1)}s from ${Math.round(from)}ms (at most ${PACE.maxGapMs / 1000}s outside a declared rest): the board's to fill`,
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
  if (
    options.first &&
    shots.length &&
    (pace.first === null || pace.first > PACE.firstChangeMs)
  )
    problems.push({
      shot: 0,
      code: 'first-change',
      message: `the first change comes at ${pace.first === null ? 'no time' : `${Math.round(pace.first)}ms`} (by ${PACE.firstChangeMs}ms)`,
    });
  return problems;
}

/** The changes that count as news, grouped as the frames checker groups them: each group's start, how many changes it holds, and the information among them (what may move). */
function eventGroups(shots: readonly ShotDto[]): {
  at: number;
  count: number;
  items: ShotInfoDto[];
  shot: number;
}[] {
  const changes: { at: number; item?: ShotInfoDto; shot: number }[] = [];
  shots.forEach((shot, k) => {
    changes.push({ at: shot.startMs, shot: k });
    for (const item of shot.info)
      changes.push({ at: item.atMs, item, shot: k });
    for (const move of shot.camera)
      if (reframesShot(move, shot)) changes.push({ at: move.atMs, shot: k });
  });
  changes.sort((a, b) => a.at - b.at);
  const groups: {
    at: number;
    count: number;
    items: ShotInfoDto[];
    shot: number;
  }[] = [];
  for (const change of changes) {
    const last = groups[groups.length - 1];
    if (!last || change.at - last.at >= PACE.subStepMs)
      groups.push({
        at: change.at,
        count: 1,
        items: change.item ? [change.item] : [],
        shot: change.shot,
      });
    else {
      last.count += 1;
      if (change.item) last.items.push(change.item);
    }
  }
  return groups;
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

  // Events apart, as the frames checker counts them: a change that comes
  // too soon after the one before waits its turn (within the next words),
  // or the one before comes a little earlier, or else it joins the change
  // before it as a part of it.
  /** Whether items moved by `by` would start where two others are already moving. */
  const crowds = (items: readonly ShotInfoDto[], by: number) =>
    items.some((item) => {
      const at = item.atMs + by;
      return (
        out
          .flatMap((shot) => shot.info)
          .filter(
            (other) =>
              !items.includes(other) &&
              other.durMs > 0 &&
              other.atMs <= at &&
              other.atMs + other.durMs > at,
          ).length >= ATTENTION.moving
      );
    });
  const space = () => {
    for (let pass = 0; pass < 24; pass += 1) {
      const groups = eventGroups(out);
      let moved = false;
      for (let k = 1; k < groups.length && !moved; k += 1) {
        const gap = groups[k].at - groups[k - 1].at;
        if (gap >= PACE.minGapMs) continue;
        const items = groups[k].items;
        // A shot's start or a camera move is where it is: only information moves.
        if (!items.length || items.length < groups[k].count) continue;
        const need = PACE.minGapMs - gap;
        if (
          need <= MEND_DELAY_MS &&
          items.every((item) => roomLater(item) >= need) &&
          !crowds(items, need)
        ) {
          for (const item of items) later(item, need);
          mended.push(
            `shot ${groups[k].shot + 1}: ${items[0].recipe} waits ${Math.round(need)}ms for its turn`,
          );
          moved = true;
          continue;
        }
        // Else the change before comes a little earlier, keeping its own
        // distance from the one before it.
        const before = groups[k - 1];
        const prior = groups[k - 2];
        const room = prior
          ? before.at - prior.at - PACE.minGapMs
          : Number.POSITIVE_INFINITY;
        if (
          before.items.length &&
          before.items.length === before.count &&
          need <= Math.min(LEAD_ROOM_MS, room) &&
          before.items.every(
            (item) => item.atMs - need >= shotOf(item).startMs,
          ) &&
          !crowds(before.items, -need)
        ) {
          for (const item of before.items) earlier(item, need);
          mended.push(
            `shot ${before.shot + 1}: ${before.items[0].recipe} comes ${Math.round(need)}ms earlier to keep the next its turn`,
          );
          moved = true;
          continue;
        }
        const back = gap - (PACE.subStepMs - 100);
        if (
          back <= LEAD_ROOM_MS &&
          items.every((item) => item.atMs - back >= shotOf(item).startMs) &&
          !crowds(items, -back)
        ) {
          for (const item of items) earlier(item, back);
          mended.push(
            `shot ${groups[k].shot + 1}: ${items[0].recipe} joins the change before it`,
          );
          moved = true;
        }
      }
      if (!moved) break;
    }
  };

  space();
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

  space();

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

  // The episode's first change by a second and a half: a change hidden in
  // the opening's first moment comes a little after it, as its own; else
  // the first change after it is brought in earlier, within the lead the
  // sync rule allows. An establishing move opens it moving either way.
  if (options.first && out.length) {
    const firstAt = () =>
      paceOf(shotEvents(out), shotHolds(out), options.voice ?? [0, durationMs])
        .first;
    const late = () => {
      const at = firstAt();
      return at === null || at > PACE.firstChangeMs;
    };
    const opening = out[0];
    if (late()) {
      const hidden = opening.info
        .filter((item) => item.atMs - opening.startMs < PACE.subStepMs)
        .sort((a, b) => a.atMs - b.atMs)[0];
      const after = opening.info
        .filter((item) => item.atMs > PACE.firstChangeMs)
        .sort((a, b) => a.atMs - b.atMs)[0];
      if (hidden) {
        const to = opening.startMs + PACE.subStepMs + 50;
        if (
          to - hidden.atMs <= MEND_DELAY_MS &&
          roomLater(hidden) >= to - hidden.atMs
        ) {
          later(hidden, to - hidden.atMs);
          mended.push(
            'shot 1: its first change comes as its own, after the opening',
          );
        }
      }
      if (late() && after) {
        earlier(
          after,
          Math.min(after.atMs - (PACE.firstChangeMs - 100), LEAD_ROOM_MS),
        );
        mended.push('shot 1: its first change brought into the opening');
      }
    }
    if (!opening.camera.some((m) => m.atMs <= opening.startMs + 50)) {
      opening.camera = [
        {
          move: 'establish',
          atMs: opening.startMs,
          durMs: Math.round(
            Math.min(CAMERA_MS.establish, opening.endMs - opening.startMs),
          ),
          ...(opening.focal ? { target: opening.focal } : {}),
        },
        ...opening.camera,
      ];
      mended.push('shot 1: opens on an establishing move');
    }
  }
  return { shots: out, mended };
}
