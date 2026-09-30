/**
 * A film's shape (studio-vertical-plan §2): wide (16:9) or tall (9:16),
 * and every stage and set-frame size that follows from it. Pure, and the
 * one place those sizes live: compose picks its stage and its set's frame
 * here once, from the shape, and passes them down.
 *
 * A tall film is not a crop of a wide one. Its stage is the wide stage
 * turned (900 × 1600), so a length in stage units is as sharp in either
 * shape; its sets are the same world, at the same scale per metre, seen
 * through a narrower, taller window.
 *
 * On the wire the full-screen staging keeps its name, `wide`, in either
 * shape: for a tall scene `stagings.wide` is 900 × 1600 (§2.1). Every
 * reader of `scene.stagings.wide` means "the film's full stage", and
 * stays right.
 */
import type { FilmShape } from '../../contracts';

export type { FilmShape };

export const FILM_SHAPES: readonly FilmShape[] = ['wide', 'tall'];

/** A film shape as kept or sent, read back: anything else is wide, as every film made before shapes. */
export const filmShapeOf = (value: unknown): FilmShape =>
  value === 'tall' ? 'tall' : 'wide';

/** A scene's shape: absent is wide (every scene made before shapes). */
export const shapeOf = (scene: { shape?: FilmShape | null }): FilmShape =>
  scene.shape === 'tall' ? 'tall' : 'wide';

/** A stage's size and the margin its layouts keep, in stage units. */
export interface Stage {
  readonly w: number;
  readonly h: number;
  readonly margin: number;
}

/** The full-screen stage of each shape. */
export const STAGES: Readonly<Record<FilmShape, Stage>> = {
  wide: { w: 1600, h: 900, margin: 56 },
  tall: { w: 900, h: 1600, margin: 48 },
};

/** The reader's pane: a book's page is placed for it as well as full screen. */
export const BOX_STAGE: Stage = { w: 1200, h: 900, margin: 44 };

/** The two stagings a scene is placed at. */
export type StagingKey = 'box' | 'wide';

/**
 * The stagings a scene of a shape is composed at. A wide scene keeps the
 * pane's box and the wide stage; a tall one is its tall stage at both
 * (a Studio film plays full stage only, and aliases the box to it).
 */
export function stagingsOf(
  shape: FilmShape = 'wide',
): Readonly<Record<StagingKey, Stage>> {
  return shape === 'tall'
    ? TALL_STAGINGS
    : { box: BOX_STAGE, wide: STAGES.wide };
}
const TALL_STAGINGS = { box: STAGES.tall, wide: STAGES.tall } as const;

/** One staging's stage, for a shape. */
export const stageOf = (
  staging: StagingKey,
  shape: FilmShape = 'wide',
): Stage => stagingsOf(shape)[staging];

/** Which way a stage of this size is: taller than wide is tall. */
export const shapeOfStage = (stage: { w: number; h: number }): FilmShape =>
  stage.h > stage.w ? 'tall' : 'wide';

// ── The set's frame ──────────────────────────────────────────────────────

/** Where a place's open ground meets what stands behind it, by the kind of place, as shares of the frame's height. */
export interface FloorLines {
  readonly outdoor: number;
  readonly indoor: number;
  readonly vessel: number;
}

/**
 * The set's frame (§2.2): the window of the set's world a stage shows, in
 * the set's own units. Where the story's people's feet are (`feet`), where
 * the ground meets what stands behind it (`floorLine`, shares of `h`), and
 * how much higher the camera's eye is raised (`eyeLift`, a share of `h`:
 * the tall frame's slightly high camera, so heads stacked in depth part).
 */
export interface SetFrame {
  readonly w: number;
  readonly h: number;
  readonly feet: number;
  readonly floorLine: FloorLines;
  readonly eyeLift: number;
}

export const SET_FRAMES: Readonly<Record<FilmShape, SetFrame>> = {
  wide: {
    w: 1600,
    h: 900,
    feet: 820,
    floorLine: { outdoor: 0.64, indoor: 0.7, vessel: 0.72 },
    eyeLift: 0,
  },
  tall: {
    w: 900,
    h: 1600,
    feet: 1390,
    floorLine: { outdoor: 0.47, indoor: 0.52, vessel: 0.55 },
    // TODO(V3, studio-vertical-plan §3.2): raise the tall frame's eye by
    // this share, so far heads sit higher than near ones. Carried here,
    // not yet applied: the tall set is built with the wide frame's eye rule.
    eyeLift: 0.18,
  },
};

/** The set frame a stage of this size shows: a tall stage a tall frame, anything else (the box, wide) the wide one. */
export const setFrameFor = (W: number, H: number): SetFrame =>
  H > W ? SET_FRAMES.tall : SET_FRAMES.wide;

/** A set's default viewBox for a shape, where its drawing has none. */
export const setViewBoxOf = (
  shape: FilmShape = 'wide',
): [number, number, number, number] => [
  0,
  0,
  SET_FRAMES[shape].w,
  SET_FRAMES[shape].h,
];

/**
 * The height a set's world scale is measured in (§3.1): a wide frame's
 * own, 900. A tall frame keeps the wide frame's world, so a metre, a kit
 * unit and the ink's width are as many set units in both shapes; only
 * their share of the frame changes.
 */
export const worldHeightOf = (frameW: number, frameH: number): number =>
  frameH > frameW ? SET_FRAMES.wide.h : frameH;

/**
 * How wide a set is drawn, as multiples of its frame's width, by what its
 * layout asks (1, 1.5 or 2). A tall set is almost always wider than its
 * frame, so the camera can pan: 1350–1800 set units, about a wide frame.
 * TODO(V3, §3.1): the tall stager keeps the pieces the script uses inside
 * the home window and pushes the rest to the pan span.
 */
export const SET_WIDTHS: Readonly<Record<FilmShape, readonly number[]>> = {
  wide: [1, 1.5, 2],
  tall: [1.5, 2, 2],
};

/** A layout's width (1, 1.5 or 2 frames of a wide set) as the frames of this shape's set. */
export function setWidthFor(shape: FilmShape, layoutWidth = 1): number {
  if (shape === 'wide') return layoutWidth;
  const at = SET_WIDTHS.wide.indexOf(layoutWidth);
  return SET_WIDTHS.tall[at < 0 ? 0 : at];
}

// ── Where the frame is covered ───────────────────────────────────────────

/** Insets of a frame, as shares of its width (left, right) and height (top, bottom). */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Where the platforms' own buttons and captions cover a frame once it is
 * uploaded (§5.1): the intersection of TikTok's, Shorts' and Reels'
 * organic safe zones on 1080 × 1920. Faces and words stay inside; sets,
 * sky and floor may run under it. Wide has none worth composing round.
 */
export const SAFE: Readonly<Record<FilmShape, Insets>> = {
  wide: { top: 0, right: 0, bottom: 0, left: 0 },
  tall: { top: 0.11, right: 0.12, bottom: 0.2, left: 0.06 },
};

/** Where our own player's controls and subtitles cover it while it plays. */
export const OUR_UI: Readonly<Record<FilmShape, Insets>> = {
  wide: { top: 0, right: 0, bottom: 0.12, left: 0 },
  tall: { top: 0, right: 0, bottom: 0.21, left: 0 },
};

/** Where faces and titles are aimed, as shares of the height: inside SAFE, above the subtitles. */
export const FOCUS: Readonly<Record<FilmShape, { from: number; to: number }>> =
  {
    wide: { from: 0, to: 1 },
    tall: { from: 0.13, to: 0.62 },
  };

/** The band the subtitles take, as shares of the height (§5.2): always kept clear of words in a tall film. */
export const SUBTITLE_BAND: Readonly<
  Record<FilmShape, { from: number; to: number }>
> = {
  wide: { from: 0.86, to: 0.955 },
  tall: { from: 0.69, to: 0.79 },
};

/**
 * The text area of a stage (§5.1), in its units: where words and faces
 * may be set. The tall one sits a little left of centre, clear of the
 * platforms' button column. TODO(V2, §4.1): the tall layouts reflow into it.
 */
export function textAreaOf(shape: FilmShape = 'wide'): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const stage = STAGES[shape];
  if (shape === 'wide')
    return {
      x: stage.margin,
      y: stage.margin,
      w: stage.w - stage.margin * 2,
      h: stage.h - stage.margin * 2,
    };
  const safe = SAFE.tall;
  const x = Math.round(stage.w * safe.left);
  const y = Math.round(stage.h * safe.top);
  return {
    x,
    y,
    w: Math.round(stage.w * (1 - safe.right)) - x,
    h: Math.round(stage.h * 0.68) - y,
  };
}

// ── Walking, in the world ────────────────────────────────────────────────

/** The kit's units to a metre (scene-spacing's KIT_PER_METRE): a metre on a stage whose people are drawn at the kit's own size. */
export const STAGE_UNITS_PER_M = 113;

/**
 * The length a walk is measured against: a stage's long side. The wide
 * stage's width and the tall stage's height are the same 1600 units of
 * the same world (about 14 m at the kit's size), so a walk across a room
 * takes as long in either shape (§3.4); the reader's box keeps its own.
 */
export const walkReach = (stage: { w: number; h: number }): number =>
  Math.max(stage.w, stage.h);

/** The world a walk's pace is set for: the wide stage across, in metres. */
export const WALK_REACH_M = STAGES.wide.w / STAGE_UNITS_PER_M;

/** A length on the stage, in metres of its world. */
export const metresOf = (units: number): number => units / STAGE_UNITS_PER_M;

/** A walking pace (a reach walked in `reachMs`) in metres a second. */
export const metresPerSecond = (reachMs: number): number =>
  WALK_REACH_M / (reachMs / 1000);

// ── Stills ───────────────────────────────────────────────────────────────

/**
 * A still's size in pixels by its long side (§2.2): a wide one 960 × 540,
 * a tall one 540 × 960. The same pixel count, so a picture check costs
 * the same in either shape.
 */
export function stillSize(
  stage: { w: number; h: number },
  long = 960,
): { w: number; h: number } {
  const tall = stage.h > stage.w;
  const w = tall ? Math.round((long * stage.w) / stage.h) : long;
  return { w, h: Math.round((w * stage.h) / stage.w) };
}
