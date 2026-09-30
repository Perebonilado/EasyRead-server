/**
 * The market close-up (the clear-view rule): a Lagos market road in the
 * West African town pack, with a white plastic chair, a basket, a fruit
 * cart and a blue water drum before the camera, as the painter asked for
 * them across the middle of its foot; a boy who speaks and a dog beside
 * him at the left of the floor; a close shot on the boy that pushes in
 * as he speaks, and a two shot on him and the dog. Built by code, no
 * model asked: the input the clear-view check is given for it, and the
 * set it stands in.
 */
import {
  buildSet,
  floorOf,
  layoutOf,
  type BuiltSet,
} from '../../scene-set-layout';
import { floorAt } from '../../scene-layout';
import type { StoryPlace } from '../../scene-story';
import type { ClearInput } from '../../scene-faces-seen';
import type { SceneEffectDto } from '../../../../contracts';
import { roomOf } from '../../scene-film';

export const MARKET_ROAD: StoryPlace = {
  id: 'market',
  name: 'The Market Road',
  aliases: [],
  look: 'a busy open-air market beside a Lagos road',
  firstPage: 1,
  sound: null,
  kind: 'outdoor',
  stand: 'on',
  front: null,
  features: [],
};

/** The painter's market: the chair, basket, cart and drum before the camera, across the middle. */
export const MARKET_CLOSE = {
  sky: 'day',
  weather: 'clear',
  ground: 'road',
  backdrop: 'city',
  style: 'west-african-town',
  items: [
    { kind: 'stall', x: 0.6, row: 'middle', scale: 1 },
    { kind: 'plastic chair', x: 0.18, row: 'foreground', scale: 1 },
    { kind: 'basket', x: 0.3, row: 'foreground', scale: 1 },
    { kind: 'cart', x: 0.42, row: 'foreground', scale: 1 },
    { kind: 'water drum', x: 0.7, row: 'foreground', scale: 1 },
  ],
  own: [],
  focal: { x: 0.5, feature: null, words: 'in front of the stall' },
  clutter: ['plastic chair', 'water drum', 'baskets'],
};

export const LAGOS = {
  era: 'today',
  region: 'Lagos, Nigeria',
  culture: 'Yoruba',
  landscape: '',
  homes: '',
};

/** The market set, as the stage builds it now. */
export function marketSet(): BuiltSet {
  return buildSet(layoutOf(MARKET_CLOSE, MARKET_ROAD, LAGOS), MARKET_ROAD);
}

const FLOOR = { floor: 844, eye: floorOf('outdoor').eye, bottom: 888 };
const UNIT = 1.9;

/** Someone standing at `middle` across, `d` back, `units` tall and `aspect` wide. */
const standing = (middle: number, d: number, units: number, aspect: number) => {
  const { feet, k } = floorAt(d, FLOOR.floor, FLOOR.eye, FLOOR.bottom);
  const h = units * UNIT * k;
  const w = h * aspect;
  return { x: middle - w / 2, y: feet - h, w, h, d };
};

/**
 * The clear-view check's input for the market: the boy (Kofi) at the
 * left, the dog (Bingo) beside him; Kofi speaks from 1000 to 3200 ms in a
 * close shot that pushes, and pats Bingo in a two shot from 3600 to
 * 5200. `fore`: the things before the camera (as the set places them, or
 * as given).
 */
export function marketInput(
  set: BuiltSet = marketSet(),
  fore: ClearInput['fore'] = marketFore(set),
): ClearInput {
  const shots: SceneEffectDto[] = [
    {
      atMs: 1000,
      untilMs: 3200,
      target: 'kofi',
      part: null,
      do: 'zoom',
      pan: 'push',
    },
    {
      atMs: 3600,
      untilMs: 5200,
      target: 'kofi',
      part: 'bingo',
      do: 'zoom',
    },
  ];
  return {
    W: 1600,
    H: 900,
    steps: [{ atMs: 0, show: ['kofi', 'bingo'] }],
    places: [
      {
        kofi: standing(230, 0.5, 208, 160 / 208),
        bingo: standing(480, 0.56, 120, 369.5 / 484.5),
      },
    ],
    lines: [{ who: 'kofi', startMs: 1000, endMs: 3200 }],
    acts: [{ who: 'kofi', toward: 'bingo', startMs: 3600, endMs: 5200 }],
    shots,
    features: [],
    fore,
    foreDepth:
      set.layered.layers.find((layer) => layer.id === 'foreground')?.depth ??
      1.2,
    floor: [floorOf('outdoor').back, floorOf('outdoor').front],
    open: () => true,
    hiding: () => false,
    atDepth: (place, d) => {
      const was = floorAt(place.d ?? 0.5, FLOOR.floor, FLOOR.eye, FLOOR.bottom);
      const now = floorAt(d, FLOOR.floor, FLOOR.eye, FLOOR.bottom);
      const k = now.k / was.k;
      const w = place.w * k;
      const h = place.h * k;
      return { x: place.x + place.w / 2 - w / 2, y: now.feet - h, w, h, d };
    },
    name: (id) => ({ kofi: 'Kofi', bingo: 'Bingo' })[id] ?? id,
    durationMs: 6000,
    // The camera pans across the set past the frame, as the player does.
    room: roomOf(
      {
        setWidth: set.layered.width,
        ...(set.layered.focal !== undefined
          ? { focal: set.layered.focal }
          : {}),
      },
      1600,
      900,
    ),
    keep: (id) => id.startsWith('fg-au'),
    animal: (id) => id === 'bingo',
    small: (id) => id === 'bingo',
    face: (id) => id === 'kofi',
  };
}

/** A set's things before the camera, on the stage (the set is the stage's size), the people watching among them. */
export function marketFore(set: BuiltSet): ClearInput['fore'] {
  return set.layered.fore.map(({ id, box }) => ({
    id,
    box: { x: box[0], y: box[1], w: box[2], h: box[3] },
  }));
}
