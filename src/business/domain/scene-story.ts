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
import { figureOf, type FigureSpec } from './scene-figure';
import {
  SCENE_AMBIENCES,
  type CharacterThing,
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

/** The kinds of voice a character may have: code picks the voice itself (scene-voice). */
export const STORY_VOICES = [
  'girl',
  'boy',
  'woman',
  'man',
  'old woman',
  'old man',
  'creature',
] as const;
export type StoryVoice = (typeof STORY_VOICES)[number];

const voiceKind = (voice: unknown): StoryVoice | null =>
  STORY_VOICES.includes(voice as StoryVoice) ? (voice as StoryVoice) : null;

/**
 * What a character is: a person, drawn by the kit like every person, or
 * an animal or a creature (a monster, a robot, a talking teapot), drawn
 * by the artist in the kit's style.
 */
export const STORY_KINDS = ['person', 'animal', 'creature'] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

/** An animal's or a creature's size beside people: a cat, a dog, a horse. */
export const STORY_SIZES = ['small', 'medium', 'large'] as const;
export type StorySize = (typeof STORY_SIZES)[number];

const kindOf = (kind: unknown): StoryKind | null =>
  STORY_KINDS.includes(kind as StoryKind) ? (kind as StoryKind) : null;
const sizeOf = (size: unknown): StorySize | null =>
  STORY_SIZES.includes(size as StorySize) ? (size as StorySize) : null;
/** A person's figure as said, made sound; anyone else has none. */
const figureFor = (kind: StoryKind | null, figure: unknown) =>
  kind === 'person' && figure && typeof figure === 'object'
    ? figureOf(figure)
    : null;

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
  /** The kind of voice their lines are said in; null for the narrator's. */
  voice: StoryVoice | null;
  /** What they are; absent from a book read before it was asked. */
  kind?: StoryKind | null;
  /** An animal's or a creature's size beside people. */
  size?: StorySize | null;
  /** A person's look, as the kit draws them: the same on every page. */
  figure?: FigureSpec | null;
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
    voice: StoryVoice | null;
    kind?: StoryKind | null;
    size?: StorySize | null;
    /** As the model said it; made sound by figureOf. */
    figure?: unknown;
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

/** What a character is, as a model said from the look kept for them. */
export interface FigureDraft {
  kind: StoryKind;
  size: StorySize | null;
  /** As the model said it; made sound by figureOf. */
  figure: unknown;
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

/**
 * What a place sounds like from how it looks, when the story did not say:
 * a fire burning, rain, water close by, wind. None for anywhere else.
 */
export function soundIn(look: string): SceneAmbience | null {
  if (
    /\b(?:fire|campfire|bonfire|fireplace|hearth|flames?|embers)\b/iu.test(look)
  )
    return 'fire';
  if (/\b(?:rain|raining|rainy|storm|stormy|downpour|drizzle)\b/iu.test(look))
    return 'rain';
  if (
    /\b(?:river|riverbank|sea|seaside|lake|ocean|pond|stream|beach|shore|waves|waterfall|harbou?r|quay)\b/iu.test(
      look,
    )
  )
    return 'water';
  if (/\b(?:windy|wind|breeze|breezy|gusts?|gale)\b/iu.test(look))
    return 'wind';
  return null;
}

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
        found.voice ??= voiceKind(raw.voice);
        // What someone is and how they look is settled where the book
        // first meets them: a later stretch fills in, never restyles.
        found.kind ??= kindOf(raw.kind);
        found.size ??= sizeOf(raw.size);
        found.figure ??= figureFor(found.kind, raw.figure);
        continue;
      }
      const kind = kindOf(raw.kind);
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
        voice: voiceKind(raw.voice),
        kind,
        size: sizeOf(raw.size),
        figure: figureFor(kind, raw.figure),
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
      voice: c.voice,
      kind: c.kind ?? null,
      size: c.size ?? null,
      figure: c.figure ?? null,
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
      voice: voiceKind(c.voice),
      kind: kindOf(c.kind),
      size: sizeOf(c.size),
      figure: figureFor(kindOf(c.kind), c.figure),
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
    const before = moodBefore(bible, who.id, page);
    return {
      ...thing,
      state: thing.state ?? before,
      met: who.met,
      intro: who.firstPage === page ? who.traits : [],
      traits: who.traits,
      first: who.firstPage === page,
      before,
    };
  });
  // A place in the cast: the writer's own for it, or added as the page's.
  const placed = (where: StoryPlace): string => {
    const shown = cast.find((t) => t.kind === 'place' && t.ref === where.id);
    if (shown) return shown.id;
    const taken = new Set(cast.map((t) => t.id));
    const id = taken.has(where.id) ? `place-${where.id}` : where.id;
    cast.push({
      id,
      kind: 'place',
      ref: where.id,
      name: where.name,
      sound: where.sound,
    });
    return id;
  };
  const here = placeOn(bible, page);
  const backdrop = here ? placed(here) : null;
  // Who comes back from the page before: on it and on this one, at most
  // three, the first met first, in the place they were.
  const back = cast
    .filter(
      (t): t is CharacterThing =>
        t.kind === 'character' &&
        Boolean(
          bible.pages
            .find((p) => p.page === page - 1)
            ?.present.some((one) => one.id === t.ref),
        ),
    )
    .sort((a, b) => a.met - b.met)
    .slice(0, OPENING_MOST);
  const there = back.length ? placeOn(bible, page - 1) : null;
  return {
    ...script,
    cast,
    backdrop,
    opening: back.length
      ? {
          show: back.map((t) => t.id),
          backdrop: there ? placed(there) : backdrop,
        }
      : null,
  };
}

/** The most characters a "previously" brings back, and how long the voice waits for it. */
export const OPENING_MOST = 3;
export const OPENING_LEAD_S = 2;

/** Where a page happens: the place the story puts it in, or none. */
export function placeOn(bible: StoryBible, page: number): StoryPlace | null {
  const id = bible.pages.find((p) => p.page === page)?.place;
  return id ? (bible.places.find((p) => p.id === id) ?? null) : null;
}

/**
 * How a set is painted to go with the people drawn by the kit: their flat
 * colours and dark outline, softer, so the people stand out in front of
 * it; and open ground low down, where they stand.
 */
export const SET_STYLE = [
  'Paint it to go with cartoon people drawn in front of it: flat colours with no gradients, shading or texture, simple rounded shapes like cut paper, and one dark outline (#2d2a32) about three units wide.',
  'Keep its colours softer and lighter than the people, so they stand out in front of it.',
  'The ground is flat and open across the lower third of the picture, with nothing tall in the middle of it, where people will stand.',
].join(' ');

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
      SET_STYLE,
    ].join(' '),
    motion:
      'slow and ambient if anything moves at all: clouds drift, water shimmers, leaves stir',
    parts: [],
    states: [],
    shape: 'wide',
    sound: place.sound,
  };
}

/** How an animal or a creature is drawn to stand beside the people the kit draws. */
export const CAST_STYLE = [
  'Draw it to stand beside cartoon people drawn in one style: flat colours with no gradients, shading or texture, simple rounded shapes like cut paper, one dark outline (#2d2a32) about three units wide, and big round white eyes with small black dot pupils.',
  'It faces the viewer, standing, its feet on the bottom edge of the frame.',
].join(' ');

const SIZES: Record<StorySize, string> = {
  small: 'It is small: beside a grown-up it would come up to their knee.',
  medium: "It is about as tall as a grown-up's waist.",
  large: 'It is as tall as a grown-up, or taller.',
};

/**
 * A character as the artist is asked to draw them, once for the book: an
 * animal or a creature, in the kit's style, a face with nothing on it,
 * and every expression drawn over it in the same place, so the stage can
 * change how they feel. People are drawn by the kit (scene-figure).
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
      'The whole figure, drawn so the same figure can stand on every page of the story.',
      CAST_STYLE,
      character.size ? SIZES[character.size] : '',
      'The face inside the head has no eyes, brows or mouth: each expression group draws the eyes, brows and mouth, all in the same place on the face.',
    ]
      .filter(Boolean)
      .join(' '),
    motion:
      'breathes slowly: the body rises and falls a little; nothing else moves',
    parts: SHEET_PARTS.map((name) => ({ name, label: false })),
    states: EXPRESSIONS.map((name) => ({
      name,
      look: EXPRESSION_LOOKS[name],
    })),
    // An animal on all fours needs the room across; a creature stands up.
    shape: character.kind === 'animal' ? 'square' : 'tall',
    sound: null,
  };
}
