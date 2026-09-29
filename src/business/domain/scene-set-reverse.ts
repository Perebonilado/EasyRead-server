/**
 * A place's other side (studio-views-plan §4.2): what a camera turned
 * round (yaw 180) sees, for the shot and reverse shot most talk needs.
 * Worked out by code from the place's own layout, with no model asked:
 *
 *  - A room: its fourth wall, with what the painter's `reverse` row says
 *    is on it (a door, a window, shelves, a picture), else a plain
 *    arrangement of those chosen by the place's own seed; its floor, and
 *    the same things on it.
 *  - Out of doors: the other side of the street or the clearing, what
 *    the painter's `reverse` row names, else its style pack's own
 *    buildings (or trees, rocks and bushes in the wild), its backdrop the
 *    same kind of country drawn again.
 *  - A vessel: its other side, all windows, its seats along it.
 *
 * What stands on the floor is the same, at the same depth, across the
 * other way (x to 1 − x), and seen from behind: the kit's pieces drawn
 * again the other way round (from their backs, where they have one),
 * what the artist drew mirrored. What stood against the back (its wall,
 * the far edge of the ground) is behind the camera now, and is not seen;
 * nor are the people watching before the camera, who are seen instead
 * facing it from across the floor, where they are about. The camera
 * turned round keeps the floor's depth as the front camera has it (a
 * cartoon's cheat): whoever stands at a thing stands at it still, and a
 * reverse shot's people stand where they stand, reflected across.
 */
import type { SetItem, SetLayout, SetOwnItem } from './scene-set-layout';
import { STATION_SHARES } from './scene-layout';
import { STYLE_PACKS, isBuildingKind } from './scene-style-packs';
import type { StoryPlace } from './scene-story';

/** The most things the painter may put on the reverse. */
export const MAX_REVERSE = 4;
/** The words that name the reverse as a thing's row. */
export const REVERSE_ROW =
  /\b(?:reverse|fourth wall|behind the camera|opposite|other side|across the (?:street|road|clearing|room))\b/iu;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** A small, stable number from a seed, 0 to 1. */
function beat(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** A spot seen from the other side: left for right, the middle and the back as they are. */
export function mirroredSpot(spot: string): string {
  const shares = STATION_SHARES as Readonly<Record<string, number>>;
  const at = shares[spot];
  if (at === undefined) return spot;
  const other = Object.entries(shares).find(
    ([, share]) => Math.abs(share - (1 - at)) < 1e-6,
  );
  return other ? other[0] : spot;
}

/** A room's fourth wall when its painter said nothing of it: a door, a window, and one thing more, arranged by the place's own seed. */
const ROOM_WALLS: readonly (readonly [SetItem['kind'], number][])[] = [
  [
    ['door', 0.2],
    ['curtains', 0.58],
    ['picture', 0.84],
  ],
  [
    ['bookshelf', 0.14],
    ['curtains', 0.46],
    ['door', 0.8],
  ],
  [
    ['plant', 0.1],
    ['curtains', 0.32],
    ['clock', 0.6],
    ['door', 0.84],
  ],
  [
    ['door', 0.16],
    ['shelf', 0.46],
    ['curtains', 0.76],
  ],
];

/** Out of doors with no style pack: the other side's plain country. */
const PLAIN_OUTDOORS: readonly (readonly [SetItem['kind'], number])[] = [
  ['tree', 0.12],
  ['house', 0.42],
  ['bush', 0.66],
  ['tree', 0.9],
];

/** What stands on a style pack's other side of the street, or the wild's. */
function packSide(
  layout: SetLayout,
  style: NonNullable<SetLayout['style']>,
  seed: string,
): SetItem[] {
  const pack = STYLE_PACKS[style];
  // What stands along the front's far side says what the other side is:
  // buildings across a street, else what grows across a clearing.
  const behind = layout.items
    .filter((one) => one.row === 'back' || one.row === 'far')
    .map((one) => one.kind as string);
  const street = behind.some((kind) => isBuildingKind(kind) || kind === 'hut');
  const buildings = street
    ? pack.buildings.filter(
        (kind) => isBuildingKind(kind) && kind !== 'skyscraper',
      )
    : [];
  const GROWING = ['tree', 'palm', 'bush', 'pine', 'rock', 'plant'];
  // The front's own kinds where it has them (a pine wood stays pines),
  // else the pack's.
  const own = [...new Set(behind.filter((kind) => GROWING.includes(kind)))];
  const scenery = own.length
    ? [...own, ...(street ? ['streetlamp'] : [])]
    : pack.scenery.filter((kind) =>
        [...GROWING, ...(street ? ['streetlamp'] : [])].includes(kind),
      );
  const pick = <T>(list: readonly T[], k: number): T | undefined =>
    list.length
      ? list[Math.floor(beat(`${seed}:${k}`) * list.length) % list.length]
      : undefined;
  const item = (kind: string, x: number): SetItem => ({
    kind: kind as SetItem['kind'],
    x,
    row: 'back',
    scale: 1,
    colour: null,
  });
  if (!buildings.length) {
    // Across a clearing: what grows along its far side.
    const trees = scenery.filter((kind) => kind !== 'streetlamp');
    return [0.14, 0.4, 0.66, 0.9].flatMap((x, k) => {
      const kind = pick(trees.length ? trees : ['tree'], k);
      return kind ? [item(kind, x)] : [];
    });
  }
  // A row of the pack's buildings, and something growing or a lamp between.
  const out = [0.16, 0.5, 0.84].flatMap((x, k) => {
    const kind = pick(buildings, k);
    return kind ? [item(kind, x)] : [];
  });
  const between = pick(scenery, 9);
  if (between)
    out.push(item(between, beat(`${seed}:between`) < 0.5 ? 0.33 : 0.67));
  return out;
}

/** What is on the reverse when the painter said nothing of it: the place's kind's, by its own seed. */
export function reverseDefaults(
  layout: SetLayout,
  place: Pick<StoryPlace, 'id' | 'name' | 'kind'>,
): SetItem[] {
  const kind = place.kind ?? 'outdoor';
  const seed = `${place.id}:${place.name}:reverse`;
  if (kind === 'vessel') return [];
  if (kind === 'indoor') {
    const wall = ROOM_WALLS[Math.floor(beat(seed) * ROOM_WALLS.length)];
    return wall.map(([what, x]) => ({
      kind: what,
      x,
      row: 'back' as const,
      scale: 1,
      colour: null,
    }));
  }
  if (layout.style) return packSide(layout, layout.style, seed);
  return PLAIN_OUTDOORS.map(([what, x]) => ({
    kind: what,
    x,
    row: 'back' as const,
    scale: 1,
    colour: null,
  }));
}

/** Whether a thing of a layout stands on the floor (seen from either side), not against the back or far off. */
const onFloor = (row: SetItem['row']) =>
  row === 'middle' || row === 'front' || row === 'foreground';

/**
 * The layout of a place's other side, and the place as seen from there
 * (its features' spots across the other way), as the module says. Pure:
 * the same layout and place give the same reverse.
 */
export function reverseLayoutOf(
  layout: SetLayout,
  place: StoryPlace,
): { layout: SetLayout; place: StoryPlace } {
  const across = (x: number) => round3(1 - x);
  // What stands on the floor: across the other way, seen from behind.
  const floor: SetItem[] = layout.items
    .filter((one) => onFloor(one.row) || one.kind === 'rug')
    .map(({ flip, ...one }) => ({
      ...one,
      x: across(one.x),
      ...(flip ? {} : { flip: true as const }),
      back: true as const,
    }));
  const own: SetOwnItem[] = layout.own
    .filter((one) => one.row === 'middle')
    .map((one) => ({ ...one, x: across(one.x), flip: true as const }));
  const other = (layout.reverse?.length ? layout.reverse : null) ?? [
    ...reverseDefaults(layout, place),
  ];
  const { reverse, audience, ...rest } = layout;
  void reverse;
  return {
    layout: {
      ...rest,
      items: [...other.map((one) => ({ ...one })), ...floor],
      own,
      ...(layout.focal
        ? {
            focal: {
              ...layout.focal,
              x: across(layout.focal.x),
            },
          }
        : {}),
      // Seen from the stage, the people watching face the camera.
      ...(audience ? { audience } : {}),
    },
    place: {
      ...place,
      id: `${place.id}:reverse`,
      ...(place.features
        ? {
            features: place.features.map((f) => ({
              ...f,
              spot: mirroredSpot(f.spot),
            })),
          }
        : {}),
    },
  };
}
