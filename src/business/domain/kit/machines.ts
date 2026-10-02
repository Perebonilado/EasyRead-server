/**
 * 2D machines (explainer-animation-plan §7.2, tech §4.2): mechanisms
 * that read, drawn flat in the kit's look at their real sizes (a hundred
 * units to the metre), each moving part a named part the `run` recipe
 * turns, slides or rocks from one shaft.
 *
 *  - The machine kit, ported from ig-motion's scene-machine: gears that
 *    mesh turn the other way at the ratio of their sizes, pulleys on a
 *    belt turn the same way, a piston slides, a beam rocks, a platen
 *    presses once a turn. Each turning part's `value` is its ratio to the
 *    shaft, and the rig's `machine` says how each part moves, so the
 *    recipe needs nothing but the piece. Presets: gears, pulleys, a pump,
 *    a steam engine, a printing press, a loom, a conveyor, a wind turbine
 *    and a water wheel.
 *  - The turbofan cutaway, a parametric generator: its upper half cut
 *    open (the fan; the low- and high-pressure compressor stages, their
 *    counts from its settings; the combustor with its fuel nozzle and
 *    igniter; the high- and low-pressure turbine stages; the nozzle; the
 *    two shafts; the casings), its lower half the outside of the nacelle.
 *    Its rotor stages turn as blades scrolling across their rows (a side
 *    view cannot turn a disc that faces away), the low-pressure spool at
 *    the shaft's rate and the high-pressure spool faster. Its core-flow
 *    and bypass-flow paths carry the `flow` recipe; the core path's value
 *    is the share of its length at which the squeeze ends (the
 *    combustor), for a flow that narrows and warms ("compress").
 *
 * The cutaway is a generic two-spool high-bypass engine, not any maker's
 * model; a named real engine is the picture desk's (a museum cutaway).
 */
import type { ShotBox, ShotRigDto } from '../../../contracts';
import type { KitEntry, KitParams } from './registry';
import type { KitPiece } from './rig';
import { type Pt, type Shape, circle, n1, unionBox } from './shape';
import type { KitStyle } from './style';
import { mixOk } from './style';
import {
  type Fill,
  Drawing,
  band,
  box,
  inLook,
  many,
  poly,
  shadeOf,
  tint,
  vivid,
} from './paint';

// ── The machine kit (ported from ig-motion's scene-machine) ──────────────

/** What a machine is made of. */
export const MACHINE_PARTS = [
  'frame',
  'gear',
  'wheel',
  'roller',
  'belt',
  'piston',
  'platen',
  'beam',
  'shuttle',
  'heddle',
  'chute',
] as const;
export type MachinePartKind = (typeof MACHINE_PARTS)[number];

/** One part of a machine as its layout places it, in centimetres (the ground at y = 0, the middle at x = 0). */
export interface MachinePart {
  id: string;
  kind: MachinePartKind;
  /** Its middle, or its pivot. */
  at: Pt;
  r?: number;
  teeth?: number;
  w?: number;
  h?: number;
  /** The part it turns with: a gear meshed with it, a pulley its belt goes round, the crank that moves it. */
  drives?: string;
  /** Which way a slide goes and how far; where in its turn it starts. */
  axis?: Pt;
  stroke?: number;
  phase?: number;
  /** A frame's or a chute's outline; a belt's two pulleys' middles. */
  points?: Pt[];
  /** A colour by name: iron, steel, brass, wood, paper, water, red. */
  colour?: string;
}

export interface MachineLayout {
  /** Turns a second of its main shaft, at full speed. */
  rate: number;
  parts: MachinePart[];
}

/** The kit's metals and woods, before the look pulls them toward its paper. */
const MATERIAL: Record<string, string> = {
  iron: '#4b4652',
  ironLight: '#6b6672',
  steel: '#9aa3ab',
  brass: '#d1a243',
  wood: '#b9875f',
  woodDark: '#7a5236',
  paper: '#f1ece2',
  water: '#7fb8dc',
  red: '#b8573c',
  belt: '#3a3740',
  copper: '#b4785a',
  white: '#eef1f4',
};

/**
 * How fast each turning part turns beside the main shaft, from what
 * drives it (ig-motion's ratiosOf): the first that turns of its own is
 * the shaft (1); a gear meshed with its driver turns the other way,
 * faster the smaller it is; a pulley on a belt turns the same way by
 * their sizes; on one axle, the same.
 */
export function ratiosOf(layout: MachineLayout): Map<string, number> {
  const out = new Map<string, number>();
  const turns = new Set<MachinePartKind>(['gear', 'wheel', 'roller', 'belt']);
  const byId = new Map(layout.parts.map((p) => [p.id, p]));
  const of = (part: MachinePart, seen: Set<string>): number => {
    if (out.has(part.id)) return out.get(part.id)!;
    const driver = part.drives ? byId.get(part.drives) : undefined;
    if (!driver || seen.has(driver.id) || !turns.has(driver.kind)) {
      out.set(part.id, 1);
      return 1;
    }
    const base = of(driver, new Set([...seen, part.id]));
    const sameAxle = driver.at[0] === part.at[0] && driver.at[1] === part.at[1];
    const size = (driver.r ?? 1) / (part.r ?? 1);
    // Two that touch (meshed gears, rollers in a nip) turn against each
    // other, the smaller faster; one on a belt turns with it.
    const touching =
      (part.kind === 'gear' || part.kind === 'roller') &&
      (driver.kind === 'gear' || driver.kind === 'roller');
    const ratio =
      sameAxle || part.kind === 'belt'
        ? base
        : touching
          ? -base * size
          : base * size;
    out.set(part.id, ratio);
    return ratio;
  };
  for (const part of layout.parts)
    if (turns.has(part.kind)) of(part, new Set());
  return out;
}

/** The presets: each about as big as a real one stands. */
export const MACHINE_LAYOUTS: Record<
  | 'gears'
  | 'pulleys'
  | 'pump'
  | 'steam-engine'
  | 'printing-press'
  | 'loom'
  | 'conveyor',
  MachineLayout
> = {
  gears: {
    rate: 0.25,
    parts: [
      {
        id: 'plate',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-150, 0],
          [-150, -150],
          [170, -150],
          [170, 0],
        ],
        colour: 'ironLight',
      },
      {
        id: 'gear-1',
        kind: 'gear',
        at: [-80, -78],
        r: 52,
        teeth: 18,
        colour: 'brass',
      },
      {
        id: 'gear-2',
        kind: 'gear',
        at: [-80 + 52 + 26 - 4, -78],
        r: 26,
        teeth: 9,
        drives: 'gear-1',
        colour: 'steel',
      },
      {
        id: 'gear-3',
        kind: 'gear',
        at: [-80 + 52 + 26 - 4 + 26 + 40 - 4, -78],
        r: 40,
        teeth: 14,
        drives: 'gear-2',
        colour: 'brass',
      },
    ],
  },
  pulleys: {
    rate: 0.3,
    parts: [
      {
        id: 'plate',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-160, 0],
          [-160, -150],
          [180, -150],
          [180, 0],
        ],
        colour: 'ironLight',
      },
      { id: 'pulley-1', kind: 'wheel', at: [-90, -76], r: 50, colour: 'steel' },
      {
        id: 'pulley-2',
        kind: 'wheel',
        at: [110, -76],
        r: 24,
        drives: 'belt',
        colour: 'steel',
      },
      {
        id: 'belt',
        kind: 'belt',
        at: [10, -76],
        drives: 'pulley-1',
        points: [
          [-90, -76],
          [110, -76],
        ],
        r: 50,
      },
    ],
  },
  pump: {
    rate: 0.45,
    parts: [
      {
        id: 'stand',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-16, 0],
          [-8, -168],
          [8, -168],
          [16, 0],
        ],
        colour: 'iron',
      },
      {
        id: 'tank',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-120, 0],
          [-120, -56],
          [-72, -56],
          [-72, 0],
        ],
        colour: 'steel',
      },
      { id: 'crank', kind: 'wheel', at: [96, -56], r: 42 },
      {
        id: 'beam',
        kind: 'beam',
        at: [0, -171],
        w: 224,
        h: 14,
        stroke: 12,
        drives: 'crank',
      },
      {
        id: 'rod',
        kind: 'piston',
        at: [-96, -120],
        w: 8,
        h: 96,
        axis: [0, 1],
        stroke: 21,
        drives: 'crank',
        phase: Math.PI,
      },
      {
        id: 'spout',
        kind: 'chute',
        at: [0, 0],
        points: [
          [-120, -48],
          [-157, -48],
          [-157, -38],
          [-120, -38],
        ],
        colour: 'iron',
      },
    ],
  },
  'steam-engine': {
    rate: 0.9,
    parts: [
      {
        id: 'boiler',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-136, -32],
          [-136, -120],
          [-16, -120],
          [-16, -32],
        ],
        colour: 'iron',
      },
      {
        id: 'chimney',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-120, -120],
          [-120, -186],
          [-99, -186],
          [-99, -120],
        ],
        colour: 'ironLight',
      },
      {
        id: 'cylinder',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-8, -77],
          [-8, -109],
          [56, -109],
          [56, -77],
        ],
        colour: 'brass',
      },
      { id: 'flywheel', kind: 'wheel', at: [128, -93], r: 74 },
      {
        id: 'piston',
        kind: 'piston',
        at: [74, -93],
        w: 61,
        h: 10,
        axis: [1, 0],
        stroke: 24,
        drives: 'flywheel',
      },
      {
        id: 'governor',
        kind: 'gear',
        at: [21, -134],
        r: 13,
        teeth: 8,
        drives: 'flywheel',
        colour: 'brass',
      },
      {
        id: 'base',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-144, 0],
          [-144, -32],
          [208, -32],
          [208, 0],
        ],
        colour: 'ironLight',
      },
    ],
  },
  'printing-press': {
    rate: 0.6,
    parts: [
      {
        id: 'base',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-141, 0],
          [-141, -14],
          [141, -14],
          [141, 0],
        ],
        colour: 'iron',
      },
      {
        id: 'side',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-120, -14],
          [-101, -200],
          [77, -200],
          [104, -14],
        ],
        colour: 'ironLight',
      },
      {
        id: 'web',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-90, -86],
          [-46, -126],
          [-30, -122],
          [-3, -122],
          [-3, -117],
          [-32, -117],
          [-48, -120],
          [-86, -80],
        ],
        colour: 'paper',
      },
      {
        id: 'roll',
        kind: 'roller',
        at: [-88, -50],
        r: 37,
        colour: 'paper',
        drives: 'main',
      },
      { id: 'flywheel', kind: 'wheel', at: [94, -90], r: 51 },
      {
        id: 'pinion',
        kind: 'gear',
        at: [94, -90],
        r: 14,
        teeth: 9,
        drives: 'flywheel',
        colour: 'brass',
      },
      {
        id: 'main',
        kind: 'gear',
        at: [56, -118],
        r: 26,
        teeth: 14,
        drives: 'pinion',
        colour: 'brass',
      },
      {
        id: 'plate',
        kind: 'roller',
        at: [-5, -152],
        r: 29,
        colour: 'steel',
        drives: 'main',
      },
      {
        id: 'impression',
        kind: 'roller',
        at: [-5, -91],
        r: 29,
        colour: 'white',
        drives: 'plate',
      },
      {
        id: 'ink-a',
        kind: 'roller',
        at: [-29, -190],
        r: 9,
        colour: 'belt',
        drives: 'plate',
      },
      {
        id: 'ink-b',
        kind: 'roller',
        at: [19, -190],
        r: 9,
        colour: 'belt',
        drives: 'plate',
      },
      {
        id: 'delivery',
        kind: 'chute',
        at: [0, 0],
        points: [
          [22, -125],
          [171, -56],
          [171, -46],
          [22, -117],
        ],
        colour: 'wood',
      },
      {
        id: 'pile',
        kind: 'frame',
        at: [0, 0],
        points: [
          [149, -46],
          [189, -46],
          [189, -32],
          [149, -32],
        ],
        colour: 'paper',
      },
    ],
  },
  loom: {
    rate: 0.7,
    parts: [
      {
        id: 'frame',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-104, 0],
          [-104, -192],
          [-90, -192],
          [-90, -19],
          [90, -19],
          [90, -192],
          [104, -192],
          [104, 0],
        ],
        colour: 'woodDark',
      },
      {
        id: 'top-beam',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-112, -202],
          [112, -202],
          [112, -189],
          [-112, -189],
        ],
        colour: 'wood',
      },
      {
        id: 'warp',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-80, -184],
          [80, -184],
          [80, -77],
          [-80, -77],
        ],
        colour: 'paper',
      },
      {
        id: 'heddle-a',
        kind: 'heddle',
        at: [0, -141],
        w: 160,
        h: 10,
        axis: [0, -1],
        stroke: 8,
        drives: 'cam',
      },
      {
        id: 'heddle-b',
        kind: 'heddle',
        at: [0, -120],
        w: 160,
        h: 10,
        axis: [0, -1],
        stroke: 8,
        phase: Math.PI,
        drives: 'cam',
      },
      { id: 'cam', kind: 'wheel', at: [94, -48], r: 21 },
      {
        id: 'beater',
        kind: 'beam',
        at: [0, -32],
        w: 176,
        h: 11,
        stroke: 7,
        drives: 'cam',
      },
      {
        id: 'shuttle',
        kind: 'shuttle',
        at: [0, -88],
        w: 37,
        h: 11,
        axis: [1, 0],
        stroke: 69,
        drives: 'cam',
      },
      {
        id: 'cloth',
        kind: 'roller',
        at: [0, -58],
        r: 14,
        w: 168,
        drives: 'cam',
        colour: 'paper',
      },
    ],
  },
  conveyor: {
    rate: 0.6,
    parts: [
      {
        id: 'legs',
        kind: 'frame',
        at: [0, 0],
        points: [
          [-152, 0],
          [-144, -72],
          [-136, -72],
          [-128, 0],
        ],
        colour: 'iron',
      },
      {
        id: 'legs-2',
        kind: 'frame',
        at: [0, 0],
        points: [
          [128, 0],
          [136, -72],
          [144, -72],
          [152, 0],
        ],
        colour: 'iron',
      },
      { id: 'drum-a', kind: 'roller', at: [-144, -83], r: 14, colour: 'steel' },
      {
        id: 'drum-b',
        kind: 'roller',
        at: [144, -83],
        r: 14,
        drives: 'band',
        colour: 'steel',
      },
      {
        id: 'band',
        kind: 'belt',
        at: [0, -83],
        drives: 'drum-a',
        points: [
          [-144, -83],
          [144, -83],
        ],
        r: 14,
      },
      {
        id: 'motor',
        kind: 'gear',
        at: [-144, -40],
        r: 18,
        teeth: 9,
        drives: 'drum-a',
        colour: 'brass',
      },
    ],
  },
};

/** A gear's outline: its teeth round its rim, a closed polygon. */
function gearShape(c: Pt, r: number, teeth: number): Shape {
  const out: Pt[] = [];
  const n = Math.max(6, teeth);
  const step = (2 * Math.PI) / n;
  for (let i = 0; i < n; i += 1) {
    const a = step * i;
    for (const [da, rr] of [
      [0, r * 0.84],
      [step * 0.2, r],
      [step * 0.5, r],
      [step * 0.7, r * 0.84],
    ] as [number, number][])
      out.push([c[0] + Math.cos(a + da) * rr, c[1] + Math.sin(a + da) * rr]);
  }
  return poly(out);
}

/** The colour a machine part's named material is in the look. */
const materialOf = (
  style: KitStyle,
  name: string | undefined,
  fallback: string,
) => inLook(style, MATERIAL[name ?? ''] ?? MATERIAL[fallback]);

/**
 * A machine drawn from its layout: its still frame first, then what moves
 * (a belt under its pulleys), each moving part a group the run recipe
 * moves; its rig's machine says how each goes, its parts' values their
 * ratios to the shaft.
 */
export function drawMachine(
  id: string,
  layout: MachineLayout,
  style: KitStyle,
  notes: string[] = [],
): KitPiece {
  const d = new Drawing(style, 300);
  const ratios = ratiosOf(layout);
  const machine: NonNullable<ShotRigDto['machine']> = {
    turns: layout.rate,
    parts: {},
  };
  const order: MachinePartKind[] = [
    'frame',
    'chute',
    'belt',
    'roller',
    'wheel',
    'gear',
    'beam',
    'heddle',
    'piston',
    'platen',
    'shuttle',
  ];
  const sorted = [...layout.parts].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
  );
  d.group('machine', null, [0, 0]);
  for (const part of sorted) {
    const [x, y] = part.at;
    const ratio = Math.round((ratios.get(part.id) ?? 1) * 1000) / 1000;
    switch (part.kind) {
      case 'frame':
      case 'chute': {
        const fill = materialOf(
          style,
          part.colour,
          part.kind === 'chute' ? 'wood' : 'iron',
        );
        d.part(part.id, 'machine', [[poly(part.points ?? []), fill]]);
        break;
      }
      case 'gear': {
        const r = part.r ?? 20;
        const fill = materialOf(style, part.colour, 'brass');
        d.part(
          part.id,
          'machine',
          [
            [gearShape([x, y], r, part.teeth ?? 10), fill],
            [circle([x, y], r * 0.62), shadeOf(fill, 0.1), { bare: true }],
            [circle([x, y], r * 0.2), materialOf(style, 'iron', 'iron')],
            // A mark on the face, so its turning shows.
            [
              circle([x + r * 0.42, y], r * 0.08),
              tint(fill, 0.4),
              { bare: true },
            ],
          ],
          { pivot: [x, y] },
        );
        d.value(part.id, ratio);
        machine.parts[part.id] = { move: 'spin' };
        break;
      }
      case 'wheel': {
        const r = part.r ?? 50;
        const rim = materialOf(style, part.colour, 'iron');
        const spokes: Shape[] = [];
        for (const a of [0, 45, 90, 135]) {
          const t = (a * Math.PI) / 180;
          spokes.push(
            band(
              [x - Math.cos(t) * r * 0.86, y - Math.sin(t) * r * 0.86],
              [x + Math.cos(t) * r * 0.86, y + Math.sin(t) * r * 0.86],
              r * 0.08,
            ),
          );
        }
        d.part(
          part.id,
          'machine',
          [
            [circle([x, y], r), rim],
            [
              circle([x, y], r * 0.84),
              mixOk(rim, style.paper, 0.75),
              { bare: true },
            ],
            [many(spokes), rim],
            [circle([x, y], r * 0.17), materialOf(style, 'red', 'red')],
            [
              circle([x + r * 0.7, y], r * 0.08),
              materialOf(style, 'brass', 'brass'),
              { bare: true },
            ],
          ],
          { pivot: [x, y] },
        );
        d.value(part.id, ratio);
        machine.parts[part.id] = { move: 'spin' };
        break;
      }
      case 'roller': {
        const r = part.r ?? 14;
        const fill = materialOf(style, part.colour, 'steel');
        const fills: Fill[] = [];
        if (part.w)
          fills.push([
            box(x - part.w / 2, y - r, x + part.w / 2, y + r, r),
            materialOf(style, 'paper', 'paper'),
          ]);
        fills.push(
          [circle([x, y], r), fill],
          [
            band([x - r * 0.8, y], [x + r * 0.8, y], Math.max(2, r * 0.12)),
            shadeOf(fill, 0.3),
            { bare: true },
          ],
          [circle([x, y], r * 0.22), materialOf(style, 'iron', 'iron')],
        );
        d.part(part.id, 'machine', fills, { pivot: [x, y] });
        d.value(part.id, ratio);
        machine.parts[part.id] = { move: 'spin' };
        break;
      }
      case 'belt': {
        const [[ax, ay], [bx, by]] = part.points ?? [
          [x - 40, y],
          [x + 40, y],
        ];
        const r = (part.r ?? 14) + 3;
        // The belt: its run round both pulleys; its teeth a dashed line that runs.
        const pathD = `M${n1(ax)} ${n1(ay - r)}L${n1(bx)} ${n1(by - r)}`;
        const loop = poly([
          ...Array.from({ length: 13 }, (_, i): Pt => {
            const a = -Math.PI / 2 + (Math.PI * i) / 12;
            return [bx + Math.cos(a) * r, by + Math.sin(a) * r];
          }),
          ...Array.from({ length: 13 }, (_, i): Pt => {
            const a = Math.PI / 2 + (Math.PI * i) / 12;
            return [ax + Math.cos(a) * r, ay + Math.sin(a) * r];
          }),
        ]);
        const inner = poly([
          ...Array.from({ length: 13 }, (_, i): Pt => {
            const a = -Math.PI / 2 + (Math.PI * i) / 12;
            return [bx + Math.cos(a) * (r - 6), by + Math.sin(a) * (r - 6)];
          }),
          ...Array.from({ length: 13 }, (_, i): Pt => {
            const a = Math.PI / 2 + (Math.PI * i) / 12;
            return [ax + Math.cos(a) * (r - 6), ay + Math.sin(a) * (r - 6)];
          }),
        ]);
        d.part(
          part.id,
          'machine',
          [
            [loop, materialOf(style, 'belt', 'belt')],
            [
              inner,
              mixOk(
                materialOf(style, 'ironLight', 'ironLight'),
                style.paper,
                0.6,
              ),
              { bare: true },
            ],
          ],
          {
            extra: `<path d="${pathD}" fill="none" stroke="${inLook(style, '#9a9ca3')}" stroke-width="3" stroke-dasharray="10 12"/>`,
            pivot: [x, y],
          },
        );
        d.path(part.id, pathD);
        // Its dashes run at its pulleys' rim speed: 2πr units a turn of what drives it.
        d.value(
          part.id,
          Math.round(ratio * 2 * Math.PI * (part.r ?? 14) * 100) / 100,
        );
        machine.parts[part.id] = { move: 'belt' };
        break;
      }
      case 'piston':
      case 'shuttle':
      case 'heddle':
      case 'platen': {
        const w = part.w ?? 10;
        const h = part.h ?? 60;
        const fill = materialOf(
          style,
          part.colour,
          part.kind === 'shuttle'
            ? 'wood'
            : part.kind === 'heddle'
              ? 'woodDark'
              : 'steel',
        );
        const shape =
          part.kind === 'shuttle'
            ? poly([
                [x - w / 2, y],
                [x - w * 0.3, y - h / 2],
                [x + w * 0.3, y - h / 2],
                [x + w / 2, y],
                [x + w * 0.3, y + h / 2],
                [x - w * 0.3, y + h / 2],
              ])
            : box(
                x - w / 2,
                y - h / 2,
                x + w / 2,
                y + h / 2,
                Math.min(w, h) * 0.2,
              );
        d.part(part.id, 'machine', [[shape, fill]], { pivot: [x, y] });
        machine.parts[part.id] =
          part.kind === 'platen'
            ? {
                move: 'press',
                axis: part.axis ?? [0, 1],
                stroke: part.stroke ?? 20,
                phase: part.phase ?? 0,
              }
            : {
                move: 'slide',
                axis: part.axis ?? [1, 0],
                stroke: part.stroke ?? 20,
                phase: part.phase ?? 0,
              };
        break;
      }
      case 'beam': {
        const w = part.w ?? 200;
        const h = part.h ?? 16;
        const fill = materialOf(style, part.colour, 'wood');
        d.part(
          part.id,
          'machine',
          [
            [box(x - w / 2, y - h / 2, x + w / 2, y + h / 2, h * 0.3), fill],
            [circle([x, y], h * 0.45), materialOf(style, 'iron', 'iron')],
          ],
          { pivot: [x, y] },
        );
        machine.parts[part.id] = {
          move: 'rock',
          stroke: part.stroke ?? 8,
          phase: part.phase ?? 0,
        };
        break;
      }
    }
  }
  const all = unionBox(d.parts.filter((p) => p.box).map((p) => p.box!));
  const pad = 8;
  const boxAll: ShotBox = [
    all[0] - pad,
    Math.min(all[1] - pad, -1),
    all[2] + 2 * pad,
    -Math.min(all[1] - pad, -1),
  ];
  return d.piece({
    id,
    box: boxAll,
    focal: [all[0], all[1], all[2], -all[1]],
    rig: { states: {}, moves: ['enter', 'exit'], machine },
    colours: ['iron', 'steel', 'brass'],
    notes: [`${Object.keys(machine.parts).length} moving parts`, ...notes],
  });
}

// ── Turbines that face the camera ─────────────────────────────────────────

/** A wind turbine: a tapered tower, its nacelle, and three blades about the hub that the run recipe turns. */
function windTurbine(style: KitStyle, height = 9000): KitPiece {
  const d = new Drawing(style, 3000);
  const white = inLook(style, '#dfe3e6');
  const shade = shadeOf(white, 0.22);
  const hubY = -height;
  const blade = height * 0.52;
  d.group('turbine', null, [0, 0]);
  d.part('tower', 'turbine', [
    [
      poly([
        [-height * 0.024, 0],
        [-height * 0.012, hubY + height * 0.02],
        [height * 0.012, hubY + height * 0.02],
        [height * 0.024, 0],
      ]),
      white,
    ],
    [
      poly([
        [height * 0.004, 0],
        [height * 0.004, hubY + height * 0.02],
        [height * 0.012, hubY + height * 0.02],
        [height * 0.024, 0],
      ]),
      shade,
      { bare: true },
    ],
  ]);
  d.part('nacelle', 'turbine', [
    [
      box(
        -height * 0.02,
        hubY - height * 0.025,
        height * 0.07,
        hubY + height * 0.02,
        height * 0.01,
      ),
      white,
    ],
  ]);
  const blades: Fill[] = [];
  for (let k = 0; k < 3; k += 1) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const tip: Pt = [Math.cos(a) * blade, hubY + Math.sin(a) * blade];
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const root = height * 0.03;
    blades.push([
      poly([
        [nx * root * 0.6, hubY + ny * root * 0.6],
        [
          Math.cos(a) * blade * 0.25 + nx * root * 1.1,
          hubY + Math.sin(a) * blade * 0.25 + ny * root * 1.1,
        ],
        [tip[0] + nx * root * 0.15, tip[1] + ny * root * 0.15],
        [tip[0] - nx * root * 0.1, tip[1] - ny * root * 0.1],
        [-nx * root * 0.4, hubY - ny * root * 0.4],
      ]),
      white,
    ]);
  }
  blades.push([circle([0, hubY], height * 0.022), shade]);
  d.part('rotor', 'turbine', blades, { pivot: [0, hubY] });
  d.value('rotor', 1);
  return d.piece({
    id: 'machine.wind-turbine',
    box: [-blade - 20, hubY - blade - 20, 2 * blade + 40, -hubY + blade + 20],
    focal: [-blade, hubY - blade, 2 * blade, -hubY + blade],
    rig: {
      states: {},
      moves: ['enter', 'exit'],
      machine: { turns: 0.25, parts: { rotor: { move: 'spin' } } },
    },
    colours: ['white'],
    notes: ['a wind turbine, its rotor turning'],
  });
}

/** A water wheel: its paddles round the rim, turning in its race. */
function waterWheel(style: KitStyle): KitPiece {
  const d = new Drawing(style, 600);
  const r = 260;
  const c: Pt = [0, -r - 40];
  const wood = inLook(style, MATERIAL.wood);
  const dark = inLook(style, MATERIAL.woodDark);
  d.group('mill', null, [0, 0]);
  d.part('race', 'mill', [
    [box(-r - 120, -60, r + 120, 0), inLook(style, MATERIAL.water)],
    [box(-r - 120, -70, -r + 40, -50), dark],
  ]);
  const fills: Fill[] = [
    [circle(c, r), dark],
    [circle(c, r * 0.9), mixOk(dark, style.paper, 0.55), { bare: true }],
  ];
  const spokes: Shape[] = [];
  const paddles: Shape[] = [];
  for (let k = 0; k < 12; k += 1) {
    const a = (k * Math.PI * 2) / 12;
    spokes.push(
      band(c, [c[0] + Math.cos(a) * r * 0.9, c[1] + Math.sin(a) * r * 0.9], 14),
    );
    const p: Pt = [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
    paddles.push(
      band(
        p,
        [c[0] + Math.cos(a) * (r + 46), c[1] + Math.sin(a) * (r + 46)],
        34,
      ),
    );
  }
  fills.push(
    [many(spokes), wood],
    [many(paddles), wood],
    [circle(c, 30), inLook(style, MATERIAL.iron)],
  );
  d.part('wheel', 'mill', fills, { pivot: c });
  d.value('wheel', 1);
  return d.piece({
    id: 'machine.water-wheel',
    box: [-r - 130, c[1] - r - 60, 2 * r + 260, -(c[1] - r - 60)],
    focal: [-r - 50, c[1] - r - 50, 2 * r + 100, -(c[1] - r - 50)],
    rig: {
      states: {},
      moves: ['enter', 'exit'],
      machine: { turns: 0.2, parts: { wheel: { move: 'spin' } } },
    },
    colours: ['wood', 'water'],
    notes: ['a water wheel'],
  });
}

// ── The turbofan cutaway ──────────────────────────────────────────────────

/** A turbofan's settings: its stage counts (a generic two-spool engine's) and how much air goes round the core. */
export interface TurbofanParams {
  /** Low-pressure compressor (booster) stages. */
  lp: number;
  /** High-pressure compressor stages. */
  hp: number;
  /** High-pressure turbine stages. */
  hpt: number;
  /** Low-pressure turbine stages. */
  lpt: number;
  bypass: 'high' | 'low';
}

/** The high-pressure spool's turns for each of the low-pressure spool's: about three on a two-spool engine. */
export const HP_RATIO = 3;

/**
 * The turbofan cutaway, in centimetres: a generic two-spool engine about
 * five metres long, its fan two metres across (a low-bypass engine's fan
 * is smaller and its core longer), cut open along its length as a
 * textbook section, both halves: air enters on the left, round the core
 * through the bypass ducts and through the core. Colour says what each
 * part does to the air: the fan and compressors cool blues, the
 * combustor orange, the turbines hot reds.
 */
export function drawTurbofan(
  params: TurbofanParams,
  style: KitStyle,
): KitPiece {
  const d = new Drawing(style, 260);
  const high = params.bypass === 'high';
  const R = high ? 116 : 80; // the nacelle's widest radius
  const fanR = high ? 103 : 70;
  const cy = -R - 4; // the centreline, the nacelle's foot on y = 0
  const look = (c: string) =>
    style.look === 'illustrated'
      ? vivid(inLook(style, c), 0.12)
      : inLook(style, c);
  const C = {
    skin: look('#d9dee2'),
    skinShade: look('#b8c0c7'),
    air: look('#e3ecf2'),
    gas: look('#eee6dd'),
    casing: look('#8b949c'),
    fan: look('#5f84a3'),
    fanLight: look('#9cb8cd'),
    comp: look('#6f93ae'),
    compLight: look('#a7c0d2'),
    vane: look('#a9b4bd'),
    burner: look('#d9784d'),
    burnerDark: look('#a9532f'),
    turb: look('#b65d43'),
    turbLight: look('#de9274'),
    tVane: look('#a08074'),
    shaft: look('#4f5861'),
    shaft2: look('#6d7780'),
    cone: look('#c3cad0'),
  };
  // Stations along the engine (x, in cm), from the inlet's lip to the exhaust plug's tip.
  const s = high
    ? {
        fan: 62,
        fanEnd: 92,
        split: 108,
        lpc: 112,
        lpcEnd: 160,
        hpc: 168,
        hpcEnd: 272,
        burn: 280,
        burnEnd: 335,
        hpt: 340,
        hptEnd: 362,
        lpt: 366,
        lptEnd: 432,
        cowlEnd: 300,
        coreEnd: 470,
        plugEnd: 520,
      }
    : {
        fan: 50,
        fanEnd: 82,
        split: 96,
        lpc: 100,
        lpcEnd: 148,
        hpc: 156,
        hpcEnd: 288,
        burn: 296,
        burnEnd: 356,
        hpt: 362,
        hptEnd: 386,
        lpt: 390,
        lptEnd: 452,
        cowlEnd: 470,
        coreEnd: 500,
        plugEnd: 552,
      };
  // Radii along the engine: the nacelle's outside and its duct, the core's cowl, and the gas path's casing and hub (the compressor's annulus narrows, the turbine's widens).
  const nacOut = (x: number) =>
    x <= 50
      ? lerp(R - 9, R, x / 50)
      : lerp(R, R - 10, (x - 50) / (s.cowlEnd - 50));
  const nacIn = (x: number) =>
    x <= s.fan
      ? lerp(fanR - 1, fanR + 1, x / s.fan)
      : lerp(
          fanR + 1,
          fanR - (high ? 9 : 6),
          (x - s.fan) / (s.cowlEnd - s.fan),
        );
  const coreOut = (x: number): number => {
    const top = high ? 56 : 48;
    if (x <= s.lpcEnd) return top;
    if (x <= s.hpcEnd)
      return lerp(top - 2, high ? 44 : 39, (x - s.hpc) / (s.hpcEnd - s.hpc));
    if (x <= s.burnEnd) return high ? 48 : 43;
    if (x <= s.lptEnd)
      return lerp(
        high ? 47 : 42,
        high ? 57 : 49,
        (x - s.hpt) / (s.lptEnd - s.hpt),
      );
    return lerp(
      high ? 57 : 49,
      high ? 40 : 35,
      (x - s.lptEnd) / (s.coreEnd - s.lptEnd),
    );
  };
  const coreIn = (x: number): number => {
    if (x <= s.lpcEnd) return 26;
    if (x <= s.hpcEnd) return lerp(25, 31, (x - s.hpc) / (s.hpcEnd - s.hpc));
    if (x <= s.lptEnd) return 30;
    return lerp(30, 22, (x - s.lptEnd) / (s.coreEnd - s.lptEnd));
  };
  const cowl = (x: number) =>
    coreOut(x) + (x < s.split + 20 ? lerp(2, 8, (x - s.split) / 20) : 8);
  // A band between two radii along x, above the centreline (side 1) or below it (side -1).
  const bandOf = (
    from: number,
    to: number,
    outer: (x: number) => number,
    inner: (x: number) => number,
    side: 1 | -1,
    steps = 28,
  ): Shape => {
    const xs = Array.from(
      { length: steps + 1 },
      (_, i) => from + ((to - from) * i) / steps,
    );
    return poly([
      ...xs.map((x): Pt => [x, cy - side * outer(x)]),
      ...xs.reverse().map((x): Pt => [x, cy - side * inner(x)]),
    ]);
  };
  const both = (
    from: number,
    to: number,
    outer: (x: number) => number,
    inner: (x: number) => number,
    steps?: number,
  ): Shape[] => [
    bandOf(from, to, outer, inner, 1, steps),
    bandOf(from, to, outer, inner, -1, steps),
  ];
  const machine: NonNullable<ShotRigDto['machine']> = { turns: 0.5, parts: {} };

  d.group('turbofan', null, [0, cy]);
  // ── The air's ways: the intake before the fan, the bypass ducts round the core, the core's gas path.
  d.part(
    'intake',
    'turbofan',
    both(2, s.fan, nacIn, () => 0).map((sh): Fill => [sh, C.air]),
  );
  d.part(
    'bypass',
    'turbofan',
    both(s.fan, s.cowlEnd, nacIn, (x) => (x < s.split ? 24 : cowl(x))).map(
      (sh): Fill => [sh, C.air],
    ),
  );
  d.part(
    'core',
    'turbofan',
    both(s.split, s.coreEnd, coreOut, coreIn).map((sh): Fill => [sh, C.gas]),
  );
  // ── The casings: the nacelle's walls (its lip rounded), the core's cowl, the gas path's casing.
  d.part('nacelle', 'turbofan', [
    ...both(0, s.cowlEnd, nacOut, nacIn).map((sh): Fill => [sh, C.skin]),
    ...both(0, s.cowlEnd, nacOut, (x) => nacOut(x) - 5).map((sh): Fill => [
      sh,
      C.skinShade,
      { bare: true },
    ]),
    [
      circle(
        [2, cy - (nacOut(0) + nacIn(0)) / 2],
        (nacOut(0) - nacIn(0)) / 2 + 1,
      ),
      C.skin,
    ],
    [
      circle(
        [2, cy + (nacOut(0) + nacIn(0)) / 2],
        (nacOut(0) - nacIn(0)) / 2 + 1,
      ),
      C.skin,
    ],
  ]);
  d.part('casing', 'turbofan', [
    ...both(s.split, s.coreEnd, cowl, coreOut).map((sh): Fill => [
      sh,
      C.casing,
    ]),
    ...both(
      s.split - 8,
      s.split + 6,
      (x) => lerp(coreOut(s.split), cowl(s.split + 6), (x - s.split + 8) / 14),
      (x) =>
        lerp(coreOut(s.split) - 1, coreOut(s.split), (x - s.split + 8) / 14),
      6,
    ).map((sh): Fill => [sh, C.casing]),
  ]);
  // ── The fan, and its outlet guide vanes standing in the bypass.
  const rotor = (
    id: string,
    parent: string,
    x0: number,
    x1: number,
    rIn: (x: number) => number,
    rOut: (x: number) => number,
    fill: string,
    light: string,
    ratio: number,
    stripes: number,
  ) => {
    const mid = (x0 + x1) / 2;
    const r0 = rIn(mid);
    const r1 = rOut(mid);
    const lean = (x1 - x0) * 0.2;
    // Thin rows stay unoutlined in the illustrated look, or their outlines swallow them.
    const thin = id !== 'fan';
    const rows: Fill[] = [1, -1].map((side): Fill => [
      poly([
        [x0 + lean, cy - side * rOut(x0)],
        [x1, cy - side * rOut(x1)],
        [x1 - lean, cy - side * rIn(x1)],
        [x0, cy - side * rIn(x0)],
      ]),
      fill,
      { bare: thin },
    ]);
    // Its blades' edges, in stripes that run along the row as it turns: down the top half, down the bottom.
    const pathD = `M${n1(mid)} ${n1(cy - r1)}L${n1(mid)} ${n1(cy - r0)}M${n1(mid)} ${n1(cy + r0)}L${n1(mid)} ${n1(cy + r1)}`;
    const gap = Math.max(4, (r1 - r0) / stripes);
    d.part(id, parent, rows, {
      extra: `<path d="${pathD}" fill="none" stroke="${light}" stroke-width="${n1((x1 - x0) * 0.6)}" stroke-dasharray="${n1(gap * 0.38)} ${n1(gap * 0.62)}"/>`,
      pivot: [mid, cy],
    });
    d.path(id, pathD);
    // Its blades run at its spool's rim speed: 2πr units a turn of the shaft.
    d.value(id, Math.round(ratio * 2 * Math.PI * ((r0 + r1) / 2) * 10) / 10);
    machine.parts[id] = { move: 'belt' };
  };
  rotor(
    'fan',
    'turbofan',
    s.fan,
    s.fanEnd,
    () => 22,
    (x) => nacIn(x) - 1.5,
    C.fan,
    C.fanLight,
    1,
    6,
  );
  d.part(
    'guide-vanes',
    'turbofan',
    [1, -1].map((side): Fill => {
      const x = s.fanEnd + 44;
      return [
        poly([
          [x, cy - side * (nacIn(x) - 1)],
          [x + 12, cy - side * (nacIn(x + 12) - 1)],
          [x + 9, cy - side * (cowl(x + 9) + 1)],
          [x - 3, cy - side * (cowl(x - 3) + 1)],
        ]),
        C.vane,
      ];
    }),
  );
  // ── The compressors: a still row of vanes before each turning row of blades.
  d.group('compressor', 'turbofan', [s.lpc, cy]);
  d.group('lp-compressor', 'compressor', [s.lpc, cy]);
  d.group('hp-compressor', 'compressor', [s.hpc, cy]);
  const stages = (
    group: string,
    x0: number,
    x1: number,
    count: number,
    fill: string,
    light: string,
    vane: string,
    ratio: number,
  ) => {
    const pitch = (x1 - x0) / count;
    for (let k = 0; k < count; k += 1) {
      const a = x0 + k * pitch;
      d.part(
        `${group}-vane-${k + 1}`,
        group,
        [1, -1].map((side): Fill => [
          poly([
            [a + pitch * 0.05, cy - side * (coreOut(a) - 0.5)],
            [a + pitch * 0.32, cy - side * (coreOut(a + pitch * 0.32) - 0.5)],
            [a + pitch * 0.28, cy - side * (coreIn(a + pitch * 0.28) + 1.5)],
            [a + pitch * 0.02, cy - side * (coreIn(a) + 1.5)],
          ]),
          vane,
          { bare: true },
        ]),
      );
      rotor(
        `${group}-${k + 1}`,
        group,
        a + pitch * 0.42,
        a + pitch * 0.94,
        (x) => coreIn(x) + 0.5,
        (x) => coreOut(x) - 0.5,
        fill,
        light,
        ratio,
        4,
      );
    }
  };
  stages(
    'lp-compressor',
    s.lpc,
    s.lpcEnd,
    params.lp,
    C.comp,
    C.compLight,
    C.vane,
    1,
  );
  stages(
    'hp-compressor',
    s.hpc,
    s.hpcEnd,
    params.hp,
    C.comp,
    C.compLight,
    C.vane,
    HP_RATIO,
  );
  // ── The combustor: its liner in each half, the fuel nozzle at its head, the igniter in its wall.
  const b0 = s.burn;
  const b1 = s.burnEnd;
  const rIn = 33;
  const rOut = coreOut(b0) - 3;
  const midR = (rIn + rOut) / 2;
  d.part(
    'combustor',
    'turbofan',
    [1, -1].flatMap((side): Fill[] => [
      [
        poly([
          [b0, cy - side * (midR + 2)],
          [b0 + 10, cy - side * rOut],
          [b1, cy - side * (rOut - 1)],
          [b1, cy - side * (rIn + 1)],
          [b0 + 10, cy - side * rIn],
          [b0, cy - side * (midR - 2)],
        ]),
        C.burner,
      ],
      [
        poly([
          [b0 + 14, cy - side * (rOut - 4)],
          [b1 - 3, cy - side * (rOut - 5)],
          [b1 - 3, cy - side * (rIn + 5)],
          [b0 + 14, cy - side * (rIn + 4)],
        ]),
        C.burnerDark,
      ],
    ]),
  );
  d.part(
    'fuel-nozzle',
    'combustor',
    [1, -1].map((side): Fill => [
      poly([
        [b0 - 6, cy - side * (midR + 3)],
        [b0 + 12, cy - side * (midR + 1.5)],
        [b0 + 12, cy - side * (midR - 1.5)],
        [b0 - 6, cy - side * (midR - 3)],
      ]),
      C.shaft2,
    ]),
  );
  d.part('igniter', 'combustor', [
    [
      poly([
        [b0 + 22, cy - cowl(b0 + 22)],
        [b0 + 26, cy - cowl(b0 + 26)],
        [b0 + 26, cy - (rOut - 2)],
        [b0 + 22, cy - (rOut - 2)],
      ]),
      C.shaft,
    ],
  ]);
  // ── The turbines: rows the hot gas turns, the high-pressure spool's first.
  d.group('turbine', 'turbofan', [s.hpt, cy]);
  d.group('hp-turbine', 'turbine', [s.hpt, cy]);
  d.group('lp-turbine', 'turbine', [s.lpt, cy]);
  stages(
    'hp-turbine',
    s.hpt,
    s.hptEnd,
    params.hpt,
    C.turb,
    C.turbLight,
    C.tVane,
    HP_RATIO,
  );
  stages(
    'lp-turbine',
    s.lpt,
    s.lptEnd,
    params.lpt,
    C.turb,
    C.turbLight,
    C.tVane,
    1,
  );
  // ── The hub: the engine's middle, inside its gas path, from the fan to the plug.
  d.part('hub', 'turbofan', [
    [
      poly([
        [s.fan + 6, cy - 22],
        ...Array.from({ length: 21 }, (_, i): Pt => {
          const x = s.split + ((s.lptEnd + 4 - s.split) * i) / 20;
          return [x, cy - coreIn(x)];
        }),
        ...Array.from({ length: 21 }, (_, i): Pt => {
          const x = s.lptEnd + 4 - ((s.lptEnd + 4 - s.split) * i) / 20;
          return [x, cy + coreIn(x)];
        }),
        [s.fan + 6, cy + 22],
      ]),
      look('#d3d8dc'),
    ],
  ]);
  // ── The shafts along the middle: the low-pressure spool's from the fan to its turbine, the high-pressure's round it.
  d.part('lp-shaft', 'turbofan', [
    [box(s.fanEnd - 6, cy - 6, s.lptEnd + 6, cy + 6, 3), C.shaft],
  ]);
  d.part('hp-shaft', 'turbofan', [
    [box(s.hpc + 2, cy - 15, s.hptEnd, cy - 9, 2), C.shaft2],
    [box(s.hpc + 2, cy + 9, s.hptEnd, cy + 15, 2), C.shaft2],
  ]);
  // ── The spinner before the fan; the nozzle and its plug behind the core.
  d.part('spinner', 'turbofan', [
    [
      poly([
        [s.fan - 46, cy],
        [s.fan + 8, cy - 24],
        [s.fan + 8, cy + 24],
      ]),
      C.cone,
    ],
  ]);
  d.part('nozzle', 'turbofan', [
    [
      poly([
        [s.lptEnd + 4, cy - coreIn(s.lptEnd + 4)],
        [s.plugEnd, cy],
        [s.lptEnd + 4, cy + coreIn(s.lptEnd + 4)],
      ]),
      C.cone,
    ],
  ]);
  // ── The ways the flows take: through the core (squeezed and burned) and round it through the bypass, above and below.
  const coreMid = (x: number) => (coreOut(x) + coreIn(x)) / 2;
  const corePts: Pt[] = [
    [-6, cy - 40],
    [s.fan - 18, cy - 36],
    [s.split - 2, cy - (coreOut(s.split) - 12)],
    ...[
      s.lpc + 8,
      s.lpcEnd,
      s.hpc + 10,
      (s.hpc + s.hpcEnd) / 2,
      s.hpcEnd - 4,
    ].map((x): Pt => [x, cy - coreMid(x)]),
    [s.burn + 6, cy - midR],
    [(s.burn + s.burnEnd) / 2, cy - midR],
    ...[s.burnEnd + 4, s.hptEnd, (s.lpt + s.lptEnd) / 2, s.lptEnd + 6].map(
      (x): Pt => [x, cy - coreMid(x)],
    ),
    [s.coreEnd, cy - coreMid(s.coreEnd)],
    [s.plugEnd + 14, cy - coreOut(s.coreEnd) * 0.6],
  ];
  const flip = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, 2 * cy - y]);
  const bypassPts: Pt[] = [
    [-6, cy - fanR * 0.74],
    [s.fan, cy - fanR * 0.74],
    ...[s.fanEnd + 30, (s.fanEnd + s.cowlEnd) / 2, s.cowlEnd - 20].map(
      (x): Pt => [x, cy - (nacIn(x) + cowl(x)) / 2],
    ),
    [s.cowlEnd + 44, cy - (nacIn(s.cowlEnd) + cowl(s.cowlEnd)) / 2 + 6],
  ];
  const squeezeEnd = shareAlong(corePts, s.burn + 6);
  const flows: [string, Pt[], number | null][] = [
    ['core-flow', corePts, squeezeEnd],
    ['bypass-flow', bypassPts, null],
    ['core-flow-2', flip(corePts), squeezeEnd],
    ['bypass-flow-2', flip(bypassPts), null],
  ];
  for (const [id, pts, squeeze] of flows) {
    const dd = smoothD(pts);
    // A flow's part draws nothing (an unpainted path), so its box is its way's.
    d.part(id, 'turbofan', [], {
      box: boxOfPts(pts),
      extra: `<path d="${dd}" fill="none"/>`,
    });
    d.path(id, dd);
    if (squeeze !== null) d.value(id, Math.round(squeeze * 1000) / 1000);
  }
  // Where the exhaust leaves: the life layer's heat haze or flame starts there.
  d.anchor('exhaust', 'turbofan', [s.plugEnd, cy]);

  const engine: ShotBox = [-4, cy - R - 2, s.plugEnd + 8, 2 * R + 4];
  const pieceBox: ShotBox = [-10, cy - R - 4, s.plugEnd + 30, 2 * R + 8];
  return d.piece({
    id: `machine.turbofan:${params.bypass}:${params.lp}-${params.hp}-${params.hpt}-${params.lpt}`,
    box: pieceBox,
    focal: engine,
    rig: { states: {}, moves: ['enter', 'exit'], machine },
    colours: ['metal'],
    notes: [
      `${params.bypass}-bypass turbofan: ${params.lp} + ${params.hp} compressor stages, ${params.hpt} + ${params.lpt} turbine stages`,
      `the core flow's squeeze ends at ${Math.round(squeezeEnd * 100)}% of its way`,
    ],
  });
}

const lerp = (a: number, b: number, t: number) =>
  a + (b - a) * Math.max(0, Math.min(1, t));

/** A box round points. */
function boxOfPts(points: readonly Pt[]): ShotBox {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  ];
}

/** A smooth open path through points (Catmull–Rom as cubics), absolute M and C only. */
function smoothD(points: readonly Pt[]): string {
  let d = `M${n1(points[0][0])} ${n1(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n1(c1[0])} ${n1(c1[1])} ${n1(c2[0])} ${n1(c2[1])} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return d;
}

/** The share of a polyline's length at which it first reaches x (its points' straight run: near enough for a smooth path through them). */
function shareAlong(points: readonly Pt[], x: number): number {
  let total = 0;
  let upTo = 0;
  let found = false;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (!found && bx >= x) {
      upTo =
        total +
        len * Math.max(0, Math.min(1, (x - ax) / Math.max(1e-6, bx - ax)));
      found = true;
    }
    total += len;
  }
  return found ? upTo / total : 1;
}

// ── The registry's entries ────────────────────────────────────────────────

const preset = (
  name: keyof typeof MACHINE_LAYOUTS,
  about: string,
): KitEntry => ({
  family: 'machines',
  looks: ['editorial', 'illustrated'],
  about,
  params: {},
  moves: ['enter', 'exit'],
  make: (_params: KitParams, style: KitStyle) =>
    drawMachine(`machine.${name}`, MACHINE_LAYOUTS[name], style),
});

const intIn = (
  raw: string | number | undefined,
  lo: number,
  hi: number,
  fallback: number,
) => {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n)
    ? Math.max(lo, Math.min(hi, Math.round(n)))
    : fallback;
};

export const MACHINE_KIT: Readonly<Record<string, KitEntry>> = {
  'machine.turbofan': {
    family: 'machines',
    looks: ['editorial', 'illustrated'],
    about:
      'A jet engine (turbofan) cut open: parts fan, compressor (lp-compressor, hp-compressor), combustor (fuel-nozzle, igniter), turbine (hp-turbine, lp-turbine), nozzle, lp-shaft, hp-shaft, casing, nacelle; paths core-flow and bypass-flow for flow (text "compress" squeezes and warms the core flow); run turns its spools. Make it the shot’s subject.',
    params: {
      bypass: {
        values: ['high', 'low'],
        default: 'high',
        about: 'a big fan (an airliner’s) or a small one (a fighter’s)',
      },
      lp: {
        range: [2, 5],
        default: 3,
        about: 'low-pressure compressor stages',
      },
      hp: {
        range: [4, 12],
        default: 9,
        about: 'high-pressure compressor stages',
      },
      hpt: { range: [1, 2], default: 2, about: 'high-pressure turbine stages' },
      lpt: { range: [3, 7], default: 5, about: 'low-pressure turbine stages' },
    },
    moves: ['enter', 'exit'],
    make(params: KitParams, style: KitStyle): KitPiece {
      return drawTurbofan(
        {
          bypass: params.bypass === 'low' ? 'low' : 'high',
          lp: intIn(params.lp, 2, 5, 3),
          hp: intIn(params.hp, 4, 12, 9),
          hpt: intIn(params.hpt, 1, 2, 2),
          lpt: intIn(params.lpt, 3, 7, 5),
        },
        style,
      );
    },
  },
  'machine.gears': preset(
    'gears',
    'Three meshed gears of different sizes on a plate: a ratio, a mechanism, how one turn becomes another (run turns them).',
  ),
  'machine.pulleys': preset(
    'pulleys',
    'Two pulleys of different sizes on a belt: transmission, speed changed by size (run turns them).',
  ),
  'machine.pump': preset(
    'pump',
    'A beam pump worked by a crank: pumping water or oil (run works it).',
  ),
  'machine.steam-engine': preset(
    'steam-engine',
    'A steam engine: boiler, cylinder, piston and flywheel (run works it; smoke rises from its chimney).',
  ),
  'machine.printing-press': preset(
    'printing-press',
    'A rotary printing press: paper from its roll between the cylinders (run turns it).',
  ),
  'machine.loom': preset(
    'loom',
    'A power loom: heddles, shuttle and beater (run works it).',
  ),
  'machine.conveyor': preset(
    'conveyor',
    'A conveyor belt on two drums: production, a line (run moves it).',
  ),
  'machine.wind-turbine': {
    family: 'machines',
    looks: ['editorial', 'illustrated'],
    about: 'A wind turbine on its tower: wind power (run turns its rotor).',
    params: {},
    moves: ['enter', 'exit'],
    make: (_params: KitParams, style: KitStyle) => windTurbine(style),
  },
  'machine.water-wheel': {
    family: 'machines',
    looks: ['editorial', 'illustrated'],
    about: 'A water wheel in its race: water power, a mill (run turns it).',
    params: {},
    moves: ['enter', 'exit'],
    make: (_params: KitParams, style: KitStyle) => waterWheel(style),
  },
};
