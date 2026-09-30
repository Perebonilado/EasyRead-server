/**
 * Choreography (studio-interactions-plan §1.3): one thing someone does
 * with a thing of the set, as the steps it takes, each with the least it
 * may take and all it wants, as the action moves' phases have them.
 *
 * Going through a door is reaching the handle, the door swinging open with
 * the hand on it, stepping through behind its near post, and gone into the
 * dark beyond (the door swinging shut behind them); sitting at a table is
 * pulling the chair out, sitting, and tucking it in, the table's front laid
 * over their legs; climbing the stairs is a tread at a time. The stager
 * says what is done and how long it has; compose times it here into its
 * steps, the feature's states with it (the door open as the hand pulls
 * it, a room's light on as the switch is flicked), and the player plays
 * them purely in t: hands to the points the feature offers, its parts
 * moved, what is laid over whoever uses it, and where it carries them.
 *
 * And the checks on a made scene (§2.6): every step at no less than its
 * least, the hand on the handle as the door opens, no one through a door
 * that is shut, the feet on the treads.
 */
import type {
  SceneAffordancesDto,
  SceneDto,
  SceneFeatureDto,
  SceneInteractDto,
  SceneInteractStep,
  SceneInteraction,
  ScenePlaceDto,
  ScenePoint,
} from '../../contracts';
import type { AnyFeatureKind, DoingId } from './scene-doings';
import { walkBetween } from './scene-film';

/** Each interaction's steps in turn: which, the least it may take and all it wants, in ms. */
export const INTERACT_STEPS: Record<
  SceneInteraction,
  [SceneInteractStep, number, number][]
> = {
  // To the handle, the door swung open with the hand on it, a step through
  // behind its near post, gone into the dark, and the door shut behind.
  'go-through': [
    ['reach', 250, 420],
    ['open', 300, 450],
    ['through', 650, 950],
    ['gone', 260, 420],
    ['close', 0, 500],
  ],
  // The door swinging open from inside, out of the dark behind its near
  // post, on to where they stand, and the door shut behind them.
  'come-through': [
    ['open', 300, 420],
    ['out', 600, 900],
    ['walk', 0, 0],
    ['close', 0, 450],
  ],
  // The knuckles to the door, two or three knocks, the hand down, and a wait.
  knock: [
    ['reach', 250, 400],
    ['knock', 600, 900],
    ['back', 200, 300],
    ['wait', 300, 1400],
  ],
  // The hand to the handle, pulled (it swings as it is), and let go.
  open: [
    ['reach', 250, 400],
    ['pull', 300, 450],
    ['let-go', 200, 350],
  ],
  close: [
    ['reach', 250, 400],
    ['pull', 300, 450],
    ['let-go', 200, 350],
  ],
  // The chair pulled out by its back, sat on, and tucked in.
  'sit-at': [
    ['pull', 350, 500],
    ['sit', 450, 700],
    ['tuck', 300, 450],
  ],
  // The chair pushed back, up out of it, and tucked in again.
  'stand-from': [
    ['push', 300, 450],
    ['rise', 450, 650],
    ['tuck', 250, 400],
  ],
  // A hip against it and a hand on it, easy there, and off it.
  'lean-on': [
    ['lean', 350, 550],
    ['hold', 500, 1700],
    ['off', 250, 400],
  ],
  // A tread at a time (each CLIMB_TREAD), the body rising along them.
  'climb-stairs': [['climb', 0, 0]],
  'climb-ladder': [['climb', 0, 0]],
  // The hand to the switch, a flick, the hand down.
  'switch-on': [
    ['reach', 250, 400],
    ['flick', 120, 200],
    ['back', 250, 400],
  ],
  'switch-off': [
    ['reach', 250, 400],
    ['flick', 120, 200],
    ['back', 250, 400],
  ],
  // The hand to the tap, turned, the water running, the hand back.
  'turn-on-tap': [
    ['reach', 250, 400],
    ['turn', 300, 450],
    ['water', 400, 1200],
    ['back', 250, 400],
  ],
  // The hand to the bell, pressed (it rings), the hand down, a wait.
  'ring-bell': [
    ['reach', 250, 400],
    ['press', 150, 250],
    ['back', 200, 350],
    ['wait', 300, 1000],
  ],
};

/** A tread of the stairs takes at least this long and wants this long; a rung of a ladder, the second pair. */
export const CLIMB_TREAD: [number, number] = [260, 420];
export const CLIMB_RUNG: [number, number] = [340, 520];

/** The step that takes whatever time is left over, once every step has all it wants: a wait, a hold. None: the interaction ends early. */
const FLEX: Partial<Record<SceneInteraction, SceneInteractStep>> = {
  knock: 'wait',
  'ring-bell': 'wait',
  'lean-on': 'hold',
  'turn-on-tap': 'water',
  open: 'let-go',
  close: 'let-go',
};

/** The steps a hand is on the handle in, holding it as it swings. */
export const ON_HANDLE: Partial<Record<SceneInteraction, SceneInteractStep[]>> =
  {
    'go-through': ['open'],
    open: ['pull'],
    close: ['pull'],
  };

/** The step whose start the feature changes at: the door swung, the light on, the water running. */
export const TURNS_AT: Partial<Record<SceneInteraction, SceneInteractStep>> = {
  'go-through': 'open',
  'come-through': 'open',
  open: 'pull',
  close: 'pull',
  'switch-on': 'flick',
  'switch-off': 'flick',
  'turn-on-tap': 'water',
};

/** Which mask of a feature is laid over whoever uses it, in which steps. */
export const MASKED_IN: Partial<
  Record<SceneInteraction, { mask: string; steps: SceneInteractStep[] }>
> = {
  'go-through': { mask: 'frame-near', steps: ['through', 'gone'] },
  'come-through': { mask: 'frame-near', steps: ['open', 'out'] },
  'sit-at': { mask: 'body-front', steps: ['pull', 'sit', 'tuck'] },
  'stand-from': { mask: 'body-front', steps: ['push', 'rise'] },
};

/** The interactions that carry someone somewhere: through a doorway, up the stairs. */
export const CARRIES: ReadonlySet<SceneInteraction> = new Set([
  'go-through',
  'come-through',
  'climb-stairs',
  'climb-ladder',
]);

/**
 * How many treads or rungs a climb takes: up to the first as high as
 * where one up the feature stands (its perch), else all of them.
 */
export function climbCount(
  does: SceneInteraction,
  feature: Pick<SceneFeatureDto, 'svg' | 'at' | 'affordances' | 'perch'>,
): number {
  const all =
    (does === 'climb-ladder'
      ? feature.affordances?.rungs
      : feature.affordances?.steps) ?? [];
  const perch = feature.perch?.wide.y;
  if (perch === undefined) return all.length;
  const k = all.findIndex((p) => {
    const at = featurePoint(feature, 'wide', p);
    return at !== null && Math.abs(at[1] - perch) <= 2;
  });
  return k >= 0 ? k + 1 : all.length;
}

/** The steps an interaction has, with their least and all they want: a climb's one step as long as its treads or rungs. */
export function stepsOf(
  does: SceneInteraction,
  count = 0,
  fixed: Partial<Record<SceneInteractStep, number>> = {},
): [SceneInteractStep, number, number][] {
  return INTERACT_STEPS[does].map(([name, least, ideal]) => {
    if (fixed[name] !== undefined) return [name, fixed[name], fixed[name]];
    if (name === 'climb') {
      const [lo, hi] = does === 'climb-ladder' ? CLIMB_RUNG : CLIMB_TREAD;
      return [name, lo * Math.max(1, count), hi * Math.max(1, count)];
    }
    return [name, least, ideal];
  });
}

/** The least an interaction may take, and all it wants. */
export const interactLeastMs = (
  does: SceneInteraction,
  count = 0,
  fixed: Partial<Record<SceneInteractStep, number>> = {},
) => stepsOf(does, count, fixed).reduce((n, [, lo]) => n + lo, 0);
export const interactIdealMs = (
  does: SceneInteraction,
  count = 0,
  fixed: Partial<Record<SceneInteractStep, number>> = {},
) => stepsOf(does, count, fixed).reduce((n, [, , hi]) => n + hi, 0);

/**
 * An interaction given `ms`, in its steps: each step's start (from the
 * interaction's) and length. All it wants, and any more to its flexible
 * step (a wait, a hold), or else it ends early; less, each between its
 * least and all it wants alike; less than all their least, each squeezed
 * alike (which the audit catches). `fixed` steps keep their own length
 * (a walk as long as it is, a door already open reached for in no time).
 */
export function expandInteraction(
  does: SceneInteraction,
  ms: number,
  options: {
    count?: number;
    fixed?: Partial<Record<SceneInteractStep, number>>;
  } = {},
): [SceneInteractStep, number, number][] {
  const steps = stepsOf(does, options.count ?? 0, options.fixed ?? {});
  const fixed = options.fixed ?? {};
  const free = steps.filter(([name]) => fixed[name] === undefined);
  const set = steps
    .filter(([name]) => fixed[name] !== undefined)
    .reduce((n, [, lo]) => n + lo, 0);
  const room = Math.max(0, ms - set);
  const least = free.reduce((n, [, lo]) => n + lo, 0);
  const ideal = free.reduce((n, [, , hi]) => n + hi, 0);
  const flex = FLEX[does];
  let at = 0;
  return steps.map(([name, lo, hi]) => {
    let len: number;
    if (fixed[name] !== undefined) len = lo;
    else if (room >= ideal) len = hi + (name === flex ? room - ideal : 0);
    else if (room >= least)
      len = lo + ((hi - lo) * (room - least)) / Math.max(1, ideal - least);
    else len = (lo * room) / Math.max(1, least);
    const out: [SceneInteractStep, number, number] = [
      name,
      Math.round(at),
      Math.round(len),
    ];
    at += len;
    return out;
  });
}

/** An interaction's step at `t`, and how far through it: null before it begins or after it ends. */
export function interactStepAt(
  one: Pick<SceneInteractDto, 'steps'>,
  t: number,
): { step: SceneInteractStep; p: number; k: number } | null {
  for (let k = 0; k < one.steps.length; k += 1) {
    const [step, at, ms] = one.steps[k];
    if (t >= at && t < at + ms)
      return { step, p: ms > 0 ? (t - at) / ms : 1, k };
  }
  return null;
}

/** When an interaction's step begins and ends, in the scene's time; null for a step it has not. */
export function stepSpan(
  one: Pick<SceneInteractDto, 'steps'>,
  step: SceneInteractStep,
): [number, number] | null {
  const found = one.steps.find(([name]) => name === step);
  return found ? [found[1], found[1] + found[2]] : null;
}

/** When an interaction ends, in the scene's time. */
export const interactEnd = (one: Pick<SceneInteractDto, 'at' | 'steps'>) =>
  one.steps.reduce((end, [, at, ms]) => Math.max(end, at + ms), one.at);

// ── Which interaction a doing is, with which feature ────────────────────

/** The kinds of feature each doing is done with, and the kind the mender puts on a set that has none. */
export const USES: Partial<
  Record<DoingId, { kinds: readonly string[]; adds: AnyFeatureKind }>
> = {
  'go-through': { kinds: ['door', 'gate', 'drawn'], adds: 'door' },
  knock: { kinds: ['door', 'gate', 'window', 'drawn'], adds: 'door' },
  'ring-bell': { kinds: ['door', 'gate'], adds: 'door' },
  'climb-stairs': { kinds: ['stairs', 'steps', 'ladder'], adds: 'stairs' },
  'lean-on': {
    kinds: ['counter', 'wall', 'table', 'fence', 'stall', 'sink', 'door'],
    adds: 'counter',
  },
  'switch-on': { kinds: ['switch'], adds: 'switch' },
  'switch-off': { kinds: ['switch'], adds: 'switch' },
  'turn-on-tap': { kinds: ['sink'], adds: 'sink' },
};

/**
 * The interaction a doing plays with a feature of a kind: its own, where
 * the feature offers what it needs; a climb is a ladder's or the stairs';
 * opening or shutting one with a handle, the hand on it; sitting at a table,
 * the chair pulled out. Null where it is none (a sit on a bench).
 */
export function interactionFor(
  doing: DoingId,
  kind: string,
  affordances?: SceneAffordancesDto,
): SceneInteraction | null {
  switch (doing) {
    case 'go-through':
      return affordances?.threshold || kind === 'door' || kind === 'gate'
        ? 'go-through'
        : null;
    case 'knock':
      return 'knock';
    case 'ring-bell':
      // A door with no bell (an old town's, a stable's) is knocked at.
      return affordances && !affordances.operates?.some((o) => o.does === 'bell')
        ? 'knock'
        : 'ring-bell';
    case 'climb-stairs':
      return kind === 'ladder'
        ? 'climb-ladder'
        : affordances?.steps?.length || kind === 'stairs' || kind === 'steps'
          ? 'climb-stairs'
          : null;
    case 'lean-on':
      return 'lean-on';
    case 'switch-on':
    case 'switch-off':
      return kind === 'switch' ? doing : null;
    case 'turn-on-tap':
      return kind === 'sink' ? 'turn-on-tap' : null;
    case 'open':
    case 'close':
      return affordances?.handles?.length ? doing : null;
    case 'sit':
      return kind === 'table' ? 'sit-at' : null;
    case 'stand-up':
      return kind === 'table' ? 'stand-from' : null;
    default:
      return null;
  }
}

// ── Where a feature's points are on the stage ───────────────────────────

/** A drawing's frame, from its svg. */
export function viewBoxOf(
  svg: string | undefined,
): [number, number, number, number] | null {
  const m = /viewBox="([-\d.]+)[ ,]+([-\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/.exec(
    svg ?? '',
  );
  return m
    ? (m.slice(1).map(Number) as [number, number, number, number])
    : null;
}

/** A point of a feature's drawing, in its own units, where a staging stands it. */
export function featurePoint(
  feature: Pick<SceneFeatureDto, 'svg' | 'at'>,
  staging: 'box' | 'wide',
  [px, py]: ScenePoint,
): [number, number] | null {
  const vb = viewBoxOf(feature.svg);
  const at = feature.at[staging];
  if (!vb || at.w <= 0 || at.h <= 0) return null;
  return [
    at.x + ((px - vb[0]) / vb[2]) * at.w,
    at.y + ((py - vb[1]) / vb[3]) * at.h,
  ];
}

/** How much bigger a feature's own units are on a staging's stage. */
export function featureScale(
  feature: Pick<SceneFeatureDto, 'svg' | 'at'>,
  staging: 'box' | 'wide',
): number {
  const vb = viewBoxOf(feature.svg);
  return vb ? feature.at[staging].w / vb[2] : 1;
}

/**
 * Where one coming out through a doorway stands as they step out of it: in
 * its middle, at its foot, as big as they are there (the doorway's way).
 */
export function doorwayPlace(
  place: Pick<ScenePlaceDto, 'w' | 'h'>,
  feature: Pick<SceneFeatureDto, 'way'>,
  staging: 'box' | 'wide',
): ScenePlaceDto {
  const way = feature.way[staging];
  const w = place.w * way.k;
  const h = place.h * way.k;
  return { x: way.x - w / 2, y: way.y - h, w, h };
}

// ── Timed, on a made scene ──────────────────────────────────────────────

/** An interaction as the stager asks it, timed by compose: who, what, with which feature, from when, for how long. */
export interface TimedInteraction {
  who: string;
  does: SceneInteraction;
  feature: string;
  atMs: number;
  ms: number;
  part?: string;
  to?: 'behind' | 'next-set';
  side?: -1 | 1;
}

/** Whether a feature is open at `t`, as the scene's states have it: as it opens, then each change. */
export function openAt(
  scene: Pick<SceneDto, 'setting'>,
  feature: string,
  t: number,
): boolean {
  const f = scene.setting?.features?.find((one) => one.id === feature);
  let open = Boolean(f?.open);
  for (const [at, id, state] of [...(scene.setting?.featureStates ?? [])].sort(
    (a, b) => a[0] - b[0],
  ))
    if (id === feature && at <= t) open = state === 'open';
  return open;
}

/**
 * A made scene with its interactions timed into their steps: each on its
 * doer's acting (`interact`), the features' states with them (a door open
 * as the hand pulls it, shut behind them; a light on as the switch is
 * flicked), and those who go through a door gone through it (their exit
 * "through"). A feature the scene has not got, or someone not in it, is
 * left out: nothing is played for them.
 */
export function withInteractions<
  T extends Pick<
    SceneDto,
    'acting' | 'setting' | 'steps' | 'stagings' | 'things'
  >,
>(scene: T, list: readonly TimedInteraction[]): T {
  if (!list.length) return scene;
  const features = scene.setting?.features ?? [];
  const acting = { ...(scene.acting ?? {}) };
  let states = [...(scene.setting?.featureStates ?? [])];
  const lights = [...(scene.setting?.lights ?? [])];
  const steps = scene.steps.map((step) => ({ ...step }));
  const { places, w: W } = scene.stagings.wide;
  const stepAt = (t: number) =>
    steps.reduce((k, step, i) => (step.atMs <= t + 1 ? i : k), 0);
  const isOpen = (id: string, t: number) =>
    openAt({ setting: { ...scene.setting, featureStates: states } }, id, t);
  for (const one of [...list].sort((a, b) => a.atMs - b.atMs)) {
    const feature = features.find((f) => f.id === one.feature);
    if (!feature?.svg) continue;
    const at = Math.round(one.atMs);
    const k = stepAt(at);
    const fixed: Partial<Record<SceneInteractStep, number>> = {};
    let count = 0;
    // A door already open is gone through with no hand to it.
    if (
      (one.does === 'go-through' || one.does === 'come-through') &&
      isOpen(one.feature, at)
    ) {
      fixed.reach = 0;
      fixed.open = 0;
    }
    if (one.does === 'come-through') {
      // Out of the doorway, then as far as they walk to where they stand.
      const target = places[k]?.[one.who];
      const walk = target
        ? walkBetween(doorwayPlace(target, feature, 'wide'), target, W)
        : 0;
      fixed.walk = Math.round(walk);
    }
    if (one.does === 'climb-stairs' || one.does === 'climb-ladder') {
      count = climbCount(one.does, feature);
      if (!count) continue;
    }
    const ms =
      one.does === 'come-through'
        ? Math.max(one.ms, interactIdealMs(one.does, count, fixed))
        : one.ms;
    const expanded = expandInteraction(one.does, ms, { count, fixed });
    const dto: SceneInteractDto = {
      at,
      does: one.does,
      feature: one.feature,
      steps: expanded.map(([name, from, len]) => [name, at + from, len]),
      ...(one.side ? { side: one.side } : {}),
      ...(one.part ? { part: one.part } : {}),
      ...(one.to ? { to: one.to } : {}),
    };
    acting[one.who] = {
      ...(acting[one.who] ?? {}),
      interact: [...(acting[one.who]?.interact ?? []), dto],
    };
    // The feature as it changes with it.
    const turn = TURNS_AT[one.does];
    const turnsAt = turn ? stepSpan(dto, turn) : null;
    if ((one.does === 'go-through' || one.does === 'come-through') && turnsAt) {
      if (!isOpen(one.feature, turnsAt[0]))
        states.push([turnsAt[0], one.feature, 'open']);
      const close = stepSpan(dto, 'close');
      // Swung shut behind them, when there is time for it.
      if (close && close[1] - close[0] >= 150)
        states.push([close[0], one.feature, 'shut']);
    }
    if ((one.does === 'open' || one.does === 'close') && turnsAt && !one.part) {
      // The stager's own swing for it, at the hand's moment instead.
      const end = interactEnd(dto);
      states = states.filter(
        ([t, id]) => !(id === one.feature && t >= at - 50 && t <= end + 50),
      );
      states.push([
        turnsAt[0],
        one.feature,
        one.does === 'open' ? 'open' : 'shut',
      ]);
    }
    if ((one.does === 'switch-on' || one.does === 'switch-off') && turnsAt)
      lights.push([turnsAt[0], one.does === 'switch-on' ? 'on' : 'off']);
    // Gone through the door: their going off is it, not a walk to it.
    if (one.does === 'go-through') {
      const off = steps.findIndex(
        (step, j) =>
          j > 0 &&
          Math.abs(step.atMs - at) <= 60 &&
          step.exit?.[one.who]?.via === one.feature,
      );
      if (off > 0)
        steps[off] = {
          ...steps[off],
          exit: {
            ...steps[off].exit,
            [one.who]: { ...steps[off].exit![one.who], how: 'through' },
          },
        };
    }
  }
  states.sort((a, b) => a[0] - b[0]);
  lights.sort((a, b) => a[0] - b[0]);
  return {
    ...scene,
    steps,
    acting,
    setting: {
      ...scene.setting,
      ...(states.length ? { featureStates: states } : {}),
      ...(lights.length ? { lights } : {}),
    },
  };
}

// ── Checks (§2.6) ───────────────────────────────────────────────────────

/** Something wrong with how an interaction plays. */
export interface InteractFault {
  /**
   * `squeezed`: a step shorter than its least; `off-handle`: a door swung
   * with no hand on its handle, where someone's interaction has them at
   * it; `through-shut`: someone going through a door or a gate that is
   * shut; `off-steps`: a climb whose feet are not on the treads.
   */
  id: 'squeezed' | 'off-handle' | 'through-shut' | 'off-steps';
  who: string;
  does: SceneInteraction | 'walk';
  atMs: number;
  why: string;
}

/** Where each foot lands on a climb, in the feature's own units: a tread or a rung at a time, the other foot joining it on the last. */
export function footholds(
  does: SceneInteraction,
  affordances: SceneAffordancesDto | undefined,
  count: number,
): ScenePoint[] {
  const all =
    (does === 'climb-ladder' ? affordances?.rungs : affordances?.steps) ?? [];
  return all.slice(0, Math.max(0, count));
}

/**
 * How the interactions of a made scene play (§2.6): each step at no less
 * than its least; a door that swings as someone is at it swings with
 * their hand on its handle; no one goes through a door or a gate while it
 * is shut (by an interaction, or walking out or in by it); and every climb
 * has its feet on the treads (or the rungs), ending on the perch.
 */
export function interactFaults(
  scene: Pick<SceneDto, 'acting' | 'setting' | 'steps' | 'stagings'>,
): InteractFault[] {
  const out: InteractFault[] = [];
  const features = scene.setting?.features ?? [];
  const all = Object.entries(scene.acting ?? {}).flatMap(([who, a]) =>
    (a.interact ?? []).map((one) => ({ who, one })),
  );
  for (const { who, one } of all) {
    const used = features.find((f) => f.id === one.feature);
    const least = stepsOf(
      one.does,
      used && (one.does === 'climb-stairs' || one.does === 'climb-ladder')
        ? climbCount(one.does, used)
        : 0,
    );
    for (const [name, at, ms] of one.steps) {
      const lo = least.find(([n]) => n === name)?.[1] ?? 0;
      // A step played in no time is one not needed (the door open already).
      if (ms > 0 && ms < lo - 1)
        out.push({
          id: 'squeezed',
          who,
          does: one.does,
          atMs: at,
          why: `its ${name} plays ${ms} ms of its least ${lo}`,
        });
    }
    if (one.does === 'climb-stairs' || one.does === 'climb-ladder') {
      const feature = features.find((f) => f.id === one.feature);
      const count = feature ? climbCount(one.does, feature) : 0;
      const holds = footholds(one.does, feature?.affordances, count);
      const perch = feature?.perch?.wide;
      const top = holds[holds.length - 1];
      const topY = feature && top ? featurePoint(feature, 'wide', top) : null;
      if (!holds.length || !topY || (perch && Math.abs(topY[1] - perch.y) > 2))
        out.push({
          id: 'off-steps',
          who,
          does: one.does,
          atMs: one.at,
          why: !holds.length
            ? `the ${one.feature} has no treads to climb`
            : `its top tread is not where one up it stands (${topY ? Math.round(topY[1]) : '?'} against ${perch ? Math.round(perch.y) : '?'})`,
        });
    }
  }
  // Each door swung while someone's interaction has them at it: their hand on the handle.
  for (const [t, id, state] of scene.setting?.featureStates ?? []) {
    const at = all.filter(
      ({ one }) =>
        one.feature === id &&
        ON_HANDLE[one.does] &&
        t >= one.at - 50 &&
        t <= interactEnd(one) + 50 &&
        // Gone through, the door swings shut behind them on its own.
        !(one.does === 'go-through' && state === 'shut'),
    );
    if (!at.length) continue;
    const held = at.some(({ one }) =>
      (ON_HANDLE[one.does] ?? []).some((step) => {
        const span = stepSpan(one, step);
        return span !== null && t >= span[0] - 1 && t <= span[1] + 1;
      }),
    );
    // A go-through with the door already open reaches for nothing.
    const already = at.every(({ one }) => {
      const span = stepSpan(one, 'open');
      return one.does === 'go-through' && (!span || span[1] === span[0]);
    });
    if (!held && !already)
      out.push({
        id: 'off-handle',
        who: at[0].who,
        does: at[0].one.does,
        atMs: t,
        why: `the ${id} swings with no hand on its handle`,
      });
  }
  // Through a doorway only while it is open.
  const opening = (id: string, t: number) => openAt(scene, id, t);
  for (const { who, one } of all) {
    if (one.does !== 'go-through' && one.does !== 'come-through') continue;
    const passing = stepSpan(
      one,
      one.does === 'go-through' ? 'through' : 'out',
    );
    if (passing && passing[1] > passing[0]) {
      const mid = (passing[0] + passing[1]) / 2;
      if (!opening(one.feature, passing[0] + 1) || !opening(one.feature, mid))
        out.push({
          id: 'through-shut',
          who,
          does: one.does,
          atMs: Math.round(passing[0]),
          why: `goes through the ${one.feature} while it is shut`,
        });
    }
  }
  // Walking out or in by a door or a gate that stays shut.
  const hinged = new Set(
    features
      .filter((f) => f.kind === 'door' || f.kind === 'gate')
      .map((f) => f.id),
  );
  scene.steps.forEach((step, k) => {
    if (!k || step.cut) return;
    const going = [
      ...Object.entries(step.exit ?? {}).map(([who, e]) => ({
        who,
        via: e.via,
        how: e.how,
      })),
      ...Object.entries(step.enter ?? {}).map(([who, e]) => ({
        who,
        via: e.via,
        how: undefined,
      })),
    ];
    for (const { who, via, how } of going) {
      if (!via || !hinged.has(via) || how === 'squeeze' || how === 'through')
        continue;
      // Played by an interaction: checked above.
      if (
        (scene.acting?.[who]?.interact ?? []).some(
          (one) => one.feature === via && Math.abs(one.at - step.atMs) < 80,
        )
      )
        continue;
      if (!opening(via, step.atMs + 400))
        out.push({
          id: 'through-shut',
          who,
          does: 'walk',
          atMs: step.atMs,
          why: `walks through the ${via} while it is shut`,
        });
    }
  });
  return out;
}

/** The interaction faults in a line each, for our logs. */
export const describeInteractFaults = (faults: readonly InteractFault[]) =>
  faults.map((f) => `${f.id} ${f.who} ${f.does} @${f.atMs}: ${f.why}`);

/**
 * What the interactions of a scene show at `t`, in words for the picture
 * check (§2.6): "the door is open", "Ada is sitting at the table", "Ada
 * is climbing the stairs", "the light is on".
 */
export function interactClaims(
  scene: Pick<SceneDto, 'acting' | 'setting'>,
  t: number,
  nameOf: (id: string) => string,
): string[] {
  const out: string[] = [];
  const features = scene.setting?.features ?? [];
  const named = (id: string) =>
    features.find((f) => f.id === id)?.name ?? id.replace(/-/g, ' ');
  for (const [who, a] of Object.entries(scene.acting ?? {}))
    for (const one of a.interact ?? []) {
      const now = interactStepAt(one, t);
      const done = t >= interactEnd(one);
      const name = nameOf(who);
      const what = named(one.feature);
      if (
        one.does === 'sit-at' &&
        (now || done) &&
        !seatedLeft(scene, who, one, t)
      )
        out.push(`${name} is sitting at the ${what}`);
      else if (
        (one.does === 'climb-stairs' || one.does === 'climb-ladder') &&
        now
      )
        out.push(`${name} is climbing the ${what}`);
      else if (one.does === 'lean-on' && now?.step === 'hold')
        out.push(`${name} is leaning on the ${what}`);
      else if (
        one.does === 'go-through' &&
        now &&
        (now.step === 'reach' || now.step === 'open')
      )
        out.push(`${name} has a hand on the ${what}'s handle`);
      else if (one.does === 'go-through' && now?.step === 'through')
        out.push(`${name} is stepping through the ${what}`);
      else if (one.does === 'knock' && now?.step === 'knock')
        out.push(`${name} is knocking on the ${what}`);
    }
  for (const f of features)
    if (
      f.leaf &&
      openAt(scene, f.id, t) &&
      (scene.setting?.featureStates ?? []).some(
        ([at, id]) => id === f.id && at <= t,
      )
    )
      out.push(`the ${f.name} is open`);
  const lights = scene.setting?.lights ?? [];
  if (lights.length) {
    let on = lights[0][1] !== 'on';
    for (const [at, state] of lights) if (at <= t) on = state === 'on';
    out.push(on ? 'the light is on' : 'the light is off');
  }
  return out;
}

/** Whether someone sat at a table has got up from it again by `t`. */
function seatedLeft(
  scene: Pick<SceneDto, 'acting'>,
  who: string,
  sat: SceneInteractDto,
  t: number,
): boolean {
  return (scene.acting?.[who]?.interact ?? []).some(
    (one) =>
      one.does === 'stand-from' &&
      one.feature === sat.feature &&
      one.at > sat.at &&
      one.at <= t,
  );
}
