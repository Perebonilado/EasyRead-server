/**
 * How each of a Studio story's people is as its scene goes on: standing,
 * sitting or lying down, on a seat of the set or in its bed; and what they
 * wear. A person is always the kit's one standing figure, rigged: sitting
 * up in bed is that figure at the bed, sat down, under the bed's cover;
 * getting out of bed is getting up and stepping out beside it, and the bed
 * stays where it is. Furniture is the set's, never part of anyone.
 *
 * Both are read from the sheet alone, before the stage plays it: where
 * someone opens, each doing that sits them down, lays them down or gets
 * them up, and each thing they put on or take off.
 */
import { NEEDS_FEET, doingOf } from '../scene-doings';
import { USES } from '../scene-interact';
import type { FigureSpec } from '../scene-figure';
import {
  colourBefore,
  putOn,
  sameOutfit,
  takeOff,
  undressedFor,
  wearableOf,
  type Wearable,
} from '../scene-wear';
import type { EndState } from './studio-check';
import type {
  SheetBeat,
  SheetPlace,
  StorySheet,
  StudioBible,
  StudioFeature,
} from './studio';

/** How someone is down: sitting or lying, on a feature (or in a bed, under its cover), or on the ground. */
export interface Posture {
  how: 'sit' | 'lie';
  /** The feature they sit or lie on or are in, by its id; null, the ground where they are. */
  on: string | null;
  /** In it, under its cover: a bed. */
  in: boolean;
  /** Down on the ground from a hard fall: they get up off it as from one (the get-up move). */
  fell?: true;
}

/** The kinds of feature sat and lain on: a bed is got into, the rest sat on. */
const BEDS = new Set(['bed']);
const SEATS = new Set([
  'bench',
  'chair',
  'sofa',
  'steps',
  'swing',
  'bed',
  // Sat at, on its own chair (studio-interactions-plan I2).
  'table',
]);
/** Lain along: a bed, a sofa, a bench. */
const LAIN_ON = new Set(['bed', 'sofa', 'bench']);

/** The station someone down on or in a feature has: "in:bed", "on:bench", "in:bed:lie"; null on the ground. */
export function stationOf(posture: Posture): string | null {
  if (!posture.on) return null;
  return `${posture.in ? 'in' : 'on'}:${posture.on}${posture.how === 'lie' ? ':lie' : ''}`;
}

/** How long getting up takes, and stepping out beside what they were on, in seconds. */
export const RISE_S = (doingOf('stand-up')?.ms ?? 1200) / 1000;
export const STEP_OFF_S = 0.9;
/** Stepping down beside a bed or a seat is a walk, and the player's shortest walk takes this long. */
export const STEP_DOWN_S = 1.1;
/** How long going over to a seat or a bed to sit or lie on it takes, about. */
export const GO_TO_SEAT_S = 1.2;

/** The set's feature a word or an id names, if one is sat or lain on: its own id, else the only one of its kind. */
function restingOn(
  features: readonly Pick<StudioFeature, 'id' | 'kind'>[],
  asked: string | null | undefined,
  kinds: ReadonlySet<string>,
): string | null {
  if (!asked) return null;
  const own = features.find((f) => f.id === asked);
  if (own) return kinds.has(own.kind) || own.kind === 'drawn' ? own.id : null;
  const same = features.filter((f) => f.kind === asked && kinds.has(f.kind));
  return same.length === 1 ? same[0].id : null;
}

/** The set's one bed, if it has exactly one. */
const bedOf = (features: readonly Pick<StudioFeature, 'id' | 'kind'>[]) => {
  const beds = features.filter((f) => BEDS.has(f.kind));
  return beds.length === 1 ? beds[0].id : null;
};

/** How someone opens a scene, from their place on the sheet: null standing. */
export function openingPosture(
  place: Pick<SheetPlace, 'pose' | 'on'>,
  features: readonly Pick<StudioFeature, 'id' | 'kind'>[],
): Posture | null {
  const kinds = new Map(features.map((f) => [f.id, f.kind]));
  if (place.pose === 'in bed') {
    const bed =
      (place.on && BEDS.has(kinds.get(place.on) ?? '') ? place.on : null) ??
      bedOf(features);
    return { how: 'sit', on: bed, in: bed !== null };
  }
  if (place.pose === 'lying') {
    const on = restingOn(features, place.on, LAIN_ON);
    return {
      how: 'lie',
      on,
      in: on !== null && BEDS.has(kinds.get(on) ?? ''),
    };
  }
  if (place.pose === 'sitting')
    return { how: 'sit', on: restingOn(features, place.on, SEATS), in: false };
  return null;
}

/** What the sheet has each one do, as it bears on how they are: from the beat's own doing. */
export interface PostureChanges {
  /** How each one down opens the scene. */
  opening: Map<string, Posture>;
  /** Each beat whose doer is down as it comes and must get up first: getting up to go somewhere, or to jump. */
  rises: Map<number, Posture>;
  /** Each beat that gets someone up, and from what: "Tobi gets out of bed". */
  standsFrom: Map<number, Posture>;
  /** Each beat that sits or lays someone down, and where: on the bench, into bed. */
  downTo: Map<number, Posture>;
}

/**
 * How everyone is as the sheet goes on: who opens down, who gets up at
 * which beat, who must get up first to do what a beat has them do (go
 * anywhere, or a move that needs their feet), and who sits or lies down
 * where. `features` are the set's.
 */
export function posturesOf(
  sheet: Pick<StorySheet, 'onStage' | 'beats'>,
  features: readonly Pick<StudioFeature, 'id' | 'kind'>[],
): PostureChanges {
  const kinds = new Map(features.map((f) => [f.id, f.kind]));
  const opening = new Map<string, Posture>();
  for (const place of sheet.onStage) {
    const posture = openingPosture(place, features);
    if (posture) opening.set(place.who, posture);
  }
  const down = new Map(opening);
  const rises = new Map<number, Posture>();
  const standsFrom = new Map<number, Posture>();
  const downTo = new Map<number, Posture>();
  sheet.beats.forEach((beat, at) => {
    if ((beat.kind !== 'action' && beat.kind !== 'business') || !beat.who)
      return;
    const who = beat.who;
    const now = down.get(who) ?? null;
    const doing = doingOf(beat.do);
    if (!doing) return;
    if (doing.id === 'stand-up' || doing.id === 'get-up') {
      if (now) standsFrom.set(at, now);
      down.delete(who);
      return;
    }
    // Down on the ground after a hard fall, until they get up.
    if (doing.id === 'fall-hard') {
      down.set(who, { how: 'lie', on: null, in: false, fell: true });
      return;
    }
    if (doing.id === 'sit' || doing.id === 'lie-down') {
      const how = doing.id === 'sit' ? 'sit' : 'lie';
      const asked = beat.target ?? null;
      const target = restingOn(
        features,
        asked,
        how === 'sit' ? SEATS : LAIN_ON,
      );
      const bed = target && BEDS.has(kinds.get(target) ?? '');
      let next: Posture;
      if (target)
        next = {
          how,
          on: target,
          // Into a bed lying down, or sitting up where they lay in it.
          in: Boolean(bed) && (how === 'lie' || (now?.on === target && now.in)),
        };
      else if (now?.on) next = { ...now, how };
      else next = { how, on: null, in: false };
      // A new station: on or in somewhere new, or lying where they sat.
      if (
        next.on !== (now?.on ?? null) ||
        next.in !== (now?.in ?? false) ||
        (next.on !== null && next.how !== now?.how)
      )
        downTo.set(at, next);
      down.set(who, next);
      return;
    }
    if (!now) return;
    // Going anywhere, or a move that needs their feet: up first.
    const move = 'move' in doing.plays ? doing.plays.move : null;
    // Or something done standing at a thing of the set: a knock at the
    // door, a lean on the counter, a switch.
    if (
      doing.kind === 'travel' ||
      USES[doing.id] !== undefined ||
      (move && move !== 'sit' && move !== 'lie' && NEEDS_FEET.has(move))
    ) {
      rises.set(at, now);
      down.delete(who);
    }
  });
  return { opening, rises, standsFrom, downTo };
}

/** How long a beat takes besides its own doing for how its doer is: getting up first, stepping out of bed, going over to a seat. */
export function postureSeconds(changes: PostureChanges, at: number): number {
  const rise = changes.rises.get(at);
  if (rise) return RISE_S + (rise.on ? STEP_OFF_S * 0.5 : 0);
  const stands = changes.standsFrom.get(at);
  if (stands?.on) return STEP_OFF_S;
  if (changes.downTo.get(at)?.on) return GO_TO_SEAT_S;
  return 0;
}

// ── What they wear ────────────────────────────────────────────────────────

/** What one person wears through a scene: as it opens, and after each beat that changes it. */
export interface Outfits {
  /** Their usual look, from the show's cast. */
  usual: FigureSpec;
  opening: FigureSpec;
  changes: { beat: number; spec: FigureSpec }[];
}

/**
 * A thing worn, by its id: the show's own by its name and its look; one of
 * the lists' by its word, in the colour the words that put it on give it
 * ("puts on her red coat").
 */
function wornThing(
  bible: Pick<StudioBible, 'things'>,
  thing: string | null | undefined,
  said = '',
): { wear: Wearable; look: string | null } | null {
  if (!thing) return null;
  const own = bible.things?.find((t) => t.id === thing);
  const wear = wearableOf(own?.name ?? thing) ?? wearableOf(thing);
  return wear
    ? {
        wear,
        look: own?.look ?? colourBefore(said, own?.name ?? thing) ?? null,
      }
    : null;
}

/** Whether a scene is at bedtime: someone in bed or lying down as it opens, at night or at dawn, or in a bedroom. */
function bedtimeFor(
  sheet: Pick<StorySheet, 'time' | 'set'>,
  bible: Pick<StudioBible, 'sets'>,
  place: Pick<SheetPlace, 'pose'> | undefined,
): boolean {
  if (place?.pose === 'in bed' || place?.pose === 'lying') return true;
  if (sheet.time === 'night' || sheet.time === 'dawn') return true;
  const set = bible.sets.find((s) => s.id === sheet.set);
  return /\bbed ?rooms?\b/iu.test(`${set?.name ?? ''} ${set?.look ?? ''}`);
}

/**
 * What each person the kit draws wears through a scene: as it opens, what
 * the scene before left them in, else their usual look, and anything the
 * sheet says they wear besides; and after each beat that puts a thing on
 * or takes one off, what that leaves them in. Someone who gets dressed
 * into what they usually wear opens in what they wore before it: pyjamas
 * at bedtime, else a plain t-shirt. Someone in bed as it opens who gets
 * dressed at all, into anything, is in their pyjamas until they do.
 */
export function outfitsOf(
  sheet: Pick<StorySheet, 'onStage' | 'beats' | 'time' | 'set'>,
  bible: Pick<StudioBible, 'characters' | 'things' | 'sets'>,
  before: Pick<EndState, 'wears'> | null = null,
): Map<string, Outfits> {
  const out = new Map<string, Outfits>();
  for (const c of bible.characters) {
    if (c.kind !== 'person' || !c.figure) continue;
    const usual = c.figure;
    const place = sheet.onStage.find((p) => p.who === c.id);
    const carried = before?.wears?.find((w) => w.who === c.id)?.figure;
    let opening: FigureSpec = carried ?? usual;
    for (const thing of place?.wears ?? []) {
      const worn = wornThing(bible, thing);
      if (worn) opening = putOn(opening, usual, worn.wear, worn.look);
    }
    const mine = sheet.beats
      .map((beat, at) => ({ beat, at }))
      .filter(
        ({ beat }) =>
          beat.kind === 'business' &&
          beat.who === c.id &&
          (beat.do === 'dress' || beat.do === 'undress'),
      );
    if (!mine.length) {
      if (!sameOutfit(opening, usual) || carried)
        out.set(c.id, { usual, opening, changes: [] });
      continue;
    }
    // Getting dressed into what they usually wear, already wearing it:
    // before it, what they wore to bed, or under it. Getting dressed out
    // of bed, into anything: before it, their pyjamas. Putting shoes on:
    // before it, their feet bare, whatever else they wear.
    const wornBy = (beat: SheetBeat) =>
      wornThing(bible, beat.thing ?? beat.prop, beat.say) ?? {
        wear: { slot: 'outfit' as const, kit: null },
        look: null,
      };
    const first = mine[0].beat;
    const firstWear = wornBy(first);
    const features = bible.sets.find((s) => s.id === sheet.set)?.features ?? [];
    const abed =
      place?.pose === 'in bed' ||
      Boolean(place && openingPosture(place, features)?.in);
    const onFeet = ({ beat }: { beat: SheetBeat }) =>
      wornBy(beat).wear.slot === 'feet';
    if (
      !carried &&
      abed &&
      mine.some(({ beat }) => beat.do === 'dress') &&
      !(place?.wears ?? []).length
    )
      opening = undressedFor(usual, true);
    else if (
      first.do === 'dress' &&
      firstWear.wear.slot !== 'feet' &&
      sameOutfit(opening, usual) &&
      sameOutfit(putOn(opening, usual, firstWear.wear, firstWear.look), usual)
    )
      opening = undressedFor(usual, bedtimeFor(sheet, bible, place));
    const shoes = mine.find(onFeet);
    if (shoes?.beat.do === 'dress')
      opening = takeOff(opening, wornBy(shoes.beat).wear);
    const changes: Outfits['changes'] = [];
    let now = opening;
    for (const [k, { beat, at }] of mine.entries()) {
      const worn = wornBy(beat);
      let next =
        beat.do === 'dress'
          ? putOn(now, usual, worn.wear, worn.look)
          : takeOff(now, worn.wear, usual);
      // Dressed into their clothes with their shoes still to come: still
      // in bare feet until they put them on.
      if (
        worn.wear.slot !== 'feet' &&
        now.extras.includes('bare feet') &&
        mine.slice(k + 1).some((one) => onFeet(one) && one.beat.do === 'dress')
      )
        next = takeOff(next, { slot: 'feet', kit: null });
      if (sameOutfit(next, now)) continue;
      now = next;
      changes.push({ beat: at, spec: now });
    }
    out.set(c.id, { usual, opening, changes });
  }
  return out;
}

/** What someone wears at the end of a scene, from their outfits through it. */
export const outfitAtEnd = (outfits: Outfits): FigureSpec =>
  outfits.changes.length
    ? outfits.changes[outfits.changes.length - 1].spec
    : outfits.opening;

/** Whether a beat puts a thing on, or takes one off. */
export const changesClothes = (beat: Pick<SheetBeat, 'kind' | 'do'>) =>
  beat.kind === 'business' && (beat.do === 'dress' || beat.do === 'undress');
