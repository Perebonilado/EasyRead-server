/**
 * A face the artist drew without a mouth, given the kit's: the artist
 * draws each expression's eyes and brows and marks where the mouth goes
 * (a small `mouth-at` group); code measures the place, the face's size
 * and colour, and each eye, and draws the kit's own mouths there (the
 * face's resting mouth, the talking one, and the six shapes a line is
 * spoken in) and lids that blink on the kit's beat. So an animal or a
 * creature speaks as a person the kit draws does.
 *
 * An artist who draws a mouth anyway is told once; after that, code
 * covers the drawn mouth with the face's own colour and draws its own
 * over it.
 *
 * What code draws is kept as measurements on the sheet and put into the
 * drawing only when it is used (withFace), so a sheet rigged again, or
 * code that draws a mouth better, never leaves an old mouth behind.
 */
import render from 'dom-serializer';
import { Element, Text } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { byId, elements, removeNode, walk } from './scene-dom';
import {
  BLINK_FRAMES,
  BLINK_S,
  FACE_MOUTHS,
  FIGURE_INK,
  MOUTH_SHAPES,
  beatOf,
  keyframes,
  mouthShape,
  mouthShapes,
} from './scene-figure';
import {
  IDENTITY,
  invert,
  multiply,
  parseTransform,
  type Matrix,
  type Point,
  type ViewBox,
} from './scene-joints';
import {
  renderSvg,
  type InkBox,
  type InkMap,
  type Pixels,
} from './scene-raster';
import { variant } from './scene-sheet-rig';
import { EXPRESSIONS, type Expression } from './scene-story';
import type { GatedDrawing } from './scene-svg';

/** The part the artist marks the mouth's place with. */
export const MOUTH_MARK = 'mouth-at';

/** What code draws on a face the artist drew without a mouth, measured once. */
export interface SheetFace {
  /** Where the mouth goes, in the drawing's units. */
  mouth: Point;
  /** How much larger than the kit's the face is drawn: the kit's mouths are drawn this much larger. */
  scale: number;
  /** The artist's line, in the drawing's units: the mouths are drawn with lines as heavy. */
  line: number;
  /** The face's colour where the mouth goes: what covers a drawn mouth. */
  skin: string;
  /** Each eye, left to right, as the neutral face draws it, and the colour of the face round it: the lid that blinks over it. */
  eyes: { box: InkBox; lid: string }[];
  /** Faces whose own drawn mouth code covers: each with the box it covers. */
  covered: Partial<Record<Expression, InkBox>>;
}

/** The kit's eyes, outer edge to outer edge, and how far below them its mouth sits: a face is measured against them. */
const KIT_EYES_SPAN = 61;
const KIT_MOUTH_BELOW = 0.67;
/** Where a drawn mouth is looked for about the mouth's place, in the kit's units: across, above and below. */
const MOUTH_ZONE = { half: 18, above: 4, below: 13 };
/** And how far round it, when covering one, the drawn mouth may reach. */
const COVER_ZONE = { half: 30, above: 6, below: 20 };
/** The share of the mouth's zone inked that is a drawn mouth, not a stray line. */
const DRAWN_SHARE = 0.06;
/** How many cells across the maps are. */
const COLS = 240;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function parse(svg: string): Element | null {
  const doc = parseDocument(svg, { xmlMode: true, recognizeCDATA: true });
  return (
    elements(doc.children).find((node) => node.name.toLowerCase() === 'svg') ??
    null
  );
}

/** The drawing cut down to the groups `keep` names (all, when null) less those `drop` names: its definitions and styles kept. */
function cut(root: Element, keep: string[] | null, drop: string[]): string {
  const nodes = (ids: string[]) =>
    ids
      .map((id) => byId(root, id))
      .filter((node): node is Element => Boolean(node));
  return variant(root, keep ? nodes(keep) : null, nodes(drop));
}

/** A point of the drawing as a cell of a map of it. */
const cellOf =
  (map: { cols: number; rows: number }, [vx, vy, vw, vh]: ViewBox) =>
  ([x, y]: Point): [number, number] => [
    Math.floor(((x - vx) / vw) * map.cols),
    Math.floor(((y - vy) / vh) * map.rows),
  ];

/** A cell back to the drawing's units: its corner. */
const pointOf =
  (map: { cols: number; rows: number }, [vx, vy, vw, vh]: ViewBox) =>
  (col: number, row: number): Point => [
    vx + (col / map.cols) * vw,
    vy + (row / map.rows) * vh,
  ];

/** The inked cells of a map inside a box of the drawing, and the box they fill. */
function inkIn(
  map: InkMap,
  viewBox: ViewBox,
  box: InkBox,
): { cells: number; area: number; box: InkBox | null } {
  const at = cellOf(map, viewBox);
  const back = pointOf(map, viewBox);
  const [c0, r0] = at([box.x, box.y]);
  const [c1, r1c] = at([box.x + box.width, box.y + box.height]);
  let cells = 0;
  let area = 0;
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  for (let r = Math.max(0, r0); r <= Math.min(map.rows - 1, r1c); r += 1)
    for (let c = Math.max(0, c0); c <= Math.min(map.cols - 1, c1); c += 1) {
      area += 1;
      if (map.bits[r * map.cols + c] !== '1') continue;
      cells += 1;
      minC = Math.min(minC, c);
      minR = Math.min(minR, r);
      maxC = Math.max(maxC, c);
      maxR = Math.max(maxR, r);
    }
  if (!cells) return { cells, area, box: null };
  const [x0, y0] = back(minC, minR);
  const [x1, y1] = back(maxC + 1, maxR + 1);
  return {
    cells,
    area,
    box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  };
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

/** The commonest opaque colour among some pixels, or null when none is opaque. */
function commonest(pixels: Pixels, cells: [number, number][]): string | null {
  const counts = new Map<string, number>();
  for (const [c, r] of cells) {
    if (c < 0 || r < 0 || c >= pixels.cols || r >= pixels.rows) continue;
    const i = (r * pixels.cols + c) * 4;
    if (pixels.rgba[i + 3] < 200) continue;
    const colour = hex(pixels.rgba[i], pixels.rgba[i + 1], pixels.rgba[i + 2]);
    counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [colour, n] of counts) if (n > most) [best, most] = [colour, n];
  return best;
}

/** The cells round one, `reach` each way. */
const around = (
  [c, r]: [number, number],
  reach: number,
): [number, number][] => {
  const out: [number, number][] = [];
  for (let dr = -reach; dr <= reach; dr += 1)
    for (let dc = -reach; dc <= reach; dc += 1) out.push([c + dc, r + dr]);
  return out;
};

/** The artist's line: the commonest stroke width in the drawing, 3 when it says none. */
export function lineOf(root: Element): number {
  const counts = new Map<number, number>();
  for (const node of walk(root)) {
    const said =
      node.attribs['stroke-width'] ??
      /stroke-width\s*:\s*([\d.]+)/.exec(node.attribs.style ?? '')?.[1];
    const n = Number(said);
    if (Number.isFinite(n) && n > 0) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best = 3;
  let most = 0;
  for (const [n, k] of counts) if (k > most) [best, most] = [n, k];
  return Math.min(12, Math.max(1, best));
}

/** The white of each eye in a face drawn alone, left to right: the pixels near white, either side of its middle. */
function eyeWhites(pixels: Pixels, viewBox: ViewBox, middle: number): InkBox[] {
  const back = pointOf(pixels, viewBox);
  const sides = [
    { minC: Infinity, minR: Infinity, maxC: -Infinity, maxR: -Infinity, n: 0 },
    { minC: Infinity, minR: Infinity, maxC: -Infinity, maxR: -Infinity, n: 0 },
  ];
  for (let r = 0; r < pixels.rows; r += 1)
    for (let c = 0; c < pixels.cols; c += 1) {
      const i = (r * pixels.cols + c) * 4;
      const [R, G, B, A] = [
        pixels.rgba[i],
        pixels.rgba[i + 1],
        pixels.rgba[i + 2],
        pixels.rgba[i + 3],
      ];
      if (A < 200 || Math.min(R, G, B) < 228) continue;
      const side = back(c + 0.5, r)[0] < middle ? sides[0] : sides[1];
      side.n += 1;
      side.minC = Math.min(side.minC, c);
      side.minR = Math.min(side.minR, r);
      side.maxC = Math.max(side.maxC, c);
      side.maxR = Math.max(side.maxR, r);
    }
  return sides
    .filter((side) => side.n >= 4)
    .map((side) => {
      const [x0, y0] = back(side.minC, side.minR);
      const [x1, y1] = back(side.maxC + 1, side.maxR + 1);
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    });
}

/**
 * A face measured: where its mouth goes (the artist's mark, else below
 * the eyes, as far as the kit's mouth is below its own), how large it is
 * against the kit's, its colour there, each eye, and each face that drew
 * a mouth of its own. Null for a drawing with no neutral face to measure.
 * `marked`: whether it was marked; `drawn`, the faces with a mouth drawn.
 */
export async function measureFace(drawing: GatedDrawing): Promise<{
  face: SheetFace | null;
  marked: boolean;
  drawn: Expression[];
}> {
  const root = parse(drawing.svg);
  const neutral = drawing.states.neutral ?? drawing.parts.neutral;
  if (!root || !neutral || !byId(root, neutral))
    return { face: null, marked: false, drawn: [] };
  const viewBox = drawing.viewBox;
  const markId = drawing.parts[MOUTH_MARK];
  const faces = EXPRESSIONS.flatMap((name) => {
    const id = drawing.states[name];
    return id && byId(root, id) ? [{ name, id }] : [];
  });
  const faceIds = faces.map((one) => one.id);
  const drop = markId ? [markId] : [];
  const measured = await renderSvg(drawing.svg, undefined, {
    variants: [
      markId
        ? cut(root, [markId], [])
        : '<svg xmlns="http://www.w3.org/2000/svg"/>',
      cut(root, [neutral], drop),
      drawing.parts.head
        ? cut(root, [drawing.parts.head], [...faceIds, ...drop])
        : '<svg xmlns="http://www.w3.org/2000/svg"/>',
    ],
    masks: {
      svgs: faces.map((one) => cut(root, [one.id], drop)),
      cols: COLS,
    },
    ground: {
      svgs: [
        cut(root, null, [...faceIds, ...drop]),
        cut(root, [neutral], drop),
      ],
      cols: COLS,
    },
  });
  const [markBox, neutralBox, headBox] = (measured.inks ?? []).map((box) =>
    box && box.width > 0 && box.height > 0 ? box : null,
  );
  const [bare, alone] = measured.ground ?? [];
  if (!neutralBox || !bare || !alone)
    return { face: null, marked: Boolean(markBox), drawn: [] };
  const middle = neutralBox.x + neutralBox.width / 2;
  const whites = eyeWhites(alone, viewBox, middle);
  // Large as the eyes are across, against the kit's; else the face's ink.
  const span =
    whites.length === 2
      ? whites[1].x + whites[1].width - whites[0].x
      : neutralBox.width;
  let scale = span / KIT_EYES_SPAN;
  // Never a mouth wider than half the head.
  if (headBox) scale = Math.min(scale, (headBox.width * 0.5) / 24);
  scale = Math.max(0.2, scale);
  const eyeLow = whites.length
    ? Math.max(...whites.map((w) => w.y + w.height / 2))
    : neutralBox.y + neutralBox.height * 0.5;
  const eyeHigh = whites.length
    ? Math.max(...whites.map((w) => w.height))
    : neutralBox.height * 0.5;
  const mouth: Point = markBox
    ? [r1(markBox.x + markBox.width / 2), r1(markBox.y + markBox.height / 2)]
    : [
        r1(middle),
        r1(
          eyeLow + Math.max(eyeHigh * KIT_MOUTH_BELOW, 14 * scale) + 8 * scale,
        ),
      ];
  const zone = (z: typeof MOUTH_ZONE): InkBox => ({
    x: mouth[0] - z.half * scale,
    y: mouth[1] - z.above * scale,
    width: z.half * 2 * scale,
    height: (z.above + z.below) * scale,
  });
  const covered: SheetFace['covered'] = {};
  const drawn: Expression[] = [];
  faces.forEach((one, k) => {
    const map = measured.masks?.[k];
    if (!map) return;
    const seen = inkIn(map, viewBox, zone(MOUTH_ZONE));
    if (seen.area && seen.cells / seen.area >= DRAWN_SHARE) {
      drawn.push(one.name);
      const reach = inkIn(map, viewBox, zone(COVER_ZONE)).box;
      if (reach)
        covered[one.name] = {
          x: r1(reach.x),
          y: r1(reach.y),
          width: r1(reach.width),
          height: r1(reach.height),
        };
    }
  });
  const at = cellOf(bare, viewBox);
  const skin =
    commonest(bare, around(at(mouth), 2)) ??
    (headBox
      ? commonest(
          bare,
          around(
            at([headBox.x + headBox.width / 2, headBox.y + headBox.height / 2]),
            6,
          ),
        )
      : null) ??
    '#f3e2c4';
  const eyes = whites.map((box) => ({
    box: {
      x: r1(box.x),
      y: r1(box.y),
      width: r1(box.width),
      height: r1(box.height),
    },
    lid:
      commonest(
        bare,
        around(at([box.x + box.width / 2, box.y + box.height / 2]), 2),
      ) ?? skin,
  }));
  return {
    face: {
      mouth,
      scale: r3(scale),
      line: lineOf(root),
      skin,
      eyes,
      covered,
    },
    marked: Boolean(markBox),
    drawn,
  };
}

/** What to tell the artist of a face that was not drawn as asked. */
export function faceNotes(measured: {
  face: SheetFace | null;
  marked: boolean;
  drawn: readonly string[];
}): string[] {
  const notes: string[] = [];
  if (!measured.marked)
    notes.push(
      `Mark where the mouth goes: <g id="${MOUTH_MARK}"> holding one small circle at the middle of the mouth's place, on the face below the eyes. Draw no mouth.`,
    );
  if (measured.drawn.length)
    notes.push(
      `The faces ${measured.drawn.join(', ')} draw a mouth: draw only the eyes and brows in each expression group, with no mouth at all; the stage draws the mouth at ${MOUTH_MARK}.`,
    );
  return notes;
}

/** The drawing with the artist's mark taken out: code draws the mouth there. */
export function unmarked(drawing: GatedDrawing): GatedDrawing {
  const id = drawing.parts[MOUTH_MARK];
  if (!id) return drawing;
  const root = parse(drawing.svg);
  const node = root && byId(root, id);
  if (!root || !node) return drawing;
  removeNode(node);
  const parts = { ...drawing.parts };
  delete parts[MOUTH_MARK];
  return {
    ...drawing,
    svg: render(root, { xmlMode: true, selfClosingTags: true }),
    parts,
  };
}

/** A face moved as its head was moved in to meet the body. */
export function faceMoved(face: SheetFace, [dx, dy]: Point): SheetFace {
  if (!dx && !dy) return face;
  const box = (b: InkBox): InkBox => ({
    ...b,
    x: r1(b.x + dx),
    y: r1(b.y + dy),
  });
  return {
    ...face,
    mouth: [r1(face.mouth[0] + dx), r1(face.mouth[1] + dy)],
    eyes: face.eyes.map((eye) => ({ ...eye, box: box(eye.box) })),
    covered: Object.fromEntries(
      Object.entries(face.covered).map(([name, b]) => [name, box(b)]),
    ),
  };
}

/** The transforms from the drawing's root down to inside a node: where what is put in it draws. */
function spaceInside(root: Element, node: Element): Matrix | null {
  const chain: Element[] = [];
  for (
    let at: Element | null = node;
    at && at !== root;
    at = at.parent as Element | null
  )
    chain.unshift(at);
  let m = IDENTITY;
  for (const at of chain) {
    const t = parseTransform(at.attribs.transform);
    if (!t) return null;
    m = multiply(m, t);
  }
  return m;
}

/** The CSS of the code's mouths and lids: as the kit's, under names of their own. `blinkAt`, the lids' own beat. */
export function faceCss(blinkAt: number): string {
  return [
    '.cm-v{opacity:0}.lipsync .cm-rest,.lipsync .cm-talk{opacity:0}',
    `${Array.from({ length: MOUTH_SHAPES }, (_, k) => `.lipsync.v${k} .cm-v${k}`).join(',')}{opacity:1}`,
    '.talking .cm-rest{animation:cm-shut 1.2s linear infinite}',
    '.talking .cm-talk{animation:cm-talk 1.2s linear infinite}',
    keyframes('cm-talk', true),
    keyframes('cm-shut', false),
    `.cm-blink{animation:cm-blink ${BLINK_S}s linear -${blinkAt}s infinite}@keyframes cm-blink{${BLINK_FRAMES}}`,
  ].join('');
}

/**
 * A drawing with code's face in it: in each expression's group, a cover
 * over a mouth the artist drew, the face's resting mouth, the one it
 * talks with, the six shapes of speech, and lids that blink, all in the
 * face's own place and size, so they move with the face, and show and
 * hide with it. `seed`: the character, whose own beat the lids blink on.
 */
export function withFace(
  drawing: GatedDrawing,
  face: SheetFace,
  seed: string,
): GatedDrawing {
  const root = parse(drawing.svg);
  if (!root) return drawing;
  const s = face.scale;
  // Lines as heavy as the artist's, as the kit's are beside its outline.
  const outline = face.line / s;
  const k = outline / 2.6;
  const [mx, my] = face.mouth;
  const mouths = mouthShapes(0, k)
    .map((shape, i) => `<g class="cm-v cm-v${i}">${shape}</g>`)
    .join('');
  const lids = face.eyes
    .map(({ box, lid }) => {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const rx = box.width / 2 + face.line * 0.6;
      const ry = box.height / 2 + face.line * 0.6;
      return (
        `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${lid}" stroke="none"/>` +
        `<path d="M${r1(cx - rx * 0.8)},${r1(cy + ry * 0.05)} Q${r1(cx)},${r1(cy + ry * 0.45)} ${r1(cx + rx * 0.8)},${r1(cy + ry * 0.05)}" fill="none" stroke="${FIGURE_INK}" stroke-width="${r1(face.line)}" stroke-linecap="round"/>`
      );
    })
    .join('');
  let placed = 0;
  for (const name of EXPRESSIONS) {
    const id = drawing.states[name];
    const group = id ? byId(root, id) : null;
    const space = group ? spaceInside(root, group) : null;
    const back = space && invert(space);
    if (!group || !back) continue;
    const cover = face.covered[name];
    const shapes = FACE_MOUTHS[name];
    const markup = [
      // In the drawing's own units, whatever the group is drawn in.
      `<g class="cm" transform="matrix(${back.map(r3).join(' ')})">`,
      cover
        ? `<ellipse cx="${r1(cover.x + cover.width / 2)}" cy="${r1(cover.y + cover.height / 2)}" rx="${r1(cover.width / 2 + face.line)}" ry="${r1(cover.height / 2 + face.line)}" fill="${face.skin}" stroke="none"/>`
        : '',
      `<g transform="translate(${r1(mx)} ${r1(my)}) scale(${r3(s)})" stroke="${FIGURE_INK}" stroke-width="${r3(outline)}" stroke-linejoin="round">`,
      `<g class="cm-rest">${mouthShape(shapes.mouth, 0, k)}</g>`,
      `<g class="cm-talk" opacity="0">${mouthShape(shapes.talk, 0, k)}</g>`,
      mouths,
      '</g>',
      lids ? `<g class="cm-blink" opacity="0">${lids}</g>` : '',
      '</g>',
    ].join('');
    const parsed = parseDocument(markup, { xmlMode: true });
    for (const child of parsed.children) {
      (child as Element).parent = group;
      group.children.push(child);
    }
    placed += 1;
  }
  if (!placed) return drawing;
  const style = new Element('style', {});
  const css = new Text(
    faceCss(Math.round((0.3 + beatOf(seed) * 2.4) * 10) / 10),
  );
  css.parent = style;
  style.children = [css];
  style.parent = root;
  root.children.push(style);
  return {
    ...drawing,
    svg: render(root, { xmlMode: true, selfClosingTags: true }),
  };
}
