/**
 * Every scene checked before anything is drawn or voiced: so each person
 * says only their own lines, only whoever the scene lists is on the stage,
 * no one stands where someone already is, and nothing is done with a thing
 * that is not there or not in hand.
 *
 * The words of each action and each thing handled are what it shows, so
 * they win: read against the one list of doings, they set what is done,
 * toward whom or what, with what and by which way. What the stage cannot
 * do as written (someone who cannot, nothing in hand to throw, a hug with
 * no one there) falls back to the closest it can, and a thing or a
 * feature of the set the words name is put there. All of it is put right
 * here, quietly, and listed for us; a beat whose doer is in the cast is
 * never left out. What code cannot put right is a problem, said in plain
 * words, which goes back to the writer once; the maker never sees it.
 */
import { narratorsLine, lineOf } from '../scene-screenplay';
import { faceNamed } from '../scene-feeling';
import {
  PROP_KIND,
  PROP_WORDS,
  STAGE_PROPS,
  type StageProp,
} from '../scene-props';
import { doingsIn, type Actor, type ReadDoing } from '../scene-directions';
import { STATION_SHARES } from '../scene-layout';
import {
  OPENING_FEATURES,
  THING_WORDS,
  featureIdOf,
  featureStatesIn,
  featuresNamedIn,
  canDo,
  doingOf,
  fallbackFor,
  featureKindOf,
  isStageProp,
  type Doer,
  type DoingId,
  type ThingId,
} from '../scene-doings';
import {
  STILL_WORDS,
  fewStageChanges,
  genderOf,
  mendScript,
  quietStretches,
  type SceneScript,
} from '../scene-script';
import type { LearningStage } from '../scene-stage';
import {
  LINE_WORDS,
  MOST_ON_STAGE,
  SPOTS,
  secondsOf,
  studioId,
  WORDS_A_SECOND,
  type ExplainerSheet,
  type SceneSheet,
  type SheetBeat,
  type Spot,
  type StudioBible,
  type StudioCharacter,
  type StudioFeature,
  type StudioOutline,
  type StorySheet,
} from './studio';
import { joinsSeconds } from './studio-edit';
import {
  QUIET_MOST_S,
  comesWith,
  exitSideOf,
  placementsOf,
  quietItem,
  quietRuns,
  timeQuiet,
} from './studio-stage';

export interface SheetProblem {
  /** Which rule: for the card's icon and for tests. */
  rule:
    | 'set'
    | 'cast'
    | 'crowded'
    | 'speaker'
    | 'narrator'
    | 'presence'
    | 'prop'
    | 'doing'
    | 'length'
    | 'quiet'
    | 'empty'
    | 'continuity'
    | 'storyboard';
  /** In plain words, for the writer. */
  message: string;
  /** The beat it is about, from 0; null for the whole scene. */
  beat: number | null;
  /** An error keeps the scene from being made as written; a warning does not. */
  level: 'error' | 'warning';
}

/** How a scene leaves the stage: who is where, where each thing is, and what each one holds. */
export interface EndState {
  set: string;
  onStage: { who: string; spot: Spot }[];
  /** Every thing on the stage: in whose hand or mouth, or lying on the ground (and where, when known). */
  props: {
    prop: StageProp;
    holder: string | null;
    gone: boolean;
    at?: Spot;
  }[];
  /** What each one carries on into the next scene: the ball in Pip's mouth. */
  held?: { who: string; thing: ThingId }[];
  /** Everyone who was in the scene at all: what they hold next is what it left them with. */
  cast?: string[];
}

/** A story's scene may run this much longer, or shorter, than its outline said before it goes back. */
export const LONGEST = 1.7;
export const SHORTEST = 0.4;

const words = (say: string) => say.split(/\s+/).filter(Boolean).length;

/** A name as the writer or a person wrote it, as one of the bible's characters' ids. */
export function characterId(
  said: string | null | undefined,
  bible: StudioBible,
): string | null {
  if (!said) return null;
  const key = studioId(said, '');
  if (!key) return null;
  const all = bible.characters;
  const found =
    all.find((c) => c.id === key) ??
    all.find((c) => studioId(c.name) === key) ??
    all.find((c) => studioId(c.name.split(/\s+/)[0]) === key) ??
    all.find(
      (c) =>
        key.length >= 3 &&
        (c.id.startsWith(`${key}-`) || studioId(c.name).startsWith(`${key}-`)),
    );
  return found?.id ?? null;
}

/** A set as the writer wrote it, as one of the bible's sets' ids. */
export function setId(
  said: string | null | undefined,
  bible: StudioBible,
): string | null {
  if (!said) return null;
  const key = studioId(said, '');
  return (
    bible.sets.find((s) => s.id === key)?.id ??
    bible.sets.find((s) => studioId(s.name) === key)?.id ??
    null
  );
}

const NARRATOR = /^(?:the-)?narrator$/u;

/** The free spot nearest the one asked for, or null when every spot is taken. */
function freeSpot(asked: Spot, taken: ReadonlySet<Spot>): Spot | null {
  if (!taken.has(asked)) return asked;
  const at = SPOTS.indexOf(asked);
  for (let d = 1; d < SPOTS.length; d += 1)
    for (const k of [at + d, at - d])
      if (k >= 0 && k < SPOTS.length && !taken.has(SPOTS[k])) return SPOTS[k];
  return null;
}

/** The spot to bring someone on at: the middle first, then out to either side. */
const ARRIVAL: readonly Spot[] = [
  'centre-right',
  'centre-left',
  'right',
  'left',
  'centre',
];

const blankBeat = (kind: SheetBeat['kind']): SheetBeat => ({
  kind,
  who: null,
  to: null,
  say: '',
  feeling: null,
  sign: null,
  do: null,
  prop: null,
  spot: null,
  from: null,
  pace: null,
  seconds: null,
});

/** A beat without the fields it has nothing in: a sheet written before them reads as it was. */
function tidy(beat: SheetBeat): SheetBeat {
  const out = { ...beat };
  for (const key of ['target', 'thing', 'via', 'doSaid'] as const)
    if (!out[key]) delete out[key];
  return out;
}

/** Moves done close to a feature: its doer goes over to it first. */
const CLOSE_TO = new Set<DoingId>([
  'crouch',
  'lean-in',
  'sniff',
  'dig',
  'lick',
]);
/** Words that find someone by a feature, just before its name: "by the", "under a". */
const PLACED =
  /\b(?:next to|by|beside|near|under|underneath|beneath|behind)\s+(?:the|a|an|that|this|his|her|their|its)\s+(?:[\p{L}-]+\s+)?$/iu;
/** Words that find a thing there, just before its name: "A tuft of", "Look, a", "and the", "there's a". */
const FOUND_BEFORE =
  /(?:^|[.!?]\s+)(?:(?:oh|look|and|wow|hey|see)[,!]?\s+)*(?:(?:there|here)(?:'s|’s| is| are| lies| lay)\s+)?(?:a|an|the|some|this|that)\s+(?:[\p{L}-]+\s+){0,3}$/iu;
/** Words that say a thing is not there: "no ball", "lost the key". */
const NOT_THERE =
  /\b(?:no|not|never|without|lost|missing|find|where|wants?|wish(?:es)?|need)\b[^.!?]*$/iu;

/**
 * The things of the stage the words find there: a line's said as found
 * ("A tuft of white fur!", "And a chewed red pepper!"), the narration's
 * named at all; never one said to be gone or wanted.
 */
export function thingsFoundIn(text: string, narration: boolean): StageProp[] {
  const found: StageProp[] = [];
  for (const prop of STAGE_PROPS) {
    const m = new RegExp(PROP_WORDS[prop].source, 'iu').exec(text);
    if (!m) continue;
    const before = text.slice(0, m.index);
    const sentence = before.slice(before.search(/[^.!?]*$/u));
    if (NOT_THERE.test(sentence)) continue;
    // A word for a feature after it is the feature's: "a mango tree".
    const next = /^\s+([\p{L}-]+)/u.exec(text.slice(m.index + m[0].length));
    if (next && featureKindOf(next[1])) continue;
    if (narration || FOUND_BEFORE.test(before)) found.push(prop);
  }
  return found;
}

/** Lines that come from somewhere with no one standing on the stage to say them. */
const FROM_AWAY = new Set(['off', 'phone', 'letter', 'above', 'dream']);

/**
 * How long a walk from one spot to another takes on the stage, in seconds:
 * a walker crosses the whole stage in four, within the player's bounds
 * (WALK_MIN_MS, WALK_MAX_MS); a runner in less.
 */
export function walkSeconds(
  from: Spot,
  to: Spot,
  pace: 'walk' | 'run' | null,
): number {
  const across = Math.abs(STATION_SHARES[to] - STATION_SHARES[from]);
  const s = Math.min(3.4, Math.max(1.1, across * 4));
  return Math.round((pace === 'run' ? s / 2.2 : s) * 10) / 10;
}

/** A doing, as the one list has it, in a few words for what was done: "a throw". */
const called = (id: DoingId | null | undefined) =>
  id
    ? `${/^[aeiou]/u.test(id) ? 'an' : 'a'} ${id.replace(/-/g, ' ')}`
    : 'nothing';

/**
 * A story's sheet put right where it can be without changing the story:
 * names made the bible's ids, spots made free, whoever speaks or acts
 * brought on first, a thing taken up before it is used, a line the
 * narrator must say given to the narrator; each action's and each thing
 * handled's words read against the list of doings, and what they say is
 * what is done. `before` is how the scene before left things, for what
 * each one still holds. What was done is listed, and the features of the
 * set the words name that it had not got yet.
 */
export function mendSheet(
  input: StorySheet,
  bible: StudioBible,
  before: EndState | null = null,
): { sheet: StorySheet; mended: string[]; features: StudioFeature[] } {
  const mended: string[] = [];
  const sheet: StorySheet = JSON.parse(JSON.stringify(input)) as StorySheet;
  const byId = new Map(bible.characters.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const inCast = (id: string | null | undefined): id is string =>
    Boolean(id && byId.has(id));
  const doerOf = (id: string): Doer => byId.get(id)?.kind ?? 'person';

  sheet.set = setId(sheet.set, bible) ?? sheet.set;
  const set = bible.sets.find((s) => s.id === sheet.set) ?? null;
  // A vessel (a bus, a boat) holds a few people besides the story's, never a crowd.
  if (sheet.crowd === 'many' && set?.kind === 'vessel') {
    sheet.crowd = 'few';
    mended.push('a vessel holds a few people, not a crowd');
  }

  // Who is there as it opens: the bible's people, each once, each on a spot of their own.
  const taken = new Set<Spot>();
  const opening: StorySheet['onStage'] = [];
  for (const place of sheet.onStage) {
    const who = characterId(place.who, bible) ?? place.who;
    if (opening.some((p) => p.who === who)) {
      mended.push(`${nameOf(who)} was listed twice as the scene opens`);
      continue;
    }
    const spot = freeSpot(place.spot, taken);
    if (!spot) continue;
    if (spot !== place.spot)
      mended.push(
        `${nameOf(who)} moved to the ${spot}: someone already stands ${place.spot === 'centre' ? 'in the centre' : `on the ${place.spot}`}`,
      );
    taken.add(spot);
    opening.push({ ...place, who, spot });
  }
  // Each thing in one hand: what the scene before left in someone's hand
  // is still theirs if they are here, and no one else holds it too.
  const hadBefore = new Map(
    (before?.held ?? []).map((h) => [h.thing, h.who] as const),
  );
  for (const place of opening) {
    if (!place.holding) continue;
    const had = hadBefore.get(place.holding);
    const first = opening.find((p) => p.holding === place.holding);
    const owner =
      had && had !== place.who && opening.some((p) => p.who === had)
        ? had
        : first && first !== place
          ? first.who
          : null;
    if (!owner) continue;
    mended.push(
      `${nameOf(place.who)} does not hold the ${place.holding}: ${nameOf(owner)} has it`,
    );
    const theirs = opening.find((p) => p.who === owner);
    if (theirs && !theirs.holding) theirs.holding = place.holding;
    place.holding = null;
  }
  sheet.onStage = opening;

  // The things on the stage: each once, and none resting on the ground
  // that someone holds as it opens.
  const props = new Map<StageProp, string | null>();
  for (const one of sheet.props) {
    if (props.has(one.prop)) continue;
    const holder = opening.find((p) => p.holding === one.prop);
    if (holder) {
      mended.push(
        `the ${one.prop} is in ${nameOf(holder.who)}'s hand as it opens, not on the ground`,
      );
      continue;
    }
    props.set(one.prop, characterId(one.near, bible) ?? null);
  }

  // The set's features, and the ones the words name that it has not got.
  const features: StudioFeature[] = [...(set?.features ?? [])];
  const found: StudioFeature[] = [];

  const here = new Map<string, Spot>(opening.map((p) => [p.who, p.spot]));
  /** Who holds each thing on the stage now, in a hand or a mouth; null, it lies on the ground. Someone gone keeps what they took. */
  const holders = new Map<StageProp, string | null>(
    [...props.keys()].map((prop) => [prop, null]),
  );
  for (const place of opening)
    if (isStageProp(place.holding)) holders.set(place.holding, place.who);
  const actors: Actor[] = bible.characters.map((c) => ({
    id: c.id,
    names: [...new Set([c.name, c.name.split(/\s+/)[0]])],
    gender: genderOf(c.voice),
  }));
  /** Who was named or spoke, the latest last: whom "him" and "her" mean. */
  const recent: string[] = [];
  const mention = (id: string | null | undefined) => {
    if (!id) return;
    const i = recent.indexOf(id);
    if (i >= 0) recent.splice(i, 1);
    recent.push(id);
  };
  /** The thing last named: what "it" means. */
  let lastThing: ThingId | null = null;
  /** The side each one who went went off by, and the last to go: where a look after them goes. */
  const wentBy = new Map<string, '@left' | '@right'>();
  /** The feature each one who went went out by. */
  const wentVia = new Map<string, string>();
  let wentOff: '@left' | '@right' | null = null;
  const out: SheetBeat[] = [];
  /** Where each beat of the sheet as written is now. */
  const where: number[] = [];
  /** The way each one came in by: whoever comes in after them comes the same way. */
  const cameVia = new Map<string, string | null>();
  /** Where each thing no one holds lies, where that is known: before whom it was set out, where it was let go. */
  const restsBy = new Map<StageProp, Spot>(
    [...props].flatMap(([prop, near]) => {
      const spot = near ? here.get(near) : undefined;
      return spot ? [[prop, spot] as const] : [];
    }),
  );
  /** What someone coming on brings, in hand or mouth: theirs unless the stage has it already. */
  const bringsOn = (who: string) => {
    for (const brings of comesWith(byId.get(who), before))
      if (isStageProp(brings) && !holders.has(brings)) holders.set(brings, who);
  };
  const bringOn = (who: string, at: number, why: string): boolean => {
    if (here.has(who)) return true;
    if (here.size >= MOST_ON_STAGE) return false;
    const used = new Set(here.values());
    const spot = ARRIVAL.find((s) => !used.has(s)) ?? null;
    if (!spot) return false;
    out.push({
      ...blankBeat('action'),
      who,
      do: 'enter',
      spot,
      say: `${nameOf(who)} comes in.`,
      seconds: 1,
    });
    here.set(who, spot);
    bringsOn(who);
    mended.push(`beat ${at + 1}: ${nameOf(who)} walks on first, ${why}`);
    return true;
  };

  /**
   * A feature of the set by the word for it: the set's own, or one of
   * its kind it has only one of, or a new one, standing where the one
   * who first acts on it would find it: at the nearer edge for a way out
   * or somewhere to go, else beside them. Null for no feature, or for the
   * set itself (the bus a scene is set in).
   */
  const featureFor = (
    word: string,
    who: string | null,
    going: boolean,
  ): string | null => {
    const kind = featureKindOf(word);
    if (!kind) return null;
    if (
      set &&
      (set.id === word ||
        studioId(set.name).split('-').includes(word) ||
        (kind === 'vehicle' && set.kind === 'vessel'))
    )
      return null;
    const own =
      features.find((f) => f.id === word) ??
      (features.filter((f) => f.kind === kind).length === 1
        ? features.find((f) => f.kind === kind)
        : undefined);
    // Named only in words said, by no one going to it: at the back, until
    // someone in this scene acts on it and so says where it stands.
    const k = SPOTS.indexOf((who && here.get(who)) || 'centre');
    // A way out on the side they are, at its edge; or, where someone
    // stands there, the free spot nearest it, so no one hides it.
    const used = new Set(here.values());
    const way = (): Spot => {
      const edge = k < 2 ? 0 : SPOTS.length - 1;
      const step = edge ? -1 : 1;
      for (let n = edge; n !== k && n >= 0 && n < SPOTS.length; n += step)
        if (!used.has(SPOTS[n])) return SPOTS[n];
      return SPOTS[edge];
    };
    const where = (): Spot =>
      going
        ? way()
        : SPOTS[k < 2 ? Math.max(0, k - 1) : Math.min(SPOTS.length - 1, k + 1)];
    if (own) {
      if (who && own.spot === 'back' && found.includes(own)) own.spot = where();
      return own.id;
    }
    const spot: Spot | 'back' = who ? where() : 'back';
    const made: StudioFeature = {
      id: word,
      name: word,
      kind,
      spot,
      opens: OPENING_FEATURES.includes(kind),
    };
    features.push(made);
    found.push(made);
    mended.push(
      `the ${word} is on the ${sheet.set} set for good, ${spot === 'back' ? 'at the back' : `on the ${spot}`}`,
    );
    return made.id;
  };

  // Where the lines and the narration find someone ("There he is, by the
  // goalpost!"): a feature the set had not got that someone is found by
  // is on it; and one found there who goes nowhere before is there from
  // the start, as the stage has them.
  for (const beat of sheet.beats)
    if (beat.kind === 'line' || beat.kind === 'narration')
      for (const named of featuresNamedIn(beat.say))
        if (
          PLACED.test(beat.say.slice(0, named.at)) &&
          !features.some((f) => f.kind === named.kind)
        )
          featureFor(featureIdOf(named.word), null, false);
  const placed = placementsOf(
    {
      ...sheet,
      beats: sheet.beats.map((b) => ({
        ...b,
        who: characterId(b.who, bible) ?? b.who,
        to: characterId(b.to, bible) ?? b.to,
      })),
    },
    bible,
    features,
  );
  for (const one of placed) {
    const feature = features.find((f) => f.id === one.feature);
    const goes = sheet.beats
      .slice(0, one.beat)
      .some(
        (b) =>
          b.kind === 'action' &&
          characterId(b.who, bible) === one.who &&
          doingsIn(b.say, { actors: [], who: one.who }).some(
            (d) => doingOf(d.do)?.kind === 'travel',
          ),
      );
    if (
      feature &&
      feature.spot !== 'back' &&
      here.has(one.who) &&
      !goes &&
      ![...here].some(([id, spot]) => id !== one.who && spot === feature.spot)
    )
      here.set(one.who, feature.spot);
  }

  /** One doing, from the words or the sheet, made one the stage can play, and set down. */
  const act = (
    beat: SheetBeat,
    plan: ReadDoing & { spot: Spot | null },
    at: number,
    kept: string,
  ): void => {
    const n = at + 1;
    const who = plan.who ?? beat.who;
    if (!inCast(who)) return;
    const doer = doerOf(who);
    let id = plan.do;
    if (!canDo(id, doer)) {
      const instead = fallbackFor(id, doer);
      mended.push(
        `beat ${n}: ${nameOf(who)} cannot do ${called(id)}; ${called(instead)} instead`,
      );
      id = instead;
    }
    let target: string | null = plan.target;
    if (target && !target.startsWith('@')) {
      const person = characterId(target, bible);
      if (person) target = person;
      else if (featureKindOf(target) && !isThing(target))
        target = featureFor(target, who, doingOf(id)?.kind === 'travel');
    }
    if (target === who) target = null;
    let via = plan.via ? featureFor(plan.via, who, true) : null;
    // Into or out of the vessel the scene is set in: by its door.
    if (
      !via &&
      plan.via &&
      set?.kind === 'vessel' &&
      (id === 'enter' || id === 'leave') &&
      featureKindOf(plan.via) === 'vehicle'
    )
      via = features.find((f) => f.opens)?.id ?? null;
    const thing = plan.thing;
    const person = (t: string | null): t is string => inCast(t);
    const make = (kind: SheetBeat['kind'], extra: Partial<SheetBeat>): void => {
      out.push(
        tidy({
          ...blankBeat(kind),
          who,
          say: kept,
          seconds: kind === 'action' ? beat.seconds : null,
          ...(beat.doSaid ? { doSaid: beat.doSaid } : {}),
          ...extra,
        }),
      );
      mention(who);
    };
    const doing = doingOf(id)!;

    // ── Going somewhere ──
    if (doing.kind === 'travel') {
      // At the pace the words or the sheet say; else as the doing goes.
      const pace = plan.pace ?? (doing.runs ? 'run' : 'walk');
      // Going after someone gone, or after something not here: going off.
      if (
        id === 'chase' &&
        (!target || (person(target) && !here.has(target)))
      ) {
        // After them: out the way they went, by the feature or the side.
        if (person(target) && !here.has(target)) {
          via ??= wentVia.get(target) ?? null;
          target = via ? null : (wentBy.get(target) ?? null);
        }
        id = 'leave';
      }
      if ((id === 'climb' || id === 'hide') && !(target && isFeature(target))) {
        const instead = doing.fallback ?? 'nod';
        mended.push(`beat ${n}: nothing to ${id}; ${called(instead)} instead`);
        return act(beat, { ...plan, do: instead }, at, kept);
      }
      if (id === 'squeeze' && !via && !(target && isFeature(target)))
        id = 'leave';
      if (id === 'squeeze' && !via && target) [via, target] = [target, null];
      if (id === 'enter') {
        if (here.has(who)) {
          // On the stage already: they come over to where it says.
          if (!plan.spot && !target) {
            mended.push(`beat ${n}: ${nameOf(who)} is on the stage already`);
            return;
          }
          id = 'walk';
        } else {
          const spot = freeSpot(
            plan.spot ?? 'centre-right',
            new Set(here.values()),
          );
          if (spot && here.size < MOST_ON_STAGE) here.set(who, spot);
          bringsOn(who);
          // After someone who came in before: the way they came.
          const after = person(target) && cameVia.has(target) ? target : null;
          via ??= after ? (cameVia.get(after) ?? null) : null;
          cameVia.set(who, via);
          make('action', {
            do: 'enter',
            spot: spot ?? plan.spot,
            ...(via ? { via } : {}),
            ...(after ? { target: after } : {}),
            ...(pace === 'run' ? { pace } : {}),
          });
          return;
        }
      }
      if (id === 'leave' || id === 'squeeze') {
        if (!here.has(who)) {
          mended.push(`beat ${n}: ${nameOf(who)} is not there to leave`);
          return;
        }
        // Through a feature, off by the side it stands on; after someone,
        // the side they went.
        const through = via ?? (id === 'squeeze' ? target : null);
        wentOff =
          !through && (target === '@left' || target === '@right')
            ? target
            : exitSideOf(
                here,
                who,
                new Map(features.map((f) => [f.id, f])),
                through,
              );
        wentBy.set(who, wentOff);
        if (through) wentVia.set(who, through);
        // What they hold goes with them.
        here.delete(who);
        make('action', {
          do: id,
          ...(via ? { via } : {}),
          ...(target && !person(target) ? { target } : {}),
          ...(pace === 'run' ? { pace } : {}),
        });
        return;
      }
      if (!here.has(who)) bringOn(who, at, 'to be seen going');
      // Where they go: the spot the sheet gives; beside someone, the free
      // spot next to them on the side they come from, said here so the
      // stage stands them where this check has them. By a feature, the
      // stage finds the place, and they are kept near its spot here.
      let spot: Spot | null = null;
      const others = new Set(
        [...here].filter(([one]) => one !== who).map(([, s]) => s),
      );
      // Nowhere named, where the words find them later ("There he is, by
      // the goalpost!"): there.
      if (!plan.spot && !target && !via) target = foundLater(who, at);
      const from = here.get(who) ?? null;
      if (plan.spot) spot = freeSpot(plan.spot, others);
      else if (person(target) && here.has(target))
        spot = besideSpot(who, target, others);
      else if (target === '@left' || target === '@right')
        spot = sideSpot(who, target, others, pace === 'run');
      else if (!target && !via)
        spot = offTo(who, others, pace === 'run' || plan.away);
      if (spot) here.set(who, spot);
      else {
        const by = target ? features.find((f) => f.id === target) : undefined;
        if (by && by.spot !== 'back' && !others.has(by.spot))
          here.set(who, by.spot);
      }
      make('action', {
        do: id,
        spot,
        // As long as the walk across takes, where it is known.
        seconds: from && spot ? walkSeconds(from, spot, pace) : null,
        ...(target ? { target } : {}),
        ...(thing ? { thing } : {}),
        ...(pace ? { pace } : {}),
      });
      // Fetched, a thing lying about is picked up.
      if (id === 'fetch' && isStageProp(thing) && holders.get(thing) === null)
        act(
          beat,
          { ...plan, do: 'take', target: null, thing },
          at,
          `${nameOf(who)} picks up the ${thing}.`,
        );
      return;
    }

    if (!here.has(who)) bringOn(who, at, 'to be seen doing it');

    // ── The body ──
    if (doing.kind === 'body') {
      if (id === 'hug' || id === 'reach') {
        const them = person(target) ? target : person(beat.to) ? beat.to : null;
        if (them && !here.has(them) && id === 'hug')
          bringOn(them, at, 'to be hugged');
        if (!them || !here.has(them)) {
          // No one there to hug or reach for: a point at where they are.
          mended.push(
            `beat ${n}: no one there to ${id === 'hug' ? 'hug' : 'reach for'}; a point`,
          );
          id = 'point';
          if (them) target = wentBy.get(them) ?? null;
        } else {
          target = them;
          // Too far off to reach: they go over to them first.
          closeIn(who, them, at);
        }
      }
      if (id === 'look' && !target && plan.away) target = wentOff;
      // Done close to a feature ("looks under a bench", "leans in close to
      // a crate"): they go over to it first.
      if (target && isFeature(target) && CLOSE_TO.has(id))
        goOver(who, target, at);
      if (target && person(target) && !here.has(target))
        target =
          id === 'look' || id === 'point' ? (wentBy.get(target) ?? null) : null;
      make('action', { do: id, ...(target ? { target } : {}) });
      return;
    }

    // ── Handling a thing ──
    let prop: StageProp | null = isStageProp(thing) ? thing : null;
    if (!prop && !thing) {
      // Eaten or drunk with nothing named: what there is to eat or drink.
      const kind =
        id === 'eat' || id === 'chew'
          ? 'food'
          : id === 'drink'
            ? 'drink'
            : null;
      prop =
        (beat.prop && (!kind || PROP_KIND[beat.prop] === kind)
          ? beat.prop
          : null) ??
        (kind
          ? ([...props.keys()].find((p) => PROP_KIND[p] === kind) ?? null)
          : null);
    }
    const carried: ThingId | null = prop ?? thing;
    const fall = (why: string): void => {
      const instead =
        doingOf(fallbackFor(doing.fallback ?? 'nod', doer)) ?? doingOf('nod')!;
      mended.push(`beat ${n}: ${why}; ${called(instead.id)} instead`);
      if (instead.kind === 'handle' && instead.id !== id)
        return act(beat, { ...plan, do: instead.id }, at, kept);
      make(instead.kind === 'handle' ? 'business' : 'action', {
        do: instead.id,
        ...(target ? { target } : {}),
        ...(carried ? { thing: carried } : {}),
      });
    };
    if (id === 'open' || id === 'close') {
      const feature =
        target && isFeature(target)
          ? target
          : (features.find((f) => f.opens)?.id ?? null);
      if (!feature) return fall(`nothing to ${id}`);
      make('business', { do: id, target: feature });
      return;
    }
    // Gear is drawn in the hand for good: a staff is never handed about.
    if (!prop && thing) return fall(`the ${thing} is never let go of`);
    if (!prop) {
      if (doing.thing === 'held' || doing.thing === 'resting')
        return fall(`nothing named to ${id}`);
      make('business', { do: id, ...(target ? { target } : {}) });
      return;
    }
    // A thing not on the stage yet: in the hand of whoever first needs it
    // in hand, if they are there as it opens with a hand free (the ball
    // thrown in the first beat is theirs from the start); else set out
    // before whoever first does something with it.
    if (!holders.has(prop)) {
      const opens = opening.find((p) => p.who === who);
      if (doing.thing === 'held' && opens && !opens.holding) {
        opens.holding = prop;
        holders.set(prop, who);
        mended.push(
          `${nameOf(who)} holds the ${prop} from the start, to ${id} it`,
        );
      } else {
        props.set(prop, who);
        holders.set(prop, null);
        mended.push(`the ${prop} set on the stage, before ${nameOf(who)}`);
      }
    }
    if (id === 'eat' && PROP_KIND[prop] !== 'food')
      return act(beat, { ...plan, do: 'chew' }, at, kept);
    if (id === 'drink' && PROP_KIND[prop] !== 'drink')
      return fall(`the ${prop} is nothing to drink from`);
    if (id === 'break' && prop !== 'bread')
      return fall(`only bread is broken on the stage, not the ${prop}`);
    const holder = holders.get(prop) ?? null;
    /** An animal carries one thing, in its mouth: what it has is dropped first. */
    const mouthFree = (by: string) => {
      if (byId.get(by)?.kind !== 'animal') return;
      for (const [other, one] of holders) {
        if (one !== by || other === prop) continue;
        out.push(
          tidy({
            ...blankBeat('business'),
            who: by,
            do: 'drop',
            prop: other,
            thing: other,
            say: `${nameOf(by)} drops the ${other}.`,
          }),
        );
        holders.set(other, null);
        mended.push(`beat ${n}: ${nameOf(by)} drops the ${other} first`);
      }
    };
    if (id === 'take' || id === 'dip' || id === 'catch') {
      if (id === 'take' && holder === who) {
        mended.push(`beat ${n}: ${nameOf(who)} has the ${prop} already`);
        return;
      }
      // Lying far off: they go over to it first.
      if (id === 'take' && holder === null) goToThing(who, prop, at);
      // One thrown to them they have as it arrives: this is that catch.
      if (holder && holder !== who) {
        target = holder;
        return fall(`${nameOf(holder)} has the ${prop}`);
      }
      if (id !== 'dip' && holder !== who) mouthFree(who);
    } else if (id === 'kick') {
      if (holder && holder !== who) {
        target = holder;
        return fall(`${nameOf(holder)} has the ${prop}`);
      }
    } else if (doing.thing === 'held' || id === 'chew') {
      if (holder && holder !== who) {
        target = holder;
        return fall(`${nameOf(holder)} has the ${prop}`);
      }
      if (holder === null) {
        mouthFree(who);
        out.push(
          tidy({
            ...blankBeat('business'),
            who,
            do: 'take',
            prop,
            thing: prop,
            say: `${nameOf(who)} takes the ${prop}.`,
          }),
        );
        holders.set(prop, who);
        mended.push(`beat ${n}: ${nameOf(who)} takes the ${prop} up first`);
      }
    }
    let to: string | null = null;
    if (id === 'give' || id === 'throw' || id === 'kick') {
      to = person(target) ? target : person(beat.to) ? beat.to : null;
      if (to && !here.has(to) && id === 'give')
        bringOn(to, at, 'to be given it');
      if (id === 'give' && (!to || !here.has(to)))
        return fall(`no one there to give the ${prop} to`);
      if (id === 'give' && to) comeOver(who, to, at);
      // Thrown after someone gone: toward where they went.
      if (to && !here.has(to)) {
        target = wentBy.get(to) ?? null;
        to = null;
      }
      if (to) target = to;
    }
    if (id === 'take' || id === 'catch') holders.set(prop, who);
    if (id === 'put' || id === 'drop' || id === 'kick') holders.set(prop, null);
    if (id === 'put' || id === 'drop') {
      const spot = here.get(who);
      if (spot) restsBy.set(prop, spot);
    } else if (id !== 'take' && id !== 'dip') restsBy.delete(prop);
    if (id === 'give' && to) holders.set(prop, to);
    // Thrown to someone, they catch it; anywhere else, it lands and lies.
    if (id === 'throw') {
      if (to) mouthFree(to);
      holders.set(prop, to);
    }
    make('business', {
      do: id,
      prop,
      thing: prop,
      ...(to && id !== 'kick' ? { to } : {}),
      ...(target ? { target } : {}),
    });
    lastThing = prop;
  };
  /**
   * Someone handing a thing to one with others between them goes over to
   * stand beside them first, so it is never passed through anyone.
   */
  const comeOver = (who: string, to: string, at: number) => {
    const order = [...here]
      .sort((a, b) => SPOTS.indexOf(a[1]) - SPOTS.indexOf(b[1]))
      .map(([id]) => id);
    if (Math.abs(order.indexOf(who) - order.indexOf(to)) <= 1) return;
    const k = SPOTS.indexOf(here.get(to)!);
    const way = SPOTS.indexOf(here.get(who)!) < k ? -1 : 1;
    const used = new Set(here.values());
    const spot = [k + way, k - way]
      .map((n) => SPOTS[n])
      .find((one) => one && !used.has(one));
    if (!spot) return;
    out.push({
      ...blankBeat('action'),
      who,
      do: 'walk',
      spot,
      pace: 'walk',
      seconds: walkSeconds(here.get(who)!, spot, 'walk'),
      target: to,
      say: `${nameOf(who)} goes over to ${nameOf(to)}.`,
    });
    here.set(who, spot);
    mended.push(
      `beat ${at + 1}: ${nameOf(who)} goes over to ${nameOf(to)} to hand it over`,
    );
  };
  /** Someone going over to a thing lying far off to take it, to the free spot nearest it. */
  const goToThing = (who: string, prop: StageProp, at: number) => {
    const lies = restsBy.get(prop);
    const mine = here.get(who);
    if (!lies || !mine) return;
    const k = SPOTS.indexOf(lies);
    const apart = Math.abs(SPOTS.indexOf(mine) - k);
    if (apart <= 1) return;
    const taken = new Set(
      [...here].filter(([id]) => id !== who).map(([, s]) => s),
    );
    const spot = SPOTS.filter(
      (one) => !taken.has(one) && Math.abs(SPOTS.indexOf(one) - k) < apart,
    ).sort(
      (a, b) => Math.abs(SPOTS.indexOf(a) - k) - Math.abs(SPOTS.indexOf(b) - k),
    )[0];
    if (!spot) return;
    out.push({
      ...blankBeat('action'),
      who,
      do: 'walk',
      spot,
      pace: 'walk',
      seconds: walkSeconds(mine, spot, 'walk'),
      target: prop,
      say: `${nameOf(who)} goes over to the ${prop}.`,
    });
    here.set(who, spot);
    mended.push(`beat ${at + 1}: ${nameOf(who)} goes over to the ${prop}`);
  };
  /** Someone going over to a feature to do something close to it, unless they are by it already. */
  const goOver = (who: string, feature: string, at: number) => {
    const f = features.find((one) => one.id === feature);
    if (!f || f.spot === 'back') return;
    const apart = Math.abs(
      SPOTS.indexOf(here.get(who)!) - SPOTS.indexOf(f.spot),
    );
    const last = out[out.length - 1];
    if (
      apart <= 1 ||
      (last?.who === who && last.do === 'walk' && last.target === feature)
    )
      return;
    out.push({
      ...blankBeat('action'),
      who,
      do: 'walk',
      target: feature,
      say: `${nameOf(who)} goes over to the ${f.name}.`,
    });
    if (![...here].some(([id, s]) => id !== who && s === f.spot))
      here.set(who, f.spot);
    mended.push(`beat ${at + 1}: ${nameOf(who)} goes over to the ${f.name}`);
  };
  /** Someone too far off to hug or reach for going over to the free spot nearest them first. */
  const closeIn = (who: string, to: string, at: number) => {
    const theirs = SPOTS.indexOf(here.get(to)!);
    const apart = Math.abs(SPOTS.indexOf(here.get(who)!) - theirs);
    if (apart <= 1) return;
    const taken = new Set(
      [...here].filter(([id]) => id !== who).map(([, s]) => s),
    );
    const spot =
      besideSpot(who, to, taken) ??
      SPOTS.filter(
        (one) =>
          !taken.has(one) && Math.abs(SPOTS.indexOf(one) - theirs) < apart,
      ).sort(
        (a, b) =>
          Math.abs(SPOTS.indexOf(a) - theirs) -
          Math.abs(SPOTS.indexOf(b) - theirs),
      )[0];
    if (!spot) return;
    out.push({
      ...blankBeat('action'),
      who,
      do: 'walk',
      spot,
      pace: 'walk',
      seconds: walkSeconds(here.get(who)!, spot, 'walk'),
      target: to,
      say: `${nameOf(who)} goes over to ${nameOf(to)}.`,
    });
    here.set(who, spot);
    mended.push(`beat ${at + 1}: ${nameOf(who)} goes over to ${nameOf(to)}`);
  };
  /**
   * The spot beside someone that one going to them takes: on the side
   * they come from, else the other; where they stand already beside them,
   * their own. Null when both are taken.
   */
  const besideSpot = (
    who: string,
    to: string,
    taken: ReadonlySet<Spot>,
  ): Spot | null => {
    const theirs = SPOTS.indexOf(here.get(to)!);
    const mine = SPOTS.indexOf(here.get(who) ?? 'centre');
    if (Math.abs(mine - theirs) === 1) return SPOTS[mine];
    const way = mine < theirs ? -1 : 1;
    return (
      [theirs + way, theirs - way]
        .map((n) => SPOTS[n])
        .find((one) => one && !taken.has(one)) ?? null
    );
  };
  /** The free spot one going toward a side of the stage goes to: the next that way, or at a run the farthest. */
  const sideSpot = (
    who: string,
    side: '@left' | '@right',
    taken: ReadonlySet<Spot>,
    far: boolean,
  ): Spot | null => {
    const way = side === '@left' ? -1 : 1;
    let found: Spot | null = null;
    for (
      let k = SPOTS.indexOf(here.get(who) ?? 'centre') + way;
      k >= 0 && k < SPOTS.length && !taken.has(SPOTS[k]);
      k += way
    ) {
      found = SPOTS[k];
      if (!far) break;
    }
    return found;
  };
  /**
   * Where one going with nowhere named goes: across the stage to the free
   * spot farthest off at a run or going away, else the nearest; the
   * middle first on a tie. Null for none free.
   */
  const offTo = (
    who: string,
    taken: ReadonlySet<Spot>,
    far: boolean,
  ): Spot | null => {
    const mine = SPOTS.indexOf(here.get(who) ?? 'centre');
    const free = SPOTS.filter((spot, k) => k !== mine && !taken.has(spot)).sort(
      (a, b) =>
        (far ? -1 : 1) *
          (Math.abs(SPOTS.indexOf(a) - mine) -
            Math.abs(SPOTS.indexOf(b) - mine)) ||
        Math.abs(SPOTS.indexOf(a) - 2) - Math.abs(SPOTS.indexOf(b) - 2),
    );
    return free[0] ?? null;
  };
  /**
   * The feature the words find someone by later, if this is the last
   * going of theirs before it: "Pip darts away." … "There he is, by the
   * goalpost!" Null for none.
   */
  const foundLater = (who: string, at: number): string | null => {
    const found = placed.find((one) => one.who === who && one.beat > at);
    if (!found) return null;
    const goesAgain = sheet.beats
      .slice(at + 1, found.beat)
      .some(
        (b) =>
          b.kind === 'action' &&
          characterId(b.who, bible) === who &&
          doingsIn(b.say, { actors, who }).some(
            (d) => doingOf(d.do)?.kind === 'travel',
          ),
      );
    return goesAgain ? null : found.feature;
  };
  const isThing = (word: string) =>
    (Object.keys(THING_WORDS) as ThingId[]).includes(word as ThingId);
  const isFeature = (word: string) => features.some((f) => f.id === word);

  sheet.beats.forEach((raw, at) => {
    where[at] = out.length;
    const beat: SheetBeat = { ...raw };
    beat.who = characterId(beat.who, bible) ?? beat.who;
    beat.to = characterId(beat.to, bible) ?? beat.to;
    if (beat.kind === 'line') {
      if (beat.who && NARRATOR.test(beat.who)) {
        mended.push(`beat ${at + 1}: the narrator's words are narration`);
        beat.kind = 'narration';
        beat.who = null;
        beat.to = null;
        beat.feeling = null;
        beat.from = null;
        beat.pace = null;
      } else {
        // A line is what they say, not the words around it: "…," said Ada.
        const said = lineOf(beat.say);
        if (said.attributed) {
          beat.say = said.text;
          mended.push(`beat ${at + 1}: the line without "said …" around it`);
        } else beat.say = said.text;
        const speaker = bible.characters.find((c) => c.id === beat.who);
        // Words no character says: a question to the viewer, someone
        // telling of themselves as another would. The narrator's.
        const why = speaker ? narratorsLine(beat.say, [speaker.name]) : null;
        if (why) {
          mended.push(`beat ${at + 1}: ${why}; the narrator says it`);
          beat.kind = 'narration';
          beat.who = null;
          beat.to = null;
          beat.from = null;
          beat.pace = null;
          beat.feeling = null;
        }
      }
    }
    if (beat.kind === 'line' && beat.who) {
      const away = beat.from && FROM_AWAY.has(beat.from);
      if (!away && inCast(beat.who)) bringOn(beat.who, at, 'to say their line');
      if (beat.to && (beat.to === beat.who || !here.has(beat.to))) {
        if (beat.to !== beat.who && inCast(beat.to))
          mended.push(
            `beat ${at + 1}: said to everyone; ${nameOf(beat.to)} is not on the stage`,
          );
        beat.to = null;
      }
      mention(beat.who);
    }
    if (beat.kind === 'line' || beat.kind === 'narration') {
      // Whom the words name, and the thing they name last: "him", "it".
      for (const actor of actors)
        if (actor.names.some((name) => name && beat.say.includes(name)))
          mention(actor.id);
      for (const [thing, pattern] of Object.entries(THING_WORDS))
        if (pattern.test(beat.say)) lastThing = thing as ThingId;
      // A feature the narration tells open or shut is on its set: "the
      // gate is open a crack". One only named, in a line or in passing,
      // is never made for it: "we must not miss the bus", "take a seat".
      if (beat.kind === 'narration')
        for (const told of featureStatesIn(beat.say))
          featureFor(featureIdOf(told.word), null, false);
      // One the narration says opens or shuts it goes to it, as the stage
      // has them: where they stand now is by it.
      if (beat.kind === 'narration')
        for (const one of doingsIn(beat.say, { actors })) {
          const f =
            (one.do === 'open' || one.do === 'close') && one.target
              ? features.find((x) => x.id === featureIdOf(one.target!))
              : undefined;
          if (!f || !one.who || !here.has(one.who) || f.spot === 'back')
            continue;
          const by = freeSpot(
            f.spot,
            new Set(
              [...here].filter(([id]) => id !== one.who).map(([, s]) => s),
            ),
          );
          if (by) here.set(one.who, by);
        }
      // A thing the words find there ("A tuft of white fur!", "a bone lies
      // by the step") is set out, before whoever says so; never one someone
      // is bringing, nor one said to be gone.
      for (const found of thingsFoundIn(beat.say, beat.kind === 'narration')) {
        // One someone handles next is set out before them, as they do.
        const handled = sheet.beats
          .slice(at + 1)
          .some(
            (b) =>
              (b.kind === 'business' || b.kind === 'action') &&
              PROP_WORDS[found].test(b.say),
          );
        if (holders.has(found) || handled) continue;
        if (
          bible.characters.some(
            (c) =>
              c.carries === found &&
              sheet.beats.some((b) => characterId(b.who, bible) === c.id),
          )
        )
          continue;
        const near = beat.kind === 'line' && inCast(beat.who) ? beat.who : null;
        props.set(found, near);
        holders.set(found, null);
        mended.push(
          `the ${found} the words find is set on the stage${near ? `, before ${nameOf(near)}` : ''}`,
        );
      }
    }
    if (
      (beat.kind === 'action' || beat.kind === 'business') &&
      inCast(beat.who)
    ) {
      // The words win: what they say is done is what is done.
      const known = { actors, who: beat.who, lastThing, recent };
      const read = beat.say.trim() ? doingsIn(beat.say, known) : [];
      const plans = read.length
        ? read
        : beat.doSaid
          ? doingsIn(beat.doSaid, known)
          : [];
      const own: ReadDoing = {
        do: beat.do ?? 'nod',
        at: 0,
        end: 0,
        who: null,
        target: beat.target ?? null,
        thing: beat.thing ?? beat.prop ?? null,
        via: beat.via ?? null,
        pace: beat.pace === 'walk' || beat.pace === 'run' ? beat.pace : null,
        away: false,
        words: beat.say,
      };
      if (!plans.length) {
        if (!beat.do)
          mended.push(
            `beat ${at + 1}: "${beat.doSaid ?? beat.say}" is none of the doings; a nod`,
          );
        act(beat, { ...own, spot: beat.spot }, at, beat.say);
        return;
      }
      if (plans.length > 1)
        mended.push(
          `beat ${at + 1}: "${beat.say}" is ${plans.map((p) => called(p.do)).join(' and ')}`,
        );
      else if (plans[0].do !== beat.do)
        mended.push(
          `beat ${at + 1}: "${beat.say.slice(plans[0].at, plans[0].end)}" is ${called(plans[0].do)}, not ${called(beat.do)}`,
        );
      plans.forEach((plan, k) => {
        // One doing: the sheet's own aim, thing and way where the words
        // give none. Several: each its own words.
        const same = plans.length === 1 || plan.do === beat.do;
        const aimsAt = doingOf(plan.do)?.aims ?? [];
        const merged = {
          ...plan,
          target:
            plan.target ??
            (same ? own.target : null) ??
            (same && aimsAt.includes('character') && beat.to ? beat.to : null),
          thing: plan.thing ?? (same ? own.thing : null),
          via: plan.via ?? (same ? own.via : null),
          pace: plan.pace ?? (same ? own.pace : null),
          spot: k === 0 || same ? beat.spot : null,
        };
        const kept =
          plans.length > 1
            ? `${plan.words.charAt(0).toUpperCase()}${plan.words.slice(1)}${/[.!?]$/u.test(plan.words) ? '' : '.'}`
            : beat.say;
        act(beat, merged, at, kept);
        if (merged.thing) lastThing = merged.thing;
      });
      return;
    }
    if (beat.kind === 'reaction' && beat.who && !beat.feeling && !beat.sign)
      beat.feeling = faceNamed(beat.say) ?? null;
    out.push(tidy(beat));
  });
  sheet.beats = out;
  sheet.props = [...props].map(([prop, near]) => ({ prop, near }));

  // The camera where the sheet put it, only on who is there when it is.
  const present = presenceByBeat(sheet);
  sheet.camera = sheet.camera.flatMap((shot) => {
    const beat = Math.min(
      where[shot.beat] ?? out.length - 1,
      Math.max(0, out.length - 1),
    );
    const on = characterId(shot.on, bible) ?? shot.on;
    const also = characterId(shot.with, bible) ?? shot.with;
    const there = present[beat] ?? new Set();
    if (shot.shot !== 'wide' && (!on || !there.has(on))) {
      mended.push(
        `the ${shot.shot} shot at beat ${shot.beat + 1} is on no one there; left out`,
      );
      return [];
    }
    return [
      {
        ...shot,
        beat,
        on: shot.shot === 'wide' ? null : on,
        with: shot.shot === 'two' && also && there.has(also) ? also : null,
      },
    ];
  });
  return { sheet, mended, features: found };
}

/** How each doing is said of someone, where it is not its id with an "s": "reaches for", "leans in toward". */
const SAID: Partial<Record<DoingId, string>> = {
  'lean-in': 'leans in toward',
  look: 'looks at',
  point: 'points at',
  reach: 'reaches for',
  hop: 'hops for joy',
  shake: 'shakes their head',
  'stand-up': 'stands up',
  'lie-down': 'lies down',
  'bark-bounce': 'barks',
  'roll-over': 'rolls over',
  'shake-off': 'shakes off',
  crouch: 'crouches down by',
  sit: 'sits down',
  walk: 'walks over to',
  run: 'runs to',
  enter: 'comes in',
  squeeze: 'squeezes under',
  hide: 'hides behind',
  take: 'picks up',
  put: 'puts down',
  use: 'uses',
  spin: 'spins round',
  fall: 'falls over',
};

/** A going said at a run. */
const RUNS: Partial<Record<DoingId, string>> = {
  enter: 'runs in',
  leave: 'runs off',
  walk: 'runs over to',
};

/**
 * A move picked by hand, said in plain words: "Maya waves.", "Mama gives
 * the cup to Maya." The words win, so a move the maker picks on the card
 * becomes the beat's words, and is what the stage plays.
 */
export function wordsFor(beat: SheetBeat, bible: StudioBible): string {
  const nameOf = (id: string | null | undefined) =>
    id
      ? (bible.characters.find((c) => c.id === id)?.name ??
        (id.startsWith('@') ? `the ${id.slice(1)}` : `the ${id}`))
      : null;
  const id = beat.do;
  if (!id || !beat.who) return beat.say;
  // Picked at a run: said so, "runs in", "runs off".
  const running =
    beat.pace === 'run' && doingOf(id)?.kind === 'travel' ? RUNS[id] : null;
  const verb =
    running ??
    SAID[id] ??
    (/(?:s|sh|ch|x)$/u.test(id) ? `${id}es` : `${id.replace(/-/g, ' ')}s`);
  const thing = beat.thing ?? beat.prop;
  const aim = beat.target ?? beat.to;
  const parts = [nameOf(beat.who), verb];
  const handles = doingOf(id)?.kind === 'handle';
  if (handles && thing && id !== 'open' && id !== 'close')
    parts.push(`the ${thing}`);
  if (aim && (!handles || id === 'open' || id === 'close'))
    parts.push(nameOf(aim) ?? aim);
  else if (aim && (id === 'give' || id === 'throw' || id === 'kick'))
    parts.push(`to ${nameOf(aim)}`);
  if (beat.via) parts.push(`by the ${beat.via}`);
  return `${parts.join(' ')}.`;
}

/**
 * A sheet's beats as the maker left them on the card: each action or
 * thing handled whose move, aim, thing or pace was picked anew, its words
 * left as they were, says what was picked now, so the words, which win,
 * win for the pick. What the beat kept from its words before (the thing,
 * the one aimed at) gives way to what was picked.
 */
export function pickedBeats(
  was: readonly SheetBeat[],
  now: readonly SheetBeat[],
  bible: StudioBible,
): SheetBeat[] {
  return now.map((beat, k) => {
    const old = was[k];
    if (
      (beat.kind !== 'action' && beat.kind !== 'business') ||
      old?.say !== beat.say
    )
      return beat;
    const newTo = old.to !== beat.to;
    const newProp = old.prop !== beat.prop;
    if (old.do === beat.do && old.pace === beat.pace && !newTo && !newProp)
      return beat;
    const picked: SheetBeat = {
      ...beat,
      ...(newProp ? { thing: beat.prop ?? undefined } : {}),
      ...(newTo ? { target: beat.to ?? undefined } : {}),
    };
    return { ...picked, say: wordsFor(picked, bible), target: undefined };
  });
}

/** The bible with the features a scene's words named added to its set, for good. */
export function withFeatures(
  bible: StudioBible,
  setId: string,
  features: readonly StudioFeature[],
): StudioBible {
  if (!features.length) return bible;
  return {
    ...bible,
    sets: bible.sets.map((s) => {
      if (s.id !== setId) return s;
      const own = s.features ?? [];
      const more = features.filter((f) => !own.some((o) => o.id === f.id));
      return more.length ? { ...s, features: [...own, ...more] } : s;
    }),
  };
}

/**
 * A bible written again with every feature its sets had kept: a feature,
 * once a set's, is its for good, whatever the writer left out.
 */
export function keptFeatures(
  bible: StudioBible,
  before: StudioBible | null,
): StudioBible {
  if (!before) return bible;
  return before.sets.reduce(
    (out, was) =>
      was.features?.length ? withFeatures(out, was.id, was.features) : out,
    bible,
  );
}

/** Who is on the stage as each beat plays, by id. */
export function presenceByBeat(sheet: StorySheet): Set<string>[] {
  const here = new Set(sheet.onStage.map((p) => p.who));
  return sheet.beats.map((beat) => {
    if (beat.kind === 'action' && beat.who) {
      if (beat.do === 'enter') here.add(beat.who);
      if (beat.do === 'leave' || beat.do === 'squeeze') {
        const now = new Set(here);
        here.delete(beat.who);
        return now;
      }
    }
    return new Set(here);
  });
}

/**
 * What is wrong with a story's sheet, once mended. `planned` is the
 * outline's seconds for it; `before` how the scene before left the stage.
 */
export function checkSheet(
  sheet: StorySheet,
  bible: StudioBible,
  planned: number | null = null,
  before: EndState | null = null,
): SheetProblem[] {
  const problems: SheetProblem[] = [];
  const error = (
    rule: SheetProblem['rule'],
    message: string,
    beat: number | null = null,
  ) => problems.push({ rule, message, beat, level: 'error' });
  const warn = (
    rule: SheetProblem['rule'],
    message: string,
    beat: number | null = null,
  ) => problems.push({ rule, message, beat, level: 'warning' });
  const byId = new Map(bible.characters.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const known = (id: string | null): id is string =>
    Boolean(id && byId.has(id));

  if (!bible.sets.some((s) => s.id === sheet.set))
    error(
      'set',
      `The scene is set in "${sheet.set || 'nowhere'}", which is none of the show's places (${bible.sets.map((s) => s.id).join(', ') || 'none yet'}).`,
    );
  for (const place of sheet.onStage)
    if (!known(place.who))
      error(
        'cast',
        `"${String(place.who)}" is on the stage as it opens but is not one of the show's characters.`,
      );
  if (sheet.onStage.length > MOST_ON_STAGE)
    error(
      'crowded',
      `${sheet.onStage.length} people stand on the stage at once; ${MOST_ON_STAGE} at most, or they stand on each other.`,
    );
  const spots = sheet.onStage.map((p) => p.spot);
  if (new Set(spots).size < spots.length)
    error('crowded', 'Two people stand on the same spot as the scene opens.');

  const here = new Map<string, Spot>(sheet.onStage.map((p) => [p.who, p.spot]));
  const holders = new Map<StageProp, string | null>(
    sheet.props.map((p) => [p.prop, null]),
  );
  // Each thing in one place: in one hand as it opens, or on the ground.
  for (const place of sheet.onStage) {
    if (!isStageProp(place.holding)) continue;
    const had = holders.get(place.holding);
    if (had !== undefined)
      error(
        'continuity',
        `${nameOf(place.who)} holds the ${place.holding} as the scene opens, but ${had ? `${nameOf(had)} holds it too` : 'it is on the ground too'}.`,
      );
    holders.set(place.holding, place.who);
  }
  const eaten = new Set<StageProp>();
  let spoken = 0;
  sheet.beats.forEach((beat, at) => {
    const n = at + 1;
    if (beat.kind === 'line' || beat.kind === 'narration') {
      if (!beat.say.trim()) error('empty', `Beat ${n} says nothing.`, at);
      else spoken += 1;
      if (words(beat.say) > LINE_WORDS)
        error(
          beat.kind === 'line' ? 'speaker' : 'narrator',
          `Beat ${n} runs to ${words(beat.say)} words; split it, ${LINE_WORDS} words at most in one.`,
          at,
        );
    }
    if (beat.kind === 'line') {
      if (!known(beat.who))
        error(
          'speaker',
          `Beat ${n} is a line with ${beat.who ? `"${String(beat.who)}", who is none of the show's characters,` : 'no one'} to say it: each line is said by exactly one of the cast.`,
          at,
        );
      else if (!here.has(beat.who) && !(beat.from && FROM_AWAY.has(beat.from)))
        error(
          'presence',
          `${nameOf(beat.who)} says beat ${n} but is not on the stage: bring them on first, or say where the voice comes from (off, a phone, a letter).`,
          at,
        );
    }
    if (beat.kind === 'narration') {
      // Someone's own words in the narrator's mouth: theirs to say.
      const quoted = beat.say.match(/["“]([^"”]{12,})["”]/u);
      if (quoted)
        error(
          'narrator',
          `The narrator says someone's words in beat ${n} ("${quoted[1].slice(0, 40)}…"): make it a line said by whoever says it.`,
          at,
        );
    }
    if (
      beat.kind === 'action' ||
      beat.kind === 'business' ||
      beat.kind === 'reaction'
    ) {
      if (!known(beat.who))
        error(
          'cast',
          `Beat ${n} has ${beat.who ? `"${String(beat.who)}", who is none of the show's characters,` : 'no one'} doing it.`,
          at,
        );
      else if (
        !(beat.kind === 'action' && beat.do === 'enter') &&
        !here.has(beat.who)
      )
        error(
          'presence',
          `${nameOf(beat.who)} acts in beat ${n} but is not on the stage.`,
          at,
        );
      if (beat.kind !== 'reaction' && !beat.do)
        error(
          'doing',
          `Beat ${n} asks for something the stage cannot show; use one of the doings listed.`,
          at,
        );
      if (beat.kind === 'reaction' && !beat.feeling && !beat.sign)
        error('doing', `Beat ${n} is a reaction with no face or sign.`, at);
    }
    if (beat.kind === 'action' && beat.who) {
      const aim = beat.target ?? beat.to;
      if (beat.do === 'enter') {
        if (here.size >= MOST_ON_STAGE)
          error(
            'crowded',
            `${nameOf(beat.who)} comes on in beat ${n} to a stage that has ${MOST_ON_STAGE} people already.`,
            at,
          );
        if ([...here.values()].includes(beat.spot ?? 'centre'))
          error(
            'crowded',
            `${nameOf(beat.who)} comes on to a spot someone stands on.`,
            at,
          );
        here.set(beat.who, beat.spot ?? 'centre');
        // With what they bring, unless the stage has it already.
        for (const brings of comesWith(byId.get(beat.who), before))
          if (isStageProp(brings) && !holders.has(brings))
            holders.set(brings, beat.who);
      } else if (beat.do === 'leave' || beat.do === 'squeeze')
        here.delete(beat.who);
      else if (beat.spot && doingOf(beat.do)?.kind === 'travel')
        here.set(beat.who, beat.spot);
      if ((beat.do === 'hug' || beat.do === 'reach') && !(aim && here.has(aim)))
        error(
          'presence',
          `Beat ${n} has ${nameOf(beat.who)} ${beat.do === 'hug' ? 'hug' : 'reach for'} someone not on the stage.`,
          at,
        );
    }
    if (beat.kind === 'business' && beat.who && beat.prop) {
      const prop = beat.prop;
      if (!holders.has(prop))
        error(
          'prop',
          `The ${prop} is used in beat ${n} but is not on the stage.`,
          at,
        );
      if (eaten.has(prop))
        warn(
          'prop',
          `The ${prop} is used in beat ${n} after it was eaten up.`,
          at,
        );
      const holder = holders.get(prop) ?? null;
      if (
        (beat.do === 'take' || beat.do === 'catch' || beat.do === 'kick') &&
        holder &&
        holder !== beat.who
      )
        error(
          'prop',
          `${nameOf(beat.who)} ${beat.do === 'kick' ? 'kicks' : 'takes'} the ${prop} in beat ${n}, but ${nameOf(holder)} has it.`,
          at,
        );
      if (
        (beat.do === 'give' ||
          beat.do === 'raise' ||
          beat.do === 'break' ||
          beat.do === 'throw' ||
          beat.do === 'drop' ||
          beat.do === 'put') &&
        holder !== beat.who
      )
        error(
          'prop',
          `${nameOf(beat.who)} does not have the ${prop} in beat ${n}.`,
          at,
        );
      if (beat.do === 'break' && prop !== 'bread')
        error(
          'prop',
          `Only bread is broken on the stage; beat ${n} breaks the ${prop}.`,
          at,
        );
      if (beat.do === 'eat' && PROP_KIND[prop] !== 'food')
        error('prop', `The ${prop} is not something to eat (beat ${n}).`, at);
      if (beat.do === 'drink' && PROP_KIND[prop] !== 'drink')
        error(
          'prop',
          `The ${prop} is not something to drink from (beat ${n}).`,
          at,
        );
      if (beat.do === 'give') {
        if (!beat.to || !here.has(beat.to))
          error(
            'presence',
            `Beat ${n} gives the ${prop} to someone not on the stage.`,
            at,
          );
        else holders.set(prop, beat.to);
      }
      if (beat.do === 'take' || beat.do === 'catch')
        holders.set(prop, beat.who);
      if (beat.do === 'put' || beat.do === 'drop' || beat.do === 'kick')
        holders.set(prop, null);
      if (beat.do === 'throw')
        holders.set(prop, beat.to && here.has(beat.to) ? beat.to : null);
      if (beat.do === 'eat') eaten.add(prop);
    }
  });
  if (spoken < 2)
    error('empty', 'A scene needs at least two lines or narrations.');
  if (
    !sheet.beats.some((b) => b.kind === 'line') &&
    sheet.onStage.length + sheet.beats.filter((b) => b.do === 'enter').length >
      0
  )
    warn(
      'speaker',
      'No one says anything in this scene: only the narrator speaks.',
    );
  // A quiet that holds more than the music carries: sent back once, to be
  // broken with a line; the stage quickens it to fit meanwhile.
  for (const [after, run] of quietRuns(sheet)) {
    const { asked } = timeQuiet(run.map((at) => quietItem(sheet.beats[at])));
    if (asked > QUIET_MOST_S + 0.05)
      warn(
        'quiet',
        `Beats ${run[0] + 1} to ${run[run.length - 1] + 1} are ${Math.round(asked * 10) / 10} seconds of action with no one speaking${after < 0 ? ' before the first line' : ''}; ${QUIET_MOST_S} at most: break it with a line.`,
        run[0],
      );
  }
  const seconds = secondsOf(sheet);
  // Too long is sent back to the writer once, and shown; the maker may
  // still make it, knowing what it will run to.
  if (planned && seconds > planned * LONGEST)
    warn(
      'length',
      `The scene runs about ${seconds} seconds; the outline gives it ${planned}. Cut it down to about ${planned}.`,
    );
  else if (planned && seconds < planned * SHORTEST)
    warn(
      'length',
      `The scene runs about ${seconds} seconds of the ${planned} the outline gives it.`,
    );
  // Who the scene before left here, in the same place: a warning if the
  // scene opens with a different set of people and no cut in time.
  if (before && before.set === sheet.set) {
    const was = new Set(before.onStage.map((p) => p.who));
    const now = new Set(sheet.onStage.map((p) => p.who));
    const gone = [...was].filter((id) => !now.has(id));
    if (gone.length && sheet.transition === 'cut')
      warn(
        'continuity',
        `The scene before left ${gone.map(nameOf).join(' and ')} here; they are gone as this one opens.`,
      );
  }
  return problems;
}

/**
 * How a story's scene leaves the stage: who is where, who holds what (in
 * a hand, or an animal's mouth; someone gone keeps what they took), and
 * where each thing let go of lies. `bible` and `before` say what someone
 * coming on brought with them.
 */
export function endStateOf(
  sheet: StorySheet,
  bible: StudioBible | null = null,
  before: EndState | null = null,
): EndState {
  const here = new Map<string, Spot>(sheet.onStage.map((p) => [p.who, p.spot]));
  const holders = new Map<StageProp, string | null>(
    sheet.props.map((p) => [p.prop, null]),
  );
  /** Where each thing on the ground lies: before whom it was set out, where it fell. */
  const lies = new Map<StageProp, Spot | null>(
    sheet.props.map((p) => [
      p.prop,
      p.near
        ? (sheet.onStage.find((o) => o.who === p.near)?.spot ?? null)
        : null,
    ]),
  );
  /** Gear, drawn in a hand for good. */
  const gear = new Map<string, ThingId>();
  for (const p of sheet.onStage)
    if (isStageProp(p.holding)) holders.set(p.holding, p.who);
    else if (p.holding) gear.set(p.who, p.holding);
  const gone = new Set<StageProp>();
  const character = (id: string) => bible?.characters.find((c) => c.id === id);
  for (const beat of sheet.beats) {
    if (beat.kind === 'action' && beat.who) {
      if (beat.do === 'enter') {
        here.set(beat.who, beat.spot ?? 'centre');
        for (const brings of comesWith(character(beat.who), before))
          if (isStageProp(brings) && !holders.has(brings))
            holders.set(brings, beat.who);
      } else if (beat.spot && doingOf(beat.do)?.kind === 'travel')
        here.set(beat.who, beat.spot);
      if (beat.do === 'leave' || beat.do === 'squeeze') here.delete(beat.who);
    }
    if (beat.kind === 'business' && beat.who && beat.prop) {
      const prop = beat.prop;
      const aim = beat.target ?? beat.to;
      const at = (id: string | null | undefined): Spot | null =>
        id ? (here.get(id) ?? null) : null;
      if (beat.do === 'take' || beat.do === 'catch') {
        holders.set(prop, beat.who);
        // An animal carries one thing.
        if (character(beat.who)?.kind === 'animal')
          for (const [other, by] of holders)
            if (by === beat.who && other !== prop) {
              holders.set(other, null);
              lies.set(other, at(beat.who));
            }
      }
      if (beat.do === 'put' || beat.do === 'drop') {
        holders.set(prop, null);
        lies.set(prop, at(beat.who));
      }
      if (beat.do === 'give' && beat.to) holders.set(prop, beat.to);
      if (beat.do === 'throw' || beat.do === 'kick') {
        const caught =
          beat.do === 'throw' && beat.to && here.has(beat.to) ? beat.to : null;
        holders.set(prop, caught);
        if (!caught)
          lies.set(
            prop,
            at(aim) ??
              (aim === '@left' ? 'left' : aim === '@right' ? 'right' : null),
          );
      }
      if (beat.do === 'eat') gone.add(prop);
    }
  }
  const cast = new Set([
    ...sheet.onStage.map((p) => p.who),
    ...sheet.beats.flatMap((b) =>
      b.who && b.kind !== 'line' && b.kind !== 'narration' ? [b.who] : [],
    ),
    ...sheet.beats.flatMap((b) =>
      b.kind === 'line' && b.who && b.from !== 'off' ? [b.who] : [],
    ),
  ]);
  const onGround = (prop: StageProp) => {
    const spot = lies.get(prop);
    return spot ? { at: spot } : {};
  };
  return {
    set: sheet.set,
    onStage: [...here].map(([who, spot]) => ({ who, spot })),
    props: [...holders].map(([prop, holder]) => ({
      prop,
      holder,
      gone: gone.has(prop),
      ...(holder === null ? onGround(prop) : {}),
    })),
    held: [
      ...[...holders].flatMap(([thing, who]) =>
        who && !gone.has(thing) ? [{ who, thing }] : [],
      ),
      ...[...gear].map(([who, thing]) => ({ who, thing })),
      // Whoever this scene did not have still has what they last held.
      ...(before?.held ?? []).filter(
        (h) =>
          !cast.has(h.who) && !(isStageProp(h.thing) && holders.has(h.thing)),
      ),
    ],
    // Everyone seen so far: what they hold next is what they were left with.
    cast: [...new Set([...(before?.cast ?? []), ...cast])],
  };
}

/**
 * How the scenes before the one at `position` left things, each carrying
 * on from the one before it: who holds what, wherever they were last seen.
 * Each is taken as it is made, put right first, so what it leaves is what
 * was seen. A scene with no story (an explainer, or none written yet)
 * leaves things as it found them: a new place or time is the break.
 */
export function endBefore(
  scenes: readonly { position: number; sheet: SceneSheet | null }[],
  position: number,
  bible: StudioBible,
): EndState | null {
  let end: EndState | null = null;
  for (const { sheet } of [...scenes]
    .filter((scene) => scene.position < position)
    .sort((a, b) => a.position - b.position))
    if (sheet?.kind === 'story')
      end = endStateOf(repairSheet(sheet, bible, end), bible, end);
  return end;
}

/** How the scene before left things, said for the writer. */
export function describeEnd(end: EndState | null, bible: StudioBible): string {
  if (!end) return 'This is the first scene: nothing came before it.';
  const nameOf = (id: string) =>
    bible.characters.find((c) => c.id === id)?.name ?? id;
  const place = bible.sets.find((s) => s.id === end.set)?.name ?? end.set;
  const people = end.onStage.length
    ? end.onStage
        .map((p) => `${nameOf(p.who)} (${p.who}) at the ${p.spot}`)
        .join(', ')
    : 'no one';
  const lying = end.props.filter((p) => !p.gone && !p.holder);
  const held = end.held ?? [];
  const animal = (id: string) =>
    bible.characters.find((c) => c.id === id)?.kind === 'animal';
  return [
    `The scene before ended in ${place} (${end.set}) with ${people} on the stage.`,
    lying.length
      ? `Things left lying there: ${lying.map((p) => `the ${p.prop}${p.at ? ` on the ${p.at}` : ''}`).join(', ')}.`
      : '',
    held.length
      ? `Who holds what: ${held.map((h) => `${nameOf(h.who)} has the ${h.thing}${animal(h.who) ? ' in their mouth' : ''}`).join(', ')}; everyone else's hands are empty. Carry it on: onStage.holding says the same, unless this scene says otherwise.`
      : 'No one holds anything.',
    'Carry on from there: in the same place and time, the people there are still there unless they left; in a new place or time, start afresh.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** What is wrong with an outline: places and people the show does not have, a length that does not add up. */
export function checkOutline(
  outline: StudioOutline,
  bible: StudioBible,
  minutes: number,
  story: boolean,
  /** Whether every main character must have a part: in a first episode; later ones may rest some. */
  everyone = true,
): string[] {
  const problems: string[] = [];
  if (outline.scenes.length < 1) problems.push('The outline has no scenes.');
  // The film runs a little longer than its scenes: the joins between them.
  const said = outline.scenes.reduce((n, s) => n + s.seconds, 0);
  const joins = joinsSeconds(outline.scenes.length);
  const seconds = said + joins;
  const wanted = minutes * 60;
  if (seconds > wanted * 1.35 || seconds < wanted * 0.65)
    problems.push(
      `The scenes add up to ${said} seconds, and the joins between them about ${joins} more; the episode should run about ${wanted}. Change the scenes' seconds, or how many there are.`,
    );
  if (story) {
    outline.scenes.forEach((scene, k) => {
      if (!scene.set || !setId(scene.set, bible))
        problems.push(
          `Scene ${k + 1} is set in "${scene.set ?? 'nowhere'}", none of the show's places (${bible.sets.map((s) => s.id).join(', ')}).`,
        );
      const strangers = scene.cast.filter((id) => !characterId(id, bible));
      if (strangers.length)
        problems.push(
          `Scene ${k + 1} has ${strangers.join(', ')}, who are none of the show's characters (${bible.characters.map((c) => c.id).join(', ')}).`,
        );
      if (!scene.cast.length) problems.push(`Scene ${k + 1} has no one in it.`);
    });
    const used = new Set(
      outline.scenes.flatMap((s) =>
        s.cast.map((id) => characterId(id, bible)).filter(Boolean),
      ),
    );
    const unused = bible.characters.filter(
      (c) => c.role !== 'minor' && !used.has(c.id),
    );
    if (unused.length && everyone)
      problems.push(
        `${unused.map((c) => c.name).join(' and ')} ${unused.length > 1 ? 'are' : 'is'} in no scene: give them a part, or leave them out of the show.`,
      );
  } else
    outline.scenes.forEach((scene, k) => {
      const said = scene.teach ? words(scene.teach) : 0;
      // The narrator says about 2.4 words a second, and a little less than
      // what the scene teaches: more than that, and the scene runs long.
      const fits = Math.round(scene.seconds * WORDS_A_SECOND * 1.25);
      if (said < 25)
        problems.push(
          `Scene ${k + 1} says too little of what it teaches: write it out as a good book would, about ${fits} words.`,
        );
      else if (said > fits * 1.4)
        problems.push(
          `Scene ${k + 1} teaches ${said} words in ${scene.seconds} seconds, more than a narrator can say: give it more seconds, split it in two, or teach it in about ${fits} words.`,
        );
    });
  return problems;
}

/** The outline's ids made the bible's own, where the writer wrote a name for one. */
export function mendOutline(
  outline: StudioOutline,
  bible: StudioBible,
): StudioOutline {
  return {
    ...outline,
    scenes: outline.scenes.map((scene) => ({
      ...scene,
      set: setId(scene.set, bible) ?? scene.set,
      cast: [...new Set(scene.cast.map((id) => characterId(id, bible) ?? id))],
    })),
  };
}

/** What is wrong with a bible: two looking alike, a person with nothing to set them apart. */
export function checkBible(bible: StudioBible, story: boolean): string[] {
  if (!story) return [];
  const problems: string[] = [];
  if (!bible.characters.length) problems.push('The show has no characters.');
  if (!bible.sets.length) problems.push('The show has no places.');
  const people = bible.characters.filter(
    (
      c,
    ): c is StudioCharacter & {
      figure: NonNullable<StudioCharacter['figure']>;
    } => c.kind === 'person' && Boolean(c.figure),
  );
  for (let i = 0; i < people.length; i += 1)
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i].figure;
      const b = people[j].figure;
      const same = [
        a.age === b.age,
        a.hair === b.hair,
        a.hairColour === b.hairColour,
        a.top === b.top,
        a.topColour === b.topColour,
        Math.abs(a.skin - b.skin) <= 1,
        a.headwear === b.headwear,
      ].filter(Boolean).length;
      if (same >= 6)
        problems.push(
          `${people[i].name} and ${people[j].name} look almost the same: change one's hair, clothes or colours so a viewer tells them apart.`,
        );
    }
  const voices = new Map<string, string[]>();
  for (const c of bible.characters) {
    const key = `${c.voice}#${c.voicePick}`;
    voices.set(key, [...(voices.get(key) ?? []), c.name]);
  }
  for (const [, names] of voices)
    if (names.length > 1)
      problems.push(`${names.join(' and ')} speak in the same voice.`);
  return problems;
}

/** Each character a voice of their own: a second of the same kind takes the next of that kind's voices. */
export function distinctVoices(bible: StudioBible): StudioBible {
  const used = new Map<string, Set<number>>();
  return {
    ...bible,
    characters: bible.characters.map((c) => {
      const taken = used.get(c.voice) ?? new Set<number>();
      let pick = c.voicePick;
      for (let n = 0; n < 3 && taken.has(pick); n += 1) pick = (pick + 1) % 3;
      taken.add(pick);
      used.set(c.voice, taken);
      return pick === c.voicePick ? c : { ...c, voicePick: pick };
    }),
  };
}

const SMALL_NUMBERS =
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(
    ' ',
  );
const TENS = ' _ twenty thirty forty fifty sixty seventy eighty ninety'.split(
  ' ',
);
const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
};

/**
 * Numbers said in words, as digits: "three to seven days" gives 3 and 7,
 * "two thousand and five" 2005. A lesson says its numbers aloud in words;
 * a picture writes them in digits.
 */
export function spelledNumbers(text: string): number[] {
  const out: number[] = [];
  let total = 0;
  let current = 0;
  let open = false;
  const close = () => {
    if (open) out.push(total + current);
    [total, current, open] = [0, 0, false];
  };
  // A comma or a full stop ends a number; "forty-two" is one.
  for (const [word] of text.toLowerCase().matchAll(/[a-z]+|[^\sa-z-]/g)) {
    const small = SMALL_NUMBERS.indexOf(word);
    const tens = TENS.indexOf(word);
    // "five six" is two numbers; "forty two" one.
    const units = current % 100;
    if (
      open &&
      (small >= 0 || tens >= 2) &&
      units &&
      !(units % 10 === 0 && units >= 20 && small > 0 && small < 10)
    )
      close();
    if (small >= 0) [current, open] = [current + small, true];
    else if (tens >= 2) [current, open] = [current + tens * 10, true];
    else if (word in SCALES && open) {
      const scale = SCALES[word];
      if (scale === 100) current *= 100;
      else [total, current] = [total + current * scale, 0];
    } else if (!(word === 'and' && open)) close();
  }
  close();
  return out;
}

/**
 * What an explainer scene's pictures are held to. The Studio has no page:
 * the scene is its own, so a date or a number it shows must be one it says,
 * in digits or in words, or one the maker's source or the outline's lesson
 * for it gives.
 */
function studioMaterial(
  sheet: ExplainerSheet,
  teach: string | null,
  source: string | null,
): string {
  const said = [source, teach, sheet.draft.beats.map((b) => b.say).join('\n')]
    .filter(Boolean)
    .join('\n');
  return `${said}\n${spelledNumbers(said).join(' ')}`;
}

/** A lesson writer's word for its page, as the Studio has it: the scene. */
const asScene = (message: string) =>
  message
    .replace(/the page does not give/g, 'the scene never says')
    .replace(/the page's own/g, "the scene's own")
    .replace(/\bthe page\b/g, 'the scene');

/**
 * An explainer's sheet checked: its storyboard mended as a lesson's page
 * is, what the lesson writer would be sent back for, and its length.
 */
export function checkExplainer(
  sheet: ExplainerSheet,
  options: {
    teach: string | null;
    source?: string | null;
    stage: LearningStage | null;
    maths: boolean;
    planned: number | null;
  },
): { script: SceneScript; problems: SheetProblem[] } {
  const mended = mendScript(sheet.draft, {
    material: studioMaterial(sheet, options.teach, options.source ?? null),
    formats: options.maths ? ['explainer', 'maths'] : ['explainer'],
    stage: options.stage,
  });
  // What the storyboard gets wrong keeps the scene from being made; a
  // picture that sits still a while is sent back to the writer once, and
  // shown, but the maker may make it as it is.
  const problems: SheetProblem[] = [
    ...mended.problems.map((message) => ({
      rule: 'storyboard' as const,
      message: asScene(message),
      beat: null,
      level: 'error' as const,
    })),
    ...[
      ...quietStretches(mended.script, STILL_WORDS),
      ...fewStageChanges(mended.script),
    ].map((message) => ({
      rule: 'storyboard' as const,
      message,
      beat: null,
      level: 'warning' as const,
    })),
  ];
  if (!mended.script.beats.length)
    problems.push({
      rule: 'empty',
      message: 'The scene says nothing.',
      beat: null,
      level: 'error',
    });
  if (!mended.script.steps.some((step) => step.stage))
    problems.push({
      rule: 'storyboard',
      message: 'Nothing is ever shown on the stage.',
      beat: null,
      level: 'error',
    });
  const seconds = secondsOf(sheet);
  if (options.planned && seconds > options.planned * LONGEST)
    problems.push({
      rule: 'length',
      message: `The scene runs about ${seconds} seconds; the outline gives it ${options.planned}. Say it in fewer words.`,
      beat: null,
      level: 'warning',
    });
  return { script: mended.script, problems };
}

/**
 * A story scene made sound whatever its writer left wrong, so the film is
 * always made and its maker never asked to put the writer's slips right:
 * a place the show has not got becomes its first place, the opening keeps
 * the show's own people on spots of their own, a line by one of the cast
 * who cannot come on is said from off the stage, and anything else one of
 * the cast does that the stage cannot show as written is played as the
 * closest thing it can, a nod. Only what no one in the cast does (a line
 * by a stranger) is left out. Everything else is kept as written.
 */
export function repairSheet(
  input: StorySheet,
  bible: StudioBible,
  before: EndState | null = null,
): StorySheet {
  let sheet = mendSheet(input, bible, before).sheet;
  const cast = new Set(bible.characters.map((c) => c.id));
  /** Beats already played as a nod once: still wrong, they cannot be seen at all. */
  const nodded = new Set<string>();
  for (let round = 0; round < 6; round += 1) {
    const errors = errorsIn(checkSheet(sheet, bible, null, before));
    if (!errors.length) break;
    const next = JSON.parse(JSON.stringify(sheet)) as StorySheet;
    if (!bible.sets.some((s) => s.id === next.set) && bible.sets[0])
      next.set = bible.sets[0].id;
    const spots = new Set<Spot>();
    next.onStage = next.onStage
      .filter((p) => {
        if (!cast.has(p.who) || spots.has(p.spot)) return false;
        spots.add(p.spot);
        return true;
      })
      .slice(0, MOST_ON_STAGE);
    const bad = new Set(
      errors.flatMap((e) => (e.beat === null ? [] : [e.beat])),
    );
    if (bad.size) {
      const kept: number[] = [];
      const beats: SheetBeat[] = [];
      next.beats.forEach((beat, k) => {
        if (!bad.has(k)) {
          kept.push(k);
          beats.push(beat);
          return;
        }
        const theirs = beat.who !== null && cast.has(beat.who);
        const key = `${beat.who}|${beat.say}`;
        if (theirs && beat.kind === 'line' && beat.from !== 'off') {
          kept.push(k);
          beats.push({ ...beat, from: 'off' });
        } else if (theirs && beat.kind !== 'line' && !nodded.has(key)) {
          nodded.add(key);
          kept.push(k);
          beats.push({
            ...blankBeat('action'),
            who: beat.who,
            say: beat.say,
            do: 'nod',
          });
        }
      });
      next.beats = beats;
      next.camera = next.camera.flatMap((shot) => {
        const at = kept.indexOf(shot.beat);
        return at < 0 ? [] : [{ ...shot, beat: at }];
      });
    }
    const mended = mendSheet(next, bible, before).sheet;
    if (JSON.stringify(mended) === JSON.stringify(sheet)) break;
    sheet = mended;
  }
  return sheet;
}

/**
 * An explainer scene made sound whatever its writer left wrong: a chart,
 * a timeline, a graph or a quotation the check turns down is shown as its
 * name in type instead, so nothing made up is drawn, and the film is made.
 */
export function repairExplainer(
  sheet: ExplainerSheet,
  options: Parameters<typeof checkExplainer>[1],
): ExplainerSheet {
  const refused = new Set(
    errorsIn(checkExplainer(sheet, options).problems).flatMap((p) => {
      const named = /^The (?:chart|timeline|graph|quotation) "([^"]+)"/.exec(
        p.message,
      );
      return named ? [named[1]] : [];
    }),
  );
  if (!refused.size) return sheet;
  return {
    ...sheet,
    draft: {
      ...sheet.draft,
      cast: sheet.draft.cast.map((thing) =>
        refused.has(thing.id)
          ? {
              ...thing,
              kind: 'words',
              style: 'keyword',
              plot: null,
              chart: null,
              timeline: null,
              quote: null,
              phrases: null,
              lines: null,
            }
          : thing,
      ),
    },
  };
}

/** Only what keeps a scene from being made. */
export const errorsIn = (problems: readonly SheetProblem[]) =>
  problems.filter((p) => p.level === 'error');

/**
 * What a written scene goes back to its writer for, once: whatever keeps
 * it from being made, and a length or a still picture that does not.
 */
export const sentBackFor = (problems: readonly SheetProblem[]) =>
  problems.filter(
    (p) =>
      p.level === 'error' ||
      p.rule === 'length' ||
      p.rule === 'quiet' ||
      p.rule === 'storyboard',
  );
