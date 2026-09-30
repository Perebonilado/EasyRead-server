/**
 * The set bench (studio-scenery-plan L3): thirteen places across every
 * style pack, each laid out by hand as a painter would, with no model
 * asked, and the story's world each would be in. Built by code
 * (buildSet), they are what the style packs, the buildings, the clutter,
 * the ground, the landmarks, the real sizes and the crowds before the
 * camera are looked at by (scripts/set-bench.ts, a contact sheet and a
 * judge), and what their tests are run on.
 */
import type { StoryPlace, StoryWorld } from './scene-story';

export interface BenchPlace {
  id: string;
  /** What it is, for the judge. */
  brief: string;
  place: StoryPlace;
  world: StoryWorld | null;
  /** The layout as the painter would write it. */
  layout: Record<string, unknown>;
}

const where = (
  id: string,
  name: string,
  look: string,
  kind: 'outdoor' | 'indoor' = 'outdoor',
): StoryPlace => ({
  id,
  name,
  aliases: [],
  look,
  firstPage: 1,
  sound: null,
  kind,
  stand: 'on',
  front: null,
  features: [],
});

const LAGOS: StoryWorld = {
  era: 'today',
  region: 'Lagos, Nigeria',
  culture: 'Yoruba families',
  landscape: 'busy streets and markets',
  homes: 'painted block houses with zinc roofs',
};
const NEW_YORK: StoryWorld = {
  era: 'today',
  region: 'New York',
  culture: 'city families',
  landscape: 'streets of brownstones and towers',
  homes: 'apartments and brownstones',
};
const MOSES: StoryWorld = {
  era: 'about 1400 BC',
  region: 'Egypt, by the Nile',
  culture: 'Hebrew slaves and Egyptians',
  landscape: 'the river, reeds, palms and desert',
  homes: 'mud-brick houses',
};
const GALILEE: StoryWorld = {
  era: 'first century AD',
  region: 'Galilee',
  culture: 'Jewish villagers and fishermen',
  landscape: 'dry hills, olive trees and a large lake',
  homes: 'flat-roofed stone houses',
};
const FARM: StoryWorld = {
  era: 'today',
  region: 'the countryside',
  culture: 'a farming family',
  landscape: 'fields and a farm',
  homes: 'a farmhouse and a barn',
};

export const SET_BENCH: readonly BenchPlace[] = [
  {
    id: 'lagos-market',
    brief:
      'a busy open-air street market in Lagos today: umbrella stalls, kiosks, zinc-roofed houses, poles and wires, a danfo parked',
    place: where(
      'lagos-market',
      'The Market Road',
      'a busy open-air market beside a Lagos road',
    ),
    world: LAGOS,
    layout: {
      sky: 'day',
      weather: 'clear',
      ground: 'road',
      backdrop: 'city',
      items: [
        {
          kind: 'zinc roof house',
          x: 0.1,
          row: 'back',
          scale: 1,
          colour: null,
        },
        { kind: 'tenement', x: 0.34, row: 'back', scale: 1, colour: null },
        { kind: 'shop', x: 0.62, row: 'back', scale: 1, colour: null },
        {
          kind: 'zinc roof house',
          x: 0.88,
          row: 'back',
          scale: 1,
          colour: 'teal',
        },
        { kind: 'danfo', x: 0.72, row: 'back', scale: 1, colour: null },
        { kind: 'kiosk', x: 0.2, row: 'back', scale: 1, colour: null },
        {
          kind: 'umbrella stall',
          x: 0.3,
          row: 'middle',
          scale: 1,
          colour: null,
        },
        { kind: 'stall', x: 0.78, row: 'middle', scale: 1, colour: 'yellow' },
        { kind: 'palm', x: 0.03, row: 'front', scale: 1, colour: null },
      ],
      own: [],
      focal: { x: 0.52, feature: null, words: 'in front of the tomato stall' },
      clutter: [
        'poles',
        'plastic chair',
        'water drum',
        'generator',
        'basket',
        'okada',
      ],
    },
  },
  {
    id: 'lagos-street',
    brief:
      'a residential street in Lagos: a compound wall and gate, a mosque, zinc-roofed houses, a generator, washing on a line',
    place: where(
      'lagos-street',
      'Adeola Street',
      'a quiet residential street in Surulere',
    ),
    world: LAGOS,
    layout: {
      ground: 'red earth',
      backdrop: 'village',
      items: [
        { kind: 'compound', x: 0.18, row: 'back', scale: 1, colour: null },
        { kind: 'mosque', x: 0.58, row: 'back', scale: 1, colour: null },
        {
          kind: 'zinc roof house',
          x: 0.87,
          row: 'back',
          scale: 1,
          colour: 'pink',
        },
        {
          kind: 'gutter bridge',
          x: 0.4,
          row: 'middle',
          scale: 1,
          colour: null,
        },
        { kind: 'palm', x: 0.96, row: 'front', scale: 1, colour: null },
      ],
      own: [],
      focal: { x: 0.45, words: 'by the gutter bridge' },
      clutter: [
        'laundry line',
        'generator',
        'poles',
        'water drum',
        'plastic chair',
      ],
    },
  },
  {
    id: 'new-york-street',
    brief:
      'a New York street today: brownstones with stoops, a shop with an awning, a skyline beyond, a hydrant, a streetlamp, a taxi, a hot-dog cart',
    place: where(
      'new-york-street',
      'West 84th Street',
      'a New York street of brownstones, with a hot-dog cart and a taxi',
    ),
    world: NEW_YORK,
    layout: {
      ground: 'paving',
      backdrop: 'city',
      items: [
        { kind: 'brownstone', x: 0.1, row: 'back', scale: 1, colour: null },
        { kind: 'brownstone', x: 0.32, row: 'back', scale: 1, colour: null },
        { kind: 'shop', x: 0.58, row: 'back', scale: 1, colour: null },
        { kind: 'tenement', x: 0.86, row: 'back', scale: 1, colour: null },
        { kind: 'taxi', x: 0.46, row: 'back', scale: 1, colour: null },
        { kind: 'streetlamp', x: 0.05, row: 'front', scale: 1, colour: null },
        {
          kind: 'hot dog cart',
          x: 0.22,
          row: 'middle',
          scale: 1,
          colour: null,
        },
        { kind: 'hydrant', x: 0.74, row: 'middle', scale: 1, colour: null },
        {
          kind: 'subway entrance',
          x: 0.9,
          row: 'middle',
          scale: 1,
          colour: null,
        },
      ],
      own: [],
      focal: { x: 0.5, words: 'on the pavement' },
      clutter: ['bin', 'street sign', 'bicycle', 'parked car'],
    },
  },
  {
    id: 'moses-riverside',
    brief:
      'a riverside in ancient Egypt in the time of Moses: reeds and palms by the river, mud-brick houses, an ark being built with its ramp, a pyramid in the haze',
    place: where(
      'moses-riverside',
      'the riverbank',
      'the bank of the Nile, with reeds, where a great ark is being built',
    ),
    world: MOSES,
    layout: {
      ground: 'sand',
      backdrop: 'sea',
      items: [
        {
          kind: 'mud brick house',
          x: 0.07,
          row: 'back',
          scale: 1,
          colour: null,
        },
        {
          kind: 'mud brick house',
          x: 0.93,
          row: 'back',
          scale: 1,
          colour: null,
        },
        { kind: 'palm grove', x: 0.78, row: 'back', scale: 1, colour: null },
        { kind: 'pyramid', x: 0.62, row: 'far', scale: 1, colour: null },
        { kind: 'obelisk', x: 0.14, row: 'far', scale: 1, colour: null },
        { kind: 'reeds', x: 0.96, row: 'middle', scale: 1, colour: null },
        { kind: 'reeds', x: 0.04, row: 'middle', scale: 1.1, colour: null },
        { kind: 'clay pots', x: 0.2, row: 'middle', scale: 1, colour: null },
      ],
      own: [
        {
          name: 'the ark, half built',
          x: 0.4,
          row: 'back',
          build: {
            kind: 'ark',
            params: { unfinished: true, ramp: true, size: 0.55 },
          },
        },
      ],
      focal: { x: 0.55, words: "at the ark's ramp" },
      clutter: ['clay pots', 'woodpile', 'basket'],
    },
  },
  {
    id: 'egypt-temple',
    brief:
      'the court before an Egyptian temple: its gateway of two towers with flags, columns, an obelisk, a statue of a king',
    place: where(
      'egypt-temple',
      "Pharaoh's temple",
      'the courtyard of a great temple',
    ),
    world: MOSES,
    layout: {
      ground: 'stone',
      backdrop: 'dunes',
      items: [
        { kind: 'columns', x: 0.12, row: 'back', scale: 1, colour: null },
        { kind: 'columns', x: 0.88, row: 'back', scale: 1, colour: null },
        { kind: 'obelisk', x: 0.72, row: 'back', scale: 1, colour: null },
        { kind: 'palm', x: 0.03, row: 'front', scale: 1, colour: null },
      ],
      own: [
        {
          name: 'the temple gateway',
          x: 0.45,
          row: 'back',
          build: { kind: 'temple', params: { pylon: true, size: 0.5 } },
        },
        {
          name: 'a statue of Pharaoh',
          x: 0.22,
          row: 'middle',
          build: { kind: 'statue', params: { pose: 'seated', size: 0.35 } },
        },
      ],
      focal: { x: 0.5, words: 'before the temple gate' },
      clutter: ['clay pots'],
    },
  },
  {
    id: 'desert-pyramids',
    brief:
      'the desert with the pyramids behind, an oasis of palms and a tent of cloth',
    place: where(
      'desert',
      'the desert',
      'open desert with the pyramids behind',
    ),
    world: MOSES,
    layout: {
      ground: 'sand',
      backdrop: 'pyramids',
      items: [
        { kind: 'palm grove', x: 0.86, row: 'back', scale: 1, colour: null },
        { kind: 'pyramid', x: 0.35, row: 'far', scale: 1.3, colour: null },
        { kind: 'rock', x: 0.1, row: 'middle', scale: 1, colour: null },
      ],
      own: [
        {
          name: "a desert family's tent",
          x: 0.2,
          row: 'back',
          build: { kind: 'tent', params: { poles: 3, open: true, size: 0.3 } },
        },
      ],
      focal: { x: 0.5, words: 'on the sand' },
      clutter: ['basket', 'clay pots'],
    },
  },
  {
    id: 'biblical-village',
    brief:
      'a village in Galilee in the first century: flat-roofed stone houses with outside stairs, a well, olive trees, clay jars',
    place: where('nazareth', 'Nazareth', 'a small village of stone houses'),
    world: GALILEE,
    layout: {
      ground: 'dirt',
      backdrop: 'village',
      items: [
        { kind: 'house', x: 0.1, row: 'back', scale: 1, colour: null },
        { kind: 'house', x: 0.33, row: 'back', scale: 1, colour: null },
        { kind: 'compound', x: 0.78, row: 'back', scale: 1, colour: null },
        { kind: 'well', x: 0.86, row: 'middle', scale: 1, colour: null },
        { kind: 'tree', x: 0.04, row: 'front', scale: 1, colour: null },
        { kind: 'clay pots', x: 0.2, row: 'middle', scale: 1, colour: null },
      ],
      own: [],
      focal: { x: 0.5, words: 'in the lane' },
      clutter: ['clay pots', 'woodpile', 'basket', 'cart'],
    },
  },
  {
    id: 'galilee-shore',
    brief:
      'the shore of the Sea of Galilee: fishing boats drawn up, a sailing ship on the water, olive hills, a house',
    place: where(
      'shore',
      'the lakeshore',
      'the pebbly shore of the Sea of Galilee',
    ),
    world: GALILEE,
    layout: {
      ground: 'sand',
      backdrop: 'sea',
      items: [
        { kind: 'boat', x: 0.18, row: 'middle', scale: 1, colour: null },
        { kind: 'boat', x: 0.84, row: 'back', scale: 1.1, colour: 'teal' },
        { kind: 'house', x: 0.93, row: 'back', scale: 1, colour: null },
        { kind: 'palm', x: 0.03, row: 'front', scale: 1, colour: null },
      ],
      own: [
        {
          name: 'a fishing ship with its sail',
          x: 0.5,
          row: 'far',
          build: { kind: 'ship', params: { masts: 1, sails: true, size: 0.4 } },
        },
      ],
      focal: { x: 0.45, words: 'by the boats' },
      clutter: ['basket', 'woodpile'],
    },
  },
  {
    id: 'farm',
    brief:
      'a farmyard in the countryside: a red barn, a farmhouse with a chimney, a fence, fields beyond, a woodpile',
    place: where('farm', 'the farmyard', 'a farmyard with a red barn'),
    world: FARM,
    layout: {
      ground: 'grass',
      backdrop: 'fields',
      items: [
        { kind: 'barn', x: 0.2, row: 'back', scale: 1, colour: 'red' },
        { kind: 'house', x: 0.74, row: 'back', scale: 1, colour: null },
        { kind: 'fence', x: 0.42, row: 'back', scale: 1, colour: null },
        { kind: 'tree', x: 0.95, row: 'front', scale: 1, colour: null },
        { kind: 'cart', x: 0.12, row: 'middle', scale: 1, colour: null },
        { kind: 'flowers', x: 0.86, row: 'middle', scale: 1, colour: 'yellow' },
      ],
      own: [],
      focal: { x: 0.5, words: 'in the middle of the yard' },
      clutter: ['woodpile', 'bicycle', 'basket'],
    },
  },
  {
    id: 'forest',
    brief: 'a forest: pines and leafy trees, a path, ferns, mushrooms, rocks',
    place: where('forest', 'the woods', 'a deep green forest with a path'),
    world: null,
    layout: {
      style: 'nature',
      ground: 'path',
      backdrop: 'trees',
      items: [
        { kind: 'pine', x: 0.1, row: 'back', scale: 1, colour: null },
        { kind: 'pine', x: 0.82, row: 'back', scale: 1.1, colour: null },
        { kind: 'tree', x: 0.3, row: 'back', scale: 1, colour: null },
        { kind: 'tree', x: 0.05, row: 'front', scale: 1, colour: null },
        { kind: 'bush', x: 0.9, row: 'middle', scale: 1, colour: null },
        { kind: 'fern', x: 0.2, row: 'middle', scale: 1, colour: null },
        { kind: 'rock', x: 0.72, row: 'middle', scale: 1, colour: null },
        { kind: 'mushroom', x: 0.62, row: 'middle', scale: 1, colour: null },
      ],
      own: [],
      focal: { x: 0.47, words: 'on the path' },
      clutter: ['woodpile'],
    },
  },
  {
    // A town of no one country: a story with no world, whose place says
    // nothing of where it is, drawn in the plain modern town (the
    // global-product fix), never one region's streets.
    id: 'town-park',
    brief:
      'a small park in a present-day town, of no one country: trees, a bench, a path, a lamp, houses and shops beyond',
    place: where('park', 'the park', 'a small park in town with a bench'),
    world: null,
    layout: {
      ground: 'grass',
      backdrop: 'city',
      items: [
        { kind: 'tree', x: 0.1, row: 'back', scale: 1, colour: null },
        { kind: 'house', x: 0.3, row: 'back', scale: 1, colour: null },
        { kind: 'shop', x: 0.72, row: 'back', scale: 1, colour: null },
        { kind: 'streetlamp', x: 0.86, row: 'middle', scale: 1, colour: null },
        { kind: 'bush', x: 0.95, row: 'front', scale: 1, colour: null },
        { kind: 'flowers', x: 0.2, row: 'middle', scale: 1, colour: 'pink' },
      ],
      own: [],
      focal: { x: 0.5, words: 'on the path' },
      clutter: ['bin', 'bicycle', 'okada', 'water drum', 'generator'],
    },
  },
  {
    id: 'classroom',
    brief:
      "a classroom in a Lagos school: a blackboard, a teacher's desk, shelves, and the backs of the pupils' heads before the camera",
    place: where(
      'classroom',
      'Primary 4 classroom',
      'a primary school classroom',
      'indoor',
    ),
    world: LAGOS,
    layout: {
      ground: 'tiles',
      walls: 'cream',
      items: [
        { kind: 'blackboard', x: 0.5, row: 'back', scale: 1, colour: null },
        { kind: 'desk', x: 0.3, row: 'middle', scale: 1, colour: null },
        { kind: 'bookshelf', x: 0.9, row: 'back', scale: 1, colour: null },
        { kind: 'noticeboard', x: 0.16, row: 'back', scale: 1, colour: null },
        { kind: 'clock', x: 0.78, row: 'back', scale: 1, colour: null },
        { kind: 'window', x: 0.08, row: 'back', scale: 1, colour: 'blue' },
        { kind: 'plant', x: 0.7, row: 'back', scale: 1, colour: null },
      ],
      own: [],
      focal: { x: 0.5, words: 'at the blackboard' },
      clutter: [],
    },
  },
  {
    id: 'church',
    brief:
      'inside a church on a Sunday: its altar table, windows with curtains, bunting, and the backs of the congregation before the camera',
    place: where(
      'church',
      'the church',
      'a church hall with benches',
      'indoor',
    ),
    world: LAGOS,
    layout: {
      ground: 'stone',
      walls: 'white',
      items: [
        { kind: 'table', x: 0.5, row: 'back', scale: 1, colour: 'white' },
        { kind: 'window', x: 0.22, row: 'back', scale: 1, colour: 'purple' },
        { kind: 'window', x: 0.78, row: 'back', scale: 1, colour: 'purple' },
        { kind: 'bunting', x: 0.5, row: 'back', scale: 1, colour: null },
        { kind: 'plant', x: 0.36, row: 'back', scale: 1, colour: null },
        { kind: 'plant', x: 0.64, row: 'back', scale: 1, colour: null },
        { kind: 'lamp', x: 0.08, row: 'middle', scale: 1, colour: null },
      ],
      own: [],
      focal: { x: 0.5, words: 'before the altar' },
      clutter: [],
    },
  },
];
