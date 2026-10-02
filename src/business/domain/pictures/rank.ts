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
import { nameWords, textWords } from './match';
import type { PictureKind, PictureQuery, SourceFile } from './types';

/** What a picture is for: a person's portrait card, a full photo, a document's page. */
export type PictureUse = 'portrait' | 'photo' | 'document';

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
  const chosen = use === 'portrait' && file.chosen ? CHOSEN : 0;
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

/**
 * Whether a file can be a person's portrait: it is of them (their own
 * Wikidata picture, a file that says it depicts them, or one named for
 * them), and of them alone (no "and", no "L–R", no one beside them).
 * Research §3.5: a wrong face is worse than none, so a group photograph is
 * never cut down to one of its faces.
 */
export function portraitOf(
  file: Pick<SourceFile, 'title' | 'description' | 'depicts' | 'chosen'>,
  person: { qid: string; name: string },
): { ok: true } | { ok: false; reason: string } {
  const depicts = file.depicts ?? [];
  const ofThem =
    file.chosen ||
    depicts.some((d) => d.qid === person.qid) ||
    namesIt(file.title, person.name) ||
    // A surname is enough in a title that names nobody else.
    (nameWords(person.name).length > 1 &&
      namesIt(file.title, nameWords(person.name).slice(-1)[0]));
  if (!ofThem) return { ok: false, reason: 'it does not say it is of them' };
  if (depicts.length > 1 && depicts.some((d) => d.qid !== person.qid))
    return { ok: false, reason: 'it depicts someone else too' };
  if (GROUP_TITLE.test(file.title) || GROUP_WORDS.test(file.description))
    return { ok: false, reason: 'others are in the picture with them' };
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
