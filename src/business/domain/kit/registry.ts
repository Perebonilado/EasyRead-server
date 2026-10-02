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
import { PEOPLE_KIT } from './people';
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
  /** Or a few words (at most this many) the script says: a screen's title, a button's words (ui.ts). */
  text?: number;
  default: string | number;
  /** A few words for the board: what it sets. */
  about: string;
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
  /** Its own words for its moves, before the kit's (a cursor's "tap" is a click). */
  synonyms?: Readonly<Record<string, string>>;
  make(params: KitParams, style: KitStyle, seed: number): KitPiece;
}

/** Every family's entries; each family module exports its own. */
const FAMILIES: readonly Readonly<Record<string, KitEntry>>[] = [
  PEOPLE_KIT,
  VEHICLE_KIT,
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
        : wordIn(value, param.values ?? [], param.default as string);
  }
  return out;
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

/** A few words of a setting, on one line; the default when there are none. */
function textIn(raw: unknown, most: number, fallback: string): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return fallback;
  const words = String(raw)
    .replace(/[\r\n\t<>]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, most);
  return words.length ? words.join(' ').slice(0, 120) : fallback;
}

function wordIn(
  raw: unknown,
  values: readonly string[],
  fallback: string,
): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return fallback;
  const key = wordKey(String(raw));
  if (!key) return fallback;
  // The same word; its singular; a word it starts or ends; its stem ("points", "pointing").
  const stem = key.replace(/(?:ing|ed|es|s)$/, '');
  return (
    values.find((v) => wordKey(v) === key) ??
    values.find((v) => wordKey(v) === key.replace(/s$/, '')) ??
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
  if (!entry) return null;
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
      ? `${name} words (${param.about})`
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
