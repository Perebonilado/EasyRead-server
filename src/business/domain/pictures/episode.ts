/**
 * One desk pass an episode (explainer-animation-tech §4.3; WP11; Richard,
 * 2026-10-02: "real people should be used first… even places can be
 * represented with pictures, not just the map… scenes that change often
 * to relatable things"). Before its scenes are boarded, the desk is asked
 * once for:
 *
 *   people   each person of the research and the world: their portrait,
 *            and up to two more photos of them (among others, at their
 *            work), distinct files, so the board can come back to them
 *            without one image again;
 *   places   each real place the lines name: photos from the research's
 *            years, else any good photo of it (its year on the chip);
 *   events   the research's key events the lines rest on (a ceremony, a
 *            conference, a demonstration): photos of that event, taken in
 *            its year, carrying its words, that the desk's look agrees
 *            show it;
 *   things   the things the lines name that the world or the look notes
 *            know (a televisor, an iconoscope): photos that name them.
 *
 * What clears becomes registry entries: a portrait on its person's entry,
 * every other picture a `photo:` entry of its own that says what it shows
 * (`shows`: the person's or the place's registry name, an event's or a
 * thing's words) and, in plain words for the board's list, `about`. Each
 * scene is offered only what its lines are about (picturesFor). The
 * episode's description lists every picture its film shows, with its full
 * credit (creditsBlock). Pure but for deskPass, which asks the desk.
 */
import { countriesNamed, placeNamed, placesIn } from '../scene-map-places';
import type {
  EditorClaim,
  EditorResearch,
  EditorWorld,
} from '../studio/studio-editor';
import type { LlmUsage } from '../../ports/llm.port';
import { clip, line } from '../shots/shot-parts';
import type { RegistryEntry } from '../shots/types';
import { clipWords, roleWords } from './credit';
import { samePicture, titleKey } from './desk';
import { nameWords, stems, textWords } from './match';
import { EVENT_VERBS } from './rank';
import type { PictureQuery, PictureRecord } from './types';

/** How many people, places, events and things one pass asks about (the research keeps 12 people). */
const PEOPLE_MOST = 12;
const PLACES_MOST = 8;
export const EVENTS_MOST = 8;
export const THINGS_MOST = 8;
/** The years a place's photo may be asked for: the research's timeline's, at most this many. */
const YEARS_MOST = 8;

/** What the pass is made from. */
export interface PassInput {
  /** The episode's lines, every scene's, in order. */
  rows: readonly { say: string; claims: readonly string[] }[];
  research: EditorResearch | null;
  world: EditorWorld | null;
}

/** What a picture shows, as RegistryEntry.shows says it. */
export type Shows = NonNullable<RegistryEntry['shows']>;

/**
 * When a scene is offered a picture: its lines name the person (their full
 * name, or a surname of four letters or more), the place or the thing; or,
 * for an event, a line rests on one of its claims, or says its year and
 * one of its words.
 */
export type Offer =
  | { kind: 'person' | 'place' | 'thing'; name: string }
  | { kind: 'event'; claims: string[]; year: number; words: string[] };

/** A question the pass asks, and what its answers become. */
export interface PassQuestion {
  query: PictureQuery;
  /** A person's question (their portrait first, then photos of them), or a photo's. */
  for: 'portrait' | 'photo';
  /** What its pictures show, as the registry names it. */
  shows: Shows;
  /** Where a scene is offered its pictures. */
  offer: Offer;
}

const yearsIn = (text: string): number[] =>
  [...text.matchAll(/(?<!\d)(1[5-9]\d\d|20[0-4]\d)(?!\d)/gu)].map((m) =>
    Number(m[1]),
  );

/** Whether some words name a person: their full name, or their surname where it is four letters or more. */
export function namesPerson(text: string, name: string): boolean {
  const said = ` ${textWords(text).join(' ')} `;
  const words = nameWords(name);
  if (!words.length) return false;
  if (said.includes(` ${words.join(' ')} `)) return true;
  const surname = words[words.length - 1];
  return (
    words.length > 1 && surname.length >= 4 && said.includes(` ${surname} `)
  );
}

/** Whether some words name a thing, in whole words, a plural allowed ("cathode-ray tubes"). */
export function namesThing(text: string, name: string): boolean {
  const said = ` ${textWords(text).join(' ')} `;
  const words = textWords(name);
  if (!words.length) return false;
  const head = words.slice(0, -1).join(' ');
  const last = words[words.length - 1];
  return [last, `${last}s`, `${last}es`].some((w) =>
    said.includes(` ${head ? `${head} ` : ''}${w} `),
  );
}

/** The countries the show's story is in, from the world's region (never assumed). */
function countriesOf(world: EditorWorld | null): string[] {
  return world?.region ? [...countriesNamed(world.region)] : [];
}

/** The real places the lines name, by the map's own data, in the show's countries when it has some. */
export function placesNamed(
  rows: readonly { say: string }[],
  world: EditorWorld | null,
  people: readonly string[],
): {
  name: string;
  geo: { lng: number; lat: number };
  country: string | null;
}[] {
  const within = countriesOf(world);
  const personWords = new Set(people.flatMap((p) => nameWords(p)));
  const out = new Map<
    string,
    { name: string; geo: { lng: number; lat: number }; country: string | null }
  >();
  const keep = (said: string) => {
    if (nameWords(said).some((w) => personWords.has(w))) return;
    if (countriesNamed(said).length) return;
    const place = placeNamed(said);
    if (!place || (place.kind !== 'city' && place.kind !== 'capital')) return;
    if (within.length && (!place.country || !within.includes(place.country)))
      return;
    if (!out.has(place.name))
      out.set(place.name, {
        name: place.name,
        geo: { lng: place.lon, lat: place.lat },
        country: place.country,
      });
  };
  for (const row of rows) {
    for (const found of placesIn(row.say))
      if (found.kind === 'place') keep(found.name);
    for (const m of row.say.matchAll(
      /\p{Lu}[\p{L}\p{M}’'-]{3,}(?:\s+\p{Lu}[\p{L}\p{M}’'-]+){0,2}/gu,
    ))
      keep(m[0]);
  }
  return [...out.values()].slice(0, PLACES_MOST);
}

/** Small words a short name of an event is cut before, once it has three words. */
const CUT_BEFORE =
  /^(?:by|and|to|with|as|at|in|on|of|for|from|over|into|after|before|during|under|through|while)$/iu;

/**
 * An event's short name, for its chip and its registry name: its first
 * words, cut before the small word that turns it once there are three
 * ("Nigeria becomes independent by act…" is "Nigeria becomes independent").
 */
export function eventName(text: string): string {
  const words = line(text, 200).split(' ').filter(Boolean);
  // What did it, when that is two words or more: "Resumed constitutional
  // conference" of "… sets out the path to independence".
  const verb = words.findIndex((w) =>
    EVENT_VERBS.has(w.toLowerCase().replace(/[^\p{L}]/gu, '')),
  );
  const article = /^(?:the|a|an)$/iu.test(words[0] ?? '') ? 1 : 0;
  if (verb - article >= 2 && verb <= 6)
    return clip(words.slice(0, verb).join(' '), 6);
  const out: string[] = [];
  for (const word of words) {
    if (out.length >= 3 && CUT_BEFORE.test(word.replace(/[,.;:]+$/u, '')))
      break;
    out.push(word.replace(/[,;:]+$/u, ''));
    if (/[,;:]$/u.test(word) && out.length >= 3) break;
    if (out.length >= 6) break;
  }
  return clip(out.join(' '), 6);
}

/** Capitalised words that name nothing alone: a direction, a kind of body ("East and West", "Federal"). */
const GENERIC_NAMES =
  /^(?:north|south|east|west|northern|southern|eastern|western|central|federal|national|regional|government|parliament|constitution|republic|kingdom|empire|colony|protectorate|state|states|region|regions|party|council|house|assembly|congress|army|navy|court)$/iu;

/**
 * An event's own names, a photo of it must carry one of: the research's
 * people its words name (by surname), its short names in capitals (BBC,
 * RCA), and the runs of capitalised words that are names (the Royal
 * Institution; the Lyttleton Constitution at its start, where one
 * capital word is only a sentence's first).
 */
export function eventNames(text: string, people: readonly string[]): string[] {
  const out = new Set<string>();
  for (const person of people)
    if (namesPerson(text, person)) {
      const words = nameWords(person);
      out.add(words[words.length - 1]);
    }
  const words = line(text, 200).split(' ');
  let run: string[] = [];
  let first = true;
  const close = () => {
    if (
      run.length &&
      (!first || run.length >= 2) &&
      !(run.length === 1 && GENERIC_NAMES.test(run[0]))
    )
      out.add(run.join(' '));
    if (run.length) first = false;
    run = [];
  };
  for (const [i, raw] of words.entries()) {
    const word = raw.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, '');
    if (!word) continue;
    if (/^\p{Lu}{2,}$/u.test(word)) out.add(word);
    if (/^\p{Lu}/u.test(word) && !(i === 0 && /^(?:the|a|an)$/iu.test(word)))
      run.push(word.replace(/['’]s$/u, ''));
    else {
      close();
      first = false;
    }
  }
  close();
  return [...out];
}

/**
 * The research's key events the lines are about: those of its timeline,
 * with a year, that some line rests on (one of its claims) or names (its
 * year and one of its words); the most rested on first, at most
 * EVENTS_MOST, kept in the timeline's order.
 */
export function keyEvents(
  rows: readonly { say: string; claims: readonly string[] }[],
  research: EditorResearch | null,
): {
  event: EditorResearch['timeline'][number];
  year: number;
  rests: number;
  at: number;
}[] {
  return (research?.timeline ?? [])
    .map((event, at) => {
      const year = yearsIn(event.date)[0];
      const own = new Set(event.claims);
      const words = stems(`${event.event} ${event.place ?? ''}`);
      const rests = rows.filter(
        (r) =>
          r.claims.some((c) => own.has(c)) ||
          (year !== undefined &&
            yearsIn(r.say).includes(year) &&
            [...stems(r.say)].some((w) => words.has(w))),
      ).length;
      return { event, year, rests, at };
    })
    .filter(
      (e): e is typeof e & { year: number } =>
        e.year !== undefined && e.rests > 0,
    )
    .sort((a, b) => b.rests - a.rests || a.at - b.at)
    .slice(0, EVENTS_MOST)
    .sort((a, b) => a.at - b.at);
}

/** The things the lines name that the world's things or the research's look notes know, at most THINGS_MOST. */
export function keyThings(
  rows: readonly { say: string }[],
  research: EditorResearch | null,
  world: EditorWorld | null,
): { name: string; look: string }[] {
  const said = rows.map((r) => r.say).join(' ');
  const known = [
    ...(world?.things ?? []).map((t) => ({ name: t.name, look: t.look })),
    ...(research?.looks ?? [])
      .filter((l) => l.kind === 'object')
      .map((l) => ({ name: l.subject, look: l.description })),
  ];
  const out = new Map<string, { name: string; look: string }>();
  for (const thing of known) {
    const name = line(thing.name, 60);
    const key = textWords(name).join(' ');
    if (!key || out.has(key) || !namesThing(said, name)) continue;
    out.set(key, { name, look: line(thing.look, 160) });
  }
  return [...out.values()].slice(0, THINGS_MOST);
}

/**
 * The questions an episode's pass asks: its people's portraits and
 * photos, its places' photos from the research's years, its key events'
 * photos and the photos of the things its lines name.
 */
export function passQuestions(input: PassInput): PassQuestion[] {
  const { research, world, rows } = input;
  const claims: EditorClaim[] = (research?.claims ?? []).filter(
    (c) => c.status !== 'cut',
  );
  const region = world?.region ?? null;
  const out: PassQuestion[] = [];
  const seen = new Set<string>();
  const people = [
    ...(research?.people ?? []).map((p) => ({
      name: p.name,
      role: p.role,
      said: `${p.role} ${p.did}`,
      claims: p.claims,
    })),
    ...(world?.people ?? []).map((p) => ({
      name: p.name,
      role: p.role,
      said: p.role,
      claims: p.claims,
    })),
  ];
  let asked = 0;
  for (const person of people) {
    const key = nameWords(person.name).join(' ');
    if (!key || seen.has(key) || asked >= PEOPLE_MOST) continue;
    seen.add(key);
    asked += 1;
    // Their years: what their own notes, the claims naming them or
    // resting on them, and the timeline's events naming them say.
    const own = new Set(person.claims ?? []);
    const naming = claims.filter(
      (c) => own.has(c.id) || namesPerson(c.text, person.name),
    );
    const events = (research?.timeline ?? []).filter((e) =>
      namesPerson(e.event, person.name),
    );
    const years = [
      ...yearsIn(person.said),
      ...naming.flatMap((c) => yearsIn(c.text)),
      ...events.flatMap((e) => yearsIn(e.date)),
    ];
    const places = [
      ...(region ? [region] : []),
      ...(research?.moments ?? [])
        .filter((m) => namesPerson(m.who, person.name))
        .map((m) => m.where),
    ].filter(Boolean);
    const name = line(person.name, 80);
    out.push({
      for: 'portrait',
      shows: { kind: 'person', name: `person:${name}` },
      offer: { kind: 'person', name },
      query: {
        name: person.name,
        kind: 'person',
        ...(years.length
          ? { years: [...new Set(years)].sort((a, b) => a - b) }
          : {}),
        ...(places.length ? { place: places } : {}),
        role: person.role,
      },
    });
  }
  const span = [
    ...new Set((research?.timeline ?? []).flatMap((e) => yearsIn(e.date))),
  ]
    .sort((a, b) => a - b)
    .slice(0, YEARS_MOST);
  const names = people.map((p) => p.name);
  for (const place of placesNamed(rows, world, names)) {
    out.push({
      for: 'photo',
      shows: { kind: 'place', name: `place:${place.name}` },
      offer: { kind: 'place', name: place.name },
      query: {
        name: place.name,
        kind: 'place',
        geo: place.geo,
        ...(span.length ? { years: span } : {}),
        ...(place.country ? { place: [place.country] } : {}),
        // The look is asked whether it shows the place itself: not a map
        // of it, a page about it, or someone who happens to be there.
        asked: `a place: ${place.name}${place.country ? `, ${place.country}` : ''}, itself (its streets, buildings, skyline or landscape)`,
      },
    });
  }
  for (const { event, year } of keyEvents(rows, research)) {
    const where = line(event.place ?? '', 80);
    const text = line(event.event, 200);
    const named = eventNames(text, names);
    out.push({
      for: 'photo',
      shows: { kind: 'event', name: text },
      offer: {
        kind: 'event',
        claims: [...event.claims],
        year,
        words: [text, ...(where ? [where] : [])],
      },
      query: {
        name: eventName(text),
        kind: 'event',
        years: [year],
        ...(where || region
          ? { place: [where, region].filter((p): p is string => Boolean(p)) }
          : {}),
        words: [text, ...(where ? [where] : [])],
        ...(named.length ? { names: named } : {}),
        asked: `an event: ${text} (${line(event.date, 40)}${where ? `, ${where}` : ''})`,
      },
    });
  }
  for (const thing of keyThings(rows, research, world))
    out.push({
      for: 'photo',
      shows: { kind: 'thing', name: thing.name },
      offer: { kind: 'thing', name: thing.name },
      query: {
        name: thing.name,
        kind: 'object',
        ...(span.length ? { years: span } : {}),
        words: [thing.name],
        asked: `a thing: ${thing.name}${thing.look ? ` (${clip(thing.look, 14)})` : ''}`,
      },
    });
  return out;
}

/**
 * The address our copy is served at, relative to the API's origin (the
 * stage puts the origin before it: scene-stage's assetBase), its global
 * prefix included, so a scene stored on one host plays on any.
 */
export const pictureUrl = (id: string) => `api/v1/studio/pictures/${id}`;
export const depthUrl = (id: string) => `api/v1/studio/pictures/${id}/depth`;

/**
 * A file's title as words the board's list can read: no catalogue codes
 * before it ("ASC Leiden - NSAG - Crebolder 2 - 40 - Independence
 * ceremony…" is its longest part), no Flickr numbers, a dozen words.
 */
export function titleWords(title: string): string {
  const plain = title
    .replace(/\(\d{6,}\)/gu, ' ')
    .replace(/_/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const parts = plain.split(/\s+-\s+/u).filter(Boolean);
  const longest =
    parts.length >= 3
      ? [...parts].sort((a, b) => b.length - a.length)[0]
      : plain;
  return clip(longest, 12);
}

/** What a photo shows, in plain words, for the board's list. */
function aboutOf(shows: Shows, record: PictureRecord, source: string): string {
  const year = record.year ? `, ${record.year}` : '';
  const from = source ? ` (${source})` : '';
  const said = record.title ? `: “${titleWords(record.title)}”` : '';
  const what =
    shows.kind === 'person'
      ? `a photo of ${shows.name.replace(/^person:/u, '')}`
      : shows.kind === 'place'
        ? `a photo of ${shows.name.replace(/^place:/u, '')}`
        : shows.kind === 'event'
          ? `a photo of the event “${clip(shows.name, 12)}”`
          : `a photo of the thing: ${shows.name}`;
  return `${what}${year}${from}${said}`;
}

/**
 * A picture the pass cleared, as a registry entry: a person's portrait on
 * their name; any other picture a photo under its own name, saying what
 * it shows. `taken` holds the names already given, so two photos of one
 * subject and year are told apart ("photo:Ahmadu Bello 1960 (2)").
 */
export function entryOf(
  question: PassQuestion,
  record: PictureRecord,
  taken: ReadonlySet<string> = new Set(),
): RegistryEntry {
  const portrait =
    question.for === 'portrait' && (record.use ?? 'portrait') === 'portrait';
  const picture: NonNullable<RegistryEntry['picture']> = {
    asset: record.id,
    credit: record.chip,
    url: pictureUrl(record.id),
    width: record.width,
    height: record.height,
    focal: record.focal,
    ...(record.depthKey ? { depthUrl: depthUrl(record.id) } : {}),
    licence: record.licence,
    source: record.chip.split(' · ')[1] ?? '',
    sourceUrl: record.sourceUrl,
    fullCredit: record.credit,
    kind: portrait
      ? 'portrait'
      : record.kind === 'document'
        ? 'document'
        : 'photo',
    ...(record.year !== undefined ? { year: record.year } : {}),
    ...(record.mono !== undefined ? { mono: record.mono } : {}),
    ...(record.crop ? { crop: record.crop } : {}),
    ...(portrait && record.dates ? { dates: record.dates } : {}),
    ...(portrait && record.role ? { role: record.role } : {}),
  };
  if (portrait)
    return {
      name: question.shows.name,
      kind: 'person',
      about: roleWords(question.query.role, 6) ?? 'a person of the story',
      ...(record.qid ? { qid: record.qid } : {}),
      picture,
    };
  // An event and a person go by the research's names for them; a place
  // and a thing by the desk's.
  const subject = clipWords(
    question.shows.kind === 'event' || question.shows.kind === 'person'
      ? question.query.name
      : (record.subject || question.query.name).split(',')[0],
    40,
  );
  const base = `photo:${subject}${record.year ? ` ${record.year}` : ''}`;
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base} (${n})`;
  return {
    name,
    kind: 'photo',
    about: aboutOf(question.shows, record, picture.source ?? ''),
    ...(record.qid ? { qid: record.qid } : {}),
    shows: question.shows,
    picture,
  };
}

/** What an episode's pass cleared: each entry with where a scene is offered it. */
export interface EpisodePictures {
  entries: { entry: RegistryEntry; offer: Offer }[];
}

/** The desk, as the pass asks it. */
export interface DeskLike {
  lookup(
    query: PictureQuery,
    opts?: { depth?: boolean; onUsage?: (usage: LlmUsage) => void },
  ): Promise<PictureRecord | null>;
  /** Every distinct picture a question brings (a person's portrait and photos of them); absent, lookup's one. */
  lookupAll?(
    query: PictureQuery,
    opts?: { depth?: boolean; onUsage?: (usage: LlmUsage) => void },
  ): Promise<PictureRecord[]>;
}

/** How many pictures of each kind a pass cleared. */
export function countsOf(
  pictures: EpisodePictures,
): Record<'portraits' | Shows['kind'], number> {
  const counts = { portraits: 0, person: 0, place: 0, event: 0, thing: 0 };
  for (const { entry } of pictures.entries)
    if (entry.kind === 'person') counts.portraits += 1;
    else if (entry.shows) counts[entry.shows.kind] += 1;
  return counts;
}

/**
 * The pass: every question asked in turn (the sources are asked one
 * request at a time anyway); a picture another question already brought
 * (a ceremony with two of the research's people in it) is used once.
 */
export async function deskPass(
  desk: DeskLike,
  input: PassInput,
  opts: {
    depth?: boolean;
    log?: (message: string) => void;
    /** Each model call the desk makes (its look at a picture), for the ledger. */
    onUsage?: (usage: LlmUsage) => void;
  } = {},
): Promise<EpisodePictures> {
  const entries: EpisodePictures['entries'] = [];
  const names = new Set<string>();
  const used = new Set<string>();
  // A file and its crop, or its copy under another name, are one picture:
  // by their titles, or by their prints when the titles differ.
  const titles = new Set<string>();
  const prints: string[] = [];
  for (const question of passQuestions(input)) {
    const ask = {
      depth: opts.depth ?? true,
      ...(opts.onUsage ? { onUsage: opts.onUsage } : {}),
    };
    const records = desk.lookupAll
      ? await desk.lookupAll(question.query, ask).catch(() => [])
      : [await desk.lookup(question.query, ask).catch(() => null)].filter(
          (r): r is PictureRecord => r !== null,
        );
    for (const record of records) {
      const title = titleKey(record.title ?? record.sourceId);
      if (
        used.has(record.id) ||
        (record.sha1 && used.has(record.sha1)) ||
        (title && titles.has(title)) ||
        prints.some((p) => samePicture(p, record.print))
      )
        continue;
      const entry = entryOf(question, record, names);
      if (names.has(entry.name)) continue;
      names.add(entry.name);
      used.add(record.id);
      if (record.sha1) used.add(record.sha1);
      if (title) titles.add(title);
      if (record.print) prints.push(record.print);
      entries.push({ entry, offer: question.offer });
      opts.log?.(`pictures: ${entry.name}: ${record.chip}`);
    }
  }
  return { entries };
}

/** Whether a scene's lines are about what a picture shows. */
function offered(
  offer: Offer,
  rows: readonly { say: string; claims?: readonly string[] }[],
): boolean {
  const said = rows.map((r) => r.say).join(' ');
  switch (offer.kind) {
    case 'person':
      return namesPerson(said, offer.name);
    case 'place':
      return ` ${textWords(said).join(' ')} `.includes(
        ` ${nameWords(offer.name).join(' ')} `,
      );
    case 'thing':
      return namesThing(said, offer.name);
    case 'event': {
      const claims = new Set(offer.claims);
      if (rows.some((r) => (r.claims ?? []).some((c) => claims.has(c))))
        return true;
      const words = stems(offer.words.join(' '));
      return rows.some(
        (r) =>
          yearsIn(r.say).includes(offer.year) &&
          [...stems(r.say)].some((w) => words.has(w)),
      );
    }
  }
}

/**
 * What a scene is offered: every portrait (the registry attaches one only
 * to a person the scene names), and each photo where the scene's lines are
 * about what it shows: the person or the place or the thing they name, the
 * event they rest on or say.
 */
export function picturesFor(
  rows: readonly { say: string; claims?: readonly string[] }[],
  pictures: EpisodePictures | null | undefined,
): RegistryEntry[] {
  if (!pictures) return [];
  return pictures.entries
    .filter(
      ({ entry, offer }) => entry.kind === 'person' || offered(offer, rows),
    )
    .map(({ entry }) => ({
      ...entry,
      ...(entry.picture ? { picture: { ...entry.picture } } : {}),
      ...(entry.shows ? { shows: { ...entry.shows } } : {}),
    }));
}

/** The heading the description's credits go under: replaced, never added twice, when the film is boarded again. */
export const CREDITS_HEADING = 'Picture credits:';

/** The description's credits: each picture the film shows, once, by its full credit. */
export function creditsBlock(credits: readonly string[]): string {
  const unique = [...new Set(credits.map((c) => c.trim()).filter(Boolean))];
  return unique.length
    ? [CREDITS_HEADING, ...unique.map((c) => `- ${c}`)].join('\n')
    : '';
}

/** A description with its picture credits at its foot (any earlier list of them replaced). */
export function withPictureCredits(
  description: string,
  credits: readonly string[],
): string {
  const at = description.indexOf(CREDITS_HEADING);
  const before = (at >= 0 ? description.slice(0, at) : description).trimEnd();
  const block = creditsBlock(credits);
  return [before, block].filter(Boolean).join('\n\n');
}
