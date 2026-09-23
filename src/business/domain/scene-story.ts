/**
 * A story's continuity, for teaching it as videos: who is in it, how each
 * looks and what each is like, where it happens, and who is on each page
 * and how they feel there.
 *
 * Made once a book: a small model reads each stretch of it and says who
 * and where it met, and code merges what it says, one name and its
 * aliases at a time. Kept beside the videos. Each character is then drawn
 * once, as a sheet with a face for every feeling (scene-sheet), and the
 * same drawing stands on every page they are on, the same way round
 * beside anyone else, with the face the last page left them with.
 */
import {
  SCENE_AMBIENCES,
  type DrawingThing,
  type SceneAmbience,
  type SceneScript,
} from './scene-script';

/** The faces a character is drawn with: one shown at a time. */
export const EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'afraid',
  'surprised',
  'thinking',
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** How each face looks, for the artist. */
export const EXPRESSION_LOOKS: Record<Expression, string> = {
  neutral: 'calm open eyes, level brows, a small closed mouth',
  happy: 'bright eyes, raised brows, a wide smile',
  sad: 'eyes looking down, brows raised in the middle, a down-turned mouth',
  angry: 'narrowed eyes, brows pulled down to the middle, a tight frown',
  afraid: 'wide eyes, brows raised and drawn together, a small open mouth',
  surprised: 'round wide eyes, high brows, a round open mouth',
  thinking:
    'eyes glancing up to one side, one brow raised, a small sideways mouth',
};

/** A character's parts, as every sheet names them. */
export const SHEET_PARTS = ['head', 'body', 'arms', 'legs'] as const;

export const STORY_ROLES = ['main', 'supporting', 'minor'] as const;
export type StoryRole = (typeof STORY_ROLES)[number];

export interface StoryCharacter {
  /** Theirs for the whole book: the writer shows them by it. */
  id: string;
  name: string;
  aliases: string[];
  role: StoryRole;
  /** How they look, for the artist: age, build, hair, skin, clothes, colours, marks. */
  look: string;
  /** Two or three words each on what they are like. */
  traits: string[];
  /** The page the book first meets them on. */
  firstPage: number;
  /**
   * Where they come in the order the book meets its characters, from 0.
   * On the stage whoever the book met first stands on the left, so any
   * two stand the same way round every time they meet.
   */
  met: number;
}

export interface StoryPlace {
  id: string;
  name: string;
  aliases: string[];
  look: string;
  firstPage: number;
  /** What the place sounds like while the story is there, or null. */
  sound: SceneAmbience | null;
}

export interface StoryPage {
  page: number;
  /** What happens, in a sentence. */
  summary: string;
  /** Who is there, and how each feels. */
  present: { id: string; mood: Expression }[];
  /** Where it happens: a place's id. */
  place: string | null;
}

export interface StoryBible {
  characters: StoryCharacter[];
  places: StoryPlace[];
  pages: StoryPage[];
}

/** What the model says of one stretch of the book, by names. */
export interface StoryDraft {
  characters: {
    name: string;
    aliases: string[];
    role: StoryRole;
    look: string;
    traits: string[];
  }[];
  places: {
    name: string;
    aliases: string[];
    look: string;
    sound: SceneAmbience | null;
  }[];
  pages: {
    page: number;
    summary: string;
    present: { name: string; mood: Expression }[];
    place: string | null;
  }[];
}

export const EMPTY_STORY: StoryBible = {
  characters: [],
  places: [],
  pages: [],
};

/** The most characters and places a book keeps: beyond them, the crowd and the scenery. */
export const MAX_CHARACTERS = 24;
export const MAX_PLACES = 16;
const MAX_TRAITS = 3;
const MAX_ALIASES = 6;
/** The most characters the writer is told of on one page. */
const MAX_ON_PAGE = 8;

/** The most of a book the model reads at once, and the most stretches a book is read in. */
export const STORY_PIECE_CHARS = 40_000;
export const MAX_STORY_PIECES = 24;

/** Where a document's story and its characters' drawings are kept: beside its videos, for each content version. */
export const storyKey = (documentId: string, contentVersion: number) =>
  `documents/${documentId}/visuals/v${contentVersion}/story.json`;
export const castKey = (documentId: string, contentVersion: number) =>
  `documents/${documentId}/visuals/v${contentVersion}/cast.json`;
export const setsKey = (documentId: string, contentVersion: number) =>
  `documents/${documentId}/visuals/v${contentVersion}/sets.json`;

/** A set's canvas: the wide stage's own shape, so it covers it whole. */
export const SET_CANVAS = { w: 1600, h: 900 } as const;

const soundOf = (sound: unknown): SceneAmbience | null =>
  SCENE_AMBIENCES.includes(sound as SceneAmbience)
    ? (sound as SceneAmbience)
    : null;

const clean = (text: string | null | undefined) =>
  (text ?? '').replace(/\s+/g, ' ').trim();

/** Words that say what someone is called, not who they are. */
const TITLES = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'mister',
  'madam',
  'dr',
  'doctor',
  'sir',
]);

/** A name reduced to what identifies it: no case, accents, punctuation, or titles. */
export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words[0] === 'the' && words.length > 1) words.shift();
  const kept = words.filter((word) => !TITLES.has(word));
  return (kept.length ? kept : words).join(' ');
}

/** A safe id from a name, not one already taken. */
function idFrom(name: string, taken: Set<string>): string {
  const base =
    nameKey(name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'someone';
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

interface Named {
  keys: Set<string>;
}

/**
 * The one entry a name belongs to: the one it is a name or alias of, or
 * failing that the only one whose name holds all its words or all of
 * whose words it holds ("Jack" and "Jack Merridew").
 */
function findNamed<T extends Named>(entries: T[], names: string[]): T | null {
  const keys = names.map(nameKey).filter(Boolean);
  const exact = entries.find((entry) => keys.some((k) => entry.keys.has(k)));
  if (exact) return exact;
  const within = (a: string, b: string) => {
    const words = new Set(b.split(' '));
    return a.split(' ').every((word) => words.has(word));
  };
  const loose = entries.filter((entry) =>
    keys.some((k) =>
      [...entry.keys].some((known) => within(k, known) || within(known, k)),
    ),
  );
  return loose.length === 1 ? loose[0] : null;
}

const RANK: Record<StoryRole, number> = { main: 0, supporting: 1, minor: 2 };

/** The longer of two descriptions, within reason: later chapters often say more. */
const fuller = (a: string, b: string) =>
  (b.length > a.length ? b : a).slice(0, 400);

/**
 * What the model said of each stretch, merged into one bible: each
 * character and place once, whatever each stretch called them, with the
 * fullest look and their first page; the pages in order, their people
 * found by name, and each character's place in the order the book meets
 * them.
 */
export function mergeStory(
  parts: { from: number; to: number; draft: StoryDraft }[],
): StoryBible {
  const takenIds = new Set<string>();
  // Each with the stretch it was first named in, for one never found on a page.
  const characters: (StoryCharacter &
    Named & { order: number; named: number })[] = [];
  const places: (StoryPlace & Named & { named: number })[] = [];
  const pages = new Map<number, StoryPage>();
  const sorted = [...parts].sort((a, b) => a.from - b.from);
  let order = 0;
  for (const part of sorted) {
    for (const raw of part.draft.characters) {
      const name = clean(raw.name);
      if (!name) continue;
      const aliases = (raw.aliases ?? []).map(clean).filter(Boolean);
      const found = findNamed(characters, [name, ...aliases]);
      const traits = (raw.traits ?? [])
        .map((trait) => clean(trait).slice(0, 40))
        .filter(Boolean);
      const role = STORY_ROLES.includes(raw.role) ? raw.role : 'minor';
      if (found) {
        for (const key of [name, ...aliases].map(nameKey).filter(Boolean))
          found.keys.add(key);
        found.aliases = [...new Set([...found.aliases, name, ...aliases])]
          .filter((alias) => alias !== found.name)
          .slice(0, MAX_ALIASES);
        found.look = fuller(found.look, clean(raw.look));
        found.traits = [...new Set([...found.traits, ...traits])].slice(
          0,
          MAX_TRAITS,
        );
        if (RANK[role] < RANK[found.role]) found.role = role;
        continue;
      }
      characters.push({
        id: idFrom(name, takenIds),
        name,
        aliases: aliases
          .filter((alias) => alias !== name)
          .slice(0, MAX_ALIASES),
        role,
        look: clean(raw.look).slice(0, 400),
        traits: [...new Set(traits)].slice(0, MAX_TRAITS),
        firstPage: Number.POSITIVE_INFINITY,
        met: 0,
        keys: new Set([name, ...aliases].map(nameKey).filter(Boolean)),
        order: order++,
        named: part.from,
      });
    }
    for (const raw of part.draft.places) {
      const name = clean(raw.name);
      if (!name) continue;
      const aliases = (raw.aliases ?? []).map(clean).filter(Boolean);
      const found = findNamed(places, [name, ...aliases]);
      if (found) {
        for (const key of [name, ...aliases].map(nameKey).filter(Boolean))
          found.keys.add(key);
        found.look = fuller(found.look, clean(raw.look));
        found.sound ??= soundOf(raw.sound);
        continue;
      }
      places.push({
        id: idFrom(name, takenIds),
        name,
        aliases: aliases
          .filter((alias) => alias !== name)
          .slice(0, MAX_ALIASES),
        look: clean(raw.look).slice(0, 400),
        firstPage: Number.POSITIVE_INFINITY,
        sound: soundOf(raw.sound),
        keys: new Set([name, ...aliases].map(nameKey).filter(Boolean)),
        named: part.from,
      });
    }
    for (const raw of part.draft.pages) {
      const page = Math.round(raw.page);
      if (!(page >= part.from && page <= part.to)) continue;
      const present: StoryPage['present'] = [];
      for (const one of raw.present ?? []) {
        const who = findNamed(characters, [clean(one.name)]);
        if (!who || present.some((p) => p.id === who.id)) continue;
        present.push({
          id: who.id,
          mood: EXPRESSIONS.includes(one.mood) ? one.mood : 'neutral',
        });
        // The book meets them where they are first on a page.
        who.firstPage = Math.min(who.firstPage, page);
      }
      const where = raw.place ? findNamed(places, [clean(raw.place)]) : null;
      if (where) where.firstPage = Math.min(where.firstPage, page);
      pages.set(page, {
        page,
        summary: clean(raw.summary).slice(0, 300),
        present,
        place: where?.id ?? null,
      });
    }
  }
  for (const one of [...characters, ...places])
    if (!Number.isFinite(one.firstPage)) one.firstPage = one.named;
  // The ones the book cannot do without, when there are too many.
  const onPages = (id: string) =>
    [...pages.values()].filter((p) => p.present.some((one) => one.id === id))
      .length;
  const kept = [...characters]
    .sort(
      (a, b) =>
        RANK[a.role] - RANK[b.role] ||
        onPages(b.id) - onPages(a.id) ||
        a.order - b.order,
    )
    .slice(0, MAX_CHARACTERS);
  const keptIds = new Set(kept.map((c) => c.id));
  kept
    .sort((a, b) => a.firstPage - b.firstPage || a.order - b.order)
    .forEach((character, i) => {
      character.met = i;
    });
  return {
    characters: kept.map((c) => ({
      id: c.id,
      name: c.name,
      aliases: c.aliases,
      role: c.role,
      look: c.look,
      traits: c.traits,
      firstPage: c.firstPage,
      met: c.met,
    })),
    places: places
      .sort((a, b) => a.firstPage - b.firstPage)
      .slice(0, MAX_PLACES)
      .map((p) => ({
        id: p.id,
        name: p.name,
        aliases: p.aliases,
        look: p.look,
        firstPage: p.firstPage,
        sound: p.sound,
      })),
    pages: [...pages.values()]
      .sort((a, b) => a.page - b.page)
      .map((page) => ({
        ...page,
        present: page.present.filter((one) => keptIds.has(one.id)),
      })),
  };
}

/** A bible read back from storage made sound: known roles and moods only. */
export function bibleOf(
  raw: Partial<StoryBible> | null | undefined,
): StoryBible {
  if (!raw) return EMPTY_STORY;
  const characters = (raw.characters ?? [])
    .filter((c) => c && clean(c.id) && clean(c.name))
    .map((c) => ({
      id: clean(c.id),
      name: clean(c.name),
      aliases: (c.aliases ?? []).map(clean).filter(Boolean),
      role: STORY_ROLES.includes(c.role) ? c.role : ('minor' as const),
      look: clean(c.look),
      traits: (c.traits ?? []).map(clean).filter(Boolean).slice(0, MAX_TRAITS),
      firstPage: Number.isFinite(c.firstPage) ? c.firstPage : 1,
      met: Number.isFinite(c.met) ? c.met : Number.MAX_SAFE_INTEGER,
    }));
  const known = new Set(characters.map((c) => c.id));
  return {
    characters,
    places: (raw.places ?? [])
      .filter((p) => p && clean(p.id) && clean(p.name))
      .map((p) => ({
        id: clean(p.id),
        name: clean(p.name),
        aliases: (p.aliases ?? []).map(clean).filter(Boolean),
        look: clean(p.look),
        firstPage: Number.isFinite(p.firstPage) ? p.firstPage : 1,
        sound: soundOf(p.sound),
      })),
    pages: (raw.pages ?? []).map((p) => ({
      page: p.page,
      summary: clean(p.summary),
      present: (p.present ?? []).filter(
        (one) => known.has(one.id) && EXPRESSIONS.includes(one.mood),
      ),
      place: p.place ?? null,
    })),
  };
}

/** How a character feels as a page starts: as the last page they were on left them. */
export function moodBefore(
  bible: StoryBible,
  id: string,
  page: number,
): Expression {
  const before = bible.pages
    .filter((p) => p.page < page)
    .reverse()
    .find((p) => p.present.some((one) => one.id === id));
  return before?.present.find((one) => one.id === id)?.mood ?? 'neutral';
}

/** Who the writer is told of on a page: who is on it, else the book's main characters. */
export function charactersOn(
  bible: StoryBible,
  page: number,
): StoryCharacter[] {
  const here = bible.pages.find((p) => p.page === page);
  const ids = here?.present.length
    ? here.present.map((one) => one.id)
    : bible.characters
        .filter((c) => c.role === 'main' && c.firstPage <= page)
        .map((c) => c.id);
  return ids
    .map((id) => bible.characters.find((c) => c.id === id))
    .filter((c): c is StoryCharacter => Boolean(c))
    .slice(0, MAX_ON_PAGE);
}

/**
 * The story as the writer is told it for one page: its characters, each
 * with what they are like, how they feel as the page starts and on it,
 * and whether the book first meets them here; and where it happens.
 */
export function describeStory(bible: StoryBible, page: number): string {
  const here = bible.pages.find((p) => p.page === page);
  const people = charactersOn(bible, page);
  if (!people.length) return '';
  const lines = people.map((c) => {
    const mood = here?.present.find((one) => one.id === c.id)?.mood;
    return [
      `- ${c.id}: ${c.name}${c.aliases.length ? ` (also ${c.aliases.slice(0, 3).join(', ')})` : ''}`,
      c.traits.length ? `, ${c.traits.join(', ')}` : '',
      `. Starts the page ${moodBefore(bible, c.id, page)}`,
      mood ? `; on it mostly ${mood}` : '',
      c.firstPage === page
        ? '. The book meets them for the first time here'
        : '',
      '.',
    ].join('');
  });
  const place = placeOn(bible, page);
  // The places the story has reached by this page, the page's own first.
  const places = [
    ...(place ? [place] : []),
    ...bible.places.filter((p) => p.firstPage <= page && p.id !== place?.id),
  ].slice(0, MAX_ON_PAGE);
  return [
    'The story\'s characters on this page (show one as kind "character" with its id as ref):',
    ...lines,
    places.length
      ? 'The story\'s places (show one as kind "place" with its id as ref; it becomes the scene behind the stage):'
      : '',
    ...places.map(
      (p) =>
        `- ${p.id}: ${p.name}${p === place ? ', where this page happens: behind the stage from the start' : ''}.`,
    ),
    here?.summary ? `What happens: ${here.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * A book's pages in the stretches the model reads them in: whole pages,
 * each marked with its number, no stretch longer than `most` characters.
 */
export function storyPieces(
  pages: { page: number; text: string }[],
  most = STORY_PIECE_CHARS,
): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = [];
  let current: { page: number; text: string }[] = [];
  let length = 0;
  const flush = () => {
    if (!current.length) return;
    out.push({
      from: current[0].page,
      to: current[current.length - 1].page,
      text: current.map((p) => `[page ${p.page}]\n${p.text}`).join('\n\n'),
    });
    current = [];
    length = 0;
  };
  for (const one of [...pages].sort((a, b) => a.page - b.page)) {
    const text = one.text.trim().slice(0, most);
    if (!text) continue;
    if (length + text.length > most) flush();
    current.push({ page: one.page, text });
    length += text.length + 16;
  }
  flush();
  return out;
}

/**
 * The page's characters made whole from the story: the order they keep,
 * the face each comes on with (the writer's, else the one the last page
 * left them with), and on the page the book meets them, what they are
 * like. And the page's own place, the scene behind the stage until the
 * writer shows another.
 */
export function castStory(
  script: SceneScript,
  bible: StoryBible,
  page: number,
): SceneScript {
  const cast: SceneScript['cast'] = script.cast.map((thing) => {
    if (thing.kind !== 'character') return thing;
    const who = bible.characters.find((c) => c.id === thing.ref);
    if (!who) return thing;
    return {
      ...thing,
      state: thing.state ?? moodBefore(bible, who.id, page),
      met: who.met,
      intro: who.firstPage === page ? who.traits : [],
    };
  });
  const here = placeOn(bible, page);
  let backdrop: string | null = null;
  if (here) {
    const shown = cast.find((t) => t.kind === 'place' && t.ref === here.id);
    if (shown) backdrop = shown.id;
    else {
      const taken = new Set(cast.map((t) => t.id));
      backdrop = taken.has(here.id) ? `place-${here.id}` : here.id;
      cast.push({
        id: backdrop,
        kind: 'place',
        ref: here.id,
        name: here.name,
        sound: here.sound,
      });
    }
  }
  return { ...script, cast, backdrop };
}

/** Where a page happens: the place the story puts it in, or none. */
export function placeOn(bible: StoryBible, page: number): StoryPlace | null {
  const id = bible.pages.find((p) => p.page === page)?.place;
  return id ? (bible.places.find((p) => p.id === id) ?? null) : null;
}

/**
 * A place as the artist is asked to paint it, once for the book: the
 * scene behind the stage, filling the frame, with no one in it.
 */
export function setThing(place: StoryPlace, bookTitle: string): DrawingThing {
  return {
    id: place.id,
    kind: 'drawing',
    name: place.name,
    brief: [
      `${place.name}, a place in "${bookTitle}"${place.look ? `: ${place.look}` : ''}.`,
      'Seen from where a viewer stands, at eye level, the ground running across the lower part of the picture.',
    ].join(' '),
    motion:
      'slow and ambient if anything moves at all: clouds drift, water shimmers, leaves stir',
    parts: [],
    states: [],
    shape: 'wide',
    sound: place.sound,
  };
}

/**
 * A character as the artist is asked to draw them, once for the book: the
 * whole figure, a face with nothing on it, and every expression drawn
 * over it in the same place, so the stage can change how they feel.
 */
export function sheetThing(
  character: StoryCharacter,
  bookTitle: string,
): DrawingThing {
  return {
    id: character.id,
    kind: 'drawing',
    name: character.name,
    brief: [
      `${character.name}, a character in "${bookTitle}"${character.look ? `: ${character.look}` : ''}.`,
      'The whole figure, standing, turned a little toward the viewer, in a friendly flat picture-book style, drawn so the same figure can stand on every page of the story.',
      'The face inside the head has no eyes, brows or mouth: each expression group draws the eyes, brows and mouth, all in the same place on the face.',
    ].join(' '),
    motion:
      'breathes slowly: the body rises and falls a little; nothing else moves',
    parts: SHEET_PARTS.map((name) => ({ name, label: false })),
    states: EXPRESSIONS.map((name) => ({
      name,
      look: EXPRESSION_LOOKS[name],
    })),
    shape: 'tall',
    sound: null,
  };
}
