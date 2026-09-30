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
    // Just above the platforms' own bottom band (0.8 of the height), so a
    // grown-up where people stand has their face above the subtitles
    // (0.69) at the kit's own size: the floor before them runs under the
    // platforms' captions, and nothing that matters is there.
    feet: 1300,
    floorLine: { outdoor: 0.47, indoor: 0.52, vessel: 0.55 },
    // The eye raised this share of the frame above a grown-up's crown
    // where people stand (raisedEye): a slightly high camera, so heads
    // stacked in depth part, the far ones higher (§3.2).
    eyeLift: 0.18,
  },
};

/** A grown-up's crown above their feet, in the kit's units (scene-figure rigOf('adult').top). */
export const CROWN_UNITS = 192;

/**
 * The eye line of a frame whose eye is raised (a tall one's, §3.2): its
 * `eyeLift` of its height above the crown of a grown-up standing at
 * `feet`, `unit` of the frame's units to one of the kit's there. Null for
 * a frame with none (wide, whose eye is its set's own rule).
 */
export function raisedEye(
  frame: SetFrame,
  unit: number,
  feet: number = frame.feet,
): number | null {
  if (!frame.eyeLift) return null;
  return feet - CROWN_UNITS * unit - frame.eyeLift * frame.h;
}

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

// ── Blocking a tall stage (§3.2) ─────────────────────────────────────────

/** The five spots a sheet names. */
export type SpotName =
  'left' | 'centre-left' | 'centre' | 'centre-right' | 'right';

/**
 * Where each spot a sheet names stands across a tall stage, as a share of
 * its width (§3.2): nearer the middle than on a wide one, since people
 * stand in depth and on diagonals rather than in a row (how deep each
 * stands is the group's, TALL_DEPTHS). The sheet's own spots, unchanged.
 */
export const TALL_SPOTS: Readonly<Record<SpotName, number>> = {
  left: 0.24,
  'centre-left': 0.35,
  centre: 0.5,
  'centre-right': 0.65,
  right: 0.76,
};

/**
 * How big a piece of the set the stage stands (a table, a well, a stall)
 * is on a tall stage beside the people where they stand: a step back of
 * them (about d 0.2 on the floor), so a thing on the floor runs away from
 * the camera and two on a diagonal stand before it, never in it (§3.1).
 */
export const TALL_PIECE_K = 0.82;

/**
 * How deep each of a group stands on a tall stage when nothing says, by
 * their order across (left to right) and how many they are: two on a
 * diagonal (the one who speaks first near), talking distance apart on the
 * floor; three a triangle, one near in the middle and two behind either
 * side; four to six in two rows, zigzagged so no head is behind another.
 */
export const TALL_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  1: [0.5],
  2: [0.66, 0.38],
  3: [0.4, 0.7, 0.36],
  4: [0.66, 0.34, 0.64, 0.36],
  5: [0.68, 0.36, 0.7, 0.34, 0.66],
  6: [0.68, 0.36, 0.7, 0.34, 0.66, 0.38],
};

/** The depth someone at `i` of `n` across (left to right) stands at on a tall stage, when nothing says. */
export function tallDepth(i: number, n: number): number {
  const row = TALL_DEPTHS[Math.min(6, Math.max(1, n))];
  return row[i % row.length];
}

/**
 * How many of the largest group stand side by side on a tall stage: the
 * rest stand behind them. The scale fits that many across (§3.2).
 */
export const tallAcross = (largest: number): number =>
  Math.max(1, Math.ceil(largest / 2));

// ── The camera in a tall frame (§3.3) ────────────────────────────────────

/**
 * No far-off shots in a tall film (Richard's decision, 2026-09-30): no
 * wide, long, extreme-wide or establishing shot, and no move that ends far
 * off. A set is often not detailed enough to hold one, and far figures
 * read poorly on a phone. So in every shot of a tall film the key
 * character's figure, crown to feet, fills at least this share of the
 * frame's height: roughly a medium, or closer. The camera's floor, which
 * every tall framing keeps and the tall shot check (scene-safe) holds it to.
 */
export const TALL_FIGURE_LEAST = 0.45;

/**
 * Where the kit's parts are in the box a stage places someone in, as
 * shares of it down from its top (a grown-up's frame is 234 of the kit's
 * units, its top 224 above the feet): the crown (192 up), the eyes (149),
 * the chin (the head's 40 about 152), and the feet. Across, the head is
 * the box's middle half.
 */
export const IN_BOX = {
  crown: 32 / 234,
  eyes: 75 / 234,
  chin: 112 / 234,
  feet: 224 / 234,
  headLeft: 0.25,
  headRight: 0.75,
} as const;

/** A person's figure, crown to feet, as a share of their box's height. */
export const FIGURE_OF_BOX = IN_BOX.feet - IN_BOX.crown;

/**
 * How a tall film's camera frames people (§3.3), each as the share of the
 * frame's height the key character's figure fills (never below
 * TALL_FIGURE_LEAST): the camera's rest on whoever matters when no shot
 * is asked (`medium`), one alone on a line (`close`, a medium close), the
 * one speaking over a shoulder (`ots`), a hero from low (`low`), one
 * speaking over the crowd (`crowd`); two together (`two`), both faces
 * within `twoFaces` of the width, else the one it is on alone at `medium`.
 * Eyes on the upper third (`eyes`), faces in the middle of the phone's
 * safe box across (`across`, clear of the platforms' button column),
 * never closer than `most`. Over a
 * shoulder the one it is on is `otsOffset` of the width off the middle,
 * away from the one near, who is cheated low in a lower corner (`near`:
 * their box this tall a share of the height on the screen, their middle
 * this far in from the edge, its top this far down); in deep staging the
 * one near speaks, big and low (`deep`), the others framed above them.
 */
export const TALL_SHOT = {
  medium: 0.6,
  close: 0.8,
  ots: 0.7,
  low: 0.7,
  crowd: 0.55,
  two: 0.5,
  twoFaces: 0.76,
  eyes: 0.34,
  across: 0.47,
  most: 3.4,
  otsOffset: 0.1,
  near: { tall: 0.62, edge: 0.1, top: 0.5 },
  deep: { tall: 0.72, edge: 0.24, top: 0.3 },
  deepMost: 2.2,
} as const;

/** How close the camera is to frame someone `h` tall (their box) with their figure `share` of the frame's height, `H`. */
export const tallScale = (h: number, share: number, H: number): number =>
  Math.min(
    TALL_SHOT.most,
    Math.max(1, (share * H) / Math.max(1, h * FIGURE_OF_BOX)),
  );

/** The share of the frame's height someone `h` tall (their box) fills, crown to feet, seen at scale `s` on a frame `H` high. */
export const figureShare = (h: number, s: number, H: number): number =>
  (h * FIGURE_OF_BOX * s) / H;

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
 * platforms' button column; a tall lesson's layouts reflow into it
 * (scene-lesson-shape, §4.1): x 54–792, y 176–1088.
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
