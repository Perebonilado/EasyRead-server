/**
 * A lesson in a tall film (studio-vertical-plan §4): one idea to a
 * screen, read top to bottom, big. What a tall lesson's layouts, words
 * and pictures are, as code, beside the wide ones they leave as they were.
 *
 *  - Its words' sizes (TEXT), larger in tall; set by compose for the
 *    scene it composes (withTextOf), so every layout and label read
 *    them where they are set, and a wide scene reads the sizes it always
 *    had.
 *  - Its layouts reflowed into the tall text area (tallSlots): a row as a
 *    column, compare top over bottom, focus big on top, a taller cycle.
 *  - At most three things on the stage at once (ON_STAGE_MOST), a step
 *    of more paged by code (scene-lesson-pages).
 *  - Its drawings asked for square rather than wide (drawingShapeFor).
 *
 * Pure but for the words' sizes of the scene being composed, which
 * compose sets and puts back (composeScene is synchronous).
 */
import { SAFE, STAGES, textAreaOf, type FilmShape } from './scene-shape';

// ── Words on the stage (§4.2) ────────────────────────────────────────────

/**
 * The sizes a lesson's words are set at, in stage units. A tall film's
 * are larger: on a phone 900 units fill the width, so 40 units are about
 * 17 pt, the comfortable floor for words held at arm's length (§8.1).
 */
export interface TextSizes {
  /** A drawing's caption: at its largest, and the least it is set at. */
  readonly caption: { readonly max: number; readonly min: number };
  /**
   * A drawing's labels: the least and most, and their share of the room
   * they are set in, by its height (wide) or by its width (tall, where a
   * tall room's height would make them grow as the width they fit shrinks).
   */
  readonly label: {
    readonly min: number;
    readonly max: number;
    readonly share: number;
    readonly by: 'h' | 'w';
  };
  /** An arrow's label. */
  readonly pill: number;
  /** The most a card's words are set at, by its style. */
  readonly words: {
    readonly title: number;
    readonly card: number;
    readonly keyword: number;
  };
  /** The most a stat's number is set at. */
  readonly stat: number;
  /** The least a card's or a caption's words are set at rather than cut short. */
  readonly least: number;
  /** The room between slots, where an arrow runs. */
  readonly gap: number;
}

export const TEXT: Readonly<Record<FilmShape, TextSizes>> = {
  wide: {
    caption: { max: 38, min: 26 },
    label: { min: 22, max: 34, share: 0.045, by: 'h' },
    pill: 26,
    words: { title: 120, card: 64, keyword: 52 },
    stat: 220,
    least: 20,
    gap: 72,
  },
  tall: {
    caption: { max: 56, min: 42 },
    label: { min: 40, max: 52, share: 0.05, by: 'w' },
    pill: 40,
    words: { title: 120, card: 96, keyword: 96 },
    stat: 200,
    least: 40,
    gap: 56,
  },
};

/**
 * The least any word may be seen at, in stage units once the camera's
 * zoom is on it (§6.4): 40 in a tall film (48 px on a 1080-wide frame),
 * a caption's least in a wide one.
 */
export const READ_LEAST: Readonly<Record<FilmShape, number>> = {
  wide: 26,
  tall: 40,
};

let sizesNow: TextSizes = TEXT.wide;

/** The sizes of the scene being composed: a wide scene's unless compose says otherwise. */
export const textNow = (): TextSizes => sizesNow;

/**
 * `make` with the words of a scene of this shape set at its sizes, and
 * the sizes put back after, whatever happens: compose's own wrapper.
 */
export function withTextOf<T>(shape: FilmShape, make: () => T): T {
  const was = sizesNow;
  sizesNow = TEXT[shape];
  try {
    return make();
  } finally {
    sizesNow = was;
  }
}

// ── Fewer things at once (§4.3) ──────────────────────────────────────────

/**
 * The most things on a lesson's stage at once (§4.3): five wide, three
 * tall, one idea to a phone's screen.
 */
export const ON_STAGE_MOST: Readonly<Record<FilmShape, number>> = {
  wide: 5,
  tall: 3,
};
/** A tall 2 × 2 of drawings alone may hold one more (§4.3). */
export const TALL_GRID_MOST = 4;

// ── Drawings for tall films (§4.2) ───────────────────────────────────────

/** What is wide in itself, by its name or brief: kept wide in a tall film. */
const INHERENTLY_WIDE =
  /\b(?:time ?lines?|panoramas?|panoramic|number ?lines?|skylines?|spectrum|spectra|horizon|ruler|conveyor belt)\b/i;

/**
 * The canvas a drawing is asked for in a film of this shape (§4.2): in a
 * tall film, a drawing the writer marked wide is drawn square, unless the
 * thing is wide in itself (a timeline, a panorama, a number line).
 */
export function drawingShapeFor<S extends 'square' | 'wide' | 'tall'>(
  asked: S,
  film: FilmShape,
  what = '',
): S | 'square' {
  if (film === 'wide' || asked !== 'wide') return asked;
  return INHERENTLY_WIDE.test(what) ? asked : 'square';
}

/** The one line a tall film's lesson writer is told (§4.3): a few tokens, no call of its own. */
export const TALL_WRITER_LINE =
  'This film is vertical, for a phone screen held upright: at most three things on the stage at once, one idea per screen, read top to bottom; draw pictures square (shape "square"), not wide, unless the thing is wide in itself (a timeline, a panorama, a number line).';

// ── Layouts reflowed (§4.1) ──────────────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The tall text area (scene-shape textAreaOf): where a tall lesson's words and pictures go. */
export const TALL_AREA: Readonly<Rect> = textAreaOf('tall');

/** Slots in a column down a band, each as tall as its share. */
function column(band: Rect, shares: number[], gap: number): Rect[] {
  const total = shares.reduce((sum, s) => sum + s, 0) || shares.length;
  const room = band.h - gap * (shares.length - 1);
  let y = band.y;
  return shares.map((share) => {
    const h = (room * share) / total;
    const slot = { x: band.x, y, w: band.w, h };
    y += h + gap;
    return slot;
  });
}

/** Rows of two across a band, the last one alone centred (2 + 2 + 1). */
function pairs(band: Rect, n: number, gap: number): Rect[] {
  const rows = Math.ceil(n / 2);
  const h = (band.h - gap * (rows - 1)) / rows;
  const w = (band.w - gap) / 2;
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / 2);
    const alone = i === n - 1 && n % 2 === 1;
    return {
      x: alone ? band.x + (band.w - w) / 2 : band.x + (i % 2) * (w + gap),
      y: band.y + row * (h + gap),
      w,
      h,
    };
  });
}

/** Slots in a row across a band, of equal width. */
function across(band: Rect, n: number, gap: number): Rect[] {
  const w = (band.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({
    x: band.x + i * (w + gap),
    y: band.y,
    w,
    h: band.h,
  }));
}

/**
 * A tall lesson's slots (§4.1), in the tall text area, in the order the
 * things were listed. `shares`: how much of a column's height each wants
 * (a wide drawing less of it, a card no less than its words need).
 */
export function tallSlots(
  layout:
    'one' | 'row' | 'grid' | 'compare' | 'focus' | 'hub' | 'stack' | 'cycle',
  count: number,
  shares?: number[],
  area: Rect = TALL_AREA,
  gap = TEXT.tall.gap,
): Rect[] {
  const n = Math.max(1, count);
  const each = (i: number) => shares?.[i] ?? 1;
  const all = Array.from({ length: n }, (_, i) => each(i));
  switch (layout) {
    case 'one':
      return [area];
    case 'row':
      // A column for three or fewer, read top to bottom; 2 × 2 for four;
      // 2 + 2 + 1 for five.
      if (n <= 3) return column(area, all, gap);
      return pairs(area, n, gap);
    case 'grid':
      return pairs(area, n, gap);
    case 'compare': {
      // Top against bottom, a divider between them (the player's).
      return column(area, [1, 1], gap * 1.6);
    }
    case 'focus': {
      // Big on top, the rest under it: one full width, two side by side.
      const bigH = area.h * 0.64;
      const big = { x: area.x, y: area.y, w: area.w, h: bigH };
      const rest = {
        x: area.x,
        y: area.y + bigH + gap,
        w: area.w,
        h: area.h - bigH - gap,
      };
      const k = n - 1;
      if (!k) return [area];
      return [big, ...(k <= 2 ? across(rest, k, gap) : pairs(rest, k, gap))];
    }
    case 'hub': {
      // The centre in the middle, the spokes above and below it.
      const k = n - 1;
      const above = Math.ceil(k / 2);
      const below = k - above;
      const bandH = area.h * 0.24;
      const centre = {
        x: area.x + area.w * 0.1,
        y: area.y + bandH + gap,
        w: area.w * 0.8,
        h: area.h - (bandH + gap) * 2,
      };
      const top = above
        ? across({ x: area.x, y: area.y, w: area.w, h: bandH }, above, gap)
        : [];
      const bottom = below
        ? across(
            { x: area.x, y: area.y + area.h - bandH, w: area.w, h: bandH },
            below,
            gap,
          )
        : [];
      return [centre, ...top, ...bottom];
    }
    case 'stack':
      return column(area, all, gap / 1.5);
    case 'cycle': {
      // An ellipse taller than wide.
      const w = area.w * (n >= 5 ? 0.34 : 0.42);
      const h = area.h * (n === 3 ? 0.28 : 0.24);
      const cx = area.x + area.w / 2;
      const cy = area.y + area.h / 2;
      const rx = area.w / 2 - w / 2;
      const ry = area.h / 2 - h / 2;
      return Array.from({ length: n }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return {
          x: cx + rx * Math.cos(angle) - w / 2,
          y: cy + ry * Math.sin(angle) - h / 2,
          w,
          h,
        };
      });
    }
  }
}

/** Where the compare's divider runs on a tall stage (the player's mirror of it): across the text area's middle. */
export const TALL_DIVIDER = {
  x1: TALL_AREA.x,
  x2: TALL_AREA.x + TALL_AREA.w,
  y: TALL_AREA.y + TALL_AREA.h / 2,
} as const;

// ── The safe zone, in stage units ────────────────────────────────────────

/** The tall frame's safe rectangle (scene-shape SAFE), in its stage's units: words and faces inside it. */
export const TALL_SAFE_BOX: Readonly<Rect> = {
  x: STAGES.tall.w * SAFE.tall.left,
  y: STAGES.tall.h * SAFE.tall.top,
  w: STAGES.tall.w * (1 - SAFE.tall.left - SAFE.tall.right),
  h: STAGES.tall.h * (1 - SAFE.tall.top - SAFE.tall.bottom),
};
