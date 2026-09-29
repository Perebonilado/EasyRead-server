/**
 * Dangles: the parts of a drawing that swing (hair behind, a cloak, a
 * scarf's end, wings, a tail, long ears, a mane), cut by code into a short
 * chain of segments, each turning about its own joint. The player springs
 * each segment's angle (studio-world-plan §4.3) and sets it as a CSS
 * variable, `--dg-<id>-<k>` in degrees; unset, every one is 0 and the part
 * is exactly as drawn.
 *
 * A chain is the part's own markup drawn once per segment, each copy
 * clipped to its band across the part: a band between two cuts square to
 * the line from its root to its tip, the cuts where the joints are. Each
 * copy is nested in the one before, so a segment turns with every segment
 * nearer the root, and each band reaches a little back past its joint, so
 * a bend shows the part's own colour at the joint, not a gap. At rest the
 * bands together are the whole part, as it was drawn.
 *
 * Drawn only on a drawing made with rig 2 (§4.6): a drawing made before
 * is byte for byte as it was.
 */
import { reachOf, r1, sub, type P } from './scene-animal-shapes';
import { FIGURE_INK } from './scene-ink';

/** The figure, animal and creature kits' rig with dangles. */
export const DANGLE_RIG = 2 as const;
/** Which rig a kit drawing is made with: 1, as ever; 2, with dangles. */
export type RigVersion = 1 | typeof DANGLE_RIG;

/**
 * One part that swings, as the player springs it: its segments' angles
 * are `--dg-<id>-<k>`, k from 0 at the root.
 */
export interface Dangle {
  /** Its name in the drawing: the CSS variables' and the classes'. */
  id: string;
  /** Where its first segment turns, in the drawing's own (viewBox) units. */
  root: [number, number];
  segments: number;
  /** From its root to its tip, in the drawing's units. */
  length: number;
  /**
   * Which way it goes from its root to its tip as drawn, a unit vector in
   * the drawing's units (y down): how a push or the wind turns it.
   */
  dir: [number, number];
  /** The spring's natural frequency, in radians a second: higher, stiffer. */
  stiff: number;
  /** The spring's damping ratio: below 1 it overshoots and swings back. */
  damp: number;
  /** The angle each segment rests at, in degrees (0: as drawn). */
  rest: number;
  /** How far each segment turns from rest at most, in degrees. */
  limit: number;
  /** How much the wind moves it, 0 (not at all) to 1 (a ribbon's). */
  wind: number;
}

/** How a dangle swings, by what it is. */
export type DangleFeel = Pick<
  Dangle,
  'stiff' | 'damp' | 'rest' | 'limit' | 'wind'
>;

/** How each kind of dangle swings: heavy cloth slow and small, a ribbon quick and far. */
export const DANGLE_FEEL = {
  ponytail: { stiff: 9, damp: 0.35, rest: 0, limit: 32, wind: 0.6 },
  pigtail: { stiff: 10, damp: 0.35, rest: 0, limit: 28, wind: 0.5 },
  braid: { stiff: 8, damp: 0.4, rest: 0, limit: 22, wind: 0.4 },
  locs: { stiff: 8, damp: 0.4, rest: 0, limit: 20, wind: 0.4 },
  hair: { stiff: 7, damp: 0.5, rest: 0, limit: 12, wind: 0.5 },
  cloak: { stiff: 5, damp: 0.45, rest: 0, limit: 14, wind: 0.9 },
  cape: { stiff: 6, damp: 0.4, rest: 0, limit: 20, wind: 1 },
  scarf: { stiff: 9, damp: 0.35, rest: 0, limit: 32, wind: 0.8 },
  ribbon: { stiff: 10, damp: 0.3, rest: 0, limit: 38, wind: 1 },
  headscarf: { stiff: 8, damp: 0.35, rest: 0, limit: 28, wind: 0.8 },
  wing: { stiff: 12, damp: 0.5, rest: 0, limit: 10, wind: 0.3 },
  tail: { stiff: 7, damp: 0.3, rest: 0, limit: 24, wind: 0.4 },
  ear: { stiff: 14, damp: 0.45, rest: 0, limit: 12, wind: 0.2 },
  longEar: { stiff: 9, damp: 0.35, rest: 0, limit: 22, wind: 0.4 },
  mane: { stiff: 10, damp: 0.5, rest: 0, limit: 8, wind: 0.6 },
} as const satisfies Record<string, DangleFeel>;
export type DangleKind = keyof typeof DANGLE_FEEL;

/**
 * How far a person's legs swing either way about the hip as they walk,
 * degrees (§4.2), as the client's stride.ts has it: the kit's legs are
 * short, so a walk reaches as far as a planted leg allows (34, from 24)
 * rather than patter. An animal's, a kit animal's or creature's.
 */
export const PERSON_SWING = 34;
export const ANIMAL_SWING = 22;

/**
 * How far one full stride (both feet) carries a walker whose legs, `leg`
 * from hip to ground, swing `swing` degrees either way about the hip
 * (studio-world-plan §4.2): each foot stays where it lands while the body
 * passes over it, so a step is the chord the foot sweeps, 2·leg·sin(swing),
 * and a stride two steps. The player sets the legs' pace by it, so feet
 * never slide.
 */
export const strideLength = (leg: number, swing: number): number =>
  4 * leg * Math.sin((swing * Math.PI) / 180);

/** A part cut into a chain, and what the player needs of it. */
export interface Chain {
  markup: string;
  root: P;
  segments: number;
  length: number;
  /** From its root toward its tip, a unit vector. */
  dir: P;
}

const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const r3 = (n: number) => Math.round(n * 1000) / 1000 || 0;
/** Far enough past any drawing that a band reaches right across it. */
const BIG = 5000;

/** The segment's class, and the variable that turns it. */
export const segmentClass = (id: string, k: number) => `dg-${id}-${k}`;

/** A group turned about its joint by its variable. */
const joint = (id: string, k: number, at: P, markup: string) =>
  `<g class="${segmentClass(id, k)}" style="transform-origin:${r1(at[0])}px ${r1(at[1])}px">${markup}</g>`;

/**
 * A part drawn as a chain: `markup`, as it is drawn, from `root` toward
 * `tip` (else the point of it farthest from the root), cut into
 * `segments` (else as many as its length for its thickness: a stub one,
 * a tail three or four, never more than `most`). `clip` names its clip
 * paths, unique in the drawing. `pinned`: what lies behind the root stays
 * where it is, on the head or the shoulders, and only what hangs past it
 * swings; else the whole part turns about its root.
 */
export function cutChain(o: {
  id: string;
  markup: string;
  root: P;
  tip?: P;
  segments?: number;
  most?: number;
  clip: string;
  pinned?: boolean;
  /** How far a segment turns at most, in degrees: how far each reaches back past its joint to cover the bend. */
  limit?: number;
  /** Below this length for its breadth, a part is a stub, one segment. */
  stub?: number;
}): Chain {
  const { id, markup, root, clip } = o;
  const points = reachOf(markup);
  const tip =
    o.tip ??
    points.reduce<P>(
      (best, p) =>
        Math.hypot(p[0] - root[0], p[1] - root[1]) >
        Math.hypot(best[0] - root[0], best[1] - root[1])
          ? p
          : best,
      root,
    );
  const axis = sub(tip, root);
  const length = Math.hypot(axis[0], axis[1]);
  if (!points.length || length < 1)
    return {
      markup: `<g class="dg dg-${id}">${joint(id, 0, root, markup)}</g>`,
      root,
      segments: 1,
      length: r1(length),
      dir: [0, 1],
    };
  const u: P = [axis[0] / length, axis[1] / length];
  const v: P = [-u[1], u[0]];
  // Each point of the part, along the axis and across it.
  const local = points.map((p): P => {
    const d = sub(p, root);
    return [dot(d, u), dot(d, v)];
  });
  // Where the part crosses a cut: the middle of its breadth there, and how broad.
  const across = (s: number, near: number) => {
    const crossing = local.filter(([a]) => Math.abs(a - s) <= near);
    if (!crossing.length) return null;
    const vs = crossing.map(([, b]) => b);
    const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
    return { mid: (lo + hi) / 2, spread: hi - lo };
  };
  const breadths = [0.25, 0.5, 0.75]
    .map((t) => across(t * length, length * 0.08)?.spread ?? 0)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  const thick = breadths[Math.floor(breadths.length / 2)] ?? length;
  const ratio = length / Math.max(1, thick);
  const n = Math.max(
    1,
    Math.min(
      o.most ?? 4,
      o.segments ??
        (ratio < (o.stub ?? 1.8)
          ? 1
          : ratio < 4.5
            ? Math.min(3, o.most ?? 3)
            : 4),
    ),
  );
  const step = length / n;
  // How far a segment reaches back past its joint: enough to cover the
  // wedge a bend opens at the edge of the part's breadth, turned a little
  // past its limit; no further, so a broad part turned far keeps its
  // overlap small.
  const slope = Math.tan(
    (Math.min(50, Math.max(26, (o.limit ?? 25) * 1.3)) * Math.PI) / 180,
  );
  const backFor = (spread: number) =>
    Math.min(step * 1.2, Math.max(3, (spread / 2) * slope + 2));
  const at = (s: number, off = 0): P => [
    root[0] + u[0] * s + v[0] * off,
    root[1] + u[1] * s + v[1] * off,
  ];
  // The joints: the root, then the middle of the part at each cut.
  const cuts = Array.from({ length: n }, (_, j) => {
    if (j === 0) return { pivot: root, back: 0 };
    const s = j * step;
    const there = across(s, Math.max(step * 0.2, 2));
    return {
      pivot: at(s, there?.mid ?? 0),
      back: backFor(there?.spread ?? thick),
    };
  });
  const rootBack = backFor(across(0, Math.max(step * 0.2, 2))?.spread ?? thick);
  const band = (from: number, to: number) => {
    const [a, b, c, d] = [
      at(from, -BIG),
      at(to, -BIG),
      at(to, BIG),
      at(from, BIG),
    ].map(([x, y]) => `${r1(x)},${r1(y)}`);
    return `M${a} L${b} L${c} L${d} Z`;
  };
  const pinned = Boolean(o.pinned);
  const clipped = n > 1 || pinned;
  const defs: string[] = [];
  const bands = cuts.map((_, k) => {
    const from =
      k === 0 ? (pinned ? -rootBack : -BIG) : k * step - cuts[k].back;
    const to = k === n - 1 ? BIG : (k + 1) * step;
    return band(from, to);
  });
  if (clipped)
    bands.forEach((d, k) =>
      defs.push(`<clipPath id="${clip}-${k}"><path d="${d}"/></clipPath>`),
    );
  if (pinned)
    defs.push(
      `<clipPath id="${clip}-s"><path d="${band(-BIG, 0)}"/></clipPath>`,
    );
  // A limb drawn as the kit draws an arm (a stroke of ink, its colour
  // over it) is chained twice, every segment's ink under every segment's
  // colour, so a bend shows no seam of ink across it.
  const [under, over] = clipped ? inkApart(markup) : ['', markup];
  const chainOf = (part: string) => {
    let nested = '';
    for (let k = n - 1; k >= 0; k -= 1)
      nested = joint(
        id,
        k,
        cuts[k].pivot,
        (clipped ? `<g clip-path="url(#${clip}-${k})">${part}</g>` : part) +
          nested,
      );
    // What lies behind a pinned root, where it is.
    return (
      (pinned ? `<g clip-path="url(#${clip}-s)">${part}</g>` : '') + nested
    );
  };
  return {
    markup: `<g class="dg dg-${id}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${under ? chainOf(under) : ''}${chainOf(over)}</g>`,
    root: [r1(root[0]), r1(root[1])],
    segments: n,
    length: r1(length),
    dir: [r3(u[0]), r3(u[1])],
  };
}

/**
 * A part's ink strokes (a limb's outline, a line of ink round its colour)
 * apart from the rest of it, when it has any: drawn first, the rest over.
 */
function inkApart(markup: string): [string, string] {
  const ink = new RegExp(
    `<path d="[^"]*" fill="none" stroke="${FIGURE_INK}" stroke-width="[^"]*" stroke-linecap="round" stroke-linejoin="round"/>`,
    'g',
  );
  const under = markup.match(ink) ?? [];
  if (!under.length) return ['', markup];
  return [under.join(''), markup.replace(ink, '')];
}

/** A chain's dangle, as the player springs it: where it turns, and how, by its kind. */
export const dangleOf = (
  id: string,
  chain: Pick<Chain, 'root' | 'segments' | 'length' | 'dir'>,
  kind: DangleKind,
  by: P = [0, 0],
): Dangle => ({
  id,
  root: [r1(chain.root[0] + by[0]), r1(chain.root[1] + by[1])],
  segments: chain.segments,
  length: chain.length,
  dir: [chain.dir[0], chain.dir[1]],
  ...DANGLE_FEEL[kind],
});

/**
 * The CSS that turns each segment by its variable: 0 unless the player
 * sets it, so a drawing at rest is as drawn.
 */
export function dangleCss(
  dangles: readonly Pick<Dangle, 'id' | 'segments'>[],
): string {
  if (!dangles.length) return '';
  const rules = new Set<string>();
  for (const { id, segments } of dangles)
    for (let k = 0; k < segments; k += 1) {
      const name = segmentClass(id, k);
      rules.add(`.${name}{rotate:calc(var(--${name},0)*1deg)}`);
    }
  return `.dg g{transform-box:view-box}${[...rules].join('')}`;
}

/** Dangles each once, by id, the first of each kept: a group's, an outfit's. */
export function uniqueDangles(dangles: readonly Dangle[]): Dangle[] {
  const seen = new Set<string>();
  return dangles.filter((one) => {
    if (seen.has(one.id)) return false;
    seen.add(one.id);
    return true;
  });
}

/**
 * A drawing with its segments turned as `angle` says, written into it
 * as transforms: for a still or a contact sheet, since a renderer that
 * knows no CSS never turns them by their variables.
 */
export function posedDangles(
  svg: string,
  angle: number | ((id: string, k: number) => number),
): string {
  return svg.replace(
    /class="dg-([a-z0-9-]+?)-(\d+)" style="transform-origin:(-?[\d.]+)px (-?[\d.]+)px"/g,
    (_, id: string, k: string, x: string, y: string) => {
      const deg = typeof angle === 'number' ? angle : angle(id, Number(k));
      return `class="dg-${id}-${k}" transform="rotate(${deg} ${x} ${y})"`;
    },
  );
}

/**
 * Every group of a rig class in markup (`rig-tail`, `rig-ear`), with its
 * pivot, replaced as `swap` says: for the animal and creature kits, whose
 * tails and ears were each drawn as one group about its root.
 */
export function swapRigGroups(
  markup: string,
  rigClass: string,
  swap: (inner: string, pivot: P, className: string, n: number) => string,
): string {
  const opening = new RegExp(
    `<g class="(${rigClass}(?: [^"]*)?)" style="transform-origin:(-?[\\d.]+)px (-?[\\d.]+)px">`,
    'g',
  );
  let out = '';
  let from = 0;
  let n = 0;
  for (;;) {
    opening.lastIndex = from;
    const found = opening.exec(markup);
    if (!found) break;
    const start = found.index + found[0].length;
    // Its end: the </g> that closes it, past every group inside it.
    let depth = 1;
    let at = start;
    const tags = /<g\b[^>]*?(\/?)>|<\/g>/g;
    tags.lastIndex = start;
    while (depth > 0) {
      const tag = tags.exec(markup);
      if (!tag) return out + markup.slice(from);
      if (tag[0] === '</g>') depth -= 1;
      else if (!tag[1]) depth += 1;
      at = tag.index + tag[0].length;
    }
    const inner = markup.slice(start, at - '</g>'.length);
    out +=
      markup.slice(from, start) +
      swap(inner, [Number(found[2]), Number(found[3])], found[1], n) +
      '</g>';
    n += 1;
    from = at;
  }
  return out + markup.slice(from);
}
