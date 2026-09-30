/**
 * A crowd, drawn by code as the set's own background art: the people a
 * busy place has, standing on its painted ground in perspective against
 * the story's own people, drawn by the figure kit in the house style. A
 * story says "crowds followed him" and the stage shows them, at no cost
 * to anyone: no model is asked.
 *
 * One camera sizes everyone. The story's people stand with their feet on
 * one line at one scale; the set's ground runs back to a horizon, the far
 * edge of its open ground, never far over the leads' eye line. Someone whose
 * feet are at y is drawn at scale × (y − horizon) / (feet − horizon), and
 * nothing else sets anyone's size, so the farther back, the smaller and
 * the higher, as far off people are. They stand in rows by depth, in
 * small groups rather than lines, only on the open ground (never on a
 * stall or a wall), and never where a head would sit beside one of the
 * story's faces, in any step, in either staging, or close in.
 *
 * The farther off, the less of them is drawn: a shape at the back, dark
 * dots for eyes in the middle, the kit's own face at the front; and the
 * paler and cooler, faded toward the distance's colour, baked into the
 * drawing. They breathe, sway, glance about, talk in their groups, and a
 * few wander; they cheer or gasp at the moments given, each a moment
 * apart. The crowd is drawn in the set's own frame, so the stage lays it
 * over the set exactly as it lays the set, moves it with the set's camera
 * and lights it with the set's light.
 */
import {
  drawExtra,
  extraFor,
  rigOf,
  type ExtraDetail,
  type ExtraView,
  type FigurePose,
  type FigureProp,
  type FigureSpec,
} from './scene-figure';
import { GROUND_COLS, behindAt, topAt, type SetGround } from './scene-ground';
import type { PlaceKind, StoryWorld } from './scene-story';
import { SET_FRAMES, worldHeightOf } from './scene-shape';

/** A share of the depth from the horizon to the story's people's feet past which no one in a crowd stands: they are never more than this share of their size. */
export const MOST_DEPTH = 0.45;
/** The same in a room or a vessel, whose far wall is near: those at the back of it stand nearer. */
export const MOST_DEPTH_INDOORS = 0.65;
/** Who stands nearest is drawn in full at this height on the stage, in pixels (a grown-up's); with dots for eyes from the next; a shape below it. */
export const DETAIL_PX = { face: 150, dots: 90 } as const;
/** A body's width, arms and all, in the kit's units. */
const BODY = 96;
/** A grown-up's height in the kit's units. */
const ADULT = -rigOf('adult').top;
/** Where the story's people stand, and their scale, on a stage with none standing: the layout's own, as shares of a wide frame's height (a tall frame's feet are its own; its scale the same world's, scene-shape). */
const USUAL = { feet: 820 / 900, unit: 2.357 / 900 };
/** How much nearer than their row someone may stand, to stand in front of what is on the ground. */
const PUSH = 0.1;
/** How far over the leads' eye line the horizon may be: a share of the height. */
const HORIZON_ROOM = 0.05;
const INK = '#2d2a32';

/** Someone of the story's, where they stand at one moment, in the set's units. */
export interface CastAt {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Their head's middle: where their face is. */
  head: [number, number] | null;
  /** Drawn by the kit, whose face is wider in its box than an artist's drawing's. */
  rig: boolean;
  /** Someone who stands with people: where their feet are, and the set's units to one of the kit's. */
  stands: { feet: number; unit: number } | null;
  /** One of the story's leads (not a minor character), and whether a child. */
  lead: boolean;
  child: boolean;
}

/** What a crowd is planned from. */
export interface CrowdInput {
  size: 'few' | 'many';
  kind: PlaceKind;
  ground: SetGround;
  /** The set's frame, its viewBox: the crowd's too. */
  frame: [number, number, number, number];
  /** The stage's pixels to one of the set's units, as the wide stage shows it. */
  scale?: number;
  /**
   * Every stretch the crowd is seen in, in each staging: who stands where,
   * and its share of the time (all of them together 1). The camera is the
   * wide staging's, where there is one. A stretch the camera is close in
   * (`close`) has the story's people where they show against the set,
   * larger than they stand: kept clear of, but not measured from.
   */
  seen: { share: number; cast: CastAt[]; wide?: boolean; close?: boolean }[];
  /** The place's own: the same regulars there every time the story comes back. */
  seed: string;
  world: StoryWorld | null;
  /** What the story's people wear: no one in the crowd is dressed as one of them. */
  wearing?: Wearing[];
  /**
   * Where the pieces the stage draws over the crowd stand (a bus, a
   * crate), in the set's units, in either staging: no one of the crowd
   * stands anywhere one would cover them.
   */
  pieces?: { x0: number; x1: number; y0: number; y1: number }[];
}

/** What someone wears that says who they are at a glance. */
export type Wearing = Pick<FigureSpec, 'top' | 'topColour' | 'headwear'>;

/** Whether two are dressed alike: the same top in the same colour, or the same hat over it. */
export function dressedAlike(a: Wearing, b: Wearing): boolean {
  return (
    a.topColour === b.topColour &&
    (a.top === b.top || (a.headwear !== 'none' && a.headwear === b.headwear))
  );
}

/** One of the crowd, as planned. */
export interface Extra {
  spec: FigureSpec;
  /** Where they stand (their feet), in the set's units, and their scale: the set's units to one of the kit's. */
  x: number;
  feet: number;
  sc: number;
  row: number;
  cluster: number;
  detail: ExtraDetail;
  view: ExtraView;
  /** Facing left, mirrored; and how far their face is turned, -1 to 1. */
  flip: boolean;
  turn: number;
  pose: FigurePose;
  holding: FigureProp | null;
  /** Talking in their group, with their hands. */
  talks: boolean;
  /** Their eyes go to whoever is speaking. */
  looks: boolean;
  /** How far they wander from where they stand and back, in the set's units: 0 for one who stays. */
  walk: number;
  /** How far toward the distance's colour they fade, 0 to 1. */
  haze: number;
  /** Standing behind what stands on the ground (a stall's counter): only what shows over it is drawn. */
  behind?: true;
}

/** The camera the crowd is seen through, in the set's units. */
export interface CrowdCamera {
  horizon: number;
  /** Where the story's people's feet are, and the set's units to one of the kit's there. */
  feet: number;
  unit: number;
  /** The leads' eye line. */
  eye: number;
}

export interface CrowdPlan {
  people: Extra[];
  camera: CrowdCamera;
  haze: string;
  frame: [number, number, number, number];
  /** Where the story's people stand on the whole, across: the crowd leans back away from them. */
  middle: number;
  /** What stands on the ground, column by column (SetGround.cover): what hides the lower part of those behind it. */
  cover?: SetGround['cover'];
}

/** A small, stable number from a seed: the same crowd in every make. */
function beatOf(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * The camera: the story's people's feet and scale where they stand, the
 * leads' eye line (a child's when the leads are children, a grown-up's
 * otherwise), and the horizon: out of doors the ground's own far edge,
 * as the set was painted, but never far over that eye line; in a room or
 * a vessel, the eye line itself, since a far wall is no horizon.
 */
export function cameraOf(
  input: Pick<CrowdInput, 'seen' | 'frame' | 'ground' | 'kind'>,
): CrowdCamera {
  const [, vy, vw, vh] = input.frame;
  // The kit's people's feet are exactly where they stand; anyone else's
  // are the foot of their drawing, taken only when there is no one else.
  // A close shot shows them larger than they stand: never measured from.
  const atRest = input.seen.filter((one) => !one.close);
  const wide = atRest.some((one) => one.wide)
    ? atRest.filter((one) => one.wide)
    : atRest;
  const all = wide.flatMap((one) =>
    one.cast.flatMap((c) => (c.stands ? [{ ...c.stands, c }] : [])),
  );
  const kit = all.filter((s) => s.c.rig);
  const standing = kit.length ? kit : all;
  const feet = standing.length
    ? median(standing.map((s) => s.feet))
    : vy +
      (vh > vw ? SET_FRAMES.tall.feet / SET_FRAMES.tall.h : USUAL.feet) * vh;
  const unit = standing.length
    ? median(standing.map((s) => s.unit))
    : USUAL.unit * worldHeightOf(vw, vh);
  const leads = standing.filter((s) => s.c.lead && s.c.rig);
  const child = leads.length > 0 && leads.every((s) => s.c.child);
  const eye = feet + rigOf(child ? 'child' : 'adult').eyes.y * unit;
  // Out of doors the set's own horizon, however low it was painted (a
  // set is painted for a child's eye), so its crowd stands on its ground.
  const read = input.kind === 'outdoor' ? vy + input.ground.horizon * vh : eye;
  const horizon = Math.min(
    feet - unit * 20,
    Math.max(eye - HORIZON_ROOM * vh, read),
  );
  return { horizon: r1(horizon), feet: r1(feet), unit: r3(unit), eye: r1(eye) };
}

/** Someone's scale with their feet at y: the only thing that sets it. */
export function scaleAt(camera: CrowdCamera, feet: number): number {
  return (
    (camera.unit * (feet - camera.horizon)) / (camera.feet - camera.horizon)
  );
}

/** How much of someone is drawn, by how tall a grown-up stands there on the stage. */
export function detailFor(px: number): ExtraDetail {
  return px >= DETAIL_PX.face ? 0 : px >= DETAIL_PX.dots ? 1 : 2;
}

/** A row of the crowd: its depth (a share from the horizon to the story's people), how many, how far it fades. */
interface Row {
  r: number;
  n: number;
  haze: number;
  /** How far each one's depth may stray from the row's. */
  spread: number;
}

/**
 * The rows a crowd stands in. Out of doors, a busy place three deep and a
 * few people one row; in a room or a vessel, a few people behind the
 * story's own, as near as a crowd comes.
 */
function rowsFor(size: 'few' | 'many', kind: PlaceKind, seed: string): Row[] {
  const some = (from: number, to: number, salt: string) =>
    from + Math.floor(beatOf(`${seed}:${salt}`) * (to - from + 1));
  if (kind === 'indoor')
    return [
      {
        r: 0.39,
        n: size === 'many' ? some(3, 4, 'n') : some(2, 3, 'n'),
        haze: 0.12,
        spread: 0.05,
      },
    ];
  if (kind === 'vessel')
    return [{ r: 0.39, n: some(2, 3, 'n'), haze: 0.1, spread: 0.05 }];
  if (size === 'few')
    return [{ r: 0.3, n: some(3, 5, 'n'), haze: 0.24, spread: 0.025 }];
  return [
    { r: 0.14, n: 10, haze: 0.45, spread: 0.025 },
    { r: 0.24, n: 8, haze: 0.32, spread: 0.025 },
    { r: 0.36, n: 5, haze: 0.18, spread: 0.025 },
  ];
}

/** A group's size: one, two, three or four, the middle ones most often. */
const clusterSize = (b: number) =>
  b < 0.2 ? 1 : b < 0.55 ? 2 : b < 0.85 ? 3 : 4;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const meets = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const inside = (a: Box, b: Box) =>
  a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
/** The middle of a face's keep-out, well inside the head it is about: what is there is behind the head. */
const coreOf = (b: Box): Box => {
  const dx = (b.x1 - b.x0) * 0.15;
  const dy = (b.y1 - b.y0) * 0.15;
  return { x0: b.x0 + dx, x1: b.x1 - dx, y0: b.y0 + dy, y1: b.y1 - dy };
};

/** Where the story's people are, at each moment, for the crowd to keep clear of: their faces, and their shapes. */
interface KeepOut {
  share: number;
  /** Seen close in, where a face fills the picture. */
  close: boolean;
  faces: Box[];
  shapes: Box[];
}

/**
 * What the crowd keeps clear of: the middle of every face of the story's
 * (wider in a kit figure's box than in an artist's), and the shape of
 * each of them, a head behind which is hidden or cut in half.
 */
export function keepOutsOf(seen: CrowdInput['seen']): KeepOut[] {
  return seen.map(({ share, cast, close }) => ({
    share,
    close: close === true,
    faces: cast.flatMap((c) => {
      if (!c.head) return [];
      const [hx, hy] = c.head;
      const [kw, kh] = c.rig ? [0.3, 0.2] : [0.22, 0.16];
      return [
        {
          x0: hx - c.w * kw,
          x1: hx + c.w * kw,
          y0: hy - c.h * kh,
          y1: hy + c.h * kh,
        },
      ];
    }),
    shapes: cast.map((c) =>
      c.rig && c.head && c.stands
        ? {
            x0: c.head[0] - 54 * c.stands.unit,
            x1: c.head[0] + 54 * c.stands.unit,
            y0: c.head[1] - 56 * c.stands.unit,
            y1: c.stands.feet,
          }
        : {
            x0: c.x + c.w * 0.1,
            x1: c.x + c.w * 0.9,
            y0: c.y + c.h * 0.05,
            y1: c.y + c.h,
          },
    ),
  }));
}

/** An extra's head, hair and hats and all, with their feet at (x, feet). */
function headBox(spec: FigureSpec, x: number, feet: number, sc: number): Box {
  const R = rigOf(spec.age, spec.build);
  return {
    x0: x - 54 * sc,
    x1: x + 54 * sc,
    y0: feet + (R.top - 14) * sc,
    y1: feet + (R.cy + 42) * sc,
  };
}

/**
 * Whether a head is clear of the story's people: over a face for no more
 * than a fifth of the time, hidden behind someone no more than half of
 * it, and cut by someone's outline no more than a quarter. Close in,
 * where a face fills the picture, never peeping out at a face's edge;
 * one wholly behind the face, or past a shoulder clear of it, is as
 * anywhere else.
 */
export function clearOf(head: Box, keep: KeepOut[]): boolean {
  let face = 0;
  let hidden = 0;
  let cut = 0;
  for (const one of keep) {
    const over = one.faces.some((f) => meets(head, f));
    const behind = one.shapes.some((s) => inside(head, s));
    const peeps = !behind && one.shapes.some((s) => meets(head, s));
    // Close in, a head peeping out at the edge of a face is never; one
    // wholly behind it is hidden there, and only counts as hidden.
    if (one.close) {
      if (over && !one.faces.some((f) => inside(head, coreOf(f)))) return false;
      if (behind || over) hidden += one.share;
      else if (peeps) cut += one.share;
      continue;
    }
    if (over) face += one.share;
    if (behind) hidden += one.share;
    else if (peeps) cut += one.share;
  }
  return face <= 0.2 && hidden <= 0.5 && cut <= 0.25;
}

/**
 * The crowd for a place, planned: who stands where, how big, facing
 * which way, how much of them drawn and how faded, who talks, who looks
 * at the speaker and who wanders. Fewer than asked where there is no room
 * for more: no rule is broken to reach a number. The same for the same
 * input every time.
 */
export function planCrowd(input: CrowdInput): CrowdPlan {
  const [vx, vy, vw, vh] = input.frame;
  const camera = cameraOf(input);
  const scale = input.scale ?? 1;
  const depth = camera.feet - camera.horizon;
  const groundAt = (x: number) => vy + topAt(input.ground, (x - vx) / vw) * vh;
  const keep = keepOutsOf(input.seen);
  const seed = input.seed;
  // The story's people, left to right on the whole: who is to either side.
  const castX = input.seen
    .filter((one) => !one.close)
    .flatMap((one) => one.cast.map((c) => c.x + c.w / 2));
  const middle = castX.length ? median(castX) : vx + vw / 2;
  // In a room or a vessel everyone stands in front of where the floor
  // meets the far wall, however high the camera: as far back as that.
  const indoors = input.kind !== 'outdoor';
  const deepest = indoors ? MOST_DEPTH_INDOORS : MOST_DEPTH;
  const floor = indoors
    ? depthOf(camera, median(input.ground.top.map((t) => vy + t * vh)) + 3)
    : 0;

  /** On the ground there, in the frame, clear of the story's people. */
  /** The nearest the ground's far edge comes under someone's feet there, and a little in front of it. */
  const groundUnder = (x: number, sc: number) => {
    const half = BODY * sc * 0.3;
    let most = -Infinity;
    for (let dx = -half; dx <= half + 0.01; dx += Math.max(2, half / 3))
      most = Math.max(most, groundAt(x + dx) + 3);
    return most;
  };
  /**
   * Behind what stands on the ground there (a stall's counter), across the
   * whole of where they stand: on the ground behind it, their feet down
   * behind it, and their head and shoulders over it. Only on a set whose
   * painter drew what stands on the ground as a group of its own.
   */
  const standsBehind = (
    spec: Pick<FigureSpec, 'age' | 'build'>,
    x: number,
    feet: number,
    sc: number,
  ) => {
    if (indoors || !input.ground.behind) return false;
    const head = feet + rigOf(spec.age, spec.build).top * sc;
    const tall = feet - head;
    const half = BODY * sc * 0.3;
    for (let dx = -half; dx <= half + 0.01; dx += Math.max(2, half / 3)) {
      const at = behindAt(input.ground, (x + dx - vx) / vw);
      if (!at) return false;
      const ground = vy + at.top * vh;
      const top = vy + at.cover[0] * vh;
      const bottom = vy + at.cover[1] * vh;
      if (feet < ground + 2 || feet > bottom - 2) return false;
      if (feet < top + (bottom - top) * 0.3) return false;
      if (top - head < tall * 0.35 || top - head > tall * 0.8) return false;
    }
    return true;
  };
  const fits = (
    spec: FigureSpec,
    x: number,
    feet: number,
    sc: number,
    behind = false,
  ) => {
    if (x - BODY * sc * 0.5 < vx || x + BODY * sc * 0.5 > vx + vw) return false;
    if (behind ? !standsBehind(spec, x, feet, sc) : feet < groundUnder(x, sc))
      return false;
    // Drawn over the crowd, a piece of the stage's hides whoever it meets:
    // someone may stand behind it (a bus, a crate), their head over it,
    // but never in front of it, nor with their head behind it.
    const head = headBox(spec, x, feet, sc);
    const body = {
      x0: x - BODY * sc * 0.4,
      x1: x + BODY * sc * 0.4,
      y0: head.y0,
      y1: feet,
    };
    if (
      (input.pieces ?? []).some(
        (piece) =>
          meets(body, piece) && (feet >= piece.y1 - 2 || meets(head, piece)),
      )
    )
      return false;
    return clearOf(head, keep);
  };

  const people: Extra[] = [];
  let clusters = 0;
  rowsFor(input.size, input.kind, seed).forEach((row, ri) => {
    const r0 = Math.min(deepest, Math.max(row.r, floor + row.spread));
    const bw0 = BODY * scaleAt(camera, camera.horizon + r0 * depth);
    const want = Math.max(1, Math.ceil(row.n / 2.4));
    const tries = want * 3;
    const centres = Array.from({ length: tries }, (_, c) => ({
      c,
      x: vx + (vw * (c + 0.2 + 0.6 * beatOf(`${seed}:${ri}:${c}:x`))) / tries,
      size: clusterSize(beatOf(`${seed}:${ri}:${c}:n`)),
      order: beatOf(`${seed}:${ri}:${c}:o`),
    })).sort((a, b) => a.order - b.order);
    const taken: { x: number; size: number }[] = [];
    let placed = 0;
    for (const centre of centres) {
      if (placed >= row.n) break;
      if (
        taken.some(
          (t) =>
            Math.abs(t.x - centre.x) <
            1.5 * bw0 * (1 + 0.5 * Math.max(t.size, centre.size)),
        )
      )
        continue;
      const size = Math.min(centre.size, row.n - placed);
      const members: Extra[] = [];
      for (let m = 0; m < size; m += 1) {
        // Who stands in each spot is the place's own, whoever else fits:
        // the same regulars whenever the story comes back.
        const spot = `${seed}:${ri}:${centre.c}`;
        const key = `${spot}:${m}`;
        const asked = Math.max(
          0.06,
          Math.min(deepest, r0 + (beatOf(`${key}:r`) - 0.5) * 2 * row.spread),
        );
        const x =
          centre.x +
          (m - (size - 1) / 2) *
            BODY *
            scaleAt(camera, camera.horizon + asked * depth) *
            (0.62 + 0.25 * beatOf(`${key}:gap`));
        // Where something stands on the ground there (a stall), they stand
        // behind it, where the painter drew it apart and the ground runs on
        // behind it; else in front of it, a little nearer, or not at all.
        let feet = camera.horizon + asked * depth;
        const behind =
          ri < 2 &&
          standsBehind(
            { age: 'adult', build: 'average' },
            x,
            feet,
            scaleAt(camera, feet),
          );
        if (!behind)
          for (let k = 0; k < 2; k += 1)
            feet = Math.max(
              feet,
              groundUnder(x, scaleAt(camera, feet)) + 2 * beatOf(`${key}:y`),
            );
        const r = depthOf(camera, feet);
        if (r > Math.min(deepest, asked + PUSH)) continue;
        const sc = scaleAt(camera, feet);
        // Dressed as no one beside them is, and as none of the story's people.
        let spec = extraFor(input.world, spot, m);
        const alike = [
          ...[...people, ...members]
            .filter((p) => p.row === ri && Math.abs(p.x - x) < BODY * sc * 1.6)
            .map((p) => p.spec),
          ...(input.wearing ?? []),
        ];
        for (
          let k = 1;
          k < 6 && alike.some((one) => dressedAlike(one, spec));
          k += 1
        )
          spec = extraFor(input.world, `${spot}~${k}`, m);
        if (!fits(spec, x, feet, sc, behind)) continue;
        const back = beatOf(`${key}:back`) < (r < 0.2 ? 0.3 : 0.15);
        const b = beatOf(`${key}:pose`);
        const pose: FigurePose = back
          ? 'standing'
          : b < 0.2
            ? 'holding'
            : b < 0.25
              ? 'pointing'
              : b < 0.3
                ? 'hands on belly'
                : 'standing';
        // In a group, facing its middle; alone, either way.
        const side =
          size > 1 && Math.abs(x - centre.x) > 0.5
            ? x < centre.x
              ? 1
              : -1
            : beatOf(`${key}:side`) < 0.5
              ? -1
              : 1;
        members.push({
          spec,
          x: r1(x),
          feet: r1(feet),
          sc: r3(sc),
          row: ri,
          cluster: clusters,
          detail: detailFor(ADULT * sc * scale),
          view: back ? 'back' : 'front',
          flip: side < 0,
          turn: back ? 0 : r3(side * (0.4 + 0.5 * beatOf(`${key}:turn`))),
          pose,
          holding: pose === 'holding' ? 'bag' : null,
          talks: false,
          looks: false,
          walk: 0,
          // Fading with how far off they are: those stepped forward, less.
          haze: r3(Math.max(0.05, row.haze - (r - r0) * 1.2)),
          ...(behind ? { behind: true as const } : {}),
        });
      }
      if (!members.length) continue;
      // A group of two or more mostly talks among themselves.
      const talking =
        members.length > 1 && beatOf(`${seed}:${ri}:${clusters}:talk`) < 0.6;
      for (const one of members) {
        one.talks = talking && one.view === 'front' && one.detail < 2;
        one.looks =
          !one.talks &&
          one.view === 'front' &&
          one.detail < 2 &&
          beatOf(`${seed}:${one.x}:look`) < 0.6;
      }
      people.push(...members);
      taken.push({ x: centre.x, size: members.length });
      placed += members.length;
      clusters += 1;
    }
  });

  // A few wander along the stalls, to and fro over ground that is free.
  const alone = people.filter(
    (p) => depthOf(camera, p.feet) < 0.3 && !p.talks && !p.behind,
  );
  const wanderers =
    input.size === 'many'
      ? 1 + Math.floor(beatOf(`${seed}:wander`) * 3)
      : beatOf(`${seed}:wander`) < 0.5
        ? 1
        : 0;
  for (const p of alone.sort(
    (a, b) => beatOf(`${seed}:${a.x}:w`) - beatOf(`${seed}:${b.x}:w`),
  )) {
    if (people.filter((q) => q.walk).length >= wanderers) break;
    const free = (dir: 1 | -1) => {
      let d = 0;
      const most = 180 / scale;
      for (let step = 5; step <= most; step += 5) {
        const x = p.x + dir * step;
        // No one at their depth in the way: those nearer or farther they
        // pass in front of or behind.
        const others = people.some(
          (q) =>
            q !== p &&
            (q.x - p.x) * dir > 0 &&
            Math.abs(q.feet - p.feet) < BODY * p.sc * 0.25 &&
            Math.abs(q.x - x) < BODY * p.sc * 0.8,
        );
        if (others || !fits(p.spec, x, p.feet, p.sc)) break;
        d = step;
      }
      return d;
    };
    const [right, left] = [free(1), free(-1)];
    const d = right >= left ? right : -left;
    if (Math.abs(d) * scale < 60) continue;
    p.walk = d;
    p.view = 'front';
    p.flip = d < 0;
    p.turn = r3(Math.sign(d) * 0.6);
    p.pose = 'standing';
    p.holding = null;
    p.looks = false;
  }

  return {
    people,
    camera,
    haze: input.ground.haze,
    frame: input.frame,
    middle: r1(middle),
    ...(people.some((p) => p.behind) ? { cover: input.ground.cover } : {}),
  };
}

/**
 * What of someone behind a stall shows: everything over what stands on
 * the ground, column by column across them, as a path in the set's units.
 * Where a post comes down, none of them there.
 */
function overCover(
  plan: CrowdPlan,
  x0: number,
  x1: number,
  feet: number,
): string {
  const [vx, vy, vw, vh] = plan.frame;
  const cover = plan.cover ?? [];
  const n = cover.length || GROUND_COLS;
  const from = Math.max(0, Math.floor(((x0 - vx) / vw) * n));
  const to = Math.min(n - 1, Math.ceil(((x1 - vx) / vw) * n));
  const points: string[] = [`M${r1(vx + (from / n) * vw)},${r1(vy)}`];
  for (let i = from; i <= to; i += 1) {
    const run = cover[i];
    const y = run ? vy + run[0] * vh : feet + 12;
    points.push(
      `L${r1(vx + (i / n) * vw)},${r1(y)}`,
      `L${r1(vx + ((i + 1) / n) * vw)},${r1(y)}`,
    );
  }
  points.push(`L${r1(vx + ((to + 1) / n) * vw)},${r1(vy)}Z`);
  return points.join(' ');
}

/** How far back someone stands: 0 at the horizon, 1 at the story's people's feet. */
export function depthOf(camera: CrowdCamera, feet: number): number {
  return (feet - camera.horizon) / (camera.feet - camera.horizon);
}

// ── Making way ──────────────────────────────────────────────────────────

/** Someone of the story's going by: when, their middle and their feet from where to where, and how wide they are, in the set's units. */
export interface GoingBy {
  from: number;
  to: number;
  x: [number, number];
  feet: [number, number];
  w: number;
}

/** One of the crowd making way: from when, until when, how far aside and back (in the kit's units), and how far they lean. */
export interface Aside {
  at: number;
  until: number;
  dx: number;
  dy: number;
  lean: number;
}

/** How near in depth someone going by comes before one of the crowd makes way: a share of the depth from the horizon to the story's people. */
const ASIDE_DEPTH = 0.16;
/** Those this near make way for anyone going across in front of them too. */
const ASIDE_NEAR = 0.3;
/** Ahead of being reached, and after being passed, in ms; and how far aside, in a body's widths. */
const ASIDE_BEFORE_MS = 450;
const ASIDE_AFTER_MS = 500;
const ASIDE_STEP = 0.3;

/**
 * Who of the crowd makes way, and when: one whose spot someone of the
 * story's walks or runs through (near them in depth, or near enough that
 * going across in front of them is going through them) steps a little
 * aside and back, away from where they come from, leaning away, and
 * stands where they were once they have passed. By each one in the plan.
 */
export function asideOf(
  plan: CrowdPlan,
  passes: readonly GoingBy[],
  ease: (p: number) => number,
): Aside[][] {
  return plan.people.map((p) => {
    const mine = depthOf(plan.camera, p.feet);
    const reach = BODY * p.sc * 0.35;
    const out: Aside[] = [];
    for (const one of passes) {
      if (one.to <= one.from) continue;
      let first: { t: number; x: number } | null = null;
      let last = 0;
      for (let t = one.from; t <= one.to + 1; t += 40) {
        const k = ease(Math.min(1, (t - one.from) / (one.to - one.from)));
        const x = one.x[0] + (one.x[1] - one.x[0]) * k;
        const feet = one.feet[0] + (one.feet[1] - one.feet[0]) * k;
        const near =
          Math.abs(depthOf(plan.camera, feet) - mine) < ASIDE_DEPTH ||
          (mine >= ASIDE_NEAR && feet > p.feet);
        if (!near || Math.abs(x - p.x) >= one.w / 2 + reach) continue;
        first ??= { t, x };
        last = t;
      }
      if (!first) continue;
      // Away from where they come from; a little back, and leaning away.
      const away = p.x >= first.x ? 1 : -1;
      out.push({
        at: Math.max(0, first.t - ASIDE_BEFORE_MS),
        until: last + ASIDE_AFTER_MS,
        dx: r1(away * BODY * ASIDE_STEP),
        dy: -6,
        lean: away * 4,
      });
    }
    // One after another, never two at once: a second joins the first.
    return out
      .sort((a, b) => a.at - b.at)
      .reduce<Aside[]>((all, one) => {
        const before = all[all.length - 1];
        if (before && one.at <= before.until)
          before.until = Math.max(before.until, one.until);
        else all.push(one);
        return all;
      }, []);
  });
}

/** One of the crowd's making way as keyframes over the page's whole length: `n` their own. */
function asideFrames(
  n: number,
  asides: readonly Aside[],
  total: number,
): string {
  const frames = ['0%{transform:none}'];
  for (const one of asides) {
    // Within the page's length: a walk that runs on past its words is
    // made way for until they end, never at a time past its end.
    if (one.at >= total) continue;
    const until = Math.min(one.until, total);
    const move = `transform:translate(${one.dx}px,${one.dy}px) rotate(${one.lean}deg)`;
    const settle = Math.max(one.at, Math.min(until - 1, one.at + 350));
    const back = Math.min(until, Math.max(settle + 1, until - 350));
    frames.push(
      `${pc(one.at, total)}{transform:none}`,
      `${pc(settle, total)},${pc(back, total)}{${move}}`,
      `${pc(until, total)}{transform:none}`,
    );
  }
  return `@keyframes cr-by${n}{${[...frames, '100%{transform:none}'].join('')}}`;
}

// ── Colour ────────────────────────────────────────────────────────────────

const channels = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const toHex = (rgb: number[]) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/**
 * A colour seen through distance: its saturation cut by half of `f`,
 * then mixed `f` of the way to the distance's colour.
 */
export function hazed(colour: string, haze: string, f: number): string {
  const c = channels(colour);
  const h = channels(haze);
  const grey = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const k = 1 - 0.5 * f;
  return toHex(c.map((v, i) => (grey + (v - grey) * k) * (1 - f) + h[i] * f));
}

/** Every colour in some markup seen through distance. */
function hazeAll(markup: string, haze: string, f: number): string {
  if (!f) return markup;
  const seen = new Map<string, string>();
  return markup.replace(/#[0-9a-fA-F]{6}\b/g, (c) => {
    const key = c.toLowerCase();
    if (!seen.has(key)) seen.set(key, hazed(key, haze, f));
    return seen.get(key)!;
  });
}

// ── Motion ────────────────────────────────────────────────────────────────

type Point = [number, number];
const deg = (radians: number) => (radians * 180) / Math.PI;
const fold = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const angle = (from: Point, to: Point) =>
  Math.atan2(to[1] - from[1], to[0] - from[0]);

/**
 * An arm drawn from shoulder S through elbow E to hand H, turned so the
 * hand reaches T: the upper arm's turn about the shoulder and the
 * forearm's about the elbow, in degrees. The elbow bends outward and
 * down (`out`: 1 the right arm, -1 the left). As the stage's own rig.
 */
export function reachOf(
  S: Point,
  E: Point,
  H: Point,
  T: Point,
  out: 1 | -1,
): { upper: number; fore: number } {
  const a = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const b = Math.hypot(H[0] - E[0], H[1] - E[1]);
  const far = Math.hypot(T[0] - S[0], T[1] - S[1]);
  if (a < 1e-6 || b < 1e-6 || far < 1e-6) return { upper: 0, fore: 0 };
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, far));
  const base = angle(S, T);
  const bend = Math.acos(
    Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))),
  );
  const elbow = (sign: number): Point => [
    S[0] + a * Math.cos(base + sign * bend),
    S[1] + a * Math.sin(base + sign * bend),
  ];
  const [e1, e2] = [elbow(1), elbow(-1)];
  const score = (e: Point) => out * e[0] + 0.6 * e[1];
  const E2 = score(e1) >= score(e2) ? e1 : e2;
  const H2: Point = [
    E2[0] + b * Math.cos(angle(E2, T)),
    E2[1] + b * Math.sin(angle(E2, T)),
  ];
  const upper = fold(deg(angle(S, E2) - angle(S, E)));
  const bentNow = angle(E2, H2) - angle(S, E2);
  const bentDrawn = angle(E, H) - angle(S, E);
  return { upper, fore: fold(deg(bentNow - bentDrawn)) };
}

/** A cheer lasts this long, and a gasp; when the page gives none, the crowd rests. */
const pc = (t: number, total: number) => `${r3((t / total) * 100)}%`;

/**
 * The page's reactions as keyframes over its whole length, shared by
 * everyone, each person's own amounts in their own variables: `x` the
 * body (a bounce, a lean back), `u` the upper arm and `f` the forearm
 * (up in a cheer, a hand to the mouth in a gasp). At rest between.
 */
export function reactionFrames(
  moves: readonly [number, 'cheer' | 'gasp', number][],
  durationMs: number,
): string {
  const total = Math.max(1, durationMs);
  const body: string[] = ['0%{transform:none}'];
  const upper: string[] = ['0%{transform:none}'];
  const fore: string[] = ['0%{transform:none}'];
  let free = 0;
  for (const [at, how, ms] of [...moves].sort((a, b) => a[0] - b[0])) {
    if (at < free || at + ms > total) continue;
    free = at + ms;
    const t = (k: number) => pc(at + ms * k, total);
    const up = (v: string) => `transform:translateY(calc(var(--hop,0)*${v}px))`;
    const arm = (name: string) =>
      `transform:rotate(calc(var(--${name},0)*1deg))`;
    if (how === 'cheer') {
      body.push(
        `${t(0)}{transform:none}`,
        `${t(0.14)}{${up('-1')}}`,
        `${t(0.3)}{transform:none}`,
        `${t(0.46)}{${up('-0.8')}}`,
        `${t(0.64)}{transform:none}`,
        `${t(1)}{transform:none}`,
      );
      upper.push(
        `${t(0)}{transform:none}`,
        `${t(0.14)}{${arm('cu')}}`,
        `${t(0.82)}{${arm('cu')}}`,
        `${t(1)}{transform:none}`,
      );
      fore.push(`${t(0)}{transform:none}`, `${t(1)}{transform:none}`);
    } else {
      const lean = 'transform:rotate(calc(var(--lb,0)*1deg))';
      body.push(
        `${t(0)}{transform:none}`,
        `${t(0.14)}{${lean}}`,
        `${t(0.72)}{${lean}}`,
        `${t(1)}{transform:none}`,
      );
      upper.push(
        `${t(0)}{transform:none}`,
        `${t(0.16)}{${arm('gu')}}`,
        `${t(0.72)}{${arm('gu')}}`,
        `${t(1)}{transform:none}`,
      );
      fore.push(
        `${t(0)}{transform:none}`,
        `${t(0.16)}{${arm('gf')}}`,
        `${t(0.72)}{${arm('gf')}}`,
        `${t(1)}{transform:none}`,
      );
    }
  }
  const close = (list: string[]) => [...list, '100%{transform:none}'].join('');
  return [
    `@keyframes cr-x{${close(body)}}`,
    `@keyframes cr-u{${close(upper)}}`,
    `@keyframes cr-f{${close(fore)}}`,
  ].join('');
}

/**
 * A wanderer's keyframes: standing a while, walking `d` over, standing,
 * walking back; turned the way they walk; and each foot lifted in turn
 * while they walk. `period` is the whole of it, in seconds.
 */
function wanderFrames(
  n: number,
  d: number,
  speed: number,
  pause: number,
): { css: string; period: number } {
  const walkS = Math.abs(d) / speed;
  const period = 2 * (walkS + pause);
  const at = (s: number) => `${r3((s / period) * 100)}%`;
  const out = pause;
  const there = pause + walkS;
  const back = there + pause;
  const home = back + walkS;
  const facing = d < 0 ? -1 : 1;
  const move = `@keyframes cr-w${n}{0%,${at(out)}{transform:none}${at(there)},${at(back)}{transform:translateX(${r1(d)}px)}${at(home)},100%{transform:none}}`;
  const turn = `@keyframes cr-t${n}{0%,${at(back - 0.01)}{transform:scaleX(${facing})}${at(back)},${at(home)}{transform:scaleX(${-facing})}${at(home + 0.01)},100%{transform:scaleX(${facing})}}`;
  // Each foot lifts in turn, a step every 0.64 seconds, while walking:
  // each foot's times at rest, and lifted, as one list each.
  const STEP = 0.64;
  const often = (sec: number) => `${Math.round((sec / period) * 10000) / 100}%`;
  const feet = [0, 1].map((leg) => {
    const rest: string[] = ['0%', '100%'];
    const lifted: string[] = [];
    for (const [from, to] of [
      [out, there],
      [back, home],
    ])
      for (let s = from; s + STEP <= to + 0.001; s += STEP) {
        const lift = s + STEP * (leg ? 0.75 : 0.25);
        rest.push(often(lift - STEP * 0.25), often(lift + STEP * 0.25));
        lifted.push(often(lift));
      }
    return `@keyframes cr-l${n}${leg}{${rest.join(',')}{transform:none}${lifted.length ? `${lifted.join(',')}{transform:translateY(-7px)}` : ''}}`;
  });
  return { css: [move, turn, ...feet].join(''), period };
}

/** The motion everyone in a crowd shares: a breath, a sway (three of them), the page's reactions, a talking hand, a glance each way, the eyes to the speaker. */
const IDLE = [
  '.cb{animation:cr-br 4.4s ease-in-out infinite}',
  '@keyframes cr-br{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}',
  '.cs,.cx,.cw,.ct,.ca{transform-box:view-box;transform-origin:0 0}',
  ...[0.6, 0.9, 1.2].map(
    (a, k) =>
      `.s${k}{animation:cr-s${k} 7.5s ease-in-out infinite}@keyframes cr-s${k}{0%,100%{transform:rotate(-${a}deg)}50%{transform:rotate(${a}deg)}}`,
  ),
  '.arm,.fore{transform-box:view-box}',
  '.cx{animation:cr-x var(--d) linear both;animation-delay:var(--late)}',
  '.cx .arm{animation:cr-u var(--d) linear both;animation-delay:var(--late)}',
  '.cx .fore{animation:cr-f var(--d) linear both;animation-delay:var(--late)}',
  '.tk .ar .fore{animation:cr-tk var(--tk) ease-in-out infinite;animation-delay:var(--tkd)}',
  '@keyframes cr-tk{0%,100%{transform:rotate(0)}25%{transform:rotate(-16deg)}50%{transform:rotate(-6deg)}75%{transform:rotate(-12deg)}}',
  '.gl .fm{animation:cr-gl var(--gl) ease-in-out infinite;animation-delay:var(--gld)}',
  '@keyframes cr-gl{0%,40%,100%{transform:translateX(0)}46%,62%{transform:translateX(3px)}68%,74%{transform:translateX(0)}80%,90%{transform:translateX(-3px)}}',
  '.lk .fm{transform:translateX(clamp(-4px,calc((var(--sx,var(--px)) - var(--px))*var(--fl,1)*0.02px),4px));transition:transform .4s ease-out;transition-delay:var(--ld)}',
].join('');

/**
 * The crowd drawn: one drawing in the set's frame, the rows from the back
 * forward, each person nested in a frame of their own (the kit's units,
 * their feet at 0, so the rig turns about its own joints), faded for how
 * far off they are. Their idle motion is their own; the page's cheers and
 * gasps (`moves`) are one track over its whole length (`durationMs`),
 * each person a moment apart. A still shows everyone at rest.
 */
export function drawCrowd(
  plan: CrowdPlan,
  timing: {
    moves?: readonly [number, 'cheer' | 'gasp', number][];
    durationMs: number;
    /** When each one makes way for someone of the story's going by, by each one in the plan. */
    asides?: readonly (readonly Aside[])[];
  },
): string {
  const [vx, vy, vw, vh] = plan.frame;
  const moves = timing.moves ?? [];
  const cheering = moves.some((m) => m[1] === 'cheer');
  const gasping = moves.some((m) => m[1] === 'gasp');
  const styles: string[] = [IDLE];
  if (moves.length) styles.push(reactionFrames(moves, timing.durationMs));
  const painted: { row: number; markup: string }[] = [];
  /** Each one behind a stall, cut to what shows over it. */
  const clips: string[] = [];
  // From the back forward: whoever stands nearer is drawn over.
  const order = plan.people
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.feet - b.p.feet || a.p.x - b.p.x);
  let wanderers = 0;
  let makingWay = 0;
  const talkers = new Map<number, number>();
  for (const { p, i } of order) {
    const b = (salt: string) => beatOf(`${i}:${p.x}:${salt}`);
    const drawn = drawExtra(p.spec, {
      detail: p.detail,
      view: p.view,
      pose: p.pose,
      holding: p.holding,
      turn: p.turn,
      id: `cr${i}`,
    });
    const [bx, by, bw, bh] = drawn.viewBox;
    // The page's reactions: most cheer, arms up and a bounce or two; all
    // gasp, leaning back away from the story's people, some with a hand
    // to the mouth (never one whose hand is busy talking).
    const joins = cheering && b('cheer') < 0.7 + 0.2 * b('keen');
    const toMouth =
      gasping && p.view === 'front' && !p.talks && b('mouth') < 0.4;
    let upper = drawn.upper;
    for (const side of ['r', 'l'] as const) {
      const [S, E, H] = drawn.joints[side];
      const s = side === 'r' ? 1 : -1;
      const vars: string[] = [];
      if (joins) {
        // Up past the shoulder, as the kit's own arms up.
        const T: Point = [s * (Math.abs(S[0]) + 30), S[1] - 52];
        vars.push(`--cu:${r1(fold(deg(angle(S, T) - angle(S, H))))}`);
      }
      if (toMouth && side === 'r') {
        const turn = reachOf(S, E, H, [6, drawn.mouthY + 3], 1);
        vars.push(`--gu:${r1(turn.upper)}`);
        upper = upper.replace(
          /(<g class="arm ar"[^>]*>(?:(?!<g class="arm).)*?<g class="fore" style=")/,
          `$1--gf:${r1(turn.fore)};`,
        );
      }
      if (vars.length)
        upper = upper.replace(
          `class="arm a${side}" style="`,
          `class="arm a${side}" style="${vars.join(';')};`,
        );
    }
    const classes = ['cx'];
    const vars = [`--late:${Math.round(300 * b('late'))}ms`];
    if (joins) vars.push(`--hop:${r1(ADULT * (0.04 + 0.04 * b('hop')))}`);
    if (gasping)
      vars.push(
        `--lb:${r1((p.x < plan.middle ? -1 : 1) * (3 + 2 * b('lean')))}`,
      );
    if (p.talks) {
      // A group's talkers take turns: each a half beat after the one before.
      const k = talkers.get(p.cluster) ?? 0;
      talkers.set(p.cluster, k + 1);
      const beat = 2.2 + 0.8 * beatOf(`${p.cluster}:tk`);
      classes.push('tk');
      vars.push(`--tk:${r1(beat)}s`, `--tkd:-${r1((k * beat) / 2)}s`);
    } else if (p.looks) {
      // Mirrored, their face turns the other way for the same look.
      classes.push('lk');
      vars.push(
        `--px:${Math.round(p.x)}`,
        `--ld:${Math.round(400 * b('ld'))}ms`,
        ...(p.flip ? ['--fl:-1'] : []),
      );
    } else if (p.view === 'front' && p.detail < 2) {
      classes.push('gl');
      vars.push(`--gl:${r1(7 + 5 * b('gl'))}s`, `--gld:-${r1(12 * b('gld'))}s`);
    }
    const breath = `animation-duration:${r1(3.6 + 1.6 * b('breath'))}s;animation-delay:-${r1(5 * b('breathAt'))}s`;
    const sway = `animation-duration:${r1(6 + 3 * b('swayS'))}s;animation-delay:-${r1(9 * b('swayAt'))}s`;
    let legs = drawn.legs;
    // A wanderer walks to and fro, facing the way they go, stepping.
    let open = '';
    let close = '';
    let facing = p.flip ? ' transform="scale(-1 1)"' : '';
    if (p.walk) {
      const n = wanderers;
      wanderers += 1;
      const frames = wanderFrames(
        n,
        p.walk / p.sc,
        (18 + 12 * b('speed')) / p.sc,
        2 + 2 * b('pause'),
      );
      styles.push(frames.css);
      const run = (name: string) =>
        `animation:${name} ${r1(frames.period)}s linear infinite;animation-delay:-${r1(frames.period * b('walkAt'))}s`;
      open = `<g class="cw" style="${run(`cr-w${n}`)}">`;
      close = '</g>';
      facing += ` class="ct" style="${run(`cr-t${n}`)}"`;
      // Each leg's step joins the style it has (where it turns at the hip).
      legs = legs
        .replace(
          /class="leg l0"(?: style="([^"]*)")?/,
          (_, own?: string) =>
            `class="leg l0" style="${run(`cr-l${n}0`)}${own ? `;${own}` : ''}"`,
        )
        .replace(
          /class="leg l1"(?: style="([^"]*)")?/,
          (_, own?: string) =>
            `class="leg l1" style="${run(`cr-l${n}1`)}${own ? `;${own}` : ''}"`,
        );
    }
    // Making way for someone of the story's going by, on the page's clock.
    const asides = timing.asides?.[i] ?? [];
    if (asides.length) {
      const n = makingWay;
      makingWay += 1;
      styles.push(asideFrames(n, asides, Math.max(1, timing.durationMs)));
      open = `<g class="ca" style="animation:cr-by${n} var(--d) linear both">${open}`;
      close = `${close}</g>`;
    }
    const person = [
      `<svg x="${r1(p.x + bx * p.sc)}" y="${r1(p.feet + by * p.sc)}" width="${r1(bw * p.sc)}" height="${r1(bh * p.sc)}" viewBox="${bx} ${by} ${bw} ${bh}" overflow="visible">`,
      '<ellipse cx="0" cy="0" rx="46" ry="6" fill="#1d1a22" fill-opacity="0.12"/>',
      open,
      `<g${facing}>`,
      `<g class="${classes.join(' ')}" style="${vars.join(';')}">`,
      `<g class="cs s${Math.floor(b('sway') * 3)}" style="${sway}">`,
      `<g stroke="${p.detail === 2 ? 'none' : INK}" stroke-width="2.6" stroke-linejoin="round">`,
      legs,
      `<g class="cb" style="${breath}">${upper}</g>`,
      '</g></g></g></g>',
      close,
      '</svg>',
    ].join('');
    const hazedPerson = hazeAll(person, plan.haze, p.haze);
    if (p.behind) {
      clips.push(
        `<clipPath id="cb${i}" clipPathUnits="userSpaceOnUse"><path d="${overCover(plan, p.x + bx * p.sc, p.x + (bx + bw) * p.sc, p.feet)}"/></clipPath>`,
      );
      painted.push({
        row: p.row,
        markup: `<g clip-path="url(#cb${i})">${hazedPerson}</g>`,
      });
    } else painted.push({ row: p.row, markup: hazedPerson });
  }
  // Each run of one row's people a group of its own.
  const body = painted
    .reduce<{ row: number; markup: string[] }[]>((runs, one) => {
      const last = runs[runs.length - 1];
      if (last?.row === one.row) last.markup.push(one.markup);
      else runs.push({ row: one.row, markup: [one.markup] });
      return runs;
    }, [])
    .map((run) => `<g class="row r${run.row}">${run.markup.join('')}</g>`)
    .join('');
  // The page's length, for its reactions' track: everyone's.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" style="--d:${Math.round(timing.durationMs)}ms"><style>${styles.join('')}</style>${clips.length ? `<defs>${clips.join('')}</defs>` : ''}${body}</svg>`;
}

/** Each group of a crowd, where its heads are: from over which the crowd's words come. */
export function crowdHeads(
  plan: CrowdPlan,
): { x: number; y: number; x0: number; x1: number; feet: number }[] {
  const groups = new Map<number, Extra[]>();
  for (const p of plan.people)
    groups.set(p.cluster, [...(groups.get(p.cluster) ?? []), p]);
  return [...groups.values()].map((members) => {
    const tops = members.map(
      (p) => p.feet + (rigOf(p.spec.age).top - 8) * p.sc,
    );
    const x0 = Math.min(...members.map((p) => p.x - 48 * p.sc));
    const x1 = Math.max(...members.map((p) => p.x + 48 * p.sc));
    return {
      x: r1((x0 + x1) / 2),
      y: r1(Math.min(...tops)),
      x0: r1(x0),
      x1: r1(x1),
      feet: r1(Math.max(...members.map((p) => p.feet))),
    };
  });
}
