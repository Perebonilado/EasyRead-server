/**
 * Everything a character can be seen doing, in one list: moves of the
 * body (a wave, a nod, a jump), going somewhere (on, off, running to the
 * gate) and handling things (taking the cup, throwing the ball). Each says
 * who can do it, what it needs, the words that mean it, how long it takes
 * and when its moment comes, what it falls back to when it cannot be done
 * as it is, and what the stage plays for it: its own move where the stage
 * has one, else the nearest it has, never nothing.
 *
 * The Studio's writer is offered exactly these; a beat's own words are
 * read against them, and the words win; the stage plays them, and the
 * check on a made scene goes by them. A book's pages keep their own
 * shorter lists (STORY_MOVES, NARRATED_MOVES, PROP_ACTIONS), kept here as
 * parts of this one.
 */
import { FIGURE_GEAR, type FigureGear } from './scene-figure';
import {
  DRAWN,
  OWN_DETERMINER,
  mayBeFeature,
  nounAt,
  ownIdOf,
  ownWords,
  type Drawn,
  type OwnWord,
} from './scene-own';
import { PROP_WORDS, STAGE_PROPS, type StageProp } from './scene-props';

/** A move of the body, going somewhere, or handling a thing. */
export const DOING_KINDS = ['body', 'travel', 'handle'] as const;
export type DoingKind = (typeof DOING_KINDS)[number];

/** Who does it: a person the kit draws, or an animal or a creature the artist draws. */
export type Doer = 'person' | 'animal' | 'creature';

/** What a doing may be aimed at: someone, a feature of the set, a thing, a side of the stage. */
export type AimKind = 'character' | 'feature' | 'thing' | 'side';

/** How someone goes: walking, or running. */
export const TRAVEL_PACES = ['walk', 'run'] as const;
export type TravelPace = (typeof TRAVEL_PACES)[number];

/** The sides of the stage, and the sky and the ground, as a look or a point aims at them. */
export const SIDES = ['@left', '@right', '@up', '@down'] as const;
export type Side = (typeof SIDES)[number];

/**
 * What a story's people do besides, played by the rig where a screenplay
 * says: a wave, a nod, a shake of the head, a laugh, a hop, a clap, a sob,
 * a shrug, a lean in toward someone. A book's page asks only these.
 */
export const STORY_MOVES = [
  'wave',
  'nod',
  'shake',
  'laugh',
  'hop',
  'clap',
  'sob',
  'shrug',
  'lean-in',
] as const;
export type StoryMove = (typeof STORY_MOVES)[number];

/** What the narration of a book's page may say someone does, acted by the stage. */
export const NARRATED_MOVES = [
  'hug',
  'wave',
  'nod',
  'shake',
  'laugh',
  'hop',
  'clap',
  'sob',
  'shrug',
  'point',
  'reach',
  'look',
] as const;
export type NarratedMove = (typeof NARRATED_MOVES)[number];

/** What people do with the things on a book's page, as the player plays it: taken, raised, broken, given, eaten, drunk, dipped, put down. */
export const PROP_ACTIONS = [
  'take',
  'raise',
  'break',
  'give',
  'eat',
  'drink',
  'dip',
  'put',
] as const;
export type PropAction = (typeof PROP_ACTIONS)[number];

/**
 * And on a Studio story's stage, besides: thrown, caught, dropped, kicked
 * and chewed. A thing thrown flies, and lands in a hand, a mouth or on
 * the ground; one dropped falls; one kicked skims along the ground.
 */
export const THING_ACTIONS = [
  ...PROP_ACTIONS,
  'throw',
  'catch',
  'drop',
  'kick',
  'chew',
] as const;
export type ThingAction = (typeof THING_ACTIONS)[number];

/**
 * The body's own moves on a Studio story's stage, each shaped by the
 * player: a jump up and down again, a crouch, sitting and lying down
 * (held until they get up), getting up, a fall, a spin, a bow, a kick at
 * nothing; and an animal's wag, lick, chew, sniff, dig, wriggle, bark,
 * roll over and shake. A person does those they can as a person would.
 */
export const ACTED_MOVES = [
  'jump',
  'crouch',
  'sit',
  'stand',
  'lie',
  'fall',
  'spin',
  'bow',
  'kick',
  'wag',
  'lick',
  'chew',
  'sniff',
  'dig',
  'wriggle',
  'bark',
  'roll',
  'shake-off',
] as const;
export type ActedMove = (typeof ACTED_MOVES)[number];

/** The acted moves someone keeps to once in them, until they get up: sitting, lying down. */
export const HELD_MOVES: readonly ActedMove[] = ['sit', 'lie'];
/** How long getting into one takes, as the player plays it (HELD_IN_MS). */
export const HELD_IN_MS = 500;

/** A move the stage plays on someone today: one of a story's moves, a look, a point, a reach, a hug, or one of the body's own. */
export type StageMove =
  StoryMove | 'look' | 'point' | 'reach' | 'hug' | ActedMove;

/** How the stage plays a doing now. */
export type Played =
  | { step: 'enter' | 'leave' | 'walk' }
  | { move: StageMove }
  | { prop: ThingAction };

export const DOING_IDS = [
  // The body.
  'wave',
  'nod',
  'shake',
  'laugh',
  'hop',
  'clap',
  'sob',
  'shrug',
  'lean-in',
  'look',
  'point',
  'reach',
  'hug',
  'jump',
  'crouch',
  'sit',
  'stand-up',
  'lie-down',
  'fall',
  'spin',
  'bow',
  'wag',
  'lick',
  'sniff',
  'bark-bounce',
  'roll-over',
  'shake-off',
  'dig',
  'wriggle',
  // Going somewhere.
  'enter',
  'leave',
  'walk',
  'run',
  'chase',
  'fetch',
  'climb',
  'squeeze',
  'hide',
  // Handling things.
  'take',
  'put',
  'drop',
  'give',
  'throw',
  'catch',
  'kick',
  'eat',
  'chew',
  'drink',
  'raise',
  'break',
  'dip',
  'open',
  'close',
  'use',
] as const;
export type DoingId = (typeof DOING_IDS)[number];

export interface Doing {
  id: DoingId;
  kind: DoingKind;
  /** Who can do it. */
  by: readonly Doer[];
  /** The thing it needs: one in hand (or in the mouth), or one resting to be picked up. */
  thing: 'held' | 'resting' | null;
  /** What it may be done toward. */
  aims: readonly AimKind[];
  /** Whether it must be done toward one of them: a hug needs someone to hug. */
  aimed: boolean;
  /** The words that mean it, said of anyone, in any tense. */
  words: RegExp;
  /** How long it takes, and how short it may be made when a quiet is full. */
  ms: number;
  leastMs: number;
  /** How far into it its moment comes: the hand closing, the release, the landing. */
  keyAt: number;
  /** What is done instead by someone who cannot, or with nothing to do it with. */
  fallback: DoingId | null;
  /** What the stage plays for it now. */
  plays: Played;
  /** What the stage plays for a handling done with no thing to hand: a kick at nothing, a chew on nothing. */
  bare?: StageMove;
  /** Going at a run: a race, a chase. */
  runs?: true;
}

const ALL: readonly Doer[] = ['person', 'animal', 'creature'];
const HANDS: readonly Doer[] = ['person', 'creature'];
const PAWS: readonly Doer[] = ['animal', 'creature'];

/** Verbs of going at speed, for "races out" and "bolts after". */
const RUNNING =
  'r[au]n(?:s|ning)?|rac(?:e|es|ed|ing)|dash(?:es|ed|ing)?|rush(?:es|ed|ing)?|sprint(?:s|ed|ing)?|bolt(?:s|ed|ing)?|hurr(?:y|ies|ied|ying)|tear(?:s|ing)?|tore|charg(?:e|es|ed|ing)|gallop(?:s|ed|ing)?|leap(?:s|t|ed|ing)?|jump(?:s|ed|ing)?|hop(?:s|ped|ping)?|fl(?:y|ies|ew|ying)';
/** Verbs of going at a walk, or any other way. */
const GOING =
  'walk(?:s|ed|ing)?|go(?:es|ing)?|went|head(?:s|ed|ing)?|wander(?:s|ed|ing)?|stroll(?:s|ed|ing)?|step(?:s|ped|ping)?|march(?:es|ed|ing)?|limp(?:s|ed|ing)?|tiptoe(?:s|d|ing)?|creep(?:s|ing)?|crept|sneak(?:s|ing)?|snuck|swim(?:s|ming)?|swam|rid(?:e|es|ing)|rode|driv(?:e|es|ing)|drove|crawl(?:s|ed|ing)?|climb(?:s|ed|ing)?|squeez(?:e|es|ed|ing)|slip(?:s|ped|ping)?|scurr(?:y|ies|ied|ying)|scamper(?:s|ed|ing)?|dart(?:s|ed|ing)?';
/** Verbs of going at a walk from one place on the stage to another. */
const WALKING =
  'walk(?:s|ed|ing)?|go(?:es|ing)?|went|head(?:s|ed|ing)?|wander(?:s|ed|ing)?|stroll(?:s|ed|ing)?|step(?:s|ped|ping)?|march(?:es|ed|ing)?|limp(?:s|ed|ing)?|tiptoe(?:s|d|ing)?|creep(?:s|ing)?|crept|sneak(?:s|ing)?|snuck|shuffl(?:e|es|ed|ing)|pac(?:e|es|ed|ing)';

const doings: Record<DoingId, Omit<Doing, 'id'>> = {
  // ── The body ─────────────────────────────────────────────────────────────
  wave: {
    kind: 'body',
    by: HANDS,
    thing: null,
    aims: ['character', 'side'],
    aimed: false,
    words: /\bwav(?:e|es|ed|ing)\b(?! (?:a|the|his|her|their) flag)/iu,
    ms: 1900,
    leastMs: 900,
    keyAt: 0.3,
    fallback: 'nod',
    plays: { move: 'wave' },
  },
  nod: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['character'],
    aimed: false,
    words: /\bnod(?:s|ded|ding)?\b/iu,
    ms: 600,
    leastMs: 400,
    keyAt: 0.5,
    fallback: null,
    plays: { move: 'nod' },
  },
  shake: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words: /\bsh(?:ook|akes|aking|ake) (?:his|her|their|its) heads?\b/iu,
    ms: 1100,
    leastMs: 600,
    keyAt: 0.3,
    fallback: 'nod',
    plays: { move: 'shake' },
  },
  laugh: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['character'],
    aimed: false,
    words:
      /\b(?:laugh(?:s|ed|ing)?|giggl(?:e|es|ed|ing)|chuckl(?:e|es|ed|ing)|burst(?:s)? out laughing)\b/iu,
    ms: 1500,
    leastMs: 800,
    keyAt: 0.3,
    fallback: 'hop',
    plays: { move: 'laugh' },
  },
  hop: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\b(?:hop(?:s|ped|ping)?|bounc(?:e|es|ed|ing)|jump(?:s|ed|ing)?|leap(?:s|t|ed|ing)?|danc(?:e|es|ed|ing)) (?:up and down|for joy|with joy|about|around|on the spot|in place)\b/iu,
    ms: 1100,
    leastMs: 700,
    keyAt: 0.3,
    fallback: 'nod',
    plays: { move: 'hop' },
  },
  clap: {
    kind: 'body',
    by: HANDS,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\b(?:clap(?:s|ped|ping)?|cheer(?:s|ed|ing)?|applaud(?:s|ed|ing)?)\b/iu,
    ms: 1500,
    leastMs: 800,
    keyAt: 0.3,
    fallback: 'hop',
    plays: { move: 'clap' },
  },
  sob: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\b(?:sob(?:s|bed|bing)?|cr(?:ies|ied|ying)|cry|weep(?:s|ing)?|wept|burst(?:s)? into tears|whimper(?:s|ed|ing)?|whin(?:e|es|ed|ing))\b/iu,
    ms: 2600,
    leastMs: 1200,
    keyAt: 0.3,
    fallback: 'nod',
    plays: { move: 'sob' },
  },
  shrug: {
    kind: 'body',
    by: HANDS,
    thing: null,
    aims: [],
    aimed: false,
    words: /\bshrug(?:s|ged|ging)?\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.4,
    fallback: 'nod',
    plays: { move: 'shrug' },
  },
  'lean-in': {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words:
      /\blean(?:s|ed|ing)? (?:in|over|forward|close|closer|toward|towards|down)(?: close| closer)?\b|\bpeer(?:s|ed|ing)? (?:at|into|closely|over)\b/iu,
    ms: 1500,
    leastMs: 800,
    keyAt: 0.4,
    fallback: 'nod',
    plays: { move: 'lean-in' },
  },
  look: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: true,
    words:
      /\b(?:look(?:s|ed|ing)?|gaz(?:e|es|ed|ing)|star(?:e|es|ed|ing)|glanc(?:e|es|ed|ing)|peek(?:s|ed|ing)?|peer(?:s|ed|ing)?|watch(?:es|ed|ing)?|search(?:es|ed|ing)?|turn(?:s|ed|ing)? (?:to|toward|towards|round|around))\b/iu,
    ms: 2500,
    leastMs: 800,
    keyAt: 0.2,
    // Looking at nothing named: looking round, a turn of the head.
    fallback: 'shake',
    plays: { move: 'look' },
  },
  point: {
    kind: 'body',
    by: HANDS,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words: /\bpoint(?:s|ed|ing)?\b/iu,
    ms: 1700,
    leastMs: 900,
    keyAt: 0.3,
    fallback: 'lean-in',
    plays: { move: 'point' },
  },
  reach: {
    kind: 'body',
    by: HANDS,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words:
      /\b(?:reach(?:es|ed|ing)? (?:for|out|toward|towards|up|down|into|over)|stretch(?:es|ed|ing)? out|(?:t(?:akes|ook|aking)|h(?:olds|eld|olding)) (?:his|her|their) hands?)\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.4,
    fallback: 'point',
    plays: { move: 'reach' },
  },
  hug: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['character'],
    aimed: true,
    words:
      /\b(?:hug(?:s|ged|ging)?|embrac(?:e|es|ed|ing)|cuddl(?:e|es|ed|ing))\b|\b(?:catch(?:es)?|caught|scoop(?:s|ed)?|pull(?:s|ed)?|sweep(?:s)?|swept|wrap(?:s|ped)?|squeez(?:e|es|ed))(?: \p{L}+(?:['’]s)?){1,3} in(?:to)? an? (?:big |tight |warm |long )?(?:hug|embrace|cuddle)\b|\b(?:throw(?:s)?|threw|put(?:s)?|wrap(?:s|ped)?|fling(?:s)?|flung) (?:his|her|their|its) arms (?:round|around)\b/iu,
    ms: 2200,
    leastMs: 1200,
    keyAt: 0.4,
    fallback: 'reach',
    plays: { move: 'hug' },
  },
  jump: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['feature', 'thing', 'character'],
    aimed: false,
    words:
      /\b(?:jump(?:s|ed|ing)?|leap(?:s|t|ed|ing)?|spring(?:s|ing)?|sprang|vault(?:s|ed|ing)?|pounc(?:e|es|ed|ing))\b/iu,
    ms: 1100,
    leastMs: 700,
    keyAt: 0.45,
    fallback: 'hop',
    plays: { move: 'jump' },
  },
  crouch: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['feature', 'thing', 'character', 'side'],
    aimed: false,
    words:
      /\b(?:crouch(?:es|ed|ing)?|duck(?:s|ed|ing)?|kneel(?:s|ing)?|knelt|squat(?:s|ted|ting)?|bend(?:s|ing)? (?:down|low|over)|bent (?:down|low|over)|stoop(?:s|ed|ing)?|(?:look(?:s|ed|ing)?|peer(?:s|ed|ing)?|search(?:es|ed|ing)?|check(?:s|ed|ing)?) (?:under|beneath|behind|inside))\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.4,
    fallback: 'nod',
    plays: { move: 'crouch' },
  },
  sit: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['feature', 'character'],
    aimed: false,
    words:
      /\b(?:sit(?:s|ting)?(?! up)|sat(?! up)|takes? a seat|took a seat|perch(?:es|ed|ing)?|plop(?:s|ped)? down|flop(?:s|ped)? down)\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.6,
    fallback: 'nod',
    plays: { move: 'sit' },
  },
  'stand-up': {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\b(?:st(?:and|ands|ood|anding) up|gets? up|got up|getting up|ris(?:e|es|ing)|rose|sits? up|sat up|(?:jump|leap|spring)(?:s|ed)? to (?:his|her|their|its) feet|gets? to (?:his|her|their|its) feet)\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.6,
    fallback: 'nod',
    plays: { move: 'stand' },
  },
  'lie-down': {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['feature'],
    aimed: false,
    words:
      /\b(?:lies? down|lay down|lying down|lies on|curl(?:s|ed|ing)? up|stretch(?:es|ed|ing)? out on|flops? on)\b/iu,
    ms: 1600,
    leastMs: 900,
    keyAt: 0.6,
    fallback: 'nod',
    plays: { move: 'lie' },
  },
  fall: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\b(?:fall(?:s|ing)?|fell|trip(?:s|ped|ping)?|tumbl(?:e|es|ed|ing)|slip(?:s|ped|ping)?|stumbl(?:e|es|ed|ing))\b(?! (?:asleep|silent|quiet|in love|still))/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'nod',
    plays: { move: 'fall' },
  },
  spin: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\b(?:spin(?:s|ning)?|spun|twirl(?:s|ed|ing)?|whirl(?:s|ed|ing)?|pirouett(?:e|es|ed|ing)|turn(?:s|ed|ing)? (?:round and round|in a circle|a circle))\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'hop',
    plays: { move: 'spin' },
  },
  // A dog's bow is a play bow: its front down, its tail going.
  bow: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['character'],
    aimed: false,
    words: /\bbow(?:s|ed|ing)?\b(?! (?:tie|and arrow))/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'nod',
    plays: { move: 'bow' },
  },
  wag: {
    kind: 'body',
    by: PAWS,
    thing: null,
    aims: [],
    aimed: false,
    words: /\bwag(?:s|ged|ging)?\b/iu,
    ms: 1500,
    leastMs: 800,
    keyAt: 0.3,
    fallback: 'nod',
    plays: { move: 'wag' },
  },
  lick: {
    kind: 'body',
    by: PAWS,
    thing: null,
    aims: ['character', 'thing'],
    aimed: false,
    words: /\blick(?:s|ed|ing)?\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'nod',
    plays: { move: 'lick' },
  },
  sniff: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words:
      /\b(?:sniff(?:s|ed|ing)?|snuffl(?:e|es|ed|ing)|nuzzl(?:e|es|ed|ing)|smell(?:s|ed|ing)?|smelt)\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'nod',
    plays: { move: 'sniff' },
  },
  'bark-bounce': {
    kind: 'body',
    by: PAWS,
    thing: null,
    aims: ['character'],
    aimed: false,
    words:
      /\b(?:bark(?:s|ed|ing)?|yap(?:s|ped|ping)?|yelp(?:s|ed|ing)?|woof(?:s|ed)?|howl(?:s|ed|ing)?|squeak(?:s|ed|ing)?|meow(?:s|ed|ing)?|purr(?:s|ed|ing)?|roar(?:s|ed|ing)?)\b/iu,
    ms: 1000,
    leastMs: 600,
    keyAt: 0.3,
    fallback: 'hop',
    plays: { move: 'bark' },
  },
  'roll-over': {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\broll(?:s|ed|ing)? (?:over|around|about|on (?:its|his|her|their) back)\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.5,
    fallback: 'hop',
    plays: { move: 'roll' },
  },
  'shake-off': {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\bsh(?:akes?|ook|aking) (?:(?:it|him|her)self |themselves )?(?:off|dry)\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.4,
    fallback: 'hop',
    plays: { move: 'shake-off' },
  },
  dig: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: ['feature', 'thing', 'side'],
    aimed: false,
    words:
      /\b(?:dig(?:s|ging)?|dug|burrow(?:s|ed|ing)?|paw(?:s|ed|ing)? at|scratch(?:es|ed|ing)? at)\b/iu,
    ms: 1600,
    leastMs: 900,
    keyAt: 0.4,
    fallback: 'nod',
    plays: { move: 'dig' },
  },
  wriggle: {
    kind: 'body',
    by: ALL,
    thing: null,
    aims: [],
    aimed: false,
    words:
      /\b(?:wriggl(?:e|es|ed|ing)|wiggl(?:e|es|ed|ing)|squirm(?:s|ed|ing)?|twist(?:s|ed|ing)? free)\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'hop',
    plays: { move: 'wriggle' },
  },

  // ── Going somewhere ──────────────────────────────────────────────────────
  enter: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['feature', 'side'],
    aimed: false,
    words: new RegExp(
      `\\b(?:(?:came|comes|coming) (?:in|on|into|over|back|along|up|running|rushing|hurrying|through|round|around)|arriv(?:e|es|ed|ing)|appear(?:s|ed|ing)?|enter(?:s|ed|ing)?|walk(?:s|ed|ing)? (?:in|on|into|up)|step(?:s|ped|ping)? (?:in|into|on|out of)|(?:${RUNNING}|${GOING}) (?:in|into|aboard|on board|onto)|join(?:s|ed|ing)? (?:them|him|her|us))\\b`,
      'iu',
    ),
    ms: 1600,
    leastMs: 900,
    keyAt: 0.6,
    fallback: null,
    plays: { step: 'enter' },
  },
  leave: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['feature', 'side', 'character'],
    aimed: false,
    words: new RegExp(
      `\\b(?:leav(?:e|es|ing)|(?<!\\b(?:the|to|on|at|her|his|their|its|go|goes|turn|turns) )left(?! (?:behind|alone|hand|foot|side))|exit(?:s|ed|ing)?|disappear(?:s|ed|ing)?|vanish(?:es|ed|ing)?|(?:r[au]n(?:s|ning)?|rac(?:e|es|ed|ing)|dash(?:es|ed|ing)?|rush(?:es|ed|ing)?|bolt(?:s|ed|ing)?|hurr(?:y|ies|ied|ying)|tear(?:s|ing)?|tore|leap(?:s|t|ed|ing)?|jump(?:s|ed|ing)?|fl(?:y|ies|ew|ying)|walk(?:s|ed|ing)?|go(?:es|ing)?|went|head(?:s|ed|ing)?|wander(?:s|ed|ing)?|stroll(?:s|ed|ing)?|march(?:es|ed|ing)?|stomp(?:s|ed|ing)?|squeez(?:e|es|ed|ing)|slip(?:s|ped|ping)?|crawl(?:s|ed|ing)?|climb(?:s|ed|ing)?|swim(?:s|ming)?|swam|rid(?:e|es|ing)|rode|driv(?:e|es|ing)|drove|sneak(?:s|ing)?|snuck) (?:off|away|out|home))\\b`,
      'iu',
    ),
    ms: 1600,
    leastMs: 900,
    keyAt: 0.4,
    fallback: null,
    plays: { step: 'leave' },
  },
  walk: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words: new RegExp(
      `\\b(?:${WALKING}|mov(?:e|es|ed|ing)|spread(?:s|ing)? out|cross(?:es|ed|ing)?|comes? over|came over|turn(?:s|ed|ing)? back)\\b`,
      'iu',
    ),
    ms: 1400,
    leastMs: 800,
    keyAt: 0.7,
    fallback: 'lean-in',
    plays: { step: 'walk' },
  },
  run: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words:
      /\b(?:r[au]n(?:s|ning)?|rac(?:e|es|ed|ing)|dash(?:es|ed|ing)?|rush(?:es|ed|ing)?|sprint(?:s|ed|ing)?|bolt(?:s|ed|ing)?|dart(?:s|ed|ing)?|zoom(?:s|ed|ing)?|hurr(?:y|ies|ied|ying)|scamper(?:s|ed|ing)?|scurr(?:y|ies|ied|ying)|zigzag(?:s|ged|ging)?|bound(?:s|ed|ing)?|gallop(?:s|ed|ing)?|charg(?:e|es|ed|ing)|tear(?:s|ing)? (?:across|round|around|about)|tore (?:across|round|around|about))\b/iu,
    ms: 1000,
    leastMs: 600,
    keyAt: 0.7,
    fallback: 'hop',
    plays: { step: 'walk' },
    runs: true,
  },
  chase: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['character', 'thing', 'feature'],
    aimed: true,
    words: new RegExp(
      `\\b(?:chas(?:e|es|ed|ing)|pursu(?:e|es|ed|ing)|follow(?:s|ed|ing)?|(?:${RUNNING}|${GOING}|bound(?:s|ed|ing)?|dart(?:s|ed|ing)?|zoom(?:s|ed|ing)?) (?:off |away |out )?after)\\b`,
      'iu',
    ),
    ms: 1200,
    leastMs: 700,
    keyAt: 0.6,
    fallback: 'run',
    plays: { step: 'walk' },
    runs: true,
  },
  fetch: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['thing', 'character'],
    aimed: false,
    words:
      /\b(?:fetch(?:es|ed|ing)?|retriev(?:e|es|ed|ing)|bring(?:s|ing)? (?:it|them|the \p{L}+) back|brought (?:it|them|the \p{L}+) back)\b/iu,
    ms: 1800,
    leastMs: 900,
    keyAt: 0.6,
    fallback: 'run',
    plays: { step: 'walk' },
    runs: true,
  },
  climb: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['feature'],
    aimed: true,
    words:
      /\b(?:climb(?:s|ed|ing)?|clamber(?:s|ed|ing)?|scrambl(?:e|es|ed|ing) (?:up|onto|over|into|up onto))\b/iu,
    ms: 1600,
    leastMs: 900,
    keyAt: 0.6,
    fallback: 'jump',
    plays: { step: 'walk' },
  },
  squeeze: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['feature'],
    aimed: true,
    words:
      /\b(?:squeez(?:e|es|ed|ing)|slip(?:s|ped|ping)?|wriggl(?:e|es|ed|ing)|crawl(?:s|ed|ing)?|duck(?:s|ed|ing)?|dart(?:s|ed|ing)?) (?:under|through|between|beneath|past|out through|out under)\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.6,
    fallback: 'leave',
    plays: { step: 'leave' },
  },
  hide: {
    kind: 'travel',
    by: ALL,
    thing: null,
    aims: ['feature', 'character'],
    aimed: true,
    words:
      /\b(?:hid(?:e|es|ing)?|hidden) (?:behind|under|in|inside|beneath|among)\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.7,
    fallback: 'crouch',
    plays: { step: 'walk' },
  },

  // ── Handling things ──────────────────────────────────────────────────────
  take: {
    kind: 'handle',
    by: ALL,
    thing: 'resting',
    aims: ['thing'],
    aimed: false,
    words:
      /\b(?:t(?:ake|akes|ook|aking)(?! (?:a (?:seat|breath|look|step|bow)|his|her|their|off|part|turns?|care|place))|pick(?:s|ed|ing)? up|pick(?:s|ed)? (?:it|them|\p{L}+) up|grab(?:s|bed|bing)?|lift(?:s|ed|ing)?(?! (?:it |them |the \p{L}+ )?up)|snatch(?:es|ed|ing)?|seiz(?:e|es|ed|ing)|scoop(?:s|ed|ing)? up)\b/iu,
    ms: 1100,
    leastMs: 650,
    keyAt: 0.5,
    fallback: 'reach',
    plays: { prop: 'take' },
  },
  put: {
    kind: 'handle',
    by: ALL,
    thing: 'held',
    aims: ['feature', 'character'],
    aimed: false,
    words:
      /\b(?:(?:put|puts|putting|set|sets|setting|lay|lays|laid|pop|pops|popped) (?:it |them |the \p{L}+ |(?:his|her|their) \p{L}+ )?(?:down|back|away|on the)|plac(?:e|es|ed|ing))\b/iu,
    ms: 1000,
    leastMs: 600,
    keyAt: 0.55,
    fallback: 'nod',
    plays: { prop: 'put' },
  },
  drop: {
    kind: 'handle',
    by: ALL,
    thing: 'held',
    aims: ['character', 'feature'],
    aimed: false,
    words:
      /\b(?:drop(?:s|ped|ping)?|let(?:s|ting)? (?:it |them |the \p{L}+ )?(?:go|fall|drop)|spit(?:s|ting)? out|spat out)\b/iu,
    ms: 900,
    leastMs: 500,
    keyAt: 0.4,
    fallback: 'nod',
    plays: { prop: 'drop' },
  },
  give: {
    kind: 'handle',
    by: ALL,
    thing: 'held',
    aims: ['character'],
    aimed: true,
    words:
      /\b(?:g(?:ive|ives|ave|iving)(?! (?:up|in|thanks|a (?:shout|cry|yell|sigh|laugh|nod|shrug|smile|wave|hug)))|hand(?:s|ed|ing)?(?= )(?! (?:in hand|on))|pass(?:es|ed|ing)?(?= (?:it|them|the|a|an|some|him|her|me|us|\p{Lu}))|offer(?:s|ed|ing)?|shar(?:e|es|ed|ing))\b/iu,
    ms: 1600,
    leastMs: 900,
    keyAt: 0.62,
    fallback: 'reach',
    plays: { prop: 'give' },
  },
  throw: {
    kind: 'handle',
    by: HANDS,
    thing: 'held',
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words:
      /\b(?:thr(?:ow|ows|ew|owing|own)|toss(?:es|ed|ing)?|fling(?:s|ing)?|flung|lob(?:s|bed|bing)?|hurl(?:s|ed|ing)?|chuck(?:s|ed|ing)?|bowl(?:s|ed|ing)?)\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.45,
    fallback: 'point',
    plays: { prop: 'throw' },
  },
  catch: {
    kind: 'handle',
    by: ALL,
    thing: null,
    aims: ['thing', 'character'],
    aimed: false,
    words: /\b(?:catch(?:es|ing)?|caught|snap(?:s|ped)? (?:it )?up)\b/iu,
    ms: 1000,
    leastMs: 600,
    keyAt: 0.6,
    fallback: 'hop',
    plays: { prop: 'catch' },
  },
  kick: {
    kind: 'handle',
    by: ALL,
    thing: null,
    aims: ['character', 'feature', 'thing', 'side'],
    aimed: false,
    words: /\bkick(?:s|ed|ing)?\b/iu,
    ms: 1100,
    leastMs: 600,
    keyAt: 0.45,
    fallback: 'hop',
    plays: { prop: 'kick' },
    bare: 'kick',
  },
  eat: {
    kind: 'handle',
    by: ALL,
    thing: 'held',
    aims: ['thing'],
    aimed: false,
    words:
      /\b(?:eat(?:s|ing)?|ate|bit(?:e|es|ing)?(?! (?:his|her|their) lip)|munch(?:es|ed|ing)?|nibbl(?:e|es|ed|ing)|gobbl(?:e|es|ed|ing)|swallow(?:s|ed|ing)?|tast(?:e|es|ed|ing)|scoff(?:s|ed|ing)?)\b/iu,
    ms: 1600,
    leastMs: 1000,
    keyAt: 0.5,
    fallback: 'chew',
    plays: { prop: 'eat' },
    bare: 'chew',
  },
  chew: {
    kind: 'handle',
    by: ALL,
    thing: null,
    aims: ['thing', 'character'],
    aimed: false,
    words: /\b(?:chew(?:s|ed|ing)?|gnaw(?:s|ed|ing)?)\b/iu,
    ms: 1600,
    leastMs: 900,
    keyAt: 0.5,
    fallback: 'nod',
    plays: { prop: 'chew' },
    bare: 'chew',
  },
  drink: {
    kind: 'handle',
    by: ALL,
    thing: 'held',
    aims: ['thing'],
    aimed: false,
    words:
      /\b(?:dr(?:ink|inks|ank|inking)|sip(?:s|ped|ping)?|gulp(?:s|ed|ing)?|slurp(?:s|ed|ing)?|lap(?:s|ped|ping)? (?:up|at))\b/iu,
    ms: 1800,
    leastMs: 1100,
    keyAt: 0.5,
    fallback: 'nod',
    plays: { prop: 'drink' },
  },
  raise: {
    kind: 'handle',
    by: HANDS,
    thing: 'held',
    aims: ['side'],
    aimed: false,
    // A kite flown is held up high.
    words:
      /\b(?:rais(?:e|es|ed|ing)|lift(?:s|ed|ing)? (?:it |them |the \p{L}+ )?up|h(?:olds?|eld|olding) (?:it |them |the \p{L}+ )?(?:up|high|aloft)|bless(?:es|ed|ing)?|g(?:ive|ives|ave|iving) thanks|fl(?:y|ies|ew|ying)(?= (?:a|an|the|his|her|their|its|my|your|our) ))\b/iu,
    ms: 1400,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'point',
    plays: { prop: 'raise' },
  },
  break: {
    kind: 'handle',
    by: ALL,
    thing: 'held',
    aims: [],
    aimed: false,
    words:
      /\b(?:br(?:eak|eaks|oke|eaking)|snap(?:s|ped|ping)? (?:it |them |the \p{L}+ )?in (?:two|half)|t(?:ear|ears|ore|earing) (?:it |them |the \p{L}+ )?(?:in two|in half|apart))\b/iu,
    ms: 950,
    leastMs: 600,
    keyAt: 0.55,
    fallback: 'nod',
    plays: { prop: 'break' },
  },
  dip: {
    kind: 'handle',
    by: ALL,
    thing: null,
    aims: ['thing'],
    aimed: false,
    words: /\b(?:dip(?:s|ped|ping)?|dunk(?:s|ed|ing)?)\b/iu,
    ms: 1100,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'reach',
    plays: { prop: 'dip' },
  },
  open: {
    kind: 'handle',
    by: ALL,
    thing: null,
    aims: ['feature'],
    aimed: true,
    words:
      /\b(?:open(?:s|ed|ing)?|unlock(?:s|ed|ing)?|unlatch(?:es|ed|ing)?|(?:swing|swings|swung|push|pushes|pushed|pull|pulls|pulled) (?:it |the \p{L}+ )?open)\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'reach',
    plays: { move: 'point' },
  },
  close: {
    kind: 'handle',
    by: ALL,
    thing: null,
    aims: ['feature'],
    aimed: true,
    words:
      /\b(?:clos(?:e|es|ed|ing)(?! (?:to|by|behind|beside|in|up to|together|enough)\b)|shut(?:s|ting)?|lock(?:s|ed|ing)?|slam(?:s|med|ming)?|latch(?:es|ed|ing)?)\b/iu,
    ms: 1200,
    leastMs: 700,
    keyAt: 0.5,
    fallback: 'reach',
    plays: { move: 'point' },
  },
  use: {
    kind: 'handle',
    by: HANDS,
    thing: 'held',
    aims: ['thing', 'feature', 'character', 'side'],
    aimed: false,
    words:
      /\b(?:us(?:e|es|ed|ing)|(?:peer(?:s|ed|ing)?|look(?:s|ed|ing)?) through|(?:h(?:olds?|eld|olding)|rais(?:e|es|ed|ing)|lift(?:s|ed|ing)?|put(?:s)?) (?:the |a |an |his |her |their )?\p{L}+ (?:up )?to (?:his|her|their|its) (?:eyes?|mouth|ears?))\b/iu,
    ms: 1400,
    leastMs: 800,
    keyAt: 0.5,
    fallback: 'lean-in',
    plays: { move: 'lean-in' },
  },
};

/** Every doing, in the list's order. */
export const DOINGS: readonly Doing[] = DOING_IDS.map((id) => ({
  id,
  ...doings[id],
}));

const BY_ID = new Map<string, Doing>(DOINGS.map((d) => [d.id, d]));

/** A doing by its id; undefined for anything else. */
export const doingOf = (id: string | null | undefined): Doing | undefined =>
  id ? BY_ID.get(id) : undefined;

export const isDoing = (id: unknown): id is DoingId =>
  typeof id === 'string' && BY_ID.has(id);

/** The doings of one kind, by id. */
export const doingsOfKind = (kind: DoingKind): DoingId[] =>
  DOINGS.filter((d) => d.kind === kind).map((d) => d.id);

/** What an action beat may do: a move of the body, or going somewhere. */
export const ACTION_DOINGS = [
  ...doingsOfKind('body'),
  ...doingsOfKind('travel'),
] as DoingId[];
/** What a business beat may do: handle a thing. */
export const HANDLE_DOINGS = doingsOfKind('handle');

/**
 * What someone does in place of a doing they cannot: along its fallbacks
 * to the first they can, and a nod at the end, which anyone can.
 */
export function fallbackFor(id: DoingId, doer: Doer): DoingId {
  let at: Doing | undefined = BY_ID.get(id);
  for (let n = 0; at && n < 6; n += 1) {
    if (at.by.includes(doer)) return at.id;
    at = at.fallback ? BY_ID.get(at.fallback) : undefined;
  }
  return 'nod';
}

/** Whether someone of this kind can do it. */
export const canDo = (id: DoingId, doer: Doer): boolean =>
  BY_ID.get(id)?.by.includes(doer) ?? false;

/**
 * The moves a figure the artist drew shows (an animal, a creature): the
 * player moves the whole of it (a hop, a lean, a jump, a spin, a roll, a
 * shake, a buck for a kick, facing where it goes), and the parts its rig
 * turns about their joints (the head dips to lick, chew and sniff; the
 * tail wags; the body sinks on its legs to sit or lie). A move it cannot
 * show (a wave, a clap) is played as the nearest it can: toward someone,
 * a lean in; else a hop.
 */
export const BOBBING_MOVES: readonly StageMove[] = [
  'hop',
  'laugh',
  'nod',
  'sob',
  'lean-in',
  'reach',
  'hug',
  'look',
  'shake',
  ...ACTED_MOVES,
];

/** The move a drawing with no rig plays for one it cannot show. */
export function bobbingMove(move: StageMove, toward: boolean): StageMove {
  if (BOBBING_MOVES.includes(move)) return move;
  return toward ? 'lean-in' : 'hop';
}

// ── What doings are done with and toward ─────────────────────────────────

/**
 * Things a beat's words may name: those on the stage to be handled (one
 * list: the table's, what people carry, a story's staples), and the gear
 * drawn in a hand for good.
 */
export const THINGS = [...STAGE_PROPS, ...FIGURE_GEAR] as (
  StageProp | FigureGear
)[];
export type ThingId = StageProp | FigureGear;

/** Each thing by the words for it, singular or plural. */
export const THING_WORDS: Record<ThingId, RegExp> = {
  ...PROP_WORDS,
  cup: /\b(?:cups?|chalices?|goblets?|mugs?|wine|glass of water)\b/iu,
  flag: /\bflags?\b/iu,
  umbrella: /\bumbrellas?\b/iu,
  staff: /\b(?:staffs?|crooks?|walking sticks?)\b/iu,
};

/** Whether a word names one of the lists' things: a ball, a cup, a staff. */
export const isThingWord = (word: string): boolean =>
  THINGS.some((thing) => THING_WORDS[thing].test(word));

/** Whether a thing is one of the stage's own, handled and passed about apart from anyone, not gear drawn in a hand. */
export const isStageProp = (
  thing: string | null | undefined,
): thing is StageProp =>
  (STAGE_PROPS as readonly string[]).includes(thing ?? '');

/**
 * The fixed things of a set a story acts on: a gate to go out by, a bench
 * to look under, a goalpost to stand by, a bus waiting.
 */
export const FEATURE_KINDS = [
  'gate',
  'door',
  'bench',
  'chair',
  'table',
  'bed',
  'tree',
  'goalpost',
  'wall',
  'fence',
  'stall',
  'crate',
  'vehicle',
  'window',
  'steps',
  'swing',
  'well',
] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** Each feature by the words for it; the word found is its id ("danfo", "gate"). */
export const FEATURE_WORDS: Record<FeatureKind, RegExp> = {
  gate: /\b(?:gates?|gateway)\b/iu,
  door: /\b(?:doors?|doorway)\b/iu,
  // Never a seat, a stand or a goal: words said in passing ("take a
  // seat", "her mother stands", "our goal is") are no feature.
  bench: /\bbench(?:es)?\b/iu,
  chair: /\b(?:chairs?|stools?)\b/iu,
  table: /\btables?\b/iu,
  bed: /\bbeds?\b/iu,
  tree: /\b(?:trees?|mango tree|palm tree)\b/iu,
  goalpost: /\bgoal ?posts?\b/iu,
  wall: /\bwalls?\b/iu,
  fence: /\bfences?\b/iu,
  stall: /\b(?:stalls?|kiosks?)\b/iu,
  crate: /\b(?:crates?|boxes|barrels?)\b/iu,
  vehicle:
    /\b(?:danfo|buses|bus|minibus|cars?|vans?|trucks?|lorr(?:y|ies)|taxis?|carts?|boats?|canoes?|train)\b/iu,
  window: /\bwindows?\b/iu,
  steps: /\b(?:steps|stairs|staircase|ladder)\b/iu,
  swing: /\b(?:swings?|tyre swing)\b/iu,
  well: /\bwells?\b/iu,
};

/** A feature of the set as a look, a point or a throw is aimed at it: "f:gate". */
export const featureAim = (id: string) => `f:${id}`;
/** The feature an aim is at, by its id; null for someone, a side or nothing. */
export const aimedFeature = (aim: string | null | undefined): string | null =>
  aim?.startsWith('f:') ? aim.slice(2) : null;

/** The features that open and shut: a vehicle by its door. */
export const OPENING_FEATURES: readonly FeatureKind[] = [
  'gate',
  'door',
  'window',
  'vehicle',
];

/** A feature's kind: one of the list's, or one of a show's own, which the artist draws. */
export type AnyFeatureKind = FeatureKind | Drawn;

/** The words for a feature: its kind's, or, one of a show's own, its name's. */
export const featureWordsOf = (feature: {
  kind: AnyFeatureKind;
  name: string;
}): RegExp =>
  feature.kind === DRAWN ? ownWords(feature.name) : FEATURE_WORDS[feature.kind];

/**
 * The features a text names, first first: a word for one after "the", "a"
 * or "his" and at most one word more ("the open door", "a tomato crate"),
 * never a likeness ("faster than a danfo") or a verb ("the gate swings").
 * `own` are a show's own features, known by their names.
 */
export function featuresNamedIn(
  text: string,
  own: readonly OwnWord[] = [],
): { kind: AnyFeatureKind; word: string; at: number }[] {
  const found: { kind: AnyFeatureKind; word: string; at: number }[] = [];
  const all: { kind: AnyFeatureKind; words: RegExp }[] = [
    ...FEATURE_KINDS.map((kind) => ({ kind, words: FEATURE_WORDS[kind] })),
    ...own.map((one) => ({ kind: DRAWN, words: ownWords(one.name) })),
  ];
  for (const { kind, words } of all) {
    const pattern = new RegExp(
      `(?<=\\b(?:the|a|an|that|this|his|her|their|its|our|my|your)\\s+(?:[\\p{L}-]+\\s+)?)(?:${words.source})`,
      'giu',
    );
    for (const m of text.matchAll(pattern)) {
      // One of the lists' own words is theirs, never a show's.
      if (
        kind === DRAWN &&
        found.some((f) => f.at <= m.index && m.index < f.at + f.word.length)
      )
        continue;
      const before = text.slice(Math.max(0, m.index - 32), m.index);
      if (
        /\b(?:than|like|as)\s+(?:a|an|the)\s+(?:[\p{L}-]+\s+)?$/iu.test(before)
      )
        continue;
      // "the gate swings": the word between is the thing, and this its verb.
      const between = /([\p{L}-]+)\s+$/u.exec(before)?.[1] ?? '';
      if (
        !/^(?:the|a|an|that|this|his|her|their|its|our|my|your)$/iu.test(
          between,
        ) &&
        all.some((other) => other.words.test(between))
      )
        continue;
      found.push({ kind, word: m[0], at: m.index });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/** Words for open and shut, as a feature is left or goes. */
const OPEN = 'open|ajar';
const SHUT = 'shut|closed|locked';
/** How a feature is said to stand: "the gate is open a crack". */
const STANDS =
  'is|was|are|were|stands?|stood|lies|lay|hangs?|hung|remains?|stays?|stayed|sits?|sat|left';
/** How a feature is said to go: "the gate swings shut". */
const GOES =
  'swings?|swung|slams?|slammed|bangs?|banged|clicks?|clicked|creaks?|creaked|falls?|fell|blows?|blew|snaps?|snapped|slides?|slid|rolls?|rolled|clangs?|clanged|thuds?|thudded|flies|flew|springs?|sprang|(?:is|was|gets?|got) (?:pushed|pulled|kicked|slammed|swung)';
/** What someone does to a feature: "Mama shuts the gate". */
const DOES_OPEN =
  'opens?|opened|opening|unlocks?|unlocked|unlatch(?:es|ed)?|(?:swings?|swung|push(?:es|ed)?|pull(?:s|ed)?|throws?|threw|flings?|flung|kicks?|kicked) open';
const DOES_SHUT =
  'shuts?|shutting|closes?|closed|closing|slams?|slammed|locks?|locked|latch(?:es|ed)?|bolts?|bolted|(?:swings?|swung|push(?:es|ed)?|pull(?:s|ed)?|kicks?|kicked|bangs?|banged) (?:it )?shut';

/**
 * What a text says of a feature's being open or shut, first first: a
 * change ("the gate swings shut", "Mama shuts the gate", "the door
 * opens") at the words that say it, or how it stands ("the gate is open
 * a crack", "the open door"), which is how the scene finds it.
 */
export function featureStatesIn(
  text: string,
  /** A show's own features, known by their names. */
  own: readonly OwnWord[] = [],
): {
  kind: AnyFeatureKind;
  word: string;
  state: 'open' | 'shut';
  /** How it stands, not a change. */
  still: boolean;
  /** Where in the text the words that say it are. */
  at: number;
}[] {
  const found: ReturnType<typeof featureStatesIn> = [];
  for (const named of featuresNamedIn(text, own)) {
    const before = text.slice(0, named.at);
    const after = text.slice(named.at + named.word.length);
    const stateOf = (w: string): 'open' | 'shut' =>
      new RegExp(`^(?:${OPEN})$`, 'iu').test(w) ? 'open' : 'shut';
    // "the open door": how it stands, said before it.
    const adjective = new RegExp(`\\b(${OPEN}|${SHUT}|opened)\\s+$`, 'iu').exec(
      before,
    );
    // "Mama shuts the gate": what someone does to it.
    const done = new RegExp(
      `\\b(${DOES_OPEN}|${DOES_SHUT})\\s+(?:the|a|an|his|her|their|its|our|my|your)\\s+(?:[\\p{L}-]+\\s+)?$`,
      'iu',
    ).exec(before);
    // "the gate is open", "the gate swings shut", "the door opens".
    const stands = new RegExp(
      `^\\s+(?:${STANDS})\\s+(?:wide\\s+|half\\s+|still\\s+|now\\s+)?(${OPEN}|${SHUT})\\b`,
      'iu',
    ).exec(after);
    const goes = new RegExp(
      `^\\s+(?:(?:${GOES})\\s+(?:\\p{L}+\\s+)?(${OPEN}|${SHUT})\\b|(opens?|opened|shuts?|closes?|closed|slams?|slammed)\\b)`,
      'iu',
    ).exec(after);
    const base = named.at + named.word.length;
    if (goes) {
      const w = goes[1] ?? goes[2];
      found.push({
        kind: named.kind,
        word: named.word,
        state: /^(?:opens?|opened)$/iu.test(w) ? 'open' : stateOf(w),
        still: false,
        at: base + goes.index + goes[0].length - w.length,
      });
    } else if (stands)
      found.push({
        kind: named.kind,
        word: named.word,
        state: stateOf(stands[1]),
        still: true,
        at: named.at,
      });
    else if (done)
      found.push({
        kind: named.kind,
        word: named.word,
        state: new RegExp(`^(?:${DOES_OPEN})$`, 'iu').test(done[1])
          ? 'open'
          : 'shut',
        still: false,
        at: done.index,
      });
    else if (adjective)
      found.push({
        kind: named.kind,
        word: named.word,
        state: /^opened$/iu.test(adjective[1]) ? 'open' : stateOf(adjective[1]),
        still: true,
        at: named.at,
      });
  }
  return found;
}

/** The kind of feature a word names, or null for none. */
export const featureKindOf = (word: string): FeatureKind | null =>
  FEATURE_KINDS.find((kind) => FEATURE_WORDS[kind].test(word)) ?? null;

/** Whether a word is one of the lists' things or features: never one of a show's own. */
const listed = (word: string) =>
  featureKindOf(word) !== null || isThingWord(word);

/** Where someone may be found by a feature, or something set: "by the", "against a". */
const PLACING =
  '(?:next to|by|beside|near|under|underneath|beneath|behind|against|in front of|on top of|at the foot of)';
/** Where a thing comes to rest in or on one: "stuck in the", "lands on a". */
const LODGED =
  '(?:stuck|caught|tangled|lodged|hangs?|hanging|hung|lands?|landed|landing|perched|high up|up) (?:in|on|on top of)';
/** Verbs that set something big somewhere, and so make it a feature: "leans her bicycle against". */
const STANDS_UP =
  '(?:lean(?:s|ed|t|ing)?|park(?:s|ed|ing)?|prop(?:s|ped|ping)?|chain(?:s|ed|ing)?)';
/** Ways of going to or into one, or being at it: "runs to the", "climbs into a", "sits on the". */
const GOES_TO = `(?:${[
  'walk(?:s|ed|ing)?',
  'r[au]n(?:s|ning)?',
  'go(?:es|ing)?',
  'went',
  'head(?:s|ed|ing)?',
  'hurr(?:y|ies|ied|ying)',
  'rush(?:es|ed|ing)?',
  'dash(?:es|ed|ing)?',
  'rac(?:e|es|ed|ing)',
  'dart(?:s|ed|ing)?',
  'step(?:s|ped|ping)?',
  'jump(?:s|ed|ing)?',
  'leap(?:s|t|ed|ing)?',
  'hop(?:s|ped|ping)?',
  'climb(?:s|ed|ing)?',
  'clamber(?:s|ed|ing)?',
  'scrambl(?:e|es|ed|ing)',
  'crawl(?:s|ed|ing)?',
  'creep(?:s|ing)?',
  'crept',
  'sneak(?:s|ing)?',
  'squeez(?:e|es|ed|ing)',
  'slip(?:s|ped|ping)?',
  'wriggl(?:e|es|ed|ing)',
  'duck(?:s|ed|ing)?',
  'hid(?:e|es|ing)?',
  'sit(?:s|ting)?',
  'sat',
  'st(?:and|ands|ood|anding)',
  'li(?:e|es|ying)',
  'lay',
  'perch(?:es|ed|ing)?',
  'kneel(?:s|ing)?',
  'knelt',
  'shelter(?:s|ed|ing)?',
  'wait(?:s|ed|ing)?',
  'paddl(?:e|es|ed|ing)',
  'get(?:s|ting)?',
  'got',
].join(
  '|',
)})(?:\\s+\\p{L}+ly)?(?:\\s+(?:back|over|up|down|out|off|away|in))?\\s+(?:to|into|onto|through|under|out of|up|over|across|toward|towards|round|around|past|behind|beside|by|near|next to|on|in|inside|against|up to|over to|across to|down to|in through|out through)`;
/** Someone opening or shutting something: "opens the", "slams his"; never how it stands ("open a crack"). */
const OPENS_SHUTS =
  '(?:opens|opened|opening|unlocks|unlocked|shuts|shutting|closes|closed|closing|slams|slammed|locks|locked|(?:swings?|swung|push(?:es|ed)?|pull(?:s|ed)?|throws?|threw|flings?|flung|kicks?|kicked) open)(?=\\s+(?:the|his|her|their|its|my|your|our|that|this)\\s)';

/**
 * The features a text names that no list has, first first, each where
 * the words say plainly it is one: someone found or something set by it
 * ("by the signpost", "against the shed"), a thing lodged in it ("stuck
 * in the baobab"), something big set there ("leans her bicycle against"),
 * someone going to, into or under it, or sitting on it ("runs to the
 * signpost", "sits on the log"), or it opened or shut ("opens the
 * cupboard"). Never one of the lists' own words, nor `known` (a show's
 * own features and things, and its people's names), nor a word for the
 * body, people, a place or the weather.
 */
export function newFeaturesIn(
  text: string,
  known: readonly string[] = [],
  /** Only where someone or something is found by it or on it ("by the signpost"): what a line says is there. */
  placedOnly = false,
): { word: string; at: number }[] {
  const found: { word: string; at: number }[] = [];
  const add = (from: number) => {
    const noun = nounAt(text.slice(from));
    if (!noun) return;
    const word = ownIdOf(noun.word);
    if (
      !word ||
      !mayBeFeature(noun.word) ||
      listed(noun.word) ||
      known.some((k) => ownIdOf(k) === word || k.toLowerCase() === noun.word) ||
      found.some((f) => f.word === word)
    )
      return;
    found.push({ word, at: from + noun.at });
  };
  for (const phrase of placedOnly
    ? [PLACING, LODGED]
    : [PLACING, LODGED, GOES_TO, OPENS_SHUTS])
    for (const m of text.matchAll(new RegExp(`\\b${phrase}\\s*`, 'giu')))
      add(m.index + m[0].length);
  // "leans her bicycle against the wall": the bicycle, set by the wall.
  if (!placedOnly)
    for (const m of text.matchAll(
      new RegExp(
        `\\b${STANDS_UP}\\s+(?=${OWN_DETERMINER}\\s+(?:[\\p{L}-]+\\s+){1,3}?${PLACING}\\b)`,
        'giu',
      ),
    ))
      add(m.index + m[0].length);
  return found.sort((a, b) => a.at - b.at);
}

/**
 * A thing no list has, handled in the words that follow a verb of
 * handling: the first named ("his kite", "a drum") that is no place it
 * goes to ("to the gate"), none of the lists' own words, nor `known`, nor
 * a word for the body or for people. Null for none.
 */
export function newThingIn(
  after: string,
  known: readonly string[] = [],
): { word: string; at: number } | null {
  for (const m of after.matchAll(
    new RegExp(`(?:^|\\s)(?=${OWN_DETERMINER}\\s)`, 'gu'),
  )) {
    const from = m.index + m[0].length;
    // Where it goes, not what it is: "to the gate", "at Maya's feet".
    if (
      /\b(?:to|at|toward|towards|into|onto|under|over|through|against|by|beside|behind|near|on|in|inside|from|off|of|for|with|after|past|across|round|around)\s*$/iu.test(
        after.slice(0, from),
      )
    )
      continue;
    const noun = nounAt(after.slice(from));
    if (!noun) continue;
    const word = ownIdOf(noun.word);
    if (
      !word ||
      listed(noun.word) ||
      known.some((k) => ownIdOf(k) === word || k.toLowerCase() === noun.word)
    )
      return null;
    return { word, at: from + noun.at };
  }
  return null;
}

/** The id a feature is known by: the word the words use for it, singular. */
export function featureIdOf(word: string): string {
  const w = word.toLowerCase().trim().replace(/\s+/g, '-');
  if (/^(?:buses|bus|minibus)$/.test(w)) return 'bus';
  if (/^goal-?posts?$|^goals?$/.test(w)) return 'goalpost';
  if (/^(?:steps|stairs|staircase)$/.test(w)) return 'steps';
  if (/^(?:mango-tree|palm-tree)$/.test(w)) return 'tree';
  if (w === 'tyre-swing') return 'swing';
  if (w === 'gateway') return 'gate';
  if (w === 'doorway') return 'door';
  if (w === 'lorries') return 'lorry';
  if (/(?:ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}
