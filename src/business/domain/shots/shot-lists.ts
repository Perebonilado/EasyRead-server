/**
 * The shots engine's closed lists (explainer-animation-plan §5.2;
 * research §3.2's closed verb list): every set, chart, recipe, camera
 * move, join and life effect the board may name, each with when it is
 * used, for the board's prompt and for the checks that hold a plan to
 * them. A mini model misuses a big list, so these stay small; and a word
 * a model gives that is not on a list is read as the nearest one that is
 * (a synonym, a slip of spelling), or as nothing.
 *
 * Each list is a record of its values first, so the compiler holds it to
 * the contract's union: a value added there and not here fails the build.
 */
import type {
  ShotCameraMove,
  ShotInfoRecipe,
  ShotJoin,
  ShotLifeEffect,
} from '../../../contracts';
import type { PlanSet, PlanSetScene } from './types';

/** The information layer's recipes, each with when the board uses it. */
export const RECIPE_USES: Record<ShotInfoRecipe, string> = {
  draw: 'a line drawing itself: a route between two places on the map (target the first, to the second), or a chart’s line or arrow',
  label:
    'a name of one to three words pinned to what it names, with a leader to its edge; never on its own',
  pin: 'a pin landing on a place on the map: only a place marked [pin]',
  fill: 'a region of the map filling with its colour, or a group of seats',
  seam: 'the border between two regions drawing itself: a seam from the list',
  count:
    'a number rolling up on a counter: target the number from the list (code writes its value)',
  grow: 'a bar, a line or a unit chart growing to its value',
  transfer:
    'tokens travelling from one part to another (target, to): only where something really moves',
  morph:
    'a part turning into its next look: a calendar’s next date, a counter’s later number',
  run: 'a machine starting (machines only; there are none yet)',
  strike:
    'the old words struck out and the new written in their place (a strike chart)',
  stamp: 'a stamp landing on a document',
  flow: 'a wave travelling along a cause to its effect: a flow’s steps, a transfer’s path, a route',
  spotlight: 'everything else dims, so one part is named',
  mark: 'a ring or an underline on a part, for a moment',
  enter: 'a part comes on',
  exit: 'a part leaves',
  ask: 'a question the voice asks, held over what is still open, then a moment of quiet',
};
export const INFO_RECIPES = Object.keys(RECIPE_USES) as ShotInfoRecipe[];

/** The camera's moves, each with when the board uses it. */
export const MOVE_USES: Record<ShotCameraMove, string> = {
  establish: 'the opening framing of a set: the whole map, the whole chart',
  travel: 'the camera glides across the same set to a new subject',
  push: 'move in on what the voice names (amount small, medium or large)',
  pull: 'move back to show the whole',
  follow: 'ride along with what moves: a route’s head, a growing line',
  'cut-to': 'a new framing of the same set, at once',
  'zoom-through':
    'dive into a pin or a part and come out in the next shot’s set',
  return: 'back to the framing before a window (a portrait, a photo)',
  hold: 'stay still while it sinks in',
};
export const CAMERA_MOVES = Object.keys(MOVE_USES) as ShotCameraMove[];

/** How a shot hands over to the next, each with when the board uses it. */
export const JOIN_USES: Record<ShotJoin, string> = {
  continue: 'the same set carries on into the next shot',
  cut: 'a cut to a shot of something else',
  match: 'a cut between two shapes that line up',
  morph: 'the same thing changes into its next shape',
  'zoom-through': 'into a pin or a part, and out in the next shot’s set',
  dissolve: 'time passes',
  dip: 'a dip to black after a grave fact, or at an act’s end',
  push: 'the next item of a list pushes in',
};
export const SHOT_JOINS = Object.keys(JOIN_USES) as ShotJoin[];

/** The life layer's effects: motion that carries no information, only what the place really has. */
export const LIFE_USES: Record<ShotLifeEffect, string> = {
  clouds: 'clouds drifting across a sky',
  'cloud-shadows': 'cloud shadows crossing the land of a map',
  rain: 'rain',
  snow: 'snow',
  wind: 'wind in grass, trees or cloth',
  smoke: 'smoke from a chimney, a fire, an engine',
  steam: 'steam from a kettle, a vent, an engine',
  dust: 'dust in a shaft of light',
  shimmer: 'light on water',
  flicker: 'lights flickering',
  crowd: 'a crowd shifting (silhouettes; none yet)',
  flags: 'flags stirring',
  grain: 'paper grain on a document',
  drift: 'a slow drift of the whole picture',
  fire: 'a real fire the voice speaks of',
  sparks: 'real sparks: welding, a furnace, a spark plug',
  splash: 'a real splash of water',
};
export const LIFE_EFFECTS = Object.keys(LIFE_USES) as ShotLifeEffect[];

/** The set kinds, as the board names them. */
export type SetKind = PlanSet['kind'];
export const SET_USES: Record<SetKind, string> = {
  map: 'the show’s own map, its regions, seams and places (only when the scene names places or regions)',
  chart:
    'a chart, a timeline, a counter, a quote or another kind below, drawn full frame',
  portrait:
    'a real person’s verified portrait: only a person marked [portrait]',
  photo: 'an archive photo: only a photo the list gives',
  document: 'a scan of a real document: only a document the list gives',
  set: 'a code-drawn kind of place (a coast at dusk, a city at night), never a named one: for a feeling or an atmosphere',
  plain: 'paper',
};
export const SET_KINDS = Object.keys(SET_USES) as SetKind[];

/**
 * The code kinds a chart set draws full frame (shot-charts), each with
 * when the board uses it. A name card is not one: a person is shown by a
 * verified portrait or a trace of them, never by a card of their name.
 */
export const CHART_USES = {
  counter: 'one number',
  icons: 'a count a viewer can picture, with its whole',
  calendar: 'a date or two',
  seats: 'a vote, an assembly, a parliament',
  strike: 'a decision or a promise changed',
  transfer: 'something moving from one to another: money, papers, people',
  document: 'an official paper or a newspaper, with what it said',
  split: 'a comparison of two sides',
  chart: 'three or more numbers compared: bars, or a line over time',
  plot: 'a curve from a formula',
  timeline: 'several dates in order',
  flow: 'a cause and its effect, a process, a cycle',
  quote: 'someone’s exact words, with who said them and when',
} as const;
export type ChartKind = keyof typeof CHART_USES;
export const CHART_KINDS = Object.keys(CHART_USES) as ChartKind[];

/**
 * Whether code can draw a set (WP10's kit/sets; shot-build's drawSet): it
 * can, so a drawn set is offered to the board. Turned off, a drawn set is
 * not offered, and a plan's drawn set is dropped for a picture that can be
 * drawn (the build would only fall back to the shot before, holding while
 * the voice talks on).
 */
export const DRAWN_SETS = true;

/** A code-drawn set's settings (kit/sets), as the board names them. */
export const SET_LANDS: readonly PlanSetScene['land'][] = [
  'plain',
  'hills',
  'mountains',
  'coast',
  'desert',
  'forest',
  'city',
  'sea',
];
export const SET_TIMES: readonly PlanSetScene['time'][] = [
  'day',
  'dusk',
  'night',
  'dawn',
];
export const SET_WEATHERS: readonly NonNullable<PlanSetScene['weather']>[] = [
  'clear',
  'cloud',
  'rain',
  'snow',
  'storm',
  'haze',
];
export const SET_TOWNS: readonly NonNullable<PlanSetScene['town']>[] = [
  'none',
  'village',
  'town',
  'city',
];
/** What a drawn set's place is for, with when the board names it. */
export const SET_PLACE_USES: Record<NonNullable<PlanSetScene['place']>, string> = {
  open: 'open land, a village or a town as its town says',
  farm: 'a farm: barn, silo, fields',
  port: 'a port across the water: cranes, warehouses, containers',
  industry: 'a works and its terraces, chimneys smoking',
  market: 'market stalls before houses',
  city: 'a city of towers and blocks',
  oilfield: 'an oil field: pump jacks and tanks',
  'assembly-hall': 'inside an assembly or parliament: rows round the well, the chair on its dais',
  'ceremony-ground': 'a ceremony ground: a stand with bunting, a flagpole, floodlights, chairs',
  display: 'a clean studio backdrop for a machine or a thing shown on its own, big (a jet engine cut open, a pump, a ballot)',
};
export const SET_PLACES = Object.keys(SET_PLACE_USES) as NonNullable<PlanSetScene['place']>[];
/** The states a drawn set's light can change to while a shot is on. */
export const SET_STATES: readonly NonNullable<PlanSetScene['becomes']>['state'][] = [
  'day',
  'dusk',
  'night',
  'dawn',
  'lights-on',
];
export const SET_CLIMATES: readonly NonNullable<PlanSetScene['climate']>[] = [
  'temperate',
  'arid',
  'tropical',
  'cold',
];

/** A push's or a pull's size. */
export const AMOUNTS = ['small', 'medium', 'large'] as const;

/** The colour roles every look has; a side's name is a colour too. */
export const COLOUR_ROLES = ['ink', 'muted', 'accent', 'held'] as const;

// ── The nearest value a word means ────────────────────────────────────────

/** A word as the lists compare it: lower case, letters and digits only. */
const squash = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/gu, '');

/** How many letters two words differ by (Levenshtein), for a slip of spelling. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1)
      next.push(
        Math.min(
          row[j] + 1,
          next[j - 1] + 1,
          row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    row = next;
  }
  return row[b.length];
}

/**
 * The value of a closed list a word means: the value itself, a synonym
 * the list gives for it (null for a word that means nothing allowed, so
 * "glow" is never read as "flow"), a value it begins or that begins it,
 * or one a slip of spelling away; null for none.
 */
export function nearestOf<T extends string>(
  list: readonly T[],
  synonyms: Readonly<Record<string, T | null>> = {},
): (raw: unknown) => T | null {
  const byKey = new Map(list.map((value) => [squash(value), value]));
  return (raw) => {
    if (typeof raw !== 'string') return null;
    const key = squash(raw);
    if (!key) return null;
    const exact = byKey.get(key);
    if (exact) return exact;
    if (Object.prototype.hasOwnProperty.call(synonyms, key))
      return synonyms[key];
    for (const [k, value] of byKey)
      if (
        Math.min(k.length, key.length) >= 4 &&
        (key.startsWith(k) || k.startsWith(key))
      )
        return value;
    let best: T | null = null;
    let least = Infinity;
    for (const [k, value] of byKey) {
      const d = distance(key, k);
      if (d < least && d <= Math.max(1, Math.floor(k.length / 4))) {
        best = value;
        least = d;
      }
    }
    return best;
  };
}

/** A recipe a model named: its own, a synonym, or the nearest; null for none (glows and sparkles are none). */
export const recipeOf = nearestOf(INFO_RECIPES, {
  highlight: 'mark',
  circle: 'mark',
  underline: 'mark',
  ring: 'mark',
  point: 'mark',
  pointat: 'mark',
  emphasise: 'mark',
  emphasize: 'mark',
  show: 'enter',
  appear: 'enter',
  reveal: 'enter',
  add: 'enter',
  bringin: 'enter',
  hide: 'exit',
  remove: 'exit',
  disappear: 'exit',
  leave: 'exit',
  write: 'label',
  caption: 'label',
  name: 'label',
  tag: 'label',
  text: 'label',
  drop: 'pin',
  marker: 'pin',
  dropin: 'pin',
  colour: 'fill',
  color: 'fill',
  shade: 'fill',
  tint: 'fill',
  border: 'seam',
  line: 'draw',
  route: 'draw',
  path: 'draw',
  trace: 'draw',
  sketch: 'draw',
  tally: 'count',
  counter: 'count',
  rollup: 'count',
  number: 'count',
  tick: 'count',
  rise: 'grow',
  extend: 'grow',
  bar: 'grow',
  scale: 'grow',
  move: 'transfer',
  send: 'transfer',
  carry: 'transfer',
  change: 'morph',
  become: 'morph',
  turn: 'morph',
  flip: 'morph',
  start: 'run',
  running: 'run',
  cross: 'strike',
  crossout: 'strike',
  replace: 'strike',
  seal: 'stamp',
  wave: 'flow',
  pulse: 'flow',
  focus: 'spotlight',
  dim: 'spotlight',
  question: 'ask',
  glow: null,
  sparkle: null,
  sparkles: null,
  burst: null,
  confetti: null,
  shake: null,
  bounce: null,
});

/** A camera move a model named, or the nearest. */
export const moveOf = nearestOf(CAMERA_MOVES, {
  zoom: 'push',
  zoomin: 'push',
  closeup: 'push',
  close: 'push',
  dolly: 'push',
  dollyin: 'push',
  in: 'push',
  zoomout: 'pull',
  wide: 'pull',
  widen: 'pull',
  pullback: 'pull',
  out: 'pull',
  pan: 'travel',
  glide: 'travel',
  fly: 'travel',
  flight: 'travel',
  track: 'follow',
  cut: 'cut-to',
  jump: 'cut-to',
  dive: 'zoom-through',
  back: 'return',
  still: 'hold',
  static: 'hold',
  stay: 'hold',
  open: 'establish',
  wideshot: 'establish',
  orbit: null,
  roll: null,
  shake: null,
});

/** A join a model named, or the nearest. */
export const joinOf = nearestOf(SHOT_JOINS, {
  hardcut: 'cut',
  straightcut: 'cut',
  fade: 'dissolve',
  crossfade: 'dissolve',
  mix: 'dissolve',
  fadetoblack: 'dip',
  black: 'dip',
  diptoblack: 'dip',
  slide: 'push',
  matchcut: 'match',
  zoom: 'zoom-through',
  same: 'continue',
  hold: 'continue',
  wipe: 'cut',
  iris: 'cut',
});

/** A life effect a model named, or the nearest; decoration is none. */
export const lifeOf = nearestOf(LIFE_EFFECTS, {
  cloud: 'clouds',
  shadow: 'cloud-shadows',
  shadows: 'cloud-shadows',
  breeze: 'wind',
  flag: 'flags',
  water: 'shimmer',
  ripple: 'shimmer',
  ripples: 'shimmer',
  paper: 'grain',
  texture: 'grain',
  light: 'flicker',
  lights: 'flicker',
  camera: 'drift',
  flame: 'fire',
  flames: 'fire',
  glow: null,
  sparkle: null,
  sparkles: null,
  particles: null,
  confetti: null,
  bokeh: null,
});

/** A set kind a model named, or the nearest; a chart kind named as a set is a chart. */
export const setKindOf = nearestOf(SET_KINDS, {
  atlas: 'map',
  globe: 'map',
  graph: 'chart',
  infographic: 'chart',
  diagram: 'chart',
  picture: 'photo',
  image: 'photo',
  archive: 'photo',
  scene: 'set',
  illustration: 'set',
  landscape: 'set',
  backdrop: 'set',
  paper: 'plain',
  blank: 'plain',
});

/** A chart kind a model named, or the nearest; a name card is none. */
export const chartKindOf = nearestOf(CHART_KINDS, {
  bar: 'chart',
  bars: 'chart',
  barchart: 'chart',
  line: 'chart',
  linechart: 'chart',
  graph: 'chart',
  unitchart: 'icons',
  isotype: 'icons',
  parliament: 'seats',
  chamber: 'seats',
  hemicycle: 'seats',
  comparison: 'split',
  versus: 'split',
  process: 'flow',
  cycle: 'flow',
  steps: 'flow',
  date: 'calendar',
  dates: 'timeline',
  number: 'counter',
  stat: 'counter',
  newspaper: 'document',
  paper: 'document',
  words: null,
  namecard: null,
  card: null,
  keyword: null,
  title: null,
});
