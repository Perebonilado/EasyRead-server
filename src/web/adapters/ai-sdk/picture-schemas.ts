/**
 * The picture desk's look at a picture (picture_focus; WP11): cells of a
 * six-by-six grid for the people's faces and for what the picture is of,
 * how many people show, and what kind of picture it is. Flat and lenient,
 * as the Studio's answers are: a value a little wrong is caught as
 * nothing. pictures/focus.ts reads the cells from the closed list and
 * makes the box; a model never writes a coordinate.
 */
import { z } from 'zod';
import { CELLS, PICTURE_KINDS } from '../../../business/domain/pictures/focus';

const cells = () => z.array(z.string().catch('')).max(36).catch([]);

export const pictureFocusSchema = z.object({
  faces: cells(),
  subject: cells(),
  people: z.number().int().min(0).max(30).catch(0),
  kind: z
    .enum(PICTURE_KINDS as unknown as [string, ...string[]])
    .catch('other'),
});

/** What the desk asks of a picture, every answer named from a list. */
export function pictureFocusPrompt(): string {
  return [
    'You look at an archive picture for a documentary film, to crop it to its subject. You never say who anyone is.',
    'The picture is divided into a grid of six columns, A to F from left to right, and six rows, 1 to 6 from top to bottom. A1 is the top-left cell, F6 the bottom-right.',
    'Answer:',
    '- faces: every cell holding part of a clearly visible human face (none for none);',
    '- subject: the cells holding what the picture is of: the people, the building, the scene that matters;',
    '- people: how many people are clearly visible;',
    `- kind: what the picture is, one of ${PICTURE_KINDS.join(', ')}. "photograph-of-a-print" is a photograph of another photograph or a framed print (its edges, glare, a wall behind it); "screen" is a photograph of a screen or a frame of a video.`,
    `Cells only from: ${CELLS.join(' ')}.`,
  ].join('\n');
}
