/**
 * How the Studio shows a show's people and animals before any film is
 * made: a person as the kit draws them, an animal as the animal kit does
 * and a creature as the creature kit does,
 * wearing one face, as the stage would show them standing still. Drawn by
 * code in a moment, so a look changed on the cast card is seen at once.
 */
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import type { AnimalSpec } from '../scene-animal';
import { drawAnimal } from '../scene-animal-draw';
import type { CreatureSpec } from '../scene-creature';
import { drawCreature } from '../scene-creature-draw';
import { byId, elements, removeNode } from '../scene-dom';
import {
  drawFigure,
  isAskedFace,
  type FigureFace,
  type FigureSpec,
} from '../scene-figure';
import { drawnInViews } from '../scene-figure-views';

/** What to draw for a face: one drawn only when asked for is asked for. */
const asking = (face: FigureFace) =>
  isAskedFace(face) ? { faces: [face] } : {};

/** A drawing with only one of its states on: `face`. */
function wearing(
  drawn: { svg: string; states: Record<string, string> },
  face: string,
): string {
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const [name, id] of Object.entries(drawn.states))
    if (name !== face) {
      const group = byId(root, id);
      if (group) removeNode(group);
    }
  return render(doc, { xmlMode: true });
}

/** An animal drawn by the kit with only `face` on. */
export function animalPreview(
  spec: AnimalSpec,
  seed: string,
  face: FigureFace = 'happy',
): string {
  return wearing(drawAnimal(spec, seed, asking(face)), face);
}

/** A creature drawn by the kit with only `face` on. */
export function creaturePreview(
  spec: CreatureSpec,
  seed: string,
  face: FigureFace = 'happy',
): string {
  return wearing(drawCreature(spec, seed, asking(face)), face);
}

/** A person drawn by the kit with only `face` on. */
export function figurePreview(
  spec: FigureSpec,
  seed: string,
  face: FigureFace = 'happy',
): string {
  return wearing(drawFigure(spec, seed, asking(face)), face);
}

/**
 * A person drawn by the kit with a face of moving parts (scene-face-rig),
 * seen from the front, the kit's own faces taken out: a player that marks
 * the drawing `.rigged` moves the face channel by channel (a show's host,
 * studio-host). Null where the kit draws no views (a group, someone lying).
 */
export function figureRigged(spec: FigureSpec, seed: string): string | null {
  const drawn = drawnInViews(spec, seed, { faceRig: true });
  if (!drawn) return null;
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const id of Object.values(drawn.states)) {
    const group = byId(root, id);
    if (group) removeNode(group);
  }
  return render(doc, { xmlMode: true });
}
