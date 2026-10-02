/**
 * The board's plan held to the rules (explainer-animation-plan §5.3;
 * explainer-animation-tech §4.1), before anything is built:
 *
 *   planOf     the model's answer made sound: closed-list words read as
 *              the nearest on the list, text trimmed, lists capped.
 *   checkPlan  what is still wrong, in plain words for the board's
 *              second try: names not on the lists or in the registry,
 *              phrases the voice never says, shots out of order, no one
 *              subject, too many words, and the banned patterns (words
 *              standing in for a place or a person, a person shown with
 *              no portrait, a drawn set named after a real place, a
 *              number nobody gave).
 *   mendPlan   what is still wrong, put right silently: an unknown name
 *              dropped with what it carried, a phrase snapped to the
 *              words nearest it (or its shot gone), a person shown by
 *              their trace, a subject chosen, words cut to the budget.
 *   safeShot   a line's picture when the board gave it none: the show's
 *              map held with a slow push on the line's place, a count of
 *              its number, a quote of its exact words, or the shot
 *              before carried on with the camera moving. Never a card of
 *              words.
 *
 * The timed checks (gaps, dwell, cues at once) are shot-check-timed's,
 * once the voice has times.
 */
import type { ShotInfoRecipe } from '../../../contracts';
import { numbersIn } from '../scene-chart';
import { readMapBase } from '../scene-map';
import { placesIn } from '../scene-map-places';
import { eraOf } from '../kit/eras';
import { KIT, actorMove } from '../kit/registry';
import { TEXT } from '../studio/explainer-rules';
import type { EditorWorld } from '../studio/studio-editor';
import type { EditorialRow } from '../studio/studio-editorial';
import {
  AMOUNTS,
  COLOUR_ROLES,
  CHART_KINDS,
  INFO_RECIPES,
  LIFE_EFFECTS,
  SET_KINDS,
  SET_CLIMATES,
  SET_LANDS,
  SET_PLACES,
  SET_STATES,
  SET_TIMES,
  SET_TOWNS,
  SET_WEATHERS,
  CAMERA_MOVES,
  SHOT_JOINS,
  joinOf,
  lifeOf,
  moveOf,
  nearestOf,
  recipeOf,
  setKindOf,
} from './shot-lists';
import {
  chartNumbers,
  chartOf,
  chartPartWords,
  chartReady,
  chartTexts,
  chartWords,
  clip,
  fewerWords,
  line,
  shortLabel,
  wordsIn,
} from './shot-parts';
import {
  keysOf,
  narrationOf,
  nearestPhrase,
  phraseAt,
  phraseText,
  PHRASE_MOST,
  uniquePhrase,
  wordsFrom,
  type Narration,
} from './shot-phrases';
import { looseKey, splitTarget } from './shot-registry';
import type {
  PlanActor,
  PlanCamera,
  PlanChart,
  PlanInfo,
  PlanSet,
  PlanSetScene,
  PlanShot,
  RegistryEntry,
  ShotPlan,
  ShotProblem,
  TargetRegistry,
} from './types';

// ── Small helpers ─────────────────────────────────────────────────────────

const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
const list = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (raw: unknown): T | null =>
    typeof raw === 'string' && values.includes(raw.trim() as T)
      ? (raw.trim() as T)
      : null;

/** The focal word for a shot about its whole set: a chart, a portrait, the whole map. */
export const WHOLE_SET = 'set';

/** How many shots a minute of narration has at most, and of what at most a shot. */
export const SHOT_LIMITS = {
  perMinute: 8,
  info: 4,
  camera: 2,
  life: 2,
  actors: 4,
} as const;

/** Words a minute the narration is said at, to count its minutes. */
const WORDS_A_MINUTE = 150;

/** The most shots a scene's narration has: eight a minute, two at least. */
export function mostShots(narration: string): number {
  const minutes = narrationOf(narration).keys.length / WORDS_A_MINUTE;
  return Math.max(2, Math.ceil(SHOT_LIMITS.perMinute * minutes));
}

/** Words that put the audience on screen: never an explainer's (research §3.5). */
const AUDIENCE =
  /\b(?:you|your|viewers?|audience|students?|learners?|pupils?|kids?|teens?|children|mascot|host)\b/iu;

/** A phrase as the board may write it: one line, no quotes, a few words. */
const phrase = (raw: unknown): string =>
  line(raw, 160)
    .replace(/[“”"]/gu, '')
    .split(' ')
    .slice(0, PHRASE_MOST)
    .join(' ');

/** A target name as the board may write it: one line, short. */
const targetName = (raw: unknown): string | undefined =>
  line(raw, 100) || undefined;

/** A number a model wrote, or undefined. */
const numberIn = (raw: unknown): number | undefined => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const found = numbersIn(line(raw, 40))[0];
  return found === undefined ? undefined : found;
};

// ── The model's answer, made sound ────────────────────────────────────────

/** What planOf, checkPlan and mendPlan are told of the scene beyond its words. */
export interface PlanOptions {
  /** The kit's ids (kit/registry, WP9): none until it lands, so no actors. */
  kit?: readonly string[];
  /** Whether the show has its one map (world.base): a map shot needs it, or a place with a point. */
  map?: boolean;
}

const amountOf = nearestOf(AMOUNTS, {
  slight: 'small',
  slow: 'small',
  little: 'small',
  subtle: 'small',
  gentle: 'small',
  big: 'large',
  strong: 'large',
  deep: 'large',
  full: 'large',
});
const treatmentOf = oneOf([
  'natural',
  'duotone',
  'halftone',
  'cutout',
] as const);
const landOf = nearestOf(SET_LANDS, {
  field: 'plain',
  farm: 'plain',
  plains: 'plain',
  hill: 'hills',
  mountain: 'mountains',
  beach: 'coast',
  shore: 'coast',
  port: 'coast',
  harbour: 'coast',
  harbor: 'coast',
  sand: 'desert',
  woods: 'forest',
  jungle: 'forest',
  town: 'city',
  street: 'city',
  ocean: 'sea',
});
const timeOf = nearestOf(SET_TIMES, {
  morning: 'dawn',
  sunrise: 'dawn',
  noon: 'day',
  afternoon: 'day',
  evening: 'dusk',
  sunset: 'dusk',
  midnight: 'night',
});
const weatherOf = nearestOf(SET_WEATHERS, {
  sunny: 'clear',
  cloudy: 'cloud',
  clouds: 'cloud',
  overcast: 'cloud',
  rainy: 'rain',
  snowy: 'snow',
  thunder: 'storm',
  fog: 'haze',
  mist: 'haze',
  dust: 'haze',
});
const townOf = nearestOf(SET_TOWNS, {
  hamlet: 'village',
  rural: 'village',
  urban: 'city',
  metropolis: 'city',
  empty: 'none',
});
const placeOf = nearestOf(SET_PLACES, {
  barn: 'farm',
  fields: 'farm',
  harbour: 'port',
  harbor: 'port',
  docks: 'port',
  quay: 'port',
  factory: 'industry',
  factories: 'industry',
  mill: 'industry',
  works: 'industry',
  bazaar: 'market',
  stalls: 'market',
  skyline: 'city',
  towers: 'city',
  oil: 'oilfield',
  parliament: 'assembly-hall',
  assembly: 'assembly-hall',
  chamber: 'assembly-hall',
  legislature: 'assembly-hall',
  stadium: 'ceremony-ground',
  parade: 'ceremony-ground',
  ceremony: 'ceremony-ground',
});
const climateOf = nearestOf(SET_CLIMATES, {
  dry: 'arid',
  desert: 'arid',
  hot: 'arid',
  humid: 'tropical',
  rainforest: 'tropical',
  snowy: 'cold',
  polar: 'cold',
  mild: 'temperate',
});
const stateOf = nearestOf(SET_STATES, {
  sunset: 'dusk',
  evening: 'dusk',
  nightfall: 'night',
  midnight: 'night',
  sunrise: 'dawn',
  morning: 'dawn',
  lights: 'lights-on',
  lit: 'lights-on',
  noon: 'day',
});

/** A set as the board gave it, made sound; null for one it may not ask for. */
function setOf(raw: unknown): PlanSet | null {
  const said = record(raw);
  // A chart kind named as the set ("timeline") is a chart of that kind;
  // a "document" with a drawn chart and no picture named is the chart.
  const named = setKindOf(said.kind);
  const asChart = !named
    ? chartOf({ ...said, ...record(said.chart), kind: said.kind })
    : named === 'document' && !said.document && !said.target && said.chart
      ? chartOf(said.chart)
      : null;
  const kind = asChart ? 'chart' : named;
  switch (kind) {
    case 'map':
      return {
        kind: 'map',
        ...(said.style === 'relief' ||
        said.style === 'night' ||
        said.style === 'atlas'
          ? { style: said.style }
          : {}),
        tilt: said.tilt === 'tilted' ? 'tilted' : 'flat',
        ...(typeof said.terrain === 'boolean' ? { terrain: said.terrain } : {}),
      };
    case 'chart': {
      const chart = asChart ?? chartOf(said.chart);
      return chart ? { kind: 'chart', chart } : null;
    }
    case 'portrait': {
      const person = targetName(said.person ?? said.target);
      return person ? { kind: 'portrait', person } : null;
    }
    case 'photo': {
      const photo = targetName(said.photo ?? said.target);
      return photo
        ? {
            kind: 'photo',
            photo,
            treatment: treatmentOf(said.treatment) ?? 'natural',
          }
        : null;
    }
    case 'document': {
      const document = targetName(said.document ?? said.target);
      return document ? { kind: 'document', document } : null;
    }
    case 'set': {
      const scene = record(said.set ?? said);
      const set: PlanSetScene = {
        land: landOf(scene.land) ?? 'plain',
        time: timeOf(scene.time) ?? 'day',
      };
      const weather = weatherOf(scene.weather);
      const town = townOf(scene.town);
      const era = line(scene.era, 40);
      const place = placeOf(scene.place);
      const climate = climateOf(scene.climate);
      // A change of light, on its words; a state the set opens in is no change.
      const becomes = stateOf(record(scene.becomes).state ?? scene.becomes);
      const becomesOn = line(record(scene.becomes).on ?? scene.becomesOn, 120);
      return {
        kind: 'set',
        set: {
          ...set,
          ...(weather ? { weather } : {}),
          ...(town ? { town } : {}),
          ...(era ? { era } : {}),
          ...(place ? { place } : {}),
          ...(climate ? { climate } : {}),
          ...(becomes && becomesOn && becomes !== set.time
            ? { becomes: { state: becomes, on: becomesOn } }
            : {}),
          ...(scene.illustration === true ? { illustration: true } : {}),
        },
      };
    }
    case 'plain':
      return { kind: 'plain' };
    default:
      return null;
  }
}

/** An information item as the board gave it, made sound; null for a recipe not on the list. */
function infoOf(raw: unknown): PlanInfo | null {
  const said = record(raw);
  const recipe = recipeOf(said.recipe);
  const on = phrase(said.on);
  if (!recipe || !on) return null;
  const target = targetName(said.target);
  const to = targetName(said.to);
  const until = phrase(said.until);
  // Only a label is words on the stage: what any other recipe wrote is dropped.
  const text = recipe === 'label' ? clip(said.text, TEXT.labelWordsMax) : '';
  const value = numberIn(said.value);
  const from = numberIn(said.from);
  const unit = clip(said.unit, 2);
  const colour = line(said.colour, 60);
  const replace =
    recipe === 'strike' ? clip(said.replace, TEXT.labelWordsMax) : '';
  return {
    recipe,
    on,
    ...(target ? { target } : {}),
    ...(to ? { to } : {}),
    ...(until ? { until } : {}),
    ...(text ? { text } : {}),
    ...(value !== undefined ? { value } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(unit ? { unit } : {}),
    ...(colour ? { colour } : {}),
    ...(replace ? { replace } : {}),
  };
}

function cameraOf(raw: unknown): PlanCamera | null {
  const said = record(raw);
  const move = moveOf(said.move);
  const on = phrase(said.on);
  if (!move || !on) return null;
  const target = targetName(said.target);
  const amount = amountOf(said.amount);
  return {
    move,
    on,
    ...(target ? { target } : {}),
    ...(amount ? { amount } : {}),
  };
}

/** The settings an actor's flat fields may carry (the board's schema writes each as its own field). */
const ACTOR_SETTINGS = [
  'pose',
  'kind',
  'count',
  'era',
  'who',
  'dress',
  'facing',
  'wagons',
] as const;

function actorOf(
  raw: unknown,
  kit: readonly string[],
  k: number,
): PlanActor | null {
  const said = record(raw);
  const piece = line(said.kit, 60);
  if (!kit.includes(piece)) return null;
  const params: Record<string, string | number | boolean> = {};
  const given = { ...record(said.params) };
  for (const key of ACTOR_SETTINGS)
    if (said[key] !== undefined && said[key] !== null) given[key] = said[key];
  for (const [key, value] of Object.entries(given).slice(0, 10))
    if (['string', 'number', 'boolean'].includes(typeof value))
      params[key.slice(0, 24)] =
        typeof value === 'string'
          ? value.slice(0, 40)
          : (value as number | boolean);
  // An era in words ("the 1950s", "Victorian") as the kit names eras.
  if (typeof params.era === 'string') {
    const era = eraOf(params.era);
    if (era) params.era = era;
    else delete params.era;
  }
  if (params.count !== undefined) {
    const count = numberIn(params.count);
    if (count === undefined) delete params.count;
    else params.count = count;
  }
  const moves = list(said.moves)
    .map((one) => ({
      move: line(record(one).move, 24),
      on: phrase(record(one).on),
      ...(targetName(record(one).to)
        ? { to: targetName(record(one).to)! }
        : {}),
    }))
    .filter((m) => m.move && m.on)
    .slice(0, 4);
  const place = targetName(said.place);
  const side = line(said.side, 60);
  return {
    id: line(said.id, 24).replace(/[^\w-]/gu, '') || `actor-${k + 1}`,
    kit: piece,
    ...(Object.keys(params).length ? { params } : {}),
    ...(place ? { place } : {}),
    ...(side ? { side } : {}),
    ...(moves.length ? { moves } : {}),
  };
}

// ── People on the stage ───────────────────────────────────────────────────

/**
 * The person of the scene's list a stretch of the narration names (from
 * word `start` to `end`), by their whole name or their family name: one
 * silhouette or a pair there would be read as them.
 */
function personNamed(
  n: Narration,
  registry: TargetRegistry,
  start: number,
  end: number,
): string | null {
  for (const e of registry.entries()) {
    if (e.kind !== 'person') continue;
    const name = splitTarget(e.name).rest;
    const last = keysOf(name).at(-1);
    if (
      phraseAt(n, name, start, end) >= 0 ||
      (last && last.length > 2 && phraseAt(n, last, start, end) >= 0)
    )
      return name;
  }
  return null;
}

/** Words for people, that make a number before them a count of people. */
const PEOPLE_WORDS =
  /^(?:people|persons?|men|women|children|workers|voters|protesters|marchers|soldiers|troops|migrants|refugees|delegates|members|demonstrators|residents|citizens|villagers|farmers|miners|strikers|families|pilgrims|prisoners|settlers|passengers|fans|spectators|crowds?|inhabitants|employees|staff|students|sailors|slaves|labourers|laborers|immigrants|emigrants|travellers|travelers)$/u;
const SCALES: Readonly<Record<string, number>> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
};

/**
 * The counts of people the scene gives: a number in its lines with a
 * word for people after it ("300 people", "45,000 striking workers",
 * "3 million voters"), or a research number about people. A year or a
 * length is never a crowd's count.
 */
function peopleCounts(
  narration: string,
  registry: TargetRegistry,
): Set<number> {
  const out = new Set<number>();
  const words = narration
    .split(/\s+/u)
    .map((w) =>
      w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''),
    );
  words.forEach((word, i) => {
    const [found] = numbersIn(word);
    if (found === undefined) return;
    let value = found;
    let j = i + 1;
    if (SCALES[words[j]]) {
      value *= SCALES[words[j]];
      j += 1;
    }
    // A word for people within three words, before any other number.
    for (const w of words.slice(j, j + 3)) {
      if (/\d/u.test(w)) break;
      if (PEOPLE_WORDS.test(w)) {
        out.add(value);
        break;
      }
    }
  });
  for (const e of registry.entries())
    if (
      e.kind === 'number' &&
      e.value !== undefined &&
      `${e.unit ?? ''} ${e.about}`
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .some((w) => PEOPLE_WORDS.test(w))
    )
      out.add(e.value);
  return out;
}

/**
 * What is wrong with an actor (research §3.5): a move it cannot make;
 * for people, a silhouette standing for a named person (on a person's
 * place or name, or one or two figures on a line that names someone),
 * the audience on screen, or a count neither the list nor the line gives.
 */
function actorFaults(
  actor: PlanActor,
  registry: TargetRegistry,
  counts: Set<number>,
  named: string | null,
): { code: string; message: string; drop: boolean }[] {
  const entry = KIT[actor.kit];
  if (!entry) return [];
  const out: { code: string; message: string; drop: boolean }[] = [];
  for (const move of actor.moves ?? [])
    if (!entry.moves.includes(actorMove(move.move)))
      out.push({
        code: 'unknown-move',
        message: `${actor.id} (${actor.kit}) cannot ${move.move}; its moves are ${entry.moves.join(', ')}.`,
        drop: false,
      });
  if (!entry.people) return out;
  const own = [actor.place, actor.id].map((name) =>
    name ? registry.resolve(name) : null,
  );
  const person = own.find((e) => e?.kind === 'person');
  const few = actor.kit === 'people.person' || actor.kit === 'people.pair';
  if (person || (few && named))
    out.push({
      code: 'silhouette-person',
      message: `${actor.id} is a silhouette where the line is about ${person ? splitTarget(person.name).rest : named}: a named person is shown only by their portrait or a trace of them, never a figure.`,
      drop: true,
    });
  const words = [actor.id, ...Object.values(actor.params ?? {})].join(' ');
  if (AUDIENCE.test(words))
    out.push({
      code: 'audience',
      message: `${actor.id} puts the audience on screen; no one watching is ever shown.`,
      drop: true,
    });
  const count = actor.params?.count;
  if (
    entry.counts &&
    typeof count === 'number' &&
    count > 0 &&
    !counts.has(count)
  )
    out.push({
      code: 'untrue-count',
      message: `${actor.id} counts ${count}, which neither the list nor the line gives as a count of people: count only such a number, or none.`,
      drop: false,
    });
  return out;
}

/** An actor made sound: dropped when it breaks a rule of people, its untrue count and the moves it cannot make taken away. */
function soundActor(
  actor: PlanActor,
  registry: TargetRegistry,
  counts: Set<number>,
  named: string | null,
): PlanActor | null {
  const faults = actorFaults(actor, registry, counts, named);
  if (faults.some((f) => f.drop)) return null;
  const entry = KIT[actor.kit];
  const params = { ...(actor.params ?? {}) };
  if (faults.some((f) => f.code === 'untrue-count')) delete params.count;
  const moves = (actor.moves ?? []).filter(
    (m) => !entry || entry.moves.includes(actorMove(m.move)),
  );
  const { params: _p, moves: _m, ...rest } = actor;
  void _p;
  void _m;
  return {
    ...rest,
    ...(Object.keys(params).length ? { params } : {}),
    ...(moves.length ? { moves } : {}),
  };
}

/**
 * The board's answer made sound (shot-schemas' shape, or near it): every
 * closed-list word the nearest on its list or gone with what it carried,
 * every text trimmed (a label to three words), and every list capped: at
 * most eight shots a minute of narration, four information items and two
 * camera moves a shot. Names and phrases are kept as written: checkPlan
 * and mendPlan hold them to the registry and the narration.
 */
export function planOf(
  raw: unknown,
  narration = '',
  options: PlanOptions = {},
): ShotPlan {
  const kit = options.kit ?? [];
  const shots = list(record(raw).shots)
    .flatMap((one): PlanShot[] => {
      const said = record(one);
      const set = setOf(said.set);
      const on = phrase(said.on);
      if (!set || !on) return [];
      const focal = targetName(said.focal);
      return [
        {
          on,
          set,
          actors: list(said.actors)
            .map((a, k) => actorOf(a, kit, k))
            .filter((a): a is PlanActor => a !== null)
            .slice(0, SHOT_LIMITS.actors),
          info: list(said.info)
            .map(infoOf)
            .filter((i): i is PlanInfo => i !== null)
            .slice(0, SHOT_LIMITS.info),
          life: [
            ...new Set(
              list(said.life)
                .map(lifeOf)
                .filter((l): l is NonNullable<typeof l> => l !== null),
            ),
          ].slice(0, SHOT_LIMITS.life),
          camera: list(said.camera)
            .map(cameraOf)
            .filter((c): c is PlanCamera => c !== null)
            .slice(0, SHOT_LIMITS.camera),
          join: joinOf(said.join) ?? 'cut',
          ...(focal ? { focal } : {}),
        },
      ];
    })
    .slice(0, narration ? mostShots(narration) : 64);
  return { shots };
}

// ── What a name means in a shot ───────────────────────────────────────────

/** What a target name in a shot stands for. */
type Target =
  | { kind: 'entry'; entry: RegistryEntry; name: string }
  | { kind: 'part'; name: string }
  | { kind: 'actor'; name: string }
  | { kind: 'set'; name: string };

/** A target name read in a shot: the registry's, a part of its chart, one of its actors, or its whole set. */
function targetIn(
  shot: PlanShot,
  name: string | undefined,
  registry: TargetRegistry,
): Target | null {
  if (!name) return null;
  if (name.trim().toLowerCase() === WHOLE_SET)
    return { kind: 'set', name: WHOLE_SET };
  const { prefix, rest } = splitTarget(name);
  if (prefix === 'part' || (!prefix && shot.set.kind === 'chart')) {
    if (shot.set.kind !== 'chart') return null;
    const words = keysOf(rest).join(' ');
    if (words && chartPartWords(shot.set.chart).has(words))
      return { kind: 'part', name: `part:${rest}` };
    if (prefix === 'part') return null;
  }
  if (prefix === 'actor' || !prefix) {
    const actor = shot.actors.find((a) => a.id === rest);
    if (actor) return { kind: 'actor', name: `actor:${actor.id}` };
    // A part of an actor (a machine's combustor, its core flow): actor:<id>.<part>.
    const dot = rest.indexOf('.');
    const owner = dot > 0 ? shot.actors.find((a) => a.id === rest.slice(0, dot)) : undefined;
    if (owner && rest.slice(dot + 1).trim())
      return { kind: 'part', name: `actor:${owner.id}.${partKey(rest.slice(dot + 1))}` };
    if (prefix === 'actor') return null;
  }
  const entry = registry.resolve(name);
  return entry ? { kind: 'entry', entry, name: entry.name } : null;
}

/** Whether a chart shows a number, a date or a claim of the registry. */
function chartShows(chart: PlanChart, entry: RegistryEntry): boolean {
  if (entry.kind === 'number')
    return (
      ['counter', 'icons', 'chart', 'seats'].includes(chart.kind) &&
      (entry.value === undefined || chartNumbers(chart).includes(entry.value))
    );
  if (entry.kind === 'date') {
    const when = keysOf(splitTarget(entry.name).rest).join(' ');
    return (
      ['timeline', 'calendar'].includes(chart.kind) &&
      chartTexts(chart).some((t) => keysOf(t).join(' ') === when)
    );
  }
  if (entry.kind === 'claim') return ['quote', 'document'].includes(chart.kind);
  return false;
}

/** Whether a shot's set shows what a target stands for: a place on its map, a part of its chart, its portrait's person. */
function shownBy(shot: PlanShot, target: Target): boolean {
  if (target.kind === 'set') return true;
  if (target.kind === 'actor') return true;
  const set = shot.set;
  if (target.kind === 'part') return set.kind === 'chart' || target.name.startsWith('actor:');
  const entry = target.entry;
  switch (set.kind) {
    case 'map':
      return (
        (entry.kind === 'place' && Boolean(entry.geo)) ||
        entry.kind === 'region' ||
        entry.kind === 'seam'
      );
    case 'chart':
      return chartShows(set.chart, entry);
    case 'portrait':
      return entry.kind === 'person' && entry.name === set.person;
    case 'photo':
      return entry.name === set.photo;
    case 'document':
      return entry.name === set.document;
    default:
      return false;
  }
}

/** What each recipe may act on: its target's kinds (part and actor are a shot's own), and whether it needs one. */
const RECIPE_TARGETS: Record<
  ShotInfoRecipe,
  { needs: boolean; kinds: string[]; to?: 'needs' | 'may' }
> = {
  draw: { needs: true, kinds: ['place', 'region', 'part'], to: 'may' },
  label: {
    needs: true,
    kinds: [
      'place',
      'region',
      'seam',
      'part',
      'actor',
      'number',
      'date',
      'person',
    ],
  },
  pin: { needs: true, kinds: ['place'] },
  fill: { needs: true, kinds: ['region', 'part'] },
  seam: { needs: true, kinds: ['seam'] },
  count: { needs: true, kinds: ['number', 'part'] },
  grow: { needs: true, kinds: ['number', 'part'] },
  transfer: { needs: true, kinds: ['part', 'place', 'region'], to: 'needs' },
  morph: { needs: true, kinds: ['part', 'date', 'number'] },
  run: { needs: true, kinds: ['actor'] },
  strike: { needs: false, kinds: ['part'] },
  stamp: { needs: false, kinds: ['part'] },
  flow: { needs: false, kinds: ['part', 'place', 'region'], to: 'may' },
  spotlight: {
    needs: true,
    kinds: [
      'place',
      'region',
      'seam',
      'part',
      'actor',
      'number',
      'date',
      'person',
    ],
  },
  mark: {
    needs: true,
    kinds: [
      'place',
      'region',
      'seam',
      'part',
      'actor',
      'number',
      'date',
      'person',
    ],
  },
  enter: { needs: true, kinds: ['part', 'actor'] },
  exit: { needs: true, kinds: ['part', 'actor'] },
  ask: {
    needs: false,
    kinds: [
      'place',
      'region',
      'seam',
      'part',
      'actor',
      'number',
      'date',
      'person',
    ],
  },
};

const kindOf = (target: Target) =>
  target.kind === 'entry' ? target.entry.kind : target.kind;

/** Why a recipe cannot act on what it names in a shot, in plain words; null when it can. */
function recipeMisfit(
  info: PlanInfo,
  shot: PlanShot,
  registry: TargetRegistry,
): string | null {
  const rule = RECIPE_TARGETS[info.recipe];
  const target = targetIn(shot, info.target, registry);
  if (info.target && !target)
    return `"${info.target}" is not in the list of what you may name`;
  if (!target && rule.needs)
    return `"${info.recipe}" needs a target: what it acts on`;
  if (target && target.kind !== 'set') {
    if (!rule.kinds.includes(kindOf(target)))
      return `"${info.recipe}" cannot act on ${target.name}`;
    if (!shownBy(shot, target))
      return `${target.name} is not in this shot's picture (${setWords(shot.set)})`;
    if (info.recipe === 'pin' && target.kind === 'entry' && !target.entry.geo)
      return `${target.name} is not on the map, so it cannot be pinned`;
  }
  const to = targetIn(shot, info.to, registry);
  if (info.to && !to)
    return `"${info.to}" is not in the list of what you may name`;
  if (rule.to === 'needs' && !to)
    return `"${info.recipe}" needs "to": where it goes`;
  if (to && to.kind !== 'set' && !shownBy(shot, to))
    return `${to.name} is not in this shot's picture (${setWords(shot.set)})`;
  return null;
}

/** A set in a few words, for a message. */
function setWords(set: PlanSet): string {
  switch (set.kind) {
    case 'chart':
      return `a ${set.chart.kind}`;
    case 'set':
      return 'a drawn set';
    default:
      return `the ${set.kind}`;
  }
}

/** The colour a model named, as the look has it: a role, or a side's name; null for none. */
export function colourName(
  raw: string | undefined,
  registry: TargetRegistry,
): string | null {
  if (!raw) return null;
  const role = oneOf(COLOUR_ROLES)(raw.toLowerCase());
  if (role) return role;
  const { rest } = splitTarget(raw);
  const side =
    registry.resolve(`side:${rest}`) ??
    registry
      .entries()
      .find(
        (e) =>
          e.kind === 'side' &&
          looseKey(splitTarget(e.name).rest) === looseKey(rest),
      ) ??
    null;
  return side?.kind === 'side' ? splitTarget(side.name).rest : null;
}

/** A target's own name, as a label writes it: "North Region", "Lagos", "1951". */
function nameOf(target: Target): string {
  if (target.kind === 'part' && target.name.startsWith('actor:'))
    return partWords(target.name.slice(target.name.indexOf('.') + 1));
  return target.kind === 'entry' || target.kind === 'part'
    ? splitTarget(target.name).rest
    : '';
}

/** A kit piece's part as the board may write it: lower case, words joined by hyphens ("HP compressor" is hp-compressor). */
export const partKey = (words: string): string =>
  words
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A kit piece's part in words, for its label: "hp-compressor-3" is "HP compressor". */
export const partWords = (part: string): string => {
  const words = part
    .replace(/-\d+$/u, '')
    .split('-')
    .map((w) => (w === 'lp' || w === 'hp' ? w.toUpperCase() : w))
    .join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Whether a label names what it is on: a word of its target's name (the
 * generic ones aside), or numbers the scene gives (a year on a place). A
 * label never repeats what the voice says.
 */
function labelNames(
  text: string,
  target: Target | null,
  given: ReadonlySet<number>,
): boolean {
  if (!target || target.kind === 'set' || target.kind === 'actor') return true;
  const words = keysOf(text);
  if (!words.length) return false;
  if (words.every((w) => /^\d+$/u.test(w)))
    return numbersIn(text).every((n) => given.has(n));
  const own = new Set(
    [
      nameOf(target),
      ...(target.kind === 'entry' ? (target.entry.aliases ?? []) : []),
    ]
      .flatMap((n) => keysOf(n))
      .filter((k) => !['the', 'of', 'region', 'state', 'and'].includes(k)),
  );
  return words.some((w) => own.has(w));
}

// ── What a shot puts on the stage ─────────────────────────────────────────

/** The words a shot puts on the stage: its labels' and its chart's. */
export function stageWords(shot: PlanShot): number {
  const labels = shot.info.reduce(
    (n, i) => n + wordsIn(i.text) + wordsIn(i.replace),
    0,
  );
  return labels + (shot.set.kind === 'chart' ? chartWords(shot.set.chart) : 0);
}

/** The numbers a shot puts on the stage: its chart's, its counts' and its labels'. */
function stageNumbers(shot: PlanShot): number[] {
  return [
    ...(shot.set.kind === 'chart' ? chartNumbers(shot.set.chart) : []),
    ...shot.info.flatMap((i) => [
      ...(i.value !== undefined ? [i.value] : []),
      ...(i.from !== undefined && i.from !== 0 ? [i.from] : []),
      ...numbersIn(i.text ?? ''),
      ...numbersIn(i.replace ?? ''),
    ]),
  ];
}

/** Every number the scene may show: the narration's and the registry's. */
function givenNumbers(
  narration: string,
  registry: TargetRegistry,
): Set<number> {
  const out = new Set(numbersIn(narration));
  for (const e of registry.entries()) {
    for (const n of numbersIn(`${e.name} ${e.about}`)) out.add(n);
    if (e.value !== undefined) out.add(e.value);
  }
  return out;
}

/** Whether words stand for a place or a person the scene names, and for nothing else. */
function standsFor(text: string, registry: TargetRegistry): boolean {
  const key = looseKey(text);
  if (!key) return false;
  if (placesIn(text).length && keysOf(text).length <= 4) {
    const rest = keysOf(text).join(' ');
    if (placesIn(text).some((p) => p.name === rest)) return true;
  }
  return registry.entries().some((e) => {
    if (!['place', 'person', 'region'].includes(e.kind)) return false;
    const name = splitTarget(e.name).rest;
    return (
      looseKey(name) === key ||
      (e.kind === 'person' && keysOf(name).at(-1) === key)
    );
  });
}

/** A chart that is only a name: words standing for a place or a person, no number, nothing else. */
function chartIsName(chart: PlanChart, registry: TargetRegistry): boolean {
  if (chartNumbers(chart).length) return false;
  const texts =
    chart.kind === 'quote'
      ? [line(chart.spec.text)].filter(Boolean)
      : chartTexts(chart);
  return texts.length > 0 && texts.every((t) => standsFor(t, registry));
}

/**
 * Whether a quote's words are someone's own, as the research has them: in
 * a quote claim, or inside quotation marks in another claim. The
 * narrator's words are never a quote.
 */
function quoteIsTrue(chart: PlanChart, registry: TargetRegistry): boolean {
  if (chart.kind !== 'quote') return true;
  const said = keysOf(line(chart.spec.text, 400)).join(' ');
  if (!said) return false;
  return registry.entries().some((e) => {
    if (e.kind !== 'claim') return false;
    const quoted = e.about.startsWith('quote:')
      ? [e.about]
      : [...e.about.matchAll(/[“"]([^”"]+)[”"]/gu)].map((m) => m[1]);
    return quoted.some((q) => ` ${keysOf(q).join(' ')} `.includes(` ${said} `));
  });
}

/** The person a portrait set names, read in the registry. */
const portraitOf = (set: PlanSet, registry: TargetRegistry) =>
  set.kind === 'portrait' ? registry.resolve(set.person) : null;

/** Whether a drawn set is named after a real place: a place in its era's words. */
function setIsNamed(set: PlanSet, registry: TargetRegistry): string | null {
  if (set.kind !== 'set' || !set.set.era) return null;
  const era = set.set.era;
  if (placesIn(era).length) return era;
  const named = registry
    .entries()
    .filter((e) => e.kind === 'place' || e.kind === 'region')
    .find((e) =>
      keysOf(era)
        .join(' ')
        .includes(looseKey(splitTarget(e.name).rest)),
    );
  return named ? era : null;
}

// ── The check ─────────────────────────────────────────────────────────────

/** Where each shot's phrase is in the narration, and whether it is there at all. */
function anchorsOf(
  plan: ShotPlan,
  n: Narration,
): { at: number; order: boolean }[] {
  let cursor = 0;
  return plan.shots.map((shot) => {
    const after = phraseAt(n, shot.on, cursor);
    if (after >= 0) {
      cursor = after;
      return { at: after, order: true };
    }
    const anywhere = phraseAt(n, shot.on);
    return { at: anywhere, order: anywhere < 0 };
  });
}

/**
 * What is wrong with a plan, each in plain words for the board's second
 * try (shots numbered from one in the words, from zero in `shot`).
 */
export function checkPlan(
  plan: ShotPlan,
  narration: string,
  registry: TargetRegistry,
  options: PlanOptions = {},
): ShotProblem[] {
  const problems: ShotProblem[] = [];
  const say = (shot: number, code: string, message: string) =>
    problems.push({ shot, code, message });
  const n = narrationOf(narration);
  const kit = options.kit ?? [];
  const map =
    options.map ??
    registry.entries().some((e) => e.kind === 'region' || e.kind === 'seam');
  const given = givenNumbers(narration, registry);
  const counts = peopleCounts(narration, registry);
  if (!plan.shots.length) {
    say(
      -1,
      'no-shots',
      'The plan has no shots: give each line a shot, or carry one on.',
    );
    return problems;
  }
  if (plan.shots.length > mostShots(narration))
    say(
      -1,
      'too-many-shots',
      `The plan has ${plan.shots.length} shots; this narration takes ${mostShots(narration)} at most (eight a minute).`,
    );
  const anchors = anchorsOf(plan, n);
  if ((anchors[0]?.at ?? 0) > 0)
    say(
      0,
      'late-start',
      `Shot 1 starts on "${plan.shots[0].on}"; the first shot starts on the first words, "${wordsFrom(n, 0)}".`,
    );

  plan.shots.forEach((shot, k) => {
    const S = `Shot ${k + 1}`;
    const { at, order } = anchors[k];
    const next =
      anchors.slice(k + 1).find((a) => a.at >= 0 && a.order)?.at ??
      n.keys.length;
    // The closed lists.
    if (!(SET_KINDS as readonly string[]).includes(shot.set.kind))
      say(
        k,
        'unknown-set',
        `${S}: "${shot.set.kind}" is no set kind; use one of ${SET_KINDS.join(', ')}.`,
      );
    if (!(SHOT_JOINS as readonly string[]).includes(shot.join))
      say(k, 'unknown-join', `${S}: "${shot.join}" is no join.`);
    for (const effect of shot.life)
      if (!(LIFE_EFFECTS as readonly string[]).includes(effect))
        say(k, 'unknown-life', `${S}: "${effect}" is no life effect.`);
    for (const actor of shot.actors)
      if (!kit.includes(actor.kit))
        say(
          k,
          'unknown-kit',
          kit.length
            ? `${S}: "${actor.kit}" is no kit piece.`
            : `${S}: there are no actors yet; plan none.`,
        );
      else
        for (const fault of actorFaults(
          actor,
          registry,
          counts,
          at >= 0 ? personNamed(n, registry, at, next) : null,
        ))
          say(k, fault.code, `${S}: ${fault.message}`);
    if (shot.info.length > SHOT_LIMITS.info)
      say(
        k,
        'too-many-info',
        `${S} has ${shot.info.length} information items; at most ${SHOT_LIMITS.info}.`,
      );
    if (shot.camera.length > SHOT_LIMITS.camera)
      say(
        k,
        'too-many-camera',
        `${S} has ${shot.camera.length} camera moves; at most ${SHOT_LIMITS.camera}.`,
      );

    // Its phrase, in order.
    if (at < 0)
      say(
        k,
        'phrase-missing',
        `${S}: "${shot.on}" is not in the narration; start it on the exact words the voice says.`,
      );
    else if (!order)
      say(
        k,
        'out-of-order',
        `${S} starts on "${shot.on}", said before the shot before it: keep the shots in the order of the words.`,
      );

    // Its set.
    const set = shot.set;
    if (set.kind === 'map' && !map) {
      const pinned = shot.info.some((i) => {
        const t = targetIn(shot, i.target, registry);
        return t?.kind === 'entry' && Boolean(t.entry.geo);
      });
      if (!pinned)
        say(
          k,
          'no-map',
          `${S}: this show has no map of its own; show its line another way.`,
        );
    }
    if (set.kind === 'chart') {
      if (!(CHART_KINDS as readonly string[]).includes(set.chart.kind))
        say(k, 'unknown-chart', `${S}: "${set.chart.kind}" is no chart kind.`);
      else if (!chartReady(set.chart))
        say(
          k,
          'chart-empty',
          `${S}: the ${set.chart.kind} has nothing to draw; give it its fields.`,
        );
      else if (!quoteIsTrue(set.chart, registry))
        say(
          k,
          'untrue-quote',
          `${S}: the quote's words are no one's own as the research gives them; quote a quote claim's words exactly.`,
        );
      else if (chartIsName(set.chart, registry))
        say(
          k,
          'word-card',
          `${S}: a ${set.chart.kind} that is only a name stands in for a place or a person; show the place on the map, or what the line says.`,
        );
    }
    if (set.kind === 'portrait') {
      const person = portraitOf(set, registry);
      if (!person || person.kind !== 'person')
        say(
          k,
          'unknown-target',
          `${S}: "${set.person}" is not in the list of what you may name.`,
        );
      else if (!person.picture)
        say(
          k,
          'person-unseen',
          `${S}: ${person.name} has no portrait; show their trace instead${person.trace ? ` (${person.trace.ref})` : ''}, or no person.`,
        );
    }
    if (set.kind === 'photo' || set.kind === 'document') {
      const name = set.kind === 'photo' ? set.photo : set.document;
      const entry = registry.resolve(name);
      if (!entry?.picture)
        say(
          k,
          'unknown-target',
          `${S}: "${name}" is no picture the desk cleared; use one the list gives.`,
        );
    }
    if (set.kind === 'plain')
      say(
        k,
        'word-card',
        `${S}: blank paper is no picture, and words on it stand in for one; show what the line is about.`,
      );
    const named = setIsNamed(set, registry);
    if (named)
      say(
        k,
        'named-set',
        `${S}: a drawn set shows a kind of place, never a named one ("${named}"); show a named place on the map.`,
      );

    // Its information.
    for (const info of shot.info) {
      if (!(INFO_RECIPES as readonly string[]).includes(info.recipe)) {
        say(k, 'unknown-recipe', `${S}: "${info.recipe}" is no recipe.`);
        continue;
      }
      const misfit = recipeMisfit(info, shot, registry);
      if (misfit) {
        const target = targetIn(shot, info.target, registry);
        const person =
          target?.kind === 'entry' &&
          target.entry.kind === 'person' &&
          !target.entry.picture;
        say(
          k,
          info.target && !target
            ? 'unknown-target'
            : person
              ? 'person-unseen'
              : 'wrong-target',
          `${S}: ${misfit}.`,
        );
      }
      if (info.text && !info.target)
        say(
          k,
          'word-card',
          `${S}: "${info.text}" floats on its own; a label is pinned to what it names.`,
        );
      if (info.recipe === 'label' && !info.text)
        say(k, 'wrong-target', `${S}: a label needs its words (one to three).`);
      if (
        info.recipe === 'label' &&
        info.text &&
        !labelNames(info.text, targetIn(shot, info.target, registry), given)
      )
        say(
          k,
          'label-names',
          `${S}: the label "${info.text}" does not name what it is on (${info.target}); a label names it, never repeats the voice.`,
        );
      for (const words of [info.text, info.replace])
        if (words && wordsIn(words) > TEXT.labelWordsMax)
          say(
            k,
            'long-label',
            `${S}: "${words}" has ${wordsIn(words)} words; a label has at most ${TEXT.labelWordsMax}.`,
          );
      if ([info.text, info.replace].some((w) => w && AUDIENCE.test(w)))
        say(
          k,
          'audience',
          `${S}: the audience is never on screen ("${info.text ?? info.replace}").`,
        );
      if (info.colour && !colourName(info.colour, registry))
        say(
          k,
          'unknown-colour',
          `${S}: "${info.colour}" is no colour of the show; use a side's name, or ink, muted, accent or held.`,
        );
      for (const [words, label] of [
        [info.on, 'on'],
        [info.until, 'until'],
      ] as const) {
        if (!words) continue;
        const there = phraseAt(n, words, Math.max(0, at));
        if (phraseAt(n, words) < 0)
          say(
            k,
            'phrase-missing',
            `${S}: "${words}" (${label}) is not in the narration.`,
          );
        else if (at >= 0 && (there < 0 || there >= next))
          say(
            k,
            'outside-shot',
            `${S}: "${words}" (${label}) is not said while the shot is on.`,
          );
      }
    }
    for (const move of shot.camera) {
      if (!(CAMERA_MOVES as readonly string[]).includes(move.move)) {
        say(k, 'unknown-move', `${S}: "${move.move}" is no camera move.`);
        continue;
      }
      const target = targetIn(shot, move.target, registry);
      if (move.target && !target)
        say(
          k,
          'unknown-target',
          `${S}: the camera's "${move.target}" is not in the list of what you may name.`,
        );
      else if (target && !shownBy(shot, target))
        say(
          k,
          'wrong-target',
          `${S}: the camera's ${target.name} is not in this shot's picture (${setWords(set)}).`,
        );
      if (move.amount && !(AMOUNTS as readonly string[]).includes(move.amount))
        say(
          k,
          'unknown-amount',
          `${S}: "${move.amount}" is no amount; small, medium or large.`,
        );
      const there = phraseAt(n, move.on, Math.max(0, at));
      if (phraseAt(n, move.on) < 0)
        say(
          k,
          'phrase-missing',
          `${S}: the camera's "${move.on}" is not in the narration.`,
        );
      else if (at >= 0 && (there < 0 || there >= next))
        say(
          k,
          'outside-shot',
          `${S}: the camera's "${move.on}" is not said while the shot is on.`,
        );
    }

    // One subject, shown by its set.
    const focal = targetIn(shot, shot.focal, registry);
    if (!shot.focal)
      say(
        k,
        'no-focal',
        `${S} needs one subject (focal): what the shot is about.`,
      );
    else if (!focal || !shownBy(shot, focal))
      say(
        k,
        'no-focal',
        `${S}: its subject "${shot.focal}" is not in its picture; name what its set shows.`,
      );
    else if (
      focal.kind === 'entry' &&
      focal.entry.kind === 'person' &&
      !focal.entry.picture
    )
      say(k, 'person-unseen', `${S}: ${focal.name} has no portrait.`);

    // The stage's words, and the truth of its numbers.
    const words = stageWords(shot);
    if (words > TEXT.stageWordsMax)
      say(
        k,
        'too-many-words',
        `${S} puts ${words} words on the stage; at most ${TEXT.stageWordsMax}.`,
      );
    const untrue = [...new Set(stageNumbers(shot))].filter(
      (v) => !given.has(v),
    );
    if (untrue.length)
      say(
        k,
        'untrue-number',
        `${S}: ${untrue.join(', ')} ${untrue.length === 1 ? 'is no number' : 'are no numbers'} the research or the lines give; show only theirs.`,
      );
  });
  return problems;
}

/** The problems a second try is asked to put right, worst first: those code can only mend by dropping what was asked. */
export const SERIOUS = new Set([
  'no-shots',
  'phrase-missing',
  'out-of-order',
  'unknown-target',
  'unknown-set',
  'unknown-chart',
  'chart-empty',
  'word-card',
  'person-unseen',
  'silhouette-person',
  'named-set',
  'untrue-number',
  'untrue-quote',
  'no-map',
  'wrong-target',
  'too-many-words',
]);

/** How bad a plan's problems are: serious ones count most. */
export const weightOf = (problems: readonly ShotProblem[]) =>
  problems.reduce((n, p) => n + (SERIOUS.has(p.code) ? 3 : 1), 0);

// ── The mend ──────────────────────────────────────────────────────────────

/** What mendPlan is told beyond checkPlan: whether the first shot is moved to the first words. */
export interface MendOptions extends PlanOptions {
  /** The first shot starts on the narration's first words (default true); off while lines still wait for safe shots. */
  start?: boolean;
}

/** How much a shot shows: its information, and a chart's, a portrait's or a picture's own. */
export const shows = (shot: PlanShot) =>
  shot.info.length +
  (['chart', 'portrait', 'photo', 'document'].includes(shot.set.kind) ? 2 : 0);

/** Whether two shots show one set: the show's map is one map whatever its tilt; any other set, the same in every field. */
export const sameSet = (a: PlanSet, b: PlanSet) =>
  a.kind === b.kind &&
  (a.kind === 'map' ||
    (a.kind === 'set' && b.kind === 'set'
      ? JSON.stringify(placeOfSet(a.set)) === JSON.stringify(placeOfSet(b.set))
      : JSON.stringify(a) === JSON.stringify(b)));

/** A drawn set's place, without what changes while it is on (its light's change, its tag): one place for two shots that show it. */
export const placeOfSet = (set: PlanSetScene): PlanSetScene => {
  const { becomes: _b, illustration: _i, ...place } = set;
  void _b;
  void _i;
  return place;
};

/** Two shots' set made one: the first's, keeping a change of light or a tag the second had. */
function mergedSet(a: PlanSet, b: PlanSet): PlanSet {
  if (a.kind !== 'set' || b.kind !== 'set') return a;
  const becomes = a.set.becomes ?? b.set.becomes;
  const illustration = a.set.illustration || b.set.illustration;
  return {
    kind: 'set',
    set: {
      ...a.set,
      ...(becomes ? { becomes } : {}),
      ...(illustration ? { illustration: true } : {}),
    },
  };
}

/**
 * A person's portrait set with no portrait, shown by their trace: their
 * own words as a quote, or the show's map with their place pinned; null
 * when they have neither.
 */
function traceShot(
  shot: PlanShot,
  person: RegistryEntry,
  registry: TargetRegistry,
): PlanShot | null {
  if (person.trace?.kind === 'quote') {
    const claim = registry.resolve(person.trace.ref);
    const text = claim ? quotedWords(claim.about) : '';
    if (!text) return null;
    return {
      ...shot,
      set: {
        kind: 'chart',
        chart: {
          kind: 'quote',
          spec: {
            text,
            speaker: clip(splitTarget(person.name).rest, 4),
            when: null,
          },
        },
      },
      info: [],
      focal: WHOLE_SET,
    };
  }
  if (person.trace?.kind === 'place') {
    const place = registry.resolve(person.trace.ref);
    if (!place) return null;
    return {
      ...shot,
      set: { kind: 'map', tilt: 'flat' },
      info: place.geo
        ? [{ recipe: 'pin', target: place.name, on: shot.on }]
        : [],
      camera: [
        { move: 'push', target: place.name, on: shot.on, amount: 'small' },
      ],
      focal: place.name,
    };
  }
  return null;
}

/** A quote claim's own words: what is inside its quotation marks, else its text. */
export function quotedWords(about: string): string {
  const text = about.replace(/^quote:\s*/u, '');
  const inner = /[“"]([^”"]{8,})(?:[”"]|$)/u.exec(text)?.[1];
  return clip(inner ?? text, 30);
}

/** A shot's set's own subject, for a shot that named none. */
function subjectOf(shot: PlanShot, registry: TargetRegistry): string {
  const shown = (name: string | undefined) => {
    const t = targetIn(shot, name, registry);
    return t && t.kind !== 'set' && shownBy(shot, t) ? t.name : null;
  };
  if (shot.set.kind === 'map' || shot.set.kind === 'set') {
    for (const move of shot.camera) {
      const t = shown(move.target);
      if (t) return t;
    }
    for (const info of shot.info) {
      const t = shown(info.target);
      if (t) return t;
    }
  }
  if (shot.set.kind === 'portrait') return shot.set.person;
  return WHOLE_SET;
}

/** A shot's information and camera held to its set, the registry and the rules; its words cut to the budget. */
function mendShot(
  shot: PlanShot,
  registry: TargetRegistry,
  given: Set<number>,
  kit: readonly string[],
): PlanShot | null {
  let out: PlanShot = {
    ...shot,
    actors: shot.actors.filter((a) => kit.includes(a.kit)),
    life: shot.life.filter((l) =>
      (LIFE_EFFECTS as readonly string[]).includes(l),
    ),
    join: joinOf(shot.join) ?? 'cut',
  };
  // A portrait with no portrait is the person's trace, or no shot.
  if (out.set.kind === 'portrait') {
    const person = portraitOf(out.set, registry);
    if (!person || person.kind !== 'person') return null;
    if (!person.picture) {
      const traced = traceShot(out, person, registry);
      if (!traced) return null;
      out = traced;
    } else out = { ...out, set: { ...out.set, person: person.name } };
  }
  if (out.set.kind === 'photo' || out.set.kind === 'document') {
    const entry = registry.resolve(
      out.set.kind === 'photo' ? out.set.photo : out.set.document,
    );
    if (!entry?.picture) return null;
    out =
      out.set.kind === 'photo'
        ? { ...out, set: { ...out.set, photo: entry.name } }
        : { ...out, set: { ...out.set, document: entry.name } };
  }
  // A drawn set never takes a real place's name.
  if (out.set.kind === 'set' && setIsNamed(out.set, registry)) {
    const { era: _named, ...rest } = out.set.set;
    void _named;
    out = { ...out, set: { kind: 'set', set: rest } };
  }
  if (out.set.kind === 'chart') {
    const chart = out.set.chart;
    if (
      !(CHART_KINDS as readonly string[]).includes(chart.kind) ||
      !chartReady(chart)
    )
      return null;
    // A counter's number is the one it counts, as the research gives it.
    if (chart.kind === 'counter') {
      const counted = out.info
        .filter((i) => i.recipe === 'count' || i.recipe === 'grow')
        .map((i) => registry.resolve(i.target ?? ''))
        .find((e) => e?.kind === 'number' && e.value !== undefined);
      const shown = numberIn(chart.spec.value);
      if (counted && (shown === undefined || !given.has(shown)))
        out = {
          ...out,
          set: {
            kind: 'chart',
            chart: {
              kind: 'counter',
              spec: {
                ...chart.spec,
                value: counted.value,
                unit: counted.unit ?? chart.spec.unit ?? null,
              },
            },
          },
        };
    }
    // A quote is its claim's own words: taken from the claim it names when
    // the board's differ, else no quote at all.
    if (chart.kind === 'quote' && !quoteIsTrue(chart, registry)) {
      const claim = registry.resolve(line(chart.spec.claim, 12));
      const text =
        claim?.kind === 'claim' && claim.about.startsWith('quote:')
          ? quotedWords(claim.about)
          : '';
      if (!text) return null;
      out = {
        ...out,
        set: {
          kind: 'chart',
          chart: { kind: 'quote', spec: { ...chart.spec, text } },
        },
      };
    }
    const now = out.set.kind === 'chart' ? out.set.chart : chart;
    if (chartNumbers(now).some((v) => !given.has(v))) return null;
    if (chartIsName(now, registry)) return null;
  }
  // Blank paper shows nothing a target can be on: no picture at all.
  if (out.set.kind === 'plain') return null;

  // Information: each on what its set shows, its words and numbers true.
  const info = out.info.flatMap((raw): PlanInfo[] => {
    const recipe = recipeOf(raw.recipe);
    if (!recipe) return [];
    let item: PlanInfo = { ...raw, recipe };
    const named = targetIn(out, item.target, registry);
    const towards = targetIn(out, item.to, registry);
    // The whole set is a shot's subject, never what a recipe acts on.
    const target = named?.kind === 'set' ? null : named;
    const to = towards?.kind === 'set' ? null : towards;
    item = {
      ...item,
      ...(target ? { target: target.name } : {}),
      ...(to ? { to: to.name } : {}),
    };
    if (named?.kind === 'set') delete item.target;
    if (item.to && !to) delete item.to;
    if (item.target && !target) return [];
    // A label's words name what it is on: its own words when they do, else
    // the name of what it labels.
    if (item.text) item.text = clip(item.text, TEXT.labelWordsMax);
    if (
      item.recipe === 'label' &&
      target &&
      (!item.text || !labelNames(item.text, target, given))
    ) {
      const name = clip(nameOf(target), TEXT.labelWordsMax);
      if (name) item.text = name;
    }
    if (item.replace) item.replace = clip(item.replace, TEXT.labelWordsMax);
    if (item.text && (!item.target || AUDIENCE.test(item.text))) return [];
    if (item.replace && AUDIENCE.test(item.replace)) delete item.replace;
    if (recipeMisfit(item, out, registry)) return [];
    // A count's value is its number's; on a chart's part, the part's own.
    if (item.recipe === 'count' || item.recipe === 'grow') {
      if (target?.kind === 'entry' && target.entry.kind === 'number') {
        item.value = target.entry.value;
        if (target.entry.unit) item.unit = target.entry.unit;
        else delete item.unit;
        delete item.from;
      } else {
        delete item.value;
        delete item.from;
        delete item.unit;
      }
    }
    for (const key of ['value', 'from'] as const)
      if (item[key] !== undefined && item[key] !== 0 && !given.has(item[key]))
        delete item[key];
    if (item.text && numbersIn(item.text).some((v) => !given.has(v))) return [];
    if (item.replace && numbersIn(item.replace).some((v) => !given.has(v)))
      delete item.replace;
    if (item.colour) {
      const colour = colourName(item.colour, registry);
      if (colour) item.colour = colour;
      else delete item.colour;
    }
    return [item];
  });
  const camera = out.camera.flatMap((raw): PlanCamera[] => {
    const move = moveOf(raw.move);
    if (!move) return [];
    const target = targetIn(out, raw.target, registry);
    const amount = raw.amount ? amountOf(raw.amount) : null;
    const { target: _t, amount: _a, ...rest } = raw;
    void _t;
    void _a;
    return [
      {
        ...rest,
        move,
        ...(target && target.kind !== 'set' && shownBy(out, target)
          ? { target: target.name }
          : {}),
        ...(amount ? { amount } : {}),
      },
    ];
  });
  out = {
    ...out,
    info: info.slice(0, SHOT_LIMITS.info),
    camera: camera.slice(0, SHOT_LIMITS.camera),
  };
  // The stage's words: labels go first (the last first), then the chart's own.
  while (stageWords(out) > TEXT.stageWordsMax) {
    const last = out.info
      .map((i) => Boolean(i.text || i.replace))
      .lastIndexOf(true);
    if (last < 0) break;
    out = { ...out, info: out.info.filter((_, k) => k !== last) };
  }
  if (out.set.kind === 'chart' && stageWords(out) > TEXT.stageWordsMax) {
    const chart = fewerWords(out.set.chart, TEXT.stageWordsMax);
    if (!chartReady(chart)) return null;
    out = { ...out, set: { kind: 'chart', chart } };
  }
  // One subject, shown by the set.
  const focal = targetIn(out, out.focal, registry);
  const seen =
    focal &&
    shownBy(out, focal) &&
    !(
      focal.kind === 'entry' &&
      focal.entry.kind === 'person' &&
      !focal.entry.picture
    );
  out = { ...out, focal: seen ? focal.name : subjectOf(out, registry) };
  return out;
}

/**
 * A plan put right silently, the board's work kept wherever it can be:
 * each shot held to the registry, its set and the rules (mendShot), each
 * phrase found in the narration or snapped to the words nearest it (a
 * shot whose words cannot be found goes, and the shot before carries
 * on), the shots in the order of their words, each phrase said once, and
 * the first shot on the first words.
 */
export function mendPlan(
  plan: ShotPlan,
  narration: string,
  registry: TargetRegistry,
  options: MendOptions = {},
): ShotPlan {
  const n = narrationOf(narration);
  const kit = options.kit ?? [];
  const map =
    options.map ??
    registry.entries().some((e) => e.kind === 'region' || e.kind === 'seam');
  const given = givenNumbers(narration, registry);
  const counts = peopleCounts(narration, registry);
  if (!n.keys.length) return { shots: [] };

  // Each shot on its own: its set, names, words and numbers.
  let shots = plan.shots
    .map((shot) => mendShot(shot, registry, given, kit))
    .filter((s): s is PlanShot => s !== null)
    .filter(
      (s) =>
        s.set.kind !== 'map' ||
        map ||
        s.info.some((i) => Boolean(registry.resolve(i.target ?? '')?.geo)),
    );

  // Each shot on its words: found, else the words nearest them, else gone.
  const placed = shots.flatMap((shot) => {
    let at = phraseAt(n, shot.on);
    let length = keysOf(shot.on).length;
    if (at < 0) {
      const near = nearestPhrase(n, shot.on);
      if (!near) return [];
      ({ at, length } = near);
    }
    return [{ shot, at, length }];
  });
  // A phrase said more than once: the first time after the shot before.
  let cursor = 0;
  for (const p of placed) {
    const again = phraseAt(n, phraseText(n, p.at, p.length), cursor);
    if (again >= 0) p.at = again;
    cursor = Math.max(cursor, p.at);
  }
  placed.sort((a, b) => a.at - b.at);
  // Two shots on the same words are one: the first, with what the second adds.
  const kept: typeof placed = [];
  for (const p of placed) {
    const before = kept[kept.length - 1];
    if (before && before.at === p.at) {
      if (sameSet(before.shot.set, p.shot.set))
        before.shot = {
          ...before.shot,
          info: [...before.shot.info, ...p.shot.info].slice(
            0,
            SHOT_LIMITS.info,
          ),
          camera: [...before.shot.camera, ...p.shot.camera].slice(
            0,
            SHOT_LIMITS.camera,
          ),
        };
      continue;
    }
    kept.push(p);
  }
  // Shots of one set, one after another, are one shot where all they
  // show fits in one: a new shot only for a new set.
  for (let k = kept.length - 1; k > 0; k -= 1) {
    const [a, b] = [kept[k - 1].shot, kept[k].shot];
    // Two shots whose light each changes stay two: one change a shot.
    const changes = [a.set, b.set].filter(
      (set) => set.kind === 'set' && set.set.becomes,
    ).length;
    if (
      sameSet(a.set, b.set) &&
      changes < 2 &&
      a.info.length + b.info.length <= SHOT_LIMITS.info &&
      a.camera.length + b.camera.length <= SHOT_LIMITS.camera
    ) {
      kept[k - 1].shot = {
        ...a,
        set: mergedSet(a.set, b.set),
        info: [...a.info, ...b.info],
        camera: [...a.camera, ...b.camera],
        actors: [
          ...a.actors,
          ...b.actors.filter((x) => !a.actors.some((y) => y.id === x.id)),
        ].slice(0, SHOT_LIMITS.actors),
        life: [...new Set([...a.life, ...b.life])].slice(0, SHOT_LIMITS.life),
        join: b.join,
      };
      kept.splice(k, 1);
    }
  }
  // At most eight a minute: the ones that show least go (never the first).
  const most = mostShots(narration);
  while (kept.length > most) {
    let least = 1;
    for (let k = 2; k < kept.length; k += 1)
      if (shows(kept[k].shot) < shows(kept[least].shot)) least = k;
    kept.splice(least, 1);
  }
  if (options.start !== false && kept.length && kept[0].at > 0) {
    kept[0].at = 0;
    kept[0].length = Math.min(3, n.keys.length);
  }

  shots = kept.map((p, k) => {
    const start = p.at;
    const end = kept[k + 1]?.at ?? n.keys.length;
    const own = uniquePhrase(n, p.at, Math.min(p.length, PHRASE_MOST));
    // Each item's words inside its shot: found, else nearest, else the shot's own.
    const within = (
      words: string | undefined,
    ): { at: number; length: number } | null => {
      if (!words) return null;
      const there = phraseAt(n, words, start, end);
      if (there >= 0) return { at: there, length: keysOf(words).length };
      return nearestPhrase(n, words, start, end);
    };
    const said = (spot: { at: number; length: number }) => {
      const u = uniquePhrase(n, spot.at, Math.min(spot.length, PHRASE_MOST));
      return phraseText(n, u.at, u.length);
    };
    const info = p.shot.info.map((item) => {
      const spot = within(item.on) ?? { at: start, length: own.length };
      const out: PlanInfo = { ...item, on: said(spot) };
      const until = within(item.until);
      if (until && until.at > spot.at) out.until = said(until);
      else delete out.until;
      return out;
    });
    const camera = p.shot.camera.map((move) => {
      const spot = within(move.on) ?? { at: start, length: own.length };
      return { ...move, on: said(spot) };
    });
    // A drawn set's change of light, on words inside its shot.
    const set: PlanSet =
      p.shot.set.kind === 'set' && p.shot.set.set.becomes
        ? {
            kind: 'set',
            set: {
              ...p.shot.set.set,
              becomes: {
                ...p.shot.set.set.becomes,
                on: said(
                  within(p.shot.set.set.becomes.on) ?? {
                    at: start,
                    length: own.length,
                  },
                ),
              },
            },
          }
        : p.shot.set;
    const named = personNamed(n, registry, start, end);
    const actors = p.shot.actors
      .map((actor) => soundActor(actor, registry, counts, named))
      .filter((a): a is PlanActor => a !== null)
      .map((actor) =>
        actor.moves
          ? {
              ...actor,
              moves: actor.moves.map((move) => ({
                ...move,
                on: said(within(move.on) ?? { at: start, length: own.length }),
              })),
            }
          : actor,
      );
    return {
      ...p.shot,
      set,
      on: phraseText(n, own.at, own.length),
      info,
      camera,
      actors,
    };
  });

  // The same set carried into the next shot continues it.
  shots = shots.map((shot, k) => {
    const next = shots[k + 1];
    return next && sameSet(shot.set, next.set) && shot.join === 'cut'
      ? { ...shot, join: 'continue' }
      : shot;
  });
  return { shots };
}

// ── The safe shot ─────────────────────────────────────────────────────────

/** A shot, every field present. */
const shotOf = (
  shot: Partial<PlanShot> & Pick<PlanShot, 'on' | 'set'>,
): PlanShot => ({
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  ...shot,
});

/**
 * The camera move that carries a shot on over a line with nothing new: a
 * slow push on its subject, or a pull after a push, so the picture holds
 * and keeps alive.
 */
export function carryMove(shot: PlanShot, on: string): PlanCamera {
  const pushed = shot.camera.some((c) => c.move === 'push');
  return {
    move: pushed ? 'pull' : 'push',
    on,
    amount: 'small',
    ...(shot.focal && shot.focal !== WHOLE_SET ? { target: shot.focal } : {}),
  };
}

/**
 * A line's picture when the board gave it none, by the research's
 * ladder: the show's map held with a slow push on the line's place (a
 * pin, or a region filling); a count of the line's number; its exact
 * words as a quote; else the shot before carried on with the camera
 * moving (a push, or a pull after a push), so the picture holds and keeps
 * alive; else the shot after it, begun early; else the whole map, the
 * research's dates, or a quiet drawn set. Never words standing in for a
 * picture.
 */
export function safeShot(
  row: Pick<EditorialRow, 'say' | 'claims' | 'visual'>,
  registry: TargetRegistry,
  world: Pick<EditorWorld, 'base' | 'era'> | null,
  around: { previous?: PlanShot | null; next?: PlanShot | null } = {},
): PlanShot {
  const n = narrationOf(row.say);
  const on = wordsFrom(n, 0, 3);
  const all = registry.entries();
  const lineKeys = ` ${n.keys.join(' ')} `;
  const named = (name: string) => {
    const keys = keysOf(splitTarget(name).rest).join(' ');
    return Boolean(keys) && lineKeys.includes(` ${keys} `);
  };
  const rests = (e: RegistryEntry) => e.claims ?? (e.claim ? [e.claim] : []);
  const mine = (e: RegistryEntry) =>
    rests(e).some((id) => row.claims.includes(id));
  const base = readMapBase(world?.base);

  // 1. The show's map, held with a slow push on the line's place.
  if (base) {
    const place =
      all.find((e) => e.kind === 'place' && e.geo && named(e.name)) ??
      all.find(
        (e) =>
          e.kind === 'region' &&
          [looseKey(splitTarget(e.name).rest), ...(e.aliases ?? [])].some(
            (a) => a && lineKeys.includes(` ${a} `),
          ),
      );
    if (place)
      return shotOf({
        on,
        set: { kind: 'map', tilt: 'flat' },
        info: [
          {
            recipe: place.kind === 'place' ? 'pin' : 'fill',
            target: place.name,
            on,
          },
        ],
        camera: [{ move: 'push', target: place.name, on, amount: 'small' }],
        life: ['cloud-shadows'],
        focal: place.name,
      });
  }
  // 2. A count of the line's number.
  const lineNumbers = new Set(numbersIn(row.say));
  const number =
    all.find((e) => e.kind === 'number' && mine(e) && e.value !== undefined) ??
    all.find(
      (e) =>
        e.kind === 'number' &&
        e.value !== undefined &&
        lineNumbers.has(e.value),
    );
  if (number)
    return shotOf({
      on,
      set: {
        kind: 'chart',
        chart: {
          kind: 'counter',
          spec: {
            value: number.value,
            unit: number.unit ? clip(number.unit, 2) : null,
            prefix: null,
            label:
              shortLabel(
                splitTarget(number.name).rest.replace(/^c\d+$/u, ''),
                TEXT.labelWordsMax,
              ) || null,
            then: null,
            ...(number.source ? { source: number.source } : {}),
          },
        },
      },
      info: [{ recipe: 'count', target: number.name, on }],
      focal: WHOLE_SET,
    });
  // 3. Exact words: a quote of them.
  if (row.visual === 'exact-words') {
    const quote = all.find(
      (e) => e.kind === 'claim' && e.about.startsWith('quote:') && mine(e),
    );
    if (quote)
      return shotOf({
        on,
        set: {
          kind: 'chart',
          chart: {
            kind: 'quote',
            spec: { text: quotedWords(quote.about), speaker: null, when: null },
          },
        },
        life: ['grain'],
        focal: WHOLE_SET,
      });
  }
  // 4. The shot before, carried on with the camera moving.
  const { previous, next } = around;
  if (previous)
    return shotOf({
      on,
      set: previous.set,
      camera: [carryMove(previous, on)],
      life: previous.life,
      join: 'continue',
      focal: previous.focal ?? WHOLE_SET,
    });
  // 5. The shot after, its set begun early.
  if (next)
    return shotOf({
      on,
      set: next.set,
      camera: [{ move: 'establish', on }],
      life: next.life,
      join: 'continue',
      focal: WHOLE_SET,
    });
  // 6. The whole map; the research's dates; a quiet drawn set.
  if (base)
    return shotOf({
      on,
      set: { kind: 'map', tilt: 'flat' },
      camera: [{ move: 'establish', on }],
      life: ['cloud-shadows'],
      focal: WHOLE_SET,
    });
  const dates = all.filter((e) => e.kind === 'date').slice(0, 4);
  if (dates.length >= 2)
    return shotOf({
      on,
      set: {
        kind: 'chart',
        chart: {
          kind: 'timeline',
          spec: {
            events: dates.map((d) => ({
              when: splitTarget(d.name).rest,
              name: clip(d.about, 2),
            })),
          },
        },
      },
      camera: [{ move: 'establish', on }],
      focal: WHOLE_SET,
    });
  return shotOf({
    on,
    set: { kind: 'set', set: { land: 'plain', time: 'day' } },
    camera: [{ move: 'establish', on }],
    life: ['drift'],
    focal: WHOLE_SET,
  });
}
