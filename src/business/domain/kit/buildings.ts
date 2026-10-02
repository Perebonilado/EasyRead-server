/**
 * Buildings (explainer-animation-plan §7.2, tech §4.2): the kinds of
 * place a story happens at, drawn front on at their real sizes in the
 * kit's units (a hundred to the metre), standing on y = 0 with their
 * middle at x = 0: a house, a block of flats, an office tower, a factory,
 * a warehouse, an assembly hall, a court, a school, a hospital, market
 * stalls, port cranes and a farm.
 *
 * Global, not regional: a building's style follows from its era (eras.ts)
 * and its climate (temperate, arid, tropical, cold), never from a country.
 * An arid town's houses have flat roofs and thick walls whatever the
 * country; a cold one's roofs are steep; a tropical one's eaves are wide.
 * The material (brick, stone, timber, concrete, glass, mud brick, sheet
 * metal) follows from era and climate unless the board names one. No
 * landmark, emblem or sign is ever drawn: a hospital's sign is a blank
 * panel, a hall's flag an anchor the stage flies a flag from.
 *
 * Parts, to one standard so the stage and the recipes can find them:
 * `building` (the root), `walls`, `roof`, `windows`, `lights` (a glow in
 * each window, each its own shape so a set's scenery can light them one
 * by one), `door`, `chimney` with `smoke` at its top (and `smoke-2`… for
 * more stacks: the life layer's smoke rises from them), and `flag` (an
 * anchor at a flagpole's top). Some kinds have their own: a crane's
 * `boom`, `jib`, `trolley` and `hook`, a market's `canopy-1`…, a farm's
 * `silo` and `barn`.
 *
 * The lights are drawn on: a building alone is seen lit. Its rig's states
 * put them out by day and dim them at dusk; a drawn set's scenery lights
 * a building's windows with its own (kit/sets).
 */
import type { ShotBox, ShotRigDto } from '../../../contracts';
import { ERA_IDS, type EraId } from './eras';
import type { KitEntry, KitParams } from './registry';
import type { KitPiece } from './rig';
import { type Pt, type Shape, ellipse, groundShadow, unionBox } from './shape';
import type { KitStyle } from './style';
import { mixOk } from './style';
import {
  type Fill,
  Drawing,
  band,
  box,
  dome,
  inLook,
  litOf,
  many,
  poly,
  seeded,
  shadeOf,
  type Seeded,
  wornColour,
} from './paint';

// ── Settings ──────────────────────────────────────────────────────────────

export const BUILDING_KINDS = [
  'house',
  'flats',
  'tower',
  'factory',
  'warehouse',
  'hall',
  'court',
  'school',
  'hospital',
  'market',
  'cranes',
  'farm',
] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export const CLIMATES = ['temperate', 'arid', 'tropical', 'cold'] as const;
export type Climate = (typeof CLIMATES)[number];

export const SIZES = ['small', 'medium', 'large'] as const;
export type Size = (typeof SIZES)[number];

export const MATERIALS = [
  'auto',
  'brick',
  'stone',
  'timber',
  'concrete',
  'glass',
  'mud',
  'metal',
] as const;
export type Material = (typeof MATERIALS)[number];

/** A building's era as a time: before 1800, the industrial century, the twentieth century's halves, today. */
const eraIndex = (era: EraId) => ERA_IDS.indexOf(era);
const before = (era: EraId, than: EraId) => eraIndex(era) < eraIndex(than);

/** Natural colours of each material, and of roofs, before the look pulls them toward its paper. */
const MATERIAL_COLOUR: Record<Exclude<Material, 'auto'>, string> = {
  brick: '#a5573f',
  stone: '#c9b48e',
  timber: '#9b6c48',
  concrete: '#b5b1a8',
  glass: '#7e9fb3',
  mud: '#c39a6b',
  metal: '#8b949b',
};
const ROOF_COLOUR = {
  tiles: '#a4493b',
  slate: '#555d68',
  thatch: '#c4a15d',
  metal: '#7a848c',
  flat: '#8e8a83',
  copper: '#5f9a8a',
} as const;
type RoofKind = keyof typeof ROOF_COLOUR;

/**
 * The material a building is built of when the board names none: what
 * most places built that kind of building of in that era and climate
 * (mud brick and stone where wood is scarce and the sun strong, timber
 * where it is plentiful, brick in the industrial century, concrete after
 * the war, glass for today's towers). Seeded where several fit.
 */
function materialFor(
  kind: BuildingKind,
  era: EraId,
  climate: Climate,
  rng: Seeded,
): Exclude<Material, 'auto'> {
  if (kind === 'cranes') return 'metal';
  if (kind === 'market') return 'timber';
  const old = before(era, '1800-1900');
  const industrial = !old && before(era, '1945-1975');
  const civic = kind === 'hall' || kind === 'court';
  if (kind === 'tower')
    return before(era, '1945-1975')
      ? 'stone'
      : before(era, '1975-2000')
        ? 'concrete'
        : 'glass';
  if (old) {
    if (climate === 'arid') return civic ? 'stone' : 'mud';
    if (climate === 'tropical') return civic ? 'stone' : 'timber';
    return civic ? 'stone' : rng.pick(['stone', 'timber'] as const);
  }
  if (industrial) {
    if (civic) return 'stone';
    if (climate === 'arid')
      return kind === 'factory' || kind === 'warehouse'
        ? 'brick'
        : rng.pick(['mud', 'stone'] as const);
    if (climate === 'tropical' && kind === 'house')
      return rng.pick(['timber', 'brick'] as const);
    return 'brick';
  }
  // After the war.
  if (kind === 'factory' || kind === 'warehouse')
    return before(era, '1975-2000')
      ? rng.pick(['brick', 'concrete'] as const)
      : 'metal';
  if (kind === 'house')
    return climate === 'cold'
      ? rng.pick(['timber', 'brick'] as const)
      : climate === 'arid'
        ? 'concrete'
        : rng.pick(['brick', 'concrete'] as const);
  if (kind === 'farm')
    return climate === 'arid' ? 'mud' : rng.pick(['timber', 'metal'] as const);
  return 'concrete';
}

/** The roof a building has: flat where it is dry and for the century's blocks, steep where it snows, wide where it rains hard. */
function roofFor(
  kind: BuildingKind,
  era: EraId,
  climate: Climate,
  material: Exclude<Material, 'auto'>,
): { kind: RoofKind; pitch: number; eaves: number; flat: boolean } {
  const modern = !before(era, '1945-1975');
  const flatKinds: BuildingKind[] = ['tower', 'flats', 'hospital'];
  if (
    climate === 'arid' ||
    (modern && flatKinds.includes(kind)) ||
    kind === 'tower' ||
    material === 'glass'
  )
    return { kind: 'flat', pitch: 0, eaves: 0, flat: true };
  if (climate === 'cold')
    return {
      kind: before(era, '1800-1900') ? 'thatch' : modern ? 'metal' : 'slate',
      pitch: 0.55,
      eaves: 0.04,
      flat: false,
    };
  if (climate === 'tropical')
    return {
      kind: before(era, '1900-1945') ? 'thatch' : 'metal',
      pitch: 0.3,
      eaves: 0.12,
      flat: false,
    };
  return {
    kind: before(era, '1500-1800')
      ? 'thatch'
      : modern && kind !== 'house'
        ? 'metal'
        : 'tiles',
    pitch: 0.36,
    eaves: 0.05,
    flat: false,
  };
}

/** The colours a building is painted in, worked out from its wall's. */
interface Paint {
  wall: string;
  wallShade: string;
  wallLit: string;
  trim: string;
  roof: string;
  roofShade: string;
  glass: string;
  frame: string;
  dark: string;
  glow: string;
  metal: string;
}

function paintOf(
  style: KitStyle,
  wall: string,
  roof: RoofKind,
  side: boolean,
): Paint {
  const roofColour = side
    ? shadeOf(wall, 0.32)
    : inLook(style, ROOF_COLOUR[roof]);
  const dark = mixOk(style.ink, '#000000', 0.2);
  return {
    wall,
    wallShade: shadeOf(wall, 0.18),
    wallLit: litOf(wall, 0.1),
    trim: mixOk(wall, style.paper, 0.45),
    roof: roofColour,
    roofShade: shadeOf(roofColour, 0.2),
    glass: mixOk(inLook(style, '#5d7489'), wall, 0.15),
    frame: shadeOf(wall, 0.3),
    dark: mixOk(dark, wall, 0.25),
    glow: style.look === 'illustrated' ? '#ffd56b' : '#ffd88a',
    metal: inLook(style, '#7d868e'),
  };
}

// ── The drawing ───────────────────────────────────────────────────────────

/** What every kind's drawing shares while it is drawn. */
interface Build {
  d: Drawing;
  /** Seen small, in a set's townscape: less detail. */
  small: boolean;
  style: KitStyle;
  rng: Seeded;
  era: EraId;
  climate: Climate;
  size: Size;
  material: Exclude<Material, 'auto'>;
  roof: ReturnType<typeof roofFor>;
  p: Paint;
  /** The glow drawn in each window, gathered for the `lights` part. */
  glows: Shape[];
  glass: Fill[];
  walls: Fill[];
  roofs: Fill[];
  doors: Fill[];
  chimneys: { shape: Fill[]; top: Pt }[];
  flag: Pt | null;
  /** Its main body: what the camera frames. */
  body: ShotBox;
  /** Extra parts drawn after the standard ones (a crane's boom, a stall's canopy). */
  extra: ((d: Drawing) => void)[];
  notes: string[];
}

/** A row of windows across a wall's face: glass in its frame, a sill, and the glow that lights it. */
function windows(
  b: Build,
  x0: number,
  x1: number,
  y: number,
  w: number,
  h: number,
  count: number,
  opts: { panes?: boolean; arch?: boolean; skip?: (i: number) => boolean } = {},
): void {
  if (count <= 0) return;
  const step = (x1 - x0) / count;
  for (let i = 0; i < count; i += 1) {
    if (opts.skip?.(i)) continue;
    const cx = x0 + step * (i + 0.5);
    const left = cx - w / 2;
    const frame = Math.max(6, w * 0.08);
    // The frame round the glass (not seen small), then the glass, then a sill under it.
    if (!b.small)
      b.glass.push([
        box(left - frame, y - frame, left + w + frame, y + h + frame),
        b.p.frame,
      ]);
    const glass = opts.arch
      ? poly([
          [left, y + h],
          [left, y + w * 0.5],
          [left + w * 0.15, y + w * 0.15],
          [cx, y],
          [left + w * 0.85, y + w * 0.15],
          [left + w, y + w * 0.5],
          [left + w, y + h],
        ])
      : box(left, y, left + w, y + h);
    b.glass.push([glass, b.p.glass]);
    if (opts.panes && w > 60 && !b.small) {
      // Glazing bars: a cross, so a window reads as a window when small.
      b.glass.push([
        box(cx - frame / 2, y, cx + frame / 2, y + h),
        b.p.frame,
        { bare: true },
      ]);
      b.glass.push([
        box(left, y + h * 0.45 - frame / 2, left + w, y + h * 0.45 + frame / 2),
        b.p.frame,
        { bare: true },
      ]);
    }
    if (!b.small)
      b.glass.push([
        box(
          left - frame * 1.6,
          y + h + frame,
          left + w + frame * 1.6,
          y + h + frame * 2.4,
        ),
        b.p.trim,
      ]);
    b.glows.push(
      opts.arch ? glass : box(left + 2, y + 2, left + w - 2, y + h - 2),
    );
  }
}

/** A wall's face with its side in shade: the lit face, and a narrow face turned from the light on the right. */
function block(
  b: Build,
  x0: number,
  x1: number,
  top: number,
  bottom = 0,
  depth = 0.06,
): void {
  const w = x1 - x0;
  const side = Math.min(w * depth, 160);
  b.walls.push([box(x0, top, x1, bottom), b.p.wall]);
  b.walls.push([
    poly([
      [x1, top],
      [x1 + side, top + side * 0.35],
      [x1 + side, bottom],
      [x1, bottom],
    ]),
    b.p.wallShade,
  ]);
  // A lit edge along the face's left, toward the light (the editorial look's rim).
  if (b.style.look === 'editorial')
    b.walls.push([
      box(x0, top, x0 + Math.min(18, w * 0.02), bottom),
      b.p.wallLit,
      { bare: true },
    ]);
}

/** A roof over a block from x0 to x1 whose walls end at `top`: pitched (two slopes, the left one lit) or flat with a parapet. */
function roofOver(
  b: Build,
  x0: number,
  x1: number,
  top: number,
  kind = b.roof,
): number {
  const w = x1 - x0;
  if (kind.flat) {
    const parapet = Math.min(60, w * 0.04);
    b.roofs.push([box(x0 - 10, top - parapet, x1 + 10, top), b.p.trim]);
    return top - parapet;
  }
  const over = w * kind.eaves;
  const rise = w * 0.5 * kind.pitch;
  const cx = (x0 + x1) / 2;
  b.roofs.push([
    poly([
      [x0 - over, top + 4],
      [cx, top - rise],
      [cx, top + 4],
    ]),
    litOf(b.p.roof, 0.06),
  ]);
  b.roofs.push([
    poly([
      [cx, top - rise],
      [x1 + over, top + 4],
      [cx, top + 4],
    ]),
    b.p.roofShade,
  ]);
  // The eave's edge: a thin dark line under the slopes.
  b.roofs.push([
    band([x0 - over, top + 4], [x1 + over, top + 4], Math.max(8, w * 0.01)),
    b.p.frame,
  ]);
  return top - rise;
}

/** A door in a wall: its leaf, its frame and a step. */
function door(
  b: Build,
  cx: number,
  w: number,
  h: number,
  double = false,
): void {
  b.doors.push([box(cx - w / 2 - 10, -h - 10, cx + w / 2 + 10, 0), b.p.frame]);
  b.doors.push([
    box(cx - w / 2, -h, cx + w / 2, 0),
    mixOk(b.p.dark, b.p.wall, 0.35),
  ]);
  if (double)
    b.doors.push([box(cx - 3, -h, cx + 3, 0), b.p.frame, { bare: true }]);
  b.doors.push([box(cx - w / 2 - 30, -14, cx + w / 2 + 30, 0), b.p.trim]);
}

/** A chimney stack standing from y = `base` to `base - h`, `w` wide at its foot, tapering a little; brick or metal. */
function chimney(
  b: Build,
  cx: number,
  base: number,
  w: number,
  h: number,
  taper = 0.25,
): void {
  const top = base - h;
  const wt = w * (1 - taper);
  const colour =
    b.material === 'metal' || b.material === 'concrete'
      ? b.p.metal
      : shadeOf(b.p.wall, 0.05);
  const shape: Fill[] = [
    [
      poly([
        [cx - w / 2, base],
        [cx - wt / 2, top],
        [cx + wt / 2, top],
        [cx + w / 2, base],
      ]),
      colour,
    ],
    [
      poly([
        [cx + w * 0.12, base],
        [cx + wt * 0.12, top],
        [cx + wt / 2, top],
        [cx + w / 2, base],
      ]),
      shadeOf(colour, 0.14),
      { bare: true },
    ],
    [
      box(
        cx - wt / 2 - 12,
        top - 4,
        cx + wt / 2 + 12,
        top + Math.min(50, h * 0.05),
      ),
      shadeOf(colour, 0.28),
    ],
  ];
  b.chimneys.push({ shape, top: [cx, top - 4] });
}

// ── The kinds ─────────────────────────────────────────────────────────────

const STOREY = 300;

function house(b: Build): void {
  const storeys = b.size === 'small' ? 1 : b.size === 'medium' ? 2 : 3;
  const w =
    b.rng.between(760, 980) * (storeys === 1 ? 1 : storeys === 2 ? 1.1 : 1.3);
  const x0 = -w / 2;
  const x1 = w / 2;
  const top = -storeys * STOREY - (b.roof.flat ? 30 : 0);
  block(b, x0, x1, top);
  const ridge = roofOver(b, x0, x1, top);
  // Windows on every floor; the door on the ground floor, off its middle.
  const doorX = x0 + w * (b.rng.chance(0.5) ? 0.3 : 0.7);
  for (let f = 0; f < storeys; f += 1) {
    const y = -(f + 1) * STOREY + 70;
    const n = Math.max(2, Math.round(w / 330));
    windows(b, x0 + 40, x1 - 40, y, 110, 140, n, {
      panes: true,
      skip: (i) =>
        f === 0 &&
        Math.abs(x0 + 40 + ((x1 - x0 - 80) / n) * (i + 0.5) - doorX) < 150,
    });
  }
  door(b, doorX, 100, 210);
  if (
    (b.climate === 'temperate' || b.climate === 'cold') &&
    before(b.era, '1975-2000') &&
    !b.roof.flat
  )
    chimney(
      b,
      x0 + w * 0.72,
      top - (top - ridge) * 0.35,
      70,
      (top - ridge) * 0.35 + 110,
      0.05,
    );
  if (b.climate === 'arid' && b.roof.flat && b.rng.chance(0.5)) {
    // A water tank on the flat roof, as dry towns keep them.
    b.extra.push((d) =>
      d.part('tank', 'building', [
        [box(x1 - 260, ridge - 120, x1 - 80, ridge), b.p.metal],
        [box(x1 - 250, ridge - 16, x1 - 90, ridge), shadeOf(b.p.metal, 0.2)],
      ]),
    );
  }
  b.body = [x0, ridge, w, -ridge];
}

function flats(b: Build): void {
  const storeys = b.size === 'small' ? 4 : b.size === 'medium' ? 6 : 9;
  const bays = b.size === 'small' ? 5 : b.size === 'medium' ? 7 : 8;
  const w = bays * 330;
  const x0 = -w / 2;
  const x1 = w / 2;
  const top = -storeys * 290 - 40;
  block(b, x0, x1, top);
  const ridge = roofOver(b, x0, x1, top);
  const modern = !before(b.era, '1945-1975');
  for (let f = 0; f < storeys; f += 1) {
    const y = -(f + 1) * 290 + 80;
    windows(
      b,
      x0 + 40,
      x1 - 40,
      y,
      modern ? 170 : 110,
      modern ? 130 : 150,
      bays,
      {
        panes: !modern,
        skip: (i) => f === 0 && i === Math.floor(bays / 2),
      },
    );
    // Balconies on the century's blocks: a band under every other bay.
    if (modern && f > 0)
      for (let i = 0; i < bays; i += 2) {
        const cx = x0 + 40 + ((w - 80) / bays) * (i + 0.5);
        b.walls.push([
          box(cx - 120, -f * 290 - 30, cx + 120, -f * 290 + 6),
          b.p.trim,
        ]);
      }
  }
  if (!modern) b.walls.push([box(x0 - 20, top, x1 + 20, top + 40), b.p.trim]);
  door(b, 0, 150, 230, true);
  b.body = [x0, ridge, w, -ridge];
}

function tower(b: Build): void {
  const storeys = b.size === 'small' ? 12 : b.size === 'medium' ? 20 : 32;
  const w = b.size === 'small' ? 1700 : b.size === 'medium' ? 2100 : 2500;
  const floor = 370;
  const x0 = -w / 2;
  const x1 = w / 2;
  const top = -storeys * floor - 120;
  const glass = b.material === 'glass';
  block(b, x0, x1, top, 0, 0.05);
  const cols = Math.round(w / (b.small ? 420 : 260));
  if (glass) {
    // A curtain wall: dark glass in bands, mullions and spandrels between.
    b.glass.push([box(x0 + 30, top + 60, x1 - 30, -260), b.p.glass]);
    for (let f = 1; f < storeys; f += 1)
      b.glass.push([
        box(x0 + 30, -f * floor - 20, x1 - 30, -f * floor + 18),
        b.p.wall,
        { bare: true },
      ]);
    for (let c = 1; c < cols; c += 1) {
      const x = x0 + 30 + ((w - 60) / cols) * c;
      b.glass.push([
        box(x - 7, top + 60, x + 7, -260),
        b.p.wall,
        { bare: true },
      ]);
    }
    // Lit panes, a floor at a time (two at a time seen small), inset in their mullions.
    const per = b.small ? 2 : 1;
    for (let f = 1; f < storeys; f += per)
      for (let c = 0; c < cols; c += 1) {
        const cx = x0 + 30 + ((w - 60) / cols) * (c + 0.5);
        const half = (w - 60) / cols / 2;
        b.glows.push(
          box(
            cx - half + 24,
            -(f + per) * floor + 40,
            cx + half - 24,
            -f * floor - 36,
          ),
        );
      }
  } else
    for (let f = 1; f < storeys; f += 1)
      windows(b, x0 + 60, x1 - 60, -(f + 1) * floor + 100, 120, 190, cols);
  // The crown: a setback and, today, a mast.
  const crown = Math.min(w * 0.6, 1200);
  b.roofs.push([
    box(-crown / 2, top - 260, crown / 2, top),
    shadeOf(b.p.wall, 0.08),
  ]);
  if (!before(b.era, '1975-2000'))
    b.roofs.push([band([0, top - 260], [0, top - 900], 22), b.p.metal]);
  // A lobby of glass across the ground floor.
  b.doors.push([
    box(x0 + 60, -250, x1 - 60, 0),
    mixOk(b.p.glass, b.p.dark, 0.25),
  ]);
  b.doors.push([box(-90, -250, 90, 0), b.p.frame]);
  b.glows.push(box(x0 + 70, -240, x1 - 70, -10));
  b.flag = before(b.era, '1975-2000') ? [0, top - 260] : null;
  b.body = [x0, top - 260, w, -(top - 260)];
}

function factory(b: Build): void {
  const old = before(b.era, '1800-1900');
  const modern = !before(b.era, '1975-2000');
  const span = b.size === 'small' ? 2200 : b.size === 'medium' ? 3200 : 4200;
  const x0 = -span / 2;
  const x1 = span / 2;
  const h = modern ? 900 : 780;
  block(b, x0, x1, -h, 0, 0.04);
  if (modern) {
    // A shed of sheet metal: ribs down its face, a flat roof, a roller door.
    for (let x = x0 + 60; x < x1 - 30; x += 90)
      b.walls.push([
        box(x, -h + 10, x + 14, -6),
        shadeOf(b.p.wall, 0.08),
        { bare: true },
      ]);
    roofOver(b, x0, x1, -h, { kind: 'flat', pitch: 0, eaves: 0, flat: true });
    windows(b, x0 + 200, x1 - 200, -h + 90, 260, 90, Math.round(span / 600));
    b.doors.push([
      box(x0 + span * 0.62, -520, x0 + span * 0.62 + 520, 0),
      shadeOf(b.p.metal, 0.12),
    ]);
    for (let y = -500; y < 0; y += 60)
      b.doors.push([
        box(x0 + span * 0.62, y, x0 + span * 0.62 + 520, y + 10),
        shadeOf(b.p.metal, 0.25),
        { bare: true },
      ]);
    chimney(b, x1 - 300, -h, 90, 1400, 0);
  } else {
    // The mill's sawtooth roof: north lights in a row of teeth.
    const teeth = Math.max(3, Math.round(span / 700));
    const tw = span / teeth;
    for (let i = 0; i < teeth; i += 1) {
      const a = x0 + i * tw;
      b.roofs.push([
        poly([
          [a, -h],
          [a + tw * 0.78, -h - 300],
          [a + tw * 0.78, -h],
        ]),
        litOf(b.p.roof, 0.04),
      ]);
      b.roofs.push([
        poly([
          [a + tw * 0.78, -h - 300],
          [a + tw, -h],
          [a + tw * 0.78, -h],
        ]),
        b.p.glass,
      ]);
      b.glows.push(
        poly([
          [a + tw * 0.8, -h - 280],
          [a + tw * 0.97, -h - 10],
          [a + tw * 0.8, -h - 10],
        ]),
      );
    }
    b.roofs.push([band([x0, -h], [x1, -h], 14), b.p.frame]);
    // Tall arched windows in a run along the floor, and a loading door.
    windows(b, x0 + 120, x1 - 120, -h + 150, 150, 420, Math.round(span / 330), {
      panes: true,
      arch: true,
      skip: (i) => i === 2,
    });
    door(
      b,
      x0 + 120 + ((span - 240) / Math.round(span / 330)) * 2.5,
      260,
      400,
      true,
    );
    // Stacks: one for a small works, up to three for a large one.
    const stacks = b.size === 'small' ? 1 : b.size === 'medium' ? 2 : 3;
    const tall = old ? 2400 : 3000;
    for (let i = 0; i < stacks; i += 1)
      chimney(b, x1 - 260 - i * 620, -h, 200, tall - i * 280, 0.32);
  }
  b.body = [x0, -h - 300, span, h + 300];
}

function warehouse(b: Build): void {
  const span = b.size === 'small' ? 1800 : b.size === 'medium' ? 2600 : 3400;
  const x0 = -span / 2;
  const x1 = span / 2;
  const h = 700;
  const metal = b.material === 'metal';
  block(b, x0, x1, -h, 0, 0.04);
  const ridge = roofOver(b, x0, x1, -h, {
    kind: metal ? 'metal' : 'slate',
    pitch: 0.16,
    eaves: 0.02,
    flat: false,
  });
  const doors = Math.max(2, Math.round(span / 900));
  const step = span / doors;
  for (let i = 0; i < doors; i += 1) {
    const cx = x0 + step * (i + 0.5);
    b.doors.push([
      box(cx - 220, -460, cx + 220, 0),
      shadeOf(metal ? b.p.metal : b.p.dark, 0.05),
    ]);
    for (let y = -440; y < 0; y += 70)
      b.doors.push([
        box(cx - 220, y, cx + 220, y + 10),
        shadeOf(b.p.metal, 0.3),
        { bare: true },
      ]);
    windows(b, cx - 300, cx + 300, -h + 70, 120, 70, 2);
  }
  if (metal)
    for (let x = x0 + 60; x < x1 - 30; x += 110)
      b.walls.push([
        box(x, -h + 6, x + 12, -470),
        shadeOf(b.p.wall, 0.08),
        { bare: true },
      ]);
  b.body = [x0, ridge, span, -ridge];
}

function hall(b: Build): void {
  const scale = b.size === 'small' ? 0.8 : b.size === 'medium' ? 1 : 1.25;
  const cw = 1700 * scale;
  const ww = 1100 * scale;
  const ch = 1400 * scale;
  const wh = 950 * scale;
  const steps = 160;
  // The wings, the centre and the steps across its front.
  block(b, -cw / 2 - ww, -cw / 2, -wh - steps, -steps, 0);
  block(b, cw / 2, cw / 2 + ww, -wh - steps, -steps, 0.04);
  block(b, -cw / 2, cw / 2, -ch - steps, -steps, 0.03);
  for (let i = 0; i < 3; i += 1) {
    const inset = i * 70;
    b.walls.push([
      box(
        -cw / 2 - 120 + inset,
        -steps + i * 53,
        cw / 2 + 120 - inset,
        -steps + (i + 1) * 53,
      ),
      i % 2 ? b.p.trim : shadeOf(b.p.trim, 0.06),
    ]);
  }
  // Tall windows between pilasters on the centre, shorter ones on the wings.
  const pil = 6;
  for (let i = 0; i <= pil; i += 1) {
    const x = -cw / 2 + 60 + ((cw - 120) / pil) * i;
    b.walls.push([box(x - 26, -ch - steps + 100, x + 26, -steps), b.p.wallLit]);
  }
  windows(b, -cw / 2 + 60, cw / 2 - 60, -ch - steps + 260, 130, 620, pil, {
    panes: true,
    arch: before(b.era, '1945-1975'),
  });
  windows(b, -cw / 2 - ww + 80, -cw / 2 - 40, -wh - steps + 220, 120, 380, 3, {
    panes: true,
  });
  windows(b, cw / 2 + 40, cw / 2 + ww - 80, -wh - steps + 220, 120, 380, 3, {
    panes: true,
  });
  door(b, 0, 300, 520, true);
  // Its top: a low dome on a drum before the war; a broad flat canopy after.
  const top = -ch - steps;
  b.roofs.push([box(-cw / 2 - 30, top - 60, cw / 2 + 30, top), b.p.trim]);
  b.roofs.push([
    box(-cw / 2 - ww - 20, -wh - steps - 50, -cw / 2, -wh - steps),
    b.p.trim,
  ]);
  b.roofs.push([
    box(cw / 2, -wh - steps - 50, cw / 2 + ww + 20, -wh - steps),
    b.p.trim,
  ]);
  let crest = top - 60;
  if (before(b.era, '1945-1975')) {
    const r = cw * 0.3;
    b.roofs.push([
      box(-r * 0.9, top - 60 - 260, r * 0.9, top - 60),
      b.p.wallShade,
    ]);
    windows(b, -r * 0.8, r * 0.8, top - 290, 70, 150, 5);
    b.roofs.push([
      dome(0, top - 320, r, r * 0.8),
      inLook(b.style, ROOF_COLOUR.copper),
    ]);
    b.roofs.push([
      dome(-r * 0.2, top - 320, r * 0.55, r * 0.7),
      litOf(inLook(b.style, ROOF_COLOUR.copper), 0.12),
      { bare: true },
    ]);
    b.roofs.push([box(-r - 10, top - 330, r + 10, top - 300), b.p.trim]);
    crest = top - 320 - r * 0.8;
  } else
    b.roofs.push([
      box(-cw / 2 - 160, top - 120, cw / 2 + 160, top - 60),
      shadeOf(b.p.trim, 0.1),
    ]);
  // A flagpole over the centre: the stage flies a flag from its anchor.
  b.extra.push((d) =>
    d.part('flagpole', 'building', [
      [band([0, crest], [0, crest - 520], 16), b.p.metal],
    ]),
  );
  b.flag = [0, crest - 520];
  b.body = [-cw / 2 - ww, crest, cw + 2 * ww, -crest];
}

function court(b: Build): void {
  const scale = b.size === 'small' ? 0.85 : b.size === 'medium' ? 1 : 1.2;
  const w = 2200 * scale;
  const h = 1150 * scale;
  const steps = 150;
  block(b, -w / 2, w / 2, -h - steps, -steps, 0.03);
  for (let i = 0; i < 3; i += 1)
    b.walls.push([
      box(
        -w / 2 - 80 + i * 60,
        -steps + i * 50,
        w / 2 + 80 - i * 60,
        -steps + (i + 1) * 50,
      ),
      i % 2 ? b.p.trim : shadeOf(b.p.trim, 0.06),
    ]);
  // A portico of columns before its doors.
  const cols = 6;
  const pw = w * 0.56;
  for (let i = 0; i < cols; i += 1) {
    const x = -pw / 2 + (pw / (cols - 1)) * i;
    b.walls.push([box(x - 40, -h - steps + 120, x + 40, -steps), b.p.wallLit]);
    b.walls.push([
      box(x + 14, -h - steps + 120, x + 40, -steps),
      shadeOf(b.p.wall, 0.08),
      { bare: true },
    ]);
  }
  b.walls.push([
    box(-pw / 2 - 70, -h - steps + 60, pw / 2 + 70, -h - steps + 130),
    b.p.trim,
  ]);
  windows(b, -w / 2 + 80, -pw / 2 - 90, -h - steps + 260, 110, 520, 2, {
    panes: true,
  });
  windows(b, pw / 2 + 90, w / 2 - 80, -h - steps + 260, 110, 520, 2, {
    panes: true,
  });
  door(b, 0, 260, 480, true);
  const top = -h - steps;
  let crest = top;
  if (before(b.era, '1945-1975')) {
    b.roofs.push([
      poly([
        [-pw / 2 - 90, top + 60],
        [0, top - 300],
        [pw / 2 + 90, top + 60],
      ]),
      b.p.trim,
    ]);
    b.roofs.push([
      poly([
        [-pw / 2 - 30, top + 40],
        [0, top - 240],
        [pw / 2 + 30, top + 40],
      ]),
      b.p.wallShade,
    ]);
    crest = top - 300;
  } else b.roofs.push([box(-w / 2 - 20, top - 70, w / 2 + 20, top), b.p.trim]);
  b.extra.push((d) =>
    d.part('flagpole', 'building', [
      [band([w / 2 - 120, top], [w / 2 - 120, top - 500], 14), b.p.metal],
    ]),
  );
  b.flag = [w / 2 - 120, top - 500];
  b.body = [-w / 2, crest, w, -crest];
}

function school(b: Build): void {
  const w = b.size === 'small' ? 2000 : b.size === 'medium' ? 2800 : 3600;
  const storeys = b.size === 'large' ? 3 : 2;
  const top = -storeys * 330 - 40;
  block(b, -w / 2, w / 2, top);
  const ridge = roofOver(b, -w / 2, w / 2, top);
  for (let f = 0; f < storeys; f += 1)
    windows(
      b,
      -w / 2 + 80,
      w / 2 - 80,
      -(f + 1) * 330 + 80,
      200,
      190,
      Math.round(w / 380),
      {
        panes: true,
        skip: (i) =>
          f === 0 &&
          Math.abs(
            -w / 2 + 80 + ((w - 160) / Math.round(w / 380)) * (i + 0.5),
          ) < 220,
      },
    );
  // An entrance bay standing a little forward, under its own gable.
  b.walls.push([box(-260, top - 40, 260, 0), b.p.wallLit]);
  if (!b.roof.flat)
    b.roofs.push([
      poly([
        [-300, top - 30],
        [0, top - 230],
        [300, top - 30],
      ]),
      b.p.roof,
    ]);
  door(b, 0, 180, 250, true);
  // The yard's railing along its front.
  b.extra.push((d) =>
    d.part('railing', 'building', [
      [band([-w / 2 - 260, -95], [w / 2 + 260, -95], 10), b.p.metal],
      [
        many(
          Array.from({ length: Math.round((w + 520) / 90) + 1 }, (_, i) =>
            box(-w / 2 - 260 + i * 90 - 4, -110, -w / 2 - 260 + i * 90 + 4, 0),
          ),
        ),
        b.p.metal,
      ],
    ]),
  );
  if (!before(b.era, '1900-1945')) {
    b.extra.push((d) =>
      d.part('flagpole', 'building', [
        [band([-w / 2 - 140, 0], [-w / 2 - 140, -1100], 14), b.p.metal],
      ]),
    );
    b.flag = [-w / 2 - 140, -1100];
  }
  b.body = [-w / 2, ridge, w, -ridge];
}

function hospital(b: Build): void {
  const storeys = b.size === 'small' ? 3 : b.size === 'medium' ? 5 : 7;
  const w = b.size === 'small' ? 2400 : b.size === 'medium' ? 3200 : 3800;
  const top = -storeys * 320 - 60;
  block(b, -w / 2, w / 2, top);
  const ridge = roofOver(b, -w / 2, w / 2, top);
  // Long bands of windows, the wards' light.
  for (let f = 1; f < storeys; f += 1)
    windows(
      b,
      -w / 2 + 60,
      w / 2 - 60,
      -(f + 1) * 320 + 90,
      220,
      160,
      Math.round(w / 330),
    );
  // A canopy over its entrance, on two posts, and a blank sign over that (no emblem, no words).
  b.extra.push((d) =>
    d.part('canopy', 'building', [
      [box(-520, -330, 520, -280), b.p.trim],
      [box(-480, -280, -450, 0), b.p.metal],
      [box(450, -280, 480, 0), b.p.metal],
    ]),
  );
  b.extra.push((d) =>
    d.part('sign', 'building', [
      [box(-260, -470, 260, -370, 18), inLook(b.style, '#e9e4dc')],
    ]),
  );
  b.doors.push([box(-300, -270, 300, 0), mixOk(b.p.glass, b.p.dark, 0.2)]);
  b.glows.push(box(-290, -260, 290, -10));
  // Plant on the roof.
  b.roofs.push([
    box(-w * 0.3, ridge - 160, -w * 0.05, ridge),
    shadeOf(b.p.trim, 0.1),
  ]);
  b.body = [-w / 2, ridge - 160, w, -(ridge - 160)];
}

function market(b: Build): void {
  const stalls = b.size === 'small' ? 3 : b.size === 'medium' ? 4 : 6;
  const sw = 300;
  const gap = 30;
  const w = stalls * sw + (stalls - 1) * gap;
  const x0 = -w / 2;
  // Canopy cloth in a few muted colours, as markets everywhere mix them.
  const cloths = [
    '#c4573a',
    '#d9a441',
    '#3f8f6b',
    '#3d78b5',
    '#b5577a',
    '#e3dccf',
  ].map((c) => inLook(b.style, c));
  const goods = [
    '#d9a441',
    '#c4573a',
    '#7aa04b',
    '#e2c36b',
    '#9b5b3c',
    '#e7ddc9',
  ].map((c) => inLook(b.style, c));
  for (let i = 0; i < stalls; i += 1) {
    const a = x0 + i * (sw + gap);
    const cloth = cloths[(i * 2 + b.rng.int(0, 5)) % cloths.length];
    const goodsOf = (k: number) =>
      goods[(i + k + b.rng.int(0, 5)) % goods.length];
    b.extra.push((d) => {
      const id = `stall-${i + 1}`;
      d.part(id, 'building', [
        // Two poles, the counter and its front cloth.
        [box(a + 10, -250, a + 24, 0), b.p.frame],
        [box(a + sw - 24, -250, a + sw - 10, 0), b.p.frame],
        [box(a, -95, a + sw, -80), b.p.wall],
        [box(a + 6, -80, a + sw - 6, 0), shadeOf(b.p.wall, 0.12)],
        // Goods heaped on the counter.
        ...Array.from({ length: 4 }, (_, k): Fill => [
          ellipse([a + 45 + k * 70, -100], 34, 24),
          goodsOf(k),
        ]),
      ]);
      // The canopy, with its scalloped edge.
      const scallops = 5;
      const edge: Pt[] = [[a - 14, -262]];
      for (let s = 0; s <= scallops; s += 1)
        edge.push([
          a - 14 + ((sw + 28) / scallops) * s,
          -232 + (s % 2 ? 14 : 0),
        ]);
      edge.push([a + sw + 14, -262]);
      d.part(`canopy-${i + 1}`, id, [
        [
          poly([
            [a - 14, -262],
            [a + sw / 2, -330],
            [a + sw + 14, -262],
          ]),
          cloth,
        ],
        [poly(edge), shadeOf(cloth, 0.1)],
      ]);
    });
  }
  b.body = [x0 - 14, -330, w + 28, 330];
  b.notes.push(`${stalls} stalls`);
}

function cranes(b: Build): void {
  const count = b.size === 'large' ? 2 : 1;
  const modern = !before(b.era, '1945-1975');
  const colour = inLook(b.style, modern ? '#d29a2e' : '#7c6f64');
  const shade = shadeOf(colour, 0.22);
  let left = Infinity;
  let right = -Infinity;
  let top = 0;
  for (let k = 0; k < count; k += 1) {
    const cx = (k - (count - 1) / 2) * 3600;
    const id = `crane-${k + 1}`;
    if (modern) {
      // A container crane: a portal on its rails, the boom over the water, the trolley and its spreader.
      const legW = 1700;
      const legH = 3200;
      const boomY = -legH - 100;
      b.extra.push((d) => {
        d.part(id, 'building', [
          [band([cx - legW / 2, 0], [cx - legW / 2 + 120, -legH], 90), colour],
          [band([cx + legW / 2, 0], [cx + legW / 2 - 120, -legH], 90), colour],
          [
            band(
              [cx - legW / 2 + 60, -legH * 0.42],
              [cx + legW / 2 - 60, -legH * 0.42],
              70,
            ),
            shade,
          ],
          [
            band(
              [cx - legW / 2 + 110, -legH],
              [cx + legW / 2 - 110, -legH],
              110,
            ),
            colour,
          ],
          // The machinery house on top, and the backstay's A-frame.
          [box(cx - 300, -legH - 420, cx + 500, -legH - 80), shade],
          [
            poly([
              [cx - 200, -legH - 80],
              [cx + 150, -legH - 1100],
              [cx + 260, -legH - 1100],
              [cx + 450, -legH - 80],
            ]),
            colour,
          ],
        ]);
        d.part(
          `boom-${k + 1}`,
          id,
          [
            [box(cx - 2600, boomY - 90, cx + 1900, boomY + 40), colour],
            [
              band([cx - 2600, boomY - 40], [cx + 200, -legH - 1080], 26),
              shade,
            ],
            [
              band([cx + 1900, boomY - 40], [cx + 260, -legH - 1080], 26),
              shade,
            ],
          ],
          { pivot: [cx + 1900, boomY] },
        );
        d.part(`trolley-${k + 1}`, `boom-${k + 1}`, [
          [box(cx - 1500, boomY + 40, cx - 1180, boomY + 160), shade],
          [band([cx - 1400, boomY + 160], [cx - 1400, -1500], 10), b.p.dark],
          [band([cx - 1280, boomY + 160], [cx - 1280, -1500], 10), b.p.dark],
          [box(cx - 1560, -1500, cx - 1120, -1420), shade],
        ]);
        d.part(`cab-${k + 1}`, `trolley-${k + 1}`, [
          [box(cx - 1460, boomY + 160, cx - 1260, boomY + 300), b.p.glass],
        ]);
      });
      left = Math.min(left, cx - 2600);
      right = Math.max(right, cx + 1900);
      top = Math.min(top, -legH - 1100);
    } else {
      // A dockside crane of the steam and early electric age: a portal over the rails, a turret, a lattice jib.
      const portal = 900;
      b.extra.push((d) => {
        d.part(id, 'building', [
          [
            poly([
              [cx - 520, 0],
              [cx - 380, -portal],
              [cx + 380, -portal],
              [cx + 520, 0],
              [cx + 400, 0],
              [cx + 280, -portal + 160],
              [cx - 280, -portal + 160],
              [cx - 400, 0],
            ]),
            colour,
          ],
          [box(cx - 330, -portal - 520, cx + 360, -portal), shade],
          [box(cx - 250, -portal - 440, cx - 60, -portal - 260), b.p.glass],
        ]);
        const jibFoot: Pt = [cx - 200, -portal - 300];
        const jibTip: Pt = [cx - 2300, -portal - 2400];
        const lattice: Shape[] = [];
        for (let i = 1; i < 8; i += 1) {
          const u = i / 8;
          const p0: Pt = [
            jibFoot[0] + (jibTip[0] - jibFoot[0]) * u,
            jibFoot[1] + (jibTip[1] - jibFoot[1]) * u,
          ];
          lattice.push(
            band([p0[0] - 60, p0[1] + 40], [p0[0] + 60, p0[1] - 40], 14),
          );
        }
        d.part(
          `jib-${k + 1}`,
          id,
          [
            [band(jibFoot, jibTip, 120), colour],
            [many(lattice), shade],
          ],
          { pivot: jibFoot },
        );
        d.part(`hook-${k + 1}`, `jib-${k + 1}`, [
          [band(jibTip, [jibTip[0], -1100], 10), b.p.dark],
          [box(jibTip[0] - 50, -1100, jibTip[0] + 50, -1000), shade],
        ]);
      });
      left = Math.min(left, cx - 2360);
      right = Math.max(right, cx + 520);
      top = Math.min(top, -portal - 2460);
    }
  }
  b.body = [left, top, right - left, -top];
  b.notes.push(
    modern
      ? `${count} container crane${count > 1 ? 's' : ''}`
      : `${count} dockside crane${count > 1 ? 's' : ''}`,
  );
}

function farm(b: Build): void {
  const arid = b.climate === 'arid';
  const bw = b.size === 'small' ? 1000 : b.size === 'medium' ? 1300 : 1600;
  const bh = arid ? 380 : 520;
  const x0 = -bw / 2 - 300;
  const x1 = x0 + bw;
  // The barn: wide doors under its roof (a flat one where it is dry).
  block(b, x0, x1, -bh);
  const ridge = roofOver(
    b,
    x0,
    x1,
    -bh,
    arid
      ? { kind: 'flat', pitch: 0, eaves: 0, flat: true }
      : { ...b.roof, pitch: Math.max(0.42, b.roof.pitch) },
  );
  door(b, (x0 + x1) / 2, bw * 0.34, bh * 0.78, true);
  b.doors.push([
    band(
      [(x0 + x1) / 2 - bw * 0.17, -bh * 0.78],
      [(x0 + x1) / 2 + bw * 0.17, 0],
      16,
    ),
    b.p.frame,
    { bare: true },
  ]);
  b.doors.push([
    band(
      [(x0 + x1) / 2 + bw * 0.17, -bh * 0.78],
      [(x0 + x1) / 2 - bw * 0.17, 0],
      16,
    ),
    b.p.frame,
    { bare: true },
  ]);
  windows(b, x0 + 40, x0 + bw * 0.28, -bh + 90, 90, 90, 1);
  // A silo from the twentieth century on; a hay rick before it; a water tank on a stand where it is dry.
  const sx = x1 + 260;
  if (arid) {
    b.extra.push((d) =>
      d.part('tank', 'building', [
        [band([sx - 120, 0], [sx - 120, -500], 22), b.p.metal],
        [band([sx + 120, 0], [sx + 120, -500], 22), b.p.metal],
        [box(sx - 200, -820, sx + 200, -500, 30), b.p.metal],
        [box(sx - 200, -560, sx + 200, -500), shadeOf(b.p.metal, 0.2)],
      ]),
    );
  } else if (!before(b.era, '1900-1945')) {
    const sr = 190;
    const sh = 1300;
    b.extra.push((d) =>
      d.part('silo', 'building', [
        [box(sx - sr, -sh, sx + sr, 0), inLook(b.style, '#c9c6bd')],
        [
          box(sx + sr * 0.3, -sh, sx + sr, 0),
          inLook(b.style, '#aaa69c'),
          { bare: true },
        ],
        [dome(sx, -sh, sr, sr * 0.8), inLook(b.style, ROOF_COLOUR.metal)],
        ...Array.from({ length: 5 }, (_, i): Fill => [
          box(sx - sr, -sh + 220 * (i + 1), sx + sr, -sh + 220 * (i + 1) + 12),
          inLook(b.style, '#9d998f'),
          { bare: true },
        ]),
      ]),
    );
  } else {
    b.extra.push((d) =>
      d.part('rick', 'building', [
        [ellipse([sx, -230], 230, 240), inLook(b.style, ROOF_COLOUR.thatch)],
        [
          box(sx - 230, -230, sx + 230, 0),
          shadeOf(inLook(b.style, ROOF_COLOUR.thatch), 0.1),
        ],
      ]),
    );
  }
  // A fence in front of it all.
  const fx0 = x0 - 200;
  const fx1 = sx + 400;
  b.extra.push((d) =>
    d.part('fence', 'building', [
      [band([fx0, -80], [fx1, -80], 14), inLook(b.style, '#8b6a4c')],
      [band([fx0, -40], [fx1, -40], 14), inLook(b.style, '#8b6a4c')],
      [
        many(
          Array.from({ length: Math.round((fx1 - fx0) / 160) + 1 }, (_, i) =>
            box(fx0 + i * 160 - 8, -120, fx0 + i * 160 + 8, 0),
          ),
        ),
        inLook(b.style, '#7a5a40'),
      ],
    ]),
  );
  b.body = [
    x0,
    Math.min(ridge, -1300 - 160),
    fx1 - x0,
    -Math.min(ridge, -1300 - 160),
  ];
}

const DRAW: Record<BuildingKind, (b: Build) => void> = {
  house,
  flats,
  tower,
  factory,
  warehouse,
  hall,
  court,
  school,
  hospital,
  market,
  cranes,
  farm,
};

// ── Making a piece ────────────────────────────────────────────────────────

/** A building's settings, made sound by the registry (paramsOf). */
export interface BuildingParams {
  era: EraId;
  climate: Climate;
  size: Size;
  material: Material;
  colour?: string;
  /** Drawn for a set's townscape, seen small: no glazing bars or sills, fewer panes on a tower. */
  small?: boolean;
}

/** A building's parts as drawn, before they are put together: for a set that stands it in its townscape (kit/sets). */
export interface BuildingDrawing {
  drawing: Drawing;
  /** Its main body, what the camera frames, in its units. */
  body: ShotBox;
  /** The tops of its chimneys, where smoke rises. */
  smoke: Pt[];
  material: Exclude<Material, 'auto'>;
  notes: string[];
  hasLights: boolean;
  flag: Pt | null;
}

/** A building's parts drawn in its units, its feet on y = 0: the piece's (drawBuilding) and a set's townscape's. */
export function buildingParts(
  kind: BuildingKind,
  params: BuildingParams,
  style: KitStyle,
  seed: number,
): BuildingDrawing {
  const rng = seeded(seed ^ 0x51ed27);
  const material =
    params.material === 'auto'
      ? materialFor(kind, params.era, params.climate, rng)
      : params.material;
  const roof = roofFor(kind, params.era, params.climate, material);
  const worn = wornColour(style, params.colour, MATERIAL_COLOUR[material]);
  const p = paintOf(style, worn.colour, roof.kind, worn.side);
  const d = new Drawing(
    style,
    kind === 'tower' ? 4000 : kind === 'cranes' ? 3000 : 1200,
  );
  const b: Build = {
    d,
    small: params.small === true,
    style,
    rng,
    era: params.era,
    climate: params.climate,
    size: params.size,
    material,
    roof,
    p,
    glows: [],
    glass: [],
    walls: [],
    roofs: [],
    doors: [],
    chimneys: [],
    flag: null,
    body: [0, 0, 0, 0],
    extra: [],
    notes: [],
  };
  DRAW[kind](b);

  // The parts in paint order: the walls, the roof, the windows and their lights, the door, the chimneys, then the kind's own.
  d.group('building', null, [0, 0]);
  if (b.walls.length) d.part('walls', 'building', b.walls);
  if (b.roofs.length) d.part('roof', 'building', b.roofs);
  if (b.glass.length) d.part('windows', 'building', b.glass);
  if (b.glows.length)
    d.part(
      'lights',
      'building',
      b.glows.map((g): Fill => [g, p.glow, { bare: true }]),
    );
  if (b.doors.length) d.part('door', 'building', b.doors);
  b.chimneys.forEach((stack, i) => {
    const id = i === 0 ? 'chimney' : `chimney-${i + 1}`;
    d.part(id, 'building', stack.shape);
    d.anchor(i === 0 ? 'smoke' : `smoke-${i + 1}`, id, stack.top);
  });
  for (const draw of b.extra) draw(d);
  if (b.flag) d.anchor('flag', 'building', b.flag);
  return {
    drawing: d,
    body: b.body,
    smoke: b.chimneys.map((one) => one.top),
    material,
    notes: [`${material}, ${params.climate}, ${params.era}`, ...b.notes],
    hasLights: b.glows.length > 0,
    flag: b.flag,
  };
}

/**
 * A building drawn: its walls, roof, windows, their lights, door,
 * chimneys with their smoke, its flag's anchor, and the parts its kind
 * has of its own; its rig (lights out by day, dimmed at dusk); its body
 * as the camera's frame.
 */
export function drawBuilding(
  kind: BuildingKind,
  params: BuildingParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  const made = buildingParts(kind, params, style, seed);
  const d = made.drawing;

  // Its box: everything it draws, its feet on y = 0, with the ground shadow's room.
  const drawnBoxes = d.parts
    .filter((one) => one.box && (one.box[2] > 0 || one.box[3] > 0))
    .map((one) => one.box!);
  const drawn = unionBox(drawnBoxes);
  const shadowW = drawn[2] * 0.56;
  const all = unionBox([
    drawn,
    [drawn[0] + drawn[2] / 2 - shadowW, drawn[1], 2 * shadowW, 1],
  ]);
  const shadow = groundShadow(
    `${kind}-shadow`,
    [drawn[0] + drawn[2] / 2, 0],
    shadowW,
    Math.max(30, shadowW * style.shadow.squash * 0.35),
    style.shadow.colour,
    style.shadow.opacity * 0.8,
  );
  // The shadow goes first, under everything (it is not a part).
  const root = d.parts.find((one) => one.id === 'building');
  if (root) root.markup = shadow;
  const pad = 20;
  const boxAll: ShotBox = [
    all[0] - pad,
    Math.min(all[1], made.body[1]) - pad,
    all[2] + 2 * pad,
    -(Math.min(all[1], made.body[1]) - pad),
  ];
  const rig: ShotRigDto = {
    states: made.hasLights
      ? {
          day: { lights: { opacity: 0 } },
          dusk: { lights: { opacity: 0.55 } },
          night: {},
        }
      : {},
    moves: ['enter', 'exit'],
  };
  const side = wornColour(style, params.colour, '#000000').side;
  return d.piece({
    id: `building.${kind}:${params.era}:${params.climate}:${params.size}:${made.material}`,
    box: boxAll,
    focal: made.body,
    rig,
    colours: side ? ['side'] : [made.material],
    notes: made.notes,
  });
}

// ── The registry's entry ──────────────────────────────────────────────────

/** What each kind is, for the board: one line of the kit's guide, its kinds named in it. */
const KINDS_ABOUT =
  'A building of its era and climate (never a named one): kind house (homes), flats (housing), tower (business), factory (industry; smoke rises from its stacks), warehouse (goods), hall (a legislature in general, a flag over it), court (the law), school, hospital, market (stalls: trade, prices), cranes (a port\u2019s), farm (barn and silo).';

const oneOf = <T extends string>(
  list: readonly T[],
  raw: unknown,
  fallback: T,
): T => ((list as readonly unknown[]).includes(raw) ? (raw as T) : fallback);

export const BUILDING_KIT: Readonly<Record<string, KitEntry>> = {
  building: {
    family: 'buildings',
    looks: ['editorial', 'illustrated'],
    about: KINDS_ABOUT,
    params: {
      kind: {
        values: BUILDING_KINDS,
        default: 'house',
        about: 'which building',
        strict: true,
        aliases: {
          home: 'house',
          cottage: 'house',
          apartments: 'flats',
          'apartment-block': 'flats',
          'block-of-flats': 'flats',
          skyscraper: 'tower',
          office: 'tower',
          'office-tower': 'tower',
          mill: 'factory',
          works: 'factory',
          plant: 'factory',
          depot: 'warehouse',
          parliament: 'hall',
          legislature: 'hall',
          assembly: 'hall',
          congress: 'hall',
          courthouse: 'court',
          'law-court': 'court',
          clinic: 'hospital',
          bazaar: 'market',
          stalls: 'market',
          barn: 'farm',
          'port-cranes': 'cranes',
          docks: 'cranes',
        },
      },
      era: {
        values: ERA_IDS,
        default: 'today',
        about: 'when it is: sets how it is built',
      },
      climate: {
        values: CLIMATES,
        default: 'temperate',
        about:
          'never a country: arid has flat roofs, cold steep ones, tropical wide eaves',
      },
      size: { values: SIZES, default: 'medium', about: 'how big' },
      material: {
        values: MATERIALS,
        default: 'auto',
        about: 'auto follows era and climate',
      },
    },
    moves: ['enter', 'exit'],
    make(params: KitParams, style: KitStyle, seed: number): KitPiece {
      return drawBuilding(
        oneOf(BUILDING_KINDS, params.kind, 'house'),
        {
          era: oneOf(ERA_IDS, params.era, 'today'),
          climate: oneOf(CLIMATES, params.climate, 'temperate'),
          size: oneOf(SIZES, params.size, 'medium'),
          material: oneOf(MATERIALS, params.material, 'auto'),
          ...(typeof params.colour === 'string'
            ? { colour: params.colour }
            : {}),
        },
        style,
        seed,
      );
    },
  },
};
