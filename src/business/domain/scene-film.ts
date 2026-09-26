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

/** The player's timings, in milliseconds. */
const MOVE_MS = 700;
const ENTER_MS = 520;
const EXIT_MS = 380;
const STAGGER_MS = 180;
const CLEAR_FIRST_MS = 190;
const POINT_MS = 1700;
const PULSE_MS = 700;
/** A walk across the whole stage, and the shortest and longest walk. */
const WALK_STAGE_MS = 4000;
const WALK_MIN_MS = 1100;
const WALK_MAX_MS = 3400;

const walkMs = (dx: number, W: number) =>
  Math.min(
    WALK_MAX_MS,
    Math.max(WALK_MIN_MS, (Math.abs(dx) / W) * WALK_STAGE_MS),
  );

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
  >,
): number {
  const { steps, stagings } = scene;
  const { w: W, places } = stagings.wide;
  const beats = scene.beats;
  let at = beats.length ? beats[beats.length - 1].endMs : scene.durationMs;
  const walks = (id: string) => scene.acting?.[id]?.walks === true;
  /** Where someone just off the stage stands: off the nearer side. */
  const offside = (place: ScenePlaceDto) =>
    place.x + place.w / 2 < W / 2 ? -place.w * 1.02 : W + place.w * 0.02;
  steps.forEach((step, k) => {
    at = Math.max(at, step.atMs);
    for (const id of newcomersAt(steps, k)) {
      const place = places[k]?.[id];
      const start = entryStart(steps, k, id);
      if (place && walks(id) && step.enter[id]?.how !== 'fade')
        at = Math.max(at, start + walkMs(place.x - offside(place), W));
      else at = Math.max(at, start + ENTER_MS);
    }
    for (const id of leaversAt(steps, k)) {
      const place = places[k - 1]?.[id];
      if (place && walks(id) && !step.cut)
        at = Math.max(at, step.atMs + walkMs(offside(place) - place.x, W));
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
            (walks(id) && Math.abs(to.x - from.x) > W * 0.02
              ? walkMs(to.x - from.x, W)
              : MOVE_MS),
        );
      }
  });
  for (const acting of Object.values(scene.acting ?? {}))
    for (const [start, , ms] of acting.moves ?? [])
      at = Math.max(at, start + ms);
  for (const [start, , ms] of scene.setting?.crowd?.moves ?? [])
    at = Math.max(at, start + ms);
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

/** A view kept inside the stage. */
function settle(view: View, W: number, H: number): View {
  const s = Math.max(1, view.s);
  const hw = W / (2 * s);
  const hh = H / (2 * s);
  return {
    s,
    x: Math.min(W - hw, Math.max(hw, view.x)),
    y: Math.min(H - hh, Math.max(hh, view.y)),
  };
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
): View {
  const wide = { s: 1, x: W / 2, y: H / 2 };
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
  );
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
  wide: { w: number; h: number; places: Record<string, ScenePlaceDto>[] },
  durationMs: number,
): SceneEffectDto[] {
  const { w: W, h: H, places } = wide;
  /** Where a shot (null: the whole stage) looks at `t`. */
  const view = (shot: SceneEffectDto | null, t: number) => {
    let k = 0;
    steps.forEach((step, i) => {
      if (step.atMs <= t) k = i;
    });
    return viewOf(shot, steps[k]?.show ?? [], places[k] ?? {}, W, H);
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
