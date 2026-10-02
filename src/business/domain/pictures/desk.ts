/**
 * The picture desk (explainer-animation-plan §6.3; research §3.4–3.5): it
 * finds a real picture of what a line names, clears its licence and its
 * provenance (when the licence switch is on; off, any file its sources
 * hold, under the licence they name), makes sure it is of the right
 * person or place, and keeps a copy in our storage with its credit, its
 * chip and where its subject is. Identity is never switched off: a
 * picture is of the right person, place, thing or event, or it is none.
 *
 *   find(query)   ranked candidates, every one cleared: for a person, only
 *                 once Wikidata's person is surely the research's (match.ts)
 *                 and only pictures of them alone; for a place or an event,
 *                 only pictures that name it, taken in the research's years
 *   pick(found)   the one to use, or none
 *   take(one)     our copy (by sha1, so stored once), its size, its focal
 *                 box in pixels, whether it has colour, and its depth map
 *   lookup(query) all three, the answer kept (a 'lookup' row) so the same
 *                 question is answered from the cache for 30 days
 *
 * Every file it refuses is kept with why, so it is never judged again in
 * vain. It never throws on a source's failure: a picture that cannot be
 * had is no picture, and the board shows the person's trace or the map.
 * I/O goes through ports (sources, cache, storage, pixels, depth), so the
 * specs run it on fakes.
 */
import { createHash } from 'node:crypto';
import type {
  DepthPort,
  PicturePixelsPort,
  PictureSourcesPort,
} from '../../ports/pictures.port';
import type { LlmUsage } from '../../ports/llm.port';
import type { StoragePort } from '../../ports/storage.port';
import type {
  PictureCacheRepository,
  PictureCacheRow,
} from '../../repositories/picture-cache.repository';
import {
  chipOf,
  creditOf,
  institutionOf,
  lifeOf,
  roleWords,
  sourceOf,
  yearOf,
} from './credit';
import {
  contentBox,
  isMono,
  isMonochrome,
  printOf,
  printsAlike,
} from './depth';
import {
  agreeDoubt,
  focalFromFocus,
  focusOf,
  GRID,
  personPhotoDoubt,
  photoDoubt,
  portraitDoubt,
  type Focus,
  type Shows,
} from './focus';
import { licenceUnder, type LicenceMode } from './licence';
import { matchPerson, matchPlace, nameWords, textWords } from './match';
import {
  EVENT_VERBS,
  eventPhotoOf,
  LEAST_PX,
  personPhotoOf,
  photoOf,
  portraitOf,
  qualityOf,
  scoreOf,
  thingPhotoOf,
  useOf,
  type PictureUse,
} from './rank';
import type {
  PictureCandidate,
  PictureKind,
  PictureQuery,
  PictureRecord,
  PixelBox,
  SourceFile,
  WikiPerson,
} from './types';

export interface DeskDeps {
  sources: PictureSourcesPort;
  cache: PictureCacheRepository;
  storage: Pick<StoragePort, 'put' | 'size'> &
    Partial<Pick<StoragePort, 'get'>>;
  pixels: PicturePixelsPort;
  /** Depth Anything V2 Small; absent or null, a picture is one plane. */
  depth?: DepthPort | null;
  /**
   * A model that sees (picture_focus): where a picture's faces and subject
   * are, how many people show, and what the picture is. Absent or null,
   * a subject is the middle third a little high, and no picture is doubted.
   */
  focus?:
    | ((input: {
        png: Buffer;
        about: string;
        /** What a picture of an event or a thing should show, for the look to agree it does. */
        asked?: string;
      }) => Promise<{ value: Record<string, unknown>; usage: LlmUsage }>)
    | null;
  /**
   * Whether the licence and provenance screen runs (PICTURE_LICENCE):
   * 'off', the default, takes any file its sources hold under the licence
   * they name; 'on', the screen's rules. An answer given under the other
   * is asked again, so a refusal kept while it was on never blocks a file
   * while it is off.
   */
  licence?: LicenceMode;
  now?: () => Date;
  log?: (message: string) => void;
}

/** How long the desk trusts its answer to a question before asking again. */
const LOOKUP_DAYS = 30;

/**
 * The desk's rules, by number: an answer given under older rules is asked
 * again (a portrait that is a statue's photograph, once let through, is
 * not handed out for a month after the rule against it).
 */
export const DESK_RULES = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The width the desk asks a source for: a full frame's with room for a 12% push; a portrait's print; a page. */
const FETCH_WIDTH: Readonly<Record<PictureUse, number>> = {
  photo: 2560,
  portrait: 1280,
  document: 2048,
};

/** How many files each way of looking may bring (the sources are asked politely, so few). */
const FROM_DEPICTS = 12;
const FROM_CATEGORY = 30;
const FROM_SEARCH = 15;

/** How many of a question's best pictures are tried before none is taken. */
const TRIES = 3;

/**
 * How many distinct pictures one question may bring (Richard, 2026-10-02:
 * "scenes that change often to relatable things"): a person's portrait and
 * two more photos of them, two of a place or an event, one of a thing.
 */
export const MOST: Readonly<Record<PictureKind, number>> = {
  person: 3,
  place: 2,
  event: 2,
  object: 1,
  document: 1,
};

/** What the desk finds for a question. */
export interface Found {
  /** A person's portraits; else photos of the place, the event, the thing. Each cleared, the best first. */
  found: PictureCandidate[];
  /** A person's photos among others, the best first. */
  photos?: PictureCandidate[];
  reason?: string;
  qid?: string;
  person?: WikiPerson;
}

/** Small words an event's search leaves out. */
const SEARCH_STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'into',
  'its',
  'their',
  'his',
  'her',
  'as',
  'is',
  'are',
  'was',
  'were',
  'all',
  'first',
  'after',
  'before',
  'over',
  'out',
  'path',
  'who',
  'which',
  'that',
  'this',
]);

/**
 * The words to search an event by, from the research's own words for it:
 * its names whole ("Royal Institution", "New York World's Fair", "BBC
 * Television Service"; a sentence's small first word left out), and its
 * other words but the verbs that tell it, in the research's order.
 */
export function searchWordsOf(text: string): {
  names: string[];
  plain: string[];
} {
  const words = text
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu, ''))
    .filter(Boolean);
  const names: string[] = [];
  const plain: string[] = [];
  let run: string[] = [];
  const close = () => {
    if (run.length) names.push(run.join(' '));
    run = [];
  };
  for (const word of words) {
    const lower = word.toLowerCase();
    if (/^\p{Lu}/u.test(word) && !(SEARCH_STOP.has(lower) && !run.length)) {
      run.push(word);
      continue;
    }
    close();
    if (
      word.length >= 3 &&
      !SEARCH_STOP.has(lower) &&
      !EVENT_VERBS.has(lower) &&
      !/^\d+$/u.test(word)
    )
      plain.push(word.replace(/['’]s$/u, ''));
  }
  close();
  return {
    names: [...new Set(names.map((n) => n.replace(/['’]s$/u, '')))].slice(0, 3),
    plain: [...new Set(plain)].slice(0, 3),
  };
}

/** A name's plain words, as one string. */
const textWordsOf = (text: string) => textWords(text).join(' ');

/**
 * A file's title as one picture is known by: its crop, its retouched or
 * coloured copy and its numbered twin ("Philo T Farnsworth (cropped)",
 * "… (2)") are the same picture, never two photos of a person.
 */
export function titleKey(title: string): string {
  return textWords(
    title
      .replace(/^File:/u, '')
      .replace(/\.[A-Za-z0-9]{2,5}$/u, '')
      .replace(
        /\((?:\d+|cropped|crop|edit(?:ed)?|retouched|restored|colou?ri[sz]ed|detail|version \d+)\)/giu,
        ' ',
      )
      .replace(
        /\b(?:cropped|crop|edit(?:ed)?|retouched|restored|colou?ri[sz]ed)\b/giu,
        ' ',
      ),
  ).join(' ');
}

/** A country as Commons' year categories name it: "1926 in the United Kingdom". */
export function inCountry(country: string): string {
  return /^(?:united\b|netherlands|philippines|bahamas|gambia|czech republic|democratic republic|dominican republic|central african republic|maldives|comoros|solomon islands|marshall islands|united arab emirates)/iu.test(
    country.trim(),
  )
    ? `the ${country.trim()}`
    : country.trim();
}

/** What the look said a kept copy shows when asked this; undefined when it was never asked. */
function agreedOf(
  meta: Record<string, unknown> | null | undefined,
  asked: string,
): Shows | undefined {
  const agrees = meta?.agrees;
  return agrees && typeof agrees === 'object'
    ? (agrees as Record<string, Shows>)[asked]
    : undefined;
}

/** How many questions' answers a copy keeps. */
const AGREES_KEPT = 12;

/** The year from which a black-and-white print's date may be its scan's, not its own. */
const SCANNED_FROM = 2004;

/**
 * A picture without the year its date gave, when that is only when it was
 * scanned: a black-and-white or toned print dated 2004 or later whose
 * title does not say the year (a Navy photograph of a picture tube, put on
 * Flickr in 2015). Its chip is made again without it.
 */
export function undatedScan(
  candidate: PictureCandidate,
  meta: Record<string, unknown> | null | undefined,
): PictureCandidate {
  const year = candidate.year;
  if (
    year === undefined ||
    year < SCANNED_FROM ||
    meta?.monochrome !== true ||
    textWords(candidate.file.title).includes(String(year))
  )
    return candidate;
  const { year: _year, ...rest } = candidate;
  void _year;
  return {
    ...rest,
    chip: chipOf({
      subject: candidate.subject,
      source: candidate.source,
      licence: candidate.licence,
    }),
    notes: [...candidate.notes, `${year} is its scan's year, not its own`],
  };
}

/** A copy's record with the year its picture is of, or none. */
function yearKept(
  meta: Record<string, unknown> | null,
  year: number | undefined,
): Record<string, unknown> {
  const { year: _had, ...rest } = meta ?? {};
  void _had;
  return year !== undefined ? { ...rest, year } : rest;
}

/** How alike two prints must be to be one photograph under two names (two files of one scored 0.99; two photographs, under 0.72). */
export const SAME_PICTURE = 0.9;

/** Whether two pictures are one photograph, by their prints. */
export const samePicture = (a?: string, b?: string): boolean =>
  Boolean(a && b && printsAlike(a, b) >= SAME_PICTURE);

/**
 * The year before which a photograph of a place or an event is a print in
 * grey or one tone: colour film was rare until then, so a colour picture
 * "of 1936" is the place photographed since, its title naming the year.
 */
export const COLOUR_FROM = 1940;

/** A copy's record with what was seen of it now, its answers to earlier questions kept (the newest last). */
function withSeen(
  had: Record<string, unknown> | null,
  seen: Record<string, unknown>,
): Record<string, unknown> {
  const agrees = Object.entries({
    ...((had?.agrees as Record<string, Shows> | undefined) ?? {}),
    ...((seen.agrees as Record<string, Shows> | undefined) ?? {}),
  }).slice(-AGREES_KEPT);
  return {
    ...(had ?? {}),
    ...seen,
    ...(agrees.length ? { agrees: Object.fromEntries(agrees) } : {}),
  };
}

/** The least score a picture is used at (house): under it, no picture is better. */
export const PICK_LEAST = 0.4;

/**
 * A file's subject as shares of it: where its structured data says the
 * person is; else its middle third, a little above the middle (people
 * stand with their heads in a picture's upper half, so a wide crop of a
 * tall photograph keeps their heads).
 */
function focalOf(
  file: SourceFile,
  qid: string | undefined,
): PictureCandidate['focal'] {
  const said = qid
    ? file.depicts?.find((d) => d.qid === qid && d.box)
    : undefined;
  if (said?.box) return { box: said.box, from: 'depicts' };
  const third = 1 / 3;
  return { box: [third, 0.42 - third / 2, third, third], from: 'centre' };
}

/** What a question is kept under: its kind, its name's words, its id, its years and places. */
export function lookupKey(query: PictureQuery): string {
  const years = [...new Set(query.years ?? [])].sort((a, b) => a - b).join(',');
  const places = [query.place ?? []]
    .flat()
    .map((p) => nameWords(p).join(' '))
    .sort()
    .join(',');
  return [
    query.kind,
    nameWords(query.name).join(' '),
    query.qid ?? '',
    years,
    places,
    query.geo ? `${query.geo.lng.toFixed(2)},${query.geo.lat.toFixed(2)}` : '',
  ]
    .join('|')
    .slice(0, 500);
}

const extOf = (mime: string) => (mime === 'image/png' ? 'png' : 'jpg');

/** A content box (as shares) in a copy's pixels; none when it is the whole picture. */
function cropOf(
  share: [number, number, number, number],
  size: { width: number; height: number },
): PixelBox | undefined {
  const box: PixelBox = [
    Math.round(share[0] * size.width),
    Math.round(share[1] * size.height),
    Math.round(share[2] * size.width),
    Math.round(share[3] * size.height),
  ];
  return box[0] || box[1] || box[2] < size.width || box[3] < size.height
    ? box
    : undefined;
}

/** How many of a question's years the desk looks through, a request or two each. */
const YEARS_LOOKED = 6;

/** The years to look through: all of them when few, else spread from first to last. */
export function yearsToLook(years: readonly number[]): number[] {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  if (sorted.length <= YEARS_LOOKED) return sorted;
  return Array.from(
    { length: YEARS_LOOKED },
    (_, i) =>
      sorted[Math.round((i * (sorted.length - 1)) / (YEARS_LOOKED - 1))],
  );
}

export class PictureDesk {
  private readonly now: () => Date;
  private readonly log: (message: string) => void;
  /** The licence switch this desk runs under. */
  readonly licence: LicenceMode;

  constructor(private readonly deps: DeskDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? (() => undefined);
    this.licence = deps.licence ?? 'off';
  }

  // ── Finding ──────────────────────────────────────────────────────────────

  /**
   * Every cleared picture of what is asked, the best first; none when
   * nothing is surely of it. For a person, their portraits (`found`) and
   * the photos of them among others (`photos`); for a place, its photos
   * from the research's years, else any good photo of it; for an event,
   * photos taken that year that carry its words; for a thing, photos that
   * name it.
   */
  async find(query: PictureQuery): Promise<Found> {
    if (query.kind === 'person') return this.findPerson(query);
    if (query.kind === 'event') return this.findEvent(query);
    if (query.kind === 'object') return this.findThing(query);
    const found = await this.findPlace(query);
    // A place in the research's years first; else any good photo of it,
    // its year on its chip (Richard, 2026-10-02: places shown by pictures,
    // not only the map).
    if (found.found.length || !query.years?.length || query.kind !== 'place')
      return found;
    const { years: _years, ...anyYear } = query;
    void _years;
    const any = await this.findPlace(anyYear);
    return any.found.length
      ? {
          ...any,
          found: any.found.map((c) => ({
            ...c,
            notes: [...c.notes, 'none from the research’s years: any year'],
          })),
        }
      : found;
  }

  private async findPerson(query: PictureQuery): Promise<Found> {
    const ids = await this.ids(query);
    let people = ids.length ? await this.deps.sources.people(ids) : [];
    let match = matchPerson(query, people);
    // Wikidata's name search gives a name's best-known holders first;
    // the one the research means may not be among them (seven James
    // Robertsons before Nigeria's last governor-general). When the name
    // alone found no one surely theirs, it is asked again with a word of
    // the research's for them: their place, their post.
    if (match.qid === null || match.facts.length < 2) {
      const more = await this.textIds(query, new Set(ids));
      if (more.length) {
        people = [
          ...people,
          ...(await this.safely(() => this.deps.sources.people(more), [])),
        ];
        match = matchPerson(query, people);
      }
    }
    if (match.qid === null) return { found: [], reason: match.reason };
    const person = match.person;
    const files = await this.filesOf(
      person.images,
      match.qid,
      person.category,
      FETCH_WIDTH.portrait,
    );
    const found = await this.judge(files, query, 'portrait', match.qid, person);
    // More photos of them (Richard, 2026-10-02: "real people first", and
    // the board comes back to them without one image again): the same
    // files as photos, others may stand with them, and the files that
    // name them with their place.
    const place = [query.place ?? []].flat().find(Boolean);
    const named = await this.safely(
      () =>
        this.deps.sources.commonsSearch(
          `${nameWords(person.label).join(' ') || nameWords(query.name).join(' ')}${place ? ` ${place}` : ''}`,
          FROM_SEARCH,
          FETCH_WIDTH.photo,
        ),
      [],
    );
    const photos = await this.widen(
      await this.judge(
        this.unique([...files, ...named]),
        query,
        'photo',
        match.qid,
        person,
      ),
    );
    return {
      found,
      photos,
      qid: match.qid,
      person,
      ...(found.length || photos.length
        ? {}
        : { reason: `no picture of ${person.label} clears` }),
    };
  }

  /** A place's (or a document's) photos, as the desk has always looked for them. */
  private async findPlace(query: PictureQuery): Promise<Found> {
    const use = useOf(query.kind);
    const width = FETCH_WIDTH[use];
    let qid: string | undefined;
    let images: readonly string[] = [];
    let category: string | undefined;
    if (query.kind === 'place' || query.qid) {
      const ids = await this.ids(query);
      const items = ids.length ? await this.deps.sources.items(ids) : [];
      const match = matchPlace(query, items);
      if (match.qid) {
        qid = match.qid;
        // A place's own picture is today's: only for a question with no years.
        images = query.years?.length ? [] : match.item.images;
        category = match.item.category;
      }
    }
    const files: SourceFile[] = qid
      ? await this.filesOf(
          images,
          qid,
          query.years?.length ? undefined : category,
          width,
        )
      : [];
    // A place in its years: Commons files each year's pictures of a city
    // under "<year> in <city>" ("1926 in London"), and of a country under
    // "<year> in <country>"; those that name the place are of it, then.
    // Then a search by its words, its country with it.
    const country = [query.place ?? []].flat()[0];
    if (query.years?.length && query.kind === 'place') {
      const before = files.length;
      for (const year of yearsToLook(query.years))
        files.push(
          ...(await this.safely(
            () =>
              this.deps.sources.commonsCategory(
                `${year} in ${category ?? query.name}`,
                FROM_CATEGORY,
                width,
              ),
            [],
          )),
        );
      // The country's years only when the city has none of its own.
      if (country && files.length === before)
        for (const year of yearsToLook(query.years))
          files.push(
            ...(await this.safely(
              () =>
                this.deps.sources.commonsCategory(
                  `${year} in ${inCountry(country)}`,
                  FROM_CATEGORY,
                  width,
                ),
              [],
            )),
          );
    }
    const words = [query.name, ...(country ? [country] : [])].join(' ');
    files.push(
      ...(await this.safely(
        () => this.deps.sources.commonsSearch(words, FROM_SEARCH, width),
        [],
      )),
    );
    if (query.kind === 'document') files.push(...(await this.museums(query)));
    const found = await this.judge(this.unique(files), query, use, qid);
    return {
      found,
      ...(qid ? { qid } : {}),
      ...(found.length ? {} : { reason: `no picture of ${query.name} clears` }),
    };
  }

  /**
   * An event's photos: Commons searched by its own words (the names in
   * them first) with its year, and with its place; and the year's photos
   * of its country. Only a photo of that year carrying its words clears
   * (eventPhotoOf), and only one the look agrees shows it is taken.
   */
  private async findEvent(query: PictureQuery): Promise<Found> {
    const width = FETCH_WIDTH.photo;
    const year = [...(query.years ?? [])].sort((a, b) => a - b)[0];
    if (year === undefined)
      return { found: [], reason: `the research gives ${query.name} no year` };
    // What to search by: the event's own words (its first is the
    // research's text for it), never its place's, which come apart.
    const { names, plain } = searchWordsOf(query.words?.[0] ?? query.name);
    // Where it happened, as its first words ("Alexandra Palace" of
    // "Alexandra Palace, London"): the place a photo of it names.
    const place = [query.place ?? []]
      .flat()
      .find(Boolean)
      ?.split(',')[0]
      ?.trim();
    const lead = names[0] ?? plain[0];
    const asks = [
      // A name and what happened: "Baird television 1926".
      names.length ? [names[0], plain[0]] : plain.slice(0, 2),
      // Its names together: "RCA New York World's Fair 1939".
      ...(names.length >= 2 ? [names.slice(0, 2)] : []),
      // Its place and what happened: "Alexandra Palace BBC Television Service 1936".
      ...(place && lead && place !== lead
        ? [[place, lead === place ? plain[0] : lead]]
        : []),
    ]
      .map((words) => [...words.filter(Boolean), year].join(' '))
      .filter((ask) => ask !== String(year));
    const files: SourceFile[] = [];
    for (const words of [...new Set(asks)])
      files.push(
        ...(await this.safely(
          () => this.deps.sources.commonsSearch(words, FROM_SEARCH, width),
          [],
        )),
      );
    // The year's photos of where it happened: its city ("1926 in
    // London", from "Frith Street, London"), else its country.
    const where = [query.place ?? []].flat().at(-1)?.split(',').at(-1)?.trim();
    if (where)
      files.push(
        ...(await this.safely(
          () =>
            this.deps.sources.commonsCategory(
              `${year} in ${inCountry(where)}`,
              FROM_CATEGORY,
              width,
            ),
          [],
        )),
      );
    const found = await this.judge(this.unique(files), query, 'photo');
    return {
      found,
      ...(found.length ? {} : { reason: `no picture of ${query.name} clears` }),
    };
  }

  /**
   * A thing's photos: its own Wikidata item's picture and Commons
   * category, Commons searched by its name, and the Met's and NASA's
   * collections; only a file that names it (thingPhotoOf) clears, ranked
   * nearest the research's years, and only one the look agrees shows it
   * is taken.
   */
  private async findThing(query: PictureQuery): Promise<Found> {
    const width = FETCH_WIDTH.photo;
    const ids = await this.ids(query);
    const items = ids.length
      ? await this.safely(() => this.deps.sources.items(ids), [])
      : [];
    const item = items.find((i) =>
      [i.label, ...i.aliases].some(
        (n) =>
          nameWords(n).join(' ') === nameWords(query.name).join(' ') ||
          textWordsOf(n).includes(textWordsOf(query.name)),
      ),
    );
    const files: SourceFile[] = item
      ? await this.filesOf(item.images, item.qid, item.category, width)
      : [];
    files.push(
      ...(await this.safely(
        () => this.deps.sources.commonsSearch(query.name, FROM_SEARCH, width),
        [],
      )),
      ...(await this.museums(query)),
    );
    const found = await this.judge(
      this.unique(files),
      query,
      'photo',
      item?.qid,
    );
    return {
      found,
      ...(item ? { qid: item.qid } : {}),
      ...(found.length ? {} : { reason: `no picture of ${query.name} clears` }),
    };
  }

  /** The Met's and NASA's files for a thing or a document, in the research's years when it gives some. */
  private async museums(query: PictureQuery): Promise<SourceFile[]> {
    const years = query.years?.length
      ? {
          yearStart: Math.min(...query.years) - 1,
          yearEnd: Math.max(...query.years) + 1,
        }
      : {};
    return [
      ...(await this.safely(
        () => this.deps.sources.metSearch(query.name, 6),
        [],
      )),
      ...(await this.safely(
        () => this.deps.sources.nasaSearch(query.name, { limit: 6, ...years }),
        [],
      )),
    ];
  }

  /**
   * Photos chosen from a portrait's files, at the photo's width: Commons
   * is asked again for their copies wide enough to fill a frame (one
   * request for all), so a photo of a person is not a portrait's print.
   */
  private async widen(found: PictureCandidate[]): Promise<PictureCandidate[]> {
    const narrow = found
      .slice(0, TRIES + MOST.person)
      .filter(
        (c) =>
          c.file.source === 'commons' &&
          c.file.thumb &&
          c.file.thumb.width < FETCH_WIDTH.photo &&
          c.file.thumb.width < c.file.width,
      );
    if (!narrow.length) return found;
    const wide = await this.safely(
      () =>
        this.deps.sources.commonsFiles(
          narrow.map((c) => c.file.sourceId),
          FETCH_WIDTH.photo,
        ),
      [],
    );
    const bySource = new Map(wide.map((f) => [f.sourceId, f]));
    return found.map((c) => {
      const got = bySource.get(c.file.sourceId);
      return got?.thumb ? { ...c, file: { ...c.file, thumb: got.thumb } } : c;
    });
  }

  /** The best cleared picture, when it is good enough to show. */
  pick(found: readonly PictureCandidate[]): PictureCandidate | null {
    const best = [...found].sort((a, b) => b.score - a.score)[0];
    return best && best.score >= PICK_LEAST ? best : null;
  }

  /** Wikidata's ids for a name, its titles taken off too (Sir, Alhaji, Chief…), the given id first. */
  private async ids(query: PictureQuery): Promise<string[]> {
    const ids = new Set<string>(query.qid ? [query.qid] : []);
    const bare = nameWords(query.name).join(' ');
    const asked = [
      query.name,
      ...(bare && bare !== query.name.toLowerCase() ? [bare] : []),
    ];
    for (const name of asked) {
      const hits = await this.safely(
        () => this.deps.sources.searchEntities(name, 7),
        [],
      );
      for (const hit of hits) ids.add(hit.qid);
      if (ids.size >= 7) break;
    }
    return [...ids].slice(0, 10);
  }

  /**
   * More of Wikidata's people for a name, by its words with one of the
   * research's (their first place; the longest word of who they were),
   * a request each; none already found.
   */
  private async textIds(
    query: PictureQuery,
    had: ReadonlySet<string>,
  ): Promise<string[]> {
    const name = nameWords(query.name).join(' ');
    if (!name) return [];
    const place = [query.place ?? []].flat().find(Boolean);
    const post = (query.role ?? '')
      .split(/[^\p{L}]+/u)
      .filter(
        (w) =>
          w.length >= 5 && !nameWords(query.name).includes(w.toLowerCase()),
      )
      .sort((a, b) => b.length - a.length)[0];
    const out = new Set<string>();
    for (const word of [place, post].filter(Boolean)) {
      const hits = await this.safely(
        () =>
          this.deps.sources.searchText(`${name} ${word}`, {
            limit: 5,
            humans: true,
          }),
        [],
      );
      for (const hit of hits) if (!had.has(hit.qid)) out.add(hit.qid);
    }
    return [...out].slice(0, 8);
  }

  /** A person's or a place's files: its own Wikidata pictures, those that say they depict it, and its category's. */
  private async filesOf(
    images: readonly string[],
    qid: string,
    category: string | undefined,
    width: number,
  ): Promise<SourceFile[]> {
    const own = images.length
      ? await this.safely(
          () =>
            this.deps.sources.commonsFiles(
              images.map((f) => (f.startsWith('File:') ? f : `File:${f}`)),
              width,
            ),
          [],
        )
      : [];
    const chosen = new Set(own.map((f) => f.sourceId));
    const depicting = await this.safely(
      () => this.deps.sources.commonsDepicting(qid, FROM_DEPICTS, width),
      [],
    );
    const filed = category
      ? await this.safely(
          () =>
            this.deps.sources.commonsCategory(category, FROM_CATEGORY, width),
          [],
        )
      : [];
    return this.unique([...own, ...depicting, ...filed]).map((f) =>
      chosen.has(f.sourceId) ? { ...f, chosen: true } : f,
    );
  }

  private unique(files: readonly SourceFile[]): SourceFile[] {
    const seen = new Map<string, SourceFile>();
    for (const file of files) {
      const key = `${file.source}:${file.sourceId}`;
      const had = seen.get(key);
      seen.set(key, had ? { ...had, chosen: had.chosen || file.chosen } : file);
    }
    return [...seen.values()];
  }

  /**
   * The files that clear, scored: licence and provenance first (a refusal
   * is kept), then whether it can serve (a portrait of them alone; a photo
   * of them among others; a photo that names the place in its years; an
   * event's, of its year and with its words; a thing's, naming it), then
   * big enough to show.
   */
  private async judge(
    files: readonly SourceFile[],
    query: PictureQuery,
    use: PictureUse,
    qid?: string,
    person?: WikiPerson,
  ): Promise<PictureCandidate[]> {
    const out: PictureCandidate[] = [];
    for (const file of files) {
      if (!/^image\/(?:jpeg|png|tiff|gif|webp)$/u.test(file.mime)) continue;
      const year = yearOf(file);
      const licence = licenceUnder(
        { ...file, ...(year !== undefined ? { year } : {}) },
        this.licence,
      );
      if (!licence.ok) {
        await this.refused(file, licence.reason, qid);
        continue;
      }
      const them = person
        ? {
            qid: person.qid,
            name: query.name,
            ...(person.died !== undefined ? { died: person.died } : {}),
            ...(person.category ? { category: person.category } : {}),
          }
        : null;
      const fit =
        use === 'portrait' && them
          ? portraitOf(file, them, year)
          : them
            ? personPhotoOf(file, them, year)
            : query.kind === 'event'
              ? eventPhotoOf(file, query, year)
              : query.kind === 'object'
                ? thingPhotoOf(file, query, qid)
                : photoOf(file, query, qid, year);
      if (!fit.ok) continue;
      if (Math.max(file.width, file.height) < LEAST_PX[use]) continue;
      const focal = focalOf(file, qid);
      const { score, terms } = scoreOf({
        file: {
          ...file,
          quality: file.quality ?? qualityOf(file.categories),
          // An archive's or an agency's file ranks above a crowd upload.
          institutional: file.institutional ?? institutionOf(file) !== null,
        },
        use,
        tier: licence.tier,
        focal,
        ...(year !== undefined ? { year } : {}),
        ...(use === 'portrait' ? {} : { years: query.years ?? [] }),
      });
      const subject = person?.label.split(',')[0] ?? query.name;
      const source = sourceOf(file);
      out.push({
        file,
        licence,
        kind: query.kind,
        use,
        subject,
        ...(qid ? { qid } : {}),
        ...(year !== undefined ? { year } : {}),
        chip: chipOf({
          subject,
          ...(year !== undefined ? { year } : {}),
          source,
          licence,
        }),
        credit: creditOf(file, licence, source),
        source,
        focal,
        score,
        notes: [
          Object.entries(terms)
            .map(([k, v]) => `${k} ${v}`)
            .join(', '),
          ...licence.flags,
        ],
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** A refused file kept with why, so it is not fetched and judged again in vain. */
  private async refused(
    file: SourceFile,
    reason: string,
    qid?: string,
  ): Promise<void> {
    try {
      const had = await this.deps.cache.bySource(file.source, file.sourceId);
      if (had?.storageKey) return;
      await this.deps.cache.save({
        ...this.blank(file.source, file.sourceId),
        ...(had ? { id: had.id } : {}),
        qid: qid ?? null,
        subject: file.title.slice(0, 255),
        url: file.url,
        sourceUrl: file.pageUrl,
        licence: file.licenceName.slice(0, 64) || null,
        meta: {
          artist: file.artist,
          credit: file.credit,
          description: file.description.slice(0, 600),
          categories: file.categories.slice(0, 40),
        },
        refusedReason: reason.slice(0, 512),
      });
    } catch (error) {
      this.log(
        `pictures: could not keep a refusal: ${(error as Error).message}`,
      );
    }
  }

  // ── Taking ───────────────────────────────────────────────────────────────

  /**
   * Our copy of a cleared picture: fetched at the width the desk asked
   * for, kept by its sha1 (a picture two films show is stored once), its
   * size measured, its subject in its pixels, whether it has colour, and
   * its depth map beside it when depth is on. Null when it cannot be had.
   */
  async take(
    candidate: PictureCandidate,
    opts: {
      depth?: boolean;
      person?: WikiPerson;
      role?: string;
      /** Each model call the look at it made, for the ledger. */
      onUsage?: (usage: LlmUsage) => void;
      /** What a picture of an event or a thing must show: taken only when the look agrees. */
      asked?: string;
    } = {},
  ): Promise<PictureRecord | null> {
    const { file } = candidate;
    const asked = opts.asked;
    const had = await this.deps.cache.bySource(file.source, file.sourceId);
    // The copy this use wants: the source's sized one where it made one.
    const sized = Boolean(file.thumb && file.thumb.width < file.width);
    const wanted = sized ? file.thumb!.width : file.width;
    if (
      had?.storageKey &&
      !had.refusedReason &&
      (had.width ?? 0) >= wanted * 0.95 &&
      (await this.stored(had.storageKey))
    ) {
      // Kept, its words as the desk writes them now; looked at again
      // (its colour, its border, its subject) when the desk's rules changed,
      // or when it is asked of an event or a thing it was never asked of.
      const stale =
        (had.meta as { rules?: number } | null)?.rules !== DESK_RULES;
      const unasked = Boolean(
        asked && this.deps.focus && !agreedOf(had.meta, asked),
      );
      const storage = this.deps.storage as Partial<Pick<StoragePort, 'get'>>;
      const bytes =
        (stale || unasked) && storage.get
          ? await this.safely(() => storage.get!(had.storageKey!), null)
          : null;
      const size = bytes ? this.deps.pixels.measure(bytes) : null;
      const seen =
        bytes && size
          ? await this.seen(candidate, bytes, size, opts.onUsage, asked)
          : null;
      const meta = seen ? withSeen(had.meta, seen.meta) : had.meta;
      const one = undatedScan(candidate, meta);
      const fresh =
        !seen && had.chip === one.chip && had.credit === one.credit
          ? had
          : await this.deps.cache.save({
              ...had,
              chip: one.chip.slice(0, 255),
              credit: one.credit,
              licence: one.licence.short,
              checkedAt: this.now(),
              ...(seen ? { focal: seen.focal } : {}),
              meta: yearKept(meta, one.year),
            });
      const doubt = this.doubtOf(one, fresh.meta, asked);
      if (doubt) {
        this.log(`pictures: ${file.sourceId} will not do: ${doubt}`);
        return null;
      }
      const kept = await this.withDepth(fresh, opts.depth ?? true);
      return this.recordOf(kept, one, opts);
    }
    const from = sized ? file.thumb!.url : file.url;
    const got = await this.safely(() => this.deps.sources.fetch(from), null);
    if (!got) return null;
    const size = this.deps.pixels.measure(got.bytes);
    if (!size) {
      this.log(`pictures: ${file.sourceId} is no JPEG or PNG`);
      return null;
    }
    const sha1 = createHash('sha1').update(got.bytes).digest('hex');
    const twin = await this.deps.cache.bySha1(sha1);
    let storageKey =
      twin?.storageKey && (await this.stored(twin.storageKey))
        ? twin.storageKey
        : null;
    if (!storageKey) {
      const stored = await this.deps.storage.put({
        key: `pictures/${sha1}.${extOf(size.mime)}`,
        body: got.bytes,
        mimeType: size.mime,
      });
      storageKey = stored.ref;
    }
    const seen = await this.seen(
      candidate,
      got.bytes,
      size,
      opts.onUsage,
      asked,
    );
    const one = undatedScan(candidate, seen.meta);
    const row = await this.deps.cache.save({
      ...this.blank(file.source, file.sourceId),
      ...(had ? { id: had.id } : {}),
      qid: one.qid ?? null,
      kind: one.kind,
      subject: one.subject.slice(0, 255),
      url: file.url,
      sourceUrl: file.pageUrl,
      licence: one.licence.short,
      credit: one.credit,
      chip: one.chip.slice(0, 255),
      width: size.width,
      height: size.height,
      focal: seen.focal,
      sha1,
      mime: size.mime,
      storageKey,
      depthKey: twin?.depthKey ?? null,
      meta: yearKept(
        withSeen(had?.meta ?? null, {
          code: one.licence.code,
          tier: one.licence.tier,
          flags: one.licence.flags,
          score: one.score,
          notes: one.notes,
          ...(one.year !== undefined ? { year: one.year } : {}),
          ...seen.meta,
          title: file.title,
          artist: file.artist,
          licenceName: file.licenceName,
          categories: file.categories.slice(0, 40),
        }),
        one.year,
      ),
      refusedReason: null,
    });
    // Kept either way (another use may take it), but not for this one when what was seen says no.
    const doubt = this.doubtOf(one, row.meta, asked);
    if (doubt) {
      this.log(`pictures: ${file.sourceId} will not do: ${doubt}`);
      return null;
    }
    const kept = await this.withDepth(row, opts.depth ?? true, got.bytes);
    return this.recordOf(kept, one, opts);
  }

  /**
   * What the desk sees of a copy: whether it has colour, where its own
   * content is inside its scan's border, and its subject's box in its
   * pixels; with the rules' number they were seen under.
   */
  private async seen(
    candidate: PictureCandidate,
    bytes: Buffer,
    size: { width: number; height: number },
    onUsage?: (usage: LlmUsage) => void,
    asked?: string,
  ): Promise<{ focal: PixelBox; meta: Record<string, unknown> }> {
    const small = await this.safely(
      () => this.deps.pixels.pixels(bytes, 256),
      null,
    );
    const content = small ? contentBox(small) : null;
    const crop = content ? cropOf(content, size) : undefined;
    // Where its subject is, as a model that sees names it (once a copy).
    let focus: Focus | null = null;
    if (this.deps.focus && this.deps.pixels.png) {
      const png = await this.safely(
        () => this.deps.pixels.png!(bytes, 768, GRID),
        null,
      );
      const answer = png
        ? await this.safely(
            () =>
              this.deps.focus!({
                png,
                about: `${candidate.subject}${candidate.year ? `, ${candidate.year}` : ''}: ${candidate.file.title}`,
                ...(asked ? { asked } : {}),
              }),
            null,
          )
        : null;
      if (answer) {
        onUsage?.(answer.usage);
        focus = focusOf(answer.value);
      }
    }
    const looked = focus ? focalFromFocus(focus) : null;
    const [fx, fy, fw, fh] =
      candidate.focal.from === 'depicts' || !looked
        ? candidate.focal.box
        : looked;
    return {
      focal: [
        Math.round(fx * size.width),
        Math.round(fy * size.height),
        Math.round(fw * size.width),
        Math.round(fh * size.height),
      ],
      meta: {
        rules: DESK_RULES,
        focalFrom:
          candidate.focal.from === 'depicts'
            ? 'depicts'
            : looked
              ? 'looked'
              : 'centre',
        ...(small
          ? {
              mono: isMono(small),
              monochrome: isMonochrome(small),
              print: printOf(small, content ?? undefined),
            }
          : {}),
        ...(crop ? { crop } : {}),
        ...(focus ? { focus } : {}),
        // Whether it shows what it was asked to, kept by the question.
        ...(focus && asked ? { agrees: { [asked]: focus.shows } } : {}),
      },
    };
  }

  /**
   * Why a kept copy cannot serve this use, by what was seen of it; null
   * when it can. A portrait is of one person; a photo of a person shows
   * someone; a photo of an event or a thing is taken only when the look
   * agreed it shows it (with no look to ask, none is).
   */
  private doubtOf(
    candidate: PictureCandidate,
    meta: Record<string, unknown> | null,
    asked?: string,
  ): string | null {
    const focus = (meta?.focus ?? null) as Focus | null;
    if (
      (candidate.kind === 'place' || candidate.kind === 'event') &&
      candidate.year !== undefined &&
      candidate.year < COLOUR_FROM &&
      meta?.monochrome === false
    )
      return `a photograph in colour said to be of ${candidate.year}: the place since`;
    if (candidate.use === 'portrait')
      return focus ? portraitDoubt(focus) : null;
    if (asked) {
      const agreed = agreedOf(meta, asked);
      if (!focus || !agreed) return 'no look has said it shows what was asked';
      return agreeDoubt({ ...focus, shows: agreed }, asked, {
        photograph: candidate.kind !== 'object',
      });
    }
    if (!focus) return null;
    return candidate.kind === 'person'
      ? personPhotoDoubt(focus)
      : photoDoubt(focus);
  }

  /** Its depth map beside it, made once (by the bytes' sha1, so a twin's is reused). */
  private async withDepth(
    row: PictureCacheRow,
    wanted: boolean,
    bytes?: Buffer,
  ): Promise<PictureCacheRow> {
    if (!wanted || !this.deps.depth || !row.sha1) return row;
    if (row.depthKey && (await this.stored(row.depthKey))) return row;
    try {
      const source = bytes ?? null;
      if (!source) return row;
      const made = await this.deps.depth.depthOf(source);
      if (!made) return row;
      const stored = await this.deps.storage.put({
        key: `pictures/${row.sha1}-depth.png`,
        body: made.png,
        mimeType: 'image/png',
      });
      return await this.deps.cache.save({ ...row, depthKey: stored.ref });
    } catch (error) {
      // The flat picture is the fallback when depth cannot be made.
      this.log(
        `pictures: no depth for ${row.sourceId}: ${(error as Error).message}`,
      );
      return row;
    }
  }

  private async stored(key: string): Promise<boolean> {
    try {
      return (await this.deps.storage.size(key)) > 0;
    } catch {
      return false;
    }
  }

  private recordOf(
    row: PictureCacheRow,
    candidate: PictureCandidate | null,
    opts: { person?: WikiPerson; role?: string; use?: PictureUse } = {},
  ): PictureRecord {
    const meta = row.meta ?? {};
    const use = opts.use ?? candidate?.use;
    const title =
      typeof meta.title === 'string' ? meta.title : candidate?.file.title;
    const person = opts.person;
    const dates = person
      ? lifeOf(person.born, person.died)
      : (meta.dates as string | undefined);
    const role =
      opts.role !== undefined
        ? roleWords(opts.role)
        : (meta.role as string | undefined);
    return {
      id: row.id,
      qid: row.qid,
      source: row.source as PictureRecord['source'],
      sourceId: row.sourceId,
      kind: (row.kind ?? candidate?.kind ?? 'object') as PictureRecord['kind'],
      subject: row.subject ?? candidate?.subject ?? '',
      url: row.url ?? '',
      sourceUrl: row.sourceUrl ?? '',
      licence: row.licence ?? '',
      credit: row.credit ?? '',
      chip: row.chip ?? '',
      width: row.width ?? 0,
      height: row.height ?? 0,
      focal: row.focal ?? [0, 0, row.width ?? 0, row.height ?? 0],
      sha1: row.sha1 ?? '',
      mime: row.mime ?? 'image/jpeg',
      storageKey: row.storageKey ?? '',
      depthKey: row.depthKey,
      ...(typeof meta.year === 'number'
        ? { year: meta.year }
        : candidate?.year !== undefined
          ? { year: candidate.year }
          : {}),
      ...(typeof meta.mono === 'boolean' ? { mono: meta.mono } : {}),
      ...(Array.isArray(meta.crop) && meta.crop.length === 4
        ? { crop: meta.crop as PixelBox }
        : {}),
      ...(dates ? { dates } : {}),
      ...(role ? { role } : {}),
      ...(use ? { use } : {}),
      ...(title ? { title } : {}),
      ...(typeof meta.print === 'string' ? { print: meta.print } : {}),
    };
  }

  // ── The question, answered once ──────────────────────────────────────────

  /**
   * The picture for a question: a person's portrait, else the first photo
   * of what is asked (lookupAll's answer, from the cache when it was given
   * in the last 30 days). Null when nothing clears.
   */
  async lookup(
    query: PictureQuery,
    opts: { depth?: boolean; onUsage?: (usage: LlmUsage) => void } = {},
  ): Promise<PictureRecord | null> {
    const all = await this.lookupAll(query, opts);
    return all.find((r) => r.use === useOf(query.kind)) ?? null;
  }

  /**
   * Every picture a question brings, distinct files and bytes, the best
   * first: for a person, their portrait and up to two more photos of them;
   * for a place or an event, two; for a thing, one (MOST). From the cache
   * when it was answered in the last 30 days under these rules and this
   * licence switch; else found, picked and taken, and the answer kept
   * (which pictures, or none and why). Empty when nothing clears.
   */
  async lookupAll(
    query: PictureQuery,
    opts: { depth?: boolean; onUsage?: (usage: LlmUsage) => void } = {},
  ): Promise<PictureRecord[]> {
    const key = lookupKey(query);
    const asked = await this.safely(
      () => this.deps.cache.bySource('lookup', key),
      null,
    );
    // An answer is kept under these rules and this licence switch only: one
    // given while the licences were checked (every answer before the
    // switch was) is asked again with them off, and the other way round.
    const said = (asked?.meta ?? null) as {
      rules?: number;
      licence?: LicenceMode;
    } | null;
    const fresh =
      asked &&
      said?.rules === DESK_RULES &&
      (said.licence ?? 'on') === this.licence &&
      this.now().getTime() - asked.checkedAt.getTime() < LOOKUP_DAYS * DAY_MS;
    if (asked && fresh) {
      const meta = (asked.meta ?? {}) as {
        picked?: string | null;
        taken?: { id: string; use: PictureUse }[];
        person?: WikiPerson;
        role?: string;
      };
      const taken =
        meta.taken ??
        (meta.picked ? [{ id: meta.picked, use: useOf(query.kind) }] : []);
      const records: PictureRecord[] = [];
      for (const one of taken) {
        const row = await this.safely(() => this.deps.cache.find(one.id), null);
        // The picture as it was seen under these rules, and still kept.
        if (
          !row?.storageKey ||
          row.refusedReason ||
          (row.meta as { rules?: number } | null)?.rules !== DESK_RULES ||
          !(await this.stored(row.storageKey))
        )
          break;
        const kept = await this.withDepthFromStore(row, opts.depth ?? true);
        records.push(
          this.recordOf(kept, null, {
            ...(meta.person ? { person: meta.person } : {}),
            ...(meta.role !== undefined ? { role: meta.role } : {}),
            use: one.use,
          }),
        );
      }
      if (records.length === taken.length) return records;
    }
    const result: Found = await this.safely(() => this.find(query), {
      found: [] as PictureCandidate[],
      reason: 'the sources could not be reached',
    });
    const records: PictureRecord[] = [];
    // The best that will do from a pool, each in turn from the best down
    // while it scores enough, until there are `upTo` in all: never a file
    // or the same bytes twice.
    const takeFrom = async (
      pool: readonly PictureCandidate[],
      upTo: number,
    ): Promise<void> => {
      let tries = TRIES + Math.max(0, upTo - records.length - 1);
      for (const candidate of pool) {
        if (records.length >= upTo || tries <= 0) break;
        if (candidate.score < PICK_LEAST) break;
        const key = titleKey(candidate.file.title);
        if (
          records.some(
            (r) =>
              r.sourceId === candidate.file.sourceId ||
              titleKey(r.title ?? r.sourceId) === key,
          )
        )
          continue;
        tries -= 1;
        const record = await this.safely(
          () =>
            this.take(candidate, {
              depth: opts.depth ?? true,
              ...(result.person ? { person: result.person } : {}),
              ...(query.role !== undefined ? { role: query.role } : {}),
              ...(opts.onUsage ? { onUsage: opts.onUsage } : {}),
              ...(query.asked ? { asked: query.asked } : {}),
            }),
          null,
        );
        if (!record) continue;
        const twin = records.find(
          (r) =>
            r.id === record.id ||
            (r.sha1 && r.sha1 === record.sha1) ||
            samePicture(r.print, record.print),
        );
        if (twin) {
          this.log(
            `pictures: ${record.sourceId} is ${twin.sourceId} again: one picture`,
          );
          continue;
        }
        records.push(record);
      }
    };
    const most = MOST[query.kind];
    if (query.kind === 'person') {
      await takeFrom(result.found, 1);
      await takeFrom(result.photos ?? [], most);
    } else await takeFrom(result.found, most);
    const best = this.pick([...result.found, ...(result.photos ?? [])]);
    const reason = records.length
      ? null
      : (result.reason ??
        (best
          ? 'it could not be fetched, or the look would not have it'
          : `nothing scored ${PICK_LEAST} or more`));
    await this.safely(
      () =>
        this.deps.cache.save({
          ...this.blank('lookup', key),
          ...(asked ? { id: asked.id } : {}),
          qid: result.qid ?? null,
          kind: query.kind,
          subject: query.name.slice(0, 255),
          meta: {
            rules: DESK_RULES,
            licence: this.licence,
            picked: records[0]?.id ?? null,
            taken: records.map((r) => ({ id: r.id, use: r.use })),
            ...(result.person ? { person: result.person } : {}),
            ...(query.role !== undefined ? { role: query.role } : {}),
            candidates: [...result.found, ...(result.photos ?? [])]
              .slice(0, 6)
              .map((c) => ({
                file: c.file.sourceId,
                use: c.use,
                score: c.score,
                chip: c.chip,
              })),
          },
          refusedReason: reason ? reason.slice(0, 512) : null,
        }),
      null,
    );
    if (reason) this.log(`pictures: ${query.kind} "${query.name}": ${reason}`);
    return records;
  }

  /** A cached picture's depth made when it was taken without it (depth switched on later). */
  private async withDepthFromStore(
    row: PictureCacheRow,
    wanted: boolean,
  ): Promise<PictureCacheRow> {
    if (
      !wanted ||
      !this.deps.depth ||
      (row.depthKey && (await this.stored(row.depthKey)))
    )
      return row;
    const storage = this.deps.storage as Partial<Pick<StoragePort, 'get'>>;
    if (!storage.get || !row.storageKey) return row;
    const bytes = await this.safely(() => storage.get!(row.storageKey!), null);
    return bytes ? this.withDepth(row, true, bytes) : row;
  }

  /** A cached picture by its id, for serving: null for a refused one or one with no copy. */
  async record(id: string): Promise<PictureCacheRow | null> {
    const row = await this.safely(() => this.deps.cache.find(id), null);
    return row && row.storageKey && !row.refusedReason ? row : null;
  }

  private blank(source: string, sourceId: string): Omit<PictureCacheRow, 'id'> {
    return {
      qid: null,
      source,
      sourceId: sourceId.slice(0, 512),
      kind: null,
      subject: null,
      url: null,
      sourceUrl: null,
      licence: null,
      credit: null,
      chip: null,
      width: null,
      height: null,
      focal: null,
      sha1: null,
      mime: null,
      storageKey: null,
      depthKey: null,
      meta: null,
      checkedAt: this.now(),
      refusedReason: null,
    };
  }

  private async safely<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.log(`pictures: ${(error as Error).message}`);
      return fallback;
    }
  }
}
