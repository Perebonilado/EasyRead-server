/**
 * Objects (explainer-animation-plan §7.2, tech §4.2): the everyday things
 * an explainer points at, simple and readable at any size, at their real
 * sizes in the kit's units (a hundred to the metre), standing on y = 0: a
 * phone, a computer, a book, a stack of coins, a sack of grain, an oil
 * barrel, a crate, a battery, a lamp, a key, a lock and a chain.
 *
 * Each is a few flat shapes in the editorial look (a lit face and a
 * shaded side, as every piece of the kit), outlined in the illustrated
 * look; its colour is its natural one, or a side's when the board gives
 * one. Their parts are what a recipe points at and their states what
 * changes: a phone's and a computer's `screen` lights, a lamp's `light`
 * comes on, a lock's `shackle` opens, a battery's `charge` fills (its
 * value the share full), a stack of coins counts (its value how many), a
 * chain's links are each a part.
 */
import type { ShotBox, ShotRigDto } from '../../../contracts';
import type { KitEntry, KitParams } from './registry';
import type { KitPiece } from './rig';
import {
  type Pt,
  circle,
  ellipse,
  groundShadow,
  unionBox,
} from './shape';
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
  poly,
  shadeOf,
  tint,
  wornColour,
} from './paint';

export const OBJECT_KINDS = [
  'phone',
  'computer',
  'book',
  'coins',
  'sack',
  'barrel',
  'crate',
  'battery',
  'lamp',
  'key',
  'lock',
  'chain',
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** Each object's natural colour, before the look pulls it toward its paper. */
const NATURAL: Record<ObjectKind, string> = {
  phone: '#2e3440',
  computer: '#9aa3ab',
  book: '#7a3b34',
  coins: '#c9a44e',
  sack: '#cdb58a',
  barrel: '#3f6d8e',
  crate: '#b98b5c',
  battery: '#3d4650',
  lamp: '#3f6d8e',
  key: '#c9a44e',
  lock: '#9aa3ab',
  chain: '#8b949c',
};

export interface ObjectParams {
  colour?: string;
  /** Coins in the stack (1–20), or a battery's charge in tenths (0–10). */
  count?: number;
}

/** An object drawn: its parts, standing on y = 0; its states and its box. */
export function drawObject(
  kind: ObjectKind,
  params: ObjectParams,
  style: KitStyle,
  seed: number,
): KitPiece {
  void seed;
  const worn = wornColour(style, params.colour, NATURAL[kind]);
  const c = worn.colour;
  const dark = shadeOf(c, 0.22);
  const light = litOf(c, 0.18);
  const glow = style.look === 'illustrated' ? '#ffe27a' : '#ffe6a6';
  const screenOff = mixOk(inLook(style, '#1d2530'), '#3c4a5c', 0.25);
  const screenOn = inLook(style, '#bfe3f2');
  const metal = inLook(style, '#9aa3ab');
  let d!: Drawing;
  let focal: ShotBox = [0, 0, 0, 0];
  const states: ShotRigDto['states'] = {};
  const notes: string[] = [];
  const begin = (size: number) => {
    d = new Drawing(style, size);
    d.group('object', null, [0, 0]);
  };
  switch (kind) {
    case 'phone': {
      begin(16);
      const w = 7.4;
      const h = 15;
      d.part('body', 'object', [
        [box(-w / 2, -h, w / 2, 0, 1), c],
        [box(w / 2 - 0.5, -h + 0.6, w / 2, -0.6, 0.3), dark, { bare: true }],
      ]);
      d.part('screen', 'object', [
        [box(-w / 2 + 0.5, -h + 0.9, w / 2 - 0.5, -0.9, 0.6), screenOn],
      ]);
      d.part('screen-off', 'screen', [
        [
          box(-w / 2 + 0.5, -h + 0.9, w / 2 - 0.5, -0.9, 0.6),
          screenOff,
          { bare: true },
        ],
      ]);
      d.part('camera', 'object', [
        [box(-0.9, -h + 0.35, 0.9, -h + 0.6, 0.12), dark, { bare: true }],
      ]);
      states.on = { 'screen-off': { opacity: 0 } };
      states.off = {};
      focal = [-w / 2, -h, w, h];
      break;
    }
    case 'computer': {
      begin(36);
      const w = 32;
      d.part('base', 'object', [
        [
          poly([
            [-w / 2 - 2, 0],
            [w / 2 + 2, 0],
            [w / 2, -1.6],
            [-w / 2, -1.6],
          ]),
          c,
        ],
        [box(-3, -0.9, 3, -0.4, 0.2), dark, { bare: true }],
      ]);
      d.part('lid', 'object', [[box(-w / 2, -22, w / 2, -1.6, 0.8), dark]], {
        pivot: [0, -1.6],
      });
      d.part('screen', 'lid', [
        [box(-w / 2 + 1, -21, w / 2 - 1, -2.6, 0.3), screenOn],
      ]);
      d.part('screen-off', 'screen', [
        [box(-w / 2 + 1, -21, w / 2 - 1, -2.6, 0.3), screenOff, { bare: true }],
      ]);
      states.on = { 'screen-off': { opacity: 0 } };
      states.off = {};
      focal = [-w / 2 - 2, -22, w + 4, 22];
      break;
    }
    case 'book': {
      begin(26);
      const w = 16;
      const h = 23;
      d.part('pages', 'object', [
        [
          box(-w / 2 + 0.6, -h + 0.4, w / 2 + 0.4, 0, 0.3),
          inLook(style, '#f1ece2'),
        ],
      ]);
      d.part('cover', 'object', [
        [box(-w / 2, -h, w / 2, -0.2, 0.5), c],
        [box(-w / 2, -h, -w / 2 + 1.4, -0.2, 0.3), dark, { bare: true }],
        [box(-w / 2 + 3, -h + 4, w / 2 - 2.5, -h + 5.2, 0.4), tint(c, 0.45)],
        [box(-w / 2 + 3, -h + 6.2, w / 2 - 5, -h + 6.8, 0.3), tint(c, 0.3)],
      ]);
      focal = [-w / 2, -h, w + 0.4, h];
      break;
    }
    case 'coins': {
      // A stack of coins, as many as it is given (a count the board can count up).
      begin(12);
      const n = Math.max(1, Math.min(20, Math.round(params.count ?? 8)));
      const r = 1.3;
      const t = 0.22;
      const coin: Fill[] = [];
      for (let k = 0; k < n; k += 1) {
        const y = -k * t;
        const lean = Math.sin(k * 1.7) * 0.08;
        coin.push([
          box(-r + lean, y - t, r + lean, y, 0.05),
          k % 2 ? dark : shadeOf(c, 0.12),
        ]);
        coin.push([
          box(-r + lean, y - t * 0.55, r + lean, y - t * 0.45),
          tint(c, 0.15),
          { bare: true },
        ]);
      }
      coin.push([ellipse([0, -n * t], r, r * 0.32), light]);
      coin.push([
        ellipse([0, -n * t], r * 0.68, r * 0.2),
        tint(c, 0.35),
        { bare: true },
      ]);
      d.part('stack', 'object', coin);
      d.value('stack', n);
      focal = [-r - 0.2, -n * t - r * 0.32, 2 * r + 0.4, n * t + r * 0.32];
      notes.push(`${n} coins`);
      break;
    }
    case 'sack': {
      begin(90);
      const w = 50;
      const h = 82;
      d.part('body', 'object', [
        [
          poly([
            [-w / 2, 0],
            [-w / 2 - 3, -h * 0.4],
            [-w / 2 + 4, -h * 0.82],
            [-8, -h * 0.9],
            [8, -h * 0.9],
            [w / 2 - 4, -h * 0.82],
            [w / 2 + 3, -h * 0.4],
            [w / 2, 0],
          ]),
          c,
        ],
        [
          poly([
            [w / 2 - 12, 0],
            [w / 2 - 6, -h * 0.4],
            [w / 2 - 10, -h * 0.8],
            [w / 2 - 4, -h * 0.82],
            [w / 2 + 3, -h * 0.4],
            [w / 2, 0],
          ]),
          dark,
          { bare: true },
        ],
        [
          box(-w / 2 + 6, -h * 0.5, w / 2 - 6, -h * 0.46),
          shadeOf(c, 0.1),
          { bare: true },
        ],
      ]);
      d.part('tie', 'object', [
        [box(-9, -h * 0.94, 9, -h * 0.88, 2), dark],
        [
          poly([
            [-6, -h * 0.94],
            [-10, -h],
            [10, -h],
            [6, -h * 0.94],
          ]),
          c,
        ],
      ]);
      d.part('grain', 'object', [
        [dome(0, -h * 0.99, 9, 3), inLook(style, '#e2c36b')],
      ]);
      focal = [-w / 2 - 3, -h - 3, w + 6, h + 3];
      break;
    }
    case 'barrel': {
      // A 200-litre drum.
      begin(95);
      const w = 58;
      const h = 88;
      d.part('body', 'object', [
        [box(-w / 2, -h, w / 2, 0, 3), c],
        [box(w / 2 - 12, -h, w / 2, 0, 3), dark, { bare: true }],
        [
          box(-w / 2, -h * 0.68, w / 2, -h * 0.64),
          shadeOf(c, 0.3),
          { bare: true },
        ],
        [
          box(-w / 2, -h * 0.36, w / 2, -h * 0.32),
          shadeOf(c, 0.3),
          { bare: true },
        ],
        [box(-w / 2 + 3, -h, -w / 2 + 7, 0), light, { bare: true }],
      ]);
      d.part('lid', 'object', [
        [ellipse([0, -h], w / 2, 3.5), shadeOf(c, 0.1)],
        [circle([w * 0.22, -h], 2.2), dark, { bare: true }],
      ]);
      focal = [-w / 2, -h - 3.5, w, h + 3.5];
      break;
    }
    case 'crate': {
      begin(64);
      const w = 60;
      const h = 50;
      const slats: Fill[] = [[box(-w / 2, -h, w / 2, 0, 1.5), c]];
      for (let k = 1; k < 4; k += 1)
        slats.push([
          box(-w / 2, -h + (h / 4) * k - 0.6, w / 2, -h + (h / 4) * k + 0.6),
          dark,
          { bare: true },
        ]);
      slats.push(
        [band([-w / 2 + 4, -4], [w / 2 - 4, -h + 4], 4), shadeOf(c, 0.12)],
        [box(-w / 2, -h, -w / 2 + 4, 0), dark],
        [box(w / 2 - 4, -h, w / 2, 0), dark],
      );
      d.part('body', 'object', slats);
      d.part(
        'lid',
        'object',
        [[box(-w / 2 - 1, -h - 3, w / 2 + 1, -h, 1), shadeOf(c, 0.06)]],
        { pivot: [-w / 2, -h] },
      );
      focal = [-w / 2 - 1, -h - 3, w + 2, h + 3];
      break;
    }
    case 'battery': {
      // A cell standing on its foot, its charge a part that fills (its value the share full).
      begin(14);
      const w = 6;
      const h = 11;
      const charge =
        Math.max(0, Math.min(10, Math.round(params.count ?? 7))) / 10;
      d.part('body', 'object', [
        [box(-w / 2, -h, w / 2, 0, 0.8), c],
        [
          box(w / 2 - 1.2, -h + 0.5, w / 2 - 0.3, -0.5, 0.4),
          shadeOf(c, 0.25),
          { bare: true },
        ],
      ]);
      d.part('terminal', 'object', [
        [box(-1.2, -h - 0.8, 1.2, -h + 0.2, 0.3), metal],
      ]);
      const level = inLook(style, '#5fb36b');
      d.part('window', 'object', [
        [
          box(-w / 2 + 1.1, -h + 1.5, w / 2 - 1.1, -1, 0.4),
          mixOk(c, '#ffffff', 0.15),
        ],
      ]);
      const fillTop = -1 - (h - 2.5) * charge;
      d.part(
        'charge',
        'window',
        [
          [
            box(-w / 2 + 1.4, Math.min(fillTop, -1.2), w / 2 - 1.4, -1.3, 0.3),
            level,
          ],
        ],
        { pivot: [0, -1.3] },
      );
      d.value('charge', charge);
      focal = [-w / 2, -h - 0.8, w, h + 0.8];
      notes.push(`${Math.round(charge * 100)}% charged`);
      break;
    }
    case 'lamp': {
      begin(60);
      d.part('base', 'object', [
        [ellipse([0, -1.5], 9, 1.8), dark],
        [box(-1, -38, 1, -1.5), metal],
      ]);
      d.part('shade', 'object', [
        [
          poly([
            [-14, -32],
            [-8, -50],
            [8, -50],
            [14, -32],
          ]),
          c,
        ],
        [
          poly([
            [4, -50],
            [8, -50],
            [14, -32],
            [7, -32],
          ]),
          dark,
          { bare: true },
        ],
      ]);
      d.part('light', 'object', [
        [
          poly([
            [-13, -32],
            [13, -32],
            [22, -4],
            [-22, -4],
          ]),
          glow,
          { bare: true, opacity: 0.32 },
        ],
        [circle([0, -33], 3.2), glow, { bare: true }],
      ]);
      states.off = { light: { opacity: 0 } };
      states.on = {};
      focal = [-22, -50, 44, 50];
      break;
    }
    case 'key': {
      begin(10);
      d.part(
        'key',
        'object',
        [
          [circle([-3.2, -1.6], 1.6), c],
          [circle([-3.2, -1.6], 0.65), shadeOf(c, 0.35), { bare: true }],
          [box(-1.8, -1.95, 4.2, -1.25, 0.2), c],
          [
            poly([
              [2.4, -1.25],
              [2.4, -0.4],
              [3, -0.4],
              [3, -0.8],
              [3.6, -0.8],
              [3.6, -0.3],
              [4.2, -0.3],
              [4.2, -1.25],
            ]),
            c,
          ],
        ],
        { pivot: [-3.2, -1.6] },
      );
      focal = [-4.8, -3.2, 9, 3.2];
      break;
    }
    case 'lock': {
      begin(12);
      const w = 6;
      const h = 5;
      d.part(
        'shackle',
        'object',
        [
          [
            poly([
              ...arcPts([0, -h], 2.3, Math.PI, 2 * Math.PI, 12),
              ...arcPts([0, -h], 1.5, 2 * Math.PI, Math.PI, 12),
            ]),
            metal,
          ],
          [box(-2.3, -h, -1.5, -h + 0.6), metal],
          [box(1.5, -h, 2.3, -h + 0.6), metal],
        ],
        { pivot: [1.9, -h] },
      );
      d.part('body', 'object', [
        [box(-w / 2, -h, w / 2, 0, 0.7), c],
        [
          box(w / 2 - 1, -h + 0.4, w / 2 - 0.3, -0.4, 0.3),
          dark,
          { bare: true },
        ],
      ]);
      d.part('keyhole', 'object', [
        [circle([0, -h * 0.55], 0.55), shadeOf(c, 0.5)],
        [
          poly([
            [-0.3, -h * 0.5],
            [0.3, -h * 0.5],
            [0.45, -h * 0.25],
            [-0.45, -h * 0.25],
          ]),
          shadeOf(c, 0.5),
        ],
      ]);
      states.open = { shackle: { dy: -1.4, rotate: -25 } };
      states.closed = {};
      focal = [-w / 2, -h - 2.4, w, h + 2.4];
      break;
    }
    case 'chain': {
      begin(30);
      const links = 7;
      const lw = 4.2;
      for (let k = 0; k < links; k += 1) {
        const x = -((links - 1) * lw * 0.78) / 2 + k * lw * 0.78;
        const upright = k % 2 === 1;
        const outer = upright
          ? ellipse([x, -2.4], 1.3, 2.2)
          : ellipse([x, -2.4], lw / 2, 1.4);
        const inner = upright
          ? ellipse([x, -2.4], 0.55, 1.4)
          : ellipse([x, -2.4], lw / 2 - 0.8, 0.6);
        d.part(
          `link-${k + 1}`,
          'object',
          [
            [outer, upright ? dark : c],
            [inner, mixOk(style.paper, c, 0.05), { bare: true }],
          ],
          { pivot: [x, -2.4] },
        );
      }
      focal = [
        -((links - 1) * lw * 0.78) / 2 - lw / 2,
        -4.8,
        (links - 1) * lw * 0.78 + lw,
        4.8,
      ];
      notes.push(`${links} links`);
      break;
    }
  }
  const root = d.parts.find((one) => one.id === 'object');
  const drawn = unionBox(
    d.parts
      .filter((p) => p.box && (p.box[2] > 0 || p.box[3] > 0))
      .map((p) => p.box!),
  );
  if (root)
    root.markup = groundShadow(
      `${kind}-shadow`,
      [drawn[0] + drawn[2] / 2, 0],
      drawn[2] * 0.6,
      Math.max(0.3, drawn[2] * 0.06),
      style.shadow.colour,
      style.shadow.opacity * 0.7,
    );
  const pad = Math.max(drawn[2], drawn[3]) * 0.05;
  const boxAll: ShotBox = [
    drawn[0] - drawn[2] * 0.12 - pad,
    drawn[1] - pad,
    drawn[2] * 1.24 + 2 * pad,
    -(drawn[1] - pad),
  ];
  return d.piece({
    id: `object.${kind}`,
    box: boxAll,
    focal,
    rig: { states, moves: ['enter', 'exit'] },
    colours: worn.side ? ['side'] : [kind],
    notes,
  });
}

/** Points along a circle's arc, from one angle to another. */
function arcPts(c: Pt, r: number, a0: number, a1: number, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  });
}

export const OBJECT_KIT: Readonly<Record<string, KitEntry>> = {
  object: {
    family: 'objects',
    looks: ['editorial', 'illustrated'],
    about:
      'An everyday thing, big and simple: kind phone and computer (screens light: states on, off), book, coins (a stack of count coins), sack (of grain), barrel (an oil drum), crate, battery (count tenths charged), lamp (states on, off), key, lock (states closed, open), chain (its links are parts).',
    params: {
      kind: { values: OBJECT_KINDS, default: 'coins', about: 'which thing' },
      count: { range: [0, 20], default: 8, about: 'coins in the stack, or a battery\u2019s tenths of charge' },
    },
    moves: ['enter', 'exit'],
    make: (params: KitParams, style: KitStyle, seed: number) =>
      drawObject(
        (OBJECT_KINDS as readonly unknown[]).includes(params.kind) ? (params.kind as ObjectKind) : 'coins',
        {
          ...(typeof params.colour === 'string' ? { colour: params.colour } : {}),
          ...(typeof params.count === 'number' ? { count: params.count } : {}),
        },
        style,
        seed,
      ),
  },
};
