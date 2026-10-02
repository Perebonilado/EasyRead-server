/**
 * What a line names that a picture can show (Richard, 2026-10-02: real
 * pictures first, the map only for geography; scenes that change often to
 * relatable things):
 *
 *  - the people, places, things and events its words name, each with the
 *    cleared pictures of it: a person's portrait, and every photo the
 *    picture desk says shows them (`shows`), else a photo whose own words
 *    name them;
 *  - where its words name what the map shows: a place with its point, a
 *    region by its own name (its adjective, a side of the map), a seam;
 *    never "regional" or "colonial" alone, which say what kind of thing
 *    something is, not where;
 *  - the drawn set of the moment it tells, when its words tell one: the
 *    thing it is about on a display (a charter, coins, a ballot), or the
 *    kind of place it happens in (an assembly hall, a works on strike, a
 *    port), with people in it where people are, never a named place.
 *
 * Pure: everything comes from the scene's registry and the line's words.
 */
import { eraOf } from '../kit/eras';
import { mentionsOf, type Mention } from './shot-mentions';
import { keysOf, type Narration } from './shot-phrases';
import { splitTarget } from './shot-registry';
import type {
  PlanActor,
  PlanSet,
  PlanSetScene,
  PlanShot,
  RegistryEntry,
  TargetRegistry,
} from './types';

/** What a picture can show: a person, a place, a thing or an event. */
export type SubjectKind = 'person' | 'place' | 'thing' | 'event';

/** What a picture entry shows. */
export interface Shown {
  kind: SubjectKind;
  /** The registry's entry for it (a person's, a place's), when it has one. */
  entry: RegistryEntry | null;
  /** The words that name it, as matched (a thing's or an event's). */
  keys: string[];
}

/** Words that name nothing by themselves. */
const STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'from',
  'with',
  'and',
  'or',
  'by',
  'its',
  'his',
  'her',
  'their',
  'photo',
  'photograph',
  'picture',
  'image',
  'archive',
  'view',
  'scene',
  'portrait',
  'cropped',
  'circa',
]);

/** A word without the ending a plural adds: "strikes" is "strike". */
const stem = (key: string) =>
  key.length > 4 && /(?:ches|shes|sses|xes)$/u.test(key)
    ? key.slice(0, -2)
    : key.length > 3 && key.endsWith('s') && !key.endsWith('ss')
      ? key.slice(0, -1)
      : key;

/** The words of a name that tell it apart, as matched: no small words, plurals as their singular. */
export const contentKeys = (text: string): string[] => [
  ...new Set(
    keysOf(text)
      .filter((k) => (k.length >= 3 || /^\d+$/u.test(k)) && !STOP.has(k))
      .map(stem),
  ),
];

/** Whether a run of keys holds a name's keys, one after another. */
function holds(keys: readonly string[], name: readonly string[]): boolean {
  if (!name.length) return false;
  for (let at = 0; at + name.length <= keys.length; at += 1)
    if (name.every((k, i) => keys[at + i] === k)) return true;
  return false;
}

/** A picture entry: a photo or a document the desk cleared, with its picture. */
const isPicture = (e: RegistryEntry) =>
  (e.kind === 'photo' || e.kind === 'document') && Boolean(e.picture);

/** The registry's entry a `shows` names, of the kind it says. */
function shownEntry(
  shows: NonNullable<RegistryEntry['shows']>,
  registry: TargetRegistry,
): RegistryEntry | null {
  if (shows.kind !== 'person' && shows.kind !== 'place') return null;
  const { prefix, rest } = splitTarget(shows.name);
  const found =
    registry.resolve(prefix ? shows.name : `${shows.kind}:${rest}`) ??
    registry.resolve(rest);
  if (!found) return null;
  if (shows.kind === 'person') return found.kind === 'person' ? found : null;
  return found.kind === 'place' || found.kind === 'region' ? found : null;
}

/**
 * What a photo or a document shows: as the desk says (`shows`); else, by
 * its own words (its name and what it is about), a person of the list whose
 * whole name they hold, a place of the list they name, or else a thing by
 * its own words. Null for an entry that is no cleared picture.
 */
export function photoShows(
  photo: RegistryEntry,
  registry: TargetRegistry,
): Shown | null {
  if (!isPicture(photo)) return null;
  if (photo.shows) {
    const entry = shownEntry(photo.shows, registry);
    return {
      kind: photo.shows.kind,
      entry,
      keys: contentKeys(splitTarget(photo.shows.name).rest),
    };
  }
  const own = splitTarget(photo.name).rest;
  const words = keysOf(`${own} ${photo.about}`);
  const all = registry.entries();
  // A person by their whole name: "Azikiwe Mausoleum" is no photo of him.
  const person = all.find(
    (e) =>
      e.kind === 'person' && holds(words, keysOf(splitTarget(e.name).rest)),
  );
  if (person) return { kind: 'person', entry: person, keys: [] };
  const place = all.find(
    (e) =>
      (e.kind === 'place' || e.kind === 'region') &&
      holds(words, keysOf(splitTarget(e.name).rest)),
  );
  if (place) return { kind: 'place', entry: place, keys: [] };
  return { kind: 'thing', entry: null, keys: contentKeys(own) };
}

/**
 * The pictures of a person or a place, in the order they are used: a
 * person's portrait first, then each photo that shows them.
 */
export function picturesOf(
  entry: RegistryEntry,
  registry: TargetRegistry,
): RegistryEntry[] {
  const out: RegistryEntry[] =
    entry.kind === 'person' && entry.picture ? [entry] : [];
  for (const one of registry.entries()) {
    if (!isPicture(one)) continue;
    const shown = photoShows(one, registry);
    if (shown?.entry?.name === entry.name) out.push(one);
  }
  return out;
}

/** The set a picture makes: a person's own entry their portrait card, else the photo or the document. */
export function pictureSet(picture: RegistryEntry): PlanSet {
  if (picture.kind === 'person')
    return { kind: 'portrait', person: picture.name };
  if (picture.kind === 'document')
    return { kind: 'document', document: picture.name };
  return { kind: 'photo', photo: picture.name };
}

/** The picture a set shows, by its registry name; null for a set that shows none. */
export function pictureOfSet(set: PlanSet): string | null {
  return set.kind === 'portrait'
    ? set.person
    : set.kind === 'photo'
      ? set.photo
      : set.kind === 'document'
        ? set.document
        : null;
}

/**
 * Of a subject's pictures, the one to show next: one not shown yet in the
 * scene, else the one shown longest ago (`used` in the order shown).
 */
export function nextPicture(
  pictures: readonly RegistryEntry[],
  used: readonly string[] = [],
): RegistryEntry | null {
  if (!pictures.length) return null;
  const fresh = pictures.find((p) => !used.includes(p.name));
  if (fresh) return fresh;
  return [...pictures].sort(
    (a, b) => used.lastIndexOf(a.name) - used.lastIndexOf(b.name),
  )[0];
}

/** A picture's shot on the words it starts on: held, the camera moving slowly into it. */
export function pictureShot(picture: RegistryEntry, on: string): PlanShot {
  const set = pictureSet(picture);
  return {
    on,
    set,
    actors: [],
    info: [],
    life: set.kind === 'document' ? ['grain'] : [],
    camera: [{ move: 'push', on, amount: 'small' }],
    join: 'cut',
    focal: set.kind === 'portrait' ? picture.name : 'set',
  };
}

/** Something a line names that has pictures: where it is named, and its pictures. */
export interface NamedSubject {
  at: number;
  length: number;
  kind: SubjectKind;
  /** The person's or the place's registry name, or a thing's own words. */
  name: string;
  pictures: RegistryEntry[];
}

/**
 * What a narration names that pictures show, in the order of its words,
 * within `spans` (each a line's keys; the whole narration when none): a
 * person or a place of the list with a portrait or a photo of them; a
 * thing or an event a photo shows, where at least half its words are said
 * in one line (two of them at least, or its only one).
 */
export function namedSubjects(
  n: Narration,
  registry: TargetRegistry,
  spans: readonly [number, number][] = [[0, n.keys.length]],
  mentions: readonly Mention[] = mentionsOf(n, registry),
): NamedSubject[] {
  const out: NamedSubject[] = [];
  const pictured = new Map<string, RegistryEntry[]>();
  const of = (entry: RegistryEntry) => {
    if (!pictured.has(entry.name))
      pictured.set(entry.name, picturesOf(entry, registry));
    return pictured.get(entry.name)!;
  };
  for (const m of mentions) {
    if (m.entry.kind !== 'person' && m.entry.kind !== 'place') continue;
    const pictures = of(m.entry);
    if (pictures.length)
      out.push({
        at: m.at,
        length: m.length,
        kind: m.entry.kind,
        name: m.entry.name,
        pictures,
      });
  }
  // Things and events, by their words in a line.
  const stems = n.keys.map(stem);
  for (const photo of registry.entries()) {
    const shown = isPicture(photo) ? photoShows(photo, registry) : null;
    if (!shown || shown.entry || !shown.keys.length) continue;
    const need = Math.max(
      Math.min(2, shown.keys.length),
      Math.ceil(shown.keys.length / 2),
    );
    for (const [a, b] of spans) {
      const said = shown.keys
        .map((k) => stems.indexOf(k, a))
        .filter((at) => at >= 0 && at < b);
      if (said.length < need) continue;
      const at = Math.min(...said);
      out.push({
        at,
        length: 1,
        kind: shown.kind,
        name: splitTarget(photo.shows?.name ?? photo.name).rest,
        pictures: [photo],
      });
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

/**
 * Words that say what kind of thing something is, not where it is: "the
 * regional legislatures" names no region, "which region" does (mentionsOf
 * reads both as every region together).
 */
const KIND_ADJECTIVES = new Set([
  'regional',
  'provincial',
  'territorial',
  'colonial',
]);

/**
 * Where a narration names what the map shows: a place with its point on
 * the earth, a region by its name, its adjective or the side of the map
 * it is on, the regions together by the noun for them ("three regions"),
 * a seam by its name. Never the kind's adjective alone.
 */
export function mapMentions(
  n: Narration,
  registry: TargetRegistry,
  mentions: readonly Mention[] = mentionsOf(n, registry),
): Mention[] {
  return mentions.filter(
    (m) =>
      (m.entry.kind === 'place' && Boolean(m.entry.geo)) ||
      m.entry.kind === 'seam' ||
      (m.entry.kind === 'region' && !KIND_ADJECTIVES.has(n.keys[m.at] ?? '')),
  );
}

// ── The drawn set of the moment ───────────────────────────────────────────

/** A thing the kit draws on a display, by the words that name it. */
const THINGS: readonly {
  words: RegExp;
  kit: 'document' | 'object';
  kind: string;
}[] = [
  {
    words:
      /^(?:constitutions?|constitutional|charters?|treat(?:y|ies)|accords?|declarations?|decrees?|statutes?|laws?)$/u,
    kit: 'document',
    kind: 'charter',
  },
  {
    words: /^(?:newspapers?|headlines?)$/u,
    kit: 'document',
    kind: 'newspaper',
  },
  {
    words: /^(?:ballots?|elections?|electoral|voters?|voting|polls)$/u,
    kit: 'document',
    kind: 'ballot',
  },
  { words: /^(?:letters?|telegrams?)$/u, kit: 'document', kind: 'letter' },
  {
    words: /^(?:banknotes?|currency|currencies)$/u,
    kit: 'document',
    kind: 'note',
  },
  {
    words:
      /^(?:money|coins?|treasury|treasuries|revenues?|budgets?|taxes|taxation|spending|funds|wealth)$/u,
    kit: 'object',
    kind: 'coins',
  },
  { words: /^(?:books?|textbooks?)$/u, kit: 'object', kind: 'book' },
  { words: /^(?:telephones?|phones?)$/u, kit: 'object', kind: 'phone' },
  { words: /^(?:computers?|laptops?)$/u, kit: 'object', kind: 'computer' },
  { words: /^(?:barrels?)$/u, kit: 'object', kind: 'barrel' },
  { words: /^(?:batter(?:y|ies))$/u, kit: 'object', kind: 'battery' },
  { words: /^(?:lamps?|bulbs?)$/u, kit: 'object', kind: 'lamp' },
];

/**
 * A kind of place, by the words that tell a moment there: `event` when
 * they tell a real event (its set carries the "Illustration" tag), the
 * life the place really has, and how its people stand (none indoors,
 * where the hall's own rows are the people).
 */
const PLACES: readonly {
  words: RegExp;
  place: NonNullable<PlanSetScene['place']>;
  land?: PlanSetScene['land'];
  event?: boolean;
  life: PlanShot['life'];
  /** The crowd's pose, as silhouettes and as characters; none, no crowd. */
  pose?: { silhouettes: string; characters: string };
}[] = [
  {
    words:
      /^(?:legislatures?|parliaments?|assembl(?:y|ies)|congress|senate|chambers?|councils?|delegates?|delegations?|seats|debates?|conferences?|talks|negotiations?|negotiators?|summits?)$/u,
    place: 'assembly-hall',
    event: true,
    life: [],
  },
  {
    words:
      /^(?:ceremon(?:y|ies)|celebrations?|celebrated|parades?|inaugurations?|inaugurated|anthems?|flags?|jubilee)$/u,
    place: 'ceremony-ground',
    event: true,
    life: ['flags'],
    pose: { silhouettes: 'cheering', characters: 'cheering' },
  },
  {
    words:
      /^(?:strikes?|strikers?|factor(?:y|ies)|mills?|industry|industries|industrial|miners?|mines|unions?|workshops?)$/u,
    place: 'industry',
    event: true,
    life: ['smoke'],
    pose: { silhouettes: 'protest', characters: 'marching' },
  },
  {
    words: /^(?:ports?|harbou?rs?|docks?|dockers|ships?|cargo|sailors?)$/u,
    place: 'port',
    land: 'coast',
    life: ['shimmer'],
    pose: { silhouettes: 'standing', characters: 'standing' },
  },
  {
    words: /^(?:markets?|marketplaces?|bazaars?|traders?|merchants?)$/u,
    place: 'market',
    life: ['clouds'],
    pose: { silhouettes: 'standing', characters: 'standing' },
  },
  {
    words:
      /^(?:farms?|farmers?|farming|crops?|harvests?|cattle|plantations?)$/u,
    place: 'farm',
    life: ['wind'],
    pose: { silhouettes: 'standing', characters: 'standing' },
  },
  {
    words: /^(?:oil|oilfields?|petroleum|refiner(?:y|ies)|crude)$/u,
    place: 'oilfield',
    life: ['smoke'],
  },
  {
    words:
      /^(?:protests?|protesters?|marches|marchers?|rall(?:y|ies)|demonstrations?|demonstrators?)$/u,
    place: 'city',
    land: 'city',
    event: true,
    life: ['clouds'],
    pose: { silhouettes: 'protest', characters: 'marching' },
  },
  {
    words: /^(?:city|cities|streets?|urban|downtown)$/u,
    place: 'city',
    land: 'city',
    life: ['clouds'],
    pose: { silhouettes: 'standing', characters: 'standing' },
  },
];

/** Words for people in a moment: who stand in its set, as a crowd (never a named person). */
const PEOPLE =
  /^(?:people|crowds?|workers?|strikers?|protesters?|marchers?|demonstrators?|delegates?|leaders?|politicians?|officials?|voters?|citizens?|villagers?|farmers?|traders?|merchants?|miners?|sailors?|dockers|families|residents?)$/u;

/** The light and weather a moment's words give. */
const TIMES: readonly [RegExp, PlanSetScene['time']][] = [
  [/^(?:night|nights|midnight)$/u, 'night'],
  [/^(?:dawn|sunrise)$/u, 'dawn'],
  [/^(?:dusk|sunset|evening)$/u, 'dusk'],
];
const WEATHERS: readonly [RegExp, NonNullable<PlanSetScene['weather']>][] = [
  [/^(?:rain|rains|rainy|monsoon)$/u, 'rain'],
  [/^(?:storm|storms|stormy)$/u, 'storm'],
  [/^(?:snow|snows|snowy|winter)$/u, 'snow'],
];

/** What the moment set is told of the show. */
export interface MomentOptions {
  /** The show's era in words (the world's), for its buildings and people. */
  era?: string;
  /** The kit's ids the show may use: its things and its people. */
  kit?: readonly string[];
  look?: 'editorial' | 'illustrated';
}

/**
 * The drawn set of the moment a line tells, on the words it starts on, or
 * null when its words tell none: the first thing or kind of place they
 * name, in the order said. A thing is the kit's own on a display; a kind
 * of place is drawn of the show's era, with a crowd of the show's people
 * where the line speaks of people (silhouettes, or an illustrated show's
 * characters), tagged as an illustration where it stands for a real event.
 * Never a named place, never a named person.
 */
export function momentShot(
  say: string,
  on: string,
  options: MomentOptions = {},
): PlanShot | null {
  const keys = keysOf(say);
  const kit = options.kit ?? [];
  const eraId = options.era ? eraOf(options.era) : null;
  for (const key of keys) {
    const thing = THINGS.find((t) => t.words.test(key));
    if (thing && kit.includes(thing.kit))
      return {
        on,
        set: {
          kind: 'set',
          // A paper drawn for a real one (a charter for a constitution)
          // is an illustration; a thing of a kind (coins) is no claim.
          set: {
            land: 'plain',
            time: 'day',
            place: 'display',
            ...(thing.kit === 'document' ? { illustration: true } : {}),
          },
        },
        actors: [
          {
            id: 'thing',
            kit: thing.kit,
            params: { kind: thing.kind },
            place: 'centre',
          },
        ],
        info: [],
        life: [],
        camera: [{ move: 'push', target: 'actor:thing', on, amount: 'small' }],
        join: 'cut',
        focal: 'actor:thing',
      };
    const place = PLACES.find((p) => p.words.test(key));
    if (!place) continue;
    const time = TIMES.find(([w]) => keys.some((k) => w.test(k)))?.[1] ?? 'day';
    const weather = WEATHERS.find(([w]) => keys.some((k) => w.test(k)))?.[1];
    const illustrated = options.look === 'illustrated';
    const crowdKit = illustrated ? 'character.group' : 'people.crowd';
    const crowd: PlanActor | null =
      place.pose && kit.includes(crowdKit) && keys.some((k) => PEOPLE.test(k))
        ? {
            id: 'people',
            kit: crowdKit,
            params: {
              pose: illustrated
                ? place.pose.characters
                : place.pose.silhouettes,
              ...(eraId ? { era: eraId } : {}),
            },
            place: 'centre',
          }
        : null;
    return {
      on,
      set: {
        kind: 'set',
        set: {
          land: place.land ?? 'plain',
          time,
          ...(weather ? { weather } : {}),
          ...(place.place === 'city' ? { town: 'city' as const } : {}),
          ...(eraId ? { era: eraId } : {}),
          place: place.place,
          ...(place.event ? { illustration: true } : {}),
        },
      },
      actors: crowd ? [crowd] : [],
      info: [],
      life: [...place.life],
      camera: [{ move: 'establish', on }],
      join: 'cut',
      focal: 'set',
    };
  }
  return null;
}
