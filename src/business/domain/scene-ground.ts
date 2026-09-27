/**
 * Where people can stand in a painted set: the open ground's far edge in
 * each column across it, measured once from a render of the set, so the
 * crowd stands on the ground and never on a stall, a wall or a counter.
 *
 * The painter is asked for the open ground as a group of its own,
 * "ground": where there is one, the ground is that group, less whatever
 * is drawn over it (a stall stands on it). Where there is none, it is
 * the colours that run a long way across the lower part of the picture,
 * and not across its top (the sky, a wall). Each column is read upward
 * from the bottom, or from just above what stands in front of people's
 * legs, while it is ground; small breaks (a tuft, the line between a road
 * and its pavement) are stepped over, and a gap under something standing
 * on legs is closed over, so no one stands under a counter.
 *
 * A reading that is not likely falls back to the convention: the ground
 * across the lower third, its far edge at 0.66.
 */
import { parseDocument } from 'htmlparser2';
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import { elements, walk } from './scene-dom';
import { renderSvg, type Pixels } from './scene-raster';

/** A set's ground, as shares of the set's height, left to right. */
export interface SetGround {
  /** The far edge of the open ground in each column: where the first thing that is not ground stands. */
  top: number[];
  /** The ground's far edge as a whole: a little above its nearest tenth, a share of the height. */
  horizon: number;
  /** The colour of the far distance, which the people farthest off fade toward. */
  haze: string;
  /** How it was found: the painter's own group, its colours, or the convention when neither could be read. */
  source: 'group' | 'colour' | 'convention';
  /**
   * With what stands on the ground taken away (the painter's "props":
   * stalls, carts, counters), the ground's far edge in each column: where
   * someone may stand behind them. Absent on a set painted without.
   */
  behind?: number[];
  /**
   * In each column, the lowest run of what stands on the ground (a stall's
   * counter, and its posts where they come down to it): its top and its
   * bottom, as shares of the height; null where nothing stands.
   */
  cover?: ([number, number] | null)[];
  /** Each of the painter's groups for a feature of the set ("f-gate"): its ink's box as shares of the frame, x0, y0, x1, y1. */
  boxes?: Record<string, [number, number, number, number]>;
}

/** How many columns a set is read in. */
export const GROUND_COLS = 320;
/** The convention: the ground over the lower third, its far edge at eye level. */
const CONVENTION_TOP = 0.66;
const CONVENTION_HORIZON = 0.64;
/** A far edge more likely than this is none: the reading is set aside. */
const LIKELY = { from: 0.45, to: 0.85 };
/** The distance's colour when there is nothing to read it from. */
const PLAIN_HAZE = '#e8eef2';

/** The ground where it cannot be read: flat across the lower third. */
export function conventionGround(haze = PLAIN_HAZE): SetGround {
  return {
    top: Array.from({ length: GROUND_COLS }, () => CONVENTION_TOP),
    horizon: CONVENTION_HORIZON,
    haze,
    source: 'convention',
  };
}

const share = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;

/** A kept ground read back: null when it is not one. What it has besides that cannot be read is left off. */
export function groundOf(raw: unknown): SetGround | null {
  const one = raw as Partial<SetGround> | null;
  if (
    !one ||
    !Array.isArray(one.top) ||
    !one.top.length ||
    !one.top.every(share) ||
    typeof one.horizon !== 'number' ||
    typeof one.haze !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(one.haze) ||
    !['group', 'colour', 'convention'].includes(one.source ?? '')
  )
    return null;
  const { behind, cover, boxes, ...ground } = one as SetGround;
  const covers =
    Array.isArray(cover) &&
    cover.length === one.top.length &&
    cover.every(
      (c) =>
        c === null || (Array.isArray(c) && c.length === 2 && c.every(share)),
    );
  const boxed =
    boxes && typeof boxes === 'object'
      ? Object.fromEntries(
          Object.entries(boxes).filter(
            ([, b]) => Array.isArray(b) && b.length === 4 && b.every(share),
          ),
        )
      : {};
  return {
    ...ground,
    ...(Array.isArray(behind) &&
    behind.length === one.top.length &&
    behind.every(share) &&
    covers
      ? { behind, cover }
      : {}),
    ...(Object.keys(boxed).length ? { boxes: boxed } : {}),
  };
}

/** The ground's top at a share of the set's width. */
export function topAt(ground: SetGround, share: number): number {
  const n = ground.top.length;
  const i = Math.min(n - 1, Math.max(0, Math.floor(share * n)));
  return ground.top[i];
}

/** Behind what stands on the ground, at a share of the set's width: the ground's far edge there, and the run standing on it; null where nothing stands. */
export function behindAt(
  ground: SetGround,
  share: number,
): { top: number; cover: [number, number] } | null {
  if (!ground.behind || !ground.cover) return null;
  const n = ground.behind.length;
  const i = Math.min(n - 1, Math.max(0, Math.floor(share * n)));
  const cover = ground.cover[i];
  return cover ? { top: ground.behind[i], cover } : null;
}

const hex = (rgb: number[]) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** How far apart two colours are: the sum of their channels' differences. */
const apart = (a: number[], b: number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Ink: enough alpha to be seen. */
const INKED = 24;
/** Colours this near are one colour: a flat fill's own edge, a little shading. */
const SAME = 24;
/** A run of one colour at least this share of the width is ground, or sky, or a wall. */
const LONG_RUN = 0.3;
/** A colour covering this much of the top half is the sky or a wall: never ground. */
const ABOVE_MOST = 0.25;
/** A break in the ground this short (a share of the height) is stepped over: a tuft, a line. */
const STEP_OVER = 0.03;
/** A gap narrower than this (a share of the width) under something is closed over. */
const CLOSE = 0.03;

/**
 * The ground read from a set's pixels (`set`, rendered with its front
 * hidden). With `group` (the painter's ground alone) and `after`
 * (everything drawn after it), the ground is that group where nothing
 * covers it; else it is read from the colours. With `front`, each column
 * is read from above the front. Pure: the render is the caller's.
 */
export function groundFrom(input: {
  set: Pixels;
  group?: Pixels | null;
  after?: Pixels | null;
  front?: Pixels | null;
}): SetGround {
  const { cols, rows, rgba } = input.set;
  const at = (x: number, y: number) => {
    const i = (y * cols + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
  };
  const alpha = (image: Pixels | null | undefined, x: number, y: number) =>
    image && x < image.cols && y < image.rows
      ? image.rgba[(y * image.cols + x) * 4 + 3]
      : 0;
  const haze = (horizon: number) => hazeOf(input.set, horizon);

  // Where each column starts: above the front, and above anything clear.
  const start = (x: number) => {
    let y = rows - 1;
    while (
      y > 0 &&
      (alpha(input.front, x, y) > INKED || alpha(input.set, x, y) <= INKED)
    )
      y -= 1;
    return y;
  };

  let isGround: (x: number, y: number) => boolean;
  let source: SetGround['source'];
  const grouped =
    input.group &&
    (() => {
      let n = 0;
      for (let y = Math.floor(rows / 2); y < rows; y += 1)
        for (let x = 0; x < cols; x += 1)
          if (alpha(input.group, x, y) > INKED) n += 1;
      return n > cols * rows * 0.05;
    })();
  if (grouped) {
    isGround = (x, y) =>
      alpha(input.group, x, y) > INKED && alpha(input.after, x, y) <= INKED;
    source = 'group';
  } else {
    const palette = paletteOf(input.set, start);
    if (!palette.length) return conventionGround(haze(CONVENTION_HORIZON));
    isGround = (x, y) =>
      alpha(input.set, x, y) > INKED &&
      palette.some((c) => apart(at(x, y), c) <= SAME);
    source = 'colour';
  }

  // Each column read upward while it is ground, stepping over small breaks.
  const gap = Math.max(1, Math.round(rows * STEP_OVER));
  const raw: number[] = [];
  for (let x = 0; x < cols; x += 1) {
    let y = start(x);
    // The ground may begin a little above where the column does.
    let found = -1;
    for (let k = y; k >= Math.max(0, y - gap * 3); k -= 1)
      if (isGround(x, k)) {
        found = k;
        break;
      }
    if (found < 0) {
      raw.push(1);
      continue;
    }
    y = found;
    for (;;) {
      if (y > 0 && isGround(x, y - 1)) {
        y -= 1;
        continue;
      }
      // A short break with ground above it: stepped over.
      let over = -1;
      for (let k = 2; k <= gap && y - k >= 0; k += 1)
        if (isGround(x, y - k)) {
          over = y - k;
          break;
        }
      if (over < 0) break;
      y = over;
    }
    raw.push(y / rows);
  }
  const top = closed(raw, Math.max(1, Math.round(cols * CLOSE)));
  const sorted = [...top].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median < LIKELY.from || median > LIKELY.to)
    return conventionGround(haze(CONVENTION_HORIZON));
  const horizon = round3(
    Math.max(0, sorted[Math.floor(sorted.length * 0.1)] - 4 / 900),
  );
  return {
    top: resampled(top, GROUND_COLS).map(round3),
    horizon,
    haze: haze(horizon),
    source,
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Narrow gaps closed over: each column no farther up than the nearest of
 * its neighbours `w` either side at their lowest, and then as far up as
 * that allows. A gap between a stall's legs closes; open ground wider
 * than the window keeps its edge.
 */
export function closed(top: number[], w: number): number[] {
  const n = top.length;
  const grow = top.map((_, i) => {
    let most = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k += 1)
      most = Math.max(most, top[k]);
    return most;
  });
  return grow.map((_, i) => {
    let least = 1;
    for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k += 1)
      least = Math.min(least, grow[k]);
    return least;
  });
}

/** A profile read at another number of columns: each the lowest (nearest) of those it covers, so no one stands on an edge. */
function resampled(top: number[], n: number): number[] {
  if (top.length === n) return top;
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * top.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * top.length) / n));
    let most = 0;
    for (let k = from; k < Math.min(to, top.length); k += 1)
      most = Math.max(most, top[k]);
    return most;
  });
}

/**
 * The ground's colours: those in long runs across the lower part of the
 * picture, above the front, that do not also cover much of its top half.
 */
function paletteOf(set: Pixels, start: (x: number) => number): number[][] {
  const { cols, rows, rgba } = set;
  const at = (x: number, y: number) => {
    const i = (y * cols + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
  };
  const starts = Array.from({ length: cols }, (_, x) => start(x));
  const runs: number[][] = [];
  for (let y = Math.floor(rows * 0.6); y < rows; y += 1) {
    let x = 0;
    while (x < cols) {
      if (y > starts[x] || at(x, y)[3] <= INKED) {
        x += 1;
        continue;
      }
      const first = at(x, y);
      const sum = [0, 0, 0];
      let n = 0;
      let k = x;
      while (
        k < cols &&
        y <= starts[k] &&
        at(k, y)[3] > INKED &&
        apart(at(k, y), first) <= SAME / 2
      ) {
        const c = at(k, y);
        sum[0] += c[0];
        sum[1] += c[1];
        sum[2] += c[2];
        n += 1;
        k += 1;
      }
      if (n >= cols * LONG_RUN) {
        const mean = sum.map((v) => v / n);
        if (!runs.some((c) => apart(c, mean) <= SAME / 2)) runs.push(mean);
      }
      x = Math.max(k, x + 1);
    }
  }
  // Not the sky, nor a wall: a colour all over the top half is neither ground.
  const half = Math.floor(rows / 2);
  return runs.filter((c) => {
    let n = 0;
    for (let y = 0; y < half; y += 1)
      for (let x = 0; x < cols; x += 1)
        if (at(x, y)[3] > INKED && apart(at(x, y), c) <= SAME) n += 1;
    return n <= cols * half * ABOVE_MOST;
  });
}

/**
 * The colour of the distance: the set's mean just above its horizon,
 * cooled halfway to its sky's (the mean of its top fifth), as far things
 * are, and lightened toward white.
 */
function hazeOf(set: Pixels, horizon: number): string {
  const { cols, rows, rgba } = set;
  const meanOf = (from: number, to: number): number[] | null => {
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = Math.max(0, from); y <= Math.min(rows - 1, to); y += 1)
      for (let x = 0; x < cols; x += 1) {
        const i = (y * cols + x) * 4;
        if (rgba[i + 3] <= INKED) continue;
        sum[0] += rgba[i];
        sum[1] += rgba[i + 1];
        sum[2] += rgba[i + 2];
        n += 1;
      }
    return n ? sum.map((v) => v / n) : null;
  };
  const band = meanOf(
    Math.floor((horizon - 0.06) * rows),
    Math.ceil(horizon * rows),
  );
  if (!band) return PLAIN_HAZE;
  const sky = meanOf(0, Math.floor(rows * 0.2)) ?? band;
  return hex(
    band.map((v, i) => {
      const cool = (v + sky[i]) / 2;
      return cool + (255 - cool) * 0.35;
    }),
  );
}

/**
 * In each column of what stands on the ground alone, its lowest run: read
 * up from its lowest ink while it is inked, small breaks stepped over, as
 * shares of the height; null where nothing stands. Pure.
 */
export function coverFrom(props: Pixels): ([number, number] | null)[] {
  const { cols, rows, rgba } = props;
  const inked = (x: number, y: number) => rgba[(y * cols + x) * 4 + 3] > INKED;
  const gap = Math.max(1, Math.round(rows * STEP_OVER));
  const out: ([number, number] | null)[] = [];
  for (let x = 0; x < cols; x += 1) {
    let bottom = rows - 1;
    while (bottom >= 0 && !inked(x, bottom)) bottom -= 1;
    if (bottom < 0) {
      out.push(null);
      continue;
    }
    let top = bottom;
    for (;;) {
      if (top > 0 && inked(x, top - 1)) {
        top -= 1;
        continue;
      }
      let over = -1;
      for (let k = 2; k <= gap && top - k >= 0; k += 1)
        if (inked(x, top - k)) {
          over = top - k;
          break;
        }
      if (over < 0) break;
      top = over;
    }
    out.push([round3(top / rows), round3((bottom + 1) / rows)]);
  }
  return resampledRuns(out, GROUND_COLS);
}

/** Runs read at another number of columns: the first of those each covers. */
function resampledRuns<T>(runs: T[], n: number): T[] {
  if (runs.length === n) return runs;
  return Array.from(
    { length: n },
    (_, i) =>
      runs[Math.min(runs.length - 1, Math.floor((i * runs.length) / n))],
  );
}

/** A group's ink, alone, as a box: shares of the frame, x0, y0, x1, y1; null for none. */
export function boxFrom(
  image: Pixels,
): [number, number, number, number] | null {
  const { cols, rows, rgba } = image;
  let x0 = cols;
  let y0 = rows;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < cols; x += 1) {
      if (rgba[(y * cols + x) * 4 + 3] <= INKED) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  if (x1 < 0) return null;
  return [
    round3(x0 / cols),
    round3(y0 / rows),
    round3((x1 + 1) / cols),
    round3((y1 + 1) / rows),
  ];
}

/** A set's drawing parsed: its root, or null. */
function rootOf(svg: string): Element | null {
  const doc = parseDocument(svg, { xmlMode: true, recognizeCDATA: true });
  return (
    elements(doc.children).find((node) => node.name.toLowerCase() === 'svg') ??
    null
  );
}

/** A group by its id, and whether it is there. */
const find = (root: Element, id: string | undefined) =>
  id ? ([...walk(root)].find((node) => node.attribs.id === id) ?? null) : null;

/**
 * The versions of a set its ground is read from: whole with its front
 * hidden; its ground group alone; what is drawn after the ground; and
 * its front alone. Null for a version the set has no group for.
 */
export function groundVersions(
  svg: string,
  ids: { ground?: string; front?: string; props?: string; features?: string[] },
): {
  set: string;
  group: string | null;
  after: string | null;
  front: string | null;
  /** With what stands on the ground hidden, whole and after the ground; and it alone. */
  bare: string | null;
  bareAfter: string | null;
  props: string | null;
  /** Each feature's group alone, by its id. */
  features: Record<string, string>;
} | null {
  const version = (show: (root: Element) => boolean): string | null => {
    const root = rootOf(svg);
    if (!root) return null;
    if (!show(root)) return null;
    return render(root, { xmlMode: true, selfClosingTags: true });
  };
  const hideFront = (root: Element) => {
    const front = find(root, ids.front);
    if (front) front.attribs.display = 'none';
  };
  const hideProps = (root: Element) => {
    const props = find(root, ids.props);
    if (!props) return false;
    props.attribs.display = 'none';
    return true;
  };
  const set = version((root) => {
    hideFront(root);
    return true;
  });
  if (!set) return null;
  // Only one group seen: everything else hidden, and it shown.
  const only = (root: Element, groups: Element[]) => {
    root.attribs.visibility = 'hidden';
    for (const g of groups) g.attribs.visibility = 'visible';
  };
  const group = version((root) => {
    const ground = find(root, ids.ground);
    if (!ground) return false;
    hideFront(root);
    only(root, [ground]);
    return true;
  });
  /** What follows the ground, at its level and at every level above it. */
  const afterGround = (root: Element) => {
    const ground = find(root, ids.ground);
    if (!ground) return false;
    hideFront(root);
    const later: Element[] = [];
    let node: Element | null = ground;
    while (node && node !== root) {
      const parent = node.parent as Element | null;
      if (!parent) break;
      const siblings = elements(parent.children);
      later.push(...siblings.slice(siblings.indexOf(node) + 1));
      node = parent;
    }
    only(root, later);
    return true;
  };
  const after = version(afterGround);
  const front = version((root) => {
    const found = find(root, ids.front);
    if (!found) return false;
    only(root, [found]);
    return true;
  });
  const bare = version((root) => {
    hideFront(root);
    return hideProps(root);
  });
  const bareAfter = version((root) => hideProps(root) && afterGround(root));
  const props = version((root) => {
    const found = find(root, ids.props);
    if (!found) return false;
    only(root, [found]);
    return true;
  });
  const features: Record<string, string> = {};
  for (const id of ids.features ?? []) {
    const alone = version((root) => {
      const found = find(root, id);
      if (!found) return false;
      hideFront(root);
      only(root, [found]);
      return true;
    });
    if (alone) features[id] = alone;
  }
  return { set, group, after, front, bare, bareAfter, props, features };
}

/**
 * A set's ground, measured from a render of it in a child process (or
 * by `render`): the convention when it reads as no likely ground, or
 * cannot be read at all; null when the render itself failed, which may
 * go better another time, so nothing is kept of it.
 */
export async function measureGround(
  drawing: {
    svg: string;
    parts?: Record<string, string>;
  },
  render: typeof renderSvg = renderSvg,
): Promise<SetGround | null> {
  const parts = drawing.parts ?? {};
  const ids = {
    ground: parts.ground ?? 'ground',
    front: parts.front,
    props: parts.props ?? 'props',
    // The painter's groups for the set's features: "f-gate".
    features: [
      ...new Set([
        ...Object.values(parts).filter((id) => id.startsWith('f-')),
        ...[...drawing.svg.matchAll(/\bid="(f-[\w-]+)"/g)].map((m) => m[1]),
      ]),
    ],
  };
  const versions = groundVersions(drawing.svg, ids);
  if (!versions) return conventionGround();
  const asked = [
    versions.set,
    versions.group,
    versions.after,
    versions.front,
    versions.bare,
    versions.bareAfter,
    versions.props,
    ...Object.values(versions.features),
  ];
  const svgs = asked.filter((one): one is string => Boolean(one));
  let rendered: Pixels[] | undefined;
  try {
    ({ ground: rendered } = await render(versions.set, undefined, {
      ground: { svgs, cols: GROUND_COLS },
    }));
  } catch {
    return null;
  }
  if (!rendered?.length) return null;
  const ground = rendered;
  let k = 1;
  const next = (one: string | null) => (one ? ground[k++] : null);
  const [set] = ground;
  const group = next(versions.group);
  const after = next(versions.after);
  const front = next(versions.front);
  const bare = next(versions.bare);
  const bareAfter = next(versions.bareAfter);
  const props = next(versions.props);
  const boxes: NonNullable<SetGround['boxes']> = {};
  for (const id of Object.keys(versions.features)) {
    const box = ground[k++] ? boxFrom(ground[k - 1]) : null;
    if (box) boxes[id] = box;
  }
  const read = groundFrom({ set, group, after, front });
  // Where people may stand behind the stalls: the ground with them gone.
  const behind =
    bare && props && read.source !== 'convention'
      ? groundFrom({ set: bare, group, after: bareAfter, front })
      : null;
  return {
    ...read,
    ...(behind && behind.source !== 'convention' && props
      ? {
          behind: behind.top.map((t, i) => Math.min(t, read.top[i])),
          cover: coverFrom(props),
        }
      : {}),
    ...(Object.keys(boxes).length ? { boxes } : {}),
  };
}
