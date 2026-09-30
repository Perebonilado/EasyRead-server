/**
 * Words the artist wrote inside a drawing, set clear of the rest of it.
 *
 * A drawing's labels on named parts are lifted out for the stage to set
 * (scene-callouts). Words the artist drew with no part to name (a
 * policy's title, the rungs of a ladder named down its side) stay in the
 * drawing, and the artist cannot measure them: "National Policy on
 * Adolescent Health" ran across the seal beside it, "Confidentiality
 * limits" under the gavel at the ladder's top. Each run of words is
 * measured here against what is drawn around it:
 *
 *  - what it sits wholly on (the page, a plate) is its ground, never in
 *    its way;
 *  - what it mostly sits on and runs off (a title too long for its plate)
 *    it is made smaller to fit, down to SHRINK_LEAST;
 *  - what it partly runs over (a seal, a gavel, another run of words) it
 *    is moved off, the least way that clears everything and stays in the
 *    drawing;
 *  - where neither works it is left as drawn, and said.
 *
 * By code, with no model asked. The root is changed in place.
 */
import render from 'dom-serializer';
import type { Element } from 'domhandler';
import { isolate, toRoot } from './scene-callouts';
import { removeNode, walk } from './scene-dom';
import { renderSvg, type InkMap } from './scene-raster';

/** Not drawn: what a drawing defines, and its words' own pieces. */
const UNDRAWN = new Set([
  'defs',
  'style',
  'title',
  'desc',
  'metadata',
  'clippath',
  'mask',
  'symbol',
  'pattern',
  'lineargradient',
  'radialgradient',
  'filter',
]);
const WORDS = new Set(['text', 'tspan', 'textpath']);

/** Ink shared with something under this share of the words' own: they only touch it (a faint line through a number). */
export const TOUCH_SHARE = 0.06;
/** Sharing this much: the words sit on it. */
export const ON_SHARE = 0.85;
/** Words are never made smaller than this share of how they were drawn. */
export const SHRINK_LEAST = 0.65;
/** The furthest words are moved, as a share of the drawing's longer side. */
export const MOVE_MOST = 0.3;
/** Cells across the maps the words are measured on. */
const COLS = 200;
/** How much wider (at least `x` cells, else `share` of their width, each side) and taller than resvg sets them words are judged. */
const GROW = { x: 3, y: 1, share: 0.3 };

type Box = { x: number; y: number; w: number; h: number };

/** Where a drawing has ink, cell by cell. */
interface Mask {
  cols: number;
  rows: number;
  on: Uint8Array;
}

const maskOf = (map: InkMap): Mask => {
  const on = new Uint8Array(map.cols * map.rows);
  for (let i = 0; i < on.length; i += 1)
    on[i] = map.bits.charCodeAt(i) === 49 ? 1 : 0;
  return { cols: map.cols, rows: map.rows, on };
};

/** How many cells of `a`, moved by (dx, dy) cells, have ink in any of `under` not hidden by any of `over`. */
function sharedCells(
  a: Mask,
  under: Mask[],
  dx = 0,
  dy = 0,
  over: Mask[] = [],
): number {
  let n = 0;
  for (let y = 0; y < a.rows; y += 1)
    for (let x = 0; x < a.cols; x += 1) {
      if (!a.on[y * a.cols + x]) continue;
      const X = x + dx;
      const Y = y + dy;
      if (X < 0 || Y < 0 || X >= a.cols || Y >= a.rows) {
        n += 1;
        continue;
      }
      if (
        under.some((m) => m.on[Y * m.cols + X]) &&
        !over.some((m) => m.on[Y * m.cols + X])
      )
        n += 1;
    }
  return n;
}

const count = (m: Mask) => m.on.reduce((sum, v) => sum + v, 0);

/** The box of a mask's ink, in the drawing's units. */
function boxOf(m: Mask, viewBox: [number, number, number, number]): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < m.rows; y += 1)
    for (let x = 0; x < m.cols; x += 1)
      if (m.on[y * m.cols + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
  if (!Number.isFinite(x0)) return null;
  const cell = viewBox[2] / m.cols;
  return {
    x: viewBox[0] + x0 * cell,
    y: viewBox[1] + y0 * cell,
    w: (x1 - x0) * cell,
    h: (y1 - y0) * cell,
  };
}

/** A mask made `s` of its size about a point, in cells. */
function scaled(m: Mask, s: number, cx: number, cy: number): Mask {
  if (s === 1) return m;
  const on = new Uint8Array(m.on.length);
  for (let y = 0; y < m.rows; y += 1)
    for (let x = 0; x < m.cols; x += 1) {
      const X = Math.round(cx + (x - cx) / s);
      const Y = Math.round(cy + (y - cy) / s);
      if (X >= 0 && Y >= 0 && X < m.cols && Y < m.rows && m.on[Y * m.cols + X])
        on[y * m.cols + x] = 1;
    }
  return { ...m, on };
}

/** Whether a node is drawn: not a definition, nor inside one. */
function drawn(node: Element, root: Element): boolean {
  for (
    let at: Element | null = node;
    at && at !== root;
    at = at.parent as Element | null
  )
    if (UNDRAWN.has(at.name.toLowerCase())) return false;
  return true;
}

/** Whether a node has anything drawn in it but words. */
function hasShapes(node: Element): boolean {
  for (const one of walk(node)) {
    const name = one.name.toLowerCase();
    if (UNDRAWN.has(name) || WORDS.has(name) || name === 'g' || name === 'svg')
      continue;
    return true;
  }
  return false;
}

/** How faint a node is drawn: its own opacity and its ancestors'. */
function opacityOf(node: Element, root: Element): number {
  let o = 1;
  for (
    let at: Element | null = node;
    at && at !== root;
    at = at.parent as Element | null
  ) {
    const own = Number(
      at.attribs.opacity ??
        /(?:^|;)\s*opacity\s*:\s*([\d.]+)/.exec(at.attribs.style ?? '')?.[1] ??
        1,
    );
    if (Number.isFinite(own)) o *= own;
  }
  return o;
}

/** Whether everything drawn in a node is faint. */
function faint(node: Element, root: Element): boolean {
  if (opacityOf(node, root) < 0.7) return true;
  const drawnIn = [...walk(node)].filter((one) => {
    const name = one.name.toLowerCase();
    return (
      !UNDRAWN.has(name) && !WORDS.has(name) && name !== 'g' && name !== 'svg'
    );
  });
  return (
    drawnIn.length > 0 && drawnIn.every((one) => opacityOf(one, root) < 0.7)
  );
}

/** Whether a node is only lines: nothing in it filled. */
function onlyLines(node: Element): boolean {
  for (const one of walk(node)) {
    const name = one.name.toLowerCase();
    if (UNDRAWN.has(name) || WORDS.has(name) || name === 'g' || name === 'svg')
      continue;
    if (name === 'line' || name === 'polyline') continue;
    const fill =
      one.attribs.fill ??
      /(?:^|;)\s*fill\s*:\s*([^;]+)/.exec(one.attribs.style ?? '')?.[1];
    if (fill?.trim() !== 'none') return false;
  }
  return true;
}

/** A mask grown by `x` cells to each side and `y` up and down: room for another font's wider letters. */
function grown(m: Mask, x: number, y: number): Mask {
  const on = new Uint8Array(m.on.length);
  for (let r = 0; r < m.rows; r += 1)
    for (let c = 0; c < m.cols; c += 1) {
      if (!m.on[r * m.cols + c]) continue;
      for (let dy = -y; dy <= y; dy += 1)
        for (let dx = -x; dx <= x; dx += 1) {
          const R = r + dy;
          const C = c + dx;
          if (R >= 0 && C >= 0 && R < m.rows && C < m.cols)
            on[R * m.cols + C] = 1;
        }
    }
  return { ...m, on };
}

/** The words of a run, as written. */
const wordsIn = (text: Element) =>
  [...walk(text)]
    .flatMap((node) => node.children)
    .map((c) => ('data' in c ? String((c as { data: string }).data) : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** What a finding did to one run of words. */
export interface WordsCleared {
  words: string;
  did: 'moved' | 'shrunk' | 'left';
  /** What they had been over. */
  over: string[];
}

/**
 * Each run of words drawn in a drawing set clear of the rest of it, as
 * above, measured on maps of where each has ink (so words set at a slant
 * are judged by their letters, not by a box round them). Returns what
 * was done to each run that was in the way of something; empty when none
 * was. Throws when the drawing will not render: the caller keeps it as
 * it was.
 */
export async function clearDrawnWords(
  root: Element,
  viewBox: [number, number, number, number],
): Promise<WordsCleared[]> {
  const texts = [...walk(root)].filter(
    (node) =>
      node.name.toLowerCase() === 'text' && drawn(node, root) && wordsIn(node),
  );
  if (!texts.length) return [];
  // What each run of words could be in the way of: what is drawn beside
  // it at each level up to the drawing, its words taken out.
  const near = new Map<Element, Element[]>();
  const all = new Set<Element>();
  for (const text of texts) {
    const list: Element[] = [];
    for (
      let child: Element = text, at = text.parent as Element | null;
      at;
      child = at, at = at.parent as Element | null
    ) {
      for (const one of at.children) {
        if (one === child || !('name' in one)) continue;
        const el = one as Element;
        // Faint marks (a highlight, a dashed guide) are never in the way.
        if (UNDRAWN.has(el.name.toLowerCase()) || !hasShapes(el)) continue;
        if (faint(el, root)) continue;
        list.push(el);
        all.add(el);
      }
      if (at === root) break;
    }
    near.set(text, list);
  }
  // Ids to cut each out by, given where there are none and taken back after.
  const given: Element[] = [];
  let n = 0;
  const idOf = (node: Element) => {
    if (!node.attribs.id) {
      node.attribs.id = `dw-${(n += 1)}`;
      given.push(node);
    }
    return node.attribs.id;
  };
  const order = new Map([...walk(root)].map((node, i) => [node, i]));
  const textIds = texts.map(idOf);
  const shapes = [...all];
  const shapeIds = shapes.map(idOf);
  try {
    const bare = root.cloneNode(true);
    for (const node of [...walk(bare)])
      if (node.name.toLowerCase() === 'text') removeNode(node);
    const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"/>`;
    const whole = render(root, { xmlMode: true, selfClosingTags: true });
    const { masks = [] } = await renderSvg(whole, undefined, {
      masks: {
        svgs: [
          ...textIds.map((id) => isolate(root, id) ?? empty),
          ...shapeIds.map((id) => isolate(bare, id) ?? empty),
        ],
        cols: COLS,
      },
    });
    const textMask = new Map(
      texts.map((t, i) => [t, masks[i] ? maskOf(masks[i]) : null]),
    );
    const shapeMask = new Map(
      shapes.map((s, i) => [
        s,
        masks[texts.length + i] ? maskOf(masks[texts.length + i]) : null,
      ]),
    );
    const cell = viewBox[2] / COLS;
    const out: WordsCleared[] = [];
    for (const text of texts) {
      const mine = textMask.get(text);
      if (!mine) continue;
      const cells = count(mine);
      if (!cells) continue;
      // Judged a little wider than resvg sets them: the viewer's font
      // (Georgia, system-ui) may set them wider than Liberation Sans. But
      // against lines (a leader, a tick) only as they are.
      const across = boxOf(mine, viewBox)!.w / cell;
      const wide = grown(
        mine,
        Math.max(GROW.x, Math.round(across * GROW.share)),
        GROW.y,
      );
      const wideCells = count(wide);
      const ground: { mask: Mask; order: number }[] = [];
      const candidates: { shape: Element; mask: Mask; lines: boolean }[] = [];
      for (const shape of near.get(text) ?? []) {
        const at = shapeMask.get(shape);
        if (!at) continue;
        const lines = onlyLines(shape);
        if (!lines && sharedCells(mine, [at]) / cells >= ON_SHARE)
          ground.push({ mask: at, order: order.get(shape) ?? 0 });
        else candidates.push({ shape, mask: at, lines });
      }
      const inWay: { mask: Mask; what: string }[] = [];
      for (const { shape, mask: at, lines } of candidates) {
        // What its ground is drawn over is hidden there: never in the way.
        const above = ground
          .filter((g) => g.order > (order.get(shape) ?? 0))
          .map((g) => g.mask);
        const share = lines
          ? sharedCells(mine, [at], 0, 0, above) / cells
          : sharedCells(wide, [at], 0, 0, above) / wideCells;
        if (share > TOUCH_SHARE)
          inWay.push({
            mask: at,
            what: shape.attribs.id?.startsWith('dw-')
              ? shape.name
              : (shape.attribs.id ?? shape.name),
          });
      }
      for (const other of texts) {
        const at = other === text ? null : textMask.get(other);
        if (!at) continue;
        if (sharedCells(wide, [at]) / wideCells > TOUCH_SHARE * 2)
          inWay.push({ mask: at, what: `"${wordsIn(other).slice(0, 30)}"` });
      }
      if (!inWay.length) continue;
      const box = boxOf(mine, viewBox)!;
      const cx = (box.x + box.w / 2 - viewBox[0]) / cell;
      const cy = (box.y + box.h / 2 - viewBox[1]) / cell;
      const others = texts
        .filter((t) => t !== text)
        .flatMap((t) => (textMask.get(t) ? [textMask.get(t)!] : []));
      const blocking = [...inWay.map((o) => o.mask), ...others];
      // Moved off, the least way that clears what it was over and every
      // other run of words, stays on its ground and inside the drawing.
      let found: { dx: number; dy: number; s: number } | null = null;
      const most = Math.round(Math.max(mine.cols, mine.rows) * MOVE_MOST);
      for (const s of [1, 0.85, SHRINK_LEAST]) {
        const sized = grown(scaled(mine, s, cx, cy), GROW.x, GROW.y);
        const total = count(sized);
        for (let r = 0; r <= most && !found; r += 2)
          for (const [ux, uy] of DIRECTIONS) {
            const dx = Math.round(ux * r);
            const dy = Math.round(uy * r);
            if (
              sharedCells(sized, blocking, dx, dy) <= total * 0.01 &&
              (!ground.length ||
                sharedCells(
                  scaled(mine, s, cx, cy),
                  ground.map((g) => g.mask),
                  dx,
                  dy,
                ) >=
                  count(scaled(mine, s, cx, cy)) * ON_SHARE)
            ) {
              found = { dx, dy, s };
              break;
            }
            if (r === 0) break;
          }
        if (found) break;
      }
      const over = inWay.map((o) => o.what);
      if (
        found &&
        place(text, root, box, found.dx * cell, found.dy * cell, found.s)
      ) {
        textMask.set(
          text,
          shiftedMask(scaled(mine, found.s, cx, cy), found.dx, found.dy),
        );
        out.push({
          words: wordsIn(text).slice(0, 40),
          did: found.dx || found.dy ? 'moved' : 'shrunk',
          over,
        });
      } else out.push({ words: wordsIn(text).slice(0, 40), did: 'left', over });
    }
    return out;
  } finally {
    for (const node of given) delete node.attribs.id;
  }
}

/** A mask moved by whole cells. */
function shiftedMask(m: Mask, dx: number, dy: number): Mask {
  const on = new Uint8Array(m.on.length);
  for (let y = 0; y < m.rows; y += 1)
    for (let x = 0; x < m.cols; x += 1) {
      const X = x + dx;
      const Y = y + dy;
      if (m.on[y * m.cols + x] && X >= 0 && Y >= 0 && X < m.cols && Y < m.rows)
        on[Y * m.cols + X] = 1;
    }
  return { ...m, on };
}

/** Left, right, up, down, then the corners. */
const DIRECTIONS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, -1],
  [0, 1],
  [0.7, -0.7],
  [-0.7, -0.7],
  [0.7, 0.7],
  [-0.7, 0.7],
];

/**
 * The words moved by (dx, dy) in the drawing's units and made `s` of
 * their size about their middle: a transform put before their own, in
 * their own units. False when their units cannot be worked out.
 */
function place(
  text: Element,
  root: Element,
  box: Box,
  dx: number,
  dy: number,
  s: number,
): boolean {
  const parent = text.parent as Element | null;
  const m =
    parent && parent !== root ? toRoot(parent, root) : [1, 0, 0, 1, 0, 0];
  if (!m) return false;
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return false;
  // A point of the drawing in the words' own units.
  const local = (x: number, y: number): [number, number] => [
    (d * (x - e) - c * (y - f)) / det,
    (-b * (x - e) + a * (y - f)) / det,
  ];
  const [cx, cy] = local(box.x + box.w / 2, box.y + box.h / 2);
  const [tx, ty] = local(box.x + box.w / 2 + dx, box.y + box.h / 2 + dy);
  const round = (v: number) => Math.round(v * 100) / 100;
  const moved = `translate(${round(tx)} ${round(ty)}) scale(${round(s)}) translate(${round(-cx)} ${round(-cy)})`;
  text.attribs.transform = text.attribs.transform
    ? `${moved} ${text.attribs.transform}`
    : moved;
  return true;
}
