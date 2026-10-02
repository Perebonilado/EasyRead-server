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
import { phraseAt, type Narration } from './shot-phrases';

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
  /** The latest word the opening's first change may land on (about 1.5 seconds in). */
  openingWords: 4,
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
 * The plan's stretches with nothing new longer than the pace allows:
 * between one event and the next, and from the last to the narration's
 * end. `lineStarts` are the keys each line after the first starts at.
 */
export function planGaps(
  plan: ShotPlan,
  n: Narration,
  lineStarts: readonly number[] = [],
  most: number = PLAN_PACE.maxWords,
): PlanGap[] {
  const events = planEvents(plan, n);
  const marks = [...events.map((e) => e.at), n.keys.length];
  const out: PlanGap[] = [];
  for (let k = 0; k + 1 < marks.length; k += 1) {
    const [from, to] = [marks[k], marks[k + 1]];
    const words =
      to -
      from +
      PLAN_PACE.lineWords * lineStarts.filter((s) => s > from && s < to).length;
    if (words > most) out.push({ from, to, words, shot: events[k].shot });
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

/**
 * A shot with no room for another change goes on from where the change
 * lands as its continuation (in place, in `shots`): the same set, framed
 * on `subject` when given, bringing on what the shot brought on from
 * there; its people stay where they stand, and those who come on later
 * come on in it. False, and nothing changed, when the change lands too
 * near the shot's start or the continuation would hold more than
 * `most` pieces of information.
 */
export function splitShot(
  shots: PlanShot[],
  k: number,
  at: number,
  change: PlanInfo,
  n: Narration,
  most: number,
  subject?: string,
): boolean {
  const shot = shots[k];
  const from = shotStarts({ shots }, n)[k];
  if (from < 0 || at - from < PLAN_PACE.nextWords) return false;
  const before = (on: string) => landingOf(n, on, from) < at;
  const later = shot.info.filter((i) => !before(i.on));
  if (later.length >= most) return false;
  /** An actor with only its moves before the change (early), or from it on. */
  const keep = (a: PlanActor, early: boolean): PlanActor => {
    const { moves: all, ...rest } = a;
    const kept = (all ?? []).filter((m) => before(m.on) === early);
    return kept.length ? { ...rest, moves: kept } : rest;
  };
  const gone = (a: PlanActor) =>
    (a.moves ?? []).some(
      (m) => ['exit', 'leave'].includes(m.move) && before(m.on),
    );
  const comes = (a: PlanActor) =>
    (a.moves ?? []).find((m) => m.move === 'enter');
  const there = (a: PlanActor) => {
    const enter = comes(a);
    return !enter || before(enter.on);
  };
  shots.splice(
    k,
    1,
    {
      ...shot,
      info: shot.info.filter((i) => before(i.on)),
      camera: shot.camera.filter((c) => before(c.on)),
      actors: shot.actors.filter(there).map((a) => keep(a, true)),
      join: 'continue',
    },
    {
      on: change.on,
      set: shot.set,
      actors: shot.actors.filter((a) => !gone(a)).map((a) => keep(a, false)),
      info: [change, ...later],
      life: [...shot.life],
      camera: shot.camera.filter((c) => !before(c.on)),
      join: shot.join,
      focal: subject ?? shot.focal,
    },
  );
  return true;
}
