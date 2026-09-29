/**
 * A layout written before the style packs (studio-scenery-plan L3) is
 * drawn exactly as it was: its flat picture and its layers, byte for
 * byte. A set kept with its layout is built again from it (the scene
 * processor's withLayers), so a place a show already has never changes
 * under it. Each case's drawing is kept here as its hash, taken from the
 * code before L3.
 */
import { createHash } from 'node:crypto';
import {
  buildSet,
  layoutOf,
  plainLayout,
  type SetLayout,
} from './scene-set-layout';
import type { StoryPlace } from './scene-story';

const place = (patch: Partial<StoryPlace> = {}): StoryPlace => ({
  id: 'here',
  name: 'the park',
  aliases: [],
  look: 'a green park',
  firstPage: 1,
  sound: null,
  kind: 'outdoor',
  stand: 'on',
  front: null,
  features: [],
  ...patch,
});

const market = place({
  id: 'market',
  name: 'The Market Road',
  look: 'a busy open-air market beside a Lagos road',
  features: [
    { id: 'well', name: 'well', kind: 'well', spot: 'right' },
    { id: 'gate', name: 'gate', kind: 'gate', spot: 'left' },
  ],
});

const MARKET = {
  sky: 'day',
  weather: 'clear',
  ground: 'road',
  backdrop: 'city',
  items: [
    { kind: 'stall', x: 0.2, row: 'middle', scale: 1, colour: 'red' },
    { kind: 'stall', x: 0.82, row: 'back', scale: 1, colour: 'blue' },
    { kind: 'parasol', x: 0.6, row: 'back', scale: 1 },
    { kind: 'basket', x: 0.4, row: 'middle', scale: 1 },
    { kind: 'palm', x: 0.02, row: 'front', scale: 1 },
    { kind: 'house', x: 0.5, row: 'far', scale: 1 },
    { kind: 'crate', x: 0.3, row: 'foreground', scale: 1 },
    { kind: 'plant', x: 0.95, row: 'foreground', scale: 1.2 },
  ],
  own: [],
  focal: { x: 0.5, feature: null, words: 'in front of the tomato stall' },
  clutter: ['chairs', 'baskets', 'carts'],
};

/** The backdrops and the grounds there were before L3, in their order then. */
const SET_BACKDROPS = [
  'hills',
  'mountains',
  'trees',
  'sea',
  'city',
  'village',
  'fields',
  'dunes',
  'none',
] as const;
const SET_GROUNDS = [
  'grass',
  'path',
  'sand',
  'road',
  'dirt',
  'red earth',
  'paving',
  'snow',
  'wood',
  'tiles',
  'carpet',
  'stone',
] as const;

/** Every case: a layout as a show keeps it, and its place. */
function cases(): [string, SetLayout, StoryPlace][] {
  const out: [string, SetLayout, StoryPlace][] = [];
  for (const [k, backdrop] of SET_BACKDROPS.entries())
    out.push([
      `backdrop ${backdrop}`,
      {
        ...plainLayout(place()),
        backdrop,
        ground: SET_GROUNDS[k % SET_GROUNDS.length],
        sky: (['day', 'dusk', 'night', 'dawn'] as const)[k % 4],
      },
      place(),
    ]);
  const room = place({ kind: 'indoor', name: 'the bedroom', look: '' });
  out.push(['plain room', plainLayout(room), room]);
  out.push([
    'bedroom',
    layoutOf(
      {
        ground: 'tiles',
        walls: 'cream',
        items: [
          { kind: 'bed', x: 0.2, row: 'back', scale: 1, colour: null },
          { kind: 'curtains', x: 0.5, row: 'back', scale: 1, colour: 'red' },
          { kind: 'clock', x: 0.5, row: 'back', scale: 1, colour: null },
          { kind: 'rug', x: 0.5, row: 'front', scale: 1, colour: 'pink' },
          { kind: 'wardrobe', x: 0.85, row: 'back', scale: 1, colour: null },
          { kind: 'bunting', x: 0.3, row: 'back', scale: 1, colour: null },
        ],
      },
      room,
    ),
    room,
  ]);
  for (const vessel of ['bus', 'train', 'plane', 'boat']) {
    const inside = place({ kind: 'vessel', name: `the ${vessel}`, look: '' });
    out.push([
      `vessel ${vessel}`,
      layoutOf({ vessel, items: [] }, inside),
      inside,
    ]);
  }
  const canoe = place({
    kind: 'vessel',
    name: 'the canoe',
    look: 'a canoe on the river',
    stand: 'in',
    front: "the canoe's side",
  });
  out.push(['canoe', layoutOf({ vessel: 'boat' }, canoe), canoe]);
  out.push(['market', layoutOf(MARKET, market), market]);
  out.push([
    'park',
    layoutOf(
      {
        ground: 'grass',
        items: [
          { kind: 'bush', x: 0.2, row: 'middle', scale: 1, colour: null },
          { kind: 'house', x: 0.8, row: 'back', scale: 1, colour: null },
          { kind: 'lamp', x: 0.7, row: 'middle', scale: 1, colour: null },
          { kind: 'palm', x: 0.06, row: 'front', scale: 1, colour: null },
          { kind: 'tree', x: 0.5, row: 'front', scale: 1, colour: null },
          { kind: 'hut', x: 0.35, row: 'back', scale: 1.3, colour: null },
          { kind: 'cart', x: 0.9, row: 'middle', scale: 0.8, colour: null },
        ],
        clutter: ['plants', 'benches', 'chairs', 'baskets', 'carts'],
        focal: { x: 0.3, words: 'by the hut' },
      },
      place(),
    ),
    place(),
  ]);
  return out;
}

const hash = (text: string) =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The hashes of each case's flat picture and its layers, from before L3. */
const GOLDEN: Record<string, [string, string]> = {
  'backdrop hills': ['0a91359568f4c094', '3364e7278970255e'],
  'backdrop mountains': ['1ef226f0efb93b78', '3889f2b4b24903ce'],
  'backdrop trees': ['d7fc7f6daafd88dc', 'fd5dea8d3cfe8565'],
  'backdrop sea': ['9be7fa817887e228', 'c3c5e1ff9cdc2fc9'],
  'backdrop city': ['fbbb2b479a2c0788', '080179d07ea0ce7f'],
  'backdrop village': ['d914061b81ddf1d1', '1ff08f1b092a127a'],
  'backdrop fields': ['840ad945e834b8d7', '02fe736facb174b5'],
  'backdrop dunes': ['3847b1a4430f94fd', '9e5db8fb6866bd1e'],
  'backdrop none': ['1d859314190add2c', '50c6ebdc16007118'],
  'plain room': ['c6e246e61c0e00f0', '10863a57c5ba1c9b'],
  bedroom: ['55205515662c0694', '19eb57e3e0d636aa'],
  // A bus with no colour of its own is a plain blue, no longer one
  // region's yellow (the global-product fix, D9): changed on purpose.
  'vessel bus': ['7b4de326f48cb446', '6b7b36a58d319e9b'],
  'vessel train': ['b74ed7bc0b83939e', '4dcece0399d8d365'],
  'vessel plane': ['816a1db36be133b6', '637dc87e1961750e'],
  'vessel boat': ['bb572e2b79823a79', '0902c062582564fe'],
  canoe: ['675e67ccda84cb4a', 'f47845e1c043d8bd'],
  market: ['19102a96c03f494d', 'c0e5963468069f90'],
  park: ['fa9ff2db0f0963bd', '5e6e1089e2c608ab'],
};

describe('a layout written before the style packs', () => {
  it('is drawn byte for byte as it was, flat and as layers', () => {
    const got = Object.fromEntries(
      cases().map(([name, parsed, where]) => {
        // As it was kept: a layout written before the camera panned (L4)
        // says no width, and is drawn one frame wide.
        const layout = { ...parsed };
        delete layout.width;
        const built = buildSet(layout, where);
        // The front as it was; its other side is new (studio-views-plan V3).
        const { reverse, ...front } = built.layered;
        void reverse;
        return [name, [hash(built.svg), hash(JSON.stringify(front))]];
      }),
    );
    expect(got).toEqual(GOLDEN);
  });
});
