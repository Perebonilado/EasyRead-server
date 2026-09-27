/**
 * A story's scene sheet as the stage plays it: exactly what the sheet says
 * and nothing else. Who is on the stage is who the sheet has there, in the
 * order of their spots, left to right; who says a line is who the sheet
 * says; each action, reaction and thing handled comes where the sheet has
 * it, at its own moment in the quiet after the line before it, one after
 * another in the sheet's order, each as long as the list of doings says
 * it takes. Nothing is guessed from the words, as a book's page must be:
 * the sheet already said it all.
 *
 * Every doing has something the stage plays for it: its own move where
 * the stage has one, else the nearest it has, never nothing. Where it is
 * aimed comes from its target (someone, a feature of the set, a side),
 * never from words like "down" in its description.
 *
 * The one thing read from the words is what the narrator says someone
 * does ("Mama waved"), acted as it is said, so that a gesture the
 * narration tells is seen; and only by someone on the stage.
 */
import { faceOfLine } from '../scene-feeling';
import { directionsIn, doingsIn, type Actor } from '../scene-directions';
import {
  THING_WORDS,
  aimedFeature,
  bobbingMove,
  doingOf,
  fallbackFor,
  featureAim,
  featureIdOf,
  featureStatesIn,
  featureWordsOf,
  isStageProp,
  type AnyFeatureKind,
  type Doing,
  type DoingId,
  type StageMove,
  type ThingAction,
} from '../scene-doings';
import { STATION_SHARES } from '../scene-layout';
import { genderOf } from '../scene-script';
import { PROP_KIND } from '../scene-props';
import { DRAWN, ownWords } from '../scene-own';
import {
  fitLayout,
  type SceneBeat,
  type SceneEffect,
  type SceneFeature,
  type SceneFeatureState,
  type SceneGoing,
  type SceneScript,
  type SceneStage,
  type SceneStep,
  type SceneThing,
} from '../scene-script';
import {
  STORY_VERSION,
  type StoryBible,
  type StoryCharacter,
  type StoryPlace,
} from '../scene-story';
import { isGear, type FigureFace } from '../scene-figure';
import {
  SPOTS,
  type SheetBeat,
  type SheetShot,
  type Spot,
  type StorySheet,
  type StudioBible,
  type StudioCharacter,
  type StudioFeature,
  handledOn,
  kindOn,
  namesOf,
} from './studio';

/**
 * The most a quiet between two lines holds, in seconds: a throw, a chase
 * and a pick-up under the music. Longer, and the writer is asked to break
 * it with a line; the stage quickens what is there to fit.
 */
export const QUIET_MOST_S = 6;
/** A face changing: how long it holds the eye before what comes next. */
const REACTION_S = 0.6;
/** What comes after someone else's doing starts this long after its moment. */
const AFTER_MOMENT_S = 0.15;
/** A quiet's first moment begins this long after the last word before it (the stage's AFTER_WORDS_MS). */
const QUIET_STARTS_S = 0.15;
/** How a line said with a feeling lands on the one it is said to. */
const LANDS: Partial<Record<FigureFace, FigureFace>> = {
  angry: 'afraid',
  sad: 'sad',
  happy: 'happy',
  surprised: 'surprised',
  pain: 'sad',
};

/** The signs that move a whole body, as one the artist drew moves for them: up in a jump, a shake, a shiver. */
const SIGN_MOVES: Partial<Record<string, { move: StageMove; doing: DoingId }>> =
  {
    jumping: { move: 'jump', doing: 'jump' },
    shaking: { move: 'shake-off', doing: 'shake-off' },
    shivering: { move: 'wriggle', doing: 'wriggle' },
  };

const phraseOf = (text: string) =>
  text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
const round = (n: number) => Math.round(n * 100) / 100;

/** One thing done in a quiet between lines, as its timing sees it. */
export interface QuietItem {
  who: string | null;
  /** A thing handled: the next one handled waits until it has changed hands. */
  handles: boolean;
  /** A pause: nothing starts until it is over, and it starts when all before it are. */
  pause: boolean;
  /** How long it takes, and how short it may be made, in seconds. */
  s: number;
  leastS: number;
  /** How far into it its moment comes. */
  keyAt: number;
}

/** A beat of the sheet that is not spoken, as the quiet's timing sees it. */
export function quietItem(beat: SheetBeat): QuietItem {
  if (beat.kind === 'pause') {
    const s = beat.seconds ?? 1;
    return { who: null, handles: false, pause: true, s, leastS: s, keyAt: 1 };
  }
  if (beat.kind === 'reaction')
    return {
      who: beat.who,
      handles: false,
      pause: false,
      s: REACTION_S,
      leastS: 0.4,
      keyAt: 0.5,
    };
  const doing = doingOf(beat.do) ?? doingOf('nod')!;
  // Across the stage to where the check measured: as long as the walk
  // across takes (coming on and going off, as long as the list says).
  if ('step' in doing.plays && doing.plays.step === 'walk' && beat.seconds)
    return {
      who: beat.who,
      handles: false,
      pause: false,
      s: Math.max(doing.leastMs / 1000, beat.seconds),
      leastS: doing.leastMs / 1000,
      keyAt: doing.keyAt,
    };
  // A throw to someone runs on until it is caught: as long as it flies at
  // most, and the catch's own end.
  const caught =
    beat.do === 'throw' && beat.to
      ? FLIES_MOST_S + CATCH_AFTER_S - (1 - doing.keyAt) * (doing.ms / 1000)
      : 0;
  return {
    who: beat.who,
    handles: beat.kind === 'business',
    pause: false,
    s: doing.ms / 1000 + Math.max(0, caught),
    leastS: doing.leastMs / 1000 + Math.max(0, caught),
    keyAt: (doing.keyAt * doing.ms) / (doing.ms + Math.max(0, caught) * 1000),
  };
}

/** How long a thing thrown flies, in seconds, by how many spots it goes across: from the release to the catch. */
export const fliesS = (spots: number) =>
  Math.round((0.45 + 0.13 * Math.min(4, Math.max(1, spots))) * 100) / 100;
/** The longest a throw across the stage flies; and a catch's end, after it arrives. */
const FLIES_MOST_S = fliesS(4);
const CATCH_AFTER_S = 0.4;

/** Where a spot is across the stage, as a share of its width: where a thing thrown there lands. */
const SPOT_SHARE: Record<Spot | 'back', number> = {
  ...STATION_SHARES,
  back: 0.5,
};
/** The spot nearest a share of the stage across. */
const nearestSpot = (share: number): Spot =>
  SPOTS.reduce((best, spot) =>
    Math.abs(SPOT_SHARE[spot] - share) < Math.abs(SPOT_SHARE[best] - share)
      ? spot
      : best,
  );

/**
 * Where a set's painting shows each feature it has, as a share of the
 * stage across: the middle of the painter's group for it ("f-goalpost"),
 * found by its own name or as the gate matched it. None for a set not
 * painted, or painted with none.
 */
export function paintedAt(
  set:
    | {
        drawing: { parts?: Readonly<Record<string, string>> };
        ground?: {
          boxes?: Readonly<Record<string, [number, number, number, number]>>;
        };
      }
    | null
    | undefined,
): Record<string, number> {
  const boxes = set?.ground?.boxes ?? {};
  const out: Record<string, number> = {};
  const middle = (box: [number, number, number, number]) =>
    Math.round(((box[0] + box[2]) / 2) * 1000) / 1000;
  for (const [group, box] of Object.entries(boxes))
    if (group.startsWith('f-')) out[group.slice(2)] = middle(box);
  for (const [part, found] of Object.entries(set?.drawing.parts ?? {}))
    if (part.startsWith('f-') && boxes[found])
      out[part.slice(2)] = middle(boxes[found]);
  return out;
}
/** A point on the ground, as a stage's own `does` names it: "@0.88". */
const groundAt = (share: number) =>
  `@${Math.round(Math.min(0.96, Math.max(0.04, share)) * 100) / 100}`;
/** How far past someone a thing thrown for them to fetch lands, as a share of the stage. */
const THROWN_PAST = 0.16;
/** How far beside a feature someone stands by it, as a share of the stage. */
const BESIDE = 0.1;
/** Nearer than this across the stage, going there is going nowhere to see. */
const NEAR = 0.11;
/** How far across the stage a runner goes in a second, as a share of it (the stage's walk across in four, quickened 2.2 times). */
const RUN_SHARE_S = 2.2 / 4;
/** The longest a run out and back takes. */
const OUT_MOST_S = 3;
/** What is done touching someone: done beside them. */
const TOUCHES: ReadonlySet<DoingId> = new Set(['hug', 'lick', 'sniff']);
/** Farther apart than this across the stage, two are not beside each other. */
const ONE_SPOT = 0.2;

/**
 * Where a station is across the stage, as a share of its width: a spot's
 * own; beside a feature, a little to its left or right; behind one, its
 * own; a point on the ground, its own.
 */
export function stationShare(
  station: string,
  features: ReadonlyMap<string, Pick<StudioFeature, 'spot'>>,
): number {
  if (station in SPOT_SHARE) return SPOT_SHARE[station as Spot];
  if (station.startsWith('@')) return Number(station.slice(1)) || 0.5;
  const behind = /^(?:behind|under|up):(.+)$/.exec(station);
  const hiding = behind ? features.get(behind[1]) : undefined;
  if (hiding) return SPOT_SHARE[hiding.spot];
  const by = /^by:(.+):(-1|1)$/.exec(station);
  const feature = by ? features.get(by[1]) : undefined;
  return feature
    ? SPOT_SHARE[feature.spot] + Number(by![2]) * BESIDE
    : SPOT_SHARE.centre;
}

/** A station beside a feature: on its left (-1) or its right (1). */
export const besideStation = (feature: string, side: -1 | 1) =>
  `by:${feature}:${side}`;
/** A station behind a feature: hidden by it, where it stands. */
export const behindStation = (feature: string) => `behind:${feature}`;
/** A station under a feature (a bench, a table): where it stands, seen. */
export const underStation = (feature: string) => `under:${feature}`;
/** A station up a feature: up a tree, on a wall, where one who climbs it stands. */
export const upStation = (feature: string) => `up:${feature}`;

/** The words for a feature: its kind's or its name's, its name, and its id ("the palm" for the tall palm tree). */
const featureWordsIn = (feature: StudioFeature) =>
  `(?:${featureWordsOf(feature).source}|${escapedWord(feature.name)}|${escapedWord(feature.id.replace(/-/g, ' '))})`;

/**
 * Where some words send a thing up into a feature, or find it caught up
 * there, first first: "a gust whips the kite into the palm", "my kite is
 * stuck in the tree", "the ball lands on top of the wall". `things` by
 * their ids and their words.
 */
export function caughtUpIn(
  text: string,
  things: readonly { id: string; words: RegExp }[],
  features: readonly StudioFeature[],
): { thing: string; feature: string; at: number }[] {
  const out: { thing: string; feature: string; at: number }[] = [];
  for (const thing of things) {
    const named = new RegExp(thing.words.source, 'giu');
    for (const m of text.matchAll(named)) {
      const rest = text.slice(m.index + m[0].length);
      const clause = rest.slice(0, Math.max(0, rest.search(/[.!?;]|$/u)));
      for (const feature of features) {
        const up = new RegExp(
          `^(?:\\s+(?!and\\b|but\\b)[\\p{L}'’-]+){0,4}?\\s+(?:(?:stuck|caught|tangled|lodged|hangs?|hanging|hung|lands?|landed|perched)\\s+)?(?:up\\s+)?(?:into|in|onto|on top of|up)\\s+(?:the|a|an|that|this|its|his|her|their|my|your|our)\\s+(?:[\\p{L}-]+\\s+){0,2}?${featureWordsIn(feature)}\\b`,
          'iu',
        ).exec(clause);
        if (up && !out.some((one) => one.thing === thing.id))
          out.push({ thing: thing.id, feature: feature.id, at: m.index });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Words that find someone somewhere: by it, under it, behind it. */
const PLACED_BY: Record<string, 'by' | 'under' | 'behind'> = {
  by: 'by',
  beside: 'by',
  'next to': 'by',
  near: 'by',
  under: 'under',
  underneath: 'under',
  beneath: 'under',
  behind: 'behind',
};
/** Words before a place that name no one: "There! Under the bench!" */
const NO_ONE_NAMED =
  /^[\s,!]*(?:(?:there|here|oh|over there|quick)[\s,!]*)*$/iu;

/**
 * Where the lines and the narration find someone on the stage, by a
 * feature of the set, under or behind it: "There he is, by the goalpost!",
 * "There! Under the bench!", "Maya waits by the gate." Whom: someone named
 * before it, else "he" or "she" said of whoever was named last, else, with
 * no one named at all, whoever was being looked for: named last, and not
 * the one saying it or the one it is said to. Each one's first only.
 */
export function placementsOf(
  sheet: StorySheet,
  bible: StudioBible,
  features: readonly StudioFeature[],
): {
  who: string;
  feature: string;
  how: 'by' | 'under' | 'behind';
  beat: number;
}[] {
  const actors = bible.characters.map((c) => ({
    id: c.id,
    names: namesOf(c),
    gender: genderOf(c.voice),
  }));
  const gender = new Map(actors.map((a) => [a.id, a.gender]));
  const recent: string[] = [];
  const mention = (id: string | null | undefined) => {
    if (!id || !gender.has(id)) return;
    const i = recent.indexOf(id);
    if (i >= 0) recent.splice(i, 1);
    recent.push(id);
  };
  const namedIn = (text: string) =>
    actors
      .flatMap((a) =>
        a.names.map((name) => ({
          id: a.id,
          at: text.search(new RegExp(`\\b${escapedWord(name)}\\b`, 'u')),
        })),
      )
      .filter((one) => one.at >= 0)
      .sort((a, b) => a.at - b.at);
  const out: ReturnType<typeof placementsOf> = [];
  sheet.beats.forEach((beat, at) => {
    if ((beat.kind === 'line' || beat.kind === 'narration') && beat.say.trim())
      for (const feature of features) {
        const word = `(?:${featureWordsOf(feature).source}|${escapedWord(feature.name)})`;
        const m = new RegExp(
          `\\b(next to|by|beside|near|under|underneath|beneath|behind)\\s+(?:the|a|an|that|this|his|her|their|its)\\s+(?:[\\p{L}-]+\\s+)?${word}`,
          'iu',
        ).exec(beat.say);
        if (!m) continue;
        const sentence = beat.say.slice(0, m.index).search(/[^.!?]*$/u);
        const before = beat.say.slice(sentence, m.index);
        const named = namedIn(before);
        let who: string | null = named[named.length - 1]?.id ?? null;
        if (!who) {
          const said = /\b(he|she|it)\b/iu.exec(before)?.[1]?.toLowerCase();
          const others = [...recent]
            .reverse()
            .filter((id) => id !== beat.who && id !== beat.to);
          const wanted = said === 'he' ? 'm' : said === 'she' ? 'f' : null;
          who = said
            ? (others.find((id) => wanted && gender.get(id) === wanted) ??
              others.find((id) => gender.get(id) === null) ??
              null)
            : NO_ONE_NAMED.test(before)
              ? (others[0] ?? null)
              : null;
        }
        if (who && who !== beat.who && !out.some((o) => o.who === who))
          out.push({
            who,
            feature: feature.id,
            how: PLACED_BY[m[1].toLowerCase()] ?? 'by',
            beat: at,
          });
      }
    mention(beat.who);
    for (const one of namedIn(beat.say)) mention(one.id);
    if (beat.kind === 'action' || beat.kind === 'business') {
      mention(beat.target);
      mention(beat.to);
    }
  });
  return out;
}

const escapedWord = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The side of the stage someone goes off by through a feature: the side
 * it stands on; one at the back in the middle, by the side they are on.
 */
export function featureSide(
  feature: Pick<StudioFeature, 'spot'>,
  from: number,
): '@left' | '@right' {
  const at = SPOT_SHARE[feature.spot];
  if (Math.abs(at - 0.5) > 0.01) return at < 0.5 ? '@left' : '@right';
  return from < 0.5 ? '@left' : '@right';
}

/**
 * What someone who comes on holds: what the scenes before left them with
 * if they were in one, else, new to the episode, what they always carry.
 */
export function comesWith(
  character: StudioCharacter | undefined,
  before:
    | { cast?: string[]; held?: { who: string; thing: string }[] }
    | null
    | undefined,
): string[] {
  if (!character) return [];
  if (before?.cast?.includes(character.id))
    return (before.held ?? [])
      .filter((h) => h.who === character.id)
      .map((h) => h.thing);
  return character.carries ? [character.carries] : [];
}

/**
 * When each thing in a quiet starts, in seconds into it, and how long the
 * quiet runs. One after another in the sheet's order: what someone else
 * does next begins at the moment of the one before (the release of a
 * throw, the chase after it), what the same one does next, and a thing
 * handled next, only once the one before is done; a pause waits for all.
 * A quiet longer than `most` is quickened to fit, none shorter than it
 * may be; `asked` is how long it would have run.
 */
export function timeQuiet(
  items: readonly QuietItem[],
  most = QUIET_MOST_S,
): { starts: number[]; lengths: number[]; total: number; asked: number } {
  const asked = inTurn(
    items,
    items.map((item) => item.s),
  );
  if (asked.end <= most)
    return {
      starts: asked.starts.map(round),
      lengths: items.map((item) => item.s),
      total: round(asked.end),
      asked: round(asked.end),
    };
  // Quickened as little as fits, each in turn after the one it waits for
  // as quickened, from the moment the quiet's first begins: none runs on
  // past the quiet where they may all fit. The quiet itself is as long as
  // a quiet may be.
  const room = most - QUIET_STARTS_S;
  let fit = items.map((item) => item.leastS);
  let [low, high] = [0, 1];
  for (let n = 0; n < 14; n += 1) {
    const share = (low + high) / 2;
    const lengths = items.map((item) => Math.max(item.leastS, item.s * share));
    if (inTurn(items, lengths).end <= room) {
      low = share;
      fit = lengths;
    } else high = share;
  }
  return {
    starts: inTurn(items, fit).starts.map(round),
    lengths: fit.map(round),
    total: most,
    asked: round(asked.end),
  };
}

/** When each thing in a quiet starts, as long as each is given, one after another as timeQuiet has them; and when all are done. */
function inTurn(
  items: readonly QuietItem[],
  lengths: readonly number[],
): { starts: number[]; end: number } {
  const starts: number[] = [];
  const endOf = new Map<string, number>();
  let handled = 0;
  let allDone = 0;
  items.forEach((item, i) => {
    const prev = items[i - 1];
    let at = 0;
    if (prev) {
      const prevAt = starts[i - 1];
      const prevS = lengths[i - 1];
      if (prev.pause || item.pause) at = allDone;
      else if (item.handles && prev.handles) at = prevAt + prevS;
      else if (item.who && item.who === prev.who) at = prevAt + prevS;
      else at = prevAt + prevS * prev.keyAt + AFTER_MOMENT_S;
    }
    if (item.who) at = Math.max(at, endOf.get(item.who) ?? 0);
    if (item.handles) at = Math.max(at, handled);
    starts.push(at);
    const end = at + lengths[i];
    if (item.who) endOf.set(item.who, end);
    if (item.handles) handled = end;
    allDone = Math.max(allDone, end);
  });
  return { starts, end: allDone };
}

/** Each sheet beat that is not spoken, grouped by the spoken beat before it (-1 for before the first). */
export function quietRuns(sheet: StorySheet): Map<number, number[]> {
  const runs = new Map<number, number[]>();
  let spoken = -1;
  sheet.beats.forEach((beat, at) => {
    if (beat.kind === 'line' || beat.kind === 'narration') {
      if (beat.say.trim()) spoken += 1;
      return;
    }
    runs.set(spoken, [...(runs.get(spoken) ?? []), at]);
  });
  return runs;
}

/**
 * The side of the stage someone goes off by: the nearer, as they stand
 * now, left to right; the middle one goes right. Through a feature, the
 * side it stands on.
 */
export function exitSideOf(
  here: ReadonlyMap<string, string>,
  who: string,
  features: ReadonlyMap<string, Pick<StudioFeature, 'spot'>> = new Map(),
  via?: string | null,
): '@left' | '@right' {
  const through = via ? features.get(via) : undefined;
  if (through)
    return featureSide(
      through,
      stationShare(here.get(who) ?? 'centre', features),
    );
  const order = inSpotOrder(here, features);
  const k = order.indexOf(who);
  if (k < 0) return '@right';
  return (k + 0.5) / order.length < 0.5 ? '@left' : '@right';
}

/** The place thing's id: never the same as a character's. */
export const placeThingId = (set: string) => `place-${set}`;

/**
 * The show's bible as a book's story is kept, for the drawing and the
 * voices: each character once (a person drawn by the kit, anyone else by
 * the artist, each in the voice chosen for them), each place once, and
 * each scene a page of it.
 */
export function storyBibleFor(
  bible: StudioBible,
  sheets: readonly StorySheet[],
  title: string,
): StoryBible {
  const firstIn = (id: string) => {
    const at = sheets.findIndex(
      (sheet) =>
        sheet.onStage.some((p) => p.who === id) ||
        sheet.beats.some((b) => b.who === id),
    );
    return at >= 0 ? at + 1 : 1;
  };
  const characters: StoryCharacter[] = bible.characters.map((c, met) => ({
    id: c.id,
    name: c.name,
    aliases: [],
    role: c.role,
    look: c.look,
    traits: c.traits,
    firstPage: firstIn(c.id),
    met,
    voice: c.voice,
    kind: c.kind,
    size: c.size,
    figure: c.figure,
    presence: 'seen',
    // Only gear is drawn in a hand for good; the rest are things of their own.
    carries: isGear(c.carries) ? c.carries : null,
    voicePick: c.voicePick,
  }));
  const places: StoryPlace[] = bible.sets.map((s) => ({
    id: s.id,
    name: s.name,
    aliases: [],
    look: s.look,
    firstPage: Math.max(1, sheets.findIndex((sheet) => sheet.set === s.id) + 1),
    sound: s.sound,
    kind: s.kind,
    stand: s.stand,
    front: s.front,
    // A Studio set's, even none: the painter is asked for its own groups.
    features: (s.features ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      spot: f.spot,
    })),
  }));
  return {
    characters,
    places,
    pages: sheets.map((sheet, k) => ({
      page: k + 1,
      summary: sheet.title,
      present: sheet.onStage.map((p) => ({
        id: p.who,
        mood: p.face === 'pain' ? 'sad' : p.face,
      })),
      place: sheet.set || null,
      time: sheet.time,
      weather: sheet.weather,
      crowd: sheet.crowd,
    })),
    world: bible.world,
    version: STORY_VERSION,
    title,
  };
}

/** Whoever the sheet has on the stage, left to right by where they stand. */
function inSpotOrder(
  here: ReadonlyMap<string, string>,
  features: ReadonlyMap<string, Pick<StudioFeature, 'spot'>> = new Map(),
): string[] {
  return [...here]
    .sort((a, b) => stationShare(a[1], features) - stationShare(b[1], features))
    .map(([id]) => id);
}

/**
 * A set's features as a scene's stage has them: whether each is open as
 * the scene opens, and when it opens or shuts, from what the narration
 * says of it ("the gate swings shut", "the open door"). The first thing
 * said of one says how it stood before: shut before it swings open.
 */
export function featureStatesOf(
  sheet: StorySheet,
  features: readonly StudioFeature[],
): { open: Set<string>; ajar: Set<string>; changes: SceneFeatureState[] } {
  const open = new Set<string>();
  const ajar = new Set<string>();
  const changes: SceneFeatureState[] = [];
  const known = new Set<string>();
  const byWord = (word: string, kind: AnyFeatureKind) =>
    features.find((f) => f.id === featureIdOf(word)) ??
    (kind !== DRAWN && features.filter((f) => f.kind === kind).length === 1
      ? features.find((f) => f.kind === kind)
      : undefined);
  const own = features.filter((f) => f.kind === DRAWN);
  let spoken = -1;
  for (const beat of sheet.beats) {
    if (beat.kind !== 'line' && beat.kind !== 'narration') continue;
    if (!beat.say.trim()) continue;
    spoken += 1;
    if (beat.kind !== 'narration') continue;
    const say = beat.say.trim();
    for (const one of featureStatesIn(say, own)) {
      const feature = byWord(one.word, one.kind);
      if (!feature?.opens) continue;
      if (!known.has(feature.id)) {
        known.add(feature.id);
        const was = one.still
          ? one.state
          : one.state === 'open'
            ? 'shut'
            : 'open';
        if (was === 'open') open.add(feature.id);
        if (one.still && one.ajar) ajar.add(feature.id);
      }
      if (one.still) continue;
      changes.push({
        beat: spoken,
        word: say.slice(0, one.at).split(/\s+/).filter(Boolean).length,
        feature: feature.id,
        state: one.state,
      });
    }
  }
  return { open, ajar, changes };
}

/**
 * A story's sheet, checked and mended, as the stage's script. `bible` is
 * the show's; the sheet's people and set are its own. `plain` names beats
 * to play by their fallback alone: a beat a made scene showed nothing for.
 */
export function stageStory(
  sheet: StorySheet,
  bible: StudioBible,
  options: {
    plain?: ReadonlySet<number>;
    /** How the scene before left things: what someone who comes on later still holds. */
    before?: {
      cast?: string[];
      held?: { who: string; thing: string }[];
    } | null;
    /** Where the set's painting shows each feature it has, as a share of the stage across (paintedAt). */
    painted?: Readonly<Record<string, number>>;
  } = {},
): SceneScript {
  const byId = new Map(bible.characters.map((c) => [c.id, c]));
  const place = bible.sets.find((s) => s.id === sheet.set) ?? null;
  const placeId = place ? placeThingId(place.id) : null;
  // One the painting shows stands where it is painted, as the stage
  // reckons who goes where and how far: a goalpost painted on the right
  // is on the right, wherever the set's list says it stands.
  const painted = options.painted ?? {};
  const features = new Map(
    (place?.features ?? []).map((f) => [
      f.id,
      painted[f.id] !== undefined
        ? { ...f, spot: nearestSpot(painted[f.id]) }
        : f,
    ]),
  );
  /** Each feature as the set keeps it: where the list says it stands. */
  const kept = new Map((place?.features ?? []).map((f) => [f.id, f]));
  /** A thing handled apart from anyone (one of the lists', or the show's own), and what it is. */
  const handled = handledOn(bible);
  const kindOf = kindOn(bible);
  /** The show's own, as the words reader knows them. */
  const own = {
    things: bible.things ?? [],
    features: [...features.values()].filter((f) => f.kind === DRAWN),
  };
  /** Whether the set's painting shows a feature: its look names it. */
  const inLook = (f: StudioFeature) =>
    Boolean(place?.look) &&
    (featureWordsOf(f).test(place!.look) ||
      place!.look.toLowerCase().includes(f.name.toLowerCase()));

  // Everyone the scene has a part for: on the stage as it opens, coming
  // on, doing or saying anything, or a voice from off it.
  const parts = new Set<string>(sheet.onStage.map((p) => p.who));
  for (const beat of sheet.beats)
    if (beat.who && byId.has(beat.who)) parts.add(beat.who);
  const opening = new Map(sheet.onStage.map((p) => [p.who, p]));
  /** Who holds each thing as the scene opens, or brings it on: a thing of its own, apart from them. */
  const startsHeld = new Map<string, string>();
  const resting = new Set(sheet.props.map((p) => p.prop));
  const cast: SceneThing[] = [];
  if (place && placeId)
    cast.push({
      id: placeId,
      kind: 'place',
      ref: place.id,
      name: place.name,
      sound: place.sound,
    });
  for (const id of parts) {
    const c = byId.get(id);
    if (!c) continue;
    const at = opening.get(id);
    // What they hold is what the sheet says: empty hands are empty.
    // Someone who comes on later holds what the scenes before left them
    // with, and only someone new to the episode what they always carry.
    const holds = at
      ? at.holding
        ? [at.holding]
        : []
      : comesWith(c, options.before);
    // Gear is drawn in the hand; anything else is a thing of its own, in
    // their hand or mouth until they let it go, unless the stage has it.
    const holding = holds.find(isGear) ?? null;
    for (const thing of holds)
      if (
        handled(thing) &&
        !startsHeld.has(thing) &&
        !(resting.has(thing) && !at)
      )
        startsHeld.set(thing, id);
    // Holding a thing of its own, they stand as anyone does: the stage
    // puts their hand to it, and lets it fall when they let it go.
    const pose =
      at?.pose === 'holding' && !holding ? 'standing' : (at?.pose ?? null);
    cast.push({
      id,
      kind: 'character',
      ref: id,
      name: c.name,
      state: at?.face ?? null,
      // Everyone equal, so the stage keeps the sheet's own order: its spots.
      met: 0,
      intro: [],
      traits: c.traits,
      ...(pose && pose !== 'standing' ? { pose } : {}),
      ...(holding ? { holding } : {}),
      ...(c.role === 'minor' ? { minor: true as const } : {}),
    });
  }
  const inCast = new Set(cast.map((t) => t.id));
  /** The cast by the names the words call them. */
  /** Whether someone is named in some words only as whose a thing is: "with Maya's ball". */
  const whoseOnly = (id: string, text: string) => {
    const names = called.find((a) => a.id === id)?.names ?? [];
    return (
      names.length > 0 &&
      names.every(
        (name) =>
          !new RegExp(`\\b${escapedWord(name)}\\b(?!['’]s)`, 'u').test(text),
      )
    );
  };
  const called: Actor[] = [...inCast].flatMap((id) => {
    const c = byId.get(id);
    return c
      ? [
          {
            id,
            names: namesOf(c),
            gender: genderOf(c.voice),
          },
        ]
      : [];
  });

  // The beats: lines and narration spoken; everything else a moment in
  // the quiet after the sentence before it, or before the first.
  const beats: SceneBeat[] = [];
  /** Each sheet beat's spoken beat. */
  const spokenAt = new Map<number, number>();
  sheet.beats.forEach((raw, at) => {
    if (raw.kind !== 'line' && raw.kind !== 'narration') return;
    if (!raw.say.trim()) return;
    const beat: SceneBeat = {
      say: raw.say.trim(),
      pause: 'short',
      delivery: 'explain',
      kind: raw.kind === 'line' ? 'line' : 'narration',
    };
    if (raw.kind === 'line' && raw.who && inCast.has(raw.who)) {
      beat.speaker = raw.who;
      beat.lines = [{ span: [0, beat.say.length], speaker: raw.who }];
      if (raw.to && raw.to !== raw.who && inCast.has(raw.to)) beat.to = raw.to;
      if (raw.from && raw.from !== 'here') beat.from = raw.from;
      if (raw.pace && raw.pace !== 'walk' && raw.pace !== 'run')
        beat.pace = raw.pace;
    } else if (raw.kind === 'line') {
      // No one of the cast to say it: the narrator, as a quotation.
      beat.kind = 'narration';
      beat.say = `"${beat.say}"`;
    }
    if (!beats.length) beat.music = sheet.music;
    spokenAt.set(at, beats.length);
    beats.push(beat);
  });
  /**
   * Each moment: after which spoken beat, how far into the quiet, and for
   * how long, in seconds; and how long until the next begins, or the quiet
   * ends: the room it has.
   */
  const moments = new Map<
    number,
    { after: number; offset: number; s: number; room: number }
  >();
  let lead = 0;
  for (const [after, run] of quietRuns(sheet)) {
    const timed = timeQuiet(run.map((at) => quietItem(sheet.beats[at])));
    run.forEach((at, k) =>
      moments.set(at, {
        after,
        offset: timed.starts[k],
        s: timed.lengths[k],
        room: Math.max(
          timed.lengths[k],
          (timed.starts[k + 1] ?? timed.total) - timed.starts[k],
        ),
      }),
    );
    if (after >= 0) beats[after].holdS = timed.total;
    else lead = timed.total;
  }

  // The stage, step by step: everyone at a station of their own, kept
  // until a beat moves them.
  const here = new Map<string, string>(
    sheet.onStage.map((p) => [p.who, p.spot]),
  );
  /** The station by a feature, under it or behind it, for one standing at `from`. */
  const stationAt = (
    how: 'by' | 'under' | 'behind',
    feature: StudioFeature,
    from: string,
  ): string =>
    how === 'under'
      ? underStation(feature.id)
      : how === 'behind'
        ? behindStation(feature.id)
        : besideStation(
            feature.id,
            stationShare(from, features) < SPOT_SHARE[feature.spot] ? -1 : 1,
          );
  // Where the words find someone: there from the first if they go nowhere
  // before it; else where they went last with nowhere named; else they go
  // there as it is said.
  const goesTo = new Map<number, string>();
  const findsThere = new Map<number, { who: string; station: string }[]>();
  /** Whom each line or narration finds somewhere, by the beat: whoever says it points them out. */
  const pointedOut = new Map<number, string[]>();
  for (const one of placementsOf(sheet, bible, [...features.values()])) {
    pointedOut.set(one.beat, [...(pointedOut.get(one.beat) ?? []), one.who]);
    const feature = features.get(one.feature)!;
    const travels = sheet.beats
      .slice(0, one.beat)
      .map((b, at) => ({ b, at }))
      .filter(
        ({ b }) =>
          b.kind === 'action' &&
          b.who === one.who &&
          doingOf(b.do)?.kind === 'travel',
      );
    const opens = here.get(one.who);
    if (opens && !travels.length)
      here.set(one.who, stationAt(one.how, feature, opens));
    else {
      const last = travels[travels.length - 1];
      if (
        last &&
        !last.b.target &&
        last.b.do !== 'enter' &&
        last.b.do !== 'leave' &&
        last.b.do !== 'squeeze'
      )
        goesTo.set(last.at, stationAt(one.how, feature, 'centre'));
      else
        findsThere.set(one.beat, [
          ...(findsThere.get(one.beat) ?? []),
          { who: one.who, station: stationAt(one.how, feature, 'centre') },
        ]);
    }
  }
  /** The way each one came in, by a feature or a side: whoever comes in after them comes the same way. */
  const cameBy = new Map<
    string,
    { via: string | null; side: '@left' | '@right' }
  >();
  /** The side each one who left went off by: where a look after them goes. */
  const wentOff = new Map<string, '@left' | '@right'>();
  /** Who holds each thing on the stage, as the sheet has it so far. */
  const holders = new Map<string, string | null>([
    ...sheet.props.map((p): [string, string | null] => [p.prop, null]),
    ...startsHeld,
  ]);
  /** Where each thing let go of came down, as a share of the stage across: where one goes after it. */
  const lies = new Map<string, number>();
  /** Each thing caught up in a feature (a kite in the palm), by the feature: as the scene before left it, or as the words send it there. */
  const upIn = new Map<string, string>(
    sheet.props.flatMap((p): [string, string][] =>
      p.in && features.has(p.in) ? [[p.prop, p.in]] : [],
    ),
  );
  /** Each thing thrown to someone, and when: a catch the sheet has next is that one. */
  const inFlight = new Map<string, string>();
  const share = (station: string) => stationShare(station, features);
  const stageNow = (extra: Partial<SceneStage> = {}): SceneStage => {
    const show = inSpotOrder(here, features).filter((id) => inCast.has(id));
    return {
      layout: show.length
        ? fitLayout(show.length > 1 ? 'row' : 'one', show.length)
        : 'one',
      show,
      arrows: [],
      at: Object.fromEntries(show.map((id) => [id, here.get(id)!])),
      ...extra,
    };
  };
  // Whether each feature is open as the scene opens, and when the
  // narration has one open or shut.
  const states = featureStatesOf(sheet, [...features.values()]);
  const featureStates: SceneFeatureState[] = [...states.changes];
  /** Whether a feature is open in the quiet after a spoken beat, as the scene has it by then. */
  const openAfter = (id: string, beat: number) => {
    let open = states.open.has(id);
    const inTurn = [...featureStates].sort(
      (a, b) =>
        a.beat - b.beat ||
        (a.after === undefined ? 0 : 1) - (b.after === undefined ? 0 : 1),
    );
    for (const one of inTurn)
      if (one.feature === id && one.beat <= beat) open = one.state === 'open';
    return open;
  };
  const steps: SceneStep[] = [];
  const opensQuiet = lead > 0;
  steps.push({
    at: { beat: opensQuiet ? -1 : 0, phrase: '' },
    word: 0,
    ...(opensQuiet ? { after: 0 } : {}),
    stage: stageNow(placeId ? { backdrop: placeId } : {}),
    effects: [],
  });

  const lastFace = new Map<string, FigureFace>();
  const faceEffect = (who: string, face: FigureFace | null): SceneEffect[] => {
    if (!face || !here.has(who)) return [];
    lastFace.set(who, face);
    return [{ target: who, part: face, do: 'show' }];
  };
  /** Someone drawn by the artist, with no rig: they bob, hop and step toward someone. */
  const bobs = (id: string) => (byId.get(id)?.kind ?? 'person') !== 'person';
  // An animal lying down as the scene opens lies there from its first
  // frame, sunk on its legs, until the sheet has it get up: a person is
  // drawn lying by the kit.
  for (const p of sheet.onStage)
    if (
      bobs(p.who) &&
      inCast.has(p.who) &&
      (p.pose === 'lying' || p.pose === 'in bed')
    )
      steps[0].effects.push({ target: p.who, part: null, do: 'lie' });
  // One found under something (a bench, a table) is low there: an animal
  // lies, a person sits, so they fit under it.
  const lowUnder = (who: string): SceneEffect => ({
    target: who,
    part: null,
    do: bobs(who) ? 'lie' : 'sit',
  });
  for (const [who, station] of here)
    if (station.startsWith('under:') && inCast.has(who))
      steps[0].effects.push(lowUnder(who));
  const spotNear = nearestSpot;
  /**
   * Where a doing is aimed: someone on the stage; a feature of the set, by
   * where it stands ("f:gate"); a side ("@left", "@up"): someone gone by
   * the side they went; a thing by whoever holds it.
   */
  /** Whether a thing is on the stage to be handled: held, or set out or let go of. */
  const onStage = (thing: string) =>
    handled(thing) && (holders.has(thing) || lies.has(thing));
  /** The words a thing on the stage is called by: the list's, or the show's own name for it. */
  const thingWords = (thing: string): RegExp =>
    isStageProp(thing)
      ? THING_WORDS[thing]
      : ownWords(own.things.find((t) => t.id === thing)?.name ?? thing);
  const aimOf = (raw: SheetBeat, who: string, doing: Doing): string | null => {
    const target =
      raw.target ??
      (raw.to && doing.aims.includes('character') ? raw.to : null);
    if (!target || target === who) return null;
    if (target.startsWith('@')) return target;
    if (inCast.has(target))
      return here.has(target) ? target : (wentOff.get(target) ?? null);
    // A thing on the stage is where it is, before a feature of its word.
    if (features.has(target) && !onStage(target)) return featureAim(target);
    const holder = holders.get(target);
    if (holder && holder !== who && here.has(holder)) return holder;
    return null;
  };
  /**
   * A station asked for, if no one else stands there; else the free spot
   * nearest it, so no two ever stand in one place. Null for none free.
   */
  const freeStation = (who: string, asked: string): string | null => {
    const taken = new Set(
      [...here].filter(([id]) => id !== who).map(([, s]) => s),
    );
    if (!taken.has(asked)) return asked;
    const from = share(asked);
    return (
      SPOTS.filter((spot) => !taken.has(spot)).sort(
        (a, b) =>
          Math.abs(SPOT_SHARE[a] - from) - Math.abs(SPOT_SHARE[b] - from),
      )[0] ?? null
    );
  };
  /**
   * Where to go: the spot the sheet gives; beside a feature, on the side
   * they come from; beside someone; where a thing let go of came down; or
   * away to one side. Null for nowhere free.
   */
  const travelTo = (
    who: string,
    asked: string | null,
    raw: SheetBeat,
    far: boolean,
  ): string | null => {
    // Going to a thing set out before someone is going to them.
    const after = raw.target ?? raw.thing ?? null;
    const setOut =
      after && handled(after) && holders.get(after) === null && !lies.has(after)
        ? sheet.props.find((p) => p.prop === after)?.near
        : null;
    const aim =
      setOut &&
      setOut !== who &&
      here.has(setOut) &&
      !(asked && here.has(asked))
        ? setOut
        : asked;
    // Going to someone on the stage, or to a thing lying there, is going
    // to them or it, wherever the sheet thought they stood: the words may
    // have found them somewhere since.
    const lying =
      after !== null && holders.get(after) === null && lies.has(after);
    // To a thing caught up in a feature: up it already, there; else by it.
    const upThere =
      after && holders.get(after) === null ? upIn.get(after) : undefined;
    if (raw.spot && !(aim && here.has(aim)) && !lying && !upThere)
      return freeStation(who, raw.spot);
    const taken = new Set(
      [...here].filter(([id]) => id !== who).map(([, s]) => s),
    );
    const mine = share(here.get(who) ?? 'centre');
    const free = (station: string) => !taken.has(station);
    const feature =
      raw.target && !onStage(raw.target)
        ? features.get(raw.target)
        : upThere
          ? features.get(upThere)
          : undefined;
    if (feature) {
      // Hiding: behind it, where it stands, drawn over them.
      if (raw.do === 'hide') {
        const behind = behindStation(feature.id);
        return free(behind) ? behind : null;
      }
      // Climbing it, or up it already: up it.
      const up = upStation(feature.id);
      if (raw.do === 'climb' || here.get(who) === up)
        return free(up) ? up : null;
      const side: -1 | 1 = mine < SPOT_SHARE[feature.spot] ? -1 : 1;
      for (const s of [side, -side as -1 | 1]) {
        const station = besideStation(feature.id, s);
        if (free(station)) return station;
      }
      return null;
    }
    // After a thing: to whoever has it, or to where it came down.
    const thing = raw.target ?? raw.thing ?? null;
    if (thing && !inCast.has(thing) && !here.has(aim ?? '')) {
      const at = lies.get(thing);
      if (at !== undefined && holders.get(thing) === null) {
        const station = groundAt(at);
        return free(station) ? station : null;
      }
    }
    const k = SPOTS.indexOf(spotNear(mine));
    const spotFree = (n: number) =>
      n >= 0 && n < SPOTS.length && free(SPOTS[n]);
    if (aim && here.has(aim)) {
      // Someone under or behind a feature (a bench, a tree): beside it, on
      // the side they come from, so they are right there.
      const at = /^(?:behind|under):([^:]+)/.exec(here.get(aim)!);
      const by = at ? features.get(at[1]) : undefined;
      if (by) {
        const side: -1 | 1 = mine < SPOT_SHARE[by.spot] ? -1 : 1;
        for (const s of [side, -side as -1 | 1]) {
          const station = besideStation(by.id, s);
          if (free(station) && station !== here.get(who)) return station;
        }
      }
      // Else the free spot nearest them on this side (theirs, where they
      // stand by a feature, not at it); else, with someone between, just
      // this side of them, on the ground: never on past them.
      const theirs = share(here.get(aim)!);
      const j = SPOTS.indexOf(spotNear(theirs));
      const back = theirs > mine ? -1 : 1;
      const first = here.get(aim) === SPOTS[j] ? j + back : j;
      for (let n = first; n >= 0 && n < SPOTS.length && n !== k; n += back)
        if (spotFree(n)) return SPOTS[n];
      const close = theirs + back * BESIDE * 1.2;
      if (Math.abs(close - mine) > NEAR) return groundAt(close);
      return raw.spot ? freeStation(who, raw.spot) : null;
    }
    const way = aim === '@left' ? -1 : aim === '@right' ? 1 : 0;
    if (!way) return null;
    let found: Spot | null = null;
    for (let n = k + way; n >= 0 && n < SPOTS.length; n += way) {
      if (!spotFree(n)) break;
      found = SPOTS[n];
      if (!far) break;
    }
    return found;
  };
  /**
   * Where someone runs out to and back from when a run takes them nowhere
   * new ("Kofi runs along the sand", "Pip darts away" to where he is): the
   * free spot farthest from them on the side asked, else on the side with
   * more room. Null when none is free.
   */
  const outAndBack = (
    who: string,
    aim: string | null,
    reach: number,
  ): Spot | null => {
    const mine = share(here.get(who) ?? 'centre');
    const taken = new Set(
      [...here].filter(([id]) => id !== who).map(([, s]) => share(s)),
    );
    const free = SPOTS.filter(
      (spot) =>
        Math.abs(SPOT_SHARE[spot] - mine) >= NEAR * 1.5 &&
        Math.abs(SPOT_SHARE[spot] - mine) <= Math.max(reach, NEAR * 1.8) &&
        ![...taken].some((at) => Math.abs(at - SPOT_SHARE[spot]) < NEAR),
    );
    const way =
      aim === '@left' ? -1 : aim === '@right' ? 1 : mine > 0.5 ? -1 : 1;
    const along = (w: number) =>
      free
        .filter((spot) => (SPOT_SHARE[spot] - mine) * w > 0)
        .sort(
          (a, b) =>
            Math.abs(SPOT_SHARE[b] - mine) - Math.abs(SPOT_SHARE[a] - mine),
        )[0];
    return along(way) ?? along(-way) ?? null;
  };
  /** A move played on someone: the one it names, or, on a drawing with no rig, the nearest it shows. */
  const moveEffect = (
    who: string,
    move: StageMove,
    aim: string | null,
    s: number,
  ): SceneEffect => {
    const toward = aim && here.has(aim) ? aim : null;
    let what: StageMove = move;
    let part: string | null = aim;
    // A hug is for someone there, a reach for someone or a feature of the
    // set (a gate's latch); else it is a point at where they are, or went.
    if (
      (what === 'hug' || what === 'reach') &&
      !toward &&
      !(what === 'reach' && aimedFeature(aim))
    )
      what = 'point';
    // A look at nothing named: a look round.
    if (what === 'look' && !aim) what = 'shake';
    // A point always goes somewhere: at nothing named, out toward the
    // middle of the stage.
    if (what === 'point' && !aim)
      part = share(here.get(who) ?? 'centre') < 0.5 ? '@right' : '@left';
    if (bobs(who)) what = bobbingMove(what, Boolean(toward));
    return {
      target: who,
      part,
      do: what,
      ms: Math.round(s * 1000),
    };
  };
  /**
   * The move a doing falls back to, played where the stage could not show
   * it as it is: along its fallbacks to the first that is a move. A nod
   * is too small on a drawing with no rig: it hops.
   */
  const fallbackMove = (doing: Doing, who: string): StageMove => {
    let move: StageMove = 'nod';
    let at: Doing | undefined = doingOf(doing.fallback ?? 'nod');
    for (let n = 0; at && n < 6; n += 1) {
      if ('move' in at.plays) {
        move = at.plays.move;
        break;
      }
      at = doingOf(
        at.fallback ?? fallbackFor(at.id, bobs(who) ? 'animal' : 'person'),
      );
    }
    return bobs(who) && move === 'nod' ? 'hop' : move;
  };

  sheet.beats.forEach((raw, at) => {
    const k = spokenAt.get(at);
    if (k !== undefined) {
      const beat = beats[k];
      const effects: SceneEffect[] = [];
      if (beat.kind === 'line' && beat.speaker) {
        // The face the line is said with: the sheet's; else what its words
        // tell, if it is not the one they wear already.
        const told = raw.feeling ?? faceOfLine(beat.say);
        if (told && told !== lastFace.get(beat.speaker))
          effects.push(...faceEffect(beat.speaker, told));
        // "There he is, by the goalpost!": pointed out as it is said.
        for (const found of pointedOut.get(at) ?? [])
          if (found !== beat.speaker && here.has(found))
            effects.push(moveEffect(beat.speaker, 'point', found, 1.2));
      }
      // Found there as it is said: they go there as it begins.
      // One by the feature already, on either side of it, stays.
      const byIt = (station: string | undefined, one: string) =>
        station?.replace(/:-?1$/, '') === one.replace(/:-?1$/, '');
      const found = (findsThere.get(at) ?? []).filter(
        (one) => here.has(one.who) && !byIt(here.get(one.who), one.station),
      );
      for (const one of found) {
        here.set(one.who, freeStation(one.who, one.station) ?? one.station);
        if (here.get(one.who)!.startsWith('under:'))
          effects.push(lowUnder(one.who));
      }
      // A gate someone opens or shuts as the narration says: they go to
      // it as it begins, and their hand does it at its word; or, gone
      // there, as they get there, as it ends.
      const hands: SceneEffect[] = [];
      let walked = false;
      if (beat.kind === 'narration')
        for (const one of doingsIn(beat.say, { actors: called, ...own })) {
          const feature = one.target
            ? (features.get(featureIdOf(one.target)) ??
              [...features.values()].find((f) =>
                featureWordsOf(f).test(one.target!),
              ))
            : undefined;
          if (
            (one.do !== 'open' && one.do !== 'close') ||
            !one.who ||
            !here.has(one.who) ||
            !feature
          )
            continue;
          const station = here.get(one.who)!;
          if (!station.startsWith(`by:${feature.id}:`)) {
            here.set(
              one.who,
              freeStation(one.who, stationAt('by', feature, station)) ??
                station,
            );
            found.push({ who: one.who, station: here.get(one.who)! });
            walked = true;
            for (const change of featureStates)
              if (
                change.beat === k &&
                change.feature === feature.id &&
                change.after === undefined
              ) {
                delete change.word;
                change.after = 0;
              }
          }
          hands.push(moveEffect(one.who, 'reach', featureAim(feature.id), 0.9));
        }
      if (effects.length || found.length)
        steps.push({
          at: { beat: k, phrase: phraseOf(beat.say) },
          word: 0,
          stage: found.length ? stageNow() : null,
          effects,
        });
      // Someone the narrator says runs or walks about with nowhere named
      // ("Pip zigzags through the tall grass"): out and back as it is said.
      const about: SceneStep[] = [];
      if (beat.kind === 'narration')
        for (const one of doingsIn(beat.say, { actors: called, ...own })) {
          const by = one.who;
          if (
            !by ||
            !here.has(by) ||
            (one.do !== 'run' && one.do !== 'walk') ||
            one.via ||
            one.away ||
            about.some((step) => step.stage?.going?.[by]) ||
            (one.target && !whoseOnly(one.target, beat.say))
          )
            continue;
          const back = here.get(by)!;
          const out = outAndBack(by, null, 0.5);
          if (!out) continue;
          const word = beat.say
            .slice(0, one.at)
            .split(/\s+/)
            .filter(Boolean).length;
          const going = { [by]: { pace: 'run' as const } };
          here.set(by, out);
          about.push({
            at: {
              beat: k,
              phrase: beat.say
                .split(/\s+/)
                .filter(Boolean)
                .slice(word, word + 3)
                .join(' '),
            },
            word,
            stage: stageNow({ going }),
            effects: [],
          });
          here.set(by, back);
          about.push({
            at: { beat: k, phrase: '' },
            word: 0,
            after: 0,
            stage: stageNow({ going }),
            effects: [],
          });
        }
      if (hands.length) {
        const words = beat.say.split(/\s+/).filter(Boolean);
        const said = featureStatesIn(beat.say)[0];
        const word = said
          ? beat.say.slice(0, said.at).split(/\s+/).filter(Boolean).length
          : 0;
        steps.push({
          at: { beat: k, phrase: words.slice(word, word + 3).join(' ') },
          word: walked ? 0 : word,
          ...(walked ? { after: 0 } : {}),
          stage: null,
          effects: hands,
        });
      }
      steps.push(...about);
      // A thing the words send up into a feature ("a gust whips the kite
      // into the palm"), or find caught there: out of the hand that holds
      // it at those words, up into it, and caught there.
      for (const one of caughtUpIn(
        beat.say,
        [...holders.keys()].map((id) => ({ id, words: thingWords(id) })),
        [...features.values()],
      )) {
        const by = holders.get(one.thing);
        if (upIn.get(one.thing) === one.feature || !by || !here.has(by))
          continue;
        (beat.business ??= []).push({
          at: one.at,
          who: by,
          does: 'throw',
          prop: one.thing,
          to: upStation(one.feature),
        });
        holders.set(one.thing, null);
        upIn.set(one.thing, one.feature);
        lies.delete(one.thing);
      }
      // How it lands on the one it is said to, as it ends: unless the sheet
      // has them react next.
      const next = sheet.beats[at + 1];
      const reacts = next?.kind === 'reaction' && next.who === beat.to;
      const heard = raw.feeling ? LANDS[raw.feeling] : undefined;
      if (beat.to && here.has(beat.to) && heard && !reacts) {
        const words = beat.say.split(/\s+/).filter(Boolean);
        const last = Math.max(0, words.length - 2);
        steps.push({
          at: { beat: k, phrase: words.slice(last).join(' ') },
          word: last,
          stage: null,
          effects: faceEffect(beat.to, heard),
        });
      }
      return;
    }
    const moment = moments.get(at);
    if (!moment) return;
    const effects: SceneEffect[] = [];
    let stage: SceneStage | null = null;
    /** What happens later in the same moment: coming back from a run out. */
    const afterwards: SceneStep[] = [];
    const who = raw.who;
    if (
      (raw.kind === 'action' || raw.kind === 'business') &&
      who &&
      inCast.has(who)
    ) {
      const doing = doingOf(raw.do) ?? doingOf('nod')!;
      const aim = aimOf(raw, who, doing);
      const plays = doing.plays;
      const plain = options.plain?.has(at) ?? false;
      if ('step' in plays) {
        // Going after someone who has gone is going off after them; and
        // going off after them, the way they went.
        const after =
          (doing.id === 'chase' || doing.id === 'leave') &&
          raw.target &&
          inCast.has(raw.target) &&
          !here.has(raw.target);
        const how = after ? 'leave' : plays.step;
        // The feature they go in or out by: the one the sheet says, or
        // the one squeezed under.
        // After someone who came in: the way they came.
        const leader =
          how === 'enter' && raw.target ? cameBy.get(raw.target) : undefined;
        const via =
          (raw.via && features.has(raw.via) ? raw.via : null) ??
          (doing.id === 'squeeze' && raw.target && features.has(raw.target)
            ? raw.target
            : null) ??
          leader?.via ??
          null;
        const run =
          raw.pace === 'run' || (Boolean(doing.runs) && raw.pace !== 'walk');
        const going: SceneGoing = {
          ...(run ? { pace: 'run' as const } : {}),
          ...(via ? { via } : {}),
          ...(doing.id === 'squeeze' && via ? { squeeze: true as const } : {}),
          ...(leader && !via ? { side: leader.side } : {}),
        };
        /** A way through that is shut is opened as they go, unless they squeeze under it. */
        const opensFor = (id: string) => {
          if (!features.get(id)?.opens || going.squeeze) return;
          if (openAfter(id, moment.after)) return;
          featureStates.push({
            beat: moment.after,
            after: moment.offset,
            feature: id,
            state: 'open',
          });
        };
        if (how === 'enter' && !here.has(who)) {
          const by = via ? features.get(via) : undefined;
          here.set(
            who,
            freeStation(
              who,
              raw.spot ??
                (by
                  ? besideStation(by.id, SPOT_SHARE[by.spot] < 0.5 ? 1 : -1)
                  : 'centre'),
            ) ?? 'centre',
          );
          if (via) opensFor(via);
          const by2 = via ? features.get(via) : undefined;
          cameBy.set(who, {
            via,
            side:
              going.side ??
              (by2
                ? featureSide(by2, share(here.get(who)!))
                : share(here.get(who)!) < 0.5
                  ? '@left'
                  : '@right'),
          });
          stage = stageNow({
            arrive: [who],
            ...(Object.keys(going).length ? { going: { [who]: going } } : {}),
          });
        } else if (how === 'leave' && here.has(who)) {
          // What they hold goes with them; through a feature, off by the
          // side it stands on, and whoever goes by it after them too; after
          // someone gone, off the side they went.
          const side =
            !via && (raw.target === '@left' || raw.target === '@right')
              ? raw.target
              : after && raw.target && !via
                ? (wentOff.get(raw.target) ??
                  exitSideOf(here, who, features, via))
                : exitSideOf(here, who, features, via);
          wentOff.set(who, side);
          here.delete(who);
          if (via) opensFor(via);
          stage = stageNow({
            leave: [who],
            going: { [who]: { ...going, side } },
          });
        } else if (how === 'walk' && here.has(who)) {
          const was = here.get(who);
          // Where the words find them later, if nowhere is named now.
          const later = goesTo.get(at);
          const to = later
            ? freeStation(who, later)
            : travelTo(who, aim, raw, Boolean(doing.runs));
          // Somewhere else: they go there, and stay. Nowhere else to be, or
          // where they are already: out and back, so their going is seen;
          // and with nowhere free at all, a step toward it, played as a move.
          const there = to ?? was ?? null;
          // Half its room out, and half back, at a run.
          const half = Math.min(OUT_MOST_S, moment.room) / 2;
          const out =
            run &&
            there &&
            !(aim && here.has(aim)) &&
            (!to || Math.abs(share(to) - share(was ?? to)) < NEAR)
              ? outAndBack(who, aim, half * RUN_SHARE_S)
              : null;
          if (out && there) {
            here.set(who, out);
            stage = stageNow({ going: { [who]: { pace: 'run' as const } } });
            here.set(who, there);
            afterwards.push({
              at: { beat: moment.after, phrase: phraseOf(raw.say) },
              word: 0,
              after: round(moment.offset + half),
              stage: stageNow(
                run ? { going: { [who]: { pace: 'run' as const } } } : {},
              ),
              effects: [],
            });
          } else if (to && to !== was) {
            here.set(who, to);
            stage = stageNow(
              run ? { going: { [who]: { pace: 'run' as const } } } : {},
            );
            // Chased to where it lies: taken up there, in a hand or a mouth.
            const after = raw.target ?? raw.thing ?? null;
            if (
              doing.id === 'chase' &&
              after &&
              handled(after) &&
              holders.get(after) === null &&
              lies.has(after)
            )
              handle(after, who, 'take', null, {
                after: moment.after,
                offset: round(moment.offset + moment.s * 0.9),
              });
          } else
            effects.push(
              moveEffect(who, bobs(who) ? 'hop' : 'lean-in', aim, moment.s),
            );
        }
        if (plain && here.has(who))
          effects.push(
            moveEffect(who, fallbackMove(doing, who), aim, moment.s),
          );
      } else if ('move' in plays || plain) {
        const move =
          plain || !('move' in plays) ? fallbackMove(doing, who) : plays.move;
        // What touches someone (a hug, a lick) is done beside them: whoever
        // does it comes up to them first, and does it once there, as the
        // room allows.
        const was = here.get(who);
        const to =
          TOUCHES.has(doing.id) &&
          !plain &&
          aim &&
          here.has(aim) &&
          was &&
          Math.abs(share(was) - share(here.get(aim)!)) > ONE_SPOT
            ? travelTo(who, aim, { ...raw, spot: null }, false)
            : null;
        if (to && was && to !== was) {
          const walkS = Math.max(1.1, Math.abs(share(to) - share(was)) * 4);
          here.set(who, to);
          stage = stageNow();
          afterwards.push({
            at: { beat: moment.after, phrase: phraseOf(raw.say) },
            word: 0,
            after: round(
              moment.offset +
                Math.min(walkS, Math.max(0, moment.room - moment.s)),
            ),
            stage: null,
            effects: [moveEffect(who, move, aim, moment.s)],
          });
        } else effects.push(moveEffect(who, move, aim, moment.s));
        // A feature opened or shut: it swings as their hand does it.
        const feature = aimedFeature(aim);
        if ((doing.id === 'open' || doing.id === 'close') && feature)
          featureStates.push({
            beat: moment.after,
            after: round(moment.offset + doing.keyAt * moment.s),
            feature,
            state: doing.id === 'open' ? 'open' : 'shut',
          });
      } else if (raw.prop && handled(raw.prop))
        handleBeat(raw, raw.prop, who, plays.prop, aim, moment);
      else
        // Nothing to hand: a kick at the air, a chew on nothing; else the
        // move it falls back to.
        effects.push(
          moveEffect(
            who,
            doing.bare ?? fallbackMove(doing, who),
            aim,
            moment.s,
          ),
        );
    }
    if (raw.kind === 'reaction' && who && here.has(who)) {
      if (raw.feeling) effects.push(...faceEffect(who, raw.feeling));
      // A sign that moves the whole body, on one the artist drew (who has
      // no such sign drawn): the move it is, as long as that move takes.
      const moves = raw.sign && bobs(who) ? SIGN_MOVES[raw.sign] : undefined;
      if (moves)
        effects.push(
          moveEffect(who, moves.move, null, doingOf(moves.doing)!.ms / 1000),
        );
      else if (raw.sign)
        effects.push({ target: who, part: raw.sign, do: 'show' });
    }
    if (stage || effects.length)
      steps.push({
        at: { beat: moment.after, phrase: phraseOf(raw.say) },
        word: 0,
        after: moment.offset,
        stage,
        effects,
      });
    steps.push(...afterwards);
  });

  /**
   * A business beat, as what is done with its thing: given to whom it
   * says; thrown or kicked to someone, toward a side, a feature of the set
   * or on ahead; a thing thrown to someone caught as it reaches them, in a
   * hand or a mouth. Food chewed is eaten, a bite at a time; a catch of
   * nothing coming is a pick-up.
   */
  function handleBeat(
    raw: SheetBeat,
    prop: string,
    who: string,
    asked: ThingAction,
    aim: string | null,
    moment: { after: number; offset: number; s: number },
  ): void {
    let does = asked;
    // Caught up in a feature, it is in no one's hand to let go of.
    if (
      (does === 'drop' || does === 'put' || does === 'throw') &&
      holders.get(prop) !== who &&
      upIn.has(prop)
    )
      return;
    if (does === 'chew' && kindOf(prop) === 'food' && holders.get(prop) === who)
      does = 'eat';
    // Dropped down to someone ("drops the kite down to Grandma"): let go
    // for them to catch, as a throw to them is.
    const down = raw.to ?? raw.target;
    if (
      does === 'drop' &&
      down &&
      down !== who &&
      inCast.has(down) &&
      here.has(down)
    )
      does = 'throw';
    if (does === 'catch') {
      // Thrown to them: the throw's own catch has it.
      if (inFlight.get(prop) === who) return;
      if (holders.get(prop) === null) does = 'take';
    }
    let to: string | null = null;
    if (does === 'give') to = raw.to ?? (aim && here.has(aim) ? aim : null);
    if (does === 'throw' || does === 'kick') to = whereTo(raw, who);
    // Thrown for someone who goes after it next: past them, onto the
    // ground, for them to run to and take up.
    if (does === 'throw' && to && here.has(to) && chasedNext(raw, to, prop)) {
      const mine = share(here.get(who) ?? 'centre');
      const theirs = share(here.get(to)!);
      const way = theirs >= mine ? 1 : -1;
      // Past them where there is room; else, at the stage's edge or a
      // feature in the way (a gateway, a bench), short of them, so they
      // are seen to run to it either way.
      const clear = (at: number) =>
        at > 0.06 &&
        at < 0.94 &&
        ![...features.values()].some(
          (f) =>
            f.spot !== 'back' &&
            Math.abs(SPOT_SHARE[f.spot] - at) < THROWN_PAST * 0.75,
        );
      const past = theirs + way * THROWN_PAST;
      to = groundAt(clear(past) ? past : theirs - way * THROWN_PAST);
    }
    handle(prop, who, does, to, moment);
    if (does === 'take' || does === 'catch') upIn.delete(prop);
    if (does === 'throw' && to && here.has(to)) {
      // How many spots apart they stand.
      const across = Math.round(
        Math.abs(share(here.get(to)!) - share(here.get(who) ?? 'centre')) /
          (SPOT_SHARE['centre-left'] - SPOT_SHARE.left),
      );
      handle(prop, to, 'catch', who, moment, fliesS(across));
      inFlight.set(prop, to);
    }
  }

  /** Whether the next thing someone does after a beat is to go after a thing: a chase, a fetch. */
  function chasedNext(raw: SheetBeat, by: string, prop: string): boolean {
    const next = sheet.beats
      .slice(sheet.beats.indexOf(raw) + 1)
      .find(
        (b) => b.who === by && (b.kind === 'action' || b.kind === 'business'),
      );
    return Boolean(
      next &&
      (next.do === 'chase' || next.do === 'fetch') &&
      (next.target === prop || next.thing === prop),
    );
  }

  /**
   * Where a thing thrown or kicked goes: to someone on the stage; toward
   * the side someone gone went, or a side the sheet says; to a feature of
   * the set, on the ground before it; else on ahead, toward the middle.
   */
  function whereTo(raw: SheetBeat, who: string): string {
    const aimed = raw.to ?? raw.target ?? null;
    if (aimed?.startsWith('@'))
      return aimed === '@left' || aimed === '@right' ? aimed : groundAhead(who);
    if (aimed && inCast.has(aimed))
      return here.has(aimed) ? aimed : (wentOff.get(aimed) ?? groundAhead(who));
    // To a feature: on the ground before it, wherever the stage stands it.
    if (aimed && features.has(aimed)) return featureAim(aimed);
    return groundAhead(who);
  }
  /** The ground a little way ahead of someone, toward the middle of the stage. */
  function groundAhead(who: string): string {
    const from = share(here.get(who) ?? 'centre');
    return groundAt(from + (from <= 0.5 ? 0.3 : -0.3));
  }
  /** Where something aimed at comes down, as a share of the stage across; null for someone. */
  function landsAt(to: string | null, who: string): number | null {
    if (!to) return share(here.get(who) ?? 'centre');
    const feature = aimedFeature(to);
    if (feature) return SPOT_SHARE[features.get(feature)?.spot ?? 'back'];
    if (to === '@left') return 0.05;
    if (to === '@right') return 0.95;
    if (to.startsWith('@')) return Number(to.slice(1)) || null;
    return null;
  }

  /** A thing handled at its own moment in the quiet, in the sheet's order. */
  function handle(
    prop: string,
    who: string,
    does: ThingAction,
    to: string | null,
    moment: { after: number; offset: number; s?: number },
    flies?: number,
  ): void {
    const onto = beats[Math.max(0, moment.after)];
    if (!onto) return;
    (onto.business ??= []).push({
      at: moment.after >= 0 ? onto.say.length : 0,
      who,
      does,
      prop,
      to:
        does === 'give' ||
        does === 'throw' ||
        does === 'kick' ||
        does === 'catch'
          ? to
          : null,
      after: moment.offset,
      ...(moment.after < 0 ? { lead: true as const } : {}),
      ...(flies !== undefined ? { flies } : {}),
      ...(moment.s !== undefined ? { s: moment.s } : {}),
    });
    inFlight.delete(prop);
    if (does === 'take' || does === 'catch') holders.set(prop, who);
    if (does === 'put' || does === 'drop' || does === 'kick')
      holders.set(prop, null);
    if (does === 'give' && to) holders.set(prop, to);
    if (does === 'throw') holders.set(prop, to && here.has(to) ? to : null);
    // Let go of, it lies where it comes down: where one goes after it.
    if (holders.get(prop) === null && does !== 'take' && does !== 'catch') {
      const at = landsAt(does === 'put' || does === 'drop' ? null : to, who);
      if (at !== null) lies.set(prop, at);
    }
  }

  // What the narrator says someone on the stage does, acted as it is said.
  const actors: Actor[] = cast.flatMap((thing) => {
    if (thing.kind !== 'character') return [];
    const c = byId.get(thing.ref);
    return c
      ? [
          {
            id: thing.id,
            names: namesOf(c),
            gender: genderOf(c.voice),
          },
        ]
      : [];
  });
  // Every thing on the stage: resting as it opens, or in someone's hand
  // or mouth; and any the sheet handles that it did not list.
  const props = [
    ...new Set<string>([
      ...sheet.props.map((p) => p.prop),
      ...startsHeld.keys(),
      ...beats.flatMap((b) => (b.business ?? []).map((one) => one.prop)),
    ]),
  ].filter(handled);
  if (actors.length) {
    const { acts, business } = directionsIn(
      beats.map((beat) => (beat.kind === 'line' ? '' : beat.say)),
      actors,
      [],
      new Map(),
      props.filter(isStageProp),
    );
    for (const { beat, ...act } of acts) (beats[beat].acts ??= []).push(act);
    const done = new Set(
      beats.flatMap((b) =>
        (b.business ?? []).map((x) => `${x.who}|${x.does}|${x.prop}`),
      ),
    );
    for (const { beat, ...one } of business) {
      const key = `${one.who}|${one.does}|${one.prop}`;
      if (done.has(key) || !props.includes(one.prop)) continue;
      done.add(key);
      (beats[beat].business ??= []).push(one);
    }
  }

  // The camera, on the sheet's spoken beats; a shot at an action, a thing
  // handled or a face, at its own moment in the quiet.
  const spokenFrom = (at: number) => {
    for (let i = at; i < sheet.beats.length; i += 1) {
      const k = spokenAt.get(i);
      if (k !== undefined) return k;
    }
    return Math.max(0, beats.length - 1);
  };
  const camera = openedOut(sheet, called)
    .filter((shot) => shot.shot === 'wide' || (shot.on && inCast.has(shot.on)))
    .map((shot) => {
      const moment = moments.get(shot.beat);
      return {
        ...(moment
          ? { beat: moment.after, after: moment.offset }
          : { beat: spokenFrom(shot.beat) }),
        shot: shot.shot,
        on: shot.on,
        with: shot.with && inCast.has(shot.with) ? shot.with : null,
      };
    });

  const propsNear = Object.fromEntries(
    sheet.props.flatMap((p) =>
      p.near && inCast.has(p.near) ? [[p.prop, p.near]] : [],
    ),
  );
  // Caught up in a feature as it opens: the kite in the palm.
  const propsIn = Object.fromEntries(
    sheet.props.flatMap((p) =>
      p.in && features.has(p.in) ? [[p.prop, p.in]] : [],
    ),
  );
  // In a hand, or an animal's mouth.
  const propsHeld = Object.fromEntries(
    [...startsHeld].map(([prop, by]) => [
      prop,
      {
        by,
        in:
          byId.get(by)?.kind === 'person'
            ? ('hand' as const)
            : ('mouth' as const),
      },
    ]),
  );
  return {
    fit: 'good',
    fitReason: null,
    title: sheet.title,
    mood: sheet.mood,
    beats,
    cast,
    steps,
    ...(placeId ? { backdrop: placeId } : {}),
    ...(lead > 0 ? { lead } : {}),
    ...(props.length ? { props } : {}),
    // The show's own among them, for the artist to draw once for the show.
    ...(props.some((p) => !isStageProp(p))
      ? {
          ownThings: own.things
            .filter((t) => props.includes(t.id))
            .map((t) => ({
              id: t.id,
              name: t.name,
              ...(t.look ? { look: t.look } : {}),
            })),
        }
      : {}),
    ...(Object.keys(propsNear).length ? { propsNear } : {}),
    ...(Object.keys(propsHeld).length ? { propsHeld } : {}),
    ...(Object.keys(propsIn).length ? { propsIn } : {}),
    ...(camera.some((shot) => shot.shot !== 'wide') ? { camera } : {}),
    // Everyone at a station of their own; the set's features among them,
    // each as the scene finds it, opened and shut when it says.
    stations: true,
    ...(features.size
      ? {
          features: [...features.values()].map((f): SceneFeature => ({
            id: f.id,
            name: f.name,
            kind: f.kind,
            spot: kept.get(f.id)?.spot ?? f.spot,
            opens: f.opens,
            ...(states.open.has(f.id) ? { open: true as const } : {}),
            ...(states.ajar.has(f.id) ? { ajar: true as const } : {}),
            ...(inLook(f) ? { looked: true as const } : {}),
          })),
        }
      : {}),
    ...(featureStates.length ? { featureStates } : {}),
    setting: {
      time: sheet.time,
      weather: sheet.weather,
      crowd: sheet.crowd,
      world: bible.world,
      // Out of doors, a room or a vessel: the crowd stands in it so.
      ...(place ? { place: place.kind } : {}),
    },
  };
}

/**
 * The sheet's shots, and the whole stage again wherever what happens is
 * not in the shot on: the narrator telling of anything but those in it
 * ("A tiny bark sounds from the danfo"), or a face made by someone it
 * leaves out. The next shot the sheet asks for comes in as it asks.
 */
export function openedOut(
  sheet: Pick<StorySheet, 'beats' | 'camera'>,
  actors: readonly Actor[],
): SheetShot[] {
  const asked = [...sheet.camera].sort((a, b) => a.beat - b.beat);
  const out: SheetShot[] = [];
  let on: SheetShot | null = null;
  sheet.beats.forEach((beat, at) => {
    for (const shot of asked.filter((s) => s.beat === at)) {
      out.push(shot);
      on = shot;
    }
    if (!on || on.shot === 'wide') return;
    const framed = new Set([on.on, on.with].filter(Boolean));
    const named = actors
      .filter((a) =>
        a.names.some((name) =>
          new RegExp(`\\b${escapedWord(name)}\\b`, 'u').test(beat.say),
        ),
      )
      .map((a) => a.id);
    const away =
      (beat.kind === 'narration' &&
        beat.say.trim() !== '' &&
        (!named.length || named.some((id) => !framed.has(id)))) ||
      (beat.kind === 'reaction' && beat.who !== null && !framed.has(beat.who));
    if (!away) return;
    on = { beat: at, shot: 'wide', on: null, with: null };
    out.push(on);
  });
  return out;
}

/** Whether a thing on a scene is eaten or drunk: for the writer's menu. */
export const edible = (prop: keyof typeof PROP_KIND) =>
  PROP_KIND[prop] !== 'thing';
