/**
 * How the Studio shows a show's people before any film is made: a person
 * as the kit draws them, wearing one face, as the stage would show them
 * standing still. Drawn by code in a moment, so a look changed on the cast
 * card is seen at once.
 */
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { byId, elements, removeNode } from '../scene-dom';
import { drawFigure, type FigureFace, type FigureSpec } from '../scene-figure';

/** A person drawn by the kit with only `face` on. */
export function figurePreview(
  spec: FigureSpec,
  seed: string,
  face: FigureFace = 'happy',
): string {
  const drawn = drawFigure(spec, seed);
  const doc = parseDocument(drawn.svg, { xmlMode: true });
  const root = elements(doc.children)[0];
  for (const [name, id] of Object.entries(drawn.states))
    if (name !== face) {
      const group = byId(root, id);
      if (group) removeNode(group);
    }
  return render(doc, { xmlMode: true });
}
