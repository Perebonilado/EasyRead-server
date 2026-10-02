/**
 * The kit's registry (explainer-animation-tech §4.2): every piece the
 * board may put on a set, by id, with its settings as closed lists (each
 * with its default), the moves it can make, a line for the board's
 * prompt, and the code that draws it. The board names an id and its
 * settings; code draws, rigs, sizes and places it.
 *
 * Each family lives in its own module and is listed in FAMILIES below:
 * people and vehicles (people.ts, vehicles.ts) for the editorial look;
 * the illustrated look's characters (WP17), buildings, documents, objects
 * and machines (WP10) join the same way. An entry says which looks it is
 * drawn for, so a show in the editorial look is never offered a cartoon
 * character, nor an illustrated one a silhouette.
 */
import type { KitLook, KitStyle } from './style';
import { validateRig, type KitPiece } from './rig';
import { CHARACTER_KIT } from './characters';
import { PEOPLE_KIT } from './people';
import { THINGS_KIT } from './things';
import { VEHICLE_KIT } from './vehicles';
import { UI_KIT } from './ui';

/** The families of the kit (plan §7.2). */
export type KitFamily =
  | 'people'
  | 'vehicles'
  | 'characters'
  | 'buildings'
  | 'documents'
  | 'objects'
  | 'machines'
  /** Devices with screens built by code, and the cursor (ui.ts, WP18). */
  | 'ui';

/** A piece's settings as code reads them: each a value of its list, or a number in its range. */
export type KitParams = Record<string, string | number>;

/** One setting of a piece: a closed list of words, or a whole number in a range; and its default. */
export interface KitParam {
  /** The words it may be. */
  values?: readonly string[];
  /** Or the whole numbers it may be, least and most. */
  range?: readonly [number, number];
  /** Or words of the board's own, at most this many characters: what someone wears, a person's name, a screen's title or a button's words (kept as said, trimmed). */
  text?: number;
  /** Set by code, never named by the board (a named person's likeness from the look notes): left out of its guide. */
  code?: boolean;
  default: string | number;
  /** A few words for the board: what it sets. */
  about: string;
  /** Other words people use for its values ("laptop" for a computer). */
  aliases?: Readonly<Record<string, string>>;
  /** It says what the piece is (a building's or an object's kind): a word that names none of its values makes no piece, never its default. */
  strict?: boolean;
}

export interface KitEntry {
  family: KitFamily;
  /** The looks it is drawn for. */
  looks: readonly KitLook[];
  /** One line for the board: what it is and when to use it. */
  about: string;
  params: Readonly<Record<string, KitParam>>;
  /** The moves it can make, as the board names them. */
  moves: readonly string[];
  /** It shows people: never a named person (a portrait or a trace is), never the audience. */
  people?: boolean;
  /** It shows a count of people, honest when a number is said (its `count` setting). */
  counts?: boolean;
  /** It may stand for a named person of the scene's list, labelled with their name (the illustrated look's characters, tech §11). */
  named?: boolean;
  /** Its own words for its moves, before the kit's (a cursor's "tap" is a click). */
  synonyms?: Readonly<Record<string, string>>;
  make(params: KitParams, style: KitStyle, seed: number): KitPiece;
}

/** Every family's entries; each family module exports its own. */
const FAMILIES: readonly Readonly<Record<string, KitEntry>>[] = [
  PEOPLE_KIT,
  VEHICLE_KIT,
  CHARACTER_KIT,
  THINGS_KIT,
  UI_KIT,
];

export const KIT: Readonly<Record<string, KitEntry>> = Object.assign(
  {},
  ...FAMILIES,
) as Record<string, KitEntry>;

export const KIT_IDS: readonly string[] = Object.keys(KIT);

/** The ids a show's look may use. */
export const kitIdsFor = (look: KitLook): string[] =>
  KIT_IDS.filter((id) => KIT[id].looks.includes(look));

/** A word reduced for matching a list: lower case, words joined by hyphens. */
const wordKey = (raw: string): string =>
  raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * A model's settings made sound: each setting the piece has, its value
 * the nearest on its list (the same word, its plural, a word it starts
 * with) or its default; a number rounded into its range. Settings the
 * piece does not have are dropped.
 */
export function paramsOf(
  id: string,
  raw: Readonly<Record<string, unknown>> = {},
): KitParams {
  const entry = KIT[id];
  if (!entry) return {};
  const out: KitParams = {};
  const given = new Map(
    Object.entries(raw).map(([k, v]) => [wordKey(k), v] as const),
  );
  for (const [name, param] of Object.entries(entry.params)) {
    const value = given.get(wordKey(name));
    out[name] = param.range
      ? numberIn(value, param.range, param.default as number)
      : param.text
        ? textIn(value, param.text, param.default as string)
        : wordIn(
            value,
            param.values ?? [],
            param.default as string,
            param.aliases,
          );
  }
  return out;
}

/**
 * The settings that say what a piece is (strict) given in words that name
 * none of their values: a "padlock" is a lock, but a "power station" is
 * no building the kit draws, and is never drawn as its default house.
 */
export function unknownOf(
  id: string,
  raw: Readonly<Record<string, unknown>> = {},
): string[] {
  const entry = KIT[id];
  if (!entry) return [];
  const given = new Map(
    Object.entries(raw).map(([k, v]) => [wordKey(k), v] as const),
  );
  const none = '\u0000';
  return Object.entries(entry.params)
    .filter(([name, param]) => {
      if (!param.strict || param.range) return false;
      const value = given.get(wordKey(name));
      if (value === undefined || value === null || value === '') return false;
      return wordIn(value, param.values ?? [], none, param.aliases) === none;
    })
    .map(([name]) => name);
}

function numberIn(
  raw: unknown,
  [lo, hi]: readonly [number, number],
  fallback: number,
): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw.replace(/[, ]/g, '').match(/-?\d+(?:\.\d+)?/)?.[0])
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** Words of the board's own, made sound: one line, no markup, cut at a word. */
function textIn(raw: unknown, most: number, fallback: string): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return fallback;
  const line = String(raw)
    .replace(/[<>{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= most) return line || fallback;
  const cut = line.slice(0, most);
  const space = cut.lastIndexOf(' ');
  return (space > most * 0.6 ? cut.slice(0, space) : cut).trim();
}

function wordIn(
  raw: unknown,
  values: readonly string[],
  fallback: string,
  aliases?: Readonly<Record<string, string>>,
): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return fallback;
  const key = wordKey(String(raw));
  if (!key) return fallback;
  // The same word; its singular; another word for it; a word it starts or ends; its stem ("points", "pointing").
  const stem = key.replace(/(?:ing|ed|es|s)$/, '');
  const alias = aliases
    ? Object.entries(aliases).find(
        ([word]) =>
          wordKey(word) === key || wordKey(word) === key.replace(/s$/, ''),
      )?.[1]
    : undefined;
  return (
    values.find((v) => wordKey(v) === key) ??
    values.find((v) => wordKey(v) === key.replace(/s$/, '')) ??
    values.find((v) => wordKey(v) === key.replace(/ies$/, 'y')) ??
    (alias && values.includes(alias) ? alias : undefined) ??
    values.find(
      (v) => key.startsWith(wordKey(v)) || wordKey(v).startsWith(key),
    ) ??
    (stem.length >= 3
      ? values.find((v) => wordKey(v).startsWith(stem))
      : undefined) ??
    fallback
  );
}

/**
 * A piece made: its settings made sound, drawn, and checked; null for an
 * id the kit does not have or a drawing that fails its own checks (the
 * build leaves that actor out and says so, never shows a broken piece).
 * `colour` is code's choice, never the board's: a side's name or a role
 * of the look ("ink"), worn as the piece's fill.
 */
export function makeKit(
  id: string,
  raw: Readonly<Record<string, unknown>>,
  style: KitStyle,
  seed: number,
  colour?: string,
): { piece: KitPiece; params: KitParams } | null {
  const entry = KIT[id];
  if (!entry || unknownOf(id, raw).length) return null;
  const params = paramsOf(id, raw);
  const piece = entry.make(
    colour ? { ...params, colour } : params,
    style,
    seed >>> 0,
  );
  return validateRig(piece).length ? null : { piece, params };
}

/** A setting for the board: its name and its list (or its range). */
const paramText = (name: string, param: KitParam): string =>
  param.range
    ? `${name} ${param.range[0]}–${param.range[1]} (${param.about})`
    : param.text
      ? `${name} in words (${param.about})`
      : `${name} ${(param.values ?? []).join(' | ')} (${param.about})`;

/**
 * The kit for the board's prompt, for a show's look: each id with what it
 * is, its settings and its moves, a line each.
 */
export function kitGuide(look: KitLook): string {
  const ids = kitIdsFor(look);
  if (!ids.length) return '';
  return ids
    .map((id) => {
      const entry = KIT[id];
      const params = Object.entries(entry.params)
        .filter(([, param]) => !param.code)
        .map(([name, param]) => paramText(name, param))
        .join('; ');
      return `- ${id}: ${entry.about}${params ? ` Settings: ${params}.` : ''} Moves: ${entry.moves.join(', ')}.`;
    })
    .join('\n');
}

/** The moves the board may name for an actor, as the stage plays them: a walk's synonyms, a vehicle's. */
const MOVE_NAMES: Readonly<Record<string, string>> = {
  arrive: 'enter',
  appear: 'enter',
  'come-in': 'enter',
  go: 'walk',
  move: 'walk',
  march: 'walk',
  'walk-to': 'walk',
  depart: 'leave',
  'walk-off': 'leave',
  'drive-off': 'leave',
  disappear: 'exit',
  drive: 'travel-to',
  sail: 'travel-to',
  fly: 'travel-to',
  travel: 'travel-to',
  'sail-to': 'travel-to',
  'fly-to': 'travel-to',
  halt: 'stop',
  'sit-down': 'sit',
  'stand-up': 'stand',
  'hand-up': 'raise-hand',
  cheers: 'cheer',
  'turn-around': 'turn',
};

/** A move as the board named it, as the stage plays it: the piece's own word for it first (a cursor's), then the kit's. */
export const actorMove = (name: string, kit?: string): string => {
  const key = wordKey(name);
  const own = kit ? KIT[kit]?.synonyms : undefined;
  if (own && kit && KIT[kit].moves.includes(key)) return key;
  return own?.[key] ?? MOVE_NAMES[key] ?? key;
};
