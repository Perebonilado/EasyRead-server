/**
 * How the Studio shows a show's people and animals before any film is
 * made: a person as the kit draws them, an animal as the animal kit does,
 * wearing one face, as the stage would show them standing still. Drawn by
 * code in a moment, so a look changed on the cast card is seen at once.
 */
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import type { AnimalSpec } from '../scene-animal';
import { drawAnimal } from '../scene-animal-draw';
import { byId, elements, removeNode } from '../scene-dom';
import { drawFigure, type FigureFace, type FigureSpec } from '../scene-figure';

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
  return wearing(drawAnimal(spec, seed), face);
}

/** A person drawn by the kit with only `face` on. */
export function figurePreview(
  spec: FigureSpec,
  seed: string,
  face: FigureFace = 'happy',
): string {
  return wearing(drawFigure(spec, seed), face);
}
