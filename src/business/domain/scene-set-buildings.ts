/**
 * Buildings from parts (studio-scenery-plan §5.2): a house, a shop, a
 * church, a mosque, a classroom, a compound, a tenement, a temple, a
 * mud-brick house, a brownstone, a skyscraper, a kiosk, a zinc-roof house
 * or a barn, assembled by code from walls, roofs, windows, doors,
 * awnings, balconies, stoops, parapets, signboards (shapes only, never
 * words), water tanks, AC units, dishes, chimneys, lamps and flags.
 *
 * Each building's parts are chosen by a seed of its own within its
 * pack's (scene-style-packs): its walls, roof and windows by the pack's
 * weights, narrowed to what its kind has (a church's arched windows, a
 * brownstone's brick), each extra as often as the pack has it, its
 * colours the pack's, tinted. So no two on a street are alike, and the
 * same building is drawn the same way every time.
 *
 * Drawn at its real size in the kit's units (a storey is about three
 * metres), standing on the ground at y = 0, its middle at x = 0. What
 * flaps (an awning, a flag), hangs (a lamp) or sways (a plant) is a
 * segment and says so; birds sit along its roof.
 */
import { CLOTH, COATS, KIT_EXTRAS, SET_COLOURS, FIGURE_INK } from './scene-ink';
import { segment, type SetPiece } from './scene-set-pieces';
import type { SceneryPiece } from './scene-set-scenery';
import {
  circle,
  flatRect,
  framed,
  line,
  m,
  poly,
  r1,
  rect,
  shadowOf,
  shape,
} from './scene-set-draw';
import { drawLandmark } from './scene-set-landmarks';
import {
  packColour,
  seededRandom,
  weighted,
  type BuildingKind,
  type PackExtras,
  type RoofKind,
  type StylePack,
  type WallKind,
  type WindowKind,
} from './scene-style-packs';

/** What a kind of building always has, or narrows its pack's choices to. */
interface BuildingPlan {
  storeys?: readonly [number, number];
  /** A storey this much taller than the pack's. */
  storeyK?: number;
  widthM?: readonly [number, number];
  walls?: readonly WallKind[];
  roofs?: readonly RoofKind[];
  windows?: readonly WindowKind[];
  /** A shop's glass front on its ground floor. */
  shopfront?: boolean;
  door?: 'single' | 'double' | 'arched' | 'barn';
  /** How often it has each extra, over its pack's. */
  extras?: Partial<PackExtras>;
}

const PLANS: Record<BuildingKind, BuildingPlan> = {
  house: {},
  shop: {
    storeys: [1, 2],
    shopfront: true,
    extras: { signboard: 0.9, awning: 0.75 },
  },
  church: {
    storeys: [1, 1],
    storeyK: 2,
    widthM: [7, 10],
    roofs: ['tile', 'shingle', 'zinc'],
    windows: ['arched'],
    door: 'double',
    extras: {
      awning: 0,
      signboard: 0,
      balcony: 0,
      waterTank: 0,
      ac: 0,
      stoop: 0.6,
    },
  },
  mosque: {
    storeys: [1, 1],
    storeyK: 1.6,
    widthM: [8, 11],
    roofs: ['dome'],
    windows: ['arched'],
    door: 'arched',
    extras: {
      awning: 0,
      signboard: 0,
      balcony: 0,
      waterTank: 0,
      ac: 0,
      chimney: 0,
    },
  },
  classroom: {
    storeys: [1, 1],
    storeyK: 1.1,
    widthM: [11, 15],
    windows: ['louvred', 'sash', 'barred'],
    extras: { flag: 0.9, awning: 0, balcony: 0, signboard: 0.4, chimney: 0 },
  },
  compound: { storeys: [1, 2], widthM: [9, 12] },
  tenement: {
    storeys: [3, 5],
    widthM: [8, 11],
    extras: { balcony: 0.85, ac: 0.6, stoop: 0.2 },
  },
  temple: {},
  'mud brick house': {
    storeys: [1, 2],
    walls: ['mud brick'],
    roofs: ['flat'],
    windows: ['slit'],
  },
  brownstone: {
    storeys: [3, 4],
    widthM: [5.5, 7],
    walls: ['brick'],
    roofs: ['flat'],
    windows: ['sash', 'arched'],
    extras: { stoop: 1, parapet: 1, awning: 0.1, balcony: 0, waterTank: 0.1 },
  },
  skyscraper: {},
  kiosk: {},
  'zinc roof house': {
    storeys: [1, 1],
    walls: ['painted block', 'plaster'],
    roofs: ['zinc'],
    windows: ['louvred', 'barred'],
  },
  barn: {
    storeys: [1, 1],
    storeyK: 1.8,
    widthM: [8, 11],
    walls: ['clapboard'],
    roofs: ['shingle', 'zinc'],
    windows: ['sash'],
    door: 'barn',
    extras: {
      awning: 0,
      signboard: 0,
      balcony: 0,
      stoop: 0,
      ac: 0,
      satellite: 0,
      chimney: 0,
      plants: 0,
    },
  },
};

const WOOD = SET_COLOURS.wood;
const WOOD_DARK = KIT_EXTRAS['dark wood'];
const GLASS = KIT_EXTRAS.glass;
const STEEL = KIT_EXTRAS.steel;
const GOLD = KIT_EXTRAS.gold;
const PAPER = KIT_EXTRAS.paper;
const LEAF = SET_COLOURS.leaves;
const LEAF_DARK = KIT_EXTRAS['dark leaf'];
const DARK = '#3a3740';
const STRAW = '#e2c27a';
const STRAW_DARK = '#c9a45b';

/** A colour a little darker (k < 1) or lighter. */
function tone(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `#${[n >> 16, (n >> 8) & 255, n & 255]
    .map((v) =>
      Math.max(
        0,
        Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))),
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** The walls' colour a kind of wall comes in, from its pack's. */
function wallColour(wall: WallKind, pack: StylePack, r: number): string {
  const pick = (list: readonly string[]) =>
    list[Math.floor(r * list.length) % list.length];
  switch (wall) {
    case 'mud brick':
      return pick([SET_COLOURS.earth, COATS.tan, '#dcc190']);
    case 'brick':
      return pick([COATS.chestnut, SET_COLOURS.roofs, CLOTH.brown]);
    case 'glass':
      return pick([GLASS, '#b9d3e2']);
    case 'stone':
      return pick([SET_COLOURS.stone, COATS.cream, KIT_EXTRAS.concrete]);
    default:
      return pick(pack.palette.walls);
  }
}

/** A roof's colour, from its pack's. */
function roofColour(roof: RoofKind, pack: StylePack, r: number): string {
  const pick = (list: readonly string[]) =>
    list[Math.floor(r * list.length) % list.length];
  switch (roof) {
    case 'thatch':
      return STRAW;
    case 'zinc':
      return pick([STEEL, CLOTH.grey, COATS.chestnut]);
    case 'dome':
      return pick([CLOTH.teal, CLOTH.green, GOLD, PAPER]);
    default:
      return pick(pack.palette.roofs);
  }
}

/** The buildings that may have a signboard over their ground floor. */
const SIGNED: ReadonlySet<BuildingKind> = new Set([
  'shop',
  'tenement',
  'classroom',
  'kiosk',
]);

/** What a building is drawn from once its parts are chosen: for the stage to know it. */
export interface BuildingParts {
  kind: BuildingKind;
  storeys: number;
  widthM: number;
  wall: WallKind;
  roof: RoofKind;
  window: WindowKind;
  extras: (keyof PackExtras)[];
}

/**
 * A building of a kind in its pack, its parts chosen by its seed: the
 * same seed, the same building. `colour` is its walls', where the
 * painter gave one.
 */
export function drawBuilding(
  kind: BuildingKind,
  pack: StylePack,
  seed: string,
  colour?: string,
): SceneryPiece & { parts: BuildingParts } {
  const random = seededRandom(`${pack.id}:${kind}:${seed}`);
  if (kind === 'temple') {
    const piece = drawLandmark(
      'temple',
      {
        pylon: pack.id === 'ancient-near-east',
        columns: 4 + Math.floor(random() * 4),
        size: 0.4,
      },
      colour ? packColour(pack, colour) : undefined,
    );
    return {
      ...piece,
      parts: {
        kind,
        storeys: 1,
        widthM: 20,
        wall: 'stone',
        roof: 'flat',
        window: 'slit',
        extras: [],
      },
    };
  }
  if (kind === 'skyscraper') return skyscraper(pack, random, colour);
  if (kind === 'kiosk') return kiosk(pack, random, colour);
  const plan = PLANS[kind];
  const P = pack.proportions;
  const between = (range: readonly [number, number]) =>
    range[0] + random() * (range[1] - range[0]);
  const storeys = Math.round(between(plan.storeys ?? P.storeys));
  const sh = m(P.storeyM) * (plan.storeyK ?? 1);
  const widthM = Math.round(between(plan.widthM ?? P.widthM) * 10) / 10;
  const W = m(widthM);
  const half = W / 2;
  const H = storeys * sh;
  const wall = weighted(pack.walls, random(), plan.walls);
  const roof = weighted(pack.roofs, random(), plan.roofs);
  const win = weighted(pack.windows, random(), plan.windows);
  const tint = (hex: string) => packColour(pack, hex);
  const walls = tint(colour ?? wallColour(wall, pack, random()));
  const roofC = tint(roofColour(roof, pack, random()));
  const doorC = tint(
    pack.palette.doors[Math.floor(random() * pack.palette.doors.length)],
  );
  const trim = tint(
    pack.palette.trims[Math.floor(random() * pack.palette.trims.length)],
  );
  const awningC = tint(
    pack.palette.awnings[Math.floor(random() * pack.palette.awnings.length)],
  );
  const has = (extra: keyof PackExtras) =>
    random() <
    (plan.extras?.[extra] ??
      // A signboard is a shop's or a school's, never a home's.
      (extra === 'signboard' && !SIGNED.has(kind) ? 0 : pack.extras[extra]));
  const chosen = {
    awning: has('awning'),
    balcony: storeys > 1 && has('balcony'),
    stoop: has('stoop'),
    parapet:
      roof === 'flat' || roof === 'dome'
        ? has('parapet') || roof === 'flat'
        : false,
    signboard: has('signboard'),
    waterTank: (roof === 'flat' || roof === 'zinc') && has('waterTank'),
    ac: has('ac'),
    satellite: has('satellite'),
    chimney:
      (roof === 'tile' || roof === 'shingle' || roof === 'thatch') &&
      has('chimney'),
    lamp: has('lamp'),
    flag: has('flag'),
    plants: has('plants'),
  };
  const detail = P.detail;
  const front: string[] = [];
  const behind: string[] = [];
  let roofTop = -H;
  const roosts: [number, number][] = [];

  // ── The roof ──
  const eave = m(0.35);
  const pitchH = Math.min(
    m(3.2),
    half * P.pitch * (roof === 'thatch' ? 1.3 : 1),
  );
  if (roof === 'flat') {
    const lip = chosen.parapet ? m(0.45) : m(0.2);
    front.push(rect(-half - 8, -H - lip, W + 16, lip + 4, tone(walls, 0.9), 1));
    if (detail >= 1 && wall === 'mud brick')
      // Its roof beams' ends, a row of them under the parapet.
      front.push(
        Array.from({ length: Math.max(3, Math.floor(widthM * 1.4)) }, (_, k) =>
          circle(
            -half +
              m(0.4) +
              (k * (W - m(0.8))) / Math.max(2, Math.floor(widthM * 1.4) - 1),
            -H + m(0.25),
            9,
            WOOD_DARK,
          ),
        ).join(''),
      );
    roofTop = -H - lip;
    roosts.push([-half * 0.6, roofTop], [0, roofTop], [half * 0.6, roofTop]);
  } else if (roof === 'dome') {
    const lip = m(0.4);
    front.push(rect(-half - 8, -H - lip, W + 16, lip + 4, tone(walls, 0.9), 1));
    const drumW = Math.min(W * 0.55, m(6));
    const drumH = m(1.1);
    const domeR = drumW / 2;
    front.push(
      rect(-drumW / 2, -H - lip - drumH, drumW, drumH + 2, walls, 0),
      shape(
        `M${r1(-domeR)},${r1(-H - lip - drumH)} Q${r1(-domeR)},${r1(-H - lip - drumH - domeR * 1.3)} 0,${r1(-H - lip - drumH - domeR * 1.3)} Q${r1(domeR)},${r1(-H - lip - drumH - domeR * 1.3)} ${r1(domeR)},${r1(-H - lip - drumH)} Z`,
        roofC,
      ),
    );
    roofTop = -H - lip - drumH - domeR * 1.3;
    front.push(
      rect(-4, roofTop - m(0.6), 8, m(0.6), GOLD, 2),
      circle(0, roofTop - m(0.7), 12, GOLD),
    );
    roosts.push(
      [-half * 0.7, -H - lip],
      [0, roofTop - m(0.8)],
      [half * 0.7, -H - lip],
    );
    roofTop -= m(0.8);
  } else {
    // Pitched: its face seen from the street, over the eaves.
    const top = -H - pitchH;
    const ridge =
      roof === 'zinc'
        ? half * 0.9
        : roof === 'thatch'
          ? half * 0.35
          : half * 0.55;
    const face = poly([
      [-half - eave, -H + 4],
      [-ridge, top],
      [ridge, top],
      [half + eave, -H + 4],
    ]);
    if (chosen.chimney)
      behind.push(
        rect(
          half * 0.35,
          top - m(0.4),
          m(0.6),
          m(1.4) + pitchH * 0.3,
          tone(walls, 0.85),
          1,
        ),
      );
    front.push(shape(face, roofC));
    const lines: string[] = [];
    if (roof === 'zinc') {
      // Corrugations down the sheets, and a patch of rust.
      const n = Math.max(4, Math.floor(widthM * 2));
      for (let k = 1; k < n; k += 1) {
        const t = k / n;
        const xb = -half - eave + (W + 2 * eave) * t;
        const xt = -ridge + 2 * ridge * t;
        lines.push(`M${r1(xt)},${r1(top + 4)} L${r1(xb)},${r1(-H)}`);
      }
      front.push(line(lines.join(' '), tone(roofC, 0.82), 2));
      if (detail >= 1)
        front.push(
          flatRect(
            -half * 0.2,
            top + pitchH * 0.35,
            W * 0.18,
            pitchH * 0.35,
            COATS.chestnut,
            4,
          ),
        );
    } else if (roof === 'thatch') {
      for (let k = 1; k < 8; k += 1) {
        const t = k / 8;
        lines.push(
          `M${r1(-ridge + 2 * ridge * t)},${r1(top + 6)} L${r1(-half - eave + (W + 2 * eave) * t)},${r1(-H + 2)}`,
        );
      }
      front.push(line(lines.join(' '), STRAW_DARK, 3));
    } else {
      // Tiles or shingles: rows across.
      const rows = roof === 'tile' ? 4 : 5;
      for (let k = 1; k < rows; k += 1) {
        const t = k / rows;
        const y = top + pitchH * t;
        const x = ridge + (half + eave - ridge) * t;
        lines.push(`M${r1(-x)},${r1(y)} L${r1(x)},${r1(y)}`);
      }
      front.push(line(lines.join(' '), tone(roofC, 0.8), 2.4));
    }
    roofTop = top;
    roosts.push([-ridge, top], [0, top], [ridge, top]);
  }

  // ── The walls and what is on them ──
  const body: string[] = [rect(-half, -H, W, H + 2, walls, 0)];
  const random2 = seededRandom(`${seed}:marks`);
  if (detail >= 1) {
    const marks: string[] = [];
    const area = widthM * storeys;
    if (wall === 'mud brick' || wall === 'brick')
      for (
        let k = 0;
        k < Math.min(18, Math.round(area * (wall === 'brick' ? 2 : 1.2)));
        k += 1
      )
        marks.push(
          flatRect(
            -half + m(0.2) + random2() * (W - m(0.8)),
            -H + m(0.3) + random2() * (H - m(0.6)),
            m(0.45),
            8,
            tone(walls, 0.86),
            2,
          ),
        );
    else if (wall === 'painted block' || wall === 'clapboard') {
      const step = wall === 'clapboard' ? m(0.3) : m(0.6);
      const rows: string[] = [];
      for (let y = -step; y > -H + step / 2; y -= step)
        rows.push(`M${r1(-half + 4)},${r1(y)} L${r1(half - 4)},${r1(y)}`);
      marks.push(line(rows.join(' '), tone(walls, 0.9), 2));
    } else if (wall === 'plaster') {
      for (let k = 0; k < 3; k += 1)
        marks.push(
          flatRect(
            -half + random2() * (W - m(1.2)),
            -H + m(0.4) + random2() * (H - m(1.2)),
            m(0.9),
            m(0.5),
            tone(walls, 0.94),
            12,
          ),
        );
    } else if (wall === 'stone')
      for (let k = 0; k < Math.min(14, Math.round(area * 1.5)); k += 1)
        marks.push(
          flatRect(
            -half + m(0.2) + random2() * (W - m(0.9)),
            -H + m(0.3) + random2() * (H - m(0.6)),
            m(0.6),
            m(0.3),
            tone(walls, 0.9),
            6,
          ),
        );
    body.push(...marks);
    if (storeys > 1)
      body.push(
        ...Array.from({ length: storeys - 1 }, (_, k) =>
          flatRect(-half, -(k + 1) * sh - 6, W, 10, tone(walls, 0.86)),
        ),
      );
  }

  // The door, where the ground floor has room, and raised up its stoop.
  const stoopH = chosen.stoop ? (kind === 'brownstone' ? m(1.3) : m(0.45)) : 0;
  const doorKind = plan.door ?? 'single';
  const doorW =
    doorKind === 'barn' ? m(3) : doorKind === 'single' ? m(1) : m(1.7);
  const doorH =
    doorKind === 'barn'
      ? Math.min(sh - m(0.8), m(3.6))
      : Math.min(sh - m(0.5), m(2.2) + (doorKind === 'single' ? 0 : m(0.6)));
  const doorX =
    plan.shopfront || doorKind !== 'single' || kind === 'brownstone'
      ? plan.shopfront
        ? half - m(1.4)
        : kind === 'brownstone'
          ? -half + m(1.4)
          : 0
      : [0, -half + m(1.4), half - m(1.4)][Math.floor(random() * 3)];
  const doorY = -stoopH;
  if (doorKind === 'arched' || doorKind === 'double')
    body.push(
      shape(
        `M${r1(doorX - doorW / 2)},${r1(doorY)} L${r1(doorX - doorW / 2)},${r1(doorY - doorH + doorW / 2)} Q${r1(doorX - doorW / 2)},${r1(doorY - doorH)} ${r1(doorX)},${r1(doorY - doorH)} Q${r1(doorX + doorW / 2)},${r1(doorY - doorH)} ${r1(doorX + doorW / 2)},${r1(doorY - doorH + doorW / 2)} L${r1(doorX + doorW / 2)},${r1(doorY)} Z`,
        doorKind === 'arched' ? DARK : doorC,
      ),
      doorKind === 'double'
        ? line(
            `M${r1(doorX)},${r1(doorY)} L${r1(doorX)},${r1(doorY - doorH + 6)}`,
            FIGURE_INK,
            2.4,
          )
        : '',
    );
  else if (doorKind === 'barn')
    body.push(
      rect(doorX - doorW / 2, doorY - doorH, doorW, doorH, doorC, 0),
      line(
        `M${r1(doorX - doorW / 2)},${r1(doorY)} L${r1(doorX + doorW / 2)},${r1(doorY - doorH)} M${r1(doorX - doorW / 2)},${r1(doorY - doorH)} L${r1(doorX + doorW / 2)},${r1(doorY)} M${r1(doorX)},${r1(doorY)} L${r1(doorX)},${r1(doorY - doorH)}`,
        PAPER,
        6,
      ),
    );
  else
    body.push(
      rect(
        doorX - doorW / 2 - 8,
        doorY - doorH - 8,
        doorW + 16,
        doorH + 8,
        trim,
        0,
      ),
      rect(doorX - doorW / 2, doorY - doorH, doorW, doorH, doorC, 0),
      detail >= 1
        ? rect(
            doorX - doorW / 2 + 14,
            doorY - doorH + 14,
            doorW - 28,
            doorH * 0.35,
            tone(doorC, 1.2),
            2,
          )
        : '',
      circle(doorX + doorW / 2 - 16, doorY - doorH / 2, 5, GOLD),
    );
  if (stoopH) {
    const n = kind === 'brownstone' ? 5 : 2;
    for (let k = 0; k < n; k += 1) {
      const w = doorW + m(0.5) + (n - k) * m(0.25);
      body.push(
        rect(
          doorX - w / 2,
          -((k + 1) * stoopH) / n,
          w,
          stoopH / n + 2,
          tone(KIT_EXTRAS.concrete, 0.95),
          0,
        ),
      );
    }
    if (kind === 'brownstone')
      body.push(
        line(
          `M${r1(doorX - doorW / 2 - m(0.9))},0 L${r1(doorX - doorW / 2 - m(0.3))},${r1(-stoopH - m(0.9))} M${r1(doorX + doorW / 2 + m(0.9))},0 L${r1(doorX + doorW / 2 + m(0.3))},${r1(-stoopH - m(0.9))}`,
          FIGURE_INK,
          5,
        ),
      );
  }

  // The windows of each storey, spaced across, clear of the door.
  const size: Record<WindowKind, [number, number]> = {
    slit: [m(0.3), m(0.9)],
    arched: [
      m(0.9),
      m(1.6) * (plan.storeyK ?? 1) > m(2.4)
        ? m(2.4)
        : m(1.6) * (plan.storeyK ?? 1),
    ],
    louvred: [m(1), m(1.1)],
    sash: [m(0.85), m(1.4)],
    shopfront: [m(0.85), m(1.4)],
    barred: [m(0.9), m(1.2)],
  };
  const [ww, wh] = size[win];
  const gap = m(win === 'slit' ? 1.2 : 0.9);
  const count = Math.max(1, Math.floor((W - m(1.2) + gap) / (ww + gap)));
  const drawWindow = (x: number, y: number, kindOf: WindowKind) => {
    const [w, h] = size[kindOf];
    const top = y - h;
    switch (kindOf) {
      case 'slit':
        return rect(x - w / 2, top, w, h, DARK, 0);
      case 'arched':
        return (
          shape(
            `M${r1(x - w / 2)},${r1(y)} L${r1(x - w / 2)},${r1(top + w / 2)} Q${r1(x - w / 2)},${r1(top)} ${r1(x)},${r1(top)} Q${r1(x + w / 2)},${r1(top)} ${r1(x + w / 2)},${r1(top + w / 2)} L${r1(x + w / 2)},${r1(y)} Z`,
            wall === 'mud brick' ? DARK : GLASS,
          ) +
          (detail >= 1
            ? line(`M${r1(x)},${r1(top + 4)} L${r1(x)},${r1(y)}`, FIGURE_INK, 2)
            : '')
        );
      case 'louvred':
        return (
          rect(x - w / 2, top, w, h, trim, 0) +
          line(
            Array.from({ length: 5 }, (_, k) => {
              const yy = top + ((k + 0.8) * h) / 5.6;
              return `M${r1(x - w / 2 + 8)},${r1(yy)} L${r1(x + w / 2 - 8)},${r1(yy)}`;
            }).join(' '),
            FIGURE_INK,
            1.8,
          )
        );
      case 'barred':
        return (
          rect(x - w / 2, top, w, h, GLASS, 0) +
          line(
            [0.2, 0.4, 0.6, 0.8]
              .map(
                (k) =>
                  `M${r1(x - w / 2 + w * k)},${r1(top)} L${r1(x - w / 2 + w * k)},${r1(y)}`,
              )
              .join(' ') +
              ` M${r1(x - w / 2)},${r1(top + h / 2)} L${r1(x + w / 2)},${r1(top + h / 2)}`,
            FIGURE_INK,
            2.4,
          )
        );
      default:
        return (
          (detail >= 1 && (kind === 'brownstone' || wall === 'brick')
            ? rect(
                x - w / 2 - 8,
                top - m(0.22),
                w + 16,
                m(0.2),
                tone(walls, 1.3),
                0,
              )
            : '') +
          rect(x - w / 2, top, w, h, GLASS, 0) +
          line(
            `M${r1(x)},${r1(top)} L${r1(x)},${r1(y)} M${r1(x - w / 2)},${r1(top + h / 2)} L${r1(x + w / 2)},${r1(top + h / 2)}`,
            FIGURE_INK,
            2,
          ) +
          rect(x - w / 2 - 6, y, w + 12, 10, trim, 1)
        );
    }
  };
  const windows: string[] = [];
  let acAt: [number, number] | null = null;
  for (let s = 0; s < storeys; s += 1) {
    const base = -s * sh - (s === 0 ? stoopH * 0.6 : 0);
    const sill = base - (sh - wh) * 0.42;
    if (s === 0 && plan.shopfront) {
      // A shop's glass front across most of its ground floor, and the door in it.
      const x0 = -half + m(0.5);
      const x1 = doorX - doorW / 2 - m(0.3);
      if (x1 - x0 > m(1))
        windows.push(
          rect(x0, base - m(2.3), x1 - x0, m(1.9), GLASS, 0) +
            line(
              `M${r1((x0 + x1) / 2)},${r1(base - m(2.3))} L${r1((x0 + x1) / 2)},${r1(base - m(0.4))}`,
              FIGURE_INK,
              2.4,
            ) +
            rect(
              x0 - 6,
              base - m(0.42),
              x1 - x0 + 12,
              m(0.42),
              tone(walls, 0.8),
              0,
            ),
        );
      continue;
    }
    const kindOf: WindowKind = win === 'shopfront' ? 'sash' : win;
    for (let k = 0; k < count; k += 1) {
      const x =
        count === 1
          ? 0
          : -half + m(0.6) + ww / 2 + (k * (W - m(1.2) - ww)) / (count - 1);
      if (s === 0 && Math.abs(x - doorX) < (doorW + ww) / 2 + m(0.25)) continue;
      windows.push(drawWindow(x, sill, kindOf));
      if (!acAt && s > 0 && chosen.ac)
        acAt = [x + ww / 2 + m(0.55), sill - wh * 0.3];
    }
    // A balcony across the middle of each upper storey: its slab and rail.
    if (s > 0 && chosen.balcony) {
      const bw = W * (kind === 'tenement' ? 0.8 : 0.5);
      const y = base - m(0.1);
      windows.push(
        rect(-bw / 2, y - 10, bw, 16, tone(walls, 0.82), 0) +
          line(
            [
              `M${r1(-bw / 2)},${r1(y - m(1))} L${r1(bw / 2)},${r1(y - m(1))}`,
              ...Array.from({ length: 7 }, (_, k) => {
                const x = -bw / 2 + (k * bw) / 6;
                return `M${r1(x)},${r1(y - 10)} L${r1(x)},${r1(y - m(1))}`;
              }),
            ].join(' '),
            FIGURE_INK,
            3,
          ),
      );
    }
  }
  body.push(...windows);
  if (acAt && detail >= 1) {
    const [ax, ay] = acAt;
    if (ax + m(0.5) < half)
      body.push(
        rect(ax - m(0.4), ay, m(0.8), m(0.5), PAPER, 3),
        line(
          `M${r1(ax - m(0.3))},${r1(ay + m(0.15))} L${r1(ax + m(0.3))},${r1(ay + m(0.15))} M${r1(ax - m(0.3))},${r1(ay + m(0.3))} L${r1(ax + m(0.3))},${r1(ay + m(0.3))}`,
          FIGURE_INK,
          1.6,
        ),
      );
  }
  // A signboard over the ground floor: a board of colours and shapes, never words.
  if (chosen.signboard && storeys >= 1 && sh > m(2.6)) {
    const sw = Math.min(W * 0.6, m(4));
    const sy = -Math.min(sh, H) + m(0.25) - (plan.shopfront ? 0 : 0);
    const sx = plan.shopfront ? -half + m(0.5) + sw / 2 : 0;
    body.push(
      rect(sx - sw / 2, sy, sw, m(0.55), trim, 3) +
        circle(sx - sw / 2 + m(0.35), sy + m(0.275), m(0.16), awningC) +
        flatRect(
          sx - sw / 2 + m(0.7),
          sy + m(0.14),
          sw * 0.55,
          m(0.1),
          PAPER,
          3,
        ) +
        flatRect(
          sx - sw / 2 + m(0.7),
          sy + m(0.32),
          sw * 0.35,
          m(0.08),
          PAPER,
          3,
        ),
    );
  }

  // What hangs off the front and answers the wind: an awning, a lamp.
  let reacts: SetPiece['reacts'];
  if (chosen.awning) {
    const aw = plan.shopfront ? W * 0.72 : doorW + m(1.4);
    const ax = plan.shopfront ? -half + m(0.3) + aw / 2 - m(0.3) : doorX;
    const ay = -stoopH - Math.min(doorH + m(0.25), sh - m(0.35));
    const depth = m(0.75);
    const stripes = Math.max(3, Math.round(aw / m(0.6)));
    const bands = Array.from({ length: stripes }, (_, k) =>
      k % 2
        ? ''
        : shape(
            poly([
              [ax - aw / 2 + (k * aw) / stripes, ay],
              [ax - aw / 2 + ((k + 1) * aw) / stripes, ay],
              [ax - aw / 2 + ((k + 1) * aw) / stripes + 6, ay + depth],
              [ax - aw / 2 + (k * aw) / stripes + 6, ay + depth],
            ]),
            awningC,
          ),
    ).join('');
    front.push(
      segment(
        0,
        [r1(ax), r1(ay)],
        shape(
          poly([
            [ax - aw / 2, ay],
            [ax + aw / 2, ay],
            [ax + aw / 2 + 6, ay + depth],
            [ax - aw / 2 + 6, ay + depth],
          ]),
          PAPER,
        ) + bands,
      ),
    );
    reacts = { as: 'flag', len: r1(depth) };
  } else if (chosen.lamp) {
    const lx = doorX + doorW / 2 + m(0.45);
    const ly = -stoopH - doorH - m(0.1);
    front.push(
      line(
        `M${r1(lx - m(0.25))},${r1(ly)} L${r1(lx)},${r1(ly)}`,
        FIGURE_INK,
        3,
      ),
      segment(
        0,
        [r1(lx), r1(ly)],
        line(
          `M${r1(lx)},${r1(ly)} L${r1(lx)},${r1(ly + m(0.15))}`,
          FIGURE_INK,
          2,
        ) + rect(lx - m(0.13), ly + m(0.15), m(0.26), m(0.34), GOLD, 3),
      ),
    );
    reacts = { as: 'hang', len: r1(m(0.45)) };
  }
  // On the roof: a water tank, a dish; before the building, a pot plant, a flag on its pole.
  if (chosen.waterTank) {
    const tx = half * (random() < 0.5 ? -0.5 : 0.45);
    const base = roof === 'zinc' ? -H - pitchH * 0.4 : roofTop;
    if (pack.id === 'western-city')
      behind.push(
        line(
          `M${r1(tx - m(0.8))},${r1(base)} L${r1(tx - m(0.7))},${r1(base - m(1.2))} M${r1(tx + m(0.8))},${r1(base)} L${r1(tx + m(0.7))},${r1(base - m(1.2))}`,
          FIGURE_INK,
          5,
        ),
        rect(tx - m(0.9), base - m(3), m(1.8), m(1.8), WOOD, 4),
        shape(
          poly([
            [tx - m(1), base - m(3)],
            [tx, base - m(3.8)],
            [tx + m(1), base - m(3)],
          ]),
          WOOD_DARK,
        ),
      );
    else
      behind.push(
        rect(tx - m(0.55), base - m(1.3), m(1.1), m(1.3), CLOTH.black, 8),
        flatRect(tx - m(0.55), base - m(0.9), m(1.1), 6, CLOTH.grey),
      );
    roofTop = Math.min(
      roofTop,
      base - m(pack.id === 'western-city' ? 3.8 : 1.3),
    );
  }
  if (chosen.satellite && detail >= 1) {
    const sx = -half * 0.55;
    const sy = roof === 'flat' ? roofTop : -H - pitchH * 0.3;
    front.push(
      `<ellipse cx="${r1(sx)}" cy="${r1(sy - m(0.35))}" rx="${r1(m(0.35))}" ry="${r1(m(0.25))}" fill="${PAPER}" transform="rotate(-25 ${r1(sx)} ${r1(sy - m(0.35))})"/>`,
      line(`M${r1(sx)},${r1(sy - m(0.2))} L${r1(sx)},${r1(sy)}`, FIGURE_INK, 3),
    );
  }
  if (chosen.plants && !(stoopH && kind === 'brownstone')) {
    const px = doorX + (doorX > 0 ? -1 : 1) * (doorW / 2 + m(0.5));
    front.push(
      shape(
        `M${r1(px - m(0.22))},0 L${r1(px - m(0.28))},${r1(-m(0.4))} L${r1(px + m(0.28))},${r1(-m(0.4))} L${r1(px + m(0.22))},0 Z`,
        SET_COLOURS.roofs,
      ),
      segment(
        1,
        [r1(px), r1(-m(0.4))],
        shape(
          `M${r1(px)},${r1(-m(0.4))} Q${r1(px - m(0.5))},${r1(-m(0.8))} ${r1(px - m(0.3))},${r1(-m(1.1))} Q${r1(px)},${r1(-m(0.8))} ${r1(px)},${r1(-m(0.4))} Z`,
          LEAF,
        ) +
          shape(
            `M${r1(px)},${r1(-m(0.4))} Q${r1(px + m(0.5))},${r1(-m(0.85))} ${r1(px + m(0.25))},${r1(-m(1.15))} Q${r1(px)},${r1(-m(0.8))} ${r1(px)},${r1(-m(0.4))} Z`,
            LEAF_DARK,
          ),
      ),
    );
    if (!reacts) reacts = { as: 'sway', len: r1(m(0.75)) };
  }
  if (chosen.flag) {
    const fx = kind === 'classroom' ? half + m(1.2) : half * 0.6;
    const fy = kind === 'classroom' ? 0 : roofTop;
    const pole = kind === 'classroom' ? m(6) : m(2.2);
    front.push(
      line(`M${r1(fx)},${r1(fy)} L${r1(fx)},${r1(fy - pole)}`, FIGURE_INK, 6),
      line(`M${r1(fx)},${r1(fy)} L${r1(fx)},${r1(fy - pole)}`, STEEL, 3),
      segment(
        2,
        [r1(fx), r1(fy - pole)],
        shape(
          poly([
            [fx, fy - pole],
            [fx + m(1.4), fy - pole],
            [fx + m(1.4), fy - pole + m(0.9)],
            [fx, fy - pole + m(0.9)],
          ]),
          CLOTH.green,
        ) + flatRect(fx + m(0.47), fy - pole, m(0.47), m(0.9), PAPER),
      ),
    );
    roofTop = Math.min(roofTop, fy - pole);
    if (!reacts) reacts = { as: 'flag', len: r1(m(1.4)) };
  }

  let extra = '';
  let left = -half - eave;
  let right = half + eave + (kind === 'classroom' && chosen.flag ? m(2.8) : 0);
  if (kind === 'church') {
    // A tower at one side, its spire and a cross on it.
    const tx = half - m(1.3);
    const tw = m(2.4);
    const th = H + m(4);
    extra =
      rect(tx - tw / 2, -th, tw, th + 2, walls, 0) +
      shape(
        `M${r1(tx - m(0.35))},${r1(-th + m(2.4))} L${r1(tx - m(0.35))},${r1(-th + m(1.2))} Q${r1(tx)},${r1(-th + m(0.8))} ${r1(tx + m(0.35))},${r1(-th + m(1.2))} L${r1(tx + m(0.35))},${r1(-th + m(2.4))} Z`,
        DARK,
      ) +
      shape(
        poly([
          [tx - tw / 2 - 10, -th],
          [tx, -th - m(3.4)],
          [tx + tw / 2 + 10, -th],
        ]),
        roofC,
      ) +
      rect(tx - 5, -th - m(4.4), 10, m(1.1), GOLD, 1) +
      rect(tx - m(0.3), -th - m(4.1), m(0.6), 10, GOLD, 1);
    roofTop = Math.min(roofTop, -th - m(4.4));
    roosts.push([tx, -th - m(3.4)]);
    right = Math.max(right, tx + tw / 2 + 10);
  } else if (kind === 'mosque') {
    // A minaret at one side: its shaft, its balcony and its little dome.
    const mx = -half - m(1.6);
    const mh = H + m(7);
    extra =
      rect(mx - m(0.6), -mh, m(1.2), mh + 2, walls, 0) +
      rect(mx - m(0.9), -mh + m(1.6), m(1.8), m(0.35), tone(walls, 0.85), 1) +
      shape(
        `M${r1(mx - m(0.6))},${r1(-mh)} Q${r1(mx)},${r1(-mh - m(1.6))} ${r1(mx + m(0.6))},${r1(-mh)} Z`,
        roofC,
      ) +
      circle(mx, -mh - m(2), m(0.22), GOLD) +
      circle(mx + m(0.1), -mh - m(2.05), m(0.17), walls);
    roofTop = Math.min(roofTop, -mh - m(2.3));
    roosts.push([mx, -mh - m(1.5)]);
    left = Math.min(left, mx - m(0.9));
  } else if (kind === 'compound') {
    // Its wall runs before the house, with a gate in it: the house seen over it.
    const wallH = m(2.2);
    const gw = m(2.8);
    const wallC = tint(KIT_EXTRAS.concrete);
    const gateC = tint(pack.palette.doors[0]);
    extra =
      rect(
        -half - m(1.5),
        -wallH,
        half + m(1.5) - gw / 2,
        wallH + 2,
        wallC,
        0,
      ) +
      rect(gw / 2, -wallH, half + m(1.5) - gw / 2, wallH + 2, wallC, 0) +
      rect(
        -half - m(1.6),
        -wallH - m(0.2),
        W + m(3.2),
        m(0.22),
        tone(wallC, 0.88),
        0,
      ) +
      rect(-gw / 2, -wallH + m(0.1), gw, wallH - m(0.1), gateC, 0) +
      line(
        Array.from(
          { length: 6 },
          (_, k) =>
            `M${r1(-gw / 2 + ((k + 1) * gw) / 7)},${r1(-wallH + m(0.2))} L${r1(-gw / 2 + ((k + 1) * gw) / 7)},0`,
        ).join(' '),
        FIGURE_INK,
        2.4,
      ) +
      rect(
        -gw / 2 - m(0.25),
        -wallH - m(0.5),
        m(0.25),
        wallH + m(0.5),
        wallC,
        0,
      ) +
      rect(gw / 2, -wallH - m(0.5), m(0.25), wallH + m(0.5), wallC, 0);
    left = Math.min(left, -half - m(1.6));
    right = Math.max(right, half + m(1.6));
  }
  const markup =
    shadowOf(half) +
    behind.join('') +
    (kind === 'mosque' ? extra : '') +
    body.join('') +
    front.join('') +
    (kind === 'mosque' ? '' : extra);
  return {
    ...framed(markup, [left, roofTop, right - left, -roofTop]),
    roosts: roosts.map(([x, y]) => [r1(x), r1(y)]),
    ...(reacts ? { reacts } : {}),
    parts: {
      kind,
      storeys,
      widthM,
      wall,
      roof,
      window: win,
      extras: (Object.keys(chosen) as (keyof PackExtras)[]).filter(
        (one) => chosen[one],
      ),
    },
  };
}

/** A tower of glass: its floors banded, its glass in strips, a crown on top. */
function skyscraper(
  pack: StylePack,
  random: () => number,
  colour?: string,
): SceneryPiece & { parts: BuildingParts } {
  const storeys = 14 + Math.floor(random() * 8);
  const widthM = Math.round((12 + random() * 6) * 10) / 10;
  const W = m(widthM);
  const half = W / 2;
  const sh = m(3.2);
  const H = storeys * sh;
  const glass = packColour(
    pack,
    colour ?? (random() < 0.5 ? GLASS : '#b9d3e2'),
  );
  const frame = packColour(
    pack,
    random() < 0.5 ? KIT_EXTRAS.steel : SET_COLOURS.stone,
  );
  const strips = Math.max(4, Math.round(widthM / 2));
  const floors: string[] = [];
  for (let s = 1; s < storeys; s += 1)
    floors.push(`M${r1(-half)},${r1(-s * sh)} L${r1(half)},${r1(-s * sh)}`);
  const mullions: string[] = [];
  for (let k = 1; k < strips; k += 1)
    mullions.push(
      `M${r1(-half + (k * W) / strips)},${r1(-H)} L${r1(-half + (k * W) / strips)},0`,
    );
  const crownH = m(4);
  const markup =
    shadowOf(half) +
    rect(-half, -H, W, H + 2, glass, 0) +
    flatRect(-half + W * 0.08, -H, W * 0.1, H, tone(glass, 1.25)) +
    line(floors.join(' '), frame, 5) +
    line(mullions.join(' '), frame, 3) +
    rect(-half * 0.7, -H - crownH, W * 0.7, crownH + 2, frame, 0) +
    rect(-4, -H - crownH - m(5), 8, m(5), STEEL, 1) +
    rect(-half, -m(4), W, m(4), frame, 0) +
    rect(-m(1), -m(3), m(2), m(3), DARK, 0);
  return {
    ...framed(markup, [-half, -H - crownH - m(5), W, H + crownH + m(5)]),
    roosts: [[0, r1(-H - crownH)]],
    parts: {
      kind: 'skyscraper',
      storeys,
      widthM,
      wall: 'glass',
      roof: 'flat',
      window: 'shopfront',
      extras: [],
    },
  };
}

/** A kiosk: a small painted box with a hatch it sells through, its wares, an awning and a board of colours. */
function kiosk(
  pack: StylePack,
  random: () => number,
  colour?: string,
): SceneryPiece & { parts: BuildingParts } {
  const W = m(2.3);
  const H = m(2.5);
  const half = W / 2;
  const body = packColour(
    pack,
    colour ??
      pack.palette.walls[Math.floor(random() * pack.palette.walls.length)],
  );
  const board = packColour(
    pack,
    pack.palette.trims[Math.floor(random() * pack.palette.trims.length)],
  );
  const awning = packColour(
    pack,
    pack.palette.awnings[Math.floor(random() * pack.palette.awnings.length)],
  );
  const wares = [-0.35, -0.12, 0.12, 0.35]
    .map((k, i) =>
      rect(
        k * W - m(0.1),
        -m(1.65),
        m(0.2),
        m(0.32),
        [CLOTH.red, CLOTH.yellow, CLOTH.blue, CLOTH.green][i],
        2,
      ),
    )
    .join('');
  const markup =
    shadowOf(half) +
    rect(-half, -H, W, H + 2, body, 2) +
    rect(-half + m(0.25), -m(1.9), W - m(0.5), m(0.8), DARK, 0) +
    wares +
    rect(-half - 6, -m(1.12), W + 12, m(0.14), tone(body, 0.8), 1) +
    rect(-half + 4, -H - m(0.55), W - 8, m(0.55), board, 3) +
    circle(-half + m(0.35), -H - m(0.28), m(0.14), awning) +
    flatRect(-half + m(0.65), -H - m(0.38), W * 0.5, m(0.1), PAPER, 3) +
    segment(
      0,
      [0, r1(-m(1.95))],
      shape(
        poly([
          [-half - 10, -m(1.95)],
          [half + 10, -m(1.95)],
          [half + 30, -m(1.55)],
          [-half - 30, -m(1.55)],
        ]),
        awning,
      ),
    );
  return {
    ...framed(markup, [-half - 30, -H - m(0.55), W + 60, H + m(0.55)]),
    reacts: { as: 'flag', len: r1(m(0.4)) },
    roosts: [[0, r1(-H - m(0.55))]],
    counter: true,
    parts: {
      kind: 'kiosk',
      storeys: 1,
      widthM: 2.3,
      wall: 'painted block',
      roof: 'flat',
      window: 'shopfront',
      extras: ['awning', 'signboard'],
    },
  };
}
