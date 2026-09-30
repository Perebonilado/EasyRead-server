/**
 * A Studio film's moment as a still (studio-scenery-plan §8.6): its set's
 * layers, each where the camera has it then (a far layer moved less than
 * the people, one before the camera more), the features the stage draws
 * and the people on the floor at their depths, drawn back to front by
 * their feet, and what stands before the camera over them. Each piece is
 * rendered on its own and laid in place, so no two drawings' ids or
 * styles ever meet in one document. A person the kit draws is posed as
 * they are then: their arms, written into the drawing as transforms, as
 * a renderer that knows no CSS variables never turns them.
 *
 * Everything but the rendering is a pure function of the scene and the
 * moment (stillPlan), so what a still shows can be checked without one.
 */
import type {
  SceneDto,
  ScenePlaceDto,
  SceneSetLayerDto,
} from '../../contracts';
import { DEPTH_TIE } from './scene-faces-seen';
import {
  CROWD_ID,
  crowdShown,
  featureSvgAt,
  hiddenAt,
  withoutStandIns,
} from './scene-compose';
import { posedDangles } from './scene-dangles';
import {
  FLOOR_BACK_F,
  FLOOR_FRONT_F,
  FRAME_H,
  FRAME_W,
  PARALLAX,
  angleLayer,
  anglePeople,
  floorFactor,
  isReverse,
  nearOf,
  reflectPlace,
  reflectRoom,
  roomOf,
  viewOf,
  type SetRoom,
  type View,
} from './scene-film';
import { viewOnly } from './scene-figure-views';
import {
  faceGroupsOf,
  faceInScene,
  hasRigFace,
  withRigFace,
} from './scene-face-draw';
import type { SceneEffectDto, SceneView } from '../../contracts';

export { FLOOR_BACK_F, FLOOR_FRONT_F, floorFactor };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The ground's own depth: a crowd in its set stands on it. */
const GROUND_DEPTH = 0.72;

/** The camera at a moment as the player moves it: a scale about a point, and a pan past the frame across a wide set. */
export interface StillCamera {
  s: number;
  cx: number;
  cy: number;
  px: number;
  span: [number, number];
}

/** The camera for a view, as the player's viewAt: the zoom kept inside the frame, the rest of the way across a pan. */
export function stillCamera(
  view: View,
  W: number,
  H: number,
  span: readonly [number, number] = [0, 0],
): StillCamera {
  const s = Math.max(1, view.s);
  const hw = W / (2 * s);
  const hh = H / (2 * s);
  const vx = Math.min(W - hw, Math.max(hw, view.x));
  const vy = Math.min(H - hh, Math.max(hh, view.y));
  const px = (view.x - vx) * s;
  const base =
    s <= 1.0001
      ? { s: 1, cx: W / 2, cy: H / 2 }
      : { s, cx: (W / 2 - s * vx) / (1 - s), cy: (H / 2 - s * vy) / (1 - s) };
  return { ...base, px, span: [span[0], span[1]] };
}

/** A layer at `depth`'s scale and pan under the camera: never past the set's edge (the player's panOf). */
function layerOf(cam: StillCamera, depth: number): { s: number; pan: number } {
  const s = 1 + (cam.s - 1) * depth;
  const pan = Math.min(
    cam.span[1] * s,
    Math.max(-cam.span[0] * s, cam.px * depth),
  );
  return { s, pan };
}

/** Where a box of the stage shows in the frame, on a layer at `depth`. */
export function onScreen(cam: StillCamera, depth: number, box: Box): Box {
  const { s, pan } = layerOf(cam, depth);
  return {
    x: cam.cx + s * (box.x - cam.cx) - pan,
    y: cam.cy + s * (box.y - cam.cy),
    w: box.w * s,
    h: box.h * s,
  };
}

/** What of a layer at `depth` the frame shows, in stage units: its left, top, width and height. */
export function layerWindow(
  cam: StillCamera,
  depth: number,
  W: number,
  H: number,
): Box {
  const { s, pan } = layerOf(cam, depth);
  return {
    x: cam.cx + (pan - cam.cx) / s,
    y: cam.cy - cam.cy / s,
    w: W / s,
    h: H / s,
  };
}

/** The step drawn at `t`: in a film, the first before it begins. */
export function stepAtMoment(scene: SceneDto, t: number): number {
  let k = 0;
  scene.steps.forEach((step, i) => {
    if (step.atMs <= t) k = i;
  });
  return k;
}

/**
 * Where the camera looks at `t`, as the film shows it: the shot on then
 * (a zoom held until its end), else the wide shot, which on a wide set is
 * on where the action is. The player's camera without its life (the slow
 * push, the lean, the moves), which a still does not need.
 */
export function viewAtMoment(scene: SceneDto, t: number, room: SetRoom): View {
  const { w: W, h: H, places } = scene.stagings.wide;
  const k = stepAtMoment(scene, t);
  const step = scene.steps[k];
  return viewOf(
    shotAtMoment(scene, t),
    step?.show ?? [],
    places[k] ?? {},
    W,
    H,
    room,
  );
}

/** The shot on at `t`, if any: a zoom held until its end. */
export function shotAtMoment(
  scene: SceneDto,
  t: number,
): SceneEffectDto | null {
  return (
    scene.effects.find(
      (e) =>
        e.do === 'zoom' &&
        e.atMs <= t &&
        t <
          (e.untilMs ??
            scene.steps.find((s) => s.atMs > e.atMs)?.atMs ??
            Infinity),
    ) ?? null
  );
}

/**
 * The view of someone drawn from every side at `t` (studio-views-plan
 * §2): their view timeline's key then, and whether it is mirrored (facing
 * left). The front, unmirrored, for anyone else. A still shows the view
 * a turn is going to, not the steps of it.
 */
export function viewInStill(
  scene: Pick<SceneDto, 'acting'>,
  id: string,
  t: number,
): { view: SceneView; mirror: 1 | -1 } {
  let key: [number, SceneView, 1 | -1] | undefined;
  for (const one of scene.acting?.[id]?.view ?? []) if (one[0] <= t) key = one;
  return key ? { view: key[1], mirror: key[2] } : { view: 'front', mirror: 1 };
}

/** A person the kit draws, posed: each arm, and each forearm, turned by so many degrees about its shoulder and elbow. */
export interface StillPose {
  ar: number;
  arf: number;
  al: number;
  alf: number;
}
const AT_REST: StillPose = { ar: 0, arf: 0, al: 0, alf: 0 };

/**
 * How someone the kit draws holds their arms at `t`, from the moves they
 * are making then, at their fullest (the player's actBody): a point, a
 * wave, a reach, a hug, a clap, a hop for joy, a hand opened out; a line's
 * acting (scene-performance): a raised palm, a wagging finger, a fist,
 * hands clasped, a hand on the chest, a shrug, a flinch, a take. At rest
 * otherwise.
 */
export function stillPose(scene: SceneDto, id: string, t: number): StillPose {
  const pose = { ...AT_REST };
  for (const [at, move, ms] of scene.acting?.[id]?.moves ?? []) {
    if (t < at || t > at + ms) continue;
    if (move === 'point') pose.ar -= 84;
    else if (move === 'point-up') {
      pose.ar -= 100;
      pose.arf -= 12;
    } else if (move === 'wave') {
      pose.ar -= 85;
      pose.arf -= 50;
    } else if (move === 'reach') {
      pose.ar -= 72;
      pose.arf -= 8;
    } else if (move === 'gesture') {
      pose.ar -= 28;
      pose.arf -= 42;
    } else if (move === 'gesture-left') {
      pose.al += 28;
      pose.alf += 42;
    } else if (move === 'hug') {
      pose.ar -= 95;
      pose.arf += 35;
      pose.al -= 50;
      pose.alf -= 40;
    } else if (move === 'clap') {
      pose.ar -= 12;
      pose.arf += 90;
      pose.al += 12;
      pose.alf -= 90;
    } else if (move === 'hop') {
      pose.ar -= 115;
      pose.al += 115;
    } else if (move === 'palm-out') {
      pose.ar -= 58;
      pose.arf -= 62;
    } else if (move === 'wag-finger') {
      pose.ar -= 62;
      pose.arf -= 70;
    } else if (move === 'fist') {
      pose.ar -= 42;
      pose.arf -= 92;
    } else if (move === 'plead') {
      pose.ar -= 16;
      pose.arf += 92;
      pose.al += 16;
      pose.alf -= 92;
    } else if (move === 'hand-chest') {
      pose.ar -= 8;
      pose.arf += 84;
    } else if (move === 'flinch') {
      pose.ar -= 20;
      pose.arf += 40;
      pose.al += 20;
      pose.alf -= 40;
    } else if (move === 'take') {
      pose.ar -= 30;
      pose.al += 30;
    } else if (move === 'shrug') {
      pose.ar -= 26;
      pose.arf -= 34;
      pose.al += 26;
      pose.alf += 34;
    }
  }
  return pose;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A kit drawing with its arms turned as `pose` says, written in as
 * transforms about each shoulder and elbow (where its style puts their
 * origins): for a still, since a renderer that knows no CSS variables
 * never turns them. Its dangles as drawn (posedDangles). One at rest is
 * as drawn.
 */
export function posedRig(svg: string, pose: StillPose): string {
  let arm: 'r' | 'l' | null = null;
  const turned = svg.replace(
    /<g class="(arm a([rl])|fore)" style="transform-origin:(-?[\d.]+)px (-?[\d.]+)px">/g,
    (whole, cls: string, side: string | undefined, x: string, y: string) => {
      let deg = 0;
      if (side === 'r' || side === 'l') {
        arm = side;
        deg = side === 'r' ? pose.ar : pose.al;
      } else if (arm) deg = arm === 'r' ? pose.arf : pose.alf;
      if (!deg) return whole;
      // Its class dropped with its style: a renderer's own reading of the
      // CSS that turns it by its variable would undo the turn.
      return `<g data-rig="${cls}" transform="rotate(${r2(deg)} ${x} ${y})">`;
    },
  );
  return posedDangles(turned, 0);
}

/** The views other than the front, whose groups' ids end in their name. */
const SIDE_VIEWS = ['3q', 'profile', 'back3q', 'back'] as const;

/** How long a thing of the set takes to fade, as the player fades it: its FORE_FADE_MS. */
const FADE_MS = 240;
/** How faint a fade without a level leaves it: the player's FORE_FADED. */
const FADED_TO = 0.4;

/** How strongly a group of the set is drawn at `t`: faded as the scene's fades say, as the player fades it. */
export function fadeAt(scene: SceneDto, id: string, t: number): number {
  let out = 1;
  for (const [from, to, which, level] of scene.setting?.fades ?? []) {
    if (which !== id) continue;
    const k = Math.min(
      Math.max(0, Math.min(1, (t - from + FADE_MS) / FADE_MS)),
      Math.max(0, Math.min(1, (to + FADE_MS - t) / FADE_MS)),
    );
    out = Math.min(out, 1 - (1 - (level ?? FADED_TO)) * k);
  }
  return out;
}

/** A layer's drawing with its groups faded as they are at `t`. */
function fadedLayer(scene: SceneDto, svg: string, t: number): string {
  const rules = [...new Set((scene.setting?.fades ?? []).map((f) => f[2]))]
    .map((id) => [id, fadeAt(scene, id, t)] as const)
    .filter(([id, k]) => k < 0.999 && svg.includes(`id="${id}"`))
    .map(([id, k]) => `[id="${id.replace(/"/g, '')}"]{opacity:${r2(k)}}`);
  return rules.length
    ? svg.replace(/(<svg\b[^>]*>)/i, `$1<style>${rules.join('')}</style>`)
    : svg;
}

/** A drawing's viewBox set to a window of it. */
const windowed = (svg: string, box: Box) =>
  svg.replace(
    /(<svg\b[^>]*?)\sviewBox="[^"]*"/i,
    `$1 viewBox="${r2(box.x)} ${r2(box.y)} ${r2(box.w)} ${r2(box.h)}"`,
  );

/** One piece of a still: what it is, its drawing as rendered on its own, where it lies in the frame, and how wide it is rendered. */
export interface StillPart {
  key: string;
  kind: 'layer' | 'crowd' | 'feature' | 'thing';
  svg: string;
  box: Box;
  width: number;
  /** A layer's depth; a floor thing's depth factor. */
  depth: number;
  /** On the floor: where its feet are, in stage units, for the order it is drawn in. */
  feet?: number;
  /** Drawn the other way round: someone facing left, as their view has them. */
  mirror?: true;
  /** A little soft: someone cheated near the camera, over whose shoulder the shot looks. */
  soft?: true;
  /** A person drawn from every side: the view the still shows. */
  view?: SceneView;
}

export interface StillPlan {
  W: number;
  H: number;
  t: number;
  step: number;
  view: View;
  camera: StillCamera;
  /** Back to front. */
  parts: StillPart[];
  /** Who is on the stage then. */
  shows: string[];
}

/**
 * What a still of the film at `t` is made of, back to front, `width`
 * pixels wide: the set's layers behind the floor, each a window of it as
 * the camera has its depth then; the set's crowd on its ground; the
 * features the stage draws, the people and the set's floor layer, by
 * their feet, each where its depth on the floor puts it; the layers
 * before the camera over all. A set made before the layers is its one
 * picture, as far off as the player moves it.
 */
export function stillPlan(
  scene: SceneDto,
  t: number,
  width = 960,
  /** The moment as the player has it, where known: its camera, and where each one is (on their way somewhere). */
  at: { camera?: StillCamera; places?: Record<string, ScenePlaceDto> } = {},
): StillPlan {
  const { w: W, h: H, places } = scene.stagings.wide;
  const scale = width / W;
  const k = stepAtMoment(scene, t);
  const step = scene.steps[k];
  const set = step?.backdrop
    ? scene.things.find((one) => one.id === step.backdrop)
    : undefined;
  const drawnSet = set?.kind === 'drawing' ? set : undefined;
  const room = roomOf(drawnSet ?? null, W, H);
  const view = viewAtMoment(scene, t, room);
  // The shot's grammar (studio-views-plan §3): whom it cheats near the
  // camera, and a low or high angle; and from the place's other side
  // (§4.2), its reverse layers, the stage reflected.
  const shot = shotAtMoment(scene, t);
  const turned = isReverse(shot) && Boolean(drawnSet?.reverse?.layers.length);
  const camera =
    at.camera ??
    stillCamera(view, W, H, turned ? reflectRoom(room, W).span : room.span);
  /** Where a place on the stage is in the picture: reflected, turned round. */
  const side = <T extends Box>(box: T): T =>
    turned ? reflectPlace(box, W) : box;
  const near = nearOf(shot, step?.show ?? [], places[k] ?? {}, W, H, room);
  const angle = shot?.shot?.angle;
  /** A layer's window under a low or high angle: scaled about the frame's top or bottom, the farther off the more. */
  const tilted = (window: Box, depth: number): Box => {
    const { k: g, pivot } = angleLayer(angle, depth);
    if (g === 1) return window;
    const w = window.w / g;
    const h = window.h / g;
    return {
      x: window.x + (window.w - w) / 2,
      y: pivot === 0 ? window.y : window.y + window.h - h,
      w,
      h,
    };
  };
  // The set covers the stage: its units to the stage's.
  const unit = Math.max(W / FRAME_W, H / FRAME_H);
  const left = (W - FRAME_W * unit) / 2;
  const top = (H - FRAME_H * unit) / 2;
  const toSet = (b: Box): Box => ({
    x: (b.x - left) / unit,
    y: (b.y - top) / unit,
    w: b.w / unit,
    h: b.h / unit,
  });
  const floor: [number, number] | null = drawnSet?.floor
    ? [top + drawnSet.floor[0] * unit, top + drawnSet.floor[1] * unit]
    : null;
  const frame: Box = { x: 0, y: 0, w: W, h: H };
  const behind: StillPart[] = [];
  const onFloor: StillPart[] = [];
  const before: StillPart[] = [];
  if (drawnSet) {
    const layers: SceneSetLayerDto[] =
      turned && drawnSet.reverse
        ? drawnSet.reverse.layers
        : drawnSet.layers?.length
          ? drawnSet.layers
          : [{ id: 'flat', depth: PARALLAX, svg: drawnSet.svg }];
    for (const layer of layers) {
      const svg = windowed(
        withoutStandIns(scene, layer.svg),
        toSet(
          layer.id === 'floor' || layer.depth > 1
            ? layerWindow(camera, layer.id === 'floor' ? 1 : layer.depth, W, H)
            : tilted(layerWindow(camera, layer.depth, W, H), layer.depth),
        ),
      );
      const part: StillPart = {
        key: `layer:${layer.id}`,
        kind: 'layer',
        svg: fadedLayer(scene, svg, t),
        box: frame,
        width,
        depth: layer.depth,
      };
      if (layer.id === 'floor') {
        const feet = layer.feet !== undefined ? top + layer.feet * unit : H;
        const f = floorFactor(feet, floor);
        onFloor.push({
          ...part,
          svg: fadedLayer(
            scene,
            windowed(
              withoutStandIns(scene, layer.svg),
              toSet(layerWindow(camera, f, W, H)),
            ),
            t,
          ),
          depth: f,
          feet,
        });
      } else if (layer.depth > 1) before.push(part);
      else behind.push(part);
    }
  }
  // Its crowd, in its set's frame, on its ground (the front's only: from
  // the other side, the player leaves it out too).
  const crowd =
    crowdShown(scene, k) && !turned
      ? scene.things.find((one) => one.id === CROWD_ID)
      : undefined;
  if (crowd?.kind === 'drawing')
    behind.push({
      key: 'crowd',
      kind: 'crowd',
      svg: windowed(
        crowd.svg,
        toSet(tilted(layerWindow(camera, GROUND_DEPTH, W, H), GROUND_DEPTH)),
      ),
      box: frame,
      width,
      depth: GROUND_DEPTH,
    });
  behind.sort((a, b) => a.depth - b.depth);
  // The features the stage draws, as open as they are then.
  for (const feature of scene.setting?.features ?? []) {
    const svg = featureSvgAt(scene, feature, t);
    const at = side(feature.at.wide);
    if (!svg || at.w <= 0 || at.h <= 0) continue;
    const feet = feature.feet?.wide ?? at.y + at.h;
    const f = floorFactor(feet, floor);
    onFloor.push({
      key: `feature:${feature.id}`,
      kind: 'feature',
      svg,
      box: onScreen(camera, f, at),
      width: Math.max(48, Math.round(at.w * camera.s * scale * 2)),
      depth: f,
      feet,
      // From the other side, seen the other way round.
      ...(turned ? { mirror: true as const } : {}),
    });
  }
  // The people, posed as they are then, their hidden parts hidden.
  const shows: string[] = [];
  for (const id of step?.show ?? []) {
    const thing = scene.things.find((one) => one.id === id);
    const cheated = near?.id === id ? near.place : null;
    const stood = at.places?.[id] ?? places[k]?.[id];
    const place: ScenePlaceDto | undefined = cheated ?? (stood && side(stood));
    if (thing?.kind !== 'drawing' || !place || thing.backdrop) continue;
    if (place.w > W * 0.6 && !cheated) continue;
    shows.push(id);
    // Drawn from every side, a state is hidden in every view: its groups
    // are the front's ids with the view after them.
    const sided = thing.rigVersion === 3 && (thing.views?.length ?? 0) > 1;
    const hidden = hiddenAt(scene, thing, t).flatMap((h) =>
      sided ? [h, ...SIDE_VIEWS.map((view) => `${h}--${view}`)] : [h],
    );
    const hide = hidden.length
      ? `<style>${hidden.map((h) => `[id="${h.replace(/"/g, '')}"]`).join(',')}{display:none}</style>`
      : '';
    let svg = hide
      ? thing.svg.replace(/(<svg\b[^>]*>)/i, `$1${hide}`)
      : thing.svg;
    // Drawn from every side: the view they are in then, the other way
    // round facing left (their arms as the frame has them, mirrored).
    const seen = sided ? viewInStill(scene, id, t) : null;
    if (seen) svg = viewOnly(svg, seen.view);
    // One with no views, from the other side, is seen the other way round.
    const mirrored = seen ? seen.mirror === -1 : turned;
    // A face of moving parts: as the player has it then (scene-face-draw),
    // the kit's swapped faces hidden in every view.
    if (hasRigFace(svg))
      svg = withRigFace(svg, faceInScene(scene, id, t), faceGroupsOf(thing));
    if (thing.rig) {
      const pose = stillPose(scene, id, t);
      svg = posedRig(
        svg,
        mirrored
          ? { ar: -pose.al, arf: -pose.alf, al: -pose.ar, alf: -pose.arf }
          : pose,
      );
    }
    const feet = place.y + place.h;
    // One cheated near the camera stands where the shot puts them, before
    // the floor: moved as the people are.
    const f = cheated ? 1 : floorFactor(feet, floor);
    const grown = anglePeople(angle);
    const box = onScreen(camera, f, place);
    onFloor.push({
      key: `thing:${id}`,
      kind: 'thing',
      svg,
      box:
        grown === 1
          ? box
          : {
              x: box.x + (box.w * (1 - grown)) / 2,
              y: box.y + box.h * (1 - grown),
              w: box.w * grown,
              h: box.h * grown,
            },
      width: Math.max(48, Math.round(place.w * camera.s * scale * 2)),
      depth: f,
      // Cheated near the camera: before everyone.
      feet: cheated ? H * 4 : feet,
      ...(mirrored ? { mirror: true as const } : {}),
      ...(cheated && near?.soft ? { soft: true as const } : {}),
      ...(seen ? { view: seen.view } : {}),
    });
  }
  // Back to front by their feet, as the player draws them: a feature the
  // stage draws is over only those farther off than it by more than a
  // tie (someone beside it stands before it).
  const tie = H * DEPTH_TIE;
  const orderOf = (part: StillPart) =>
    (part.feet ?? 0) - (part.kind === 'feature' ? tie + 0.01 : 0);
  onFloor.sort((a, b) => orderOf(a) - orderOf(b));
  before.sort((a, b) => a.depth - b.depth);
  return {
    W,
    H,
    t,
    step: k,
    view,
    camera,
    parts: [...behind, ...onFloor, ...before],
    shows,
  };
}

/** The still's paper, under everything: the stage's ground. */
const PAPER = '#FBF7EF';
/** How soft one cheated near the camera is, in the stage's units (the player's NEAR_SOFT_PX). */
const SOFT_PX = 2.5;

/** A still as one SVG from its parts' PNGs (by key): each laid where the plan puts it. A part with no PNG is left out. */
export function stillSvg(
  plan: StillPlan,
  pngs: ReadonlyMap<string, Buffer>,
): string {
  const images = plan.parts.flatMap((part) => {
    const png = pngs.get(part.key);
    if (!png) return [];
    const { x, y, w, h } = part.box;
    // Someone stands on the foot of their box, where the floor, their
    // shadow and the order they are drawn in have their feet, whatever
    // the box's shape: never lifted into its middle.
    const fit =
      part.kind === 'layer' || part.kind === 'crowd' || part.kind === 'feature'
        ? ' preserveAspectRatio="none"'
        : ' preserveAspectRatio="xMidYMax meet"';
    // Facing left: drawn the other way round about the middle of its box.
    const turned = part.mirror
      ? ` transform="translate(${r2(2 * x + w)} 0) scale(-1 1)"`
      : '';
    const soft = part.soft ? ' filter="url(#still-soft)"' : '';
    return [
      `<image x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"${fit}${turned}${soft} href="data:image/png;base64,${png.toString('base64')}"/>`,
    ];
  });
  const defs = plan.parts.some((part) => part.soft)
    ? `<defs><filter id="still-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${r2(SOFT_PX * (plan.W / 1600))}"/></filter></defs>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plan.W} ${plan.H}">${defs}<rect width="${plan.W}" height="${plan.H}" fill="${PAPER}"/>${images.join('')}</svg>`;
}

/**
 * A still of the film at `t`, as a PNG `width` pixels wide: each part
 * rendered alone by `raster` (a drawing's SVG to a PNG that wide), laid
 * in place, and the whole rendered. A part that will not render is left
 * out; the rest is still a still.
 */
export async function renderStill(
  scene: SceneDto,
  t: number,
  raster: (svg: string, width: number) => Promise<Buffer>,
  width = 960,
  at: Parameters<typeof stillPlan>[3] = {},
): Promise<{ png: Buffer; plan: StillPlan }> {
  const plan = stillPlan(scene, t, width, at);
  const pngs = new Map<string, Buffer>();
  await Promise.all(
    plan.parts.map((part) =>
      raster(part.svg, part.width).then(
        (png) => pngs.set(part.key, png),
        // Left out of the still.
        () => undefined,
      ),
    ),
  );
  return { png: await raster(stillSvg(plan, pngs), width), plan };
}
