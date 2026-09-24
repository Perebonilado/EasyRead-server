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
import { renderSvg, type InkBox } from './scene-raster';
import { EXPRESSIONS } from './scene-story';
import { revealedSvg, type GatedDrawing } from './scene-svg';

/** Sheets drawn by an older way of drawing them are drawn again. */
export const SHEET_VERSION = 1;

export type Point = [number, number];

export interface CharacterSheet {
  version: number;
  drawing: GatedDrawing;
  /** Where each is, in the drawing's own units. */
  anchors: { head: Point | null; body: Point | null; legs: Point | null };
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

/** Sets painted by an older way of painting them are painted again. */
export const SET_VERSION = 1;

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
