/**
 * A character drawn once for a whole book, made ready for every page they
 * are on: measured for where their head, body and legs are, so notes on
 * what they are like can point at them, and for where their ink is, so
 * words set round them keep off it. Checked that every face sits on the
 * head, since a face drawn anywhere else is a second head.
 */
import render from 'dom-serializer';
import { Element } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { isolate, type Callout } from './scene-callouts';
import { elements, byId } from './scene-dom';
import {
  drawFigure,
  figureFrame,
  figureOf,
  type FigureHow,
  type FigureSpec,
} from './scene-figure';
import { groundOf, type SetGround } from './scene-ground';
import { outfitWords } from './scene-wear';
import {
  IDENTITY,
  apply,
  invert,
  multiply,
  parseTransform,
  type Matrix,
} from './scene-joints';
import type { OwnPropDrawing, PropSize } from './scene-props';
import { renderSvg, type InkBox, type InkMap } from './scene-raster';
import type { SetPiece } from './scene-set-pieces';
import { jointNotes, type SheetRig } from './scene-sheet-rig';
import { DRAWN } from './scene-own';
import type { SceneScript } from './scene-script';
import {
  EXPRESSIONS,
  OWN_FEATURE_CANVAS,
  OWN_THING_CANVAS,
  standsOnStage,
  type StoryBible,
  type StorySize,
} from './scene-story';
import { revealedSvg, stillTree, type GatedDrawing } from './scene-svg';

/**
 * Sheets drawn by an older way of drawing them are drawn again. 2: people
 * drawn by the kit, everyone else by the artist in the kit's style.
 */
export const SHEET_VERSION = 2;

export type Point = [number, number];

export interface CharacterSheet {
  version: number;
  drawing: GatedDrawing;
  /**
   * Where each is, in the drawing's own units; and, for one the artist
   * drew, its mouth: where what it carries rides. Absent on a sheet kept
   * before it was measured, measured when next used.
   */
  anchors: {
    head: Point | null;
    body: Point | null;
    legs: Point | null;
    mouth?: Point | null;
  };
  /** A person's look, as the kit drew them. */
  figure?: FigureSpec;
  /** An animal's or a creature's size beside people, as the artist was told. */
  size?: StorySize;
  /** An animal or a creature rigged by code: its joints, and the parts moved in to meet the body. */
  rig?: SheetRig;
}

/**
 * How tall an animal or a creature stands, in the kit's units, by its
 * size: a grown-up's frame is 234, a child's 190. Larger than life for
 * the small ones, as a cartoon's are: a fox who talks must be seen to.
 */
export const SIZE_UNITS: Record<StorySize, number> = {
  small: 95,
  medium: 130,
  large: 230,
};

/**
 * A person drawn by the kit, made ready for the stage the way a drawing
 * is: measured for its ink, so words set round them keep off it, and
 * marked as one who stands with people.
 */
export async function figureDrawing(
  spec: FigureSpec,
  seed: string,
  /** How many, their pose, what they hold, the signs they show on the page. */
  how: FigureHow = {},
): Promise<GatedDrawing & { anchors: CharacterSheet['anchors'] }> {
  const drawn = drawFigure(spec, seed, how);
  const measured = await renderSvg(drawn.svg, undefined, {
    grid: { svg: drawn.svg, cols: 48 },
  });
  const [, , w, h] = drawn.viewBox;
  return {
    svg: drawn.svg,
    viewBox: drawn.viewBox,
    aspect: w / h,
    parts: drawn.parts,
    labels: {},
    states: drawn.states,
    moves: true,
    callouts: [],
    field: measured.grid
      ? { viewBox: drawn.viewBox, map: measured.grid }
      : null,
    head: drawn.anchors.head,
    stands: { units: h },
    acts: true,
    anchors: drawn.anchors,
    ...(drawn.joints ? { joints: drawn.joints } : {}),
    ...(drawn.legs ? { legs: drawn.legs } : {}),
    wears: {
      top: spec.top,
      topColour: spec.topColour,
      headwear: spec.headwear,
    },
    outfits: [spec, ...(how.dress ?? []).map((one) => one.spec)].map(
      outfitWords,
    ),
  };
}

/**
 * Someone the text's own tradition never draws, as the stage shows them:
 * a soft light where they stand, the height of a grown-up, glowing gently.
 * No face, no body, nothing that acts; their words come from it.
 */
export function lightDrawing(seed: string): GatedDrawing {
  const viewBox = figureFrame('adult');
  const [x, y, w, h] = viewBox;
  const cx = x + w / 2;
  const cy = y + h * 0.5;
  const id = `light-${seed.replace(/[^a-z0-9-]/gi, '')}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">`,
    `<defs><radialGradient id="${id}" cx="50%" cy="50%" r="50%">`,
    '<stop offset="0" stop-color="#fffdf2" stop-opacity="0.95"/>',
    '<stop offset="0.4" stop-color="#fff0bf" stop-opacity="0.7"/>',
    '<stop offset="1" stop-color="#ffe08a" stop-opacity="0"/>',
    '</radialGradient></defs>',
    `<style>.glow{transform-box:fill-box;transform-origin:50% 50%;animation:${id}-glow 4.8s ease-in-out infinite}@keyframes ${id}-glow{0%,100%{opacity:.82;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}</style>`,
    `<g class="glow"><ellipse cx="${cx}" cy="${cy}" rx="${w * 0.46}" ry="${h * 0.5}" fill="url(#${id})"/></g>`,
    '</svg>',
  ].join('');
  return {
    svg,
    viewBox,
    aspect: w / h,
    parts: {},
    labels: {},
    states: {},
    moves: true,
    callouts: [],
    field: null,
    // Their words come from about where a head would be.
    head: [cx, y + h * 0.22],
    stands: { units: h },
  };
}

/** A story's person drawn by the kit, once for the whole book. */
export async function figureSheet(
  spec: FigureSpec,
  seed: string,
): Promise<CharacterSheet> {
  const { anchors, ...drawing } = await figureDrawing(spec, seed);
  return { version: SHEET_VERSION, drawing, anchors, figure: spec };
}

/** A book's characters as drawn, by their id in the story. */
export type Cast = Record<string, CharacterSheet>;

const EMPTY = '<svg xmlns="http://www.w3.org/2000/svg"/>';

const centre = (box: InkBox): Point => [
  Math.round((box.x + box.width / 2) * 10) / 10,
  Math.round((box.y + box.height / 2) * 10) / 10,
];

/** A mouth: the low middle of the face it is drawn in. */
const lowMiddle = (face: InkBox | null): Point | null =>
  face && face.width > 0 && face.height > 0
    ? [
        Math.round((face.x + face.width / 2) * 10) / 10,
        Math.round((face.y + face.height * 0.85) * 10) / 10,
      ]
    : null;

const overlap = (a: InkBox, b: InkBox) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/**
 * A gated drawing measured as a sheet: its parts' places, its ink map,
 * and what is wrong with its faces and its joints, to tell the artist on
 * a second try.
 */
export async function measureSheet(
  drawing: GatedDrawing,
): Promise<{ sheet: CharacterSheet; notes: string[] }> {
  const doc = parseDocument(drawing.svg, { xmlMode: true });
  const root = elements(doc.children).find(
    (node) => node.name.toLowerCase() === 'svg',
  );
  const names = ['head', 'body', 'legs', ...EXPRESSIONS];
  const ids = names.map(
    (name) => drawing.parts[name] ?? drawing.states[name] ?? null,
  );
  const [measured, floating] = await Promise.all([
    renderSvg(drawing.svg, undefined, {
      variants: ids.map(
        (id) => (id && root ? isolate(root, id) : null) ?? EMPTY,
      ),
      grid: { svg: drawing.svg, cols: 48 },
    }),
    // A part that floats off the body is drawn again once before code
    // moves it in. Advice only: a drawing measured well is never lost to it.
    jointNotes(drawing).catch(() => []),
  ]);
  const inks = measured.inks ?? [];
  const box = (name: string) => inks[names.indexOf(name)] ?? null;
  const at = (name: string) => {
    const found = box(name);
    return found && found.width > 0 && found.height > 0 ? centre(found) : null;
  };
  const notes: string[] = [];
  const head = box('head');
  if (head) {
    const astray = EXPRESSIONS.filter((name) => {
      const face = box(name);
      return face && !overlap(face, head);
    });
    if (astray.length)
      notes.push(
        `The faces ${astray.join(', ')} are not on the head: draw every expression's eyes, brows and mouth inside the head, all in the same place.`,
      );
  }
  if (!box('neutral'))
    notes.push(
      'Draw the neutral face: <g id="neutral"> with its eyes, brows and mouth.',
    );
  notes.push(...floating);
  return {
    sheet: {
      version: SHEET_VERSION,
      drawing: {
        ...drawing,
        field: measured.grid
          ? { viewBox: drawing.viewBox, map: measured.grid }
          : drawing.field,
      },
      anchors: {
        head: at('head'),
        body: at('body'),
        legs: at('legs'),
        mouth: lowMiddle(box('neutral')),
      },
    },
    notes,
  };
}

/**
 * Where a drawing's mouth is: the low middle of its neutral face, or
 * null when it has none to measure. For a sheet kept before mouths were
 * measured.
 */
export async function mouthOf(drawing: GatedDrawing): Promise<Point | null> {
  const id = drawing.states.neutral ?? drawing.parts.neutral;
  const doc = parseDocument(drawing.svg, { xmlMode: true });
  const root = elements(doc.children).find(
    (node) => node.name.toLowerCase() === 'svg',
  );
  const face = id && root ? isolate(root, id) : null;
  if (!face) return null;
  const measured = await renderSvg(drawing.svg, undefined, {
    variants: [face],
  });
  return lowMiddle(measured.inks?.[0] ?? null);
}

/**
 * What a character is like, set beside them the first time the book meets
 * them: a note at their head, then at their body, then at their legs.
 */
export function introCallouts(
  sheet: CharacterSheet,
  traits: string[],
): Callout[] {
  const [x, y, w, h] = sheet.drawing.viewBox;
  const middle: Point = [x + w / 2, y + h / 2];
  const { head, body, legs } = sheet.anchors;
  const points = [head, body, legs];
  return traits.slice(0, 3).map((text, i) => ({
    part: `trait-${i + 1}`,
    text,
    anchor: points[i] ?? body ?? middle,
  }));
}

/**
 * Sets painted by an older way of painting them are painted again. 2:
 * painted to go with the people the kit draws (SET_STYLE). 3: a whole,
 * recognisable place, dressed for the story's world, and what stands in
 * front of people's legs (a boat's side) a group of its own.
 */
export const SET_VERSION = 3;

/** A place painted once for a book: the scene behind the stage. */
export interface SetSheet {
  version: number;
  drawing: GatedDrawing;
  /** Where its open ground is, measured once from the painting; absent on a set kept before, measured when next used. */
  ground?: SetGround;
}

/** A book's places as painted, by their id in the story. */
export type Sets = Record<string, SetSheet>;

/** Sets read back from storage: only those painted the way they are painted now. */
export function setsOf(raw: unknown): Sets {
  if (!raw || typeof raw !== 'object') return {};
  const out: Sets = {};
  for (const [id, set] of Object.entries(raw as Record<string, unknown>)) {
    const one = set as Partial<SetSheet> | null;
    if (one?.version === SET_VERSION && one.drawing?.svg) {
      // A ground that cannot be read is measured again.
      const { ground, ...rest } = one as SetSheet;
      const read = ground ? groundOf(ground) : null;
      out[id] = read ? { ...rest, ground: read } : rest;
    }
  }
  return out;
}

/** A cast read back from storage: only sheets drawn the way they are drawn now. */
export function castOf(raw: unknown): Cast {
  if (!raw || typeof raw !== 'object') return {};
  const out: Cast = {};
  for (const [id, sheet] of Object.entries(raw as Record<string, unknown>)) {
    const one = sheet as Partial<CharacterSheet> | null;
    if (one?.version === SHEET_VERSION && one.drawing?.svg && one.anchors) {
      // Kept before the gate showed what an artist hid: shown now.
      const d = one.drawing;
      out[id] = {
        ...(one as CharacterSheet),
        ...(one.figure ? { figure: figureOf(one.figure) } : {}),
        drawing: {
          ...d,
          svg: revealedSvg(d.svg, [
            ...Object.values(d.parts ?? {}),
            ...Object.values(d.states ?? {}),
            ...Object.values(d.labels ?? {}),
          ]),
        },
      };
    }
  }
  return out;
}

// ── A show's own things and features, measured ──────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The kit's units to a centimetre: a grown-up, 224 tall, is about 170 cm. */
const UNITS_PER_CM = 224 / 170;

/** How big a thing really is, in centimetres, where a model has said. */
export interface RealSize {
  heightCm: number;
  lengthCm: number;
}

/** A real size that can be drawn at: both sizes numbers, one of them more than nothing. */
const sane = (size: RealSize | null | undefined): size is RealSize =>
  Boolean(size) &&
  Number.isFinite(size!.heightCm) &&
  Number.isFinite(size!.lengthCm) &&
  Math.max(size!.heightCm, size!.lengthCm) > 0;

/** How much of a box an ink map fills, 0 to 1: a ball about 0.79, a book nearly all of it. */
function filling(
  map: InkMap,
  viewBox: [number, number, number, number],
  box: InkBox,
): number {
  const [vx, vy, vw, vh] = viewBox;
  const col = (x: number) =>
    Math.min(map.cols - 1, Math.max(0, Math.floor(((x - vx) / vw) * map.cols)));
  const row = (y: number) =>
    Math.min(map.rows - 1, Math.max(0, Math.floor(((y - vy) / vh) * map.rows)));
  let ink = 0;
  let all = 0;
  for (let r = row(box.y); r <= row(box.y + box.height); r += 1)
    for (let c = col(box.x); c <= col(box.x + box.width); c += 1) {
      all += 1;
      if (map.bits[r * map.cols + c] === '1') ink += 1;
    }
  return all ? ink / all : 0;
}

/**
 * A drawing of the artist's, still and its own (stillTree), set in the
 * kit's units: its ink's bottom middle at (0, 0), scaled by `scale`. What
 * the drawing's root sets for all it holds (a fill, a stroke) is kept.
 */
function inKitUnits(
  root: Element,
  ink: InkBox,
  scale: number,
  pad: number,
): { svg: string; viewBox: [number, number, number, number] } {
  const cx = ink.x + ink.width / 2;
  const base = ink.y + ink.height;
  const w = ink.width * scale;
  const h = ink.height * scale;
  const viewBox: [number, number, number, number] = [
    r1(-w / 2 - pad),
    r1(-h - pad),
    r1(w + pad * 2),
    r1(h + pad * 2),
  ];
  const carried = [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linejoin',
    'stroke-linecap',
    'style',
  ]
    .filter((name) => root.attribs[name])
    .map((name) => ` ${name}="${root.attribs[name].replace(/"/g, '&quot;')}"`)
    .join('');
  const inner = render(root.children, { xmlMode: true, selfClosingTags: true });
  const xlink = inner.includes('xlink:')
    ? ' xmlns:xlink="http://www.w3.org/1999/xlink"'
    : '';
  return {
    viewBox,
    svg: `<svg xmlns="http://www.w3.org/2000/svg"${xlink} viewBox="${viewBox.join(' ')}"><g transform="translate(${r3(-cx * scale)} ${r3(-base * scale)}) scale(${r3(scale)})"${carried}>${inner}</g></svg>`,
  };
}

/** A drawing's root and the ink of each of its named parts, measured once. */
async function measuredParts(
  drawing: GatedDrawing,
  parts: readonly string[],
): Promise<{
  root: Element;
  ink: InkBox;
  boxes: Record<string, InkBox | null>;
  grid: InkMap | null;
}> {
  const doc = parseDocument(drawing.svg, { xmlMode: true });
  const root = elements(doc.children).find(
    (node) => node.name.toLowerCase() === 'svg',
  );
  if (!root) throw new Error('it has no drawing in it');
  const ids = parts.map((name) => drawing.parts[name] ?? null);
  const measured = await renderSvg(drawing.svg, undefined, {
    variants: ids.map((id) => (id ? isolate(root, id) : null) ?? EMPTY),
    grid: { svg: drawing.svg, cols: 48 },
  });
  const ink = measured.ink;
  if (!ink || ink.width <= 0 || ink.height <= 0)
    throw new Error('it came out blank');
  const boxes: Record<string, InkBox | null> = {};
  parts.forEach((name, k) => {
    const box = measured.inks?.[k] ?? null;
    boxes[name] = box && box.width > 0 && box.height > 0 ? box : null;
  });
  return { root, ink, boxes, grid: measured.grid ?? null };
}

/**
 * A thing of a show's own, drawn by the artist, measured for the stage:
 * how big it is (its longest side as long as the thing really is, where
 * that is known; else as drawn, at its true size in the kit's units on a
 * canvas as tall as a grown-up, and one drawn filling the canvas, as though
 * told nothing of its size, taken as one held in both arms), where a
 * hand holds it (its "grip") and a mouth (the same, a dog's jaws on the
 * handle), whether it hangs from its grip at the side (a bucket), and how
 * it goes loose: a round one rolls, bounces once and spins; a long thin
 * one bounces and spins; a big one does neither. Set in the kit's units,
 * still and its own.
 */
export async function measureOwnThing(
  drawing: GatedDrawing,
  id: string,
  real: RealSize | null = null,
): Promise<OwnPropDrawing> {
  const { root, ink, boxes, grid } = await measuredParts(drawing, ['grip']);
  const canvas = OWN_THING_CANVAS;
  const long = Math.max(ink.width, ink.height);
  const filled = ink.width >= canvas.w * 0.9 || ink.height >= canvas.h * 0.9;
  const units = sane(real)
    ? Math.min(
        220,
        Math.max(8, Math.max(real.heightCm, real.lengthCm) * UNITS_PER_CM),
      )
    : filled
      ? 70
      : Math.min(140, Math.max(12, long));
  const scale = units / long;
  // In a hand (a cup, a key); held in the arms or both hands (a kite, a
  // drum); longer than a child's arm (a spear, a pole).
  const size: PropSize =
    units <= 45 ? 'small' : units <= 130 ? 'medium' : 'large';
  const cx = ink.x + ink.width / 2;
  const base = ink.y + ink.height;
  const at = ([x, y]: Point): Point => [
    r1((x - cx) * scale),
    r1((y - base) * scale),
  ];
  const gripBox = boxes.grip;
  const middle: Point = [cx, ink.y + ink.height / 2];
  const held = gripBox ? centre(gripBox) : middle;
  const grip = at(held);
  const aspect = ink.width / ink.height;
  const round =
    aspect >= 0.8 &&
    aspect <= 1.25 &&
    grid !== null &&
    Math.abs(filling(grid, drawing.viewBox, ink) - 0.79) < 0.1;
  // Held by a handle at its top, and not small: carried hanging at the side.
  const hangs =
    gripBox !== null &&
    size !== 'small' &&
    (held[1] - ink.y) / ink.height < 0.3;
  const thin = aspect > 2.5 || aspect < 0.4;
  stillTree(root, `own-${id}`);
  return {
    ...inKitUnits(root, ink, scale, 3),
    grip,
    bite: grip,
    // What goes to a mouth: its top, the rim of a bowl or a bottle's neck.
    mouth: [0, r1(-ink.height * scale * 0.9)],
    size,
    loose: {
      bounce: round || thin ? 1 : 0,
      ...(round && !hangs ? { rolls: true as const } : {}),
      ...(size !== 'large' && !hangs ? { spins: true as const } : {}),
      ...(hangs ? { hangs: true as const } : {}),
    },
  };
}

/**
 * The ancestors' transforms of an element, as one matrix: the space its
 * own transform, or a stage's in place of it, is set in.
 */
function spaceOf(node: Element, root: Element): Matrix {
  const chain: Element[] = [];
  for (
    let at = node.parent as Element | null;
    at && at !== root;
    at = at.parent as Element | null
  )
    chain.unshift(at);
  return chain.reduce(
    (m, at) => multiply(m, parseTransform(at.attribs.transform) ?? IDENTITY),
    IDENTITY,
  );
}

/**
 * A feature of a show's own, drawn by the artist, measured for the stage:
 * its footprint in the kit's units (as big as the thing really is, where
 * that is known: a bicycle as long as a bicycle, a hut or a signpost as
 * tall as one; else as drawn, at its true size, and one filling
 * its canvas, told nothing of its size, about as high as a bench and a
 * half), the part that opens (its "leaf", turned about the edge of
 * it nearer the feature's middle, where its hinge is), the way in, through
 * or under it (its "opening", else what its leaf covers), how high its
 * seat is, and whether it stands low before the people by it, rather than
 * behind them: something low that is no seat and no way through (a
 * canoe's side, a drum). Set in the kit's units, still and its own.
 */
export async function measureOwnFeature(
  drawing: GatedDrawing,
  id: string,
  size: RealSize | null = null,
): Promise<SetPiece> {
  const { root, ink, boxes } = await measuredParts(drawing, [
    'leaf',
    'opening',
    'seat',
  ]);
  const canvas = OWN_FEATURE_CANVAS;
  const filled = ink.width >= canvas.w * 0.92 || ink.height >= canvas.h * 0.92;
  // As long as it really is, when it is long (a bicycle, a canoe); else as
  // tall (a hut, a signpost).
  const real = sane(size)
    ? size.lengthCm > size.heightCm * 1.5
      ? (size.lengthCm * UNITS_PER_CM) / ink.width
      : (size.heightCm * UNITS_PER_CM) / ink.height
    : null;
  const scale = Math.min(
    420 / ink.height,
    800 / ink.width,
    real ??
      (filled
        ? Math.min(150 / ink.height, 400 / ink.width)
        : Math.min(380, Math.max(24, ink.height)) / ink.height),
  );
  const cx = ink.x + ink.width / 2;
  const base = ink.y + ink.height;
  const at = ([x, y]: Point): Point => [
    r1((x - cx) * scale),
    r1((y - base) * scale),
  ];
  const boxAt = (box: InkBox): [number, number, number, number] => [
    ...at([box.x, box.y]),
    ...at([box.x + box.width, box.y + box.height]),
  ];
  // Its leaf turned about the edge nearer its middle, in the space its
  // own transform is set in: that transform moved to a group around it,
  // so the stage's turning of it is all there is on it.
  const prefix = `own-${id}`;
  const leafBox = boxes.leaf;
  const leafId = drawing.parts.leaf;
  let leaf: SetPiece['leaf'];
  stillTree(root, prefix);
  const leafNode = leafBox && leafId ? byId(root, `${prefix}-${leafId}`) : null;
  if (leafBox && leafNode) {
    const own = parseTransform(leafNode.attribs.transform) ?? IDENTITY;
    const space = invert(multiply(spaceOf(leafNode, root), own));
    if (space) {
      if (leafNode.attribs.transform) {
        const around = new Element('g', {
          transform: leafNode.attribs.transform,
        });
        delete leafNode.attribs.transform;
        const parent = leafNode.parent as Element;
        parent.children = parent.children.map((child) =>
          child === leafNode ? around : child,
        );
        around.parent = parent;
        around.children = [leafNode];
        leafNode.parent = around;
      }
      const near =
        Math.abs(leafBox.x - cx) <= Math.abs(leafBox.x + leafBox.width - cx)
          ? leafBox.x
          : leafBox.x + leafBox.width;
      const [hx, hy] = apply(space, [near, leafBox.y + leafBox.height / 2]);
      leaf = { id: `${prefix}-${leafId}`, hinge: [r1(hx), r1(hy)] };
    }
  }
  // A way through is one a person could fit: down to the ground, and as
  // wide as someone; a seat is at a height someone sits at.
  const fits = (box: InkBox) =>
    (base - (box.y + box.height)) * scale < 30 &&
    box.width * scale >= 36 &&
    box.height * scale >= 40;
  const opening = boxes.opening;
  const way = opening && fits(opening) ? opening : leaf ? leafBox : null;
  const high = boxes.seat ? r1(-at([0, boxes.seat.y])[1]) : null;
  const seat = high !== null && high >= 20 && high <= 130 ? high : null;
  const low = ink.height * scale < 80;
  return {
    ...inKitUnits(root, ink, scale, 4),
    ...(leaf ? { leaf, enters: true as const } : {}),
    ...(way ? { opening: boxAt(way) } : {}),
    ...(seat ? { seat } : {}),
    ...(low && !seat && !way ? { front: true as const } : {}),
  };
}

/**
 * A show's own things and features as the artist drew them and code
 * measured them, each once for the whole show, by id: kept beside its
 * cast and its sets for every later scene and episode. A feature keeps
 * whether it was drawn to open, so one the words later open is drawn
 * again with a leaf.
 */
export interface OwnSheets {
  version: number;
  things: Record<string, OwnPropDrawing>;
  features: Record<string, { piece: SetPiece; opens: boolean }>;
  /** When each that could not be drawn last failed, by "thing:kite" or "feature:signpost". */
  failed?: Record<string, number>;
  /** How big each really is, as asked once, by the same: for drawing it again. */
  sizes?: Record<string, RealSize>;
}

/** How long one of a show's own that could not be drawn is left before it is asked for again. */
export const OWN_RETRY_MS = 30 * 60_000;

/** Whether one of a show's own could not be drawn a short while ago: something stands in for it, and nothing is asked. */
export const failedLately = (
  own: OwnSheets,
  mark: string,
  now = Date.now(),
): boolean => now - (own.failed?.[mark] ?? -Infinity) < OWN_RETRY_MS;

/** Own things and features drawn by an older way of drawing them are drawn again. */
export const OWN_VERSION = 1;

/** A show's own drawings read back from storage: only those drawn the way they are drawn now, and whole. */
export function ownSheetsOf(raw: unknown): OwnSheets {
  const out: OwnSheets = { version: OWN_VERSION, things: {}, features: {} };
  const said = raw as Partial<OwnSheets> | null;
  if (!said || typeof said !== 'object' || said.version !== OWN_VERSION)
    return out;
  for (const [id, thing] of Object.entries(said.things ?? {}))
    if (thing?.svg && thing.viewBox?.length === 4 && thing.grip && thing.loose)
      out.things[id] = thing;
  for (const [id, feature] of Object.entries(said.features ?? {}))
    if (feature?.piece?.svg && feature.piece.viewBox?.length === 4)
      out.features[id] = feature;
  for (const [mark, at] of Object.entries(said.failed ?? {}))
    if (Number.isFinite(at)) out.failed = { ...out.failed, [mark]: at };
  for (const [mark, size] of Object.entries(said.sizes ?? {}))
    if (sane(size)) out.sizes = { ...out.sizes, [mark]: size };
  return out;
}

/**
 * What a script stands on its stage that its book or show has not drawn
 * yet, by name: a character not in the cast, a place not in the sets, a
 * thing or feature of the show's own not kept. Someone never seen (a
 * voice, a light where they stand) needs no drawing.
 */
export function notDrawnYet(
  script: Pick<SceneScript, 'cast' | 'ownThings' | 'features'>,
  bible: Pick<StoryBible, 'characters' | 'places'>,
  cast: Cast,
  sets: Sets,
  own: OwnSheets | null,
): string[] {
  const missing: string[] = [];
  for (const thing of script.cast) {
    if (thing.kind === 'character') {
      const character = bible.characters.find((c) => c.id === thing.ref);
      if (
        character &&
        standsOnStage(character) &&
        character.presence !== 'light' &&
        !cast[character.id]
      )
        missing.push(character.name);
    }
    if (thing.kind === 'place') {
      const place = bible.places.find((p) => p.id === thing.ref);
      if (place && !sets[place.id]) missing.push(place.name);
    }
  }
  // One kept that the words have since said a look for, or opened, is
  // drawn again: not yet as they say it.
  for (const thing of script.ownThings ?? []) {
    const kept = own?.things[thing.id];
    if (!kept || (thing.look && kept.look !== thing.look))
      missing.push(thing.name);
  }
  for (const feature of script.features ?? []) {
    const kept = own?.features[feature.id];
    if (feature.kind === DRAWN && (!kept || (feature.opens && !kept.opens)))
      missing.push(feature.name);
  }
  return missing;
}
