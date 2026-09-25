/**
 * A character drawn once for a whole book, made ready for every page they
 * are on: measured for where their head, body and legs are, so notes on
 * what they are like can point at them, and for where their ink is, so
 * words set round them keep off it. Checked that every face sits on the
 * head, since a face drawn anywhere else is a second head.
 */
import { parseDocument } from 'htmlparser2';
import { isolate, type Callout } from './scene-callouts';
import { elements } from './scene-dom';
import {
  drawFigure,
  figureFrame,
  figureOf,
  type FigureHow,
  type FigureSpec,
} from './scene-figure';
import { renderSvg, type InkBox } from './scene-raster';
import { EXPRESSIONS, type StorySize } from './scene-story';
import { revealedSvg, type GatedDrawing } from './scene-svg';

/**
 * Sheets drawn by an older way of drawing them are drawn again. 2: people
 * drawn by the kit, everyone else by the artist in the kit's style.
 */
export const SHEET_VERSION = 2;

export type Point = [number, number];

export interface CharacterSheet {
  version: number;
  drawing: GatedDrawing;
  /** Where each is, in the drawing's own units. */
  anchors: { head: Point | null; body: Point | null; legs: Point | null };
  /** A person's look, as the kit drew them. */
  figure?: FigureSpec;
  /** An animal's or a creature's size beside people, as the artist was told. */
  size?: StorySize;
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

const overlap = (a: InkBox, b: InkBox) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/**
 * A gated drawing measured as a sheet: its parts' places, its ink map,
 * and what is wrong with its faces, to tell the artist on a second try.
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
  const measured = await renderSvg(drawing.svg, undefined, {
    variants: ids.map((id) => (id && root ? isolate(root, id) : null) ?? EMPTY),
    grid: { svg: drawing.svg, cols: 48 },
  });
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
  return {
    sheet: {
      version: SHEET_VERSION,
      drawing: {
        ...drawing,
        field: measured.grid
          ? { viewBox: drawing.viewBox, map: measured.grid }
          : drawing.field,
      },
      anchors: { head: at('head'), body: at('body'), legs: at('legs') },
    },
    notes,
  };
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
}

/** A book's places as painted, by their id in the story. */
export type Sets = Record<string, SetSheet>;

/** Sets read back from storage: only those painted the way they are painted now. */
export function setsOf(raw: unknown): Sets {
  if (!raw || typeof raw !== 'object') return {};
  const out: Sets = {};
  for (const [id, set] of Object.entries(raw as Record<string, unknown>)) {
    const one = set as Partial<SetSheet> | null;
    if (one?.version === SET_VERSION && one.drawing?.svg)
      out[id] = one as SetSheet;
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
