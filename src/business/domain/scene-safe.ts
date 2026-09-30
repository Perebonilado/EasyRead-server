/**
 * The tall shot check (studio-vertical-plan §6.1, §6.3): a tall film's
 * shots as the phone shows them, looked at every SAFE_EVERY_MS, for the
 * key character then (whoever is saying a line, else whom the shot is on,
 * else whom the camera rests on):
 *
 *  - never far off: their figure, crown to feet, fills at least
 *    TALL_FIGURE_LEAST of the frame's height (Richard's decision of
 *    2026-09-30: no wide, long or establishing shots in a tall film, and
 *    nothing that ends far off);
 *  - their face inside the safe box the platforms' own buttons and
 *    captions leave (scene-shape SAFE), and above the subtitles' band;
 *  - their head whole in the frame, never cut at its top or its sides;
 *  - and no one else cut in half at a side edge of the frame (the one
 *    cheated near the camera over a shoulder, or in deep staging, is the
 *    shot's own, cropped on purpose).
 *
 * Pure, on the made SceneDto, as the space check is: its framings are
 * the camera's own (scene-film viewOf, nearOf), so what it judges is what
 * the player shows. A wide scene has no such check (none is returned).
 * The tall framings keep all this by construction; this is the backstop,
 * its faults said as staging notes for the picture check to look at.
 */
import type { SceneDto, ScenePlaceDto } from '../../contracts';
import {
  IN_BOX,
  SAFE,
  SUBTITLE_BAND,
  TALL_FIGURE_LEAST,
  figureShare,
  shapeOf,
} from './scene-shape';
import { TALL_CUTS, nearOf, restOn, roomOf } from './scene-film';
import { onScreen, type Box } from './scene-faces-seen';
import { shotAtMoment, stepAtMoment, viewAtMoment } from './scene-still';

/** How often a tall film is looked at. */
export const SAFE_EVERY_MS = 100;

/** What can be wrong with a tall shot. */
export type TallFault = 'far' | 'face' | 'cropped' | 'halved';

/** A tall shot's fault, from when until when, and whose. */
export interface TallShotFault {
  kind: TallFault;
  who: string;
  fromMs: number;
  toMs: number;
  /** The worst of it: for `far`, the least share of the height their figure filled. */
  least?: number;
}

/** Someone's head in their box: crown to chin, the box's middle half across. */
export const headOf = (p: Box): Box => ({
  x: p.x + p.w * IN_BOX.headLeft,
  y: p.y + p.h * IN_BOX.crown,
  w: p.w * (IN_BOX.headRight - IN_BOX.headLeft),
  h: p.h * (IN_BOX.chin - IN_BOX.crown),
});

/** Who the key character is at `t`: saying a line then, else whom the shot is on, else whom the camera rests on. */
export function keyAt(scene: SceneDto, t: number): string | null {
  const k = stepAtMoment(scene, t);
  const show = scene.steps[k]?.show ?? [];
  const saying = scene.effects.find(
    (e) =>
      e.do === 'say' &&
      e.say &&
      !e.say.from &&
      e.atMs <= t &&
      t < (e.say.saidUntilMs ?? e.say.untilMs) &&
      show.includes(e.target),
  );
  if (saying) return saying.target;
  const shot = shotAtMoment(scene, t);
  if (shot && shot.shot?.kind !== 'insert' && show.includes(shot.target))
    return shot.target;
  return restOn(scene, k);
}

/** The people on the stage at step k: whoever is drawn with a rig, or stands among them (not the set, not a thing). */
function peopleAt(scene: SceneDto, k: number): string[] {
  const rigged = new Set(
    scene.things.flatMap((t) => (t.kind === 'drawing' && t.rig ? [t.id] : [])),
  );
  const speakers = new Set(
    scene.effects.flatMap((e) => (e.do === 'say' ? [e.target] : [])),
  );
  return (scene.steps[k]?.show ?? []).filter(
    (id) => rigged.has(id) || speakers.has(id),
  );
}

/**
 * Every fault of a tall film's shots, as the module says, each run of
 * moments it holds for one person merged into one. None for a wide film.
 */
export function tallShotFaults(scene: SceneDto): TallShotFault[] {
  if (shapeOf(scene) !== 'tall') return [];
  const { w: W, h: H, places } = scene.stagings.wide;
  const safe = SAFE.tall;
  const faceBox = {
    x0: W * safe.left,
    x1: W * (1 - safe.right),
    y0: H * safe.top,
    y1: H * SUBTITLE_BAND.tall.from,
  };
  const out: TallShotFault[] = [];
  const open = new Map<string, TallShotFault>();
  const mark = (kind: TallFault, who: string, t: number, least?: number) => {
    const key = `${kind}:${who}`;
    const run = open.get(key);
    if (run && run.toMs >= t - SAFE_EVERY_MS - 1) {
      run.toMs = t;
      if (least !== undefined) run.least = Math.min(run.least ?? least, least);
      return;
    }
    const one: TallShotFault = {
      kind,
      who,
      fromMs: t,
      toMs: t,
      ...(least !== undefined ? { least } : {}),
    };
    open.set(key, one);
    out.push(one);
  };
  for (let t = 0; t < scene.durationMs; t += SAFE_EVERY_MS) {
    const k = stepAtMoment(scene, t);
    const step = scene.steps[k];
    const at = places[k];
    if (!step || !at) continue;
    const set = step.backdrop
      ? scene.things.find((one) => one.id === step.backdrop)
      : undefined;
    const room = roomOf(set?.kind === 'drawing' ? set : null, W, H);
    const shot = shotAtMoment(scene, t);
    // An insert is on a thing: no one is its key.
    if (shot?.shot?.kind === 'insert') continue;
    const view = viewAtMoment(scene, t, room);
    const near = nearOf(shot, step.show, at, W, H, room);
    const placeOf = (id: string): ScenePlaceDto | undefined =>
      near?.id === id ? near.place : at[id];
    const screen = (box: Box) => onScreen(box, view, 1, W, H, room.span);
    const key = keyAt(scene, t);
    const mine = key ? placeOf(key) : undefined;
    if (key && mine) {
      // Cheated near the camera, they are the size the cheat makes them.
      const share = figureShare(mine.h, view.s, H);
      if (share < TALL_FIGURE_LEAST - 0.005) mark('far', key, t, share);
      const head = screen(headOf(mine));
      if (near?.id !== key || !near.soft) {
        if (
          head.x < faceBox.x0 ||
          head.x + head.w > faceBox.x1 ||
          head.y < faceBox.y0 ||
          head.y + head.h > faceBox.y1
        )
          mark('face', key, t);
        if (
          head.y < 0 ||
          head.x < 0 ||
          head.x + head.w > W ||
          head.y + head.h > H
        )
          mark('cropped', key, t);
      }
    }
    for (const id of peopleAt(scene, k)) {
      if (id === near?.id) continue;
      const place = at[id];
      if (!place) continue;
      // Cut by the frame's side: half their body, or part of their face.
      const box = screen(place);
      const cut = TALL_CUTS.some((part) => {
        const b0 = box.x + box.w * part.from;
        const b1 = box.x + box.w * part.to;
        const k = (Math.min(W, b1) - Math.max(0, b0)) / Math.max(1, b1 - b0);
        return (b0 < 0 || b1 > W) && k > part.least && k < part.most;
      });
      if (cut) mark('halved', id, t);
    }
  }
  return out;
}

/** A tall shot's faults as staging notes: what, whose, and when. */
export function describeTallShots(
  faults: readonly TallShotFault[],
  name: (id: string) => string,
): string[] {
  const secs = (ms: number) => (ms / 1000).toFixed(1);
  return faults.map((f) => {
    const when = `${secs(f.fromMs)}–${secs(f.toMs)} s`;
    const who = name(f.who);
    switch (f.kind) {
      case 'far':
        return `tall: at ${when} ${who} is too far off, their figure ${Math.round((f.least ?? 0) * 100)}% of the frame's height (a medium or closer, at least ${Math.round(TALL_FIGURE_LEAST * 100)}%)`;
      case 'face':
        return `tall: at ${when} ${who}'s face is outside the phone's safe box, or in the subtitles' band`;
      case 'cropped':
        return `tall: at ${when} ${who}'s head is cut by the frame's edge`;
      default:
        return `tall: at ${when} ${who} is cut by the frame's side (half their body, or their face)`;
    }
  });
}
