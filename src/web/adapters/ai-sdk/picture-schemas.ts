/**
 * The picture desk's look at a picture (picture_focus; WP11): cells of a
 * six-by-six grid for the people's faces and for what the picture is of,
 * how many people show, and what kind of picture it is. Flat and lenient,
 * as the Studio's answers are: a value a little wrong is caught as
 * nothing. pictures/focus.ts reads the cells from the closed list and
 * makes the box; a model never writes a coordinate.
 */
import { z } from 'zod';
import {
  CELLS,
  PICTURE_KINDS,
  SHOWS,
} from '../../../business/domain/pictures/focus';

const cells = () => z.array(z.string().catch('')).max(36).catch([]);

export const pictureFocusSchema = z.object({
  faces: cells(),
  subject: cells(),
  people: z.number().int().min(0).max(30).catch(0),
  kind: z
    .enum(PICTURE_KINDS as unknown as [string, ...string[]])
    .catch('other'),
  shows: z.enum(SHOWS as unknown as [string, ...string[]]).catch('unsure'),
});

/** What the desk asks of a picture, every answer named from a list. */
export function pictureFocusPrompt(): string {
  return [
    'You look at an archive picture for a documentary film, to crop it to its subject. You never say who anyone is.',
    'A grid is drawn over the picture: six columns, A to F from left to right, and six rows, 1 to 6 from top to bottom, each cell named in its top-left corner (A1 top-left, F6 bottom-right). Read the names on the picture; name a cell only if the thing is inside it.',
    'Answer:',
    '- faces: every cell holding part of a clearly visible human face (none for none);',
    '- subject: the cells holding what the picture is of: the people, the building, the scene that matters;',
    '- people: how many people are clearly visible;',
    `- kind: what the picture is, one of ${PICTURE_KINDS.join(', ')}. "photograph-of-a-print" is a photograph of another photograph or a framed print (its edges, glare, a wall behind it); "screen" is a photograph of a screen or a frame of a video.`,
    `- shows: when you are asked whether it shows something (a place, an event, a thing), ${SHOWS.join(', ')}. Judge only by what you can see, never by the archive's words. Yes only when the picture itself shows that very kind of scene or thing: for a place, the place itself (its streets, buildings, skyline or landscape); for an event, people taking part in that kind of event with what it was about (a ceremony, a conference table, the apparatus being demonstrated); for a thing, the object itself. No when it shows something else: a plaque, a memorial or a museum of it; the place as it is now, in colour, for an event long ago; a landmark of another city than the one asked; a map, a document or a poster; a close portrait of one person; a sky, a field or a crowd that could be anywhere. Unsure when you cannot tell. When nothing is asked, unsure.`,
    `Cells only from: ${CELLS.join(' ')}.`,
  ].join('\n');
}
