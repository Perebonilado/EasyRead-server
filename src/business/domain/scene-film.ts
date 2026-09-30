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
  ScenePropDto,
  SceneStepDto,
  SceneThingDto,
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

/** A scene's walking pace: a walk across the whole stage, and its shortest and longest (SceneDto.walk). */
export interface WalkPace {
  stageMs: number;
  minMs: number;
  maxMs: number;
}
const WALK_PACE: WalkPace = {
  stageMs: WALK_STAGE_MS,
  minMs: WALK_MIN_MS,
  maxMs: WALK_MAX_MS,
};

const walkMs = (dx: number, W: number, pace: WalkPace = WALK_PACE) =>
  Math.min(pace.maxMs, Math.max(pace.minMs, (Math.abs(dx) / W) * pace.stageMs));

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

/**
 * How long a walk between two places takes, at a walk: by its true length
 * on the floor, round whoever it goes round (the place's via) where it
 * bends. The client's walkBetween.
 */
export const walkBetween = (
  from: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  to: Pick<ScenePlaceDto, 'x' | 'w' | 'h' | 'via'>,
  W: number,
  pace: WalkPace = WALK_PACE,
) =>
  walkMs(pathLength(from, to, W), W, pace);

/** How far a walk goes on the floor: straight, or leg by leg through its via. */
export function pathLength(
  from: Pick<ScenePlaceDto, 'x' | 'w' | 'h'>,
  to: Pick<ScenePlaceDto, 'x' | 'w' | 'h' | 'via'>,
  W: number,
): number {
  const points = [from, ...(to.via ?? []), to];
  let out = 0;
  for (let i = 1; i < points.length; i += 1)
    out += walkLength(points[i - 1], points[i], W);
  return out;
}

/**
 * Where someone is along a walk at a share `p` of its time, eased as the
 * player eases it: straight from one place to the next; or, round someone
 * in the way, leg by leg through its via at one pace, each place on the
 * way reached when as much of the walk is done as the legs before it are
 * of the whole. The client's pathPlace.
 */
export function pathPlace(
  from: ScenePlaceDto,
  to: ScenePlaceDto,
  p: number,
  W = FRAME_W,
): ScenePlaceDto {
  const u = walkEase(Math.min(1, Math.max(0, p)));
  const { via, ...end } = to;
  const mix = (
    a: Pick<ScenePlaceDto, 'x' | 'y' | 'w' | 'h' | 'd'>,
    b: Pick<ScenePlaceDto, 'x' | 'y' | 'w' | 'h' | 'd'>,
    q: number,
  ): ScenePlaceDto => ({
    ...end,
    x: a.x + (b.x - a.x) * q,
    y: a.y + (b.y - a.y) * q,
    w: a.w + (b.w - a.w) * q,
    h: a.h + (b.h - a.h) * q,
    ...(a.d !== undefined && b.d !== undefined
      ? { d: a.d + (b.d - a.d) * q }
      : {}),
  });
  if (!via?.length) return mix(from, end, u);
  const points = [from, ...via, end];
  const legs = points
    .slice(1)
    .map((point, i) => walkLength(points[i], point, W));
  const whole = legs.reduce((n, leg) => n + leg, 0);
  let gone = u * whole;
  for (let i = 0; i < legs.length; i += 1) {
    if (gone <= legs[i] || i === legs.length - 1)
      return mix(
        points[i],
        points[i + 1],
        Math.min(1, gone / Math.max(1e-6, legs[i])),
      );
    gone -= legs[i];
  }
  return mix(from, end, u);
}
/** A run is this much quicker than a walk; and going in at a feature, this long to be gone there. */
export const RUN_PACE = 2.2;

/** How much quicker than a walk someone goes at a step: at a run, hurried, or at a walk. */
const paceAt = (step: SceneStepDto, id: string) =>
  step.pace?.[id] === 'run' || step.exit?.[id]?.how === 'run'
    ? RUN_PACE
    : Math.min(RUN_PACE, Math.max(1, step.hurry?.[id] ?? 1));
const VANISH_MS = 260;
/** The interactions that carry someone to their step's new place, or on or off the stage (scene-interact's CARRIES): the player moves them, not a walk. */
const CARRIES_AT: ReadonlySet<string> = new Set([
  'go-through',
  'come-through',
  'climb-stairs',
  'climb-ladder',
]);

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
  /** Whether someone's interaction carries them at a step's moment (through a door, up the stairs): it, not a walk, moves them. */
  const carriedBy = (id: string, t: number) =>
    (scene.acting?.[id]?.interact ?? []).some(
      (one) => CARRIES_AT.has(one.does) && Math.abs(one.at - t) <= 60,
    );
  steps.forEach((step, k) => {
    at = Math.max(at, step.atMs);
    for (const id of newcomersAt(steps, k)) {
      if (carriedBy(id, step.atMs)) continue;
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
      if (exit?.how === 'through' || carriedBy(id, step.atMs)) continue;
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
        if (carriedBy(id, step.atMs)) continue;
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
  // What someone does with a thing of the set, to its last step; and a
  // light switched, a door swung by it, seen.
  for (const acting of Object.values(scene.acting ?? {}))
    for (const one of acting.interact ?? [])
      for (const [, start, ms] of one.steps) at = Math.max(at, start + ms);
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
  /** Whether someone's interaction carries them at a step's moment (through a door, up the stairs): no walk of the step's. */
  const carriedBy = (id: string, t: number) =>
    (scene.acting?.[id]?.interact ?? []).some(
      (one) => CARRIES_AT.has(one.does) && Math.abs(one.at - t) <= 60,
    );
  steps.forEach((step, k) => {
    const prev = steps[k - 1];
    for (const id of step.show) {
      const at = places[k]?.[id];
      if (!at || !walks(id) || carriedBy(id, step.atMs)) continue;
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
      if (exit?.how === 'through' || carriedBy(id, step.atMs)) continue;
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
  // What they do with a thing of the set: they are there before it begins.
  for (const [id, acting] of Object.entries(scene.acting ?? {}))
    for (const one of acting.interact ?? [])
      begins(
        id,
        one.at,
        one.steps.reduce((end, [, at, ms]) => Math.max(end, at + ms), one.at),
      );
  /** Whether a move of someone's that carries them (a leap, a landing) begins as a step does: the step is the move's, not a walk. */
  const carried = (id: string, at: number) =>
    (scene.acting?.[id]?.moves ?? []).some(
      ([start, move]) =>
        doingOf(move)?.carries && Math.abs(start - at) <= CARRIED_SLACK_MS,
    ) ||
    (scene.acting?.[id]?.interact ?? []).some(
      (one) =>
        CARRIES_AT.has(one.does) && Math.abs(one.at - at) <= CARRIED_SLACK_MS,
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
        !moved(id, k) ||
        carried(id, step.atMs)
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
  shot: ShotLike | null,
  show: readonly string[],
  places: Record<string, ScenePlaceDto>,
  W: number,
  H: number,
  room: SetRoom = NO_ROOM,
): View {
  // An insert on a thing alone: where it is as it begins.
  if (shot?.shot?.kind === 'insert' && shot.shot.box) {
    const [x, y, w, h] = shot.shot.box;
    return insertView({ x, y, w, h }, W, H, room.span);
  }
  // From the place's other side: the stage reflected, the room too.
  if (shot && isReverse(shot)) {
    const turned = reflectPlaces(places, W);
    const other = reflectRoom(room, W);
    const kind = shot.shot?.kind;
    const one = show.includes(shot.target) ? turned[shot.target] : undefined;
    const two =
      shot.part && show.includes(shot.part) ? turned[shot.part] : undefined;
    if (kind === 'ots' && one && two)
      return otsView(one, two, W, H, other.span, pairSide(shot, places));
    if (kind === 'crowd' && one) return crowdReverseView(one, W, H, other.span);
    return viewOf(frontOf(shot), show, turned, W, H, other);
  }
  const wide = wideView(show, places, W, H, room);
  const placed = (id: string | null) =>
    id && show.includes(id) ? places[id] : undefined;
  const one = shot ? placed(shot.target) : undefined;
  if (!shot || !one) return wide;
  const two = placed(shot.part);
  const kind = shot.shot?.kind;
  if (kind === 'ots' && two) return otsView(one, two, W, H, room.span);
  if (kind === 'crowd') return crowdView(one, W, H, room.span);
  if (kind === 'deep') {
    const deep = deepView(shot.target, show, places, W, H, room.span);
    if (deep) return deep.view;
  }
  if (!kind && !two && shot.shot?.angle === 'low')
    return lowView(one, W, H, room.span);
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

// ── The shot grammar (studio-views-plan §3) ────────────────────────────────

/** What frames a shot: whom it is on, with whom, and its grammar. */
export type ShotLike = Pick<SceneEffectDto, 'target' | 'part'> &
  Partial<Pick<SceneEffectDto, 'shot'>>;

/**
 * Over the shoulder (the player's own, shots.ts): the one speaking is
 * framed from the chest up, their top three fifths filling OTS_FILL of the
 * frame's height (no nearer than OTS_LEAST, no closer than OTS_MOST), and
 * OTS_OFFSET of the frame's width off its middle, away from the one near.
 */
export const OTS_FILL = 0.62;
export const OTS_LEAST = 1.3;
export const OTS_MOST = 2.2;
export const OTS_OFFSET = 0.16;
/**
 * The one near the camera in a shot over their shoulder, on the screen:
 * this tall (a share of the frame's height, so cropped at its foot), their
 * middle this far in from the frame's edge (a share of its width) and the
 * top of their box this far down; and at least this far clear of the face
 * of whoever the shot is on, stepping further off the frame's edge for it,
 * at most until NEAR_OFF_MOST of them is off it.
 */
export const NEAR_TALL = 1.3;
export const NEAR_EDGE = 0.06;
export const NEAR_TOP = 0.1;
export const NEAR_CLEAR = 0.02;
export const NEAR_OFF_MOST = 0.6;
/** How far into the floor the one near the camera stands: before its front edge (studio-views-plan §3.1, d > 1). */
export const NEAR_D = 1.2;
/**
 * Deep staging (Richard's kitchen): the one near the camera this tall on
 * the screen, their middle this far in from the frame's edge; the others
 * behind at their places, framed together at most this close, their
 * middle this share of the frame off its middle, away from the one near.
 */
export const DEEP_TALL = 0.95;
export const DEEP_EDGE = 0.1;
export const DEEP_TOP = 0.1;
export const DEEP_MOST = 1.25;
export const DEEP_OFFSET = 0.14;
/** Over the crowd: this close, the one speaking with the top of their head this far down the frame, the rows before the camera below them. */
export const CROWD_SCALE = 1.35;
export const CROWD_HEAD = 0.28;

const middleOf = (p: Pick<ScenePlaceDto, 'x' | 'w'>) => p.x + p.w / 2;
/** Someone's face in their box: the kit's head, high in the middle (scene-faces-seen's faceOf). */
const faceIn = (p: Pick<ScenePlaceDto, 'x' | 'y' | 'w' | 'h'>) => ({
  x: p.x + p.w * 0.3,
  y: p.y + p.h * 0.03,
  w: p.w * 0.4,
  h: p.h * 0.2,
});

/**
 * Over the shoulder of `near` onto `one`: where the camera looks. `dir`
 * is the side of the frame the one it is on is at from the one near (1:
 * to the right), where the two keep the sides they had elsewhere (a
 * reverse shot, §4.2); absent, from where they stand.
 */
export function otsView(
  one: ScenePlaceDto,
  near: ScenePlaceDto,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
  dir: -1 | 1 = (Math.sign(middleOf(one) - middleOf(near)) || 1) as -1 | 1,
): View {
  const s = Math.min(
    OTS_MOST,
    Math.max(OTS_LEAST, (OTS_FILL * H) / (one.h * 0.62)),
  );
  return settle(
    {
      s,
      x: middleOf(one) - (dir * OTS_OFFSET * W) / s,
      y: one.y + one.h * 0.3,
    },
    W,
    H,
    span,
  );
}

// ── The reverse (studio-views-plan §4.2) ───────────────────────────────────

/** Whether a shot is taken from the place's other side, the camera turned round. */
export const isReverse = (shot: ShotLike | null | undefined): boolean =>
  shot?.shot?.reverse === true;

/** A shot as the front would take it: the same, not turned round. */
function frontOf(shot: ShotLike): ShotLike {
  if (!shot.shot) return shot;
  const { reverse, ...rest } = shot.shot;
  void reverse;
  return { ...shot, shot: rest };
}

/** A place on the stage as a camera turned round sees it: across the other way (W − x − w), at the same depth. */
export function reflectPlace<T extends Pick<ScenePlaceDto, 'x' | 'w'>>(
  place: T,
  W: number,
): T {
  return { ...place, x: Math.round((W - place.x - place.w) * 10) / 10 };
}

/** Every place of a step reflected so. */
export function reflectPlaces<T extends Pick<ScenePlaceDto, 'x' | 'w'>>(
  places: Record<string, T>,
  W: number,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(places).map(([id, p]) => [id, reflectPlace(p, W)]),
  );
}

/** The room a set wider than the frame gives its camera, seen from its other side: its edges swapped, where its action is across the other way. */
export function reflectRoom(room: SetRoom, W: number): SetRoom {
  return {
    span: [room.span[1], room.span[0]],
    focal: room.focal === null ? null : W - room.focal,
  };
}

/**
 * The side of the frame a shot of two keeps the one it is on at, from the
 * other (1: to the right), as they stand seen from the front: over the
 * shoulder from either side of the place, the two keep the sides they
 * have from the front (the 180° rule, §3.3). A cartoon's cheat: turned
 * round, the camera stands on the same side of the line between them.
 */
export function pairSide(
  shot: ShotLike,
  places: Record<string, Pick<ScenePlaceDto, 'x' | 'w'>>,
): -1 | 1 {
  const one = places[shot.target];
  const two = shot.part ? places[shot.part] : undefined;
  if (!one || !two) return 1;
  return (Math.sign(middleOf(one) - middleOf(two)) || 1) as -1 | 1;
}

/** From the stage onto the people watching, across the floor, on the other side: this close, and this far down the frame. */
export const CROWD_REVERSE_SCALE = 1.2;
export const CROWD_REVERSE_Y = 0.44;

/**
 * The crowd's view the other way (§4.2): from behind `one`, who speaks to
 * them, onto the people watching across the floor, facing us. Where the
 * camera looks, on the stage reflected.
 */
export function crowdReverseView(
  one: ScenePlaceDto,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): View {
  const s = CROWD_REVERSE_SCALE;
  // A little off the middle, away from the one it looks past.
  const away = middleOf(one) <= W / 2 ? 1 : -1;
  return settle(
    { s, x: W / 2 + (away * 0.1 * W) / s, y: H * CROWD_REVERSE_Y },
    W,
    H,
    span,
  );
}

/** Over the crowd onto `one`, who speaks to them: where the camera looks. */
export function crowdView(
  one: ScenePlaceDto,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): View {
  const s = Math.max(1, Math.min(CROWD_SCALE, (0.8 * W) / one.w));
  return settle(
    { s, x: middleOf(one), y: one.y + ((0.5 - CROWD_HEAD) * H) / s },
    W,
    H,
    span,
  );
}

/** A low angle on one alone frames them whole, at most this close. */
export const LOW_MOST = 1.6;

/** A low angle on `one` alone (a hero): them whole, their feet low in the frame. */
export function lowView(
  one: ScenePlaceDto,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): View {
  const s = Math.max(
    1,
    Math.min(LOW_MOST, (0.86 * H) / (one.h * 1.08), (0.7 * W) / one.w),
  );
  return settle({ s, x: middleOf(one), y: one.y + one.h * 0.48 }, W, H, span);
}

/** The people on the stage who are not `id`: not the set, not a crowd. */
const othersThan = (
  id: string,
  show: readonly string[],
  places: Record<string, ScenePlaceDto>,
  W: number,
) =>
  show.flatMap((other) => {
    const p = places[other];
    return other !== id && p && !other.startsWith('@') && p.w <= W * 0.6
      ? [p]
      : [];
  });

/**
 * Deep staging on `id`, near the camera: where the camera looks (on the
 * others, behind), and the side of the frame the one near is at. Null
 * with no one else on the stage.
 */
export function deepView(
  id: string,
  show: readonly string[],
  places: Record<string, ScenePlaceDto>,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): { view: View; side: -1 | 1 } | null {
  const near = places[id];
  const others = othersThan(id, show, places, W);
  if (!near || !others.length) return null;
  const mean = others.reduce((sum, p) => sum + middleOf(p), 0) / others.length;
  const side: -1 | 1 = middleOf(near) > mean ? 1 : -1;
  const x0 = Math.min(...others.map((p) => p.x));
  const x1 = Math.max(...others.map((p) => p.x + p.w));
  const y0 = Math.min(...others.map((p) => p.y));
  const y1 = Math.max(...others.map((p) => p.y + p.h * 0.75));
  const s = Math.max(
    1,
    Math.min(DEEP_MOST, (0.62 * W) / (x1 - x0), (0.8 * H) / (y1 - y0)),
  );
  return {
    view: settle(
      { s, x: (x0 + x1) / 2 + (side * DEEP_OFFSET * W) / s, y: (y0 + y1) / 2 },
      W,
      H,
      span,
    ),
    side,
  };
}

/**
 * Where someone cheated near the camera stands on the stage for a shot
 * on `view`: `tall` of the frame's height on the screen, the top of their
 * box `top` of it down, their middle `edge` of its width in from the edge
 * at `side`, as far further off the frame as keeps each face in `clear`
 * seen (at most NEAR_OFF_MOST of them off it); before the floor's front
 * (NEAR_D). Their box keeps its shape.
 */
export function nearPlace(
  near: Pick<ScenePlaceDto, 'w' | 'h'>,
  view: View,
  side: -1 | 1,
  clear: readonly Pick<ScenePlaceDto, 'x' | 'y' | 'w' | 'h'>[],
  W: number,
  H: number,
  o: { tall: number; edge: number; top: number } = {
    tall: NEAR_TALL,
    edge: NEAR_EDGE,
    top: NEAR_TOP,
  },
): ScenePlaceDto {
  const s = Math.max(1, view.s);
  const hs = o.tall * H;
  const ws = (hs * near.w) / Math.max(1, near.h);
  // Its body, as the faces check takes one: its middle seven tenths.
  const body = ws * 0.35;
  let cx = side < 0 ? o.edge * W : W - o.edge * W;
  for (const one of clear) {
    const face = faceIn(one);
    const fx0 = W / 2 + s * (face.x - view.x);
    const fx1 = fx0 + s * face.w;
    if (side < 0) cx = Math.min(cx, fx0 - body - NEAR_CLEAR * W);
    else cx = Math.max(cx, fx1 + body + NEAR_CLEAR * W);
  }
  const most = ws * (NEAR_OFF_MOST - 0.5);
  cx = side < 0 ? Math.max(cx, -most) : Math.min(cx, W + most);
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    x: r(view.x + (cx - ws / 2 - W / 2) / s),
    y: r(view.y + (o.top * H - H / 2) / s),
    w: r(ws / s),
    h: r(hs / s),
    d: NEAR_D,
  };
}

/**
 * Whom a shot cheats near the camera, and where they stand for it: the
 * one over whose shoulder it looks (ots, a little soft), or the one near
 * in deep staging (sharp: they speak). Null for any other shot, or one
 * whose people are not there.
 */
export function nearOf(
  shot: ShotLike | null,
  show: readonly string[],
  places: Record<string, ScenePlaceDto>,
  W: number,
  H: number,
  room: SetRoom = NO_ROOM,
): { id: string; place: ScenePlaceDto; view: View; soft: boolean } | null {
  const kind = shot?.shot?.kind;
  if (
    !shot ||
    (kind !== 'ots' &&
      kind !== 'deep' &&
      !(kind === 'crowd' && isReverse(shot)))
  )
    return null;
  const placed = (id: string | null) =>
    id && show.includes(id) ? places[id] : undefined;
  const one = placed(shot.target);
  if (!one) return null;
  if (isReverse(shot)) {
    // From the other side: where the stage reflected stands them; over a
    // shoulder, the one near at the edge they were at from the front.
    const turned = reflectPlaces(places, W);
    const other = reflectRoom(room, W);
    const it = turned[shot.target];
    if (kind === 'ots') {
      const near =
        shot.part && show.includes(shot.part) ? turned[shot.part] : undefined;
      if (!near || !shot.part) return null;
      const dir = pairSide(shot, places);
      const view = otsView(it, near, W, H, other.span, dir);
      return {
        id: shot.part,
        place: nearPlace(near, view, -dir as -1 | 1, [it], W, H),
        view,
        soft: true,
      };
    }
    if (kind === 'crowd') {
      // The one speaking to them, near, from behind, at their own side.
      const view = crowdReverseView(it, W, H, other.span);
      const side: -1 | 1 = middleOf(it) <= W / 2 ? -1 : 1;
      return {
        id: shot.target,
        place: nearPlace(it, view, side, [], W, H),
        view,
        soft: false,
      };
    }
    return nearOf(frontOf(shot), show, turned, W, H, other);
  }
  if (kind === 'ots') {
    const near = placed(shot.part);
    if (!near || !shot.part) return null;
    const view = otsView(one, near, W, H, room.span);
    const side: -1 | 1 = middleOf(one) >= middleOf(near) ? -1 : 1;
    return {
      id: shot.part,
      place: nearPlace(near, view, side, [one], W, H),
      view,
      // Over the shoulder of one listening: a little soft.
      soft: true,
    };
  }
  const deep = deepView(shot.target, show, places, W, H, room.span);
  if (!deep) return null;
  return {
    id: shot.target,
    place: nearPlace(
      one,
      deep.view,
      deep.side,
      othersThan(shot.target, show, places, W),
      W,
      H,
      { tall: DEEP_TALL, edge: DEEP_EDGE, top: DEEP_TOP },
    ),
    view: deep.view,
    // Near in deep staging, and speaking: sharp.
    soft: false,
  };
}

/**
 * What a shot cheats near the camera, and from which side of the place it
 * is taken, as a key: two shots that cheat differently, or one from each
 * side, are always a cut apart.
 */
const cheatKey = (shot: ShotLike | null) => {
  const kind = shot?.shot?.kind;
  const cheat =
    shot && (kind === 'ots' || kind === 'deep')
      ? `${kind}:${shot.target}:${shot.part ?? ''}`
      : '';
  return isReverse(shot) ? `${cheat}|reverse` : cheat;
};

/**
 * Whether a cut from one shot to the next is a real cut: the pictures
 * apart enough (apart), or one cheating someone near the camera that the
 * other does not (over one shoulder and then the other: the one near
 * changes sides, whatever the camera's move).
 */
export function shotsApart(
  a: ShotLike | null,
  b: ShotLike | null,
  va: View,
  vb: View,
  W: number,
  H: number,
): boolean {
  return cheatKey(a) !== cheatKey(b) || apart(va, vb, W, H);
}

/**
 * Low and high angles on a flat set (studio-views-plan §4.4), a cheat:
 * the horizon moves ANGLE_TILT of the frame's height, down for a camera
 * low looking up, up for one high looking down, by each layer behind the
 * people scaled about the frame's top (low) or bottom (high), the farther
 * off the more, none from TILT_TO on; and the people are ANGLE_PEOPLE
 * larger (low) or smaller (high), about their feet. The player's own.
 */
export const ANGLE_TILT = 0.08;
export const ANGLE_PEOPLE = 0.06;
export const TILT_TO = 0.8;
/** Where the horizon is, as a share of the frame's height from its pivot: the tilt's scale is set so it moves ANGLE_TILT. */
const HORIZON_FROM_PIVOT = 0.5;

/** How much of the tilt a layer at `depth` takes: all of it far off, none from TILT_TO on. */
export const tiltOf = (depth: number): number =>
  Math.max(0, 1 - depth / TILT_TO);

/** A layer's scale under a low or high angle, and about which edge of the frame (0 the top, 1 the bottom). */
export function angleLayer(
  angle: 'low' | 'high' | undefined,
  depth: number,
): { k: number; pivot: 0 | 1 } {
  if (!angle) return { k: 1, pivot: 0 };
  return {
    k: 1 + (ANGLE_TILT / HORIZON_FROM_PIVOT) * tiltOf(depth),
    pivot: angle === 'low' ? 0 : 1,
  };
}

/** How much larger the people are under an angle, about their feet. */
export const anglePeople = (angle: 'low' | 'high' | undefined): number =>
  angle === 'low' ? 1 + ANGLE_PEOPLE : angle === 'high' ? 1 - ANGLE_PEOPLE : 1;

/** How the things on the floor follow the camera, by how far back they stand: the player's FLOOR_BACK_F and FLOOR_FRONT_F. */
export const FLOOR_BACK_F = 0.8;
export const FLOOR_FRONT_F = 1.05;

/**
 * The depth factor of what stands with its feet at `feet` on a floor from
 * `back` to `front`: the people's own (1) with none. Everything standing
 * on the floor with its feet at one depth (a person, a feature the stage
 * draws, a thing of the floor's layer) has the one factor, so moves
 * together as the camera pans and pushes.
 */
export function floorFactor(
  feet: number,
  floor: readonly [number, number] | null | undefined,
): number {
  if (!floor || floor[1] - floor[0] < 1) return 1;
  const d = Math.min(1, Math.max(0, (feet - floor[0]) / (floor[1] - floor[0])));
  return FLOOR_BACK_F + (FLOOR_FRONT_F - FLOOR_BACK_F) * d;
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
    shotsApart(
      shot,
      null,
      view(shot, endOf(shot) - 1),
      view(null, endOf(shot)),
      W,
      H,
    );
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
    if (shotsApart(now, shot, view(now, t), view(shot, t), W, H))
      kept.push({ ...shot });
    else if (now) now.untilMs = Math.max(endOf(now), endOf(shot));
  }
  const last = kept[kept.length - 1];
  if (last && endOf(last) < durationMs && !leaves(last))
    last.untilMs = durationMs;
  return kept;
}

// ── Inserts (studio-screenwriting K5) ──────────────────────────────────────

type Box = Pick<ScenePlaceDto, 'x' | 'y' | 'w' | 'h'>;

/**
 * An insert is a true close-up (studio-screenwriting K5): its thing's box
 * fills INSERT_FILL of the frame's height, and no more than INSERT_WIDE of
 * its width, its middle in the frame's middle; no nearer than
 * INSERT_LEAST, no closer than INSERT_MOST. A letter held fills about two
 * fifths of the frame, and a key handed over as much. The player's own
 * (shots.ts).
 */
export const INSERT_FILL = 0.45;
export const INSERT_WIDE = 0.6;
export const INSERT_LEAST = 1.6;
export const INSERT_MOST = 10;
/** The kit's figure is drawn this tall in its own units, where its drawing does not say: what a thing in its hand is scaled by. The player's own. */
export const KIT_FIGURE_H = 234;

/** An insert on a thing where it is: close enough that it fills INSERT_FILL of the frame's height (INSERT_WIDE of its width at most), its middle in the frame's middle. */
export function insertView(
  box: Box,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): View {
  const s = Math.min(
    INSERT_MOST,
    Math.max(
      INSERT_LEAST,
      Math.min(
        (INSERT_FILL * H) / Math.max(box.h, 1e-3),
        (INSERT_WIDE * W) / Math.max(box.w, 1e-3),
      ),
    ),
  );
  return settle({ s, x: box.x + box.w / 2, y: box.y + box.h / 2 }, W, H, span);
}

/** A thing's drawing as the stage scales it: its own box, and where it is held (or carried in a mouth). */
export interface ThingDrawn {
  viewBox: readonly [number, number, number, number];
  grip: readonly [number, number];
  mouth?: readonly [number, number];
}

/** Someone who holds a thing, as the stage draws them: where they stand, their head and shoulders as shares of their box, and how tall their drawing is in its own units. */
export interface Holder {
  place: Box;
  head?: readonly [number, number];
  /** Each shoulder, as shares of their box (the kit's joints). */
  shoulder?: Partial<Record<'r' | 'l', readonly [number, number]>>;
  /** Their drawing's height in its own units: a thing in their hand is drawn at their scale. */
  unitsTall?: number;
}

/**
 * Where a thing held is on the stage: in a hand held before them (the
 * player's "hold": out from the head a sixth of their width, below the
 * shoulder), or in a mouth, its grip there; drawn at their scale. The
 * player's heldBox.
 */
export function heldBox(
  thing: ThingDrawn,
  by: Holder,
  hand: 'r' | 'l' | 'mouth',
): Box {
  const { place } = by;
  const at = holdPoint(by, hand);
  const k = place.h / (by.unitsTall ?? KIT_FIGURE_H);
  const grip = hand === 'mouth' ? (thing.mouth ?? thing.grip) : thing.grip;
  return gripBox(thing, grip, at, k, hand === 'l');
}

/**
 * A thing's box on the stage with its point `grip` (in its own units) at
 * `at`, drawn `k` stage units to its one; `flipped`, the other way round
 * about that point, as the player draws a thing in the left hand.
 */
export function gripBox(
  thing: Pick<ThingDrawn, 'viewBox'>,
  grip: readonly [number, number],
  at: readonly [number, number],
  k: number,
  flipped = false,
): Box {
  const [vx, vy, vw, vh] = thing.viewBox;
  return {
    x: at[0] - (flipped ? vx + vw - grip[0] : grip[0] - vx) * k,
    y: at[1] - (grip[1] - vy) * k,
    w: vw * k,
    h: vh * k,
  };
}

/** Where someone holds a thing, on the stage: a hand before them, out from the head a sixth of their width and below the shoulder; or at the mouth. The player's "hold" mark. */
export function holdPoint(
  by: Holder,
  hand: 'r' | 'l' | 'mouth',
): [number, number] {
  const { place } = by;
  const head = by.head ?? [0.5, 0.25];
  const side = hand === 'l' ? -1 : 1;
  const hx = place.x + place.w * head[0];
  const hy = place.y + place.h * head[1];
  const joint = hand === 'mouth' ? undefined : by.shoulder?.[hand];
  const shoulderY = joint ? place.y + place.h * joint[1] : hy + place.h * 0.22;
  return hand === 'mouth'
    ? [hx + place.w * 0.05, hy + place.h * 0.2]
    : [hx + side * place.w * 0.17, shoulderY + place.h * HOLD_BELOW];
}

/** A thing held before someone is this far below their shoulder, as a share of their height, where a close shot of them still has it; hands meet to hand a thing over this far below each one's (the player's own). */
export const HOLD_BELOW = 0.15;
export const MEET_BELOW = 0.15;

/** The side `other` stands on from `one`: their right hand ("r", the frame's right) or left. */
export const sideToward = (one: Holder, other: Holder): 'r' | 'l' =>
  other.place.x + other.place.w / 2 >= one.place.x + one.place.w / 2
    ? 'r'
    : 'l';

/** Someone's shoulder on the stage: the kit's joint, else beside the head. */
export function shoulderOf(one: Holder, hand: 'r' | 'l'): [number, number] {
  const joint = one.shoulder?.[hand];
  const head = one.head ?? [0.5, 0.25];
  return joint
    ? [
        one.place.x + one.place.w * joint[0],
        one.place.y + one.place.h * joint[1],
      ]
    : [
        one.place.x + one.place.w * (head[0] + (hand === 'r' ? 0.15 : -0.15)),
        one.place.y + one.place.h * (head[1] + 0.22),
      ];
}

/** Where the hands of `a`, giving with `hand`, and `b` meet: midway between that shoulder and b's toward a, MEET_BELOW each one's shoulder, on the mean (the player's "meet", the same for both). */
export function meetPoint(
  a: Holder,
  b: Holder,
  hand: 'r' | 'l' = sideToward(a, b),
): [number, number] {
  const sa = shoulderOf(a, hand);
  const sb = shoulderOf(b, sideToward(b, a));
  return [
    (sa[0] + sb[0]) / 2,
    (sa[1] + a.place.h * MEET_BELOW + sb[1] + b.place.h * MEET_BELOW) / 2,
  ];
}

/** Where a thing handed from `a` (in `hand`, the side toward b unless said) to `b` is as it changes hands: its grip where their hands meet (meetPoint), at the giver's scale, the other way round in a left hand. */
export function handOverBox(
  thing: ThingDrawn,
  a: Holder,
  b: Holder,
  hand: 'r' | 'l' = sideToward(a, b),
): Box {
  const k = a.place.h / (a.unitsTall ?? KIT_FIGURE_H);
  return gripBox(thing, thing.grip, meetPoint(a, b, hand), k, hand === 'l');
}

/** Where a thing resting before someone is: on the ground at their feet, toward the others (`toward`, 1 their right), at their scale. The player's restingBox. */
export function restingBox(thing: ThingDrawn, by: Holder, toward: -1 | 1): Box {
  const { place } = by;
  const head = by.head ?? [0.5, 0.25];
  const k = place.h / (by.unitsTall ?? KIT_FIGURE_H);
  const [, , vw, vh] = thing.viewBox;
  const x = place.x + place.w * head[0] + toward * place.w * 0.34;
  const feet = place.y + place.h;
  return { x: x - (vw * k) / 2, y: feet - vh * k, w: vw * k, h: vh * k };
}

/** The stage as a thing on it is found: its things, its steps, where each stands at each, its people's drawings, and its features' boxes. */
export interface ThingsOnStage {
  props: readonly ScenePropDto[];
  steps: readonly Pick<SceneStepDto, 'atMs' | 'show'>[];
  places: readonly Record<string, ScenePlaceDto>[];
  drawing: (
    id: string,
  ) => Extract<SceneThingDto, { kind: 'drawing' }> | undefined;
  feature?: (id: string) => Box | undefined;
}

/** Who has a thing at `t`, and in what; else whom it rests by. From whoever held it first, as what is done with it hands it on or puts it down. Gone (worn, eaten) or in the air, neither. */
export function holderAt(
  prop: ScenePropDto,
  t: number,
  rigged: (id: string) => boolean,
): {
  by: string | null;
  hand: 'r' | 'l' | 'mouth';
  near: string | null;
  gone?: true;
  flying?: true;
} {
  let by: string | null = prop.held?.by ?? null;
  let hand: 'r' | 'l' | 'mouth' = prop.held?.in ?? 'r';
  let near: string | null = prop.near;
  let gone = false;
  let flying = false;
  for (const [at, who, does, to] of prop.does) {
    if (at > t) break;
    flying = false;
    if (does === 'take' || does === 'catch' || does === 'doff') {
      by = who;
      hand = rigged(who) ? 'r' : 'mouth';
    } else if (does === 'give' && to && !to.startsWith('@')) {
      by = to;
      hand = rigged(to) ? 'r' : 'mouth';
    } else if (does === 'put' || does === 'drop') {
      by = null;
      near = who;
    } else if (does === 'throw' || does === 'kick') {
      by = null;
      near = to && !to.startsWith('@') && !to.startsWith('f:') ? to : who;
      flying = t - at < 1500;
    } else if (does === 'wear' || does === 'eat') {
      by = null;
      gone = true;
    }
  }
  return {
    by,
    hand,
    near,
    ...(gone ? { gone: true as const } : {}),
    ...(flying ? { flying: true as const } : {}),
  };
}

/**
 * Who has each thing at `t` (holderAt), and in which hand: a hand already
 * full takes nothing more, the other one does, as the player's business
 * has it; the thing had first keeps its hand.
 */
export function handsAt(
  stage: Pick<ThingsOnStage, 'props' | 'drawing'>,
  t: number,
): Map<string, ReturnType<typeof holderAt>> {
  const rigged = (id: string) => Boolean(stage.drawing(id)?.rig);
  const since = (prop: ScenePropDto, by: string | null) =>
    [...prop.does]
      .reverse()
      .find(
        ([at, who, does, to]) =>
          at <= t &&
          ((does === 'give' && to === by) ||
            (who === by &&
              (does === 'take' || does === 'catch' || does === 'doff'))),
      )?.[0] ?? -Infinity;
  const all = stage.props
    .map((prop) => ({ prop, has: holderAt(prop, t, rigged) }))
    .sort((a, b) => since(a.prop, a.has.by) - since(b.prop, b.has.by));
  const full = new Set<string>();
  for (const { has } of all) {
    if (!has.by || has.hand === 'mouth' || has.gone) continue;
    const other = has.hand === 'r' ? 'l' : 'r';
    if (full.has(`${has.by}|${has.hand}`) && !full.has(`${has.by}|${other}`))
      has.hand = other;
    full.add(`${has.by}|${has.hand}`);
  }
  return new Map(all.map(({ prop, has }) => [prop.id, has]));
}

/** How long before a hand-over the hands are out to meet, and after it they part: the player's give (business.ts: 1.6 s, the change 62% in, held out from 15% to 78%). */
export const MEET_BEFORE_MS = 750;
export const MEET_AFTER_MS = 250;

/** A hand-over of `thing` whose hands are out together at `t`: when it changes hands, who gives it and to whom. */
export function handOverAt(
  props: readonly ScenePropDto[],
  thing: string,
  t: number,
): { at: number; from: string; to: string } | null {
  const give = props
    .find((p) => p.id === thing)
    ?.does.find(
      ([at, , does, to]) =>
        does === 'give' &&
        Boolean(to) &&
        !to!.startsWith('@') &&
        t >= at - MEET_BEFORE_MS &&
        t <= at + MEET_AFTER_MS,
    );
  return give ? { at: give[0], from: give[1], to: give[3]! } : null;
}

/**
 * The moment an insert frames its thing at, from `from` to `until`: just
 * after it is handled then (set down, it lies there; picked up, it is in
 * the hand); a thing handed over, as the hands meet; else its middle.
 */
export function insertMoment(
  props: readonly ScenePropDto[],
  thing: string,
  from: number,
  until: number,
): number {
  const done = props
    .find((p) => p.id === thing)
    ?.does.find(([at]) => at >= from && at <= until);
  if (!done) return Math.round((from + until) / 2);
  if (done[2] === 'give') return Math.max(from + 1, done[0] - 1);
  return Math.min(until - 1, done[0] + 1);
}

/**
 * Where an insert frames its thing, from `from` to `until`: where it is at
 * the moment it frames (insertMoment), one box, so the thing alone fills
 * the frame; a thing handed over, where the two hands meet between the
 * two (the player's "meet"), at the giver's scale, in the hand they hold
 * it in. Null when it is nowhere to be found.
 */
export function insertBoxOf(
  stage: ThingsOnStage,
  thing: string,
  from: number,
  until: number,
): (Box & { held?: true }) | null {
  const t = insertMoment(stage.props, thing, from, until);
  const prop = stage.props.find((p) => p.id === thing);
  const give = prop ? handOverAt(stage.props, thing, t) : null;
  if (prop && give) {
    let k = 0;
    stage.steps.forEach((step, i) => {
      if (step.atMs <= give.at) k = i;
    });
    const a = holderOn(stage, give.from, k);
    const b = holderOn(stage, give.to, k);
    const hand = handsAt(stage, give.at - 1).get(thing)?.hand;
    if (a && b)
      return {
        ...handOverBox(
          prop,
          a,
          b,
          hand === 'r' || hand === 'l' ? hand : undefined,
        ),
        held: true,
      };
  }
  const box = thingBoxAt(stage, thing, t);
  const has = prop ? handsAt(stage, t).get(thing) : undefined;
  return box && has?.by ? { ...box, held: true } : box;
}

/** A thing in a hand is framed a little low, its middle this share of the frame's height above the frame's: the face of whoever holds it (always above it) kept out of the frame's top, the thing still well within a tenth of the middle. The player's own. */
export const INSERT_LOW = 0.07;

/** The box an insert's shot frames (insertView), where its thing is: a thing in a hand, a little lower, so the frame sits a little below it (INSERT_LOW). */
export function insertFramed(
  box: Box & { held?: true },
  W: number,
  H: number,
): Box {
  const framed = { x: box.x, y: box.y, w: box.w, h: box.h };
  if (!box.held) return framed;
  return {
    ...framed,
    y: box.y + (INSERT_LOW * H) / insertView(box, W, H).s,
  };
}

/** Someone on the stage at step `k` as a thing's holder: where they stand, their head and shoulders, and their drawing's height. */
export function holderOn(
  stage: ThingsOnStage,
  id: string,
  k: number,
): Holder | null {
  const place = stage.steps[k]?.show.includes(id)
    ? stage.places[k]?.[id]
    : undefined;
  const d = stage.drawing(id);
  if (!place || !d || d.backdrop) return null;
  const tall = Number(
    /viewBox="[^"]*?(-?[\d.]+)"/u.exec(d.svg)?.[1] ?? Number.NaN,
  );
  const r = d.joints?.r?.[0];
  const l = d.joints?.l?.[0];
  return {
    place,
    ...(d.head ? { head: d.head } : {}),
    ...(r && l ? { shoulder: { r, l } } : {}),
    ...(d.rig
      ? Number.isFinite(tall) && tall > 0
        ? { unitsTall: tall }
        : {}
      : d.units
        ? { unitsTall: d.units }
        : {}),
  };
}

/**
 * Where a thing is at `t`, on the stage: a feature ("f:<id>") where it
 * stands; a thing in whoever's hand or mouth has it (heldBox), else before
 * whoever it rests by (restingBox), toward the others there. Null for one
 * gone, in the air, or with no one there to find it by.
 */
export function thingBoxAt(
  stage: ThingsOnStage,
  thing: string,
  t: number,
): Box | null {
  let k = 0;
  stage.steps.forEach((step, i) => {
    if (step.atMs <= t) k = i;
  });
  if (thing.startsWith('f:')) {
    const box = stage.feature?.(thing.slice(2));
    return box && box.w > 0 && box.h > 0 ? box : null;
  }
  const prop = stage.props.find((p) => p.id === thing);
  if (!prop) return null;
  const has = handsAt(stage, t).get(prop.id);
  if (!has || has.gone || has.flying) return null;
  const drawn = { viewBox: prop.viewBox, grip: prop.grip, mouth: prop.mouth };
  const holding = has.by ? holderOn(stage, has.by, k) : null;
  if (holding) return heldBox(drawn, holding, has.hand);
  const at = has.near ? holderOn(stage, has.near, k) : null;
  if (!at) return null;
  const mid = at.place.x + at.place.w / 2;
  const others = (stage.steps[k]?.show ?? []).flatMap((id) => {
    const p = id !== has.near ? stage.places[k]?.[id] : undefined;
    return p && stage.drawing(id) && !stage.drawing(id)?.backdrop
      ? [p.x + p.w / 2]
      : [];
  });
  const mean = others.length
    ? others.reduce((a, b) => a + b, 0) / others.length
    : mid + 1;
  return restingBox(drawn, at, mean >= mid ? 1 : -1);
}
