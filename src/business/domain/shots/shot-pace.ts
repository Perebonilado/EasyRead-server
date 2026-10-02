/**
 * A plan's pace, on the board's words (research §3.2; the rules' PACE):
 * the same information events the frames checker counts on the clock
 * (frame-checks' eventsOf), placed on the narration's words before any
 * voice exists:
 *
 *  - each shot's start;
 *  - each piece of information;
 *  - each camera move that frames a new subject (a travel, a cut, a
 *    zoom through, a follow, or a push in on something other than the
 *    shot's own subject); a slow push or pull on what is already framed
 *    is motion, not news.
 *
 * Changes within a word of each other are one event, as the clock's are
 * within PACE.subStepMs. A word is about half a second as the voices say
 * them (with the pauses between lines, one more word's worth each), so
 * the rules' 6 seconds with nothing new is about 12 words, and the board
 * is held to 8: something new every few words, never a long stretch the
 * voice talks through over a still picture.
 */
import type {
  PlanActor,
  PlanCamera,
  PlanInfo,
  PlanShot,
  ShotPlan,
} from './types';
import {
  phraseAt,
  phraseText,
  uniquePhrase,
  type Narration,
} from './shot-phrases';

/** The board's pace in words. */
export const PLAN_PACE = {
  /** The most words with nothing new: about 4 seconds, under the rules' 6. */
  maxWords: 8,
  /** What a pause between two lines adds, in words. */
  lineWords: 1,
  /** Events this close (in words) are one: a sub-step. */
  subWords: 1,
  /** The least room an added change keeps from the changes beside it. */
  roomWords: 3,
  /** The soonest after a change another may come, in words (about a second). */
  nextWords: 2,
  /**
   * The latest word the opening's first change may land on, counted from
   * 0: its fourth word, which the voices (150 to 160 words a minute) begin
   * by about 1.2 seconds, so the change has settled by 1.5.
   */
  openingWords: 3,
  /** Seconds a word takes, for messages. */
  secondsPerWord: 0.5,
} as const;

/** Camera moves that always frame something new: they go somewhere. */
const GOES = new Set(['travel', 'cut-to', 'zoom-through', 'follow']);

/**
 * Whether a camera move frames a new subject: one that goes somewhere, or
 * a push in on something other than its shot's own subject. The frames
 * checker counts the same moves (frame-checks' reframes).
 */
export function reframes(
  move: Pick<PlanCamera, 'move' | 'target'>,
  shot: Pick<PlanShot, 'focal'>,
): boolean {
  if (GOES.has(move.move)) return true;
  return (
    move.move === 'push' && Boolean(move.target) && move.target !== shot.focal
  );
}

/** A plan's information event: where it lands, in the narration's keys, and the shot it is in. */
export interface PlanEvent {
  at: number;
  shot: number;
  kind: 'shot' | 'info' | 'camera';
}

/** Where each shot starts: the first time its words are said after the shot before's. */
export function shotStarts(plan: ShotPlan, n: Narration): number[] {
  let cursor = 0;
  return plan.shots.map((shot) => {
    const after = phraseAt(n, shot.on, cursor);
    const at = after >= 0 ? after : phraseAt(n, shot.on);
    if (at >= 0) cursor = Math.max(cursor, at);
    return at;
  });
}

/** Where a shot's change lands: its words after the shot's start, else anywhere. */
export const landingOf = (n: Narration, on: string, from: number) => {
  const after = phraseAt(n, on, Math.max(0, from));
  return after >= 0 ? after : phraseAt(n, on);
};

/** The plan's information events in order, a sub-step folded into the event before it. */
export function planEvents(plan: ShotPlan, n: Narration): PlanEvent[] {
  const starts = shotStarts(plan, n);
  const all: PlanEvent[] = [];
  plan.shots.forEach((shot, k) => {
    const from = starts[k];
    if (from < 0) return;
    all.push({ at: from, shot: k, kind: 'shot' });
    for (const info of shot.info) {
      const at = landingOf(n, info.on, from);
      if (at >= 0) all.push({ at, shot: k, kind: 'info' });
    }
    for (const move of shot.camera)
      if (reframes(move, shot)) {
        const at = landingOf(n, move.on, from);
        if (at >= 0) all.push({ at, shot: k, kind: 'camera' });
      }
  });
  all.sort((a, b) => a.at - b.at || a.shot - b.shot);
  const out: PlanEvent[] = [];
  for (const one of all)
    if (!out.length || one.at - out[out.length - 1].at > PLAN_PACE.subWords)
      out.push(one);
  return out;
}

/** A stretch with nothing new: from the event at `from` to the next at `to` (or the narration's end). */
export interface PlanGap {
  from: number;
  to: number;
  /** Its length in words, each pause between lines counted as a word. */
  words: number;
  /** The shot on screen through it. */
  shot: number;
}

/**
 * The plan's declared rests, on the narration's keys: each camera hold,
 * from its words to the shot's next camera move or the shot's end, as the
 * timing runs it (shot-time) and the frames checker excuses it
 * (frame-checks' shotHolds).
 */
export function planHolds(plan: ShotPlan, n: Narration): [number, number][] {
  const starts = shotStarts(plan, n);
  return plan.shots.flatMap((shot, k) => {
    const from = starts[k];
    if (from < 0) return [];
    const end = starts.slice(k + 1).find((s) => s > from) ?? n.keys.length;
    const moves = shot.camera
      .map((c) => ({ move: c.move, at: landingOf(n, c.on, from) }))
      .filter((c) => c.at >= from && c.at < end)
      .sort((a, b) => a.at - b.at);
    return moves.flatMap((c): [number, number][] => {
      if (c.move !== 'hold') return [];
      const next = moves.find((m) => m.at > c.at)?.at ?? end;
      return [[c.at, next]];
    });
  });
}

/**
 * The plan's stretches with nothing new longer than the pace allows:
 * between one event and the next, and from the last to the narration's
 * end, but for one a declared hold runs through at least half of (the
 * rules' "unless it is a declared hold", as the frames checker reads it).
 * `lineStarts` are the keys each line after the first starts at.
 */
export function planGaps(
  plan: ShotPlan,
  n: Narration,
  lineStarts: readonly number[] = [],
  most: number = PLAN_PACE.maxWords,
): PlanGap[] {
  const events = planEvents(plan, n);
  const holds = planHolds(plan, n);
  const held = (from: number, to: number) =>
    holds.some(
      ([a, b]) => Math.min(b, to) - Math.max(a, from) >= (to - from) / 2,
    );
  const marks = [...events.map((e) => e.at), n.keys.length];
  const out: PlanGap[] = [];
  for (let k = 0; k + 1 < marks.length; k += 1) {
    const [from, to] = [marks[k], marks[k + 1]];
    const words =
      to -
      from +
      PLAN_PACE.lineWords * lineStarts.filter((s) => s > from && s < to).length;
    if (words > most && !held(from, to))
      out.push({ from, to, words, shot: events[k].shot });
  }
  return out;
}

/** How far a plan's stretches with nothing new run past the pace, in words, together. */
export function stallWords(
  plan: ShotPlan,
  n: Narration,
  lineStarts: readonly number[] = [],
): number {
  return planGaps(plan, n, lineStarts).reduce(
    (sum, gap) => sum + gap.words - PLAN_PACE.maxWords,
    0,
  );
}

/**
 * The shots a plan could do without, its first aside: those whose going
 * leaves no longer stretch with nothing new than there is with them.
 */
export function spareShots(
  plan: ShotPlan,
  n: Narration,
  lineStarts: readonly number[] = [],
): number[] {
  const now = stallWords(plan, n, lineStarts);
  return plan.shots.flatMap((_, k) =>
    k > 0 &&
    stallWords(
      { shots: plan.shots.filter((__, i) => i !== k) },
      n,
      lineStarts,
    ) <= now
      ? [k]
      : [],
  );
}

/** An actor with only its moves before a word (`early`), or from it on. */
function movesOf(
  actor: PlanActor,
  before: (on: string) => boolean,
  early: boolean,
): PlanActor {
  const { moves: all, ...rest } = actor;
  const kept = (all ?? []).filter((m) => before(m.on) === early);
  return kept.length ? { ...rest, moves: kept } : rest;
}

/** Whether an actor has left before a word. */
const goneBy = (actor: PlanActor, before: (on: string) => boolean) =>
  (actor.moves ?? []).some(
    (m) => ['exit', 'leave'].includes(m.move) && before(m.on),
  );

/** Whether an actor is on before a word: there from the start, or come on by then. */
const thereBy = (actor: PlanActor, before: (on: string) => boolean) => {
  const enter = (actor.moves ?? []).find((m) => m.move === 'enter');
  return !enter || before(enter.on);
};

/** A shot moved onto other words: its own, and each of its changes that were on its words. */
export function onWords(shot: PlanShot, on: string): PlanShot {
  const was = shot.on;
  return {
    ...shot,
    on,
    info: shot.info.map((i) => (i.on === was ? { ...i, on } : i)),
    camera: shot.camera.map((c) => (c.on === was ? { ...c, on } : c)),
  };
}

/**
 * Another picture put over shot `k`'s words from `from` to `to` (in place,
 * in `shots`): the shot keeps what it brings on before `from`, where it
 * has words enough of its own before it to be read (else the picture
 * starts on the shot's own words); the picture holds from there; and the
 * shot goes on after `to` as its continuation, with what it brings on
 * from there, where it has room. What the shot brought on between goes,
 * or, with `keep`, comes on as its continuation begins. False, and
 * nothing changed, when the shot has no words or the picture would have
 * no room.
 */
export function replaceSpan(
  shots: PlanShot[],
  k: number,
  from: number,
  to: number,
  picture: PlanShot,
  n: Narration,
  keep = false,
): boolean {
  const starts = shotStarts({ shots }, n);
  const start = starts[k];
  if (start === undefined || start < 0) return false;
  const end = starts.slice(k + 1).find((s) => s > start) ?? n.keys.length;
  // Too few words of its own before it to be read: the picture takes them.
  const a = from - start < PLAN_PACE.roomWords ? start : from;
  const b = Math.min(to, end);
  if (b - a < PLAN_PACE.roomWords) return false;
  const shot = shots[k];
  const lands = (on: string) => landingOf(n, on, start);
  const beforeA = (on: string) => lands(on) < a;
  const beforeB = (on: string) => lands(on) < b;
  const between = (on: string) => !beforeA(on) && beforeB(on);
  const pieces: PlanShot[] = [];
  if (a > start)
    pieces.push({
      ...shot,
      info: shot.info.filter((i) => beforeA(i.on)),
      camera: shot.camera.filter((c) => beforeA(c.on)),
      actors: shot.actors
        .filter((x) => thereBy(x, beforeA))
        .map((x) => movesOf(x, beforeA, true)),
      join: 'cut',
    });
  const tail = end - b >= PLAN_PACE.roomWords;
  const spot = uniquePhrase(n, a, 3);
  pieces.push({
    ...onWords(
      picture,
      a === start ? shot.on : phraseText(n, spot.at, spot.length),
    ),
    join: tail ? 'cut' : shot.join,
  });
  if (tail) {
    const at = uniquePhrase(n, b, 3);
    const on = phraseText(n, at.at, at.length);
    const kept = (on: string) => !beforeB(on) || (keep && between(on));
    const moved = <T extends { on: string }>(x: T): T =>
      between(x.on) ? { ...x, on } : x;
    const info = shot.info.filter((i) => kept(i.on)).map(moved);
    // A map going on is framed on what it now brings on first.
    const subject =
      shot.set.kind === 'map'
        ? info.find((i) => i.target && !i.target.startsWith('part:'))?.target
        : undefined;
    pieces.push({
      ...shot,
      on,
      info,
      camera: shot.camera.filter((c) => !beforeB(c.on)),
      actors: shot.actors
        .filter((x) => !goneBy(x, beforeB))
        .map((x) => movesOf(x, beforeB, false)),
      join: shot.join,
      ...(subject ? { focal: subject } : {}),
    });
  }
  shots.splice(k, 1, ...pieces);
  return true;
}

/**
 * A picture cut into the plan where the voice names what it shows, at key
 * `at` (in place, in `shots`), within the pace's limits: it holds at
 * least a few words (PLAN_PACE.roomWords), until the next change of the
 * shot it cuts into, which then goes on (what that shot brought on in the
 * picture's first words coming on as it goes on); it starts on that
 * shot's own words when the name is said as the shot begins. False, and
 * nothing changed, when there is no shot there or no room for it.
 */
export function cutIn(
  shots: PlanShot[],
  at: number,
  picture: PlanShot,
  n: Narration,
): boolean {
  const starts = shotStarts({ shots }, n);
  let k = -1;
  starts.forEach((s, i) => {
    if (s >= 0 && s <= at && (k < 0 || s >= starts[k])) k = i;
  });
  if (k < 0) return false;
  const start = starts[k];
  const end = starts.slice(k + 1).find((s) => s > start) ?? n.keys.length;
  const from = at - start < PLAN_PACE.roomWords ? start : at;
  const shot = shots[k];
  const changes = [
    ...shot.info.map((i) => i.on),
    ...shot.camera.map((c) => c.on),
    ...shot.actors.flatMap((x) => (x.moves ?? []).map((m) => m.on)),
  ]
    .map((on) => landingOf(n, on, start))
    .filter((x) => x > from && x < end);
  const room = from + PLAN_PACE.roomWords;
  const later = changes.filter((x) => x >= room);
  // The shot goes on at its next change after the picture has been read;
  // one only in the picture's first words, as soon as it has been.
  const to = later.length ? Math.min(...later) : changes.length ? room : end;
  return replaceSpan(shots, k, from, to, picture, n, true);
}

/**
 * A shot with no room for another change goes on from where the change
 * lands as its continuation (in place, in `shots`): the same set, framed
 * on `subject` when given, bringing on what the shot brought on from
 * there; its people stay where they stand, and those who come on later
 * come on in it. With no change, the shot goes on from `at` with what it
 * brings on from there, so the shot before has room. False, and nothing
 * changed, when `at` is too near the shot's start or the continuation
 * would hold more than `most` pieces of information (or nothing at all).
 */
export function splitShot(
  shots: PlanShot[],
  k: number,
  at: number,
  change: PlanInfo | null,
  n: Narration,
  most: number,
  subject?: string,
): boolean {
  const shot = shots[k];
  const from = shotStarts({ shots }, n)[k];
  if (from < 0 || at - from < PLAN_PACE.nextWords) return false;
  const before = (on: string) => landingOf(n, on, from) < at;
  const later = shot.info.filter((i) => !before(i.on));
  if (later.length + (change ? 1 : 0) > most) return false;
  if (!change && !later.length) return false;
  const spot = uniquePhrase(n, at, 3);
  shots.splice(
    k,
    1,
    {
      ...shot,
      info: shot.info.filter((i) => before(i.on)),
      camera: shot.camera.filter((c) => before(c.on)),
      actors: shot.actors
        .filter((a) => thereBy(a, before))
        .map((a) => movesOf(a, before, true)),
      join: 'continue',
    },
    {
      on: change ? change.on : phraseText(n, spot.at, spot.length),
      set: shot.set,
      actors: shot.actors
        .filter((a) => !goneBy(a, before))
        .map((a) => movesOf(a, before, false)),
      info: change ? [change, ...later] : later,
      life: [...shot.life],
      camera: shot.camera.filter((c) => !before(c.on)),
      join: shot.join,
      focal: subject ?? shot.focal,
    },
  );
  return true;
}
