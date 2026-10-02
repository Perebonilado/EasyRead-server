/**
 * How well a cleared picture serves (research §3.4's image scoring, the
 * house weights), and whether it can serve at all: a portrait shows its
 * person alone; a photo of a place or an event names it and was taken in
 * the research's years (an event that year or the next, an era within
 * five). Pure.
 *
 *   score = 0.25·res + 0.20·crop + 0.15·quality + 0.15·face + 0.10·era
 *           + 0.10·tier + 0.05·sourceRank   (+ 0.10 for a person's own
 *           Wikidata picture, house: the one their editors chose)
 */
import { nameWords, stems, textWords } from './match';
import type {
  PictureKind,
  PictureQuery,
  PictureUseOf,
  SourceFile,
} from './types';

/** What a picture is for: a person's portrait card, a full photo, a document's page. */
export type PictureUse = PictureUseOf;

export const useOf = (kind: PictureKind): PictureUse =>
  kind === 'person' ? 'portrait' : kind === 'document' ? 'document' : 'photo';

/** The pixels on the filling axis that score full marks (research: 1920 for full-bleed), and a portrait print's. */
const FULL_RES: Readonly<Record<PictureUse, number>> = {
  photo: 1920,
  portrait: 900,
  document: 1600,
};

/** The least a picture may have on its long side to be shown at all: a print never upscaled past 1.25× (research §3.4). */
export const LEAST_PX: Readonly<Record<PictureUse, number>> = {
  photo: 800,
  portrait: 420,
  document: 900,
};

/** The share of the picture's height a face must reach for full marks (research: 0.3). */
const FACE_FULL = 0.3;

/** Years either side an era's photo may be from (research §3.4: ±5), and an event's (the same year, or the next for one that ran over). */
export const ERA_YEARS = 5;
export const EVENT_YEARS = 1;

/** The weight of a person's own Wikidata picture (house). */
const CHOSEN = 0.1;

/** Whether a box (as shares of the picture) fits a crop of an aspect taken from the picture, slid to it. */
export function fitsCrop(
  focal: [number, number, number, number],
  picture: { width: number; height: number },
  aspect: number,
): boolean {
  const r = picture.width / Math.max(1, picture.height);
  const [w, h] = aspect < r ? [aspect / r, 1] : [1, r / aspect];
  return focal[2] <= w + 1e-6 && focal[3] <= h + 1e-6;
}

/** Commons' nominations, as the quality term reads them. */
export function qualityOf(
  categories: readonly string[],
): SourceFile['quality'] {
  if (categories.some((c) => /^featured pictures/iu.test(c))) return 'featured';
  if (categories.some((c) => /^quality images/iu.test(c))) return 'quality';
  if (categories.some((c) => /^valued images/iu.test(c))) return 'valued';
  return null;
}

const QUALITY: Readonly<
  Record<NonNullable<SourceFile['quality']> | 'none', number>
> = {
  featured: 1,
  quality: 0.8,
  valued: 0.6,
  none: 0.3,
};

/** How near a picture's year is to the research's: 1 the same year, 0 at five years off, half when nobody asked. */
export function eraOf(
  year: number | undefined,
  years: readonly number[] | undefined,
): number {
  if (!years?.length) return 0.5;
  if (year === undefined) return 0;
  const off = Math.min(...years.map((y) => Math.abs(y - year)));
  return Math.max(0, 1 - off / ERA_YEARS);
}

export interface ScoreInput {
  file: Pick<
    SourceFile,
    'width' | 'height' | 'categories' | 'institutional' | 'chosen' | 'quality'
  >;
  use: PictureUse;
  tier: 'A' | 'B';
  focal: { box: [number, number, number, number]; from: 'depicts' | 'centre' };
  year?: number;
  years?: readonly number[];
}

/** A cleared picture's score, with each term for the notes. */
export function scoreOf(input: ScoreInput): {
  score: number;
  terms: Record<string, number>;
} {
  const { file, use } = input;
  const filling =
    use === 'portrait' ? Math.max(file.width, file.height) : file.width;
  const res = Math.min(1, filling / FULL_RES[use]);
  const wide = fitsCrop(input.focal.box, file, 16 / 9);
  const tall = fitsCrop(input.focal.box, file, 9 / 16);
  const crop = wide && tall ? 1 : wide || tall ? 0.5 : 0;
  const quality = QUALITY[file.quality ?? qualityOf(file.categories) ?? 'none'];
  const face =
    use === 'portrait' && input.focal.from === 'depicts'
      ? Math.min(1, input.focal.box[3] / FACE_FULL)
      : 0;
  const era = eraOf(input.year, input.years);
  const tier = input.tier === 'A' ? 1 : 0.8;
  const sourceRank = file.institutional ? 1 : 0.6;
  // Their editors' choice: a person's own portrait, or a place's own
  // picture when any good photo of it will do (no years asked).
  const chosen =
    file.chosen && (use === 'portrait' || !input.years?.length) ? CHOSEN : 0;
  const score =
    0.25 * res +
    0.2 * crop +
    0.15 * quality +
    0.15 * face +
    0.1 * era +
    0.1 * tier +
    0.05 * sourceRank +
    chosen;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    score: round(score),
    terms: {
      res: round(res),
      crop,
      quality,
      face: round(face),
      era: round(era),
      tier,
      sourceRank,
      chosen,
    },
  };
}

// ── Whether it can serve ──────────────────────────────────────────────────

/** A title that names more than one subject. */
const GROUP_TITLE =
  /\b(?:and|with|meets?|meeting|greets?|greeting|together)\b|&/iu;

/** A description that places several people in the frame. */
const GROUP_WORDS =
  /\(?\bL\s*[-–—]\s*R\b\)?|left to right|far (?:left|right)|second (?:from|left|right)|\bfrom (?:left|right)\b|\bon (?:his|her) (?:left|right)\b|\bmeets?\b|\bgreets?\b|\bwith (?:president|prime minister|premier|the|his|her|members?|other|delegates)\b|delegat|\bgroup\b|\bcrowd\b|\bfamily\b|\bcouple\b|\bteam\b|\bcabinet\b|\bunidentified\b/iu;

/** Whether all of a name's words are in some words. */
const namesIt = (words: string, name: string) => {
  const said = ` ${textWords(words).join(' ')} `;
  const want = nameWords(name);
  return want.length > 0 && want.every((w) => said.includes(` ${w} `));
};

/** Things of a person's that are not them: where they lie, stand in bronze, lived, or are printed. */
const NOT_THEM =
  /\b(?:statue|bust|monument|memorial|grave|tomb|mausoleum|mural|plaque|sculpture|banknote|bank note|stamp|coin|museum|exhibit(?:ion)?|house|home|residence|birthplace|estate|street|road|avenue|university|school|college|hospital|airport|stadium|square|bridge|library|hall|signature|car|motorcade)\b/iu;

/** "Azikiwe's birthplace": a title about one of their things. */
const THEIRS = /['’]s\s+\p{L}/u;

/**
 * Whether a file can be a person's portrait: it is of them (their own
 * Wikidata picture, a file that says it depicts them, or one named for
 * them), of them alone (no "and", no "L–R", no one beside them), and of
 * them, not of a thing of theirs (a statue, a grave, a banknote, a house).
 * A photograph made after they died is of something else (a statue, a
 * grave, a picture of a picture on a museum wall), and one with no date
 * is taken only where their editors chose it or it says it depicts them.
 * Research §3.5: a wrong face is worse than none, so a group photograph is
 * never cut down to one of its faces.
 */
export function portraitOf(
  file: Pick<SourceFile, 'title' | 'description' | 'depicts' | 'chosen'>,
  person: { qid: string; name: string; died?: number },
  year?: number,
): { ok: true } | { ok: false; reason: string } {
  const depicts = file.depicts ?? [];
  const said = depicts.some((d) => d.qid === person.qid);
  const ofThem =
    file.chosen ||
    said ||
    namesIt(file.title, person.name) ||
    // A surname is enough in a title that names nobody else.
    (nameWords(person.name).length > 1 &&
      namesIt(file.title, nameWords(person.name).slice(-1)[0]));
  if (!ofThem) return { ok: false, reason: 'it does not say it is of them' };
  if (depicts.length > 1 && depicts.some((d) => d.qid !== person.qid))
    return { ok: false, reason: 'it depicts someone else too' };
  if (GROUP_TITLE.test(file.title) || GROUP_WORDS.test(file.description))
    return { ok: false, reason: 'others are in the picture with them' };
  if (
    NOT_THEM.test(file.title) ||
    THEIRS.test(file.title) ||
    NOT_THEM.test(file.description)
  )
    return { ok: false, reason: 'it is of a thing of theirs, not of them' };
  if (year !== undefined && person.died !== undefined && year > person.died + 1)
    return {
      ok: false,
      reason: `made in ${year}, after they died in ${person.died}`,
    };
  if (year === undefined && !file.chosen && !said)
    return {
      ok: false,
      reason: 'it has no date, and nobody chose it as theirs',
    };
  return { ok: true };
}

/**
 * Whether a file can be a photo of a place or an event: it names it (its
 * title, description or categories hold every word of the name, and the
 * place it is in when the research gives one), or says it depicts it; and
 * it was taken in the research's years (an event within a year, an era
 * within five). A photo with no year can show a place only when nobody
 * asked for years.
 */
export function photoOf(
  file: Pick<
    SourceFile,
    'title' | 'description' | 'categories' | 'depicts' | 'chosen'
  >,
  query: Pick<PictureQuery, 'name' | 'kind' | 'years' | 'place'>,
  qid: string | undefined,
  year: number | undefined,
): { ok: true } | { ok: false; reason: string } {
  const said = `${file.title} ${file.description} ${file.categories.join(' ')}`;
  const depicted = Boolean(qid && file.depicts?.some((d) => d.qid === qid));
  const named = depicted || Boolean(file.chosen) || namesIt(said, query.name);
  if (!named) return { ok: false, reason: `it does not name ${query.name}` };
  const within = [query.place ?? []]
    .flat()
    .filter(
      (p) => p && nameWords(p).join(' ') !== nameWords(query.name).join(' '),
    );
  if (
    !depicted &&
    !file.chosen &&
    within.length &&
    !within.some((p) => namesIt(said, p))
  )
    return {
      ok: false,
      reason: `it does not place ${query.name} in ${within.join(' or ')}`,
    };
  const years = query.years ?? [];
  if (years.length) {
    if (year === undefined)
      return {
        ok: false,
        reason: 'it has no date to match the research’s years',
      };
    const off = Math.min(...years.map((y) => Math.abs(y - year)));
    const most = query.kind === 'event' ? EVENT_YEARS : ERA_YEARS;
    if (off > most)
      return {
        ok: false,
        reason: `taken in ${year}, ${off} years from the research’s`,
      };
  }
  return { ok: true };
}

// ── More photos of a person, and photos of events and things ─────────────

/** Likenesses of a person that are not them as they were: in bronze, in paint on a wall, on a note or a stamp. */
const LIKENESS =
  /\b(?:statue|bust|monument|memorial|grave|tomb|mausoleum|mural|plaque|sculpture|banknote|bank note|stamp|coin|waxwork|effigy|signature)\b/iu;

/** "Azikiwe's house": a title about a thing of theirs. */
const THEIR_THING =
  /['’]s\s+(?:house|home|residence|birthplace|estate|grave|tomb|car|office|desk|library|statue|bust|signature)\b/iu;

/** What is named after a person rather than of them: "Ahmadu Bello University", "Ahmadu Bello Way". */
const NAMED_FOR =
  'university|stadium|way|road|street|avenue|airport|square|bridge|hall|college|school|hospital|library|mosque|house|museum|park|estate|crescent|close|drive|lane|centre|center|foundation|award|prize';

/**
 * Whether a file can be one more photo of a person (Richard, 2026-10-02:
 * the board comes back to a person without repeating one image): of them
 * (their own Wikidata picture, a file that says it depicts them, one that
 * names them in full, or one of their own category naming them by their
 * surname), never a likeness of them in bronze or on a note, nor a thing
 * named after them, nor made after they died, and dated unless it says it
 * depicts them. Others may stand with them, as they do in a delegation, a
 * ceremony or a meeting: a photo, unlike a portrait, may be of a group.
 */
export function personPhotoOf(
  file: Pick<
    SourceFile,
    'title' | 'description' | 'categories' | 'depicts' | 'chosen'
  >,
  person: { qid: string; name: string; died?: number; category?: string },
  year?: number,
): { ok: true } | { ok: false; reason: string } {
  const said = Boolean(file.depicts?.some((d) => d.qid === person.qid));
  const words = nameWords(person.name);
  const surname = words.length > 1 ? words[words.length - 1] : '';
  const category = person.category?.trim().toLowerCase();
  const filed = Boolean(
    category &&
    file.categories.some((c) => c.trim().toLowerCase() === category),
  );
  const ofThem =
    file.chosen ||
    said ||
    namesIt(file.title, person.name) ||
    namesIt(file.description, person.name) ||
    (filed && surname.length >= 4 && namesIt(file.title, surname));
  if (!ofThem) return { ok: false, reason: 'it does not say it is of them' };
  if (
    LIKENESS.test(file.title) ||
    LIKENESS.test(file.description) ||
    THEIR_THING.test(file.title)
  )
    return {
      ok: false,
      reason: 'it is a likeness or a thing of theirs, not them',
    };
  if (
    surname &&
    new RegExp(`\\b${surname}\\s+(?:${NAMED_FOR})\\b`, 'iu').test(
      textWords(file.title).join(' '),
    )
  )
    return { ok: false, reason: 'it is of something named after them' };
  if (year !== undefined && person.died !== undefined && year > person.died + 1)
    return {
      ok: false,
      reason: `made in ${year}, after they died in ${person.died}`,
    };
  if (year === undefined && !file.chosen && !said)
    return {
      ok: false,
      reason: 'it has no date, and nobody says it depicts them',
    };
  return { ok: true };
}

/** A commemoration of an event (a plaque, a memorial) is no photo of the event itself. */
const COMMEMORATION =
  /\b(?:plaque|memorial|monument|commemorat\w*|statue|museum|exhibit(?:ion)?|replica|anniversary|re-?enactment|stamp|banknote|coin|postage)\b/iu;

/** A thing's name as whole words, a plural allowed ("cathode-ray tube" in "Cathode ray tubes"). */
function namesThing(said: string, name: string): boolean {
  const text = ` ${textWords(said).join(' ')} `;
  const words = textWords(name);
  if (!words.length) return false;
  const pattern = words
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .map((w, i) => (i === words.length - 1 ? `${w}(?:s|es)?` : w))
    .join(' ');
  return new RegExp(` ${pattern} `, 'u').test(text);
}

/**
 * Whether a file can be a photo of an event (the truth rule: a picture
 * of an event is of that event): taken in its year, or the next for one
 * that ran over; carrying its key words, the research's own, in its
 * title, description or categories (two of them, or one with the place it
 * happened); and no commemoration of it (a blue plaque photographed last
 * year says "1926" in its title too). The desk's look must then agree.
 */
export function eventPhotoOf(
  file: Pick<SourceFile, 'title' | 'description' | 'categories'>,
  query: Pick<PictureQuery, 'name' | 'years' | 'place' | 'words'>,
  year: number | undefined,
): { ok: true } | { ok: false; reason: string } {
  const years = query.years ?? [];
  if (!years.length)
    return { ok: false, reason: 'the research gives the event no year' };
  if (year === undefined)
    return { ok: false, reason: 'it has no date to match the event’s year' };
  const off = Math.min(...years.map((y) => Math.abs(y - year)));
  if (off > EVENT_YEARS)
    return { ok: false, reason: `taken in ${year}, not in the event’s year` };
  const said = `${file.title} ${file.description} ${file.categories.join(' ')}`;
  if (COMMEMORATION.test(`${file.title} ${file.description}`))
    return { ok: false, reason: 'it commemorates the event; it is not of it' };
  const seen = stems(said);
  const placed = [...stems([query.place ?? []].flat().join(' '))];
  const keys = [...stems((query.words ?? [query.name]).join(' '))].filter(
    (k) => !placed.includes(k),
  );
  const hits = keys.filter((k) => seen.has(k)).length;
  const there = placed.some((p) => seen.has(p));
  const enough =
    keys.length >= 2 ? hits >= 2 || (hits >= 1 && there) : hits >= 1;
  if (!enough)
    return {
      ok: false,
      reason: `it does not carry the event’s words (${keys.slice(0, 4).join(', ')})`,
    };
  return { ok: true };
}

/**
 * Whether a file can be a photo of a thing a line names (a televisor, an
 * iconoscope): it names the thing in whole words, or says it depicts it.
 * A thing is shown as it is; its year is on the chip, and the research's
 * years only rank it.
 */
export function thingPhotoOf(
  file: Pick<
    SourceFile,
    'title' | 'description' | 'categories' | 'depicts' | 'chosen'
  >,
  query: Pick<PictureQuery, 'name' | 'words'>,
  qid: string | undefined,
): { ok: true } | { ok: false; reason: string } {
  const said = `${file.title} ${file.description} ${file.categories.join(' ')}`;
  const depicted = Boolean(qid && file.depicts?.some((d) => d.qid === qid));
  const names = query.words?.length ? query.words : [query.name];
  if (!depicted && !names.some((n) => namesThing(said, n)))
    return { ok: false, reason: `it does not name ${query.name}` };
  return { ok: true };
}
