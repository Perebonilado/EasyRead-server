/**
 * The vehicle kit (studio-interactions-plan §2.3, I3): what people ride,
 * drive, push and row, drawn by code in the house's line (the kit's ink,
 * flat fills, a palette per style pack), at their real sizes in the kit's
 * units (a grown-up is 224 tall, about 1.7 m, so a metre is about 132).
 *
 * Each vehicle is built once as a small solid in metres (x forward, y up,
 * z toward the near side): its bodies as profiles drawn out across its
 * width, its tubes, its wheels, its hull, the panels on its sides, front
 * and back. The same solid is seen from the side (the main view), from
 * the front, from behind and three-quarter on, as the views plan's
 * camera sees people; mirrored, it faces the other way. So its door, its
 * wheels, its seats and its windows are the same in every view.
 *
 * Its drawing is rigged for the stage:
 *
 * - `bob`: the body on its springs, moved up and down as it goes (the
 *   wheels stay on the ground);
 * - `data-wheel="cx cy r"` on each wheel that shows turning (spokes, a
 *   hubcap), and on a bicycle's crank (its r the wheel's times the gear):
 *   the player turns it by the distance gone, `data-spin` its sense;
 * - `leaf`: its door, hinged about its front edge or sliding back, as the
 *   stage's door leaves are;
 * - `cabin`: what is seen through the glass (the seats, the steering
 *   wheel), behind whoever sits there; `body-front` laid over them (the
 *   body, the door), and `window`, the glass, over them too, so one inside
 *   is seen through it;
 * - `lights`: its headlights' beams, hidden until night.
 *
 * And it says what it offers (scene-affordances): its seats (driver,
 * passenger, rider, pillion, rower) with the hips, hands and feet of one
 * sat there, what hands grip (the steering wheel, handlebars, a cart's
 * handles, oars, reins), a bicycle's pedals, its wheels, where one gets
 * on, its door's handle.
 */
import type {
  SceneAffordancesDto,
  ScenePoint,
  SceneSeatPose,
  SceneVehicleDto,
  SceneVehicleView,
} from '../../contracts';
import { CLOTH, FIGURE_INK, KIT_EXTRAS, SET_COLOURS } from './scene-ink';
import { KIT_M, LINE, r1 } from './scene-set-draw';
import type { SetPiece } from './scene-set-pieces';
import { mix, type StylePackId } from './scene-style-packs';

// ── What the kit draws ──────────────────────────────────────────────────

export const VEHICLE_KIT = [
  'bicycle',
  'motorbike',
  'car',
  'taxi',
  'van',
  'truck',
  'bus',
  'danfo',
  'handcart',
  'animal-cart',
  'wheelbarrow',
  'rowing-boat',
  'canoe',
  'chariot',
] as const;
export type VehicleKitKind = (typeof VEHICLE_KIT)[number];
export const isVehicleKitKind = (kind: string): kind is VehicleKitKind =>
  (VEHICLE_KIT as readonly string[]).includes(kind);

/** The views a vehicle is drawn from, as the views plan's camera sees people. */
export const VEHICLE_VIEWS = [
  'side',
  '3q',
  'front',
  'back',
] as const satisfies readonly SceneVehicleView[];
export type VehicleView = SceneVehicleView;

/** A city's own look for its buses and cabs, only where the story names it. */
export const VEHICLE_LIVERIES = ['london', 'new-york'] as const;
export type VehicleLivery = (typeof VEHICLE_LIVERIES)[number];

/** How a vehicle is drawn beyond its kind. */
export interface VehicleLook {
  view?: VehicleView;
  /** Which way it faces: 1 to the right (as drawn), -1 mirrored. */
  facing?: 1 | -1;
  pack?: StylePackId | null;
  colour?: string | null;
  /** Its name, for a colour it says ("the red bus") and its seed. */
  name?: string;
  livery?: VehicleLivery | null;
  /** Drawn as scenery (a car parked on a painted street): no rig, no ids, no lights. */
  plain?: boolean;
}

/** A vehicle drawn: a set piece with its rig, what it offers, and its size. */
export interface VehicleDrawing extends SetPiece {
  vehicle: SceneVehicleDto;
  affordances: SceneAffordancesDto;
  /** Its real size, in metres: long, wide and high. */
  size: { long: number; wide: number; high: number };
  /** The animal that draws it, where one does: a donkey cart's, a chariot's horses. */
  draws?: 'donkey' | 'horse' | 'ox';
}

// ── Colours ─────────────────────────────────────────────────────────────

const DARK = '#3a3740';
const TYRE = '#3b3440';
const STEEL = KIT_EXTRAS.steel;
const CHROME = '#e4e7eb';
const GLASS = KIT_EXTRAS.glass;
/** What is seen through glass: the far windows, the inside, a little darker. */
const GLASS_BACK = '#9fbccd';
const INSIDE = '#5b5661';
const SEAT = '#4b4652';
const LAMP = '#fff3c4';
const TAIL = KIT_EXTRAS['bright red'];
const BEAM = '#fff1a8';
const WOOD = SET_COLOURS.wood;
const WOOD_DARK = KIT_EXTRAS['dark wood'];
const GOLD = KIT_EXTRAS.gold;
const WATER = SET_COLOURS.water;

/** A colour a little lighter or darker: a roof lit from above, a band. */
const lighter = (hex: string, k = 0.22) => mix(hex, '#ffffff', k);
const darker = (hex: string, k = 0.2) => mix(hex, '#1d1a22', k);

/** A colour a name says, of the kit's: "the red bus" is red; null for none. */
const NAMED_COLOURS: [RegExp, string][] = [
  [/\bred\b/iu, CLOTH.red],
  [/\borange\b/iu, CLOTH.orange],
  [/\b(?:yellow|golden)\b/iu, CLOTH.yellow],
  [/\b(?:green|lime)\b/iu, CLOTH.green],
  [/\b(?:teal|turquoise)\b/iu, CLOTH.teal],
  [/\bnavy\b/iu, CLOTH.navy],
  [/\bblue\b/iu, CLOTH.blue],
  [/\b(?:purple|violet)\b/iu, CLOTH.purple],
  [/\bpink\b/iu, CLOTH.pink],
  [/\bbrown\b/iu, CLOTH.brown],
  [/\b(?:grey|gray|silver)\b/iu, CLOTH.grey],
  [/\bwhite\b/iu, CLOTH.white],
  [/\bblack\b/iu, CLOTH.black],
];
export const colourNamed = (name: string): string | null =>
  NAMED_COLOURS.find(([words]) => words.test(name))?.[1] ?? null;

// ── The packs' vehicles ─────────────────────────────────────────────────

/**
 * What each style pack's streets and roads have, first the one a vehicle
 * with no name is, and the colours their bodies come in: a present-day
 * town's plain cars and buses, a West African town's danfos and okadas,
 * an ancient place's carts and chariots.
 */
export interface PackVehicles {
  kinds: readonly VehicleKitKind[];
  /** Cars', vans' and bikes' bodies. */
  bodies: readonly string[];
  bus: string;
  taxi: string;
  /** A cart's, a boat's, a chariot's wood. */
  wood: string;
}

export const PACK_VEHICLES: Record<StylePackId, PackVehicles> = {
  'modern-town': {
    kinds: [
      'car',
      'taxi',
      'van',
      'bus',
      'truck',
      'bicycle',
      'motorbike',
      'handcart',
      'wheelbarrow',
      'rowing-boat',
      'canoe',
    ],
    bodies: [CLOTH.blue, CLOTH.red, CLOTH.white, CLOTH.grey, CLOTH.green],
    bus: CLOTH.blue,
    taxi: CLOTH.white,
    wood: WOOD,
  },
  'western-city': {
    kinds: [
      'car',
      'taxi',
      'bus',
      'van',
      'truck',
      'bicycle',
      'motorbike',
      'handcart',
    ],
    bodies: [CLOTH.navy, CLOTH.grey, CLOTH.red, CLOTH.white, CLOTH.black],
    bus: CLOTH.blue,
    taxi: CLOTH.yellow,
    wood: WOOD,
  },
  'west-african-town': {
    kinds: [
      'car',
      'danfo',
      'motorbike',
      'taxi',
      'bus',
      'van',
      'truck',
      'bicycle',
      'wheelbarrow',
      'handcart',
      'canoe',
    ],
    bodies: [CLOTH.white, CLOTH.blue, CLOTH.green, CLOTH.red, CLOTH.grey],
    bus: CLOTH.blue,
    taxi: CLOTH.yellow,
    wood: WOOD,
  },
  'village-farm': {
    kinds: [
      'truck',
      'car',
      'bicycle',
      'animal-cart',
      'wheelbarrow',
      'handcart',
      'rowing-boat',
    ],
    bodies: [CLOTH.green, CLOTH.red, CLOTH.blue, CLOTH.white],
    bus: CLOTH.green,
    taxi: CLOTH.yellow,
    wood: WOOD,
  },
  nature: {
    kinds: ['car', 'bicycle', 'rowing-boat', 'canoe', 'wheelbarrow'],
    bodies: [CLOTH.green, CLOTH.blue, CLOTH.orange, CLOTH.white],
    bus: CLOTH.green,
    taxi: CLOTH.yellow,
    wood: WOOD,
  },
  'ancient-near-east': {
    kinds: ['animal-cart', 'chariot', 'handcart', 'rowing-boat', 'canoe'],
    bodies: [SET_COLOURS.wood, '#e2c27a', CLOTH.teal],
    bus: CLOTH.brown,
    taxi: CLOTH.brown,
    wood: '#c9955f',
  },
  'biblical-village': {
    kinds: ['animal-cart', 'handcart', 'rowing-boat', 'chariot'],
    bodies: [SET_COLOURS.wood, '#b98a5a', CLOTH.brown],
    bus: CLOTH.brown,
    taxi: CLOTH.brown,
    wood: '#b58657',
  },
};

/** The vehicles a pack has: the kinds its places drive, ride and row. */
export const packVehicles = (pack: StylePackId): readonly VehicleKitKind[] =>
  PACK_VEHICLES[pack].kinds;

/** The ancient packs, where nothing has an engine. */
const ANCIENT: ReadonlySet<StylePackId> = new Set([
  'ancient-near-east',
  'biblical-village',
]);

/** Which of the kit a name says, word by word: the first that matches. */
const KIT_WORDS: [RegExp, VehicleKitKind][] = [
  [/\bdanfos?\b/iu, 'danfo'],
  [/\bchariots?\b/iu, 'chariot'],
  [/\bwheel ?barrows?\b/iu, 'wheelbarrow'],
  [
    /\b(?:(?:donkey|horse|ox|mule|pony)[- ]?(?:carts?|wagons?|carriages?)|ox ?carts?|wagons?|carriages?|carts? (?:pulled|drawn) by)\b/iu,
    'animal-cart',
  ],
  [/\b(?:hand ?carts?|push ?carts?|barrows?|carts?)\b/iu, 'handcart'],
  [/\b(?:canoes?|kayaks?|dugouts?|pirogues?)\b/iu, 'canoe'],
  [
    /\b(?:rowing ?boats?|row ?boats?|dinghy|dinghies|fishing boats?|skiffs?|boats?)\b/iu,
    'rowing-boat',
  ],
  [
    /\b(?:motor ?bikes?|motorcycles?|okadas?|scooters?|mopeds?)\b/iu,
    'motorbike',
  ],
  [/\b(?:bicycles?|bikes?|cycles?)\b/iu, 'bicycle'],
  [/\b(?:taxis?|cabs?)\b/iu, 'taxi'],
  [/\b(?:trucks?|lorr(?:y|ies)|pickups?)\b/iu, 'truck'],
  [/\bvans?\b/iu, 'van'],
  [/\b(?:bus|buses|minibus(?:es)?|coach(?:es)?)\b/iu, 'bus'],
  [/\b(?:cars?|automobiles?|jeeps?|4x4s?)\b/iu, 'car'],
];

/**
 * Which vehicle a name says: its own word (a bicycle, a canoe, a donkey
 * cart); a bus a danfo only in a West African town; a name with none of
 * the words its place's first vehicle (a car; in an ancient place, a
 * cart), or a car with no place.
 */
export function vehicleKitKindOf(
  name: string,
  pack: StylePackId | null = null,
): VehicleKitKind {
  const said = KIT_WORDS.find(([words]) => words.test(name))?.[1];
  if (said === 'bus' && pack === 'west-african-town') return 'danfo';
  if (said) return said;
  return pack ? PACK_VEHICLES[pack].kinds[0] : 'car';
}

/** A city's look for its buses and cabs, from the story's own words: London's red buses and black cabs. */
export function vehicleLiveryOf(words: string): VehicleLivery | null {
  if (/\b(?:london|londoners?|england|english|british|britain)\b/iu.test(words))
    return 'london';
  if (/\b(?:new york|manhattan|brooklyn|nyc|the bronx)\b/iu.test(words))
    return 'new-york';
  return null;
}

/** The animal a cart's or chariot's name says draws it. */
function drawnBy(kind: VehicleKitKind, name: string): VehicleDrawing['draws'] {
  if (kind === 'chariot') return 'horse';
  if (kind !== 'animal-cart') return undefined;
  if (/\b(?:horses?|pony|ponies)\b/iu.test(name)) return 'horse';
  if (/\b(?:ox|oxen|bulls?|cows?)\b/iu.test(name)) return 'ox';
  return 'donkey';
}

/** A small seed from words, for a colour chosen from a list. */
function seedOf(words: string): number {
  let h = 0;
  for (const ch of words) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * A vehicle's body colour: as given, else as its name says, else its
 * kind's own in its place (a taxi's, a bus's, a danfo's yellow, London's
 * red bus and black cab), else one of its place's body colours chosen by
 * its name.
 */
export function vehicleColour(
  kind: VehicleKitKind,
  look: Pick<VehicleLook, 'pack' | 'colour' | 'name' | 'livery'>,
): string {
  const name = look.name ?? '';
  const given = look.colour ?? colourNamed(name);
  if (given) return given;
  if (kind === 'danfo') return '#f2c14e';
  const pack = look.pack ? PACK_VEHICLES[look.pack] : null;
  if (kind === 'taxi')
    return look.livery === 'london'
      ? CLOTH.black
      : look.livery === 'new-york'
        ? CLOTH.yellow
        : (pack?.taxi ?? CLOTH.yellow);
  if (kind === 'bus')
    return look.livery === 'london' ? CLOTH.red : (pack?.bus ?? CLOTH.blue);
  const woody: VehicleKitKind[] = [
    'handcart',
    'animal-cart',
    'wheelbarrow',
    'rowing-boat',
    'canoe',
    'chariot',
  ];
  if (woody.includes(kind)) return pack?.wood ?? WOOD;
  const bodies = pack?.bodies ?? [CLOTH.red, CLOTH.blue, CLOTH.white];
  return bodies[seedOf(`${kind}:${name}`) % bodies.length] ?? CLOTH.red;
}

// ── The camera ──────────────────────────────────────────────────────────

/** A point of a vehicle, in metres: x forward, y up, z toward the near side. */
type V3 = readonly [number, number, number];
/** A point on one of its planes, in metres: along and up. */
type P2 = readonly [number, number];
type XY = [number, number];

/** Each view's camera: turned about the vertical (0 the side, a quarter turn the front), and how far above it looks down. */
const CAMERAS: Record<VehicleView, { turn: number; above: number }> = {
  side: { turn: 0, above: 0 },
  '3q': { turn: (38 * Math.PI) / 180, above: 0.16 },
  front: { turn: Math.PI / 2, above: 0.1 },
  back: { turn: -Math.PI / 2, above: 0.1 },
};

interface Camera {
  view: VehicleView;
  c: number;
  s: number;
  k: number;
  f: 1 | -1;
  /** The nearest point on the ground: drawn on y = 0, what is farther off higher. */
  lift: number;
}

const M = KIT_M;
const depthOf = (cam: Camera, p: V3) => p[0] * cam.s + p[2] * cam.c;
const project = (cam: Camera, p: V3): XY => [
  (p[0] * cam.c - p[2] * cam.s) * cam.f * M,
  (-p[1] + cam.k * (depthOf(cam, p) - cam.lift)) * M,
];

/** The planes things are drawn on: its near side (at z), its front (at x), its back (at x). */
type Plane =
  | { side: 'near'; z: number }
  | { side: 'front'; x: number }
  | { side: 'back'; x: number };
const onPlane = (plane: Plane, [u, v]: P2): V3 =>
  plane.side === 'near'
    ? [u, v, plane.z]
    : plane.side === 'front'
      ? [plane.x, v, -u]
      : [plane.x, v, u];
/** Whether a plane faces the camera. */
const facesCamera = (cam: Camera, plane: Plane) =>
  plane.side === 'near'
    ? cam.c > 0.05
    : plane.side === 'front'
      ? cam.s > 0.05
      : cam.s < -0.05;
/**
 * A plane's own drawing (in the kit's units, y down, as the side view
 * draws it) on the page: the affine map, as an SVG matrix. Used where
 * something turns in its plane (a wheel's spokes).
 */
function planeMatrix(cam: Camera, plane: Plane): string {
  const o = project(cam, onPlane(plane, [0, 0]));
  const a = project(cam, onPlane(plane, [1 / M, 0]));
  const b = project(cam, onPlane(plane, [0, -1 / M]));
  const n = (v: number) => Math.round(v * 10000) / 10000;
  return `matrix(${n(a[0] - o[0])} ${n(a[1] - o[1])} ${n(b[0] - o[0])} ${n(b[1] - o[1])} ${r1(o[0])} ${r1(o[1])})`;
}

// ── Shapes ──────────────────────────────────────────────────────────────

const pathOf = (rings: XY[][]): string =>
  rings
    .filter((ring) => ring.length > 1)
    .map((ring) => `M${ring.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' L')} Z`)
    .join(' ');
const openPathOf = (points: XY[]): string =>
  `M${points.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' L')}`;

/** A circle on a plane, as points: `n` of them round. */
const circle2 = (c: P2, r: number, n = 20): P2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as P2;
  });
/** A rectangle on a plane, from its lower corner, its corners rounded by `round`. */
function rect2(u: number, v: number, w: number, h: number, round = 0): P2[] {
  if (round <= 0)
    return [
      [u, v],
      [u + w, v],
      [u + w, v + h],
      [u, v + h],
    ];
  const q = Math.min(round, w / 2, h / 2);
  const corner = (cx: number, cy: number, from: number): P2[] =>
    [0, 1, 2].map((i) => {
      const a = from + (i / 2) * (Math.PI / 2);
      return [cx + Math.cos(a) * q, cy + Math.sin(a) * q] as P2;
    });
  return [
    ...corner(u + w - q, v + q, -Math.PI / 2),
    ...corner(u + w - q, v + h - q, 0),
    ...corner(u + q, v + h - q, Math.PI / 2),
    ...corner(u + q, v + q, Math.PI),
  ];
}
/** A convex polygon cut by a half-plane, a·p ≤ b (Sutherland–Hodgman, one edge). */
function clipHalf(points: P2[], a: P2, b: number): P2[] {
  const out: P2[] = [];
  const inside = (p: P2) => a[0] * p[0] + a[1] * p[1] <= b;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const pi = inside(p);
    const qi = inside(q);
    if (pi) out.push(p);
    if (pi !== qi) {
      const dp = a[0] * p[0] + a[1] * p[1] - b;
      const dq = a[0] * q[0] + a[1] * q[1] - b;
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}
/** A glint across a pane: the band between two slanted lines, cut to it. */
function glint(pane: readonly P2[]): P2[] {
  const xs = pane.map((p) => p[0]);
  const x0 = Math.min(...xs);
  const w = Math.max(...xs) - x0;
  const slope: P2 = [1, 0.7];
  const at = (k: number) =>
    slope[0] * (x0 + w * k) + slope[1] * Math.min(...pane.map((p) => p[1]));
  return clipHalf(
    clipHalf([...pane], slope, at(0.52)),
    [-slope[0], -slope[1]],
    -at(0.34),
  );
}
/** The convex hull of points (the monotone chain). */
function hull(points: XY[]): XY[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: XY, a: XY, b: XY) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XY[] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: XY[] = [];
  for (const q of [...p].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// ── A vehicle as a solid ────────────────────────────────────────────────

/** Where a part is drawn: behind all (far), seen through the glass (cabin), the body, the glass over, or before the body (near). */
type Layer = 'far' | 'cabin' | 'body' | 'glass' | 'near';

/** A body: a profile (x along, y up) drawn out across its width. */
interface Prism {
  is: 'prism';
  profile: P2[];
  z: [number, number];
  fill: string;
  /** Its faces that look up (a roof, a hood, a cart's bed): absent, a little lighter. */
  top?: string;
  /** Its edges that are glass (a windscreen), by index: the frame's width round the pane, in metres. */
  glass?: Record<number, number>;
  /** Holes in its near side (windows, the door's gap), each a pane of glass or a way in. */
  holes?: { points: P2[]; glass: boolean }[];
  layer?: Layer;
}
/** A tube: a frame, a shaft, a handle, an oar. */
interface Tube {
  is: 'tube';
  points: V3[];
  width: number;
  colour: string;
  layer?: Layer;
}
/** A wheel: its middle, radius and width, and what its face shows. */
interface Wheel {
  is: 'wheel';
  at: V3;
  r: number;
  width: number;
  face: 'hubcap' | 'spokes' | 'wood' | 'moto';
  rim?: string;
}
/** Shapes on one of its planes: panels, windows, lamps, stripes. */
interface Decal {
  is: 'decal';
  plane: Plane;
  shapes: { points: P2[]; fill: string; ink?: boolean; opacity?: number }[];
  layer?: Layer;
}
/** A flat shape in space: a seat's top, a blade, a pedal. */
interface Flat {
  is: 'flat';
  points: V3[];
  fill: string;
  layer?: Layer;
}
/** A hull: its length, beam and height at each end, sheer and keel, drawn from any side. */
interface Hull {
  is: 'hull';
  long: number;
  beam: number;
  /** Its gunwale's height at the middle, and how much higher at its ends. */
  high: number;
  sheer: number;
  /** How far below the water its keel is. */
  draft: number;
  /** Its stern's width as a share of its beam: 0 a point (a canoe), else a transom. */
  transom: number;
  fill: string;
  inside: string;
  /** Planks across it, at x, at a height. */
  thwarts: [number, number][];
}
/** A bicycle's crank: its middle, its arms' length, the pedals at their ends, turning with the wheels by the gear. */
interface Crank {
  is: 'crank';
  at: V3;
  r: number;
  gear: number;
  wheelR: number;
  colour: string;
}
type Part = Prism | Tube | Wheel | Decal | Flat | Hull | Crank;

/** A seat, in metres. */
interface Seat3 {
  id: string;
  hip: V3;
  feet: V3[];
  hands?: V3[];
  pose: SceneSeatPose;
}

/** A vehicle as a solid, before it is seen. */
interface Solid {
  size: { long: number; wide: number; high: number };
  parts: Part[];
  seats: Seat3[];
  grips: { id: string; at: V3 }[];
  /** Its door: its outline on the near side, its hinge (its front edge) or how far it slides back, its pane, its handle. */
  door?: {
    outline: P2[];
    hinge?: P2;
    slide?: number;
    pane?: P2[];
    handle: P2;
    /** Where the body narrows above its waist (a car's glasshouse): the door above the line a·p > b is on the plane at z. */
    upper?: { a: P2; b: number; z: number };
  };
  /** Where one gets on (the ground by the door, the side of a bicycle). */
  mount: V3;
  /** A step up at its door. */
  steps?: V3[];
  /** The front's lamps and the back's, on their planes. */
  lamps?: {
    front: Plane & { side: 'front' };
    at: P2[];
    back?: Plane & { side: 'back' };
    tail?: P2[];
  };
  /** Where it meets the ground (its wheels' feet) or the water. */
  contacts: V3[];
  /** How far the body bobs on its springs, in the kit's units, and over how far gone (the road's bumps). */
  bob: { amp: number; every: number };
  water?: true;
  /** The near side's z: where the door and near decals are. */
  nearZ: number;
}

// ── Drawing a solid ─────────────────────────────────────────────────────

interface Drawn {
  depth: number;
  svg: string;
}

class Sheet {
  readonly layers: Record<Layer, Drawn[]> = {
    far: [],
    cabin: [],
    body: [],
    glass: [],
    near: [],
  };
  readonly lights: string[] = [];
  readonly shadow: string[] = [];
  readonly doorLeaf: string[] = [];
  readonly points: XY[] = [];
  constructor(
    readonly cam: Camera,
    readonly plain: boolean,
  ) {}
  add(layer: Layer, depth: number, svg: string, points: XY[] = []): void {
    this.layers[layer].push({ depth, svg });
    this.points.push(...points);
  }
  p(v: V3): XY {
    return project(this.cam, v);
  }
}

const shape = (d: string, colour: string, extra = '') =>
  `<path d="${d}" fill="${colour}"${extra}/>`;
const flatShape = (d: string, colour: string, extra = '') =>
  `<path d="${d}" fill="${colour}" stroke="none"${extra}/>`;
const inkLine = (d: string, colour: string, width: number) =>
  `<path d="${d}" fill="none" stroke="${FIGURE_INK}" stroke-width="${r1(width + LINE * 2)}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${r1(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A profile wound counter-clockwise (y up). */
function ccw(profile: readonly P2[]): P2[] {
  let area = 0;
  for (let i = 0; i < profile.length; i += 1) {
    const [x0, y0] = profile[i];
    const [x1, y1] = profile[(i + 1) % profile.length];
    area += x0 * y1 - x1 * y0;
  }
  return area >= 0 ? [...profile] : [...profile].reverse();
}

function drawPrism(sheet: Sheet, prism: Prism): void {
  const { cam } = sheet;
  const [z0, z1] = prism.z;
  const layer = prism.layer ?? 'body';
  const profile = ccw(prism.profile);
  const n = profile.length;
  const reversed = n > 1 && profile[0] !== prism.profile[0];
  const top = prism.top ?? lighter(prism.fill);
  for (let i = 0; i < n; i += 1) {
    const p = profile[i];
    const q = profile[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = dy / len;
    const ny = -dx / len;
    if (nx * cam.s + ny * cam.k <= 1e-3) continue;
    const quad: V3[] = [
      [p[0], p[1], z1],
      [q[0], q[1], z1],
      [q[0], q[1], z0],
      [p[0], p[1], z0],
    ];
    const at = quad.map((v) => sheet.p(v));
    const depth = quad.reduce((sum, v) => sum + depthOf(cam, v), 0) / 4;
    const fill = ny > 0.6 ? top : prism.fill;
    // Its index in the profile as given, whichever way it was wound.
    const given = reversed ? (2 * n - 2 - i) % n : i;
    const frame = prism.glass?.[given];
    if (frame !== undefined) {
      const along = (k: number): number[] => [
        p[0] + (dx * k) / len,
        p[1] + (dy * k) / len,
      ];
      const [a0, a1] = [frame, len - frame];
      const [b0, b1] = [z1 - frame, z0 + frame];
      const pane: V3[] = [
        [along(a0)[0], along(a0)[1], b0],
        [along(a1)[0], along(a1)[1], b0],
        [along(a1)[0], along(a1)[1], b1],
        [along(a0)[0], along(a0)[1], b1],
      ];
      const glassAt = pane.map((v) => sheet.p(v));
      sheet.add('cabin', depth - 50, flatShape(pathOf([glassAt]), GLASS_BACK));
      sheet.add(
        'glass',
        depth,
        flatShape(pathOf([glassAt]), GLASS, ' fill-opacity="0.42"') +
          flatShape(
            pathOf([glint(pane.map((v) => sheet.p(v) as P2)) as XY[]]),
            '#ffffff',
            ' fill-opacity="0.35"',
          ) +
          shape(pathOf([glassAt]), 'none'),
      );
      sheet.add(
        layer,
        depth,
        shape(
          pathOf([at, [...glassAt].reverse()]),
          fill,
          ' fill-rule="evenodd"',
        ),
        at,
      );
    } else sheet.add(layer, depth, shape(pathOf([at]), fill), at);
  }
  // Its near side, with its windows and its door's gap cut out.
  if (cam.c > 0.05) {
    const plane: Plane = { side: 'near', z: z1 };
    const outer = profile.map((v) => sheet.p(onPlane(plane, v)));
    const holes = (prism.holes ?? []).map((h) =>
      h.points.map((v) => sheet.p(onPlane(plane, v))),
    );
    // Coplanar with what is drawn on it: its decals come after it.
    const depth = z1 * cam.c + 0.001;
    for (const [k, hole] of (prism.holes ?? []).entries()) {
      const at = holes[k];
      sheet.add(
        'cabin',
        depth - 60,
        flatShape(pathOf([at]), hole.glass ? GLASS_BACK : INSIDE),
      );
      if (hole.glass)
        sheet.add(
          'glass',
          depth,
          flatShape(pathOf([at]), GLASS, ' fill-opacity="0.42"') +
            flatShape(
              pathOf([
                glint(hole.points).map((v) => sheet.p(onPlane(plane, v))),
              ]),
              '#ffffff',
              ' fill-opacity="0.35"',
            ) +
            shape(pathOf([at]), 'none'),
        );
    }
    sheet.add(
      layer,
      depth + 0.001,
      shape(
        pathOf([outer, ...holes]),
        prism.fill,
        holes.length ? ' fill-rule="evenodd"' : '',
      ),
      outer,
    );
  }
}

function drawTube(sheet: Sheet, tube: Tube): void {
  const at = tube.points.map((v) => sheet.p(v));
  const depth =
    tube.points.reduce((sum, v) => sum + depthOf(sheet.cam, v), 0) /
    tube.points.length;
  sheet.add(
    tube.layer ?? 'body',
    depth,
    inkLine(openPathOf(at), tube.colour, tube.width * M),
    at,
  );
}

function drawFlat(sheet: Sheet, flat: Flat): void {
  const at = flat.points.map((v) => sheet.p(v));
  const depth =
    flat.points.reduce((sum, v) => sum + depthOf(sheet.cam, v), 0) /
    flat.points.length;
  sheet.add(flat.layer ?? 'body', depth, shape(pathOf([at]), flat.fill), at);
}

function drawDecal(sheet: Sheet, decal: Decal): void {
  if (!facesCamera(sheet.cam, decal.plane)) return;
  // Coplanar with the body's side or front: after it.
  const depth =
    decal.plane.side === 'near'
      ? decal.plane.z * sheet.cam.c + 0.002
      : depthOf(sheet.cam, onPlane(decal.plane, [0, 0])) + 0.002;
  const svg = decal.shapes
    .map((s) => {
      const at = s.points.map((v) => sheet.p(onPlane(decal.plane, v)));
      const extra =
        s.opacity !== undefined ? ` fill-opacity="${s.opacity}"` : '';
      return s.ink === false
        ? flatShape(pathOf([at]), s.fill, extra)
        : shape(pathOf([at]), s.fill, extra);
    })
    .join('');
  sheet.add(decal.layer ?? 'body', depth, svg);
}

/** Each wheel: its tyre from where it is seen, and its face, turning, where it shows. */
function drawWheel(
  sheet: Sheet,
  wheel: Wheel,
  near: boolean,
  k: number,
): Wheel | null {
  const { cam } = sheet;
  const [x, y, z] = wheel.at;
  const faces = [z - wheel.width / 2, z + wheel.width / 2].map((fz) =>
    circle2([x, y], wheel.r, 28).map((v) => sheet.p([v[0], v[1], fz])),
  );
  const tyre = hull([...faces[0], ...faces[1]]);
  const depth = depthOf(cam, wheel.at);
  // A bicycle's wheel is open: its tyre a ring, seen through.
  const open = wheel.face === 'spokes';
  let svg = open && cam.c > 0.2 ? '' : shape(pathOf([tyre]), TYRE);
  let turning = false;
  // Its face, where the camera sees it: its rim, its hub or spokes.
  if (cam.c > 0.2) {
    const plane: Plane = { side: 'near', z: z + wheel.width / 2 };
    const cx = x * M;
    const cy = -y * M;
    const R = wheel.r * M;
    const rim = wheel.rim ?? STEEL;
    const c = (r: number, colour: string) =>
      `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${colour}"/>`;
    const spoke = (
      n: number,
      from: number,
      to: number,
      width: number,
      colour: string,
    ) =>
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const d = `M${r1(cx + Math.cos(a) * from)},${r1(cy + Math.sin(a) * from)} L${r1(cx + Math.cos(a) * to)},${r1(cy + Math.sin(a) * to)}`;
        return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${r1(width)}" stroke-linecap="round"/>`;
      }).join('');
    let face: string;
    switch (wheel.face) {
      case 'hubcap':
        face =
          c(R * 0.58, rim) +
          `<g stroke="none">${spoke(5, R * 0.14, R * 0.5, R * 0.1, darker(rim, 0.25))}</g>` +
          c(R * 0.14, DARK);
        break;
      case 'moto':
        face =
          c(R * 0.74, rim) +
          `<g stroke="none">${spoke(6, R * 0.16, R * 0.7, R * 0.08, darker(rim, 0.3))}</g>` +
          c(R * 0.18, DARK);
        break;
      case 'spokes':
        face =
          `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R * 0.86)}" fill="none" stroke="${rim}" stroke-width="${r1(R * 0.05)}"/>` +
          spoke(16, R * 0.06, R * 0.86, 1.1, '#6c6873') +
          c(R * 0.09, DARK);
        break;
      case 'wood':
        face =
          c(R * 0.8, lighter(wheel.rim ?? WOOD, 0.35)) +
          spoke(8, R * 0.2, R * 0.8, R * 0.1, wheel.rim ?? WOOD_DARK) +
          c(R * 0.22, wheel.rim ?? WOOD_DARK);
        break;
    }
    // Turning with the distance gone, where one sees it turn: the near
    // wheels, in their own plane.
    const rig =
      near && !sheet.plain
        ? ` data-wheel="${r1(cx)} ${r1(cy)} ${r1(R)}" data-spin="${Math.round((cam.f / cam.c) * 1000) / 1000}" id="wheel-${k}"`
        : '';
    const ring = open
      ? `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R * 0.95)}" fill="none" stroke="${FIGURE_INK}" stroke-width="${r1(R * 0.1 + LINE * 2)}"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R * 0.95)}" fill="none" stroke="${TYRE}" stroke-width="${r1(R * 0.1)}"/>`
      : c(R, TYRE);
    svg += `<g transform="${planeMatrix(cam, plane)}"><g${rig}>${ring}${face}</g></g>`;
    turning = Boolean(rig);
  }
  sheet.add(near ? 'near' : 'far', depth, svg, tyre);
  return turning ? wheel : null;
}

/** A hull, from any side: its far side, its inside and thwarts, its near side over them. */
function drawHull(sheet: Sheet, h: Hull): void {
  const n = 28;
  const half = h.long / 2;
  const at = (i: number) => -half + (h.long * i) / n;
  const beam = (x: number) => {
    const t = x / half;
    if (t >= 0) return (h.beam / 2) * Math.sqrt(Math.max(0, 1 - t ** 2.2));
    return (
      (h.beam / 2) *
      Math.max(h.transom, Math.sqrt(Math.max(0, 1 - Math.abs(t) ** 2.6)))
    );
  };
  const sheer = (x: number) => h.high + h.sheer * (x / half) ** 2;
  // The keel, rising into the stem at the bow (and at the stern, where
  // it comes to a point): a transom's stays low.
  const keel = (x: number) => {
    const t = x / half;
    const low = -h.draft * Math.max(0.2, 1 - t ** 4);
    const end = t > 0 ? t : h.transom > 0 ? 0 : -t;
    if (end <= 0.55) return low;
    const p = ((end - 0.55) / 0.45) ** 2;
    return low + (sheer(x) - low) * p;
  };
  const xs = Array.from({ length: n + 1 }, (_, i) => at(i));
  const gunwale = (sign: 1 | -1): V3[] =>
    xs.map((x) => [x, sheer(x), sign * beam(x)]);
  const keelLine: V3[] = xs.map((x) => [x, keel(x), 0]);
  const sideOf = (sign: 1 | -1): XY[] => [
    ...gunwale(sign).map((v) => sheet.p(v)),
    ...[...keelLine].reverse().map((v) => sheet.p(v)),
  ];
  const { cam } = sheet;
  const far = sideOf(-1);
  const near = sideOf(1);
  // The inside, where one looks down into it.
  const ring = [...gunwale(1), ...[...gunwale(-1)].reverse()].map((v) =>
    sheet.p(v),
  );
  const mid = depthOf(cam, [0, 0, 0]);
  sheet.add('cabin', mid - 1, shape(pathOf([far]), h.fill), far);
  if (cam.k > 0) {
    sheet.add('cabin', mid - 0.5, shape(pathOf([ring]), h.inside), ring);
    for (const [x, y] of h.thwarts) {
      const w = beam(x) * 0.96;
      const plank: V3[] = [
        [x - 0.12, y, w],
        [x + 0.12, y, w],
        [x + 0.12, y, -w],
        [x - 0.12, y, -w],
      ];
      sheet.add(
        'cabin',
        mid - 0.4,
        shape(pathOf([plank.map((v) => sheet.p(v))]), lighter(h.inside, 0.3)),
      );
    }
  }
  // A transom seen from behind.
  if (h.transom > 0 && cam.s < -0.05) {
    const w = beam(-half);
    const back: V3[] = [
      [-half, sheer(-half), w],
      [-half, sheer(-half), -w],
      [-half, keel(-half), -w * 0.4],
      [-half, keel(-half), w * 0.4],
    ];
    sheet.add(
      'body',
      mid + 0.5,
      shape(pathOf([back.map((v) => sheet.p(v))]), darker(h.fill, 0.1)),
    );
  }
  sheet.add('body', mid + 1, shape(pathOf([near]), h.fill), near);
  // Its near gunwale's rail, and a band along it.
  const rail = gunwale(1).map((v) => sheet.p(v));
  sheet.add(
    'body',
    mid + 1.1,
    inkLine(openPathOf(rail), darker(h.fill, 0.25), 0.05 * M),
  );
  const band = xs.map((x) => sheet.p([x, sheer(x) - 0.14, beam(x) * 0.97]));
  sheet.add(
    'body',
    mid + 1.05,
    `<path d="${openPathOf(band)}" fill="none" stroke="${lighter(h.fill, 0.35)}" stroke-width="${r1(0.05 * M)}"/>`,
  );
}

/** A bicycle's crank: its arms, pedals and chainring, turning with the wheels. */
function drawCrank(sheet: Sheet, crank: Crank): void {
  const { cam } = sheet;
  const [x, y, z] = crank.at;
  const R = crank.r * M;
  const cx = x * M;
  const cy = -y * M;
  const pedal = (a: number) => {
    const px = cx + Math.cos(a) * R;
    const py = cy + Math.sin(a) * R;
    return `<rect x="${r1(px - 0.06 * M)}" y="${r1(py - 0.02 * M)}" width="${r1(0.12 * M)}" height="${r1(0.04 * M)}" rx="2" fill="${DARK}"/>`;
  };
  const arm = (a: number) =>
    `M${r1(cx)},${r1(cy)} L${r1(cx + Math.cos(a) * R)},${r1(cy + Math.sin(a) * R)}`;
  const rig = (side: string) =>
    sheet.plain
      ? ''
      : ` data-wheel="${r1(cx)} ${r1(cy)} ${r1(crank.wheelR * M * crank.gear)}" data-spin="${Math.round((cam.f / Math.max(0.2, cam.c)) * 1000) / 1000}" id="crank-${side}"`;
  const depth = depthOf(cam, crank.at);
  if (cam.c > 0.2) {
    const farPlane: Plane = { side: 'near', z: z - 0.09 };
    const nearPlane: Plane = { side: 'near', z: z + 0.07 };
    // The far arm and pedal, behind the frame; the chainring and near arm before it.
    sheet.add(
      'cabin',
      depth - 0.2,
      `<g transform="${planeMatrix(cam, farPlane)}"><g${rig('far')}>${inkLine(arm(Math.PI * 0.25), STEEL, 0.03 * M)}${pedal(Math.PI * 0.25)}</g></g>`,
    );
    sheet.add(
      'body',
      depth + 0.2,
      `<g transform="${planeMatrix(cam, nearPlane)}"><g${rig('near')}><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(0.1 * M)}" fill="${STEEL}"/>${Array.from(
        { length: 5 },
        (_, i) => {
          const a = (i / 5) * Math.PI * 2;
          return `<circle cx="${r1(cx + Math.cos(a) * 0.06 * M)}" cy="${r1(cy + Math.sin(a) * 0.06 * M)}" r="${r1(0.018 * M)}" fill="${DARK}" stroke="none"/>`;
        },
      ).join(
        '',
      )}${inkLine(arm(Math.PI * 1.25), STEEL, 0.03 * M)}${pedal(Math.PI * 1.25)}</g></g>`,
    );
  } else {
    // Seen end on: the pedals out either side, level.
    const out = (dz: number): XY[] => [
      sheet.p([x, y, z + dz * 0.4]),
      sheet.p([x, y, z + dz]),
    ];
    sheet.add(
      'body',
      depth,
      inkLine(openPathOf(out(0.14)), STEEL, 0.03 * M) +
        inkLine(openPathOf(out(-0.14)), STEEL, 0.03 * M),
    );
  }
}

/** The ground's shadow, or the water's ring about a boat. */
function drawGround(sheet: Sheet, solid: Solid): void {
  const pts = solid.contacts.map((v) => sheet.p(v));
  const xs = [...pts.map((p) => p[0]), ...sheet.points.map((p) => p[0])];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const ys = pts.map((p) => p[1]);
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const ry = Math.max(6, (Math.max(...ys) - Math.min(...ys)) / 2 + 6);
  const rx = (x1 - x0) / 2 + 6;
  const cx = (x0 + x1) / 2;
  sheet.shadow.push(
    solid.water
      ? `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx * 1.04)}" ry="${r1(ry + 4)}" fill="${WATER}" fill-opacity="0.55" stroke="none"/>` +
          `<path d="M${r1(x0 - 10)},${r1(cy)} Q${r1(cx)},${r1(cy + ry * 0.4)} ${r1(x1 + 10)},${r1(cy)}" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="3"/>`
      : `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rx * 0.96)}" ry="${r1(ry)}" fill="#1d1a22" fill-opacity="0.12" stroke="none"/>`,
  );
}

/** Its headlights' beams and its tail lights' glow, for night. */
function drawLights(sheet: Sheet, solid: Solid): void {
  const lamps = solid.lamps;
  if (!lamps || sheet.plain) return;
  const { cam } = sheet;
  for (const [u, v] of lamps.at) {
    const at = onPlane(lamps.front, [u, v]);
    const reach = 2.4;
    const beam: V3[] = [
      [at[0], v + 0.06, at[2]],
      [at[0] + reach, v + 0.3, at[2] - Math.sign(at[2] || 1) * 0.1],
      [
        at[0] + reach,
        Math.max(0.02, v - 0.6),
        at[2] + Math.sign(at[2] || 1) * 0.25,
      ],
      [at[0], v - 0.06, at[2]],
    ];
    sheet.lights.push(
      flatShape(
        pathOf([beam.map((p) => sheet.p(p))]),
        BEAM,
        ' fill-opacity="0.38"',
      ),
    );
    if (facesCamera(cam, lamps.front))
      sheet.lights.push(
        flatShape(
          pathOf([
            circle2([u, v], 0.16).map((p) => sheet.p(onPlane(lamps.front, p))),
          ]),
          BEAM,
          ' fill-opacity="0.75"',
        ),
      );
  }
  if (lamps.back && lamps.tail && facesCamera(cam, lamps.back))
    for (const p of lamps.tail)
      sheet.lights.push(
        flatShape(
          pathOf([
            circle2(p, 0.14).map((q) => sheet.p(onPlane(lamps.back!, q))),
          ]),
          TAIL,
          ' fill-opacity="0.6"',
        ),
      );
}

// ── The kinds ───────────────────────────────────────────────────────────

/** Two lamps either side of the middle, on a plane. */
const pair = (u: number, v: number): P2[] => [
  [-u, v],
  [u, v],
];
const plate = (v: number, colour = '#f5f5f2') => ({
  points: rect2(-0.26, v, 0.52, 0.12, 0.02),
  fill: colour,
});

interface Paint {
  body: string;
  trim: string;
  wood: string;
}

/** A road vehicle's common rig: a car, a taxi, a van, a danfo, a bus, a truck. */
function roadSolid(
  kind: VehicleKitKind,
  paint: Paint,
  livery: VehicleLivery | null,
): Solid {
  const body = paint.body;
  const bumper = DARK;
  switch (kind) {
    case 'car':
    case 'taxi': {
      const L = 2.1;
      const W = 0.88;
      /** The glasshouse, narrower than the body below its waist. */
      const G = 0.74;
      const lower: P2[] = [
        [-L, 0.3],
        [L, 0.3],
        [L + 0.03, 0.62],
        [L - 0.08, 0.84],
        [1.0, 0.94],
        [-1.42, 1.0],
        [-L + 0.06, 0.96],
        [-L - 0.03, 0.7],
      ];
      const upper: P2[] = [
        [-1.42, 1.0],
        [1.0, 0.94],
        [0.32, 1.42],
        [-0.9, 1.42],
      ];
      // The waist: the line from the windscreen's foot to the back window's.
      const waist = { a: [0.0248, 1] as P2, b: 0.9648 };
      const windows: P2[][] = [
        [
          [-1.3, 1.01],
          [-0.3, 1.01],
          [-0.3, 1.35],
          [-0.86, 1.35],
        ],
      ];
      const door = {
        outline: [
          [-0.22, 0.34],
          [0.98, 0.34],
          [0.98, 0.93],
          [0.36, 1.4],
          [-0.22, 1.4],
        ] as P2[],
        pane: [
          [-0.14, 1.0],
          [0.86, 1.0],
          [0.34, 1.34],
          [-0.14, 1.34],
        ] as P2[],
        hinge: [0.98, 0.62] as P2,
        handle: [-0.08, 0.86] as P2,
        upper: { ...waist, z: G },
      };
      const sign =
        kind === 'taxi'
          ? [
              {
                is: 'prism' as const,
                profile: [
                  [-0.28, 1.42],
                  [0.22, 1.42],
                  [0.18, 1.6],
                  [-0.24, 1.6],
                ] as P2[],
                z: [-0.3, 0.3] as [number, number],
                fill: livery === 'london' ? '#f0924a' : '#f5f5f2',
              },
              {
                is: 'decal' as const,
                plane: { side: 'near' as const, z: 0.3 },
                shapes: [
                  {
                    points: rect2(-0.18, 1.47, 0.32, 0.08, 0.02),
                    fill: DARK,
                    ink: false,
                  },
                ],
              },
            ]
          : [];
      const checker: Decal[] =
        kind === 'taxi' && livery !== 'london'
          ? [
              {
                is: 'decal',
                plane: { side: 'near', z: W },
                shapes: Array.from({ length: 14 }, (_, i) => ({
                  points: rect2(
                    -1.85 + i * 0.27,
                    0.66 + (i % 2) * 0.06,
                    0.135,
                    0.06,
                  ),
                  fill: DARK,
                  ink: false,
                })),
              },
            ]
          : [];
      return {
        size: { long: 4.2, wide: 1.76, high: kind === 'taxi' ? 1.6 : 1.42 },
        nearZ: W,
        parts: [
          {
            is: 'prism',
            profile: lower,
            z: [-W, W],
            fill: body,
            holes: [
              {
                points: clipHalf(door.outline, waist.a, waist.b),
                glass: false,
              },
            ],
          },
          {
            is: 'prism',
            profile: upper,
            z: [-G, G],
            fill: body,
            glass: { 1: 0.07, 3: 0.07 },
            holes: [
              ...windows.map((points) => ({ points, glass: true })),
              {
                points: clipHalf(
                  door.outline,
                  [-waist.a[0], -waist.a[1]],
                  -waist.b,
                ),
                glass: false,
              },
            ],
          },
          // Bumpers, lamps and the arches over the wheels, on its side.
          {
            is: 'decal',
            plane: { side: 'near', z: W },
            shapes: [
              { points: rect2(L - 0.34, 0.3, 0.38, 0.14, 0.03), fill: bumper },
              { points: rect2(-L - 0.04, 0.3, 0.38, 0.14, 0.03), fill: bumper },
              { points: rect2(L - 0.2, 0.64, 0.2, 0.1, 0.03), fill: LAMP },
              { points: rect2(-L - 0.02, 0.72, 0.14, 0.12, 0.03), fill: TAIL },
              ...[-1.32, 1.32].map((x) => ({
                points: circle2([x, 0.32], 0.4, 20).filter(([, y]) => y >= 0.3),
                fill: darker(body, 0.45),
              })),
            ],
          },
          ...checker,
          ...sign,
          {
            is: 'decal',
            plane: { side: 'front', x: L + 0.03 },
            shapes: [
              { points: rect2(-0.82, 0.3, 1.64, 0.16, 0.04), fill: bumper },
              {
                points: rect2(-0.34, 0.5, 0.68, 0.16, 0.04),
                fill: darker(body, 0.4),
              },
              ...pair(0.62, 0.6).map((p) => ({
                points: rect2(p[0] - 0.14, p[1] - 0.06, 0.28, 0.13, 0.05),
                fill: LAMP,
              })),
              plate(0.32),
            ],
          },
          {
            is: 'decal',
            plane: { side: 'back', x: -L - 0.03 },
            shapes: [
              { points: rect2(-0.82, 0.3, 1.64, 0.16, 0.04), fill: bumper },
              ...pair(0.64, 0.72).map((p) => ({
                points: rect2(p[0] - 0.13, p[1] - 0.07, 0.26, 0.14, 0.04),
                fill: TAIL,
              })),
              plate(0.5),
            ],
          },
          // Inside, seen through the glass: the seats' backs and the steering wheel.
          ...seatBacks(
            [
              [-0.02, 0.45],
              [-0.02, -0.45],
              [-0.98, 0.45],
            ],
            0.62,
            1.2,
          ),
          steeringWheel([0.62, 0.98, 0.45]),
          ...[-1.32, 1.32].flatMap((x) =>
            [W - 0.12, -(W - 0.12)].map((z): Wheel => ({
              is: 'wheel',
              at: [x, 0.32, z],
              r: 0.32,
              width: 0.22,
              face: 'hubcap',
            })),
          ),
        ],
        seats: [
          {
            id: 'driver',
            hip: [-0.05, 0.62, 0.45],
            feet: [[0.72, 0.36, 0.45]],
            hands: [[0.6, 1.02, 0.45]],
            pose: 'drive',
          },
          {
            id: 'passenger',
            hip: [-0.05, 0.62, -0.45],
            feet: [[0.72, 0.36, -0.45]],
            pose: 'passenger',
          },
          {
            id: 'back',
            hip: [-1.0, 0.62, 0.45],
            feet: [[-0.36, 0.36, 0.45]],
            pose: 'passenger',
          },
        ],
        grips: [{ id: 'steering-wheel', at: [0.6, 1.02, 0.45] }],
        door,
        mount: [0.3, 0, W + 0.35],
        lamps: {
          front: { side: 'front', x: L + 0.03 },
          at: pair(0.62, 0.6),
          back: { side: 'back', x: -L - 0.03 },
          tail: pair(0.64, 0.72),
        },
        contacts: [-1.32, 1.32].flatMap(
          (x) =>
            [
              [x, 0, W - 0.12],
              [x, 0, -(W - 0.12)],
            ] as V3[],
        ),
        bob: { amp: 1.6, every: 2.4 },
      };
    }
    case 'van':
    case 'danfo': {
      const danfo = kind === 'danfo';
      const L = danfo ? 2.3 : 2.5;
      const W = danfo ? 0.92 : 0.97;
      const H = danfo ? 2.0 : 2.0;
      const profile: P2[] = danfo
        ? [
            [-L, 0.32],
            [L, 0.32],
            [L + 0.04, 0.7],
            [L, 1.08],
            [L - 0.12, 1.88],
            [L - 0.3, H],
            [-L + 0.12, H],
            [-L - 0.02, 1.86],
          ]
        : [
            [-L, 0.32],
            [L, 0.32],
            [L + 0.03, 0.72],
            [L - 0.12, 0.96],
            [1.72, 1.16],
            [1.32, 1.95],
            [-L + 0.08, H],
            [-L - 0.02, 1.9],
          ];
      const windows: P2[][] = danfo
        ? [
            rect2(-2.12, 1.22, 0.6, 0.58, 0.05),
            rect2(-1.42, 1.22, 0.6, 0.58, 0.05),
            rect2(-0.72, 1.22, 0.6, 0.58, 0.05),
            [
              [1.3, 1.2],
              [2.0, 1.2],
              [1.92, 1.8],
              [1.3, 1.8],
            ],
          ]
        : [
            rect2(-2.25, 1.26, 0.7, 0.54, 0.05),
            [
              [0.98, 1.2],
              [1.62, 1.2],
              [1.3, 1.84],
              [0.98, 1.84],
            ],
          ];
      const door = danfo
        ? {
            outline: rect2(0.02, 0.36, 1.1, 1.52),
            pane: rect2(0.12, 1.22, 0.9, 0.58, 0.05),
            slide: -1.0,
            handle: [0.98, 0.95] as P2,
          }
        : {
            outline: rect2(-0.62, 0.36, 1.4, 1.58),
            pane: rect2(-0.52, 1.28, 1.2, 0.52, 0.05),
            slide: -1.1,
            handle: [0.62, 0.95] as P2,
          };
      const stripes: Decal[] = danfo
        ? [
            {
              is: 'decal',
              plane: { side: 'near', z: W },
              shapes: [
                {
                  points: rect2(-L, 0.98, 2 * L + 0.02, 0.1),
                  fill: DARK,
                  ink: false,
                },
                {
                  points: rect2(-L, 0.84, 2 * L + 0.02, 0.06),
                  fill: DARK,
                  ink: false,
                },
              ],
            },
            {
              is: 'decal',
              plane: { side: 'front', x: L + 0.03 },
              shapes: [
                { points: rect2(-W, 0.98, 2 * W, 0.1), fill: DARK, ink: false },
                {
                  points: rect2(-W, 0.84, 2 * W, 0.06),
                  fill: DARK,
                  ink: false,
                },
              ],
            },
            {
              is: 'decal',
              plane: { side: 'back', x: -L - 0.03 },
              shapes: [
                { points: rect2(-W, 0.98, 2 * W, 0.1), fill: DARK, ink: false },
                {
                  points: rect2(-W, 0.84, 2 * W, 0.06),
                  fill: DARK,
                  ink: false,
                },
              ],
            },
          ]
        : [];
      // A danfo's roof rack and what is tied on it.
      const rack: Part[] = danfo
        ? [
            {
              is: 'prism',
              profile: rect2(-1.9, H, 3.2, 0.08),
              z: [-0.8, 0.8],
              fill: STEEL,
            },
            {
              is: 'prism',
              profile: rect2(-1.6, H + 0.08, 0.9, 0.34, 0.08),
              z: [-0.5, 0.35],
              fill: CLOTH.blue,
            },
            {
              is: 'prism',
              profile: rect2(-0.5, H + 0.08, 1.0, 0.24, 0.06),
              z: [-0.3, 0.6],
              fill: CLOTH.red,
            },
          ]
        : [];
      return {
        size: { long: 2 * L, wide: 2 * W, high: danfo ? H + 0.42 : H },
        nearZ: W,
        parts: [
          {
            is: 'prism',
            profile,
            z: [-W, W],
            fill: body,
            glass: danfo ? { 3: 0.08 } : { 4: 0.08 },
            holes: [
              ...windows.map((points) => ({ points, glass: true })),
              { points: door.outline, glass: false },
            ],
          },
          ...rack,
          ...stripes,
          {
            is: 'decal',
            plane: { side: 'near', z: W },
            shapes: [
              { points: rect2(L - 0.3, 0.32, 0.36, 0.15, 0.03), fill: bumper },
              {
                points: rect2(-L - 0.04, 0.32, 0.36, 0.15, 0.03),
                fill: bumper,
              },
              { points: rect2(L - 0.14, 0.66, 0.16, 0.12, 0.03), fill: LAMP },
              { points: rect2(-L - 0.02, 0.66, 0.12, 0.2, 0.03), fill: TAIL },
              ...[-(L - 0.62), L - 0.62].map((x) => ({
                points: circle2([x, 0.34], 0.42, 20).filter(
                  ([, y]) => y >= 0.32,
                ),
                fill: darker(body, 0.45),
              })),
            ],
          },
          {
            is: 'decal',
            plane: { side: 'front', x: L + 0.03 },
            shapes: [
              {
                points: rect2(-W + 0.04, 0.32, 2 * W - 0.08, 0.16, 0.04),
                fill: bumper,
              },
              ...(danfo
                ? []
                : [
                    {
                      points: rect2(-0.4, 0.56, 0.8, 0.2, 0.04),
                      fill: darker(body, 0.4),
                    },
                  ]),
              ...pair(W - 0.26, 0.64).map((p) => ({
                points: circle2(p, 0.12, 16),
                fill: LAMP,
              })),
              plate(0.34),
            ],
          },
          {
            is: 'decal',
            plane: { side: 'back', x: -L - 0.03 },
            shapes: [
              {
                points: rect2(-W + 0.04, 0.32, 2 * W - 0.08, 0.16, 0.04),
                fill: bumper,
              },
              {
                points: rect2(-W + 0.16, 1.24, 2 * W - 0.32, 0.56, 0.05),
                fill: GLASS_BACK,
              },
              ...pair(W - 0.16, 0.74).map((p) => ({
                points: rect2(p[0] - 0.08, p[1] - 0.12, 0.16, 0.24, 0.03),
                fill: TAIL,
              })),
              plate(0.52),
            ],
          },
          ...seatBacks(
            danfo
              ? [
                  [1.28, 0.45],
                  [1.28, -0.45],
                  [0.3, -0.45],
                  [-0.6, 0.45],
                  [-0.6, -0.45],
                  [-1.5, 0.45],
                  [-1.5, -0.45],
                ]
              : [
                  [1.0, 0.45],
                  [1.0, -0.45],
                ],
            0.72,
            1.35,
          ),
          steeringWheel([danfo ? 1.82 : 1.52, 1.12, 0.45]),
          ...[-(L - 0.62), L - 0.62].flatMap((x) =>
            [W - 0.14, -(W - 0.14)].map((z): Wheel => ({
              is: 'wheel',
              at: [x, 0.34, z],
              r: 0.34,
              width: 0.22,
              face: 'hubcap',
            })),
          ),
        ],
        seats: danfo
          ? [
              {
                id: 'driver',
                hip: [1.26, 0.8, 0.45],
                feet: [[1.9, 0.42, 0.45]],
                hands: [[1.82, 1.14, 0.45]],
                pose: 'drive',
              },
              {
                id: 'passenger',
                hip: [1.26, 0.8, -0.45],
                feet: [[1.9, 0.42, -0.45]],
                pose: 'passenger',
              },
              ...[0.28, -0.62, -1.52].flatMap((x, i) => [
                {
                  id: `row-${i + 1}-near`,
                  hip: [x, 0.8, 0.45] as V3,
                  feet: [[x + 0.55, 0.42, 0.45] as V3],
                  pose: 'passenger' as const,
                },
                {
                  id: `row-${i + 1}-far`,
                  hip: [x, 0.8, -0.45] as V3,
                  feet: [[x + 0.55, 0.42, -0.45] as V3],
                  pose: 'passenger' as const,
                },
              ]),
            ]
          : [
              {
                id: 'driver',
                hip: [0.98, 0.8, 0.45],
                feet: [[1.66, 0.42, 0.45]],
                hands: [[1.52, 1.14, 0.45]],
                pose: 'drive',
              },
              {
                id: 'passenger',
                hip: [0.98, 0.8, -0.45],
                feet: [[1.66, 0.42, -0.45]],
                pose: 'passenger',
              },
            ],
        grips: [
          { id: 'steering-wheel', at: [danfo ? 1.82 : 1.52, 1.14, 0.45] },
        ],
        door,
        mount: [danfo ? 0.56 : 0.08, 0, W + 0.35],
        steps: [[danfo ? 0.56 : 0.08, 0.32, W]],
        lamps: {
          front: { side: 'front', x: L + 0.03 },
          at: pair(W - 0.26, 0.64),
          back: { side: 'back', x: -L - 0.03 },
          tail: pair(W - 0.16, 0.74),
        },
        contacts: [-(L - 0.62), L - 0.62].flatMap(
          (x) =>
            [
              [x, 0, W - 0.14],
              [x, 0, -(W - 0.14)],
            ] as V3[],
        ),
        bob: { amp: danfo ? 3 : 2, every: danfo ? 1.8 : 2.6 },
      };
    }
    case 'bus': {
      const decker = livery === 'london';
      const L = decker ? 5.6 : 5.25;
      const W = 1.25;
      const H = decker ? 4.3 : 3.1;
      const profile: P2[] = [
        [-L, 0.36],
        [L, 0.36],
        [L + 0.04, 0.92],
        [L - 0.02, H - 0.22],
        [L - 0.24, H],
        [-L + 0.16, H],
        [-L - 0.02, H - 0.2],
      ];
      const row = (y: number, from: number, to: number, h: number): P2[][] => {
        const out: P2[][] = [];
        for (let x = from; x + 0.9 <= to + 1e-6; x += 1.12)
          out.push(rect2(x, y, 0.98, h, 0.06));
        return out;
      };
      const windows = [
        ...row(1.5, -L + 0.3, 3.3, 1.0),
        ...(decker ? row(3.02, -L + 0.3, L - 0.3, 0.9) : []),
      ];
      const door = {
        outline: rect2(3.56, 0.4, 1.2, 2.3),
        pane: rect2(3.66, 0.9, 1.0, 1.66, 0.05),
        slide: -1.0,
        handle: [3.64, 1.4] as P2,
      };
      return {
        size: { long: 2 * L, wide: 2 * W, high: H },
        nearZ: W,
        parts: [
          {
            is: 'prism',
            profile,
            z: [-W, W],
            fill: body,
            holes: [
              ...windows.map((points) => ({ points, glass: true })),
              { points: door.outline, glass: false },
            ],
          },
          {
            is: 'decal',
            plane: { side: 'near', z: W },
            shapes: [
              {
                points: rect2(-L, 1.18, 2 * L + 0.02, 0.16),
                fill: decker ? '#f5f5f2' : lighter(body, 0.6),
                ink: false,
              },
              { points: rect2(L - 0.28, 0.36, 0.32, 0.18, 0.03), fill: bumper },
              {
                points: rect2(-L - 0.04, 0.36, 0.32, 0.18, 0.03),
                fill: bumper,
              },
              { points: rect2(L - 0.14, 0.7, 0.16, 0.14, 0.03), fill: LAMP },
              { points: rect2(-L - 0.02, 0.7, 0.12, 0.24, 0.03), fill: TAIL },
              ...[-(L - 1.4), L - 1.3].map((x) => ({
                points: circle2([x, 0.5], 0.58, 20).filter(
                  ([, y]) => y >= 0.36,
                ),
                fill: darker(body, 0.45),
              })),
            ],
          },
          {
            is: 'decal',
            plane: { side: 'front', x: L + 0.04 },
            shapes: [
              {
                points: rect2(-W + 0.06, 0.36, 2 * W - 0.12, 0.2, 0.04),
                fill: bumper,
              },
              {
                points: rect2(-W + 0.14, 1.34, 2 * W - 0.28, 1.2, 0.06),
                fill: GLASS_BACK,
              },
              {
                points: rect2(-W + 0.14, 1.34, 2 * W - 0.28, 1.2, 0.06),
                fill: GLASS,
                opacity: 0.4,
              },
              { points: rect2(-0.8, H - 0.46, 1.6, 0.28, 0.04), fill: DARK },
              ...(decker
                ? [
                    {
                      points: rect2(-W + 0.14, 3.02, 2 * W - 0.28, 0.8, 0.06),
                      fill: GLASS_BACK,
                    },
                  ]
                : []),
              ...pair(W - 0.3, 0.72).map((p) => ({
                points: circle2(p, 0.13, 16),
                fill: LAMP,
              })),
              plate(0.4),
            ],
          },
          {
            is: 'decal',
            plane: { side: 'back', x: -L - 0.04 },
            shapes: [
              {
                points: rect2(-W + 0.06, 0.36, 2 * W - 0.12, 0.2, 0.04),
                fill: bumper,
              },
              {
                points: rect2(-W + 0.2, 1.6, 2 * W - 0.4, 0.9, 0.06),
                fill: GLASS_BACK,
              },
              ...pair(W - 0.2, 0.8).map((p) => ({
                points: rect2(p[0] - 0.1, p[1] - 0.14, 0.2, 0.28, 0.03),
                fill: TAIL,
              })),
              plate(0.62),
            ],
          },
          ...seatBacks(
            [2.9, 1.8, 0.7, -0.4, -1.5, -2.6, -3.7].flatMap((x) => [
              [x, 0.6],
              [x, -0.6],
            ]),
            1.0,
            1.72,
          ),
          steeringWheel([4.72, 1.46, 0.6]),
          ...[-(L - 1.4), L - 1.3].flatMap((x) =>
            [W - 0.18, -(W - 0.18)].map((z): Wheel => ({
              is: 'wheel',
              at: [x, 0.5, z],
              r: 0.5,
              width: 0.3,
              face: 'hubcap',
            })),
          ),
        ],
        seats: [
          {
            id: 'driver',
            hip: [4.3, 1.1, 0.6],
            feet: [[4.9, 0.6, 0.6]],
            hands: [[4.72, 1.48, 0.6]],
            pose: 'drive',
          },
          ...[2.9, 1.8, 0.7, -0.4].flatMap((x, i) => [
            {
              id: `row-${i + 1}-near`,
              hip: [x - 0.1, 1.1, 0.6] as V3,
              feet: [[x + 0.4, 0.62, 0.6] as V3],
              pose: 'passenger' as const,
            },
            {
              id: `row-${i + 1}-far`,
              hip: [x - 0.1, 1.1, -0.6] as V3,
              feet: [[x + 0.4, 0.62, -0.6] as V3],
              pose: 'passenger' as const,
            },
          ]),
        ],
        grips: [{ id: 'steering-wheel', at: [4.72, 1.48, 0.6] }],
        door,
        mount: [4.16, 0, W + 0.4],
        steps: [
          [4.16, 0.36, W],
          [4.16, 0.62, W - 0.3],
        ],
        lamps: {
          front: { side: 'front', x: L + 0.04 },
          at: pair(W - 0.3, 0.72),
          back: { side: 'back', x: -L - 0.04 },
          tail: pair(W - 0.2, 0.8),
        },
        contacts: [-(L - 1.4), L - 1.3].flatMap(
          (x) =>
            [
              [x, 0, W - 0.18],
              [x, 0, -(W - 0.18)],
            ] as V3[],
        ),
        bob: { amp: 2.5, every: 3.4 },
      };
    }
    default: {
      // A truck: its cab in front, its box behind on the chassis.
      const W = 1.2;
      const cab: P2[] = [
        [1.6, 0.62],
        [3.6, 0.62],
        [3.64, 1.08],
        [3.5, 1.6],
        [3.36, 2.7],
        [3.2, 2.82],
        [1.6, 2.82],
      ];
      const door = {
        outline: [
          [2.1, 0.66],
          [3.3, 0.66],
          [3.3, 2.7],
          [2.1, 2.7],
        ] as P2[],
        pane: rect2(2.2, 1.72, 1.0, 0.86, 0.06),
        hinge: [3.3, 1.5] as P2,
        handle: [2.24, 1.5] as P2,
      };
      return {
        size: { long: 7.24, wide: 2 * W, high: 3.4 },
        nearZ: W,
        parts: [
          {
            is: 'prism',
            profile: rect2(-3.6, 0.5, 7.2, 0.22),
            z: [-W + 0.2, W - 0.2],
            fill: DARK,
          },
          {
            is: 'prism',
            profile: rect2(-3.62, 0.72, 5.1, 2.68, 0.04),
            z: [-W, W],
            fill: paint.trim,
          },
          {
            is: 'prism',
            profile: cab,
            z: [-W, W],
            fill: body,
            glass: { 3: 0.09 },
            holes: [
              { points: door.outline, glass: false },
              {
                points: [
                  [1.72, 1.72],
                  [2.02, 1.72],
                  [2.02, 2.58],
                  [1.72, 2.58],
                ],
                glass: true,
              },
            ],
          },
          {
            is: 'decal',
            plane: { side: 'near', z: W },
            shapes: [
              {
                points: rect2(-3.3, 1.3, 4.3, 0.5, 0.1),
                fill: body,
                ink: true,
              },
              { points: rect2(3.2, 0.62, 0.44, 0.2, 0.03), fill: bumper },
              { points: rect2(3.44, 0.94, 0.18, 0.14, 0.03), fill: LAMP },
              { points: rect2(-3.64, 0.8, 0.12, 0.3, 0.03), fill: TAIL },
              ...[-2.6, -1.5, 2.66].map((x) => ({
                points: circle2([x, 0.52], 0.6, 20).filter(([, y]) => y >= 0.5),
                fill: DARK,
              })),
            ],
          },
          {
            is: 'decal',
            plane: { side: 'front', x: 3.66 },
            shapes: [
              {
                points: rect2(-W + 0.04, 0.6, 2 * W - 0.08, 0.24, 0.04),
                fill: bumper,
              },
              {
                points: rect2(-0.62, 0.92, 1.24, 0.5, 0.05),
                fill: darker(body, 0.4),
              },
              ...pair(W - 0.28, 1.0).map((p) => ({
                points: rect2(p[0] - 0.14, p[1] - 0.09, 0.28, 0.18, 0.05),
                fill: LAMP,
              })),
              plate(0.64),
            ],
          },
          {
            is: 'decal',
            plane: { side: 'back', x: -3.64 },
            shapes: [
              {
                points: rect2(-W + 0.08, 0.8, W - 0.1, 2.5, 0.04),
                fill: lighter(paint.trim, 0.1),
              },
              {
                points: rect2(0.02, 0.8, W - 0.1, 2.5, 0.04),
                fill: lighter(paint.trim, 0.1),
              },
              ...pair(W - 0.18, 0.66).map((p) => ({
                points: rect2(p[0] - 0.1, p[1] - 0.08, 0.2, 0.16, 0.03),
                fill: TAIL,
              })),
            ],
          },
          ...seatBacks([[2.62, 0.55]], 1.45, 2.3),
          steeringWheel([3.1, 1.86, 0.55]),
          ...[-2.6, -1.5, 2.66].flatMap((x) =>
            [W - 0.2, -(W - 0.2)].map((z): Wheel => ({
              is: 'wheel',
              at: [x, 0.5, z],
              r: 0.5,
              width: 0.32,
              face: 'hubcap',
            })),
          ),
        ],
        seats: [
          {
            id: 'driver',
            hip: [2.58, 1.62, 0.55],
            feet: [[3.2, 1.0, 0.55]],
            hands: [[3.08, 1.88, 0.55]],
            pose: 'drive',
          },
          {
            id: 'passenger',
            hip: [2.58, 1.62, -0.55],
            feet: [[3.2, 1.0, -0.55]],
            pose: 'passenger',
          },
        ],
        grips: [{ id: 'steering-wheel', at: [3.08, 1.88, 0.55] }],
        door,
        mount: [2.7, 0, W + 0.4],
        steps: [[2.7, 0.44, W + 0.05]],
        lamps: {
          front: { side: 'front', x: 3.66 },
          at: pair(W - 0.28, 1.0),
          back: { side: 'back', x: -3.64 },
          tail: pair(W - 0.18, 0.66),
        },
        contacts: [-2.6, -1.5, 2.66].flatMap(
          (x) =>
            [
              [x, 0, W - 0.2],
              [x, 0, -(W - 0.2)],
            ] as V3[],
        ),
        bob: { amp: 2.5, every: 3 },
      };
    }
  }
}

/** Seat backs seen through the glass, at (x, z), from a height to a height. */
function seatBacks(at: [number, number][], y0: number, y1: number): Part[] {
  return at.map(([x, z]) => ({
    is: 'decal' as const,
    plane: { side: 'near' as const, z },
    shapes: [
      { points: rect2(x - 0.2, y0, 0.2, y1 - y0 - 0.12, 0.06), fill: SEAT },
      { points: rect2(x - 0.18, y1 - 0.14, 0.16, 0.16, 0.05), fill: SEAT },
    ],
    layer: 'cabin' as const,
  }));
}

/** A steering wheel, tilted toward the driver. */
function steeringWheel([x, y, z]: V3): Part {
  const points = circle2([0, 0], 0.19, 16).map(([a, b]): V3 => [
    x + b * 0.4,
    y + b * 0.9,
    z + a,
  ]);
  return { is: 'flat', points, fill: DARK, layer: 'cabin' };
}

/** A bicycle or a motorbike. */
function twoWheelSolid(kind: 'bicycle' | 'motorbike', paint: Paint): Solid {
  const frame = paint.body;
  if (kind === 'bicycle') {
    const r = 0.34;
    const rear: V3 = [-0.52, r, 0];
    const front: V3 = [0.54, r, 0];
    const bb: V3 = [-0.02, 0.3, 0];
    const seatTop: V3 = [-0.15, 0.84, 0];
    const headTop: V3 = [0.37, 0.86, 0];
    const headLow: V3 = [0.41, 0.7, 0];
    const bar: V3 = [0.33, 1.0, 0];
    const tube = (
      points: V3[],
      width = 0.035,
      colour = frame,
      layer: Layer = 'cabin',
    ): Tube => ({ is: 'tube', points, width, colour, layer });
    return {
      size: { long: 1.78, wide: 0.6, high: 1.06 },
      nearZ: 0.05,
      parts: [
        { is: 'wheel', at: rear, r, width: 0.045, face: 'spokes' },
        { is: 'wheel', at: front, r, width: 0.045, face: 'spokes' },
        tube([rear, bb, seatTop, rear]),
        tube([seatTop, headTop, headLow, bb]),
        tube([headLow, front], 0.03, CHROME),
        tube([headTop, bar], 0.03, CHROME),
        tube(
          [
            [0.33, 1.0, -0.3],
            [0.33, 1.0, 0.3],
          ],
          0.028,
          CHROME,
        ),
        tube(
          [
            [0.33, 1.0, -0.3],
            [0.33, 1.0, -0.2],
          ],
          0.04,
          DARK,
        ),
        tube(
          [
            [0.33, 1.0, 0.2],
            [0.33, 1.0, 0.3],
          ],
          0.04,
          DARK,
        ),
        tube([seatTop, [-0.17, 0.92, 0]], 0.03, CHROME),
        {
          is: 'prism',
          profile: [
            [-0.3, 0.92],
            [-0.04, 0.92],
            [-0.06, 0.97],
            [-0.28, 0.99],
          ],
          z: [-0.07, 0.07],
          fill: DARK,
          layer: 'cabin',
        },
        // The chain, from the chainring to the back wheel.
        tube(
          [
            [-0.02, 0.4, 0.04],
            [-0.52, 0.38, 0.04],
          ],
          0.012,
          DARK,
        ),
        tube(
          [
            [-0.02, 0.2, 0.04],
            [-0.52, 0.3, 0.04],
          ],
          0.012,
          DARK,
        ),
        { is: 'crank', at: bb, r: 0.17, gear: 2.6, wheelR: r, colour: STEEL },
        // A lamp on the handlebars.
        {
          is: 'prism',
          profile: rect2(0.36, 0.9, 0.08, 0.07, 0.02),
          z: [-0.04, 0.04],
          fill: LAMP,
        },
      ],
      seats: [
        {
          id: 'rider',
          hip: [-0.17, 0.98, 0],
          feet: [
            [
              -0.02 + 0.17 * Math.cos(Math.PI * 0.25),
              0.3 - 0.17 * Math.sin(Math.PI * 0.25),
              0.12,
            ],
            [
              -0.02 - 0.17 * Math.cos(Math.PI * 0.25),
              0.3 + 0.17 * Math.sin(Math.PI * 0.25),
              -0.12,
            ],
          ],
          hands: [
            [0.33, 1.0, 0.25],
            [0.33, 1.0, -0.25],
          ],
          pose: 'ride',
        },
      ],
      grips: [
        { id: 'bar-near', at: [0.33, 1.0, 0.25] },
        { id: 'bar-far', at: [0.33, 1.0, -0.25] },
      ],
      mount: [-0.3, 0, 0.45],
      lamps: { front: { side: 'front', x: 0.44 }, at: [[0, 0.93]] },
      contacts: [
        [-0.52, 0, 0],
        [0.54, 0, 0],
      ],
      bob: { amp: 0, every: 1 },
    };
  }
  const r = 0.31;
  const tube = (
    points: V3[],
    width = 0.05,
    colour = CHROME,
    layer: Layer = 'cabin',
  ): Tube => ({ is: 'tube', points, width, colour, layer });
  return {
    size: { long: 2.0, wide: 0.76, high: 1.18 },
    nearZ: 0.2,
    parts: [
      { is: 'wheel', at: [-0.66, r, 0], r, width: 0.11, face: 'moto' },
      { is: 'wheel', at: [0.66, r, 0], r, width: 0.1, face: 'moto' },
      tube(
        [
          [0.66, r, 0.06],
          [0.46, 0.96, 0.06],
        ],
        0.045,
      ),
      tube(
        [
          [0.66, r, -0.06],
          [0.46, 0.96, -0.06],
        ],
        0.045,
      ),
      tube(
        [
          [-0.66, r, 0.08],
          [-0.2, 0.52, 0.08],
        ],
        0.05,
        DARK,
      ),
      tube(
        [
          [-0.5, 0.55, 0.12],
          [-0.12, 0.66, 0.12],
        ],
        0.03,
        DARK,
      ),
      // The engine, the tank, the seat and the mudguards.
      {
        is: 'prism',
        profile: rect2(-0.24, 0.3, 0.46, 0.4, 0.06),
        z: [-0.14, 0.14],
        fill: '#6c6a73',
        layer: 'cabin',
      },
      tube(
        [
          [-0.1, 0.36, 0.17],
          [-0.8, 0.42, 0.17],
        ],
        0.07,
        STEEL,
        'body',
      ),
      {
        is: 'prism',
        profile: [
          [-0.1, 0.72],
          [0.4, 0.78],
          [0.44, 0.9],
          [0.3, 1.0],
          [-0.06, 0.96],
        ],
        z: [-0.15, 0.15],
        fill: frame,
        layer: 'cabin',
      },
      {
        is: 'prism',
        profile: [
          [-0.8, 0.8],
          [-0.08, 0.8],
          [-0.06, 0.9],
          [-0.78, 0.9],
        ],
        z: [-0.14, 0.14],
        fill: DARK,
        layer: 'cabin',
      },
      {
        is: 'prism',
        profile: [
          [-0.98, 0.62],
          [-0.8, 0.72],
          [-0.4, 0.74],
          [-0.4, 0.8],
          [-0.86, 0.8],
          [-1.0, 0.7],
        ],
        z: [-0.1, 0.1],
        fill: frame,
        layer: 'cabin',
      },
      {
        is: 'prism',
        profile: [
          [0.46, 0.6],
          [0.7, 0.66],
          [0.88, 0.6],
          [0.86, 0.66],
          [0.7, 0.72],
          [0.46, 0.66],
        ],
        z: [-0.08, 0.08],
        fill: frame,
        layer: 'cabin',
      },
      // Handlebars, mirrors and its lamp.
      tube(
        [
          [0.46, 0.96, 0],
          [0.4, 1.08, 0],
        ],
        0.04,
      ),
      tube(
        [
          [0.38, 1.08, -0.38],
          [0.38, 1.08, 0.38],
        ],
        0.035,
        CHROME,
      ),
      tube(
        [
          [0.38, 1.08, -0.38],
          [0.38, 1.08, -0.26],
        ],
        0.05,
        DARK,
      ),
      tube(
        [
          [0.38, 1.08, 0.26],
          [0.38, 1.08, 0.38],
        ],
        0.05,
        DARK,
      ),
      tube(
        [
          [0.4, 1.08, 0.24],
          [0.36, 1.26, 0.28],
        ],
        0.012,
        DARK,
      ),
      tube(
        [
          [0.4, 1.08, -0.24],
          [0.36, 1.26, -0.28],
        ],
        0.012,
        DARK,
      ),
      {
        is: 'prism',
        profile: rect2(0.46, 0.9, 0.14, 0.16, 0.04),
        z: [-0.08, 0.08],
        fill: LAMP,
        layer: 'cabin',
      },
      {
        is: 'prism',
        profile: rect2(-1.02, 0.7, 0.06, 0.08, 0.02),
        z: [-0.05, 0.05],
        fill: TAIL,
        layer: 'cabin',
      },
      // Its footrests.
      tube(
        [
          [-0.02, 0.4, 0.14],
          [-0.02, 0.4, 0.26],
        ],
        0.03,
        DARK,
        'body',
      ),
      tube(
        [
          [-0.46, 0.46, 0.14],
          [-0.46, 0.46, 0.26],
        ],
        0.03,
        DARK,
        'body',
      ),
    ],
    seats: [
      {
        id: 'rider',
        hip: [-0.22, 0.94, 0],
        feet: [
          [-0.02, 0.42, 0.2],
          [-0.02, 0.42, -0.2],
        ],
        hands: [
          [0.38, 1.08, 0.32],
          [0.38, 1.08, -0.32],
        ],
        pose: 'ride',
      },
      {
        id: 'pillion',
        hip: [-0.6, 0.96, 0],
        feet: [
          [-0.46, 0.48, 0.22],
          [-0.46, 0.48, -0.22],
        ],
        hands: [
          [-0.34, 1.2, 0.14],
          [-0.34, 1.2, -0.14],
        ],
        pose: 'ride',
      },
    ],
    grips: [
      { id: 'bar-near', at: [0.38, 1.08, 0.32] },
      { id: 'bar-far', at: [0.38, 1.08, -0.32] },
    ],
    mount: [-0.3, 0, 0.5],
    lamps: {
      front: { side: 'front', x: 0.6 },
      at: [[0, 0.98]],
      back: { side: 'back', x: -1.02 },
      tail: [[0, 0.74]],
    },
    contacts: [
      [-0.66, 0, 0],
      [0.66, 0, 0],
    ],
    bob: { amp: 1, every: 1.6 },
  };
}

/** Carts pushed or drawn, a wheelbarrow and a chariot: wood and wheels. */
function cartSolid(
  kind: 'handcart' | 'animal-cart' | 'wheelbarrow' | 'chariot',
  paint: Paint,
): Solid {
  const wood = paint.wood;
  const inside = darker(wood, 0.3);
  const plank = (y: number, x0: number, x1: number, z: number): Decal => ({
    is: 'decal',
    plane: { side: 'near', z },
    shapes: [
      {
        points: rect2(x0, y, x1 - x0, 0.02),
        fill: darker(wood, 0.35),
        ink: false,
      },
    ],
  });
  switch (kind) {
    case 'handcart': {
      const W = 0.45;
      return {
        size: { long: 1.9, wide: 1.2, high: 0.95 },
        nearZ: W,
        parts: [
          {
            is: 'prism',
            profile: rect2(-0.62, 0.5, 1.24, 0.36, 0.02),
            z: [-W, W],
            fill: wood,
            top: inside,
          },
          plank(0.62, -0.6, 0.6, W),
          plank(0.74, -0.6, 0.6, W),
          ...[0.3, -0.3].map((z): Tube => ({
            is: 'tube',
            points: [
              [-0.6, 0.76, z],
              [-1.2, 0.94, z],
            ],
            width: 0.045,
            colour: WOOD_DARK,
            layer: 'near',
          })),
          {
            is: 'tube',
            points: [
              [-1.16, 0.93, -0.3],
              [-1.16, 0.93, 0.3],
            ],
            width: 0.04,
            colour: WOOD_DARK,
            layer: 'near',
          },
          ...[0.3, -0.3].map((z): Tube => ({
            is: 'tube',
            points: [
              [0.5, 0.5, z],
              [0.56, 0.02, z],
            ],
            width: 0.04,
            colour: WOOD_DARK,
            layer: 'far',
          })),
          {
            is: 'tube',
            points: [
              [0.04, 0.32, -0.55],
              [0.04, 0.32, 0.55],
            ],
            width: 0.04,
            colour: DARK,
            layer: 'far',
          },
          ...[0.55, -0.55].map((z): Wheel => ({
            is: 'wheel',
            at: [0.04, 0.32, z],
            r: 0.32,
            width: 0.07,
            face: 'wood',
            rim: WOOD_DARK,
          })),
        ],
        seats: [],
        grips: [
          { id: 'handle-near', at: [-1.16, 0.93, 0.26] },
          { id: 'handle-far', at: [-1.16, 0.93, -0.26] },
        ],
        mount: [-1.45, 0, 0],
        contacts: [
          [0.04, 0, 0.55],
          [0.04, 0, -0.55],
          [0.56, 0, 0.3],
        ],
        bob: { amp: 1.5, every: 0.9 },
      };
    }
    case 'wheelbarrow': {
      return {
        size: { long: 1.5, wide: 0.62, high: 0.72 },
        nearZ: 0.3,
        parts: [
          ...[0.24, -0.24].map((z): Tube => ({
            is: 'tube',
            points: [
              [0.52, 0.2, z * 0.3],
              [-0.9, 0.7, z],
            ],
            width: 0.04,
            colour: WOOD_DARK,
            layer: 'far',
          })),
          ...[0.24, -0.24].map((z): Tube => ({
            is: 'tube',
            points: [
              [-0.34, 0.44, z],
              [-0.38, 0.02, z * 1.05],
            ],
            width: 0.035,
            colour: DARK,
            layer: 'far',
          })),
          {
            is: 'wheel',
            at: [0.52, 0.2, 0],
            r: 0.2,
            width: 0.08,
            face: 'hubcap',
            rim: CLOTH.red,
          },
          {
            is: 'prism',
            profile: [
              [-0.46, 0.42],
              [0.16, 0.3],
              [0.46, 0.62],
              [-0.56, 0.7],
            ],
            z: [-0.3, 0.3],
            fill: paint.body,
            top: darker(paint.body, 0.3),
          },
          ...[0.24, -0.24].map((z): Tube => ({
            is: 'tube',
            points: [
              [-0.6, 0.66, z],
              [-0.95, 0.72, z],
            ],
            width: 0.04,
            colour: WOOD_DARK,
            layer: 'near',
          })),
        ],
        seats: [],
        grips: [
          { id: 'handle-near', at: [-0.92, 0.72, 0.24] },
          { id: 'handle-far', at: [-0.92, 0.72, -0.24] },
        ],
        mount: [-1.2, 0, 0],
        contacts: [
          [0.52, 0, 0],
          [-0.38, 0, 0.25],
          [-0.38, 0, -0.25],
        ],
        bob: { amp: 1, every: 0.7 },
      };
    }
    case 'animal-cart': {
      const W = 0.62;
      return {
        size: { long: 3.6, wide: 1.6, high: 1.3 },
        nearZ: W,
        parts: [
          {
            is: 'tube',
            points: [
              [-0.12, 0.55, -0.75],
              [-0.12, 0.55, 0.75],
            ],
            width: 0.05,
            colour: DARK,
            layer: 'far',
          },
          ...[0.42, -0.42].map((z): Tube => ({
            is: 'tube',
            points: [
              [0.9, 0.74, z],
              [2.5, 0.96, z * 0.85],
            ],
            width: 0.05,
            colour: WOOD_DARK,
            layer: z > 0 ? 'near' : 'far',
          })),
          {
            is: 'prism',
            profile: rect2(-1.1, 0.62, 2.0, 0.42, 0.02),
            z: [-W, W],
            fill: wood,
            top: inside,
          },
          plank(0.76, -1.08, 0.88, W),
          plank(0.9, -1.08, 0.88, W),
          {
            is: 'prism',
            profile: rect2(0.5, 1.04, 0.36, 0.12, 0.02),
            z: [-W + 0.04, W - 0.04],
            fill: darker(wood, 0.12),
          },
          ...[0.74, -0.74].map((z): Wheel => ({
            is: 'wheel',
            at: [-0.12, 0.56, z],
            r: 0.56,
            width: 0.08,
            face: 'wood',
            rim: WOOD_DARK,
          })),
        ],
        seats: [
          {
            id: 'driver',
            hip: [0.66, 1.18, 0],
            feet: [
              [1.02, 0.74, 0.2],
              [1.02, 0.74, -0.2],
            ],
            hands: [
              [1.2, 1.12, 0.12],
              [1.2, 1.12, -0.12],
            ],
            pose: 'bench',
          },
          {
            id: 'back',
            hip: [-0.6, 1.04, 0],
            feet: [[-0.2, 0.66, 0.2]],
            pose: 'passenger',
          },
        ],
        grips: [{ id: 'reins', at: [1.2, 1.12, 0] }],
        mount: [0.2, 0, W + 0.4],
        steps: [[0.5, 0.62, W]],
        contacts: [
          [-0.12, 0, 0.74],
          [-0.12, 0, -0.74],
        ],
        bob: { amp: 2.2, every: 0.8 },
      };
    }
    default: {
      // A chariot: its car with a high curved front, two big spoked wheels, its pole and yoke.
      const W = 0.5;
      return {
        size: { long: 2.8, wide: 1.5, high: 1.2 },
        nearZ: W,
        parts: [
          {
            is: 'tube',
            points: [
              [-0.18, 0.5, -0.72],
              [-0.18, 0.5, 0.72],
            ],
            width: 0.05,
            colour: DARK,
            layer: 'far',
          },
          {
            is: 'tube',
            points: [
              [0.34, 0.54, 0],
              [1.9, 0.86, 0],
              [2.3, 0.9, 0],
            ],
            width: 0.06,
            colour: WOOD_DARK,
            layer: 'far',
          },
          {
            is: 'tube',
            points: [
              [2.2, 0.92, -0.62],
              [2.2, 0.92, 0.62],
            ],
            width: 0.06,
            colour: WOOD_DARK,
            layer: 'far',
          },
          {
            is: 'prism',
            profile: [
              [-0.42, 0.52],
              [0.42, 0.52],
              [0.56, 0.92],
              [0.46, 1.12],
              [0.3, 1.08],
              [0.12, 0.82],
              [-0.42, 0.72],
            ],
            z: [-W, W],
            fill: wood,
            top: inside,
          },
          {
            is: 'decal',
            plane: { side: 'near', z: W },
            shapes: [
              { points: rect2(-0.42, 0.54, 0.84, 0.06), fill: GOLD },
              { points: circle2([0.34, 0.86], 0.08, 12), fill: GOLD },
            ],
          },
          {
            is: 'decal',
            plane: { side: 'front', x: 0.5 },
            shapes: [{ points: circle2([0, 0.9], 0.12, 12), fill: GOLD }],
          },
          ...[0.72, -0.72].map((z): Wheel => ({
            is: 'wheel',
            at: [-0.18, 0.5, z],
            r: 0.5,
            width: 0.07,
            face: 'wood',
            rim: WOOD_DARK,
          })),
        ],
        seats: [
          {
            id: 'driver',
            hip: [-0.05, 1.45, 0.1],
            feet: [
              [-0.05, 0.54, 0.22],
              [-0.2, 0.54, -0.1],
            ],
            hands: [
              [0.6, 1.16, 0.1],
              [0.6, 1.16, -0.1],
            ],
            pose: 'stand',
          },
          {
            id: 'warrior',
            hip: [-0.25, 1.45, -0.2],
            feet: [
              [-0.25, 0.54, -0.1],
              [-0.35, 0.54, -0.3],
            ],
            pose: 'stand',
          },
        ],
        grips: [
          { id: 'reins', at: [0.6, 1.16, 0] },
          { id: 'rail', at: [0.46, 1.1, 0.3] },
        ],
        mount: [-0.8, 0, 0],
        steps: [[-0.42, 0.52, 0]],
        contacts: [
          [-0.18, 0, 0.72],
          [-0.18, 0, -0.72],
        ],
        bob: { amp: 2.5, every: 1 },
      };
    }
  }
}

/** A rowing boat or a canoe, on the water. */
function boatSolid(kind: 'rowing-boat' | 'canoe', paint: Paint): Solid {
  const wood = paint.wood;
  if (kind === 'canoe') {
    return {
      size: { long: 5.2, wide: 0.84, high: 0.62 },
      nearZ: 0.42,
      water: true,
      parts: [
        {
          is: 'hull',
          long: 5.2,
          beam: 0.84,
          high: 0.3,
          sheer: 0.32,
          draft: 0.16,
          transom: 0,
          fill: darker(wood, 0.08),
          inside: darker(wood, 0.35),
          thwarts: [
            [1.3, 0.2],
            [-1.3, 0.2],
          ],
        },
        // A paddle laid across it.
        {
          is: 'tube',
          points: [
            [0.2, 0.34, -0.5],
            [0.2, 0.34, 0.62],
          ],
          width: 0.035,
          colour: WOOD_DARK,
          layer: 'body',
        },
        {
          is: 'flat',
          points: [
            [0.16, 0.34, 0.6],
            [0.24, 0.34, 0.6],
            [0.26, 0.3, 0.98],
            [0.14, 0.3, 0.98],
          ],
          fill: WOOD_DARK,
          layer: 'body',
        },
      ],
      seats: [
        {
          id: 'bow',
          hip: [1.3, 0.22, 0],
          feet: [[1.8, 0.02, 0.12]],
          hands: [
            [1.5, 0.7, 0.3],
            [1.5, 0.34, 0.4],
          ],
          pose: 'row',
        },
        {
          id: 'stern',
          hip: [-1.3, 0.22, 0],
          feet: [[-0.8, 0.02, 0.12]],
          hands: [
            [-1.1, 0.7, 0.3],
            [-1.1, 0.34, 0.4],
          ],
          pose: 'row',
        },
      ],
      grips: [{ id: 'paddle', at: [0.2, 0.34, 0.1] }],
      mount: [0, 0, 0.8],
      contacts: [
        [-2.2, 0, 0],
        [2.2, 0, 0],
        [0, 0, 0.42],
        [0, 0, -0.42],
      ],
      bob: { amp: 3, every: 2 },
    };
  }
  return {
    size: { long: 3.5, wide: 1.4, high: 0.78 },
    nearZ: 0.7,
    water: true,
    parts: [
      // The far oar, behind; the hull; the near oar, out over the water.
      {
        is: 'tube',
        points: [
          [0.3, 0.7, -0.3],
          [-0.05, 0.56, -0.66],
          [-0.5, 0.02, -1.95],
        ],
        width: 0.04,
        colour: WOOD_DARK,
        layer: 'far',
      },
      {
        is: 'hull',
        long: 3.5,
        beam: 1.4,
        high: 0.5,
        sheer: 0.14,
        draft: 0.26,
        transom: 0.55,
        fill: paint.body,
        inside: darker(wood, 0.3),
        thwarts: [
          [-0.05, 0.3],
          [-1.1, 0.3],
          [1.0, 0.3],
        ],
      },
      {
        is: 'tube',
        points: [
          [0.3, 0.7, 0.3],
          [-0.05, 0.56, 0.66],
          [-0.5, 0.02, 1.95],
        ],
        width: 0.04,
        colour: WOOD_DARK,
        layer: 'near',
      },
      {
        is: 'flat',
        points: [
          [-0.46, 0.08, 1.85],
          [-0.54, 0.08, 1.85],
          [-0.62, -0.02, 2.3],
          [-0.44, -0.02, 2.3],
        ],
        fill: WOOD_DARK,
        layer: 'near',
      },
    ],
    seats: [
      {
        id: 'rower',
        hip: [-0.05, 0.34, 0],
        feet: [
          [0.6, 0.02, 0.18],
          [0.6, 0.02, -0.18],
        ],
        hands: [
          [0.3, 0.7, 0.3],
          [0.3, 0.7, -0.3],
        ],
        pose: 'row',
      },
      {
        id: 'passenger',
        hip: [-1.1, 0.34, 0],
        feet: [[-0.5, 0.02, 0.18]],
        pose: 'passenger',
      },
    ],
    grips: [
      { id: 'oar-near', at: [0.3, 0.7, 0.3] },
      { id: 'oar-far', at: [0.3, 0.7, -0.3] },
    ],
    mount: [0, 0, 0.9],
    contacts: [
      [-1.6, 0, 0],
      [1.5, 0, 0],
      [0, 0, 0.7],
      [0, 0, -0.7],
    ],
    bob: { amp: 3, every: 2 },
  };
}

function solidOf(
  kind: VehicleKitKind,
  paint: Paint,
  livery: VehicleLivery | null,
): Solid {
  switch (kind) {
    case 'bicycle':
    case 'motorbike':
      return twoWheelSolid(kind, paint);
    case 'handcart':
    case 'animal-cart':
    case 'wheelbarrow':
    case 'chariot':
      return cartSolid(kind, paint);
    case 'rowing-boat':
    case 'canoe':
      return boatSolid(kind, paint);
    default:
      return roadSolid(kind, paint, livery);
  }
}

// ── The drawing ─────────────────────────────────────────────────────────

const pt = (at: XY): ScenePoint => [r1(at[0]), r1(at[1])];

/**
 * A vehicle of the kit, drawn from a view, facing a way, in its place's
 * colours: its rigged drawing, its door, its way in, what it offers and
 * its size. The same kind, look and view always draw the same.
 */
export function drawVehicleKit(
  kind: VehicleKitKind,
  look: VehicleLook = {},
): VehicleDrawing {
  const view = look.view ?? 'side';
  const facing = look.facing ?? 1;
  const plain = Boolean(look.plain);
  const livery = look.livery ?? null;
  const body = vehicleColour(kind, look);
  const pack = look.pack ? PACK_VEHICLES[look.pack] : null;
  const paint: Paint = {
    body,
    // A truck's box, pale; a cart's and a boat's wood.
    trim: look.pack && ANCIENT.has(look.pack) ? '#efe3cf' : '#f1efe9',
    wood: [
      'handcart',
      'animal-cart',
      'wheelbarrow',
      'rowing-boat',
      'canoe',
      'chariot',
    ].includes(kind)
      ? body
      : (pack?.wood ?? WOOD),
  };
  // A rowing boat's hull painted, its inside wood.
  if (kind === 'rowing-boat' && !look.colour && !colourNamed(look.name ?? ''))
    paint.body = mix(
      (pack?.bodies ?? [CLOTH.blue])[
        seedOf(look.name ?? 'boat') % (pack?.bodies.length ?? 1)
      ] ?? CLOTH.blue,
      '#ffffff',
      0.1,
    );
  if (kind === 'wheelbarrow' && !look.colour && !colourNamed(look.name ?? ''))
    paint.body = pack?.bodies[0] ?? CLOTH.green;
  const solid = solidOf(kind, paint, livery);
  const { turn, above } = CAMERAS[view];
  const cam0: Camera = {
    view,
    c: Math.round(Math.cos(turn) * 1e6) / 1e6,
    s: Math.round(Math.sin(turn) * 1e6) / 1e6,
    k: above,
    f: facing,
    lift: 0,
  };
  const lift = Math.max(...solid.contacts.map((v) => depthOf(cam0, v)));
  const cam: Camera = { ...cam0, lift };
  const sheet = new Sheet(cam, plain);

  // Its parts: wheels first known, near or far by where the camera is.
  const turning: Wheel[] = [];
  let wheelNo = 0;
  for (const part of solid.parts) {
    switch (part.is) {
      case 'prism':
        drawPrism(sheet, part);
        break;
      case 'tube':
        drawTube(sheet, part);
        break;
      case 'flat':
        drawFlat(sheet, part);
        break;
      case 'decal':
        drawDecal(sheet, part);
        break;
      case 'hull':
        drawHull(sheet, part);
        break;
      case 'crank':
        drawCrank(sheet, part);
        break;
      case 'wheel': {
        // Before the body when the camera sees its face (the near side's,
        // a single track's); behind it seen end on, or on the far side.
        const near = cam.c > 0.2 && part.at[2] >= 0;
        const turned = drawWheel(sheet, part, near, wheelNo);
        if (turned) {
          turning.push(turned);
          wheelNo += 1;
        }
        break;
      }
    }
  }

  // Its door, a leaf of its own over the body's gap.
  const door = solid.door;
  const nearPlane: Plane = { side: 'near', z: solid.nearZ };
  let leaf: VehicleDrawing['leaf'];
  let opening: VehicleDrawing['opening'];
  let handle: XY | null = null;
  if (door && cam.c > 0.05) {
    const upperPlane: Plane = door.upper
      ? { side: 'near', z: door.upper.z }
      : nearPlane;
    // Each of its points on the plane of the body where it is: its waist
    // on the body's side, its window's frame on the glasshouse's.
    const on = (v: P2): XY =>
      sheet.p(
        onPlane(
          door.upper &&
            door.upper.a[0] * v[0] + door.upper.a[1] * v[1] > door.upper.b
            ? upperPlane
            : nearPlane,
          v,
        ),
      );
    const outline = door.outline.map(on);
    const pane = door.pane?.map((v) => sheet.p(onPlane(upperPlane, v)));
    const handleAt = door.handle;
    handle = sheet.p(onPlane(nearPlane, handleAt));
    // Its gap, seen when it is open: the inside, the glass beyond.
    const gap = door.outline;
    const belt = door.pane ? Math.min(...door.pane.map((p) => p[1])) : 1;
    sheet.add(
      'cabin',
      -59,
      flatShape(
        pathOf([
          clipHalf([...gap], [0, -1], -belt).map((v) =>
            sheet.p(onPlane(upperPlane, v)),
          ),
        ]),
        GLASS_BACK,
      ),
    );
    sheet.doorLeaf.push(
      shape(
        pathOf(pane ? [outline, pane] : [outline]),
        body,
        pane ? ' fill-rule="evenodd"' : '',
      ) +
        (pane
          ? flatShape(pathOf([pane]), GLASS, ' fill-opacity="0.42"') +
            flatShape(
              pathOf([
                glint(door.pane!).map((v) => sheet.p(onPlane(upperPlane, v))),
              ]),
              '#ffffff',
              ' fill-opacity="0.35"',
            ) +
            shape(pathOf([pane]), 'none')
          : '') +
        `<path d="${pathOf([
          rect2(
            handleAt[0] - (door.hinge ? 0 : 0.14),
            handleAt[1] - 0.025,
            0.14,
            0.05,
            0.02,
          ).map((v) => sheet.p(onPlane(nearPlane, v))),
        ])}" fill="${DARK}"/>`,
    );
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    opening = [
      r1(Math.min(...xs)),
      r1(Math.min(...ys)),
      r1(Math.max(...xs)),
      r1(Math.max(...ys)),
    ];
    if (door.hinge) {
      leaf = { id: 'leaf', hinge: pt(sheet.p(onPlane(nearPlane, door.hinge))) };
    } else {
      const slid = sheet.p(onPlane(nearPlane, [door.slide ?? -1, 0]));
      const from = sheet.p(onPlane(nearPlane, [0, 0]));
      const hingeAt = sheet.p(
        onPlane(nearPlane, [
          door.outline[0][0],
          (door.outline[0][1] + door.outline[2][1]) / 2,
        ]),
      );
      leaf = { id: 'leaf', hinge: pt(hingeAt), slide: r1(slid[0] - from[0]) };
    }
  }
  drawGround(sheet, solid);
  drawLights(sheet, solid);

  // Its frame: all it draws, and the ground under it.
  const xs = sheet.points.map((p) => p[0]);
  const ys = sheet.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(0, ...ys);
  // Framed as the kit's pieces are, with room for the outline: its foot 4 below the ground.
  const viewBox: [number, number, number, number] = [
    r1(x0 - 4),
    r1(y0 - 4),
    r1(x1 - x0 + 8),
    r1(y1 - y0 + 8),
  ];
  const sorted = (layer: Layer) =>
    [...sheet.layers[layer]]
      .sort((a, b) => a.depth - b.depth)
      .map((d) => d.svg)
      .join('');
  const id = (name: string) => (plain ? '' : ` id="${name}"`);
  const bodyFront =
    sorted('body') +
    (sheet.doorLeaf.length
      ? `<g${id('leaf')}>${sheet.doorLeaf.join('')}</g>`
      : '');
  const hasGlass = sheet.layers.glass.length > 0;
  const markup =
    sheet.shadow.join('') +
    sorted('far') +
    `<g${id('bob')}>` +
    `<g${id('cabin')}>${sorted('cabin')}</g>` +
    `<g${id('body-front')}>${bodyFront}</g>` +
    (hasGlass ? `<g${id('window')}>${sorted('glass')}</g>` : '') +
    (sheet.lights.length
      ? `<g id="lights" opacity="0">${sheet.lights.join('')}</g>`
      : '') +
    `</g>` +
    sorted('near');
  const data = plain
    ? ''
    : ` data-vehicle="${kind}" data-view="${view}"${facing < 0 ? ' data-facing="-1"' : ''}`;
  // As scenery, what it is is still marked, inside, where a set keeps it.
  const inner = plain ? `<g data-vehicle="${kind}">${markup}</g>` : markup;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"${data}><g stroke="${FIGURE_INK}" stroke-width="${LINE}" stroke-linejoin="round">${inner}</g></svg>`;

  // What it offers, in its drawing's units.
  const P = (v: V3) => pt(sheet.p(v));
  const mountAt = sheet.p(solid.mount);
  const affordances: SceneAffordancesDto = {
    seats: solid.seats.map((seat) => ({
      id: seat.id,
      hip: P(seat.hip),
      feet: seat.feet.map(P),
      ...(seat.hands ? { hands: seat.hands.map(P) } : {}),
      pose: seat.pose,
    })),
    ...(solid.grips.length
      ? { grips: solid.grips.map((g) => ({ id: g.id, at: P(g.at) })) }
      : {}),
    ...(turning.length
      ? {
          wheels: turning.map((w) => ({
            at: P(w.at),
            r: r1(w.r * M),
          })),
        }
      : {}),
    masks: [
      { id: 'body-front', group: 'body-front' },
      ...(hasGlass ? [{ id: 'window' as const, group: 'window' }] : []),
    ],
    mount: { side: mountAt[0] < (x0 + x1) / 2 ? -1 : 1, at: pt(mountAt) },
    ...(solid.steps && cam.c > 0.05 ? { steps: solid.steps.map(P) } : {}),
    ...(handle
      ? {
          handles: [
            { id: 'door', at: pt(handle), side: 'out' as const },
            { id: 'door-in', at: pt(handle), side: 'in' as const },
          ],
          side: handle[0] < (x0 + x1) / 2 ? -1 : 1,
        }
      : {}),
  };
  const crank = solid.parts.find((p): p is Crank => p.is === 'crank');
  if (crank)
    affordances.pedals = {
      crank: P(crank.at),
      radius: r1(crank.r * M),
      gear: crank.gear,
    };
  const vehicle: SceneVehicleDto = {
    kind,
    view,
    facing,
    bob: solid.bob.amp,
    bobEvery: r1(solid.bob.every * M),
    ...(solid.water ? { water: true } : {}),
  };
  const draws = drawnBy(kind, look.name ?? '');
  return {
    svg,
    viewBox,
    ...(leaf ? { leaf } : {}),
    ...(opening ? { opening } : {}),
    affordances,
    vehicle,
    size: solid.size,
    ...(draws ? { draws } : {}),
  };
}

/**
 * The wheels of a drawing on the ground: the lowest point of each
 * turning wheel's rim, in its own units, which is 0 (the ground) seen
 * from the side, and on the ground farther back from any other side.
 */
export function wheelFeet(
  drawing: Pick<VehicleDrawing, 'affordances'>,
): number[] {
  return (drawing.affordances.wheels ?? []).map((w) => r1(w.at[1] + w.r));
}
