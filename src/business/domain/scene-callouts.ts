/**
 * A drawing's labels, lifted out so that code sets them.
 *
 * The artist writes each labelled part's label in a group of its own, its
 * words and a leader line to the part, and draws better for being asked to
 * (2161504). But it cannot measure words: labels land on one another and
 * on the drawing, and shrink with it until they cannot be read. So each
 * label is read here, what it says and the point on the part it names,
 * and taken out of the drawing; the stage sets it in a text layer of its
 * own, where code places every word and nothing overlaps (scene-labels).
 *
 * A label that cannot be read (no words, nothing to point at) stays in
 * the drawing as it was: no worse than before.
 */
import render from 'dom-serializer';
import { Element } from 'domhandler';
import { byId, removeNode, textOf, walk } from './scene-dom';
import { renderSvg, type InkBox, type InkMap } from './scene-raster';

/** A label as the stage sets it: which part, what it says, and where on the drawing it points. */
export interface Callout {
  /** The part, by the name the writer gave it. */
  part: string;
  text: string;
  /** The point on the part it names, in the drawing's own units. */
  anchor: [number, number];
}

/** Where the drawing has ink, in the units of the viewBox it was measured in. */
export interface InkField {
  viewBox: [number, number, number, number];
  map: InkMap;
}

/** Things a drawing needs in order to draw, whatever is cut from around a part. */
const DEFINITIONS = new Set([
  'defs',
  'style',
  'lineargradient',
  'radialgradient',
  'pattern',
  'clippath',
  'mask',
  'marker',
  'filter',
  'symbol',
]);
/** Shapes a label's words are drawn with, and the words themselves. */
const WORDS = new Set(['text', 'tspan', 'textpath']);

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m × n: n applied first. */
function times(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const apply = (m: Matrix, [x, y]: [number, number]): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

/** An SVG transform list as one matrix, or null when it says something this cannot read. */
export function parseTransform(value: string | undefined): Matrix | null {
  if (!value?.trim()) return IDENTITY;
  let out = IDENTITY;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  // Anything besides these functions is not understood, and nothing is guessed.
  if (value.replace(pattern, '').replace(/[\s,]/g, '') !== '') return null;
  for (const match of value.matchAll(pattern)) {
    const n = (match[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const name = match[1].toLowerCase();
    let m: Matrix;
    if (name === 'matrix' && n.length === 6) m = n as Matrix;
    else if (name === 'translate') m = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
    else if (name === 'scale') m = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
    else if (name === 'rotate') {
      const a = ((n[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      const r: Matrix = [
        Math.cos(a),
        Math.sin(a),
        -Math.sin(a),
        Math.cos(a),
        0,
        0,
      ];
      m = times(times([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy]);
    } else if (name === 'skewx')
      m = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (name === 'skewy')
      m = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    else return null;
    if (m.some((v) => !Number.isFinite(v))) return null;
    out = times(out, m);
  }
  return out;
}

/** The transform from a node's own units to the drawing's: its own and every ancestor's, to the root. */
function toRoot(node: Element, root: Element): Matrix | null {
  let m = IDENTITY;
  for (
    let at: Element | null = node;
    at && at !== root;
    at = at.parent as Element | null
  ) {
    const own = parseTransform(at.attribs.transform);
    if (!own) return null;
    m = times(own, m);
  }
  return m;
}

/** A path's first and last points, following its commands. */
export function pathEnds(d: string): [number, number][] {
  const tokens = d.match(/[a-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const size: Record<string, number> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
    z: 0,
  };
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let first: [number, number] | null = null;
  let command = '';
  let i = 0;
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++];
    const lower = command.toLowerCase();
    if (!(lower in size)) return [];
    if (lower === 'z') {
      [x, y] = [startX, startY];
      continue;
    }
    const args = tokens.slice(i, i + size[lower]).map(Number);
    if (args.length < size[lower] || args.some((n) => !Number.isFinite(n)))
      break;
    i += size[lower];
    const relative = command !== command.toUpperCase();
    if (lower === 'h') x = relative ? x + args[0] : args[0];
    else if (lower === 'v') y = relative ? y + args[0] : args[0];
    else {
      const [ex, ey] = args.slice(-2);
      x = relative ? x + ex : ex;
      y = relative ? y + ey : ey;
    }
    if (lower === 'm') {
      [startX, startY] = [x, y];
      // Further pairs after a move are lines.
      command = relative ? 'l' : 'L';
    }
    first ??= [x, y];
  }
  return first ? [first, [x, y]] : [];
}

/** The ends of a label's leader lines, in the drawing's own units. */
export function leaderEnds(label: Element, root: Element): [number, number][] {
  const out: [number, number][] = [];
  for (const node of walk(label)) {
    const name = node.name.toLowerCase();
    let ends: [number, number][] = [];
    const a = node.attribs;
    if (name === 'line')
      ends = [
        [Number(a.x1 ?? 0), Number(a.y1 ?? 0)],
        [Number(a.x2 ?? 0), Number(a.y2 ?? 0)],
      ];
    else if (name === 'polyline' || name === 'polygon') {
      const n = (a.points?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(
        Number,
      );
      if (n.length >= 4)
        ends = [
          [n[0], n[1]],
          [n[n.length - 2], n[n.length - 1]],
        ];
    } else if (name === 'path' && a.d) ends = pathEnds(a.d);
    if (
      !ends.length ||
      ends.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))
    )
      continue;
    const m = toRoot(node, root);
    if (!m) continue;
    out.push(...ends.map((p) => apply(m, p)));
  }
  return out;
}

/**
 * The drawing cut down to one group and what it needs to draw: the path
 * to it from the root, and every definition and style on the way. With
 * `wordsOnly`, the group keeps only its words (a label without its line).
 */
export function isolate(
  root: Element,
  id: string,
  wordsOnly = false,
): string | null {
  const copy = root.cloneNode(true);
  const target = byId(copy, id);
  if (!target) return null;
  if (wordsOnly) {
    for (const node of [...walk(target)])
      if (
        node !== target &&
        !WORDS.has(node.name.toLowerCase()) &&
        node.name.toLowerCase() !== 'g'
      ) {
        const inWords = (() => {
          for (
            let at = node.parent as Element | null;
            at && at !== target;
            at = at.parent as Element | null
          )
            if (WORDS.has(at.name.toLowerCase())) return true;
          return false;
        })();
        if (!inWords) removeNode(node);
      }
  }
  for (
    let child: Element = target, at = target.parent as Element | null;
    at;
    child = at, at = at.parent as Element | null
  ) {
    at.children = at.children.filter(
      (node) =>
        node === child ||
        !(node instanceof Element) ||
        DEFINITIONS.has(node.name.toLowerCase()),
    );
    if (at === copy) break;
  }
  return render(copy, { xmlMode: true, selfClosingTags: true });
}

const centre = (box: InkBox): [number, number] => [
  box.x + box.width / 2,
  box.y + box.height / 2,
];
const distance = (a: [number, number], b: [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The point of a box nearest another point, drawn a little way into the box. */
function into(box: InkBox, toward: [number, number]): [number, number] {
  const x = Math.min(box.x + box.width, Math.max(box.x, toward[0]));
  const y = Math.min(box.y + box.height, Math.max(box.y, toward[1]));
  const [cx, cy] = centre(box);
  return [x + (cx - x) * 0.15, y + (cy - y) * 0.15];
}

/**
 * Where a label points: the end of its leader away from its words, when
 * that end is on or near the part; else the part itself, at the side
 * nearest the words.
 */
export function anchorOf(input: {
  ends: [number, number][];
  words: InkBox | null;
  part: InkBox | null;
  /** How near the part an end must be to be believed, in the drawing's units. */
  slack: number;
}): [number, number] | null {
  const { ends, words, part, slack } = input;
  const from = words ? centre(words) : part ? centre(part) : null;
  if (ends.length && from) {
    const far = ends.reduce((best, p) =>
      distance(p, from) > distance(best, from) ? p : best,
    );
    if (
      !part ||
      (far[0] >= part.x - slack &&
        far[0] <= part.x + part.width + slack &&
        far[1] >= part.y - slack &&
        far[1] <= part.y + part.height + slack)
    )
      return far;
  }
  if (part) return into(part, from ?? centre(part));
  return null;
}

/**
 * Every labelled part's label read, anchored and taken out of the drawing,
 * and the drawing without them measured: its ink, and its ink map. The
 * root is changed in place. Throws when the drawing will not render; the
 * caller then keeps the drawing as it was.
 */
export async function liftCallouts(
  root: Element,
  found: { parts: Record<string, string>; labels: Record<string, string> },
  viewBox: [number, number, number, number],
): Promise<{
  callouts: Callout[];
  /** The ids of the label groups taken out. */
  lifted: string[];
  /** The drawing's ink without its labels. */
  ink: InkBox | null;
  field: InkField | null;
}> {
  const candidates: {
    part: string;
    label: Element;
    text: string;
    ends: [number, number][];
    words: string | null;
    shape: string | null;
  }[] = [];
  for (const [part, labelId] of Object.entries(found.labels)) {
    const label = byId(root, labelId);
    if (!label) continue;
    // Only the words of the label, not a title or a line.
    const text = [...walk(label)]
      .filter((node) => node.name.toLowerCase() === 'text')
      .map((node) => textOf(node))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const partId = found.parts[part];
    if (!text || (!partId && !leaderEnds(label, root).length)) continue;
    candidates.push({
      part,
      label,
      text,
      ends: leaderEnds(label, root),
      words: isolate(root, labelId, true),
      shape: partId ? isolate(root, partId) : null,
    });
  }
  // Measured on a copy: the drawing itself loses its labels only once
  // the copy without them has rendered.
  const copy = root.cloneNode(true);
  for (const one of candidates) {
    const twin = byId(copy, one.label.attribs.id);
    if (twin) removeNode(twin);
  }
  const bare = render(copy, { xmlMode: true, selfClosingTags: true });
  const variants = candidates.flatMap((one) => [
    one.words ?? '<svg xmlns="http://www.w3.org/2000/svg"/>',
    one.shape ?? '<svg xmlns="http://www.w3.org/2000/svg"/>',
  ]);
  const measured = await renderSvg(bare, undefined, {
    variants,
    grid: { svg: bare, cols: 48 },
  });
  for (const one of candidates) removeNode(one.label);
  const inks = measured.inks ?? [];
  const slack = Math.max(viewBox[2], viewBox[3]) * 0.12;
  const callouts: Callout[] = [];
  candidates.forEach((one, i) => {
    const words = one.words ? (inks[i * 2] ?? null) : null;
    const part = one.shape ? (inks[i * 2 + 1] ?? null) : null;
    const anchor = anchorOf({ ends: one.ends, words, part, slack });
    // A label with nothing to point at still says what it says, from its own middle.
    const at = anchor ?? (words ? centre(words) : null);
    if (at)
      callouts.push({
        part: one.part,
        text: one.text,
        anchor: [round(at[0]), round(at[1])],
      });
  });
  return {
    callouts,
    lifted: candidates.map((one) => one.label.attribs.id),
    ink: measured.ink,
    field: measured.grid ? { viewBox, map: measured.grid } : null,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
