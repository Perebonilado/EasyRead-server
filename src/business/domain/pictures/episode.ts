/**
 * One desk pass an episode (explainer-animation-tech §4.3; WP11): before
 * its scenes are boarded, the desk is asked once for each person of the
 * research and the world (a portrait), and for each real place the lines
 * name (an archive photo from the research's years). What clears becomes
 * registry entries: a portrait on its person's entry, a photo as a
 * `photo:` entry of its own. Each scene is then offered only what is about
 * it (picturesFor): a person's portrait attaches only to a person the
 * scene names, and a place's photo only where its lines name the place.
 * The episode's description lists every picture its film shows, with its
 * full credit (creditsBlock). Pure but for deskPass, which asks the desk.
 */
import { countriesNamed, placeNamed, placesIn } from '../scene-map-places';
import type {
  EditorClaim,
  EditorResearch,
  EditorWorld,
} from '../studio/studio-editor';
import type { RegistryEntry } from '../shots/types';
import { clipWords, roleWords } from './credit';
import { nameWords, textWords } from './match';
import type { PictureQuery, PictureRecord } from './types';

/** How many people and places one pass asks about (the research keeps 12 people). */
const PEOPLE_MOST = 12;
const PLACES_MOST = 8;
/** The years a place's photo may be asked for: the research's timeline's, at most this many. */
const YEARS_MOST = 8;

/** What the pass is made from. */
export interface PassInput {
  /** The episode's lines, every scene's, in order. */
  rows: readonly { say: string; claims: readonly string[] }[];
  research: EditorResearch | null;
  world: EditorWorld | null;
}

/** A question the pass asks, and what its answer becomes. */
export interface PassQuestion {
  query: PictureQuery;
  /** The registry name its picture goes under: a person's own, or a photo's. */
  for: 'portrait' | 'photo';
  /** The place a photo shows, for picturesFor: a scene is offered it only where its lines name it. */
  place?: string;
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

/** The questions an episode's pass asks: its people's portraits, and its places' photos from the research's years. */
export function passQuestions(input: PassInput): PassQuestion[] {
  const { research, world } = input;
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
    })),
    ...(world?.people ?? []).map((p) => ({
      name: p.name,
      role: p.role,
      said: p.role,
    })),
  ];
  for (const person of people) {
    const key = nameWords(person.name).join(' ');
    if (!key || seen.has(key) || out.length >= PEOPLE_MOST) continue;
    seen.add(key);
    // Their years: what their own notes, the claims naming them and the
    // timeline's events naming them say.
    const naming = claims.filter((c) => namesPerson(c.text, person.name));
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
    out.push({
      for: 'portrait',
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
  const years = [
    ...new Set((research?.timeline ?? []).flatMap((e) => yearsIn(e.date))),
  ]
    .sort((a, b) => a - b)
    .slice(0, YEARS_MOST);
  const names = people.map((p) => p.name);
  for (const place of placesNamed(input.rows, world, names)) {
    out.push({
      for: 'photo',
      place: place.name,
      query: {
        name: place.name,
        kind: 'place',
        geo: place.geo,
        ...(years.length ? { years } : {}),
        ...(place.country ? { place: [place.country] } : {}),
      },
    });
  }
  return out;
}

/** The address our copy is served at, relative to the API's root (the stage puts its base before it). */
export const pictureUrl = (id: string) => `studio/pictures/${id}`;
export const depthUrl = (id: string) => `studio/pictures/${id}/depth`;

/** A picture the pass cleared, as a registry entry: a person's portrait on their name, a photo under its own. */
export function entryOf(
  question: PassQuestion,
  record: PictureRecord,
): RegistryEntry {
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
    kind:
      question.for === 'portrait'
        ? 'portrait'
        : record.kind === 'document'
          ? 'document'
          : 'photo',
    ...(record.year !== undefined ? { year: record.year } : {}),
    ...(record.mono !== undefined ? { mono: record.mono } : {}),
    ...(record.crop ? { crop: record.crop } : {}),
    ...(record.dates ? { dates: record.dates } : {}),
    ...(record.role ? { role: record.role } : {}),
  };
  if (question.for === 'portrait')
    return {
      name: `person:${question.query.name}`,
      kind: 'person',
      about: roleWords(question.query.role, 6) ?? 'a person of the story',
      ...(record.qid ? { qid: record.qid } : {}),
      picture,
    };
  const subject = clipWords(record.subject || question.query.name, 40);
  return {
    name: `photo:${subject}${record.year ? ` ${record.year}` : ''}`,
    kind: 'photo',
    about: `an archive photo of ${question.place ?? subject}${record.year ? `, ${record.year}` : ''} (${picture.source})`,
    ...(record.qid ? { qid: record.qid } : {}),
    picture,
  };
}

/** What an episode's pass cleared: each entry with the place a photo shows. */
export interface EpisodePictures {
  entries: { entry: RegistryEntry; place?: string }[];
}

/** The desk, as the pass asks it. */
export interface DeskLike {
  lookup(
    query: PictureQuery,
    opts?: { depth?: boolean },
  ): Promise<PictureRecord | null>;
}

/** The pass: every question asked in turn (the sources are asked one request at a time anyway). */
export async function deskPass(
  desk: DeskLike,
  input: PassInput,
  opts: { depth?: boolean; log?: (message: string) => void } = {},
): Promise<EpisodePictures> {
  const entries: EpisodePictures['entries'] = [];
  const names = new Set<string>();
  for (const question of passQuestions(input)) {
    const record = await desk
      .lookup(question.query, { depth: opts.depth === true })
      .catch(() => null);
    if (!record) continue;
    const entry = entryOf(question, record);
    // Two photos of one subject and year read as one name: the second waits.
    if (names.has(entry.name)) continue;
    names.add(entry.name);
    entries.push({
      entry,
      ...(question.place ? { place: question.place } : {}),
    });
    opts.log?.(`pictures: ${entry.name}: ${record.chip}`);
  }
  return { entries };
}

/**
 * What a scene is offered: every portrait (the registry attaches one only
 * to a person the scene names), and a place's photo only where the
 * scene's lines name the place.
 */
export function picturesFor(
  rows: readonly { say: string }[],
  pictures: EpisodePictures | null | undefined,
): RegistryEntry[] {
  if (!pictures) return [];
  const said = ` ${textWords(rows.map((r) => r.say).join(' ')).join(' ')} `;
  return pictures.entries
    .filter(
      ({ entry, place }) =>
        entry.kind === 'person' ||
        !place ||
        said.includes(` ${nameWords(place).join(' ')} `),
    )
    .map(({ entry }) => ({
      ...entry,
      ...(entry.picture ? { picture: { ...entry.picture } } : {}),
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
