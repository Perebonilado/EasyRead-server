/**
 * Where an archive picture's subject is (WP11): a model that sees names
 * cells of a grid (six columns, A to F; six rows, 1 to 6) for the people's
 * faces and for what the picture is of, how many people show, and what
 * kind of picture it is; code makes the box. A model never writes a
 * coordinate (the build's rule): its cells are read from a closed list
 * and anything else is dropped.
 *
 * What it says also screens a portrait: one that shows several people, or
 * that is a photograph of a print, a screen or a statue, is no portrait of
 * them (research §3.5: a wrong face is worse than none). Asked what a
 * picture of an event or a thing should show, it says whether it does
 * (yes, no or unsure): a picture of an event is taken only when it agrees.
 */

/** The grid the model names cells of. */
export const GRID = 6;
const COLUMNS = 'ABCDEF';

/** What a picture can be, as the model says. */
export const PICTURE_KINDS = [
  'photograph',
  'photograph-of-a-print',
  'screen',
  'statue',
  'painting',
  'drawing',
  'document',
  'other',
] as const;
export type PictureKindSeen = (typeof PICTURE_KINDS)[number];

/** Whether a picture shows what it was asked to. */
export const SHOWS = ['yes', 'no', 'unsure'] as const;
export type Shows = (typeof SHOWS)[number];

/** Every cell's name, "A1" to "F6". */
export const CELLS: readonly string[] = Array.from(
  { length: GRID * GRID },
  (_, i) => `${COLUMNS[i % GRID]}${Math.floor(i / GRID) + 1}`,
);

/** The model's answer made sound. */
export interface Focus {
  /** The faces' box, as shares of the picture; null when no face shows. */
  faces: [number, number, number, number] | null;
  /** What it is of, as shares; null when it named nothing. */
  subject: [number, number, number, number] | null;
  people: number;
  kind: PictureKindSeen;
  /** Whether it shows what it was asked to (an event, a thing); unsure when nothing was asked. */
  shows: Shows;
}

/** Cells named, read from the closed list ("b2", " C 3" are B2 and C3). */
function cellsOf(said: unknown): string[] {
  const list = Array.isArray(said)
    ? said
    : typeof said === 'string'
      ? said.split(/[\s,;]+/u)
      : [];
  return [
    ...new Set(
      list
        .map((c) =>
          typeof c === 'string' ? c.replace(/\s+/gu, '').toUpperCase() : '',
        )
        .filter((c) => CELLS.includes(c)),
    ),
  ];
}

/** The box round some cells, as shares of the picture. */
export function boxOfCells(
  cells: readonly string[],
): [number, number, number, number] | null {
  if (!cells.length) return null;
  const xs = cells.map((c) => COLUMNS.indexOf(c[0]));
  const ys = cells.map((c) => Number(c.slice(1)) - 1);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const x1 = Math.max(...xs) + 1;
  const y1 = Math.max(...ys) + 1;
  return [x0 / GRID, y0 / GRID, (x1 - x0) / GRID, (y1 - y0) / GRID];
}

/** The model's answer, made sound: unknown cells dropped, the count held to 0–30, the kind from its list. */
export function focusOf(raw: unknown): Focus {
  const said = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const people = Math.round(Number(said.people));
  const kind = PICTURE_KINDS.includes(said.kind as PictureKindSeen)
    ? (said.kind as PictureKindSeen)
    : 'other';
  const shows = SHOWS.includes(said.shows as Shows)
    ? (said.shows as Shows)
    : 'unsure';
  return {
    faces: boxOfCells(cellsOf(said.faces)),
    subject: boxOfCells(cellsOf(said.subject)),
    people: Number.isFinite(people) ? Math.min(30, Math.max(0, people)) : 0,
    kind,
    shows,
  };
}

/**
 * Where the camera's subject is: the faces with room round them (heads
 * and shoulders: a face's cell grown a cell each way, clipped to the
 * picture), else what it is of. Null when the model saw nothing to say.
 */
export function focalFromFocus(
  focus: Focus,
): [number, number, number, number] | null {
  const grow = 1 / GRID;
  if (focus.faces) {
    const [x, y, w, h] = focus.faces;
    const x0 = Math.max(0, x - grow * 0.5);
    const y0 = Math.max(0, y - grow * 0.5);
    const x1 = Math.min(1, x + w + grow * 0.5);
    const y1 = Math.min(1, y + h + grow);
    return [x0, y0, x1 - x0, y1 - y0];
  }
  return focus.subject;
}

/** Why a picture is no portrait of one person, by what the model saw; null when it can be. */
export function portraitDoubt(focus: Focus): string | null {
  if (focus.kind === 'photograph-of-a-print')
    return 'it is a photograph of a print, not the print';
  if (focus.kind === 'screen') return 'it is a picture of a screen';
  if (focus.kind === 'statue') return 'it is a statue of them';
  if (focus.kind === 'document' || focus.kind === 'other')
    return `it is not a portrait (${focus.kind})`;
  if (focus.people > 1) return `${focus.people} people show in it`;
  return null;
}

/** Why a picture is no evidence of a place or an event, by what the model saw; null when it can be. */
export function photoDoubt(focus: Focus): string | null {
  if (focus.kind === 'photograph-of-a-print')
    return 'it is a photograph of a print, not the print';
  if (focus.kind === 'screen') return 'it is a picture of a screen';
  return null;
}

/** Why a photo of a person among others will not do, by what the model saw; null when it can. */
export function personPhotoDoubt(focus: Focus): string | null {
  const doubt = photoDoubt(focus);
  if (doubt) return doubt;
  if (focus.kind === 'statue') return 'it is a statue of them';
  if (focus.people < 1) return 'no one shows in it';
  return null;
}

/** Why a photo of an event or a thing will not do: the model does not see in it what was asked. */
export function agreeDoubt(focus: Focus, asked: string): string | null {
  const doubt = photoDoubt(focus);
  if (doubt) return doubt;
  return focus.shows === 'yes'
    ? null
    : `the look does not see ${asked} in it (${focus.shows})`;
}
