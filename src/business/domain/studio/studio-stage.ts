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
import type { SceneDto } from '../../../contracts';
import { faceOfLine } from '../scene-feeling';
import { faceOfAim, readLine } from '../scene-performance';
import { directionsIn, doingsIn, type Actor } from '../scene-directions';
import {
  THING_WORDS,
  aimedFeature,
  bobbingMove,
  doingOf,
  isAction,
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
import {
  DEPTH_BACK,
  DEPTH_FRONT,
  DEPTH_MIDDLE,
  STATION_SHARES,
} from '../scene-layout';
import { drawPiece, perchOf } from '../scene-set-pieces';
import {
  USES,
  interactLeastMs,
  interactionFor,
  INTERACT_STEPS,
} from '../scene-interact';
import { RUN_PACE, WALK_MIN_MS, WALK_STAGE_MS } from '../scene-film';
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
  type SceneStepInteraction,
  type SceneThing,
} from '../scene-script';
import {
  STORY_VERSION,
  type StoryBible,
  type StoryCharacter,
  type StoryPlace,
} from '../scene-story';
import {
  figureFrame,
  isGear,
  type FigureFace,
  type FigureSpec,
} from '../scene-figure';
import { SIZE_UNITS } from '../scene-ink';
import { sameOutfit } from '../scene-wear';
import {
  RISE_S,
  STEP_DOWN_S,
  outfitsOf,
  postureSeconds,
  posturesOf,
  stationOf,
  type Posture,
} from './studio-posture';
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
  isOwnRecipe,
  kindOn,
  kitFaceOf,
  namesOf,
  recipeOfFeeling,
  thingNamed,
} from './studio';

/**
 * The most a quiet between two lines holds, in seconds: pauses, looks,
 * nods and going about under the music. Longer, and the writer is asked
 * to break it with a line; the stage quickens what is there to fit.
 */
export const QUIET_MOST_S = 6;
/**
 * The most a quiet with an action in it holds (a throw, a jump, a fall, a
 * thing handled): held longer, up to this, rather than the action rushed,
 * its wind-up and settle lost. Longer, and the writer is asked to break it.
 */
export const ACTION_MOST_S = 10;
/**
 * The most a quiet that is a physical sequence holds: a climb, a
 * break-in, a chase, one goal carried through in moves (three actions or
 * more, two in three of what it holds), which a line would only
 * interrupt. For adults and teens; a children's film holds one up to
 * CHILD_SEQUENCE_MOST_S. Longer, and the writer is asked to break it.
 */
export const SEQUENCE_MOST_S = 20;
export const CHILD_SEQUENCE_MOST_S = 15;

/** Whether a quiet is a physical sequence: three actions or more, and two in three of what it holds. */
export function isSequence(items: readonly QuietItem[]): boolean {
  const acting = items.filter((item) => item.acts).length;
  const held = items.filter((item) => !item.pause).length;
  return acting >= 3 && acting * 3 >= held * 2;
}
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

/** Signs that end as whoever shows them wakes: once they speak aloud, move or get up. */
const WAKES = new Set(['sleeping']);
/** Signs of a moment, off again once seen: a bulb for an idea, a puzzled question mark. */
const MOMENT_SIGNS = new Set(['idea', 'confused']);
/** How long a moment's sign is seen, in seconds. */
const SIGN_SEEN_S = 2;

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
  /** An action (DoingPhases' moves, a thing handled): the quiet is held longer for it rather than quicken it (ACTION_MOST_S). */
  acts?: boolean;
  /** How long it runs on after its doer's own part, in seconds: a throw's flight and catch. */
  tailS?: number;
}

/**
 * A beat of the sheet that is not spoken, as the quiet's timing sees it.
 * `extraS` is what its doer does first for how they are: getting up
 * before they go, stepping out of bed, going over to a seat.
 */
export function quietItem(beat: SheetBeat, extraS = 0): QuietItem {
  const item = ownItem(beat);
  if (extraS <= 0 || item.pause) return item;
  return {
    ...item,
    s: item.s + extraS,
    leastS: item.leastS + extraS,
    keyAt: (extraS + item.keyAt * item.s) / (item.s + extraS),
  };
}

/** A beat of the sheet that is not spoken, as its own doing takes. */
function ownItem(beat: SheetBeat): QuietItem {
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
  // As long as it takes given its time: an action wound up and settled.
  const own = doing.idealMs / 1000;
  // A throw to someone runs on until it is caught: as long as it flies at
  // most, and the catch's own end.
  const caught = round(
    Math.max(
      0,
      beat.do === 'throw' && beat.to
        ? FLIES_MOST_S + CATCH_AFTER_S - (1 - doing.keyAt) * own
        : 0,
    ),
  );
  return {
    who: beat.who,
    handles: beat.kind === 'business',
    pause: false,
    s: round(own + caught),
    leastS: round(doing.leastMs / 1000 + caught),
    keyAt: (doing.keyAt * own) / (own + caught),
    ...(isAction(doing) ? { acts: true } : {}),
    ...(caught > 0 ? { tailS: caught } : {}),
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
/** How far across the stage a runner goes in a second, as a share of it (the stage's walk across, WALK_STAGE_MS, quickened RUN_PACE times). */
const RUN_SHARE_S = RUN_PACE / (WALK_STAGE_MS / 1000);
/** The longest a run out and back takes. */
const OUT_MOST_S = 3;
/** How far a leap with nowhere named carries someone, as a share of the stage: its clip's 1.2 heights of a grown-up. */
const LEAP_SHARE = 0.22;
/** Getting up off the ground after a hard fall takes at least this long: its clip's phases at their least. */
const GET_UP_LEAST_S = 0.96;
/** What is done touching someone: done beside them. */
const TOUCHES: ReadonlySet<DoingId> = new Set(['hug', 'lick', 'sniff']);
/** Farther apart than this across the stage, two are not beside each other. */
const ONE_SPOT = 0.2;
/** How long coming in through a door takes, the door swung open from inside and a step out of the dark, about (compose times it). */
const COME_THROUGH_S = 2.2;
/**
 * A new place is seen whole before anyone speaks (studio-screenwriting
 * K1): this long a quiet on the whole stage, and its sounds, before a
 * first line, when the scene before was somewhere else (or there was none).
 */
export const ESTABLISH_S = 1.8;
/** The chair pulled out and tucked in, sitting at a table; pushed back and tucked in, getting up from it. */
const TABLE_SIT_EXTRA_S = 0.95;
const TABLE_RISE_EXTRA_S = 0.6;

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
  const behind = /^(?:behind|under|up|on|in):([^:]+)/.exec(station);
  const hiding = behind ? features.get(behind[1]) : undefined;
  if (hiding) return SPOT_SHARE[hiding.spot];
  const by = /^by:(.+):(-1|1)$/.exec(station);
  const feature = by ? features.get(by[1]) : undefined;
  return feature
    ? SPOT_SHARE[feature.spot] + Number(by![2]) * BESIDE
    : SPOT_SHARE.centre;
}

/** How far back a sheet's depth word stands someone (studio-scenery-plan §4.1). */
export const SHEET_DEPTH: Record<'back' | 'middle' | 'front', number> = {
  back: DEPTH_BACK,
  middle: DEPTH_MIDDLE,
  front: DEPTH_FRONT,
};

/**
 * How tall someone may stand, in the kit's units, and still be small: a
 * small animal (95) or a middling one, a goat or a big dog (130), at
 * under two thirds of a grown-up (234). A child (190) is four fifths of a
 * grown-up, and is seen well anywhere on the floor.
 */
export const SMALL_UNITS = 150;
/**
 * How far forward a small one stands while they matter, where nothing
 * says how far back: a step in front of where people have always stood
 * (0.5), so they are drawn a little larger than the people with them and
 * are never lost at the back; short of the front edge (0.85), where the
 * things before the camera stand and a close shot would cut their feet.
 */
export const SMALL_DEPTH = 0.65;

/** How tall someone stands, in the kit's units: a person as their age is drawn, an animal or a creature by its size. */
export function standingUnits(
  one: Pick<StudioCharacter, 'kind' | 'figure' | 'size'>,
): number {
  return one.kind === 'person'
    ? figureFrame(one.figure?.age ?? 'adult')[3]
    : SIZE_UNITS[one.size ?? 'medium'];
}

/**
 * How far back some words send someone on the floor: "in front", "to the
 * front", "near the camera" to its front; "at the back", "far off",
 * "across the yard" to its back. Null where they say neither: the stager
 * decides.
 */
export function depthSaid(words: string): number | null {
  if (
    /\b(?:in front|to the front|up front|near(?:er)? the camera|toward(?:s)? the camera|closer to us)\b/iu.test(
      words,
    )
  )
    return SHEET_DEPTH.front;
  if (
    /\b(?:(?:at|to|toward|towards|into) the (?:very )?back|far off|far away|in the distance|across the (?:yard|road|street|room|field|compound|square|market|courtyard|garden|playground))\b/iu.test(
      words,
    )
  )
    return SHEET_DEPTH.back;
  return null;
}

/** A station on the open floor, at a depth of its own: a spot, or a point on the ground. */
const openFloor = (station: string) =>
  station in SPOT_SHARE || station.startsWith('@');

/** A station beside a feature: on its left (-1) or its right (1). */
export const besideStation = (feature: string, side: -1 | 1) =>
  `by:${feature}:${side}`;
/** A station behind a feature: hidden by it, where it stands. */
export const behindStation = (feature: string) => `behind:${feature}`;
/** A station under a feature (a bench, a table): where it stands, seen. */
export const underStation = (feature: string) => `under:${feature}`;
/** A station up a feature: up a tree, on a wall, where one who climbs it stands. */
export const upStation = (feature: string) => `up:${feature}`;

/** How each pose of the kit's arms, from a sheet written before, is played on the standing rig as the scene opens: a doing's move, once. */
const ARM_POSES: Partial<Record<string, DoingId>> = {
  waving: 'wave',
  pointing: 'point',
  'arms up': 'hop',
};

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
 * may be; but one with an action in it quickens the rest first, and is
 * then held longer, up to ACTION_MOST_S (a physical sequence up to
 * `sequenceMost`), rather than the action rushed. `asked` is how long it
 * would have run; `limit` is the most it may.
 */
export function timeQuiet(
  items: readonly QuietItem[],
  most = QUIET_MOST_S,
  sequenceMost = SEQUENCE_MOST_S,
): {
  starts: number[];
  lengths: number[];
  total: number;
  asked: number;
  limit: number;
} {
  const asked = inTurn(
    items,
    items.map((item) => item.s),
  );
  const acts = items.some((item) => item.acts);
  const limit = acts
    ? Math.max(most, isSequence(items) ? sequenceMost : ACTION_MOST_S)
    : most;
  const done = (lengths: readonly number[], total: number) => ({
    starts: inTurn(items, lengths).starts.map(round),
    lengths: lengths.map(round),
    total: round(total),
    asked: round(asked.end),
    limit,
  });
  if (asked.end <= most)
    return done(
      items.map((item) => item.s),
      asked.end,
    );
  // Quickened as little as fits, each in turn after the one it waits for
  // as quickened, from the moment the quiet's first begins: none runs on
  // past the quiet where they may all fit. The quiet itself is as long as
  // a quiet may be.
  const quickened = (room: number, quickens: (item: QuietItem) => boolean) => {
    let fit: number[] | null = null;
    let [low, high] = [0, 1];
    for (let n = 0; n < 14; n += 1) {
      const share = (low + high) / 2;
      const lengths = items.map((item) =>
        quickens(item) ? Math.max(item.leastS, item.s * share) : item.s,
      );
      if (inTurn(items, lengths).end <= room) {
        low = share;
        fit = lengths;
      } else high = share;
    }
    return fit;
  };
  const everything = () => true;
  if (!acts)
    return done(
      quickened(most - QUIET_STARTS_S, everything) ??
        items.map((item) => item.leastS),
      most,
    );
  // An action keeps its time: what else there is quickened first, to fit
  // the quiet as it would be.
  const gestures = (item: QuietItem) => !item.acts;
  const inQuiet = quickened(most - QUIET_STARTS_S, gestures);
  if (inQuiet) return done(inQuiet, most);
  // Still too long: held longer for the actions, as long as they take,
  // the rest as quick as they may be; and at the most, the actions
  // quickened too, to fit it.
  const rest = items.map((item) => (item.acts ? item.s : item.leastS));
  const held = inTurn(items, rest).end;
  if (held <= limit - QUIET_STARTS_S) return done(rest, Math.max(most, held));
  return done(
    quickened(limit - QUIET_STARTS_S, everything) ??
      items.map((item) => item.leastS),
    limit,
  );
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
    ...(c.animal ? { animal: c.animal } : {}),
    ...(c.creature ? { creature: c.creature } : {}),
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
        mood:
          p.face === 'pain'
            ? 'sad'
            : p.face === 'eyes closed'
              ? 'neutral'
              : p.face,
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

/**
 * A script staged anew, put on the voice a scene was made with: each
 * line's quiet after it as long as the voice left it, the quiet before
 * the first as long as it was. A quiet the stage asks longer than the
 * voice left keeps the stage's ask, so the film quickens what happens in
 * it to fit the voice's (compose's quietShare). Null when its words are
 * not the voice's own: then it must be voiced again.
 */
export function onItsVoice(
  script: SceneScript,
  voiced: Pick<SceneDto, 'beats' | 'durationMs'>,
): SceneScript | null {
  if (
    script.beats.length !== voiced.beats.length ||
    script.beats.some(
      (beat, k) => beat.say.trim() !== voiced.beats[k].text.trim(),
    )
  )
    return null;
  const beats = script.beats.map((beat, k) => {
    const next = voiced.beats[k + 1]?.startMs ?? voiced.durationMs;
    const gap = Math.max(0, next - voiced.beats[k].endMs) / 1000;
    return { ...beat, holdS: round(Math.max(gap, beat.holdS ?? 0)) };
  });
  const lead = round(Math.max(0, voiced.beats[0]?.startMs ?? 0) / 1000);
  return { ...script, beats, ...(lead > 0 ? { lead } : {}) };
}

/** The state a figure's clothes change at: the first outfit they change into, the second. */
export const dressState = (k: number) => `dress-${k}`;

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

/** The moves a rig that turns arms and nods a head plays as people do. */
const ARM_MOVES: ReadonlySet<StageMove> = new Set<StageMove>([
  'point',
  'wave',
  'clap',
  'shrug',
  'nod',
]);

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
    /** How the scene before left things: what someone who comes on later still holds, and what each one wears. */
    before?: {
      cast?: string[];
      held?: { who: string; thing: string }[];
      wears?: { who: string; figure: FigureSpec }[];
      /** The set it was on, and who went through which of its doors as it ended: they come in through the same door here. */
      set?: string;
      wentThrough?: { who: string; feature: string }[];
    } | null;
    /** Where the set's painting shows each feature it has, as a share of the stage across (paintedAt). */
    painted?: Readonly<Record<string, number>>;
    /** Beats whose doer gets up first whatever the sheet has them do: where a made scene showed someone moving while they were down. */
    rise?: ReadonlySet<number>;
    /** Those the artist drew whose rigs turn their arms and nod their heads: they point, wave and nod as people do. */
    gestures?: ReadonlySet<string>;
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
  /** What each feature offers the people who use it, once worked out. */
  const offered = new Map<
    string,
    { of: ReturnType<typeof drawPiece>['affordances'] }
  >();
  /** A thing handled apart from anyone (one of the lists', or the show's own), and what it is. */
  const handled = handledOn(bible);
  const kindOf = kindOn(bible);
  /** The show's own, as the words reader knows them. */
  const own = {
    things: bible.things ?? [],
    features: [...features.values()].filter((f) => f.kind === DRAWN),
  };
  /**
   * How everyone is through the scene: who opens down (in bed, sitting,
   * lying), who gets up at which beat, and who must get up first to do
   * what a beat has them do; and what each person wears.
   */
  const postures = posturesOf(sheet, [...features.values()]);
  for (const at of options.rise ?? [])
    if (!postures.rises.has(at) && !postures.standsFrom.has(at)) {
      const who = sheet.beats[at]?.who;
      const down = who ? postures.opening.get(who) : undefined;
      postures.rises.set(at, down ?? { how: 'sit', on: null, in: false });
    }
  const outfits = outfitsOf(sheet, bible, options.before ?? null);
  /** Whether one lies along a feature with their head at its left: a bed, a sofa or a bench, as the stage draws them. */
  const headLeft = (feature: string | null) =>
    ['bed', 'sofa', 'bench'].includes(features.get(feature ?? '')?.kind ?? '');
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
    // Everyone is the kit's one standing figure, rigged, whatever their
    // pose: in bed, sitting or lying is how they are at their station
    // (held sat or lain down), and an arm's pose a move as it opens; never
    // a drawing that carries a bed about. What they wear as it opens, and
    // each outfit they change into, is drawn on that one rig.
    const dressed = outfits.get(id);
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
      ...(holding ? { holding } : {}),
      ...(c.role === 'minor' ? { minor: true as const } : {}),
      ...(dressed && !sameOutfit(dressed.opening, dressed.usual)
        ? { wears: dressed.opening }
        : {}),
      ...(dressed?.changes.length
        ? {
            dress: dressed.changes.map((change, k) => ({
              state: dressState(k + 1),
              spec: change.spec,
            })),
          }
        : {}),
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
      // What it does, and the face it is said with over what is felt, as
      // the writer gave them: the acting takes them over its own reading.
      if (raw.aim) beat.aim = raw.aim;
      const felt = raw.felt && raw.felt !== recipeOfFeeling(raw.feeling);
      if (isOwnRecipe(raw.feeling) || felt) {
        const said = recipeOfFeeling(raw.feeling);
        if (said) beat.said = said;
      }
      if (felt) beat.felt = raw.felt;
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
    const timed = timeQuiet(
      run.map((at) =>
        quietItem(
          sheet.beats[at],
          postureSeconds(postures, at) + interactExtraS(at),
        ),
      ),
    );
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
  // until a beat moves them. One in bed or on a seat as it opens is there.
  const here = new Map<string, string>(
    sheet.onStage.map((p) => {
      const down = postures.opening.get(p.who);
      return [p.who, (down && stationOf(down)) ?? p.spot];
    }),
  );
  /** How each one is down now: sitting or lying, and where. */
  const down = new Map<string, Posture>(postures.opening);
  /** How far back each stands where the sheet or the words say: the rest as the stager spreads them. */
  const deep = new Map<string, number>(
    sheet.onStage.flatMap((p): [string, number][] =>
      p.depth ? [[p.who, SHEET_DEPTH[p.depth]]] : [],
    ),
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
    // Depth said only counts on the open floor: at a feature, its own.
    const depth = Object.fromEntries(
      show.flatMap((id): [string, number][] => {
        const d = deep.get(id);
        return d !== undefined && openFloor(here.get(id)!) ? [[id, d]] : [];
      }),
    );
    return {
      layout: show.length
        ? fitLayout(show.length > 1 ? 'row' : 'one', show.length)
        : 'one',
      show,
      arrows: [],
      at: Object.fromEntries(show.map((id) => [id, here.get(id)!])),
      ...(Object.keys(depth).length ? { depth } : {}),
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
  // Who went through a door as the scene before ended, on another set:
  // this one opens with them coming in through its side of the same door
  // (the door linked to that one, else the set's one door), from its first
  // moments (studio-interactions-plan §2.1).
  const comesThrough = new Map<string, string>();
  const was = options.before;
  if (was?.wentThrough?.length && was.set && was.set !== sheet.set)
    for (const went of was.wentThrough) {
      if (
        !here.has(went.who) ||
        postures.opening.has(went.who) ||
        (byId.get(went.who)?.kind ?? 'person') !== 'person'
      )
        continue;
      const doors = [...features.values()].filter(
        (f) => f.kind === 'door' || f.kind === 'gate',
      );
      const door =
        doors.find(
          (f) => f.link?.set === was.set && f.link?.feature === went.feature,
        ) ?? (doors.length === 1 ? doors[0] : undefined);
      if (!door) continue;
      comesThrough.set(went.who, door.id);
      here.delete(went.who);
    }
  if (comesThrough.size) lead = Math.max(lead, COME_THROUGH_S);
  // Somewhere new, opening on a line: the place first, whole, a moment.
  if (
    options.before !== undefined &&
    (options.before?.set ?? null) !== sheet.set &&
    sheet.beats[0]?.kind === 'line'
  )
    lead = Math.max(lead, ESTABLISH_S);
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
  /** The signs each one shows now: a sign stays on until it is taken off. */
  const signsOn = new Map<string, Set<string>>();
  /**
   * Signs taken off someone: those given (a new sign in their place), or,
   * with none given, those that end as they wake and do or say anything:
   * asleep is over once they speak aloud, move or get up.
   */
  const signsOff = (who: string, only?: ReadonlySet<string>): SceneEffect[] => {
    const on = signsOn.get(who);
    if (!on) return [];
    const off = [...on].filter((sign) =>
      only ? only.has(sign) : WAKES.has(sign),
    );
    for (const sign of off) on.delete(sign);
    return off.map((sign) => ({
      target: who,
      part: sign,
      do: 'hide' as const,
    }));
  };
  /** Someone drawn by the artist, with no rig: they bob, hop and step toward someone. */
  const bobs = (id: string) => (byId.get(id)?.kind ?? 'person') !== 'person';
  /** One the artist drew whose rig acts people's gestures: a point, a wave, a nod are theirs too. */
  const gestures = (id: string, move: StageMove) =>
    Boolean(options.gestures?.has(id)) && ARM_MOVES.has(move);
  /**
   * Sitting or lying down, held until they get up: an animal lies (it
   * sits only when told to), a person as they are; lying along a bed or a
   * sofa, their head to its head end.
   */
  const heldDown = (
    who: string,
    posture: Posture,
    how: 'sit' | 'lie' = posture.how,
  ): SceneEffect => ({
    target: who,
    part: how === 'lie' && headLeft(posture.on) ? '@right' : null,
    do: how,
  });
  // Whoever is down as the scene opens is so from its first frame, until
  // the sheet has them get up (an animal in bed lies there); an arm's
  // pose from a sheet written before is a move as it opens.
  for (const p of sheet.onStage) {
    if (!inCast.has(p.who)) continue;
    const posture = postures.opening.get(p.who);
    if (posture)
      steps[0].effects.push(
        heldDown(
          p.who,
          posture,
          bobs(p.who) && p.pose !== 'sitting' ? 'lie' : posture.how,
        ),
      );
    const arms = bobs(p.who) ? undefined : ARM_POSES[p.pose];
    const move = arms ? doingOf(arms) : undefined;
    if (move && 'move' in move.plays)
      steps.push({
        at: { beat: opensQuiet ? -1 : 0, phrase: '' },
        word: 0,
        ...(opensQuiet ? { after: 0.4 } : {}),
        stage: null,
        effects: [
          {
            target: p.who,
            part: arms === 'point' ? '@up' : null,
            do: move.plays.move,
            ms: move.ms,
          },
        ],
      });
  }
  // In through the door, the same door they went out by in the scene before.
  for (const [who, door] of comesThrough) {
    // Where the sheet has them as it opens: theirs alone, as the mender keeps it.
    here.set(who, opening.get(who)?.spot ?? 'centre');
    steps.push({
      at: { beat: -1, phrase: '' },
      word: 0,
      after: 0.3,
      stage: stageNow({ arrive: [who], going: { [who]: { via: door } } }),
      effects: [],
      interact: [
        { who, does: 'come-through', feature: door, s: COME_THROUGH_S },
      ],
    });
  }
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
      if (
        raw.do === 'climb' ||
        raw.do === 'climb-stairs' ||
        here.get(who) === up
      )
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
      // The spot nearest them is theirs when they stand on it or near it,
      // or past them: the first spot to stop at is this side of them,
      // clear of where they stand, never on them.
      const first =
        here.get(aim) === SPOTS[j] ||
        (SPOT_SHARE[SPOTS[j]] - theirs) * back < BESIDE
          ? j + back
          : j;
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
    if (bobs(who) && !gestures(who, what))
      what = bobbingMove(what, Boolean(toward));
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
    return bobs(who) && move === 'nod' && !gestures(who, move) ? 'hop' : move;
  };

  /** The sheet's beat each step was made at: -1 for those before its first. */
  const stepBeat: number[] = [];
  const markSteps = (at: number) => {
    while (stepBeat.length < steps.length) stepBeat.push(at);
  };
  sheet.beats.forEach((raw, at) => {
    markSteps(at - 1);
    // Going somewhere, as far back as the words say, or as the stager
    // spreads them there.
    if (raw.who && doingOf(raw.do)?.kind === 'travel') {
      const said = depthSaid(`${raw.say} ${raw.doSaid ?? ''}`);
      if (said === null) deep.delete(raw.who);
      else deep.set(raw.who, said);
    }
    const k = spokenAt.get(at);
    if (k !== undefined) {
      const beat = beats[k];
      const effects: SceneEffect[] = [];
      if (beat.kind === 'line' && beat.speaker) {
        // Speaking aloud, they are awake: asleep no more.
        if (raw.from !== 'thought' && raw.from !== 'dream')
          effects.push(...signsOff(beat.speaker));
        // The face the line is said with: the sheet's; else what its words
        // tell, or what it does (scene-performance), if it is not the one
        // they wear already.
        const told =
          (raw.feeling ? kitFaceOf(raw.feeling) : null) ??
          faceOfLine(beat.say) ??
          faceOfAim(
            readLine(beat.say.split(/\s+/), { aim: raw.aim ?? null }).aim,
          );
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
      // A determined line is the kit's angry face, but frightens no one.
      const heard =
        raw.feeling && raw.feeling !== 'determined'
          ? LANDS[kitFaceOf(raw.feeling)]
          : undefined;
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
    const timed = moments.get(at);
    if (!timed) return;
    let moment = timed;
    const effects: SceneEffect[] = [];
    /** What someone does with a thing of the set from this beat's moment. */
    const interact: SceneStepInteraction[] = [];
    let stage: SceneStage | null = null;
    /** What happens later in the same moment: coming back from a run out. */
    const afterwards: SceneStep[] = [];
    const who = raw.who;
    if (
      (raw.kind === 'action' || raw.kind === 'business') &&
      who &&
      inCast.has(who)
    ) {
      // Doing anything, they are awake: asleep no more.
      effects.push(...signsOff(who));
      // How they are as it comes first: down, they get up before they go
      // anywhere or do what needs their feet, and step out beside what
      // they were on or in; the doing itself comes after.
      moment = standFirst(raw, at, who, timed);
      const doing = doingOf(raw.do) ?? doingOf('nod')!;
      const aim = aimOf(raw, who, doing);
      const plays = doing.plays;
      const plain = options.plain?.has(at) ?? false;
      // Done with a thing of the set (studio-interactions-plan): over to
      // it, and its choreography timed from there; where it cannot be (no
      // such thing on the set), as the doing plays without it.
      const used = plain ? null : interactBeat(raw, who, doing, moment);
      if (used) {
        stage = used.stage;
        effects.push(...used.effects);
        interact.push(...used.interact);
        afterwards.push(...used.afterwards);
      } else if ('step' in plays) {
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
            // Over to someone: they stop beside them, near enough to talk.
            const toward = aim && here.has(aim) && aim !== who ? aim : null;
            stage = stageNow(
              run || toward
                ? {
                    going: {
                      [who]: {
                        ...(run ? { pace: 'run' as const } : {}),
                        ...(toward ? { toward } : {}),
                      },
                    },
                  }
                : {},
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
        // A move over the going itself: a sprint's lean and pumping arms.
        if (doing.with && !plain && here.has(who))
          effects.push(moveEffect(who, doing.with, aim, moment.s));
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
        // Sitting or lying down on a seat or in a bed the words name (on
        // the bench, into bed): over to it first, then down on it, held
        // there until they get up; getting up out of one, up, and out
        // beside it, and it stays where it is.
        const downTo = plain ? undefined : postures.downTo.get(at);
        const upFrom = plain ? undefined : postures.standsFrom.get(at);
        const seat = downTo ? stationOf(downTo) : null;
        // Its own share of the moment, besides stepping out or going over.
        const own = quietItem(raw).s;
        const ownS = round(
          (moment.s * own) / Math.max(0.01, own + postureSeconds(postures, at)),
        );
        const to =
          TOUCHES.has(doing.id) &&
          !plain &&
          aim &&
          here.has(aim) &&
          was &&
          Math.abs(share(was) - share(here.get(aim)!)) > ONE_SPOT
            ? travelTo(who, aim, { ...raw, spot: null }, false)
            : null;
        // A leap (a landing) carries them: up onto the feature it is at,
        // where one stands up it (a wall's top); beside it; beside whom it
        // is at; else on ahead. Their place changes as the move begins,
        // and the stage flies them there along its arc.
        const carried =
          !plain &&
          doing.carries &&
          'move' in doing.plays &&
          move === doing.plays.move
            ? carriedTo(who, doing.id, aim)
            : null;
        if (carried && carried !== was) {
          here.set(who, carried);
          stage = stageNow();
          effects.push(moveEffect(who, move, aim, moment.s));
        } else if (downTo && (move === 'sit' || move === 'lie')) {
          const lies = move === 'lie' && headLeft(downTo.on);
          const held: SceneEffect = {
            ...heldDown(who, downTo, move),
            // Sat facing what they sit at; lying along it, head to its head.
            part: lies ? '@right' : aim,
            ms: Math.round(ownS * 1000),
          };
          down.set(who, downTo);
          const there = seat ? (freeStation(who, seat) ?? seat) : was;
          // At a table: its chair pulled out first, sat on as it is out, and
          // tucked in (studio-interactions-plan §2.2).
          const table =
            move === 'sit' &&
            downTo.on &&
            !bobs(who) &&
            features.get(downTo.on)?.kind === 'table'
              ? downTo.on
              : null;
          const pullS = table ? INTERACT_STEPS['sit-at'][0][2] / 1000 : 0;
          const sitAt: SceneStepInteraction[] = table
            ? [
                {
                  who,
                  does: 'sit-at',
                  feature: table,
                  s: round(ownS + TABLE_SIT_EXTRA_S),
                },
              ]
            : [];
          if (there && there !== was) {
            const walkS = Math.max(
              0.6,
              round(moment.s - ownS - (table ? TABLE_SIT_EXTRA_S : 0)),
            );
            here.set(who, there);
            stage = stageNow();
            afterwards.push({
              at: { beat: moment.after, phrase: phraseOf(raw.say) },
              word: 0,
              after: round(moment.offset + walkS),
              stage: null,
              effects: table ? [] : [held],
              ...(table ? { interact: sitAt } : {}),
            });
            if (table)
              afterwards.push({
                at: { beat: moment.after, phrase: phraseOf(raw.say) },
                word: 0,
                after: round(moment.offset + walkS + pullS),
                stage: null,
                effects: [held],
              });
          } else if (table) {
            interact.push(...sitAt);
            afterwards.push({
              at: { beat: moment.after, phrase: phraseOf(raw.say) },
              word: 0,
              after: round(moment.offset + pullS),
              stage: null,
              effects: [held],
            });
          } else effects.push(held);
        } else if (to && was && to !== was) {
          const walkS = Math.max(
            WALK_MIN_MS / 1000,
            (Math.abs(share(to) - share(was)) * WALK_STAGE_MS) / 1000,
          );
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
        } else
          effects.push(moveEffect(who, move, aim, upFrom ? ownS : moment.s));
        // Up from a table: the chair pushed back, and tucked in again.
        if (
          upFrom?.on &&
          !bobs(who) &&
          features.get(upFrom.on)?.kind === 'table'
        )
          interact.push({
            who,
            does: 'stand-from',
            feature: upFrom.on,
            s: round(ownS + TABLE_RISE_EXTRA_S),
          });
        if (move === 'stand' || upFrom) down.delete(who);
        // Out of bed, or up off a seat: stepping down out beside it just as
        // they start to get up, never standing up on it first.
        if (upFrom?.on && here.has(who)) {
          here.set(who, besideOf(upFrom.on, who));
          afterwards.push({
            at: { beat: moment.after, phrase: phraseOf(raw.say) },
            word: 0,
            after: round(moment.offset + stepDownLead(ownS)),
            stage: stageNow(),
            effects: [],
          });
        }
        // A feature opened or shut: it swings as their hand does it; at
        // it already, their hand on its handle as it swings.
        const feature = aimedFeature(aim);
        if ((doing.id === 'open' || doing.id === 'close') && feature) {
          featureStates.push({
            beat: moment.after,
            after: round(moment.offset + doing.keyAt * moment.s),
            feature,
            state: doing.id === 'open' ? 'open' : 'shut',
          });
          const f = features.get(feature);
          const handled = f
            ? interactionFor(doing.id, f.kind, affordancesOf(f))
            : null;
          // A drawer pulled out, not the door swung.
          const drawer =
            /\bdrawers?\b/iu.test(raw.say) &&
            Boolean(
              f &&
              affordancesOf(f)?.slides?.some((one) => one.group === 'drawer'),
            );
          if (drawer) featureStates.pop();
          if (
            handled &&
            !plain &&
            !bobs(who) &&
            here.get(who)?.startsWith(`by:${feature}:`)
          )
            interact.push({
              who,
              does: handled,
              feature,
              s: moment.s,
              ...(drawer ? { part: 'drawer' } : {}),
            });
        }
      } else if (plays.prop === 'wear' || plays.prop === 'doff') {
        // Put on or taken off: the thing gone into what they wear, or out
        // of it into their hand; and what they wear changes as it does.
        if (raw.prop && handled(raw.prop))
          handleBeat(raw, raw.prop, who, plays.prop, aim, moment);
        const change = outfitChange(who, at);
        if (change)
          afterwards.push({
            at: { beat: moment.after, phrase: phraseOf(raw.say) },
            word: 0,
            after: round(moment.offset + doing.keyAt * moment.s),
            stage: null,
            effects: change,
          });
        else if (!raw.prop)
          effects.push(
            moveEffect(who, fallbackMove(doing, who), aim, moment.s),
          );
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
      if (raw.feeling) effects.push(...faceEffect(who, kitFaceOf(raw.feeling)));
      // A sign that moves the whole body, on one the artist drew (who has
      // no such sign drawn): the move it is, as long as that move takes.
      const moves = raw.sign && bobs(who) ? SIGN_MOVES[raw.sign] : undefined;
      if (moves)
        effects.push(
          moveEffect(who, moves.move, null, doingOf(moves.doing)!.ms / 1000),
        );
      else if (raw.sign) {
        // A new sign in place of the one before; a moment's (a bulb for
        // an idea) off again once it is seen.
        const was = signsOn.get(who) ?? new Set<string>();
        effects.push(
          ...signsOff(who, new Set([...was].filter((s) => s !== raw.sign))),
          { target: who, part: raw.sign, do: 'show' },
        );
        signsOn.set(who, new Set([...was, raw.sign]));
        if (MOMENT_SIGNS.has(raw.sign)) {
          signsOn.get(who)!.delete(raw.sign);
          afterwards.push({
            at: { beat: moment.after, phrase: phraseOf(raw.say) },
            word: 0,
            after: round(moment.offset + SIGN_SEEN_S),
            stage: null,
            effects: [{ target: who, part: raw.sign, do: 'hide' }],
          });
        }
      }
    }
    if (stage || effects.length || interact.length)
      steps.push({
        at: { beat: moment.after, phrase: phraseOf(raw.say) },
        word: 0,
        after: moment.offset,
        stage,
        effects,
        ...(interact.length ? { interact } : {}),
      });
    steps.push(...afterwards);
  });
  markSteps(sheet.beats.length - 1);
  forwardTheSmall();

  /**
   * A small one (a puppy, a kitten: shorter than SMALL_UNITS) stands
   * forward on the open floor, at SMALL_DEPTH, all the while they stand
   * in one place, where in that time they act, speak, someone acts or
   * speaks to them, or the words find them there: so they are seen, not
   * lost small at the back. Kept for the whole of their stay there, so
   * they do not slide forward and back between beats. Where the sheet or
   * the words say how far back they stand, that stands; by a feature,
   * they stand at its own depth, as everyone does.
   */
  function forwardTheSmall(): void {
    /** Whether a beat is about someone: theirs, to them, at them, or with their name in its words. */
    const matters = (id: string, at: number) => {
      const beat = sheet.beats[at];
      const one = byId.get(id);
      return (
        beat !== undefined &&
        (beat.who === id ||
          beat.to === id ||
          beat.target === id ||
          (pointedOut.get(at) ?? []).includes(id) ||
          (one !== undefined &&
            namesOf(one).some((name) =>
              new RegExp(`\\b${escapedWord(name)}\\b`, 'u').test(beat.say),
            )))
      );
    };
    const small = [...inCast].filter((id) => {
      const one = byId.get(id);
      return one !== undefined && standingUnits(one) < SMALL_UNITS;
    });
    for (const id of small) {
      // Their stays, in turn: the steps they stand at one station through.
      const stays: { station: string; steps: number[] }[] = [];
      steps.forEach((step, k) => {
        const station = step.stage?.show.includes(id)
          ? step.stage.at?.[id]
          : undefined;
        if (!step.stage) {
          stays[stays.length - 1]?.steps.push(k);
          return;
        }
        const last = stays[stays.length - 1];
        if (station === undefined) stays.push({ station: '', steps: [k] });
        else if (last?.station === station) last.steps.push(k);
        else stays.push({ station, steps: [k] });
      });
      stays.forEach((stay, n) => {
        if (!stay.station || !openFloor(stay.station)) return;
        const staged = stay.steps.filter((k) => steps[k].stage);
        if (staged.some((k) => steps[k].stage!.depth?.[id] !== undefined))
          return;
        const from = Math.max(0, stepBeat[stay.steps[0]]);
        const next = stays[n + 1]?.steps[0];
        const to =
          next === undefined ? sheet.beats.length - 1 : stepBeat[next] - 1;
        let seen = false;
        for (let at = from; at <= Math.max(from, to) && !seen; at += 1)
          seen = matters(id, at);
        if (!seen) return;
        for (const k of staged)
          steps[k].stage!.depth = {
            ...steps[k].stage!.depth,
            [id]: SMALL_DEPTH,
          };
      });
    }
  }

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

  /**
   * Someone down as a beat of theirs comes that needs them up (going
   * anywhere, a jump, a hug): up first, as long as getting up takes. Off a
   * seat or out of a bed, they step down out beside it as they get up, so
   * they are never seen standing up on it or walking along it, and go on
   * from there. The beat's own moment, after that: what is left of its
   * time in the quiet.
   */
  function standFirst(
    raw: SheetBeat,
    at: number,
    who: string,
    timed: { after: number; offset: number; s: number; room: number },
  ): { after: number; offset: number; s: number; room: number } {
    const was = postures.rises.get(at);
    if (!was || !here.has(who)) return timed;
    const now = down.get(who) ?? was;
    down.delete(who);
    const own = quietItem(raw).s;
    const k = timed.s / Math.max(0.01, own + postureSeconds(postures, at));
    const riseS = round(RISE_S * k);
    // Up from a table: the chair pushed back, and tucked in again.
    const fromTable =
      now.on && !bobs(who) && features.get(now.on)?.kind === 'table'
        ? now.on
        : null;
    steps.push({
      ...(fromTable
        ? {
            interact: [
              {
                who,
                does: 'stand-from' as const,
                feature: fromTable,
                s: round(riseS + TABLE_RISE_EXTRA_S),
              },
            ],
          }
        : {}),
      at: { beat: timed.after, phrase: phraseOf(raw.say) },
      word: 0,
      after: timed.offset,
      stage: null,
      effects: [
        // Up off the ground after a hard fall, from where it left them;
        // else up as from anything.
        now.fell
          ? {
              target: who,
              part: null,
              do: 'get-up',
              ms: Math.round(Math.max(riseS, GET_UP_LEAST_S) * 1000),
            }
          : {
              target: who,
              part: null,
              do: 'stand',
              ms: Math.round(riseS * 1000),
            },
      ],
    });
    if (!now.on) return after(riseS);
    // Stepping down beside it just as they start to rise: their feet come
    // down to the ground as they come up, and they go on from there once
    // the step is done.
    here.set(who, besideOf(now.on, who));
    const lead = stepDownLead(riseS);
    steps.push({
      at: { beat: timed.after, phrase: phraseOf(raw.say) },
      word: 0,
      after: round(timed.offset + lead),
      stage: stageNow(),
      effects: [],
    });
    return after(
      Math.min(
        Math.max(0.3, timed.s - 0.3),
        Math.max(riseS, round(lead + STEP_DOWN_S)),
      ),
    );
    /** The beat's own moment, after what getting up used of it. */
    function after(used: number) {
      return {
        ...timed,
        offset: round(timed.offset + used),
        s: Math.max(0.3, round(timed.s - used)),
        room: Math.max(0.3, round(timed.room - used)),
      };
    }
  }

  /**
   * Where a move that carries them takes someone (a leap, a landing): up
   * onto the feature it is at, where one stands up it; else beside it, on
   * the side they come from; beside whom it is at; a leap with nowhere
   * named, on ahead toward the middle of the stage. A landing from up on a
   * feature, down beside it. Null where it takes them nowhere new.
   */
  function carriedTo(
    who: string,
    id: DoingId,
    aim: string | null,
  ): string | null {
    const was = here.get(who);
    if (!was) return null;
    if (id === 'land') {
      const up = /^up:(.+)$/.exec(was);
      return up ? besideOf(up[1], who) : null;
    }
    const feature = aimedFeature(aim);
    const f = feature ? features.get(feature) : undefined;
    if (f) {
      if (perchOf(f.kind, f.name) !== undefined) {
        const up = upStation(f.id);
        return freeStation(who, up) === up ? up : null;
      }
      const side: -1 | 1 = share(was) < SPOT_SHARE[f.spot] ? -1 : 1;
      for (const s of [side, -side as -1 | 1]) {
        const station = besideStation(f.id, s);
        if (freeStation(who, station) === station) return station;
      }
      return null;
    }
    if (aim && here.has(aim)) {
      const theirs = share(here.get(aim)!);
      const mine = share(was);
      const close = theirs + (mine < theirs ? -1 : 1) * BESIDE * 1.2;
      return Math.abs(close - mine) > NEAR ? groundAt(close) : null;
    }
    const mine = share(was);
    const dir =
      aim === '@left' ? -1 : aim === '@right' ? 1 : mine < 0.5 ? 1 : -1;
    const to = Math.min(0.9, Math.max(0.1, mine + dir * LEAP_SHARE));
    return Math.abs(to - mine) > NEAR ? freeStation(who, groundAt(to)) : null;
  }

  /** What a feature of the set offers the people who use it: the stage's own piece's, as drawn; none for one of the show's own. */
  function affordancesOf(f: StudioFeature) {
    if (f.kind === DRAWN) return undefined;
    let found = offered.get(f.id);
    if (!found) {
      found = { of: drawPiece(f.kind, f.name).affordances };
      offered.set(f.id, found);
    }
    return found.of;
  }

  /** How long a walk from one station to another takes, about, in seconds: as the player walks it, at least its shortest walk. */
  function stationWalkS(from: string, to: string): number {
    return round(
      Math.max(
        WALK_MIN_MS / 1000,
        (Math.abs(stationShare(to, features) - stationShare(from, features)) *
          WALK_STAGE_MS) /
          1000,
      ),
    );
  }

  /** How much longer than its own doing a beat takes for what it does with a thing of the set: a chair pulled out and tucked in. */
  function interactExtraS(at: number): number {
    const beat = sheet.beats[at];
    if (!beat?.who || (beat.kind !== 'action' && beat.kind !== 'business'))
      return 0;
    const kindOfFeature = (id: string | null | undefined) =>
      id ? features.get(id)?.kind : undefined;
    if (
      beat.do === 'sit' &&
      kindOfFeature(postures.downTo.get(at)?.on) === 'table'
    )
      return TABLE_SIT_EXTRA_S;
    const up = postures.standsFrom.get(at) ?? postures.rises.get(at);
    if (up?.on && kindOfFeature(up.on) === 'table') return TABLE_RISE_EXTRA_S;
    // Over to a thing of the set to use it: a walk longer than the doing's
    // own time allows for, from where the sheet last had them.
    const uses = beat.do ? USES[beat.do] : undefined;
    const target =
      beat.do === 'go-through' ? (beat.via ?? beat.target) : beat.target;
    const f = target ? features.get(target) : undefined;
    if (uses && f) {
      let spot: string | undefined = sheet.onStage.find(
        (p) => p.who === beat.who,
      )?.spot;
      for (const one of sheet.beats.slice(0, at))
        if (
          one.who === beat.who &&
          one.spot &&
          doingOf(one.do)?.kind === 'travel'
        )
          spot = one.spot;
      if (spot) {
        const side = SPOT_SHARE[f.spot] < stationShare(spot, features) ? 1 : -1;
        const walk = stationWalkS(spot, besideStation(f.id, side));
        return Math.max(0, round(walk - WALK_MIN_MS / 1000));
      }
    }
    return 0;
  }

  /**
   * A doing done with a thing of the set (studio-interactions-plan §1.3,
   * §2.5): over to it first, to the side it is used from (a door's handle
   * side, the foot of the stairs, the nearer end of a counter), where they
   * are not there already, as a walk; then what they do with it, timed in
   * compose from where the walk leaves them. Through a door, they are gone
   * as they go through it; up the stairs, they are up them as the climb
   * begins (it carries them there). Null where it cannot be done so: then
   * it is played as the doing plays without it.
   */
  function interactBeat(
    raw: SheetBeat,
    who: string,
    doing: Doing,
    moment: { after: number; offset: number; s: number; room: number },
  ): {
    stage: SceneStage | null;
    effects: SceneEffect[];
    interact: SceneStepInteraction[];
    afterwards: SceneStep[];
  } | null {
    const uses = USES[doing.id];
    if (!uses || bobs(who) || !here.has(who)) return null;
    const id = doing.id === 'go-through' ? (raw.via ?? raw.target) : raw.target;
    const feature = id ? features.get(id) : undefined;
    if (!feature) return null;
    const offers = affordancesOf(feature);
    const does = interactionFor(doing.id, feature.kind, offers);
    if (!does) return null;
    const was = here.get(who)!;
    const at = { beat: moment.after, phrase: phraseOf(raw.say) };
    const out = {
      stage: null as SceneStage | null,
      effects: [] as SceneEffect[],
      interact: [] as SceneStepInteraction[],
      afterwards: [] as SceneStep[],
    };
    // The side it is used from: its own (a door's handle), else the nearer.
    const nearer: -1 | 1 = share(was) < SPOT_SHARE[feature.spot] ? -1 : 1;
    const side: -1 | 1 =
      does === 'lean-on' || does === 'knock'
        ? nearer
        : (offers?.side ?? nearer);
    const byIt = new RegExp(`^by:${escapedWord(feature.id)}:`).test(was);
    let walkS = 0;
    const goTo = (station: string) => {
      const to = freeStation(who, station) ?? station;
      if (to === was) return;
      here.set(who, to);
      out.stage = stageNow();
      walkS = stationWalkS(was, to);
    };
    const least = interactLeastMs(does) / 1000;
    /** From the moment the walk over leaves them there: on this beat's own step, or a step of its own. */
    const from = (stage: SceneStage | null, one: SceneStepInteraction) => {
      if (!walkS && !out.stage) {
        out.stage = stage;
        out.interact.push(one);
        return;
      }
      out.afterwards.push({
        at,
        word: 0,
        after: round(moment.offset + walkS),
        stage,
        effects: [],
        interact: [one],
      });
    };
    if (does === 'go-through') {
      // To the handle side, unless beside it already.
      if (!byIt) goTo(besideStation(feature.id, side));
      const s = round(Math.max(least, moment.s - walkS));
      const off = exitSideOf(here, who, features, feature.id);
      wentOff.set(who, off);
      here.delete(who);
      from(
        stageNow({
          leave: [who],
          going: { [who]: { via: feature.id, side: off, through: true } },
        }),
        {
          who,
          does,
          feature: feature.id,
          s,
          side,
          to: feature.link ? 'next-set' : 'behind',
        },
      );
      return out;
    }
    if (does === 'climb-stairs' || does === 'climb-ladder') {
      const up = upStation(feature.id);
      if (was === up || freeStation(who, up) !== up) return null;
      // To its foot (the side it rises from), then up it, a tread at a time.
      const foot = besideStation(feature.id, offers?.side ?? nearer);
      if (was !== foot) goTo(foot);
      const s = round(Math.max(least, moment.s - walkS));
      here.set(who, up);
      from(stageNow(), { who, does, feature: feature.id, s });
      return out;
    }
    // Used where it is: over to it first.
    if (!byIt) goTo(besideStation(feature.id, side));
    const at2 = here.get(who)!;
    const standsAt = /:(-1|1)$/.exec(at2)?.[1];
    const s = round(Math.max(least, moment.s - walkS));
    from(null, {
      who,
      does,
      feature: feature.id,
      s,
      ...(standsAt ? { side: Number(standsAt) as -1 | 1 } : {}),
    });
    return out;
  }

  /** How far into getting up someone steps down off what they were on: just after they start, so they are never stood up on it. */
  function stepDownLead(riseS: number): number {
    return round(Math.min(0.3, riseS * 0.25));
  }

  /** What someone's clothes do at a beat that changes them: the outfit it leaves them in shown, the one before hidden. */
  function outfitChange(who: string, at: number): SceneEffect[] | null {
    const k = outfits.get(who)?.changes.findIndex((c) => c.beat === at) ?? -1;
    if (k < 0) return null;
    return [
      { target: who, part: dressState(k + 1), do: 'show' },
      ...(k > 0
        ? [{ target: who, part: dressState(k), do: 'hide' as const }]
        : []),
    ];
  }

  /** Where one getting up off or out of a feature stands: beside it, on the side toward the middle of the stage. */
  function besideOf(feature: string, who: string): string {
    const f = features.get(feature);
    const side: -1 | 1 = f && SPOT_SHARE[f.spot] > 0.5 ? -1 : 1;
    for (const one of [side, -side as -1 | 1]) {
      const station = besideStation(feature, one);
      if (freeStation(who, station) === station) return station;
    }
    return freeStation(who, besideStation(feature, side)) ?? here.get(who)!;
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
    // Put on, it is off the stage, in what they wear; taken off, in hand.
    if (does === 'wear') {
      holders.delete(prop);
      lies.delete(prop);
    }
    if (does === 'doff') holders.set(prop, who);
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

  // The inserts the sheet asks for (K5): each on a thing of the stage's,
  // or a feature of the set, at its beat's moment (a thing handled in a
  // quiet), or on its line.
  const inserts = (sheet.inserts ?? []).flatMap(
    (one): NonNullable<SceneScript['inserts']> => {
      const raw = sheet.beats[one.beat];
      if (!raw) return [];
      const named = thingNamed(one.thing);
      const feature = featureIdOf(one.thing);
      const thing =
        [one.thing, named, raw.thing, raw.prop].find(
          (id): id is string => Boolean(id) && props.includes(id!),
        ) ?? (features.has(feature) ? `f:${feature}` : null);
      if (!thing) return [];
      const moment = moments.get(one.beat);
      if (moment) return [{ beat: moment.after, after: moment.offset, thing }];
      const k = spokenAt.get(one.beat);
      return k === undefined ? [] : [{ beat: k, thing }];
    },
  );

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
    ...(inserts.length ? { inserts } : {}),
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
