/**
 * A Studio film's scene as the player plays it (the client's timeline.ts,
 * whose timings and framings are kept here in step with it): when all it
 * plans has finished, which the film's edit holds on, and whether two
 * shots differ enough for a cut between them not to be a jump.
 */
import type {
  SceneDto,
  SceneEffectDto,
  ScenePlaceDto,
  SceneStepDto,
} from '../../contracts';
import { HELD_IN_MS, HELD_MOVES, actionDoing, doingOf } from './scene-doings';

/** The player's timings, in milliseconds. */
const MOVE_MS = 700;
const ENTER_MS = 520;
const EXIT_MS = 380;
const STAGGER_MS = 180;
const CLEAR_FIRST_MS = 190;
const POINT_MS = 1700;
const SWING_MS = 300;
const PULSE_MS = 700;
/**
 * A walk across the whole stage, and the shortest and longest walk: the
 * client's timeline.ts keeps the same. Slowed from 4 s a stage (and the
 * kit's planted stride lengthened: scene-dangles' PERSON_SWING), so a
 * grown-up walks about two strides a second, not four.
 */
export const WALK_STAGE_MS = 5200;
export const WALK_MIN_MS = 1300;
export const WALK_MAX_MS = 4400;

const walkMs = (dx: number, W: number) =>
  Math.min(
    WALK_MAX_MS,
    Math.max(WALK_MIN_MS, (Math.abs(dx) / W) * WALK_STAGE_MS),
  );

/**
 * How far into the floor a change of size is, in widths of the stage per
 * size's worth of change (studio-scenery-plan §4.3): the camera's lens
 * about as long as the stage is wide, so walking from the floor's back to
 * its front is about half a crossing. The client's WALK_DEPTH.
 */
export const WALK_DEPTH = 1;

/**
 * How far a walk goes on the floor, in the stage's units where the walker
 * is: across, and nearer or farther off, by how much bigger or smaller
 * they get (the client's walkLength). Between two places of one size, as
 * far as across.
 */
export function walkLength(
  from: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  to: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  W: number,
): number {
  const across = to.x + to.w / 2 - (from.x + from.w / 2);
  const mean = (from.h + to.h) / 2;
  const into =
    mean > 0 && Math.abs(to.h - from.h) > mean * 0.005
      ? (W * WALK_DEPTH * Math.abs(to.h - from.h)) / mean
      : 0;
  return into ? Math.hypot(across, into) : Math.abs(to.x - from.x);
}

/** How long a walk between two places takes, at a walk: by its true length on the floor. */
const walkBetween = (
  from: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  to: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  W: number,
) => walkMs(walkLength(from, to, W), W);
/** A run is this much quicker than a walk; and going in at a feature, this long to be gone there. */
export const RUN_PACE = 2.2;

/** How much quicker than a walk someone goes at a step: at a run, hurried, or at a walk. */
const paceAt = (step: SceneStepDto, id: string) =>
  step.pace?.[id] === 'run' || step.exit?.[id]?.how === 'run'
    ? RUN_PACE
    : Math.min(RUN_PACE, Math.max(1, step.hurry?.[id] ?? 1));
const VANISH_MS = 260;

/** Who comes on at step `k`, and who goes. */
const newcomersAt = (steps: readonly SceneStepDto[], k: number) =>
  steps[k].show.filter((id) => !steps[k - 1]?.show.includes(id));
const leaversAt = (steps: readonly SceneStepDto[], k: number) =>
  k > 0 ? steps[k - 1].show.filter((id) => !steps[k].show.includes(id)) : [];

/** When a newcomer starts to arrive: after whoever the step sends off, one after another. */
function entryStart(
  steps: readonly SceneStepDto[],
  k: number,
  id: string,
): number {
  const newcomers = newcomersAt(steps, k);
  const clearing = newcomers.length > 0 && leaversAt(steps, k).length > 0;
  return (
    steps[k].atMs +
    (clearing ? CLEAR_FIRST_MS : 0) +
    Math.max(0, newcomers.indexOf(id)) * STAGGER_MS
  );
}

/**
 * When everything a scene plans has finished, as the player plays it on
 * the wide stage: its last line, the last walk on or off, the last move
 * between places, the last acting move, cheer and effect. After the
 * voice's end where something is still going on when it stops.
 */
export function settledOf(
  scene: Pick<
    SceneDto,
    | 'beats'
    | 'durationMs'
    | 'steps'
    | 'effects'
    | 'acting'
    | 'setting'
    | 'stagings'
    | 'props'
  >,
): number {
  const { steps, stagings } = scene;
  const { w: W, places } = stagings.wide;
  const beats = scene.beats;
  let at = beats.length ? beats[beats.length - 1].endMs : scene.durationMs;
  const walks = (id: string) => scene.acting?.[id]?.walks === true;
  /** Where someone just off the stage stands: off the side given, else the nearer. */
  const offside = (place: ScenePlaceDto, side?: 'left' | 'right') =>
    (side ? side === 'left' : place.x + place.w / 2 < W / 2)
      ? -place.w * 1.02
      : W + place.w * 0.02;
  const pace = (step: SceneStepDto, id: string) => paceAt(step, id);
  /** A feature's way at the wide staging, and whether one going by it goes in there. */
  const wayOf = (via: string | undefined, how?: string) => {
    const feature = via
      ? scene.setting?.features?.find((f) => f.id === via)
      : undefined;
    if (!feature) return null;
    const way = feature.way.wide;
    const goesIn =
      how === 'squeeze' ||
      feature.kind === 'door' ||
      feature.kind === 'vehicle' ||
      feature.kind === 'window' ||
      way.k < 0.99;
    return { way, goesIn };
  };
  steps.forEach((step, k) => {
    at = Math.max(at, step.atMs);
    for (const id of newcomersAt(steps, k)) {
      const place = places[k]?.[id];
      const start = entryStart(steps, k, id);
      const entry = step.enter[id];
      const by = wayOf(entry?.via);
      const from = by
        ? by.way.x - (place?.w ?? 0) / 2
        : place
          ? offside(place, entry?.side)
          : 0;
      if (place && walks(id) && entry?.how !== 'fade')
        at = Math.max(
          at,
          start +
            walkBetween(
              by
                ? {
                    x: by.way.x - (place.w * by.way.k) / 2,
                    w: place.w * by.way.k,
                    h: place.h * by.way.k,
                  }
                : { ...place, x: from },
              place,
              W,
            ) /
              pace(step, id),
        );
      else at = Math.max(at, start + ENTER_MS);
    }
    for (const id of leaversAt(steps, k)) {
      const place = places[k - 1]?.[id];
      const exit = step.exit?.[id];
      const by = wayOf(exit?.via, exit?.how);
      if (place && walks(id) && !step.cut)
        at = Math.max(
          at,
          step.atMs +
            (by?.goesIn
              ? walkBetween(
                  place,
                  {
                    x: by.way.x - (place.w * by.way.k) / 2,
                    w: place.w * by.way.k,
                    h: place.h * by.way.k,
                  },
                  W,
                ) /
                  pace(step, id) +
                VANISH_MS
              : walkMs(offside(place, exit?.side) - place.x, W) /
                pace(step, id)),
        );
      else at = Math.max(at, step.atMs + EXIT_MS);
    }
    if (k > 0)
      for (const id of step.show) {
        const from = places[k - 1]?.[id];
        const to = places[k]?.[id];
        if (!from || !to || !steps[k - 1].show.includes(id)) continue;
        at = Math.max(
          at,
          step.atMs +
            (walks(id) && walkLength(from, to, W) > W * 0.02
              ? walkBetween(from, to, W) / pace(step, id)
              : MOVE_MS),
        );
      }
  });
  // Sitting or lying down is done once they are down: held there after,
  // it is no reason to wait.
  for (const acting of Object.values(scene.acting ?? {}))
    for (const [start, move, ms] of acting.moves ?? [])
      at = Math.max(
        at,
        start +
          ((HELD_MOVES as readonly string[]).includes(move)
            ? Math.min(ms, HELD_IN_MS)
            : ms),
      );
  for (const [start, , ms] of scene.setting?.crowd?.moves ?? [])
    at = Math.max(at, start + ms);
  // A gate swinging shut is seen to the end of its swing.
  for (const [start] of scene.setting?.featureStates ?? [])
    at = Math.max(at, start + SWING_MS);
  // A thing handled is done once its clip is: the drink after the moment
  // the cup reaches the lips.
  for (const prop of scene.props ?? [])
    for (const [moment, , does] of prop.does) {
      const doing = doingOf(actionDoing(does));
      if (doing) at = Math.max(at, moment + doing.idealMs * (1 - doing.keyAt));
    }
  for (const effect of scene.effects) {
    if (effect.do === 'zoom') continue;
    const span = effect.say
      ? effect.say.untilMs - effect.atMs
      : effect.do === 'point'
        ? POINT_MS
        : effect.do === 'pulse'
          ? PULSE_MS
          : 0;
    at = Math.max(at, effect.atMs + span);
  }
  return Math.round(at);
}

/**
 * How far along a walk someone is at a share of its time, as the player
 * eases it: setting off gently over its first 15%, steady, arriving
 * gently over its last 15% (the client's walkEase).
 */
export function walkEase(p: number): number {
  const a = 0.15;
  const v = 1 / (1 - a);
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (p < a) return (v * p * p) / (2 * a);
  if (p > 1 - a) return 1 - (v * (1 - p) * (1 - p)) / (2 * a);
  return v * (p - a / 2);
}

/** Someone walking on the wide stage: when, and the box they are in as they set off and as they get there. */
export interface StageWalk {
  id: string;
  from: number;
  to: number;
  start: ScenePlaceDto;
  end: ScenePlaceDto;
}

/**
 * Every walk the player plays on the wide stage: from one place to the
 * next, on from a side or out of a feature, off to a side or in at one.
 * Someone who does not walk (a card, a figure that pops) has none.
 */
export function walksOf(
  scene: Pick<SceneDto, 'steps' | 'stagings' | 'acting' | 'setting'>,
): StageWalk[] {
  const { steps } = scene;
  const { w: W, places } = scene.stagings.wide;
  const walks = (id: string) => scene.acting?.[id]?.walks === true;
  const feature = (id: string | undefined) =>
    id ? scene.setting?.features?.find((f) => f.id === id) : undefined;
  /** Someone at a feature's way: as big as they are there, their feet on its ground, in its middle. */
  const atWay = (
    place: ScenePlaceDto,
    way: { x: number; y: number; k: number },
  ): ScenePlaceDto => ({
    x: way.x - (place.w * way.k) / 2,
    y: way.y - place.h * way.k,
    w: place.w * way.k,
    h: place.h * way.k,
  });
  const goesIn = (f: NonNullable<ReturnType<typeof feature>>, how?: string) =>
    how === 'squeeze' ||
    f.enters === true ||
    f.kind === 'gate' ||
    f.kind === 'door' ||
    f.kind === 'vehicle' ||
    f.kind === 'window' ||
    f.way.wide.k < 0.99;
  const out: StageWalk[] = [];
  const walk = (
    id: string,
    from: number,
    start: ScenePlaceDto,
    end: ScenePlaceDto,
    pace: number,
  ) =>
    out.push({
      id,
      from,
      to: from + walkBetween(start, end, W) / pace,
      start,
      end,
    });
  steps.forEach((step, k) => {
    const prev = steps[k - 1];
    for (const id of step.show) {
      const at = places[k]?.[id];
      if (!at || !walks(id)) continue;
      if (prev?.show.includes(id)) {
        const was = places[k - 1]?.[id];
        if (was && walkLength(was, at, W) > W * 0.02)
          walk(id, step.atMs, was, at, paceAt(step, id));
      } else if (k && step.enter[id]?.how !== 'fade') {
        const entry = step.enter[id];
        const by = feature(entry?.via);
        const left = entry?.side
          ? entry.side === 'left'
          : at.x + at.w / 2 < W / 2;
        const off = by
          ? atWay(at, by.way.wide)
          : { ...at, x: left ? -at.w * 1.02 : W + at.w * 0.02 };
        walk(id, entryStart(steps, k, id), off, at, paceAt(step, id));
      }
    }
    if (!prev || step.cut) return;
    for (const id of prev.show) {
      const at = places[k - 1]?.[id];
      if (step.show.includes(id) || !at || !walks(id)) continue;
      const exit = step.exit?.[id];
      const by = feature(exit?.via);
      const left = exit ? exit.side === 'left' : at.x + at.w / 2 < W / 2;
      const off =
        by && goesIn(by, exit?.how)
          ? atWay(at, by.way.wide)
          : { ...at, x: left ? -at.w * 1.02 : W + at.w * 0.02 };
      walk(id, step.atMs, at, off, paceAt(step, id));
    }
  });
  return out;
}

/** How much longer than the time it has a walk may take before its walker hurries. */
const HURRY_SLACK_MS = 150;
/** A move that carries someone (a leap) begins this near the step that moves them: the player flies them there (its FLIGHT_SLACK_MS). */
const CARRIED_SLACK_MS = 250;
/** Hurried more than this, a walk is a run. */
const HURRY_MOST = 1.35;
/** How far a walk may set off before its step, into the end of the line before it, rather than be hurried: by one not speaking then. */
const EARLY_MOST_MS = 1000;
/** Mouth shapes a second, as the acting sends them. */
const MOUTH_RATE = 30;

/**
 * Who hurries at each step, as the player plays it on the wide stage: one
 * who walks to a new place when the next thing they do (a thing reached
 * for, a move, their next walk or going off) comes sooner than the walk
 * there takes sets off earlier, into the end of the line before, when
 * they are not the one saying it and nothing else changes at the step;
 * and, still short of time, goes briskly, as much quicker as it needs, or
 * at a run, so no one takes up a cup before they reach it, nor sets off
 * again before they arrive. Steps no one need hurry at are as they were.
 */
export function hurried(
  scene: Pick<SceneDto, 'steps' | 'stagings' | 'acting' | 'props'>,
): SceneStepDto[] {
  const { steps } = scene;
  const { w: W, places } = scene.stagings.wide;
  const walks = (id: string) => scene.acting?.[id]?.walks === true;
  /** When each one begins each thing they do (a hand going to a thing, a move), and when it is done. */
  const doings = new Map<string, [number, number][]>();
  const begins = (id: string, at: number, end: number) =>
    doings.set(id, [...(doings.get(id) ?? []), [at, end]]);
  for (const prop of scene.props ?? [])
    for (const [moment, who, does] of prop.does) {
      const doing = doingOf(actionDoing(does));
      begins(
        who,
        moment - (doing ? doing.idealMs * doing.keyAt : 0),
        moment + (doing ? doing.idealMs * (1 - doing.keyAt) : 0),
      );
    }
  for (const [id, acting] of Object.entries(scene.acting ?? {}))
    for (const [start, move, ms] of acting.moves ?? [])
      begins(
        id,
        start,
        start +
          ((HELD_MOVES as readonly string[]).includes(move)
            ? Math.min(ms, HELD_IN_MS)
            : ms),
      );
  /** Whether a move of someone's that carries them (a leap, a landing) begins as a step does: the step is the move's, not a walk. */
  const carried = (id: string, at: number) =>
    (scene.acting?.[id]?.moves ?? []).some(
      ([start, move]) =>
        doingOf(move)?.carries && Math.abs(start - at) <= CARRIED_SLACK_MS,
    );
  /** When someone is speaking, from and to: as their mouth moves. */
  const says = (id: string): [number, number][] =>
    (scene.acting?.[id]?.mouth ?? []).map(([start, shapes]) => [
      start,
      start + (shapes.length * 1000) / MOUTH_RATE,
    ]);
  const moved = (id: string, k: number) => {
    const from = places[k - 1]?.[id];
    const to = places[k]?.[id];
    return Boolean(from && to && walkLength(from, to, W) > W * 0.02);
  };
  /** When each one who walked arrives, as the steps are timed so far. */
  const arrives = new Map<string, number>();
  const out: SceneStepDto[] = [];
  steps.forEach((step, k) => {
    if (!k) {
      out.push(step);
      return;
    }
    const prev = out[k - 1];
    /** Whoever walks to a new place at this step, at a walk: not one a move of theirs carries there (a leap onto the wall), which keeps its time. */
    const walkers = step.show.filter(
      (id) =>
        paceAt(step, id) <= 1 &&
        walks(id) &&
        steps[k - 1].show.includes(id) &&
        moved(id, k) &&
        !carried(id, step.atMs),
    );
    /** The next time each is moved or goes, or does anything, after the step. */
    const nextOf = (id: string, at: number) => {
      const to = places[k]?.[id];
      let next = Infinity;
      for (let j = k + 1; j < steps.length; j += 1) {
        const there = places[j]?.[id];
        if (
          !steps[j].show.includes(id) ||
          !there ||
          !to ||
          walkLength(to, there, W) > W * 0.02
        ) {
          next = steps[j].atMs;
          break;
        }
      }
      for (const [begin] of doings.get(id) ?? [])
        if (begin > at && begin < next) next = begin;
      return next;
    };
    const walkOf = (id: string) =>
      walkBetween(places[k - 1][id], places[k][id], W);
    // Set off sooner, into the end of the line before: when those who
    // walk are all that changes at the step, and none of them is speaking,
    // doing anything else, or still on their way from before.
    let atMs = step.atMs;
    const short = Math.max(
      0,
      ...walkers.map(
        (id) => walkOf(id) - (nextOf(id, atMs) - atMs + HURRY_SLACK_MS),
      ),
    );
    const onlyWalks =
      walkers.length > 0 &&
      !step.cut &&
      step.layout === prev.layout &&
      step.backdrop === prev.backdrop &&
      newcomersAt(steps, k).length === 0 &&
      leaversAt(steps, k).length === 0 &&
      step.show.every((id) => walkers.includes(id) || !moved(id, k));
    if (short > 0 && onlyWalks) {
      let earliest = Math.max(prev.atMs + MOVE_MS, step.atMs - EARLY_MOST_MS);
      for (const id of walkers) {
        earliest = Math.max(earliest, arrives.get(id) ?? -Infinity);
        for (const [from, to] of [...(doings.get(id) ?? []), ...says(id)])
          if (from < step.atMs && to > earliest)
            earliest = Math.max(earliest, to);
      }
      atMs = Math.round(
        step.atMs - Math.max(0, Math.min(short, step.atMs - earliest)),
      );
    }
    let pace = step.pace;
    let hurry = step.hurry;
    for (const id of step.show) {
      if (
        paceAt(step, id) > 1 ||
        !walks(id) ||
        !steps[k - 1].show.includes(id) ||
        !moved(id, k)
      )
        continue;
      const quicker =
        walkOf(id) / Math.max(1, nextOf(id, atMs) - atMs + HURRY_SLACK_MS);
      if (quicker > HURRY_MOST) pace = { ...pace, [id]: 'run' };
      else if (quicker > 1)
        hurry = { ...hurry, [id]: Math.ceil(quicker * 100) / 100 };
    }
    const timed =
      pace === step.pace && hurry === step.hurry && atMs === step.atMs
        ? step
        : {
            ...step,
            atMs,
            ...(pace ? { pace } : {}),
            ...(hurry ? { hurry } : {}),
          };
    for (const id of step.show)
      if (walks(id) && steps[k - 1].show.includes(id) && moved(id, k))
        arrives.set(id, atMs + walkOf(id) / paceAt(timed, id));
    out.push(timed);
  });
  return out;
}

// ── Shots ──────────────────────────────────────────────────────────────────

/** Where the camera looks: how close, and the middle of the view. */
export interface View {
  s: number;
  x: number;
  y: number;
}

/** A cut changes the picture by at least this much, in scale or in where it looks (in widths of the wider view); less is a jump cut. */
export const CUT_SCALE = 1.25;
export const CUT_CENTRE = 0.2;

/**
 * A set wider than the frame, as the camera may pan across it (studio-
 * scenery-plan §6): how far past the frame it runs, left and right, and
 * where the action is, in the stage's units. A set one frame wide has no
 * room, and its camera never pans. The player's setSpanOf.
 */
export interface SetRoom {
  span: [number, number];
  focal: number | null;
}
export const NO_ROOM: SetRoom = { span: [0, 0], focal: null };
/** The frame a set is laid out in, in its units: its middle, on a wider one. */
export const FRAME_W = 1600;
export const FRAME_H = 900;

/** The room a set of `setWidth` (its focal a share of the frame) gives a camera on a stage W × H, the set covering the stage. */
export function roomOf(
  set: { setWidth?: number; focal?: number } | null | undefined,
  W: number,
  H: number,
): SetRoom {
  const k = Math.max(W / FRAME_W, H / FRAME_H);
  const left = (W - FRAME_W * k) / 2;
  const focal =
    set?.focal !== undefined ? left + set.focal * FRAME_W * k : null;
  if (!set?.setWidth || set.setWidth <= FRAME_W + 1)
    return { span: [0, 0], focal };
  const side = ((set.setWidth - FRAME_W) / 2) * k - left;
  return { span: [side, side], focal };
}

/**
 * A view kept inside the set: never wider than the frame, never past the
 * set's edge. On a set one frame wide, inside the stage.
 */
function settle(
  view: View,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): View {
  const s = Math.max(1, view.s);
  const hw = W / (2 * s);
  const hh = H / (2 * s);
  return {
    s,
    x: Math.min(W + span[1] - hw, Math.max(hw - span[0], view.x)),
    y: Math.min(H - hh, Math.max(hh, view.y)),
  };
}

/** The most room kept between the people and the frame's edge in the wide shot, as a share of the frame. */
export const WIDE_ROOM = 0.04;

/**
 * The wide shot on a set wider than the frame (§6.3): centred on where
 * the action is, as far as that keeps everyone on the stage in it with a
 * little room; centred on them where they will not all fit. On a set one
 * frame wide, the whole stage. The player's wideX.
 */
export function wideView(
  show: readonly string[],
  places: Record<string, ScenePlaceDto>,
  W: number,
  H: number,
  room: SetRoom = NO_ROOM,
): View {
  const [L, R] = room.span;
  if (L <= 0 && R <= 0) return { s: 1, x: W / 2, y: H / 2 };
  const people = show.flatMap((id) => {
    const p = places[id];
    return p && !id.startsWith('@') && p.w <= W * 0.6 ? [p] : [];
  });
  const want = room.focal ?? W / 2;
  let x = want;
  if (people.length) {
    const m = W * WIDE_ROOM;
    const lo = Math.max(...people.map((p) => p.x + p.w)) + m - W / 2;
    const hi = Math.min(...people.map((p) => p.x)) - m + W / 2;
    x = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, want));
  }
  return settle({ s: 1, x, y: H / 2 }, W, H, room.span);
}

/**
 * Where a shot looks, from where the stage stands everyone: the whole
 * stage (a zoom of null); one person from the chest up; or two together
 * from the knees up, as a film frames them. The player also keeps a
 * neighbour from being cut in half, which this leaves out.
 */
export function viewOf(
  shot: Pick<SceneEffectDto, 'target' | 'part'> | null,
  show: readonly string[],
  places: Record<string, ScenePlaceDto>,
  W: number,
  H: number,
  room: SetRoom = NO_ROOM,
): View {
  const wide = wideView(show, places, W, H, room);
  const placed = (id: string | null) =>
    id && show.includes(id) ? places[id] : undefined;
  const one = shot ? placed(shot.target) : undefined;
  if (!shot || !one) return wide;
  const two = placed(shot.part);
  if (two) {
    const x0 = Math.min(one.x, two.x);
    const y0 = Math.min(one.y, two.y);
    const x1 = Math.max(one.x + one.w, two.x + two.w);
    const y1 = Math.max(one.y + one.h * 0.7, two.y + two.h * 0.7);
    return settle(
      {
        s: Math.max(
          1,
          Math.min((0.86 * W) / (x1 - x0), (0.86 * H) / (y1 - y0), 1.8),
        ),
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
      },
      W,
      H,
      room.span,
    );
  }
  return settle(
    {
      s: Math.max(
        1,
        Math.min((0.78 * W) / one.w, (0.78 * H) / (one.h * 0.6), 2),
      ),
      x: one.x + one.w / 2,
      y: one.y + one.h * 0.3,
    },
    W,
    H,
    room.span,
  );
}

/** How much less the scenery moves than the stage in front of it as the camera moves: the player's PARALLAX. */
export const PARALLAX = 0.4;

/**
 * Where what stands on the stage shows against the scenery behind it
 * while the camera is on `view`, in the scenery's own place on the stage,
 * and how much larger: the scenery is scaled less about the same point
 * (the player's sceneryCamera), so close in, the stage's people are
 * larger against it and further across it.
 */
export function againstScenery(
  view: View,
  W: number,
  H: number,
): { k: number; at: (x: number, y: number) => [number, number] } {
  const far = 1 + (view.s - 1) * PARALLAX;
  return {
    k: view.s / far,
    at: (x, y) => [
      (view.s * x + (1 - PARALLAX) * (W / 2 - view.s * view.x)) / far,
      (view.s * y + (1 - PARALLAX) * (H / 2 - view.s * view.y)) / far,
    ],
  };
}

/** Whether a cut from one view to the other changes the picture enough not to be a jump. */
export function apart(a: View, b: View, W: number, H: number): boolean {
  const scale = Math.max(a.s, b.s) / Math.min(a.s, b.s);
  const shift =
    Math.hypot((a.x - b.x) / W, (a.y - b.y) / H) * Math.min(a.s, b.s);
  return scale >= CUT_SCALE || shift >= CUT_CENTRE;
}

/**
 * A directed scene's shots with no jump cut in them. Between them the
 * camera is on the whole stage. Where a shot would barely change the
 * picture from what is on the screen as it comes (a quarter in scale, a
 * fifth of the view in where it looks), what is on the screen holds
 * through it: the shot before runs on over it, or, on the whole stage,
 * the shot is not taken. A shot whose going back to the whole stage would
 * be a jump runs on to the next instead. Each is judged where the stage
 * stands everyone at that moment. Returns the shots kept, as copies.
 */
export function withoutJumps(
  shots: readonly SceneEffectDto[],
  steps: readonly SceneStepDto[],
  wide: {
    w: number;
    h: number;
    places: Record<string, ScenePlaceDto>[];
    /** On a set wider than the frame, the room its camera pans in: the wide shot is on where the action is. */
    room?: SetRoom;
  },
  durationMs: number,
): SceneEffectDto[] {
  const { w: W, h: H, places, room = NO_ROOM } = wide;
  /** Where a shot (null: the whole stage) looks at `t`. */
  const view = (shot: SceneEffectDto | null, t: number) => {
    let k = 0;
    steps.forEach((step, i) => {
      if (step.atMs <= t) k = i;
    });
    return viewOf(shot, steps[k]?.show ?? [], places[k] ?? {}, W, H, room);
  };
  const endOf = (shot: SceneEffectDto) => shot.untilMs ?? durationMs;
  /** Whether a shot going back to the whole stage at its end is a real cut. */
  const leaves = (shot: SceneEffectDto) =>
    apart(view(shot, endOf(shot) - 1), view(null, endOf(shot)), W, H);
  const kept: SceneEffectDto[] = [];
  for (const shot of [...shots].sort((a, b) => a.atMs - b.atMs)) {
    const t = shot.atMs;
    const last = kept[kept.length - 1];
    let now: SceneEffectDto | null = null;
    if (last && endOf(last) >= t) now = last;
    else if (last && !leaves(last)) {
      last.untilMs = t;
      now = last;
    }
    if (apart(view(now, t), view(shot, t), W, H)) kept.push({ ...shot });
    else if (now) now.untilMs = Math.max(endOf(now), endOf(shot));
  }
  const last = kept[kept.length - 1];
  if (last && endOf(last) < durationMs && !leaves(last))
    last.untilMs = durationMs;
  return kept;
}
