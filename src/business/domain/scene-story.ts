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
import { figureOf, type FigureProp, type FigureSpec } from './scene-figure';
import { iconicOf } from './scene-iconic';
import { setApart } from './scene-looks';
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

/**
 * The kinds of voice a character may have: code picks the voice itself
 * (scene-voice). "divine" is God's, or a god's: deep, calm, unhurried;
 * "crowd" is many people speaking as one.
 */
export const STORY_VOICES = [
  'girl',
  'boy',
  'woman',
  'man',
  'old woman',
  'old man',
  'creature',
  'divine',
  'crowd',
] as const;
export type StoryVoice = (typeof STORY_VOICES)[number];

const voiceKind = (voice: unknown): StoryVoice | null =>
  STORY_VOICES.includes(voice as StoryVoice) ? (voice as StoryVoice) : null;

/**
 * What a character is: a person, drawn by the kit like every person, or
 * an animal or a creature (a monster, a robot, a talking teapot), drawn
 * by the artist in the kit's style; or a group who act and speak as one
 * (the crowd, the disciples, the soldiers), a crowd on the stage.
 */
export const STORY_KINDS = ['person', 'animal', 'creature', 'group'] as const;
export type StoryKind = (typeof STORY_KINDS)[number];

/**
 * Whether a character is seen. "seen": on the stage when they are there.
 * "heard": only ever a voice, off the stage, on a phone, in a letter.
 * "above": a voice from heaven or the sky, God's; light falls from the
 * top of the stage as they speak. "light": someone the text's own
 * tradition never draws: a soft light stands where they are, and the
 * narrator says their words. Only "seen" and "light" stand on the stage.
 */
export const STORY_PRESENCES = ['seen', 'heard', 'above', 'light'] as const;
export type StoryPresence = (typeof STORY_PRESENCES)[number];

/** An animal's or a creature's size beside people: a cat, a dog, a horse. */
export const STORY_SIZES = ['small', 'medium', 'large'] as const;
export type StorySize = (typeof STORY_SIZES)[number];

const kindOf = (kind: unknown): StoryKind | null =>
  STORY_KINDS.includes(kind as StoryKind) ? (kind as StoryKind) : null;
const presenceKind = (presence: unknown): StoryPresence | null =>
  STORY_PRESENCES.includes(presence as StoryPresence)
    ? (presence as StoryPresence)
    : null;

/**
 * Names that are God's, whatever the story calls them: never drawn, a
 * voice from above. Only names that could be no one else ("the Lord"
 * could be a lord of the manor, so only as one of God's other names).
 */
const GOD =
  /^(?:god|lord god|god almighty|almighty god|almighty|lord almighty|lord of hosts|yahweh|jehovah|allah|elohim|adonai|god the father|heavenly father|most high)$/u;

/** Whether a character is God, by any of their names. */
export function isGod(names: readonly string[]): boolean {
  return names.some((name) =>
    GOD.test(
      name
        .toLowerCase()
        .replace(/[^\p{L}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^the /u, ''),
    ),
  );
}

/**
 * How a character is present, made sound: God is never drawn, whatever
 * the reader said; someone seen anywhere in the book is seen, and one
 * kept from drawing (above, light) stays so.
 */
export function presenceFor(
  names: readonly string[],
  said: StoryPresence | null | undefined,
  before?: StoryPresence | null,
): StoryPresence {
  if (isGod(names)) return 'above';
  const ranked = [before, said].filter((p): p is StoryPresence => Boolean(p));
  if (ranked.includes('light')) return 'light';
  if (ranked.includes('above')) return 'above';
  if (ranked.includes('seen')) return 'seen';
  return ranked[0] ?? 'seen';
}

/**
 * Whether a character stands on the stage when they are there: someone
 * seen, or a light where they are. A voice never does, and a group is a
 * crowd behind the stage, never one of its things.
 */
export const standsOnStage = (character: {
  presence?: StoryPresence | null;
  kind?: StoryKind | null;
}) =>
  (character.presence ?? 'seen') !== 'heard' &&
  character.presence !== 'above' &&
  character.kind !== 'group';

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
  /** Whether they are seen or only heard; absent from a book read before it was asked: seen. */
  presence?: StoryPresence | null;
  /** A well-known figure (scene-iconic), drawn as their tradition shows them: its key. */
  iconic?: string | null;
  /** What they carry when the page gives them nothing else: Moses's staff. */
  carries?: FigureProp | null;
  /** The figure's fields the text itself says: never changed to set them apart. */
  fromText?: string[] | null;
}

/** What a place is: out of doors, a room, or something people ride in (a boat, a cart). */
export const PLACE_KINDS = ['outdoor', 'indoor', 'vessel'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];
/** How people are in a place: standing on its ground, or in it, behind its side (a boat, a room behind a table). */
export const PLACE_STANDS = ['on', 'in'] as const;
export type PlaceStand = (typeof PLACE_STANDS)[number];
/** When a page happens, as the light shows it. */
export const STORY_TIMES = ['dawn', 'day', 'dusk', 'night'] as const;
export type StoryTime = (typeof STORY_TIMES)[number];
/** The weather a page happens in. */
export const STORY_WEATHERS = [
  'clear',
  'rain',
  'storm',
  'wind',
  'snow',
  'fog',
] as const;
export type StoryWeather = (typeof STORY_WEATHERS)[number];
/** How busy a page is: no one else, a few people, or a crowd. */
export const STORY_CROWDS = ['none', 'few', 'many'] as const;
export type StoryCrowd = (typeof STORY_CROWDS)[number];

/**
 * The story's world, read once for the book: when and where it happens,
 * its people's culture, the land, and what homes and streets look like.
 * Clothes, sets and crowds are all dressed for it.
 */
export interface StoryWorld {
  /** "first century AD", "today", "the 1960s". */
  era: string;
  /** "Galilee", "a Yoruba town in south-west Nigeria". */
  region: string;
  /** "Jewish villagers and fishermen", "Yoruba". */
  culture: string;
  /** "dry hills, olive trees and a large lake". */
  landscape: string;
  /** "flat-roofed stone houses, fishing boats", "compounds of mud-brick houses". */
  homes: string;
}

export interface StoryPlace {
  id: string;
  name: string;
  aliases: string[];
  look: string;
  firstPage: number;
  /** What the place sounds like while the story is there, or null. */
  sound: SceneAmbience | null;
  /** Out of doors, a room, or a vessel; absent from a book read before it was asked. */
  kind?: PlaceKind | null;
  /** How people are in it: on its ground, or in it behind its side. */
  stand?: PlaceStand | null;
  /** What stands in front of people's legs there: the boat's side, a table, a wall; null for nothing. */
  front?: string | null;
  /** Worked out from what happens there, not said by the text: general, and shared. */
  inferred?: boolean;
}

export interface StoryPage {
  page: number;
  /** What happens, in a sentence. */
  summary: string;
  /** Who is there, and how each feels. */
  present: { id: string; mood: Expression }[];
  /** Where it happens: a place's id. */
  place: string | null;
  /** Whether where it happens was worked out rather than said. */
  placeInferred?: boolean;
  /** When it happens, as the light shows it; null where nothing says. */
  time?: StoryTime | null;
  weather?: StoryWeather | null;
  /** How many other people are about: a crowd is drawn behind the story's own. */
  crowd?: StoryCrowd | null;
}

/**
 * How a story is read now. 2: its world, where each page happens (worked
 * out where the text does not say), its time and weather and crowd, what
 * stands in front in a place, heard speakers and well-known figures. A
 * book read before is read again once, on its next page (not a very long
 * one, unasked).
 */
export const STORY_VERSION = 3;

export interface StoryBible {
  characters: StoryCharacter[];
  places: StoryPlace[];
  pages: StoryPage[];
  /** The story's world; absent from a book read before it was asked. */
  world?: StoryWorld | null;
  /** How it was read (STORY_VERSION); absent, before the world was read. */
  version?: number;
  /** The book's own title and author, as its first pages give them. */
  title?: string | null;
  author?: string | null;
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
    presence?: StoryPresence | null;
    /** A well-known figure, as their tradition draws them. */
    iconic?: boolean | null;
    /** The figure's fields the text says. */
    fromText?: string[] | null;
  }[];
  places: {
    name: string;
    aliases: string[];
    look: string;
    sound: SceneAmbience | null;
    kind?: PlaceKind | null;
    stand?: PlaceStand | null;
    front?: string | null;
  }[];
  pages: {
    page: number;
    summary: string;
    present: { name: string; mood: Expression }[];
    place: string | null;
    placeInferred?: boolean | null;
    time?: StoryTime | null;
    weather?: StoryWeather | null;
    crowd?: StoryCrowd | null;
  }[];
  /** The story's world, as this stretch shows it; null where it cannot tell. */
  world?: StoryWorld | null;
  /** The book's title and author, where this stretch shows them. */
  book?: { title: string | null; author: string | null } | null;
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

/** A book's name from its file's: "001-HIDE-AND-SEEK-Free-Childrens-Book" as "Hide And Seek Free Childrens Book". */
function titleFromFile(file: string): string {
  const words = file
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s*\d+\s+/, '')
    .trim()
    .split(/\s+/);
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * A story book's first page, when it comes before the story: a title
 * card. Its title set large, and the narrator saying it with its author.
 * Made by code: a title page has no story for the writer to play, and
 * its characters reading out its credits was the wrong way round.
 */
export function titleCard(bible: StoryBible, file: string): SceneScript {
  const title = bible.title || titleFromFile(file);
  return {
    fit: 'good',
    fitReason: null,
    title,
    mood: 'bright',
    beats: [
      {
        say: bible.author ? `${title}, by ${bible.author}.` : `${title}.`,
        pause: 'long',
        delivery: 'explain',
        kind: 'narration',
      },
    ],
    cast: [{ id: 'book-title', kind: 'words', text: title, style: 'title' }],
    steps: [
      {
        at: { beat: 0, phrase: '' },
        word: 0,
        stage: { layout: 'one', show: ['book-title'], arrows: [] },
        effects: [],
      },
    ],
  };
}

/** Whether a page comes before a story's first page or after its last: its front or back matter. */
export function outsideStory(bible: StoryBible, page: number): boolean {
  const pages = bible.pages.map((p) => p.page);
  if (!pages.length) return false;
  return page < Math.min(...pages) || page > Math.max(...pages);
}

/** The most characters and places a book keeps: beyond them, the crowd and the scenery. */
export const MAX_CHARACTERS = 40;
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

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): T | null =>
    list.includes(value as T) ? (value as T) : null;
const placeKindOf = oneOf(PLACE_KINDS);
const standOf = oneOf(PLACE_STANDS);
const timeOf = oneOf(STORY_TIMES);
const weatherOf = oneOf(STORY_WEATHERS);
const crowdOf = oneOf(STORY_CROWDS);

/** A world as the reader said it, made sound: every field some words, or none at all. */
function worldOf(raw: unknown): StoryWorld | null {
  if (!raw || typeof raw !== 'object') return null;
  const said = raw as Record<string, unknown>;
  const field = (key: string) =>
    typeof said[key] === 'string' ? clean(said[key]).slice(0, 160) : '';
  const world = {
    era: field('era'),
    region: field('region'),
    culture: field('culture'),
    landscape: field('landscape'),
    homes: field('homes'),
  };
  return Object.values(world).some(Boolean) ? world : null;
}

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
  /** The stretch the entry was first named in. */
  named: number;
}

/**
 * Words that say whom someone is to someone else, not who they are: a
 * name with one of these names two people ("Mark's father", "the mother
 * of Jesus", "Joseph, husband to Mary") and is never the other's.
 */
const RELATION = new Set([
  'of',
  'to',
  'husband',
  'wife',
  'widow',
  'mother',
  'father',
  'mum',
  'mom',
  'dad',
  'son',
  'daughter',
  'brother',
  'sister',
  'uncle',
  'aunt',
  'cousin',
  'nephew',
  'niece',
  'grandmother',
  'grandfather',
  'grandma',
  'grandpa',
  'granny',
  'nana',
  'in',
  'law',
  'friend',
  'friends',
  'servant',
  'slave',
  'master',
  'child',
  'children',
  'baby',
  'followers',
  'disciples',
]);

/** Whether a name (as nameKey reads it) names someone by whom they are to another. */
const relational = (key: string) => {
  const words = key.split(' ');
  // "mark s father": the possessive's s, standing alone.
  return words.length > 1 && words.some((w) => w === 's' || RELATION.has(w));
};

/** Whether a's words begin or end b's: "jack" in "jack merridew", "herod" in "king herod". */
const edgeOf = (a: string, b: string) => {
  const x = a.split(' ');
  const y = b.split(' ');
  if (x.length >= y.length) return false;
  const start = x.every((word, i) => y[i] === word);
  const end = x.every((word, i) => y[y.length - x.length + i] === word);
  return start || end;
};

/**
 * The one entry a name belongs to: the one it is a name or alias of; or,
 * failing that, the only one it is a shorter or fuller form of ("Jack" and
 * "Jack Merridew", "Herod" and "King Herod"). Never by a name that names
 * someone by whom they are to another ("Mark's father" is not Mark, "the
 * mother of Jesus" is not Jesus), and never one first named in the same
 * stretch: the reader listed them apart, as two.
 */
function findNamed<T extends Named>(
  entries: T[],
  names: string[],
  stretch: number,
): T | null {
  const keys = names.map(nameKey).filter(Boolean);
  const exact = entries.find((entry) => keys.some((k) => entry.keys.has(k)));
  if (exact) return exact;
  const loose = entries.filter(
    (entry) =>
      entry.named !== stretch &&
      keys.some(
        (k) =>
          !relational(k) &&
          [...entry.keys].some(
            (known) =>
              !relational(known) && (edgeOf(k, known) || edgeOf(known, k)),
          ),
      ),
  );
  return loose.length === 1 ? loose[0] : null;
}

/**
 * A stretch's characters with no one's name among another's aliases: a
 * reader that lists Mary, and gives "Mary" as another name of Jesus too,
 * means two people.
 */
function aliasesApart<T extends { name: string; aliases?: string[] | null }>(
  list: readonly T[],
): T[] {
  const names = new Map(list.map((one) => [nameKey(clean(one.name)), one]));
  return list.map((one) => ({
    ...one,
    aliases: (one.aliases ?? []).filter((alias) => {
      const other = names.get(nameKey(clean(alias)));
      return !other || other === one;
    }),
  }));
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
    Named & { order: number; named: number; marked: boolean })[] = [];
  const places: (StoryPlace & Named & { named: number })[] = [];
  const pages = new Map<number, StoryPage>();
  const sorted = [...parts].sort((a, b) => a.from - b.from);
  // The world as the first stretch that could tell it says; the book's
  // title and author as its first pages give them.
  const world =
    sorted.map((part) => worldOf(part.draft.world)).find(Boolean) ?? null;
  const title =
    sorted.map((part) => clean(part.draft.book?.title)).find(Boolean) ?? null;
  const author =
    sorted.map((part) => clean(part.draft.book?.author)).find(Boolean) ?? null;
  let order = 0;
  for (const part of sorted) {
    for (const raw of aliasesApart(part.draft.characters)) {
      const name = clean(raw.name);
      if (!name) continue;
      const aliases = (raw.aliases ?? []).map(clean).filter(Boolean);
      const found = findNamed(characters, [name, ...aliases], part.from);
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
        found.presence = presenceFor(
          [found.name, ...found.aliases],
          presenceKind(raw.presence),
          found.presence,
        );
        found.marked ||= Boolean(raw.iconic);
        found.fromText = [
          ...new Set([...(found.fromText ?? []), ...(raw.fromText ?? [])]),
        ];
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
        presence: presenceFor([name, ...aliases], presenceKind(raw.presence)),
        marked: Boolean(raw.iconic),
        fromText: [...new Set(raw.fromText ?? [])],
        keys: new Set([name, ...aliases].map(nameKey).filter(Boolean)),
        order: order++,
        named: part.from,
      });
    }
    for (const raw of aliasesApart(part.draft.places)) {
      const name = clean(raw.name);
      if (!name) continue;
      const aliases = (raw.aliases ?? []).map(clean).filter(Boolean);
      const found = findNamed(places, [name, ...aliases], part.from);
      if (found) {
        for (const key of [name, ...aliases].map(nameKey).filter(Boolean))
          found.keys.add(key);
        found.look = fuller(found.look, clean(raw.look));
        found.sound ??= soundOf(raw.sound);
        found.kind ??= placeKindOf(raw.kind);
        found.stand ??= standOf(raw.stand);
        found.front ??= clean(raw.front).slice(0, 120) || null;
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
        kind: placeKindOf(raw.kind),
        stand: standOf(raw.stand),
        front: clean(raw.front).slice(0, 120) || null,
        inferred: true,
        keys: new Set([name, ...aliases].map(nameKey).filter(Boolean)),
        named: part.from,
      });
    }
    for (const raw of part.draft.pages) {
      const page = Math.round(raw.page);
      if (!(page >= part.from && page <= part.to)) continue;
      const present: StoryPage['present'] = [];
      for (const one of raw.present ?? []) {
        // A page names who is on it by any of their names, shortened too.
        const who = findNamed(characters, [clean(one.name)], -1);
        if (!who || present.some((p) => p.id === who.id)) continue;
        present.push({
          id: who.id,
          mood: EXPRESSIONS.includes(one.mood) ? one.mood : 'neutral',
        });
        // The book meets them where they are first on a page.
        who.firstPage = Math.min(who.firstPage, page);
      }
      const where = raw.place
        ? findNamed(places, [clean(raw.place)], -1)
        : null;
      if (where) {
        where.firstPage = Math.min(where.firstPage, page);
        // A place any page says outright is the text's, not worked out.
        if (!raw.placeInferred) where.inferred = false;
      }
      pages.set(page, {
        page,
        summary: clean(raw.summary).slice(0, 300),
        present,
        place: where?.id ?? null,
        placeInferred: Boolean(where && raw.placeInferred),
        time: timeOf(raw.time),
        weather: weatherOf(raw.weather),
        crowd: crowdOf(raw.crowd),
      });
    }
  }
  for (const one of [...characters, ...places])
    if (!Number.isFinite(one.firstPage)) one.firstPage = one.named;
  // A page that gives no clue happens where, and when, the page before
  // did: never a sunny afternoon made up between two nights.
  let last: string | null = null;
  let lastTime: StoryPage['time'] = null;
  for (const page of [...pages.values()].sort((a, b) => a.page - b.page)) {
    if (!page.place && last) {
      page.place = last;
      page.placeInferred = true;
    }
    last = page.place ?? last;
    if (!page.time && lastTime) page.time = lastTime;
    lastTime = page.time ?? lastTime;
  }
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
    characters: lookedAt(
      kept.map((c) => ({
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
        presence: c.presence ?? 'seen',
        fromText: c.fromText ?? [],
        iconic: null,
        carries: null,
      })),
      new Set(kept.filter((c) => c.marked).map((c) => c.id)),
    ),
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
        kind: p.kind ?? null,
        stand: p.stand ?? null,
        front: p.front ?? null,
        inferred: p.inferred ?? false,
      })),
    pages: [...pages.values()]
      .sort((a, b) => a.page - b.page)
      .map((page) => ({
        ...page,
        present: page.present.filter((one) => keptIds.has(one.id)),
      })),
    world,
    version: STORY_VERSION,
    title,
    author,
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
      presence: presenceFor(
        [clean(c.name), ...(c.aliases ?? []).map(clean)],
        presenceKind(c.presence),
      ),
      fromText: Array.isArray(c.fromText) ? c.fromText.map(clean) : [],
      iconic: typeof c.iconic === 'string' ? c.iconic : null,
      carries: c.carries ?? null,
    }));
  const known = new Set(characters.map((c) => c.id));
  return {
    // A well-known figure is drawn as their tradition shows them, in a
    // book read before they were: by a name that could be no one else.
    characters: lookedAt(
      characters,
      new Set(characters.filter((c) => c.iconic).map((c) => c.id)),
    ),
    places: (raw.places ?? [])
      .filter((p) => p && clean(p.id) && clean(p.name))
      .map((p) => ({
        id: clean(p.id),
        name: clean(p.name),
        aliases: (p.aliases ?? []).map(clean).filter(Boolean),
        look: clean(p.look),
        firstPage: Number.isFinite(p.firstPage) ? p.firstPage : 1,
        sound: soundOf(p.sound),
        kind: placeKindOf(p.kind),
        stand: standOf(p.stand),
        front: clean(p.front) || null,
        inferred: Boolean(p.inferred),
      })),
    pages: (raw.pages ?? []).map((p) => ({
      page: p.page,
      summary: clean(p.summary),
      present: (p.present ?? []).filter(
        (one) => known.has(one.id) && EXPRESSIONS.includes(one.mood),
      ),
      place: p.place ?? null,
      placeInferred: Boolean(p.placeInferred),
      time: timeOf(p.time),
      weather: weatherOf(p.weather),
      crowd: crowdOf(p.crowd),
    })),
    world: worldOf(raw.world),
    version: typeof raw.version === 'number' ? raw.version : 1,
    title: clean(raw.title) || null,
    author: clean(raw.author) || null,
  };
}

/**
 * The book's people as they are drawn: a well-known figure (by a name that
 * could be no one else, or as the reader marked them) in the look their
 * tradition gives them; and everyone who matters set apart from everyone
 * else, so each is known at a glance (scene-looks).
 */
function lookedAt(
  characters: StoryCharacter[],
  marked: ReadonlySet<string>,
): StoryCharacter[] {
  const known = characters.map((c) => {
    if ((c.kind ?? 'person') !== 'person' || !standsOnStage(c)) return c;
    const iconic = iconicOf([c.name, ...c.aliases], marked.has(c.id));
    return iconic
      ? {
          ...c,
          kind: 'person' as const,
          figure: iconic.figure,
          iconic: iconic.key,
          carries: iconic.carries ?? null,
        }
      : c;
  });
  // Whom the story follows first, so the main characters keep their looks.
  const order = [...known].sort(
    (a, b) => RANK[a.role] - RANK[b.role] || a.met - b.met,
  );
  const apart = new Map(setApart(order).map((c) => [c.id, c]));
  return known.map((c) => apart.get(c.id) ?? c);
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

/**
 * A voice from heaven, the way stories bring one in, and a crowd that
 * speaks: the words the book uses for them.
 */
const VOICE_FROM_ABOVE =
  /\b(?:a|the)\s+(?:loud\s+|great\s+|deep\s+|gentle\s+)?voice\s+(?:came\s+|spoke\s+|sounded\s+|was\s+heard\s+|rang\s+out\s+|boomed\s+|called\s+|said\s+)?(?:from|out\s+of)\s+(?:heaven|the\s+heavens|the\s+sky|the\s+skies|above|on\s+high|the\s+clouds?)\b/iu;
const CROWD_SPEAKS =
  /\b(?:the\s+)?(crowds?|people|multitude|throng|villagers|townspeople|onlookers)\s+(?:all\s+)?(?:shouted|cried(?:\s+out)?|called(?:\s+out)?|yelled|roared|cheered|answered|replied|said|murmured|asked|sang|chanted)\b|\b(?:shouted|cried|roared|cheered|chanted)\s+the\s+(crowds?|people|multitude|throng|villagers)\b/iu;

/**
 * The page's voices the reader did not list, from the page's own words:
 * a voice from heaven, where the story has no one heard from above, and a
 * crowd that speaks, where it has no group. Each a character for this
 * page only, heard and never drawn, so no one on the stage says their
 * lines.
 */
export function withVoices(
  bible: StoryBible,
  page: number,
  material: string,
): StoryBible {
  const added: StoryCharacter[] = [];
  const met = bible.characters.reduce((n, c) => Math.max(n, c.met + 1), 0);
  const taken = new Set(bible.characters.map((c) => c.id));
  const add = (character: Omit<StoryCharacter, 'firstPage' | 'met'>) => {
    if (taken.has(character.id)) return;
    added.push({ ...character, firstPage: page, met: met + added.length });
  };
  if (
    VOICE_FROM_ABOVE.test(material) &&
    !bible.characters.some((c) => c.presence === 'above')
  )
    add({
      id: 'voice-from-above',
      name: 'A voice from heaven',
      aliases: ['the voice from heaven', 'the voice'],
      role: 'minor',
      look: '',
      traits: [],
      voice: 'divine',
      kind: 'person',
      size: null,
      figure: null,
      presence: 'above',
    });
  const crowd = CROWD_SPEAKS.exec(material);
  if (crowd && !bible.characters.some((c) => c.kind === 'group')) {
    const word = (crowd[1] ?? crowd[2] ?? 'crowd').toLowerCase();
    add({
      id: 'the-crowd',
      name: `The ${word}`,
      aliases: [`the ${word}`, 'the crowd', 'the people'],
      role: 'minor',
      look: '',
      traits: [],
      voice: 'crowd',
      kind: 'group',
      size: null,
      figure: null,
      presence: 'seen',
    });
  }
  if (!added.length) return bible;
  const here = bible.pages.find((p) => p.page === page);
  // Whoever the writer would be told of anyway, and the voices besides.
  const present = [
    ...(here?.present.length
      ? here.present
      : charactersOn(bible, page).map((c): StoryPage['present'][number] => ({
          id: c.id,
          mood: 'neutral',
        }))),
    ...added.map((c): StoryPage['present'][number] => ({
      id: c.id,
      mood: 'neutral',
    })),
  ];
  return {
    ...bible,
    characters: [...bible.characters, ...added],
    pages: here
      ? bible.pages.map((p) => (p === here ? { ...p, present } : p))
      : [...bible.pages, { page, summary: '', present, place: null }].sort(
          (a, b) => a.page - b.page,
        ),
  };
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

/** What the writer is told of someone who is not simply seen on the stage. */
const HEARD_NOTE: Record<StoryPresence | 'group', string> = {
  seen: '',
  heard:
    '. Only ever heard, never on the stage: their lines come from off the stage, a phone, a letter or a dream',
  above:
    '. Never on the stage and never drawn: a voice from above, their lines from "above"',
  light:
    '. Never drawn: a soft light stands where they are, and the narrator says their words',
  group:
    '. A group who speak as one: a crowd behind the stage, never one of its things',
};

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
      HEARD_NOTE[c.kind === 'group' ? 'group' : (c.presence ?? 'seen')],
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
  const world = bible.world;
  const crowd = crowdOn(bible, page);
  const when = [
    here?.time && here.time !== 'day' ? `It is ${here.time}` : '',
    here?.weather && here.weather !== 'clear'
      ? `the weather: ${here.weather}`
      : '',
    crowd === 'many'
      ? 'a crowd is about, drawn behind the characters'
      : crowd === 'few'
        ? 'a few other people are about, drawn behind the characters'
        : '',
  ].filter(Boolean);
  return [
    world
      ? `The story's world: ${[world.era, world.region, world.culture].filter(Boolean).join('; ')}.`
      : '',
    'The story\'s characters on this page (show one as kind "character" with its id as ref):',
    ...lines,
    places.length
      ? 'The story\'s places (show one as kind "place" with its id as ref; it becomes the scene behind the stage):'
      : '',
    ...places.map(
      (p) =>
        `- ${p.id}: ${p.name}${p === place ? ', where this page happens: behind the stage from the start' : ''}${p === place && p.stand === 'in' && p.front ? `; the characters are in it, behind ${p.front}` : ''}.`,
    ),
    when.length ? `${when.join('; ')}.` : '',
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
    // What they always carry, when the page gives them nothing else to
    // hold and they stand: Moses's staff.
    const carries =
      who.carries && !thing.holding && (thing.pose ?? 'standing') === 'standing'
        ? { holding: who.carries }
        : {};
    return {
      ...thing,
      ...carries,
      ...(who.kind === 'group' ? { group: true as const } : {}),
      ...(who.role === 'minor' ? { minor: true as const } : {}),
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
        standsOnStage(bible.characters.find((c) => c.id === t.ref) ?? {}) &&
        Boolean(
          bible.pages
            .find((p) => p.page === page - 1)
            ?.present.some((one) => one.id === t.ref),
        ),
    )
    .sort((a, b) => a.met - b.met)
    .slice(0, OPENING_MOST);
  const there = back.length ? placeOn(bible, page - 1) : null;
  const on = bible.pages.find((p) => p.page === page);
  return {
    ...script,
    cast,
    setting: {
      time: on?.time ?? null,
      weather: on?.weather ?? null,
      crowd: crowdOn(bible, page),
      world: bible.world ?? null,
    },
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

/**
 * How busy a page is: as the reader said, and a crowd wherever a group of
 * the story's is on the page, since a group is drawn as one.
 */
export function crowdOn(bible: StoryBible, page: number): StoryCrowd | null {
  const here = bible.pages.find((p) => p.page === page);
  const group = here?.present.some(
    (one) => bible.characters.find((c) => c.id === one.id)?.kind === 'group',
  );
  if (here?.crowd === 'many' || here?.crowd === 'few') return here.crowd;
  return group ? 'few' : (here?.crowd ?? null);
}

/** Where a page happens: the place the story puts it in, or none. */
export function placeOn(bible: StoryBible, page: number): StoryPlace | null {
  const id = bible.pages.find((p) => p.page === page)?.place;
  return id ? (bible.places.find((p) => p.id === id) ?? null) : null;
}

/**
 * How a set is painted to go with the people drawn by the kit: their flat
 * colours and dark outline; a whole, recognisable place, a little softer
 * than the people so they stand out in front of it; and open ground low
 * down, where they stand.
 */
export const SET_STYLE = [
  'Paint it to go with cartoon people drawn in front of it: flat colours with no gradients, shading or texture, simple rounded shapes like cut paper, and one dark outline (#2d2a32) about three units wide.',
  "Make the place recognisable at a glance, with the things that make it that place (a boat's mast and nets, the stalls of a market, the houses of a village), a full, finished scene from edge to edge.",
  'Keep its colours a little softer than the people, so they stand out in front of it.',
  'The ground is flat and open across the lower third of the picture, with nothing tall in the middle of it, where people will stand.',
].join(' ');

/** The story's world, as the artist is told it. */
const worldText = (world: StoryWorld | null | undefined) =>
  world
    ? `The story happens in ${[world.region, world.era].filter(Boolean).join(', ')}${world.landscape ? `: ${world.landscape}` : ''}${world.homes ? `; ${world.homes}` : ''}.`
    : '';

/**
 * A place as the artist is asked to paint it, once for the book: the
 * scene behind the stage, filling the frame, with no one in it, dressed
 * for the story's world. Where people are in it behind its side (a boat,
 * a table, a well), that side is its own group, "front", which the stage
 * draws in front of the people, so they are in the boat and not before it.
 */
export function setThing(
  place: StoryPlace,
  bookTitle: string,
  world: StoryWorld | null = null,
): DrawingThing {
  const front = place.front && place.stand === 'in' ? place.front : null;
  return {
    id: place.id,
    kind: 'drawing',
    name: place.name,
    brief: [
      `${place.name}, a place in "${bookTitle}"${place.look ? `: ${place.look}` : ''}.`,
      worldText(world),
      place.kind === 'indoor'
        ? 'Seen from inside, at eye level, the floor running across the lower part of the picture.'
        : 'Seen from where a viewer stands, at eye level, the ground running across the lower part of the picture.',
      SET_STYLE,
      front
        ? `Draw ${front} as its own group with id "front": across the bottom of the picture, from the bottom edge up to about a fifth of its height, where it will stand in front of the people's legs so they are in the ${place.kind === 'vessel' ? place.name : 'place'}, behind it. Everything else of the place is the scene behind.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    motion:
      'slow and ambient if anything moves at all: clouds drift, water shimmers, leaves stir',
    parts: front ? [{ name: 'front', label: false }] : [],
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
