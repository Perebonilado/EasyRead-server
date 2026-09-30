/**
 * A made scene's parts, rebuilt from its film as stored (studio-vertical-
 * plan §1.4): for a scene made before its parts were kept beside it, so
 * that its twin in the other shape can still be composed with nothing
 * drawn, voiced or asked of a model.
 *
 * The film keeps its voice whole (its sentences, their times, its pace)
 * and each drawing the artist made as the stage showed it: its svg, its
 * named groups, and its labels as the stage set them (what each says, by
 * part). What the stage needs of a drawing besides is measured again here
 * by code: its viewBox from the svg, where each label points (the middle
 * of its part, as the gate points a label with no leader it can believe),
 * and where the drawing has ink, so words set over it keep to its empty
 * room. A drawing whose labels cannot be measured is kept as drawn, with
 * no labels set beside it, and said; a drawing the film showed only as a
 * card is a card again.
 */
import { parseDocument } from 'htmlparser2';
import type { Element } from 'domhandler';
import type { SceneDto, SceneThingDto, SceneTiming } from '../../contracts';
import { anchorOf, isolate, type Callout } from './scene-callouts';
import { renderSvg, type InkBox } from './scene-raster';
import type { SceneScript } from './scene-script';
import type { GatedDrawing } from './scene-svg';
import type { TimedBeat } from './scene-timing';

/** A made scene's voice, as its parts keep it. */
export interface ScenePartsVoice {
  beats: TimedBeat[];
  durationMs: number;
  timing: SceneTiming;
  voicePace?: number;
}

/**
 * A made scene's parts, kept beside its film (studio-twins partsKeyOf):
 * what its twin in the other shape is composed from, with nothing drawn
 * or voiced again.
 */
export interface SceneParts extends ScenePartsVoice {
  version: 1;
  /** Its script as staged, the show's own things as drawn with it. */
  script: SceneScript;
  /** The drawings the artist made for it alone, by the thing's id. */
  drawings: [string, GatedDrawing][];
  /** Drawings that did not come through, shown as cards with their names: cards again, never drawn anew. */
  cards?: string[];
}

type DrawnThing = Extract<SceneThingDto, { kind: 'drawing' }>;

/** A drawing's root element, or null when its svg does not parse. */
function rootOf(svg: string): Element | null {
  const doc = parseDocument(svg, { xmlMode: true, recognizeCDATA: true });
  return (
    (doc.children.find(
      (node) => 'name' in node && (node as Element).name === 'svg',
    ) as Element | undefined) ?? null
  );
}

/** The svg's own units: its viewBox, else its width and height; null when it says neither. */
export function viewBoxOf(
  root: Element,
): [number, number, number, number] | null {
  const box = (root.attribs.viewBox ?? root.attribs.viewbox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    box.length === 4 &&
    box.every(Number.isFinite) &&
    box[2] > 0 &&
    box[3] > 0
  )
    return box as [number, number, number, number];
  const w = parseFloat(root.attribs.width ?? '');
  const h = parseFloat(root.attribs.height ?? '');
  return w > 0 && h > 0 ? [0, 0, w, h] : null;
}

/** A share of a box across and down, back in its own units. */
const unitsOf = (
  viewBox: [number, number, number, number],
  [x, y]: [number, number],
): [number, number] => [
  Math.round((viewBox[0] + x * viewBox[2]) * 100) / 100,
  Math.round((viewBox[1] + y * viewBox[3]) * 100) / 100,
];

const round = (n: number) => Math.round(n * 10) / 10;

/** What an artist's drawing carries for the stage besides, as the film has it: back in its own units. */
function carried(
  thing: DrawnThing,
  viewBox: [number, number, number, number],
): Partial<GatedDrawing> {
  return {
    ...(thing.head ? { head: unitsOf(viewBox, thing.head) } : {}),
    ...(thing.mouth ? { mouth: unitsOf(viewBox, thing.mouth) } : {}),
    ...(thing.neck && thing.dip
      ? { neck: unitsOf(viewBox, thing.neck), dip: thing.dip }
      : {}),
    ...(thing.sinks ? { sinks: thing.sinks } : {}),
    ...(thing.faces ? { faces: thing.faces } : {}),
    ...(thing.lips ? { lips: true as const } : {}),
    ...(thing.limbs ? { limbs: true as const } : {}),
    ...(thing.onePiece ? { onePiece: true as const } : {}),
    ...(thing.units ? { stands: { units: thing.units } } : {}),
  };
}

/**
 * One drawing as the gate handed it on, from the film's: its labels'
 * places and its ink measured again. Null when its svg does not parse or
 * says no size; its labels dropped (and said) when they cannot be measured.
 */
export async function drawingFromFilm(
  thing: DrawnThing,
  notes: string[] = [],
): Promise<GatedDrawing | null> {
  const root = rootOf(thing.svg);
  const viewBox = root ? viewBoxOf(root) : null;
  if (!root || !viewBox) return null;
  const drawing: GatedDrawing = {
    svg: thing.svg,
    viewBox,
    aspect: thing.aspect,
    parts: { ...thing.parts },
    labels: { ...thing.labels },
    states: { ...thing.states },
    moves: thing.moves,
    callouts: [],
    field: null,
    ...carried(thing, viewBox),
  };
  const said = Object.entries(thing.callouts ?? {}).filter(
    ([part, text]) => text.trim() && thing.parts[part],
  );
  const lost = Object.keys(thing.callouts ?? {}).filter(
    (part) => !said.some(([one]) => one === part),
  );
  if (!said.length) {
    if (lost.length)
      notes.push(
        `"${thing.id}": no part to point ${lost.length === 1 ? 'its label' : 'its labels'} at (${lost.join(', ')}); kept as drawn with none`,
      );
    return drawing;
  }
  try {
    const measured = await renderSvg(thing.svg, undefined, {
      variants: said.map(
        ([part]) =>
          isolate(root, thing.parts[part]) ??
          '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ),
      grid: { svg: thing.svg, cols: 48 },
    });
    const slack = Math.max(viewBox[2], viewBox[3]) * 0.12;
    const callouts: Callout[] = [];
    said.forEach(([part, text], i) => {
      const box: InkBox | null = measured.inks?.[i] ?? null;
      const at = box
        ? anchorOf({ ends: [], words: null, part: box, slack })
        : null;
      if (!box || !at) {
        lost.push(part);
        return;
      }
      callouts.push({
        part,
        text,
        anchor: [round(at[0]), round(at[1])],
        box: [round(box.x), round(box.y), round(box.width), round(box.height)],
      });
    });
    if (lost.length)
      notes.push(
        `"${thing.id}": ${lost.length === 1 ? 'a label' : `${lost.length} labels`} not set, ${lost.length === 1 ? 'its part' : 'their parts'} not found (${lost.join(', ')})`,
      );
    return {
      ...drawing,
      callouts,
      field: measured.grid ? { viewBox, map: measured.grid } : null,
    };
  } catch (error) {
    notes.push(
      `"${thing.id}": kept as drawn, its labels not set (${(error as Error).message})`,
    );
    return drawing;
  }
}

/**
 * A made scene's parts, from its film as stored and its script as staged:
 * its voice, and each drawing its script asks the artist for as the film
 * showed it. `notes` says what could not be rebuilt as it was, for the
 * log. Null when the film is not the script's (a drawing it asks for the
 * film never showed): then the scene must be made again.
 */
export async function partsFromFilm(
  scene: SceneDto,
  script: SceneScript,
): Promise<{ parts: SceneParts; notes: string[] } | null> {
  const notes: string[] = [];
  const drawings: [string, GatedDrawing][] = [];
  const cards: string[] = [];
  const byId = new Map(scene.things.map((thing) => [thing.id, thing]));
  for (const thing of script.cast) {
    if (thing.kind !== 'drawing') continue;
    const shown = byId.get(thing.id);
    if (!shown) return null;
    // One that did not come through was a card with its name: a card again.
    if (shown.kind !== 'drawing') {
      cards.push(thing.id);
      continue;
    }
    const drawing = await drawingFromFilm(shown, notes);
    if (drawing) drawings.push([thing.id, drawing]);
    else {
      notes.push(`"${thing.id}": its drawing will not read; set as a card`);
      cards.push(thing.id);
    }
  }
  return {
    parts: {
      version: 1,
      script,
      drawings,
      ...(cards.length ? { cards } : {}),
      // The voice's own sentences and times, as the film plays them.
      beats: scene.beats.map((beat) => ({
        text: beat.text,
        startMs: beat.startMs,
        endMs: beat.endMs,
        words: beat.words,
      })),
      durationMs: scene.durationMs,
      timing: scene.timing,
      ...(scene.voicePace !== undefined ? { voicePace: scene.voicePace } : {}),
    },
    notes,
  };
}
