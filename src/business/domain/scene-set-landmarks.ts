/**
 * Landmarks by parameters (studio-scenery-plan §5.7): the things a story
 * turns on that no list of pieces has (Noah's ark half built, the
 * pyramids, a tower, a bridge, a temple, a statue, a ship, a tent, a
 * throne), drawn by code from a few numbers the painter names. The
 * painter says which builder and its parameters; code clamps each to
 * what it can draw, and anything it did not say takes its usual.
 *
 * A landmark is sized to the frame, not to life: its `size` is the share
 * of the set's width it spans where it stands (an ark, a ship, a bridge,
 * a pyramid, a temple, a tent), or of its height (a tower, a statue, a
 * throne). Everything else is its shape.
 */
import { CLOTH, COATS, KIT_EXTRAS, SET_COLOURS, FIGURE_INK } from './scene-ink';
import { segment } from './scene-set-pieces';
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

export const LANDMARK_KINDS = [
  'ark',
  'pyramid',
  'tower',
  'bridge',
  'temple',
  'statue',
  'ship',
  'tent',
  'throne',
] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];
export const isLandmarkKind = (kind: string): kind is LandmarkKind =>
  (LANDMARK_KINDS as readonly string[]).includes(kind);

type ParamSpec =
  | { kind: 'number'; min: number; max: number; def: number; int?: true }
  | { kind: 'bool'; def: boolean }
  | { kind: 'choice'; options: readonly string[]; def: string };
export type LandmarkParams = Record<string, number | boolean | string>;

/** Each builder: whether its size is a share of the width or the height, its parameters, and what it is for the painter. */
export const LANDMARKS: Record<
  LandmarkKind,
  { span: 'w' | 'h'; params: Record<string, ParamSpec>; words: string }
> = {
  ark: {
    span: 'w',
    words:
      "Noah's ark: a great wooden boat with a house on it, a door and a ramp",
    params: {
      size: { kind: 'number', min: 0.3, max: 0.9, def: 0.6 },
      decks: { kind: 'number', min: 1, max: 3, def: 3, int: true },
      ramp: { kind: 'bool', def: true },
      unfinished: { kind: 'bool', def: false },
    },
  },
  pyramid: {
    span: 'w',
    words: 'a pyramid, smooth or stepped, its gold cap, or still being built',
    params: {
      size: { kind: 'number', min: 0.12, max: 0.6, def: 0.32 },
      stepped: { kind: 'bool', def: false },
      cap: { kind: 'bool', def: true },
      unfinished: { kind: 'bool', def: false },
    },
  },
  tower: {
    span: 'h',
    words:
      "a tower of some levels: square or round, a pointed roof, or stepped as Babel's",
    params: {
      size: { kind: 'number', min: 0.3, max: 0.95, def: 0.65 },
      levels: { kind: 'number', min: 2, max: 8, def: 4, int: true },
      round: { kind: 'bool', def: false },
      cone: { kind: 'bool', def: true },
      stepped: { kind: 'bool', def: false },
    },
  },
  bridge: {
    span: 'w',
    words: 'a bridge across: stone arches, or wood and rope',
    params: {
      size: { kind: 'number', min: 0.4, max: 1, def: 0.8 },
      arches: { kind: 'number', min: 1, max: 5, def: 3, int: true },
      rails: { kind: 'bool', def: true },
      stone: { kind: 'bool', def: true },
    },
  },
  temple: {
    span: 'w',
    words:
      'a temple: columns under a pediment, or an Egyptian gateway of two towers; whole or ruined',
    params: {
      size: { kind: 'number', min: 0.25, max: 0.75, def: 0.45 },
      columns: { kind: 'number', min: 2, max: 10, def: 6, int: true },
      pediment: { kind: 'bool', def: true },
      pylon: { kind: 'bool', def: false },
      ruined: { kind: 'bool', def: false },
      steps: { kind: 'number', min: 1, max: 4, def: 3, int: true },
    },
  },
  statue: {
    span: 'h',
    words:
      'a statue on its plinth: standing, an arm raised, or seated; stone or gold',
    params: {
      size: { kind: 'number', min: 0.2, max: 0.75, def: 0.45 },
      pose: {
        kind: 'choice',
        options: ['standing', 'arm raised', 'seated'],
        def: 'standing',
      },
      plinth: { kind: 'bool', def: true },
      gold: { kind: 'bool', def: false },
    },
  },
  ship: {
    span: 'w',
    words: 'a ship: its hull, its masts and sails, its oars',
    params: {
      size: { kind: 'number', min: 0.3, max: 0.9, def: 0.55 },
      masts: { kind: 'number', min: 0, max: 3, def: 2, int: true },
      sails: { kind: 'bool', def: true },
      oars: { kind: 'bool', def: false },
    },
  },
  tent: {
    span: 'w',
    words:
      "a tent of cloth over poles, as a desert family's, its door open or shut",
    params: {
      size: { kind: 'number', min: 0.12, max: 0.45, def: 0.22 },
      poles: { kind: 'number', min: 1, max: 3, def: 2, int: true },
      open: { kind: 'bool', def: true },
      stripes: { kind: 'bool', def: true },
    },
  },
  throne: {
    span: 'h',
    words: 'a throne on its steps, gold or wood, under a canopy or not',
    params: {
      size: { kind: 'number', min: 0.2, max: 0.55, def: 0.32 },
      steps: { kind: 'number', min: 0, max: 3, def: 2, int: true },
      canopy: { kind: 'bool', def: false },
      gold: { kind: 'bool', def: true },
    },
  },
};

/** A landmark's parameters as said, each clamped to what its builder draws; any not said, its usual; any it has not, left out. */
export function clampParams(kind: LandmarkKind, said: unknown): LandmarkParams {
  const raw =
    said && typeof said === 'object' ? (said as Record<string, unknown>) : {};
  const out: LandmarkParams = {};
  for (const [name, spec] of Object.entries(LANDMARKS[kind].params)) {
    const value = raw[name];
    if (spec.kind === 'number') {
      const n =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseFloat(value)
            : NaN;
      const v = Number.isFinite(n)
        ? Math.max(spec.min, Math.min(spec.max, n))
        : spec.def;
      out[name] = spec.int ? Math.round(v) : Math.round(v * 100) / 100;
    } else if (spec.kind === 'bool')
      out[name] =
        typeof value === 'boolean'
          ? value
          : typeof value === 'string'
            ? /^(?:true|yes|1)$/iu.test(value.trim())
            : typeof value === 'number'
              ? value > 0
              : spec.def;
    else {
      const word = typeof value === 'string' ? value.toLowerCase().trim() : '';
      out[name] = spec.options.includes(word) ? word : spec.def;
    }
  }
  return out;
}

/** The builder a thing's name says ("Noah's ark", "the great pyramid", "a golden statue"), with what its words say of it; null for none. */
export function landmarkOfName(
  name: string,
): { kind: LandmarkKind; params: LandmarkParams } | null {
  const words = name.toLowerCase();
  const found: [RegExp, LandmarkKind][] = [
    [/\bark\b/u, 'ark'],
    [/\bpyramids?\b/u, 'pyramid'],
    [/\b(?:tower|ziggurat|babel|lighthouse)\b/u, 'tower'],
    [/\bbridge\b/u, 'bridge'],
    [/\b(?:temple|shrine|parthenon)\b/u, 'temple'],
    [/\b(?:statue|idol|monument|golden calf)\b/u, 'statue'],
    [/\b(?:ship|galley|sailing boat)\b/u, 'ship'],
    [/\b(?:tent|tabernacle|marquee)\b/u, 'tent'],
    [/\bthrone\b/u, 'throne'],
  ];
  const hit = found.find(([pattern]) => pattern.test(words));
  if (!hit) return null;
  const kind = hit[1];
  const said: Record<string, unknown> = {};
  if (
    /unfinished|under construction|being built|half[- ]built|building/u.test(
      words,
    )
  )
    said.unfinished = true;
  if (/\b(?:gold|golden)\b/u.test(words)) said.gold = true;
  if (/\bruin(?:s|ed)?\b/u.test(words)) said.ruined = true;
  if (/\b(?:egypt|egyptian|pylon)\b/u.test(words)) said.pylon = true;
  if (/\b(?:babel|ziggurat|stepped)\b/u.test(words)) said.stepped = true;
  if (/\bround\b/u.test(words)) said.round = true;
  return { kind, params: clampParams(kind, said) };
}

const WOOD = SET_COLOURS.wood;
const WOOD_DARK = KIT_EXTRAS['dark wood'];
const PLANK = KIT_EXTRAS.plank;
const STONE = SET_COLOURS.stone;
const SANDSTONE = COATS.cream;
const SAND = '#f1dcaa';
const PAPER = KIT_EXTRAS.paper;
const GOLD = KIT_EXTRAS.gold;
const DARK = '#3a3740';

const num = (p: LandmarkParams, name: string): number => Number(p[name]);
const yes = (p: LandmarkParams, name: string): boolean => p[name] === true;
const darker = (hex: string, k = 0.86): string => {
  const n = parseInt(hex.slice(1), 16);
  return `#${[n >> 16, (n >> 8) & 255, n & 255]
    .map((v) =>
      Math.round(v * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};
/** A wooden pole or beam: ink round wood. */
const beam = (d: string, width = 10, colour = WOOD) =>
  line(d, FIGURE_INK, width + 4) + line(d, colour, width);

/** A landmark as the painter asked for it, its parameters clamped; `colour` its own where it has one. */
export function drawLandmark(
  kind: LandmarkKind,
  said: unknown = {},
  colour?: string,
): SceneryPiece {
  const p = clampParams(kind, said);
  switch (kind) {
    case 'ark':
      return drawArk(p, colour);
    case 'pyramid':
      return drawPyramid(p, colour);
    case 'tower':
      return drawTower(p, colour);
    case 'bridge':
      return drawBridge(p, colour);
    case 'temple':
      return drawTemple(p, colour);
    case 'statue':
      return drawStatue(p, colour);
    case 'ship':
      return drawShip(p, colour);
    case 'tent':
      return drawTent(p, colour);
    case 'throne':
      return drawThrone(p, colour);
  }
}

function drawArk(p: LandmarkParams, colour?: string): SceneryPiece {
  const decks = num(p, 'decks');
  const unfinished = yes(p, 'unfinished');
  const L = m(34);
  const half = L / 2;
  const lift = m(0.9);
  const hullH = m(3.4) + (decks - 1) * m(1.2);
  const deckY = -lift - hullH;
  const wood = colour ?? WOOD;
  const hull = `M${r1(-half)},${r1(deckY)} L${r1(half)},${r1(deckY)} Q${r1(half - m(1))},${r1(-lift)} ${r1(half - m(5))},${r1(-lift)} L${r1(-half + m(5))},${r1(-lift)} Q${r1(-half + m(1))},${r1(-lift)} ${r1(-half)},${r1(deckY)} Z`;
  const blocks = Array.from({ length: 7 }, (_, k) => {
    const x = -half + m(5) + (k * (L - m(10))) / 6;
    return rect(x - m(0.5), -lift, m(1), lift, WOOD_DARK, 0);
  }).join('');
  const planks = [0.3, 0.55, 0.8]
    .map((k) =>
      flatRect(-half + m(1), deckY + hullH * k, L - m(2), 6, darker(wood)),
    )
    .join('');
  const cabinW = L * 0.6;
  const cabinH = m(2.4) + (decks - 1) * m(1.3);
  const cabinTop = deckY - cabinH;
  const roofTop = cabinTop - m(1.6);
  const cabin =
    rect(-cabinW / 2, cabinTop, cabinW, cabinH, darker(wood, 0.94), 0) +
    Array.from({ length: Math.max(1, decks - 1) + 1 }, (_, row) =>
      Array.from({ length: 7 }, (_, k) =>
        rect(
          -cabinW / 2 + m(1) + (k * (cabinW - m(2.8))) / 6,
          cabinTop + m(0.5) + row * m(1.3),
          m(0.8),
          m(0.6),
          DARK,
          1,
        ),
      ).join(''),
    )
      .slice(0, decks)
      .join('') +
    shape(
      poly([
        [-cabinW / 2 - m(1), cabinTop],
        [-cabinW / 2 + m(2), roofTop],
        [cabinW / 2 - m(2), roofTop],
        [cabinW / 2 + m(1), cabinTop],
      ]),
      WOOD_DARK,
    );
  const doorX = half * 0.34;
  const door = rect(doorX - m(1), deckY + m(0.6), m(2), m(2.2), DARK, 0);
  const ramp = yes(p, 'ramp')
    ? shape(
        poly([
          [doorX - m(1), deckY + m(2.8)],
          [doorX + m(1), deckY + m(2.8)],
          [half + m(3), 0],
          [half + m(0.5), 0],
        ]),
        PLANK,
      ) +
      line(
        Array.from({ length: 6 }, (_, k) => {
          const t = (k + 1) / 7;
          const x = doorX + (half + m(1.8) - doorX) * t;
          const y = deckY + m(2.8) - (deckY + m(2.8)) * t;
          return `M${r1(x - m(0.9))},${r1(y)} L${r1(x + m(0.9))},${r1(y)}`;
        }).join(' '),
        WOOD_DARK,
        3,
      )
    : '';
  let body: string;
  if (unfinished) {
    // Planked only toward its stern; its ribs bare to the bow, a keel, and
    // scaffolding and a ladder against it.
    const cut = -half + L * 0.55;
    const planked = `M${r1(-half)},${r1(deckY)} L${r1(cut)},${r1(deckY)} L${r1(cut)},${r1(-lift)} L${r1(-half + m(5))},${r1(-lift)} Q${r1(-half + m(1))},${r1(-lift)} ${r1(-half)},${r1(deckY)} Z`;
    const ribs = Array.from({ length: 8 }, (_, k) => {
      const x = cut + m(1.2) + (k * (half - cut - m(2))) / 7;
      const bottom =
        x > half - m(5) ? -lift - (x - (half - m(5))) * 0.7 : -lift;
      return beam(
        `M${r1(x)},${r1(bottom)} Q${r1(x + m(0.4))},${r1((bottom + deckY) / 2)} ${r1(x)},${r1(deckY)}`,
        8,
      );
    }).join('');
    const scaffold =
      [0.1, 0.45, 0.8]
        .map((k) => {
          const x = cut + (half - cut) * k;
          return beam(
            `M${r1(x)},0 L${r1(x)},${r1(deckY - m(1.5))}`,
            7,
            WOOD_DARK,
          );
        })
        .join('') +
      beam(
        `M${r1(cut)},${r1(deckY + hullH * 0.45)} L${r1(half + m(0.5))},${r1(deckY + hullH * 0.45)}`,
        6,
        WOOD_DARK,
      ) +
      beam(
        `M${r1(-half - m(1.5))},0 L${r1(-half + m(0.6))},${r1(deckY - m(0.3))} M${r1(-half - m(0.5))},0 L${r1(-half + m(1.6))},${r1(deckY - m(0.3))}`,
        5,
        WOOD_DARK,
      );
    body =
      blocks +
      beam(
        `M${r1(-half + m(4))},${r1(-lift)} L${r1(half - m(4))},${r1(-lift)}`,
        12,
        WOOD_DARK,
      ) +
      shape(planked, wood) +
      [0.3, 0.55, 0.8]
        .map((k) =>
          flatRect(
            -half + m(1),
            deckY + hullH * k,
            cut + half - m(1),
            6,
            darker(wood),
          ),
        )
        .join('') +
      ribs +
      beam(`M${r1(-half)},${r1(deckY)} L${r1(half)},${r1(deckY)}`, 8) +
      scaffold +
      ramp;
  } else body = blocks + shape(hull, wood) + planks + cabin + door + ramp;
  return {
    ...framed(shadowOf(half) + body, [
      -half - m(1.5),
      unfinished ? deckY - m(1.6) : roofTop,
      L + m(4.5),
      unfinished ? -deckY + m(1.6) : -roofTop,
    ]),
    roosts: unfinished
      ? [[0, r1(deckY)]]
      : [
          [r1(-cabinW / 4), r1(roofTop)],
          [r1(cabinW / 4), r1(roofTop)],
        ],
  };
}

function drawPyramid(p: LandmarkParams, colour?: string): SceneryPiece {
  const B = m(24);
  const H = B * 0.62;
  const apex = B * 0.08;
  const c = colour ?? SAND;
  const top = yes(p, 'unfinished') ? 0.72 : 1;
  const at = (k: number): [number, number] => [apex * k, -H * k];
  const [ax, ay] = at(top);
  // Its two faces seen: the lit one and the one in shade.
  const left = poly(
    top < 1
      ? [
          [-B / 2, 0],
          [ax - B * 0.14, ay],
          [ax, ay],
          [ax, 0],
        ]
      : [
          [-B / 2, 0],
          [ax, ay],
          [ax, 0],
        ],
  );
  const right = poly(
    top < 1
      ? [
          [ax, ay],
          [ax + B * 0.12, ay],
          [B / 2, 0],
          [ax, 0],
        ]
      : [
          [ax, ay],
          [B / 2, 0],
          [ax, 0],
        ],
  );
  const courses = Array.from({ length: 7 }, (_, k) => {
    const t = (k + 1) / 8;
    if (t >= top) return '';
    const y = -H * t;
    const xl = -B / 2 + (ax + B / 2) * (t / top) * (top < 1 ? 0.86 : 1);
    const xr = B / 2 - (B / 2 - ax) * (t / top) * (top < 1 ? 0.86 : 1);
    return p.stepped
      ? flatRect(xl, y, xr - xl, 8, darker(c, 0.82))
      : flatRect(xl, y, xr - xl, 4, darker(c, 0.9));
  }).join('');
  const cap =
    yes(p, 'cap') && top === 1
      ? shape(
          poly([
            [ax - B * 0.045, -H * 0.93],
            [ax, -H],
            [ax + B * 0.04, -H * 0.93],
          ]),
          GOLD,
        )
      : '';
  const ramp =
    top < 1
      ? line(
          `M${r1(-B * 0.42)},0 L${r1(-B * 0.05)},${r1(-H * 0.35)} L${r1(-B * 0.3)},${r1(-H * 0.55)} L${r1(ax - B * 0.1)},${r1(ay)}`,
          darker(c, 0.7),
          10,
        )
      : '';
  return {
    ...framed(
      shape(left, c) + shape(right, darker(c, 0.84)) + courses + ramp + cap,
      [-B / 2, -H * top, B, H * top],
    ),
    roosts: [[r1(ax), r1(ay)]],
  };
}

function drawTower(p: LandmarkParams, colour?: string): SceneryPiece {
  const n = num(p, 'levels');
  const stepped = yes(p, 'stepped');
  const c = colour ?? (stepped ? COATS.tan : STONE);
  const w0 = m(stepped ? 14 : 5);
  const lh = m(stepped ? 3.2 : 4);
  let out = '';
  let y = 0;
  let w = w0;
  for (let k = 0; k < n; k += 1) {
    const top = y - lh;
    if (yes(p, 'round') && !stepped)
      out +=
        rect(-w / 2, top, w, lh + 2, c, 0) +
        flatRect(w * 0.18, top, w * 0.12, lh, darker(c, 0.9));
    else out += rect(-w / 2, top, w, lh + 2, k % 2 ? darker(c, 0.95) : c, 0);
    // Its windows: arched slits, one or two a level.
    const count = stepped ? 3 : w > m(3) ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const x = -w / 2 + ((i + 0.5) * w) / count;
      out += shape(
        `M${r1(x - m(0.25))},${r1(top + lh * 0.75)} L${r1(x - m(0.25))},${r1(top + lh * 0.35)} Q${r1(x)},${r1(top + lh * 0.2)} ${r1(x + m(0.25))},${r1(top + lh * 0.35)} L${r1(x + m(0.25))},${r1(top + lh * 0.75)} Z`,
        DARK,
      );
    }
    if (stepped && k < n - 1)
      out += line(
        `M${r1(-w / 2 + m(0.6))},${r1(y)} L${r1(-w * 0.22)},${r1(top)}`,
        darker(c, 0.7),
        8,
      );
    y = top;
    if (stepped) w *= 0.8;
  }
  const roofH = yes(p, 'cone') && !stepped ? w * 1.1 : m(0.8);
  out +=
    yes(p, 'cone') && !stepped
      ? shape(
          poly([
            [-w / 2 - m(0.6), y],
            [0, y - roofH],
            [w / 2 + m(0.6), y],
          ]),
          SET_COLOURS.roofs,
        )
      : Array.from({ length: 4 }, (_, k) =>
          rect(-w / 2 + (k * w) / 3.5, y - m(0.8), w / 7, m(0.8) + 2, c, 0),
        ).join('');
  return {
    ...framed(shadowOf(w0 / 2) + out, [
      -w0 / 2 - m(0.6),
      y - roofH,
      w0 + m(1.2),
      -y + roofH,
    ]),
    roosts: [[0, r1(y - roofH)]],
  };
}

function drawBridge(p: LandmarkParams, colour?: string): SceneryPiece {
  const L = m(36);
  const half = L / 2;
  const deck = -m(4.2);
  const a = num(p, 'arches');
  const stone = yes(p, 'stone');
  const c = colour ?? (stone ? STONE : WOOD);
  let out = '';
  if (stone) {
    // Its body with the arches cut through, what lies under them seen through.
    const span = (L - m(2)) / a;
    const holes = Array.from({ length: a }, (_, k) => {
      const x0 = -half + m(1) + k * span + m(0.8);
      const x1 = x0 + span - m(1.6);
      const r = (x1 - x0) / 2;
      const spring = deck + m(1.2) + r * 0.2;
      return `M${r1(x0)},0 L${r1(x0)},${r1(spring + r * 0.6)} Q${r1(x0)},${r1(spring - r * 0.4)} ${r1((x0 + x1) / 2)},${r1(spring - r * 0.4)} Q${r1(x1)},${r1(spring - r * 0.4)} ${r1(x1)},${r1(spring + r * 0.6)} L${r1(x1)},0 Z`;
    }).join(' ');
    out += `<path d="M${r1(-half)},0 L${r1(-half)},${r1(deck)} L${r1(half)},${r1(deck)} L${r1(half)},0 Z ${holes}" fill-rule="evenodd" fill="${c}"/>`;
    out += flatRect(-half, deck + m(0.6), L, 6, darker(c, 0.88));
    if (yes(p, 'rails'))
      out +=
        rect(-half, deck - m(1), L, m(1), c, 0) +
        flatRect(-half, deck - m(1) + 8, L, 6, darker(c, 0.88));
  } else {
    // Planks on posts, and a rope along each side.
    out += Array.from({ length: a + 1 }, (_, k) => {
      const x = -half + m(1) + (k * (L - m(2))) / a;
      return beam(`M${r1(x)},0 L${r1(x)},${r1(deck - m(1))}`, 12, WOOD_DARK);
    }).join('');
    out += rect(-half, deck, L, m(0.35), PLANK, 0);
    if (yes(p, 'rails'))
      out += line(
        `M${r1(-half)},${r1(deck - m(1))} Q0,${r1(deck - m(0.4))} ${r1(half)},${r1(deck - m(1))}`,
        FIGURE_INK,
        3,
      );
  }
  return {
    ...framed(out, [-half, deck - m(1), L, -deck + m(1)]),
    roosts: [
      [r1(-half * 0.5), r1(deck - m(1))],
      [r1(half * 0.5), r1(deck - m(1))],
    ],
  };
}

function drawTemple(p: LandmarkParams, colour?: string): SceneryPiece {
  const n = num(p, 'columns');
  const steps = num(p, 'steps');
  const ruined = yes(p, 'ruined');
  const c = colour ?? SANDSTONE;
  if (yes(p, 'pylon')) {
    // An Egyptian gateway: two sloping towers either side of a tall door,
    // flags on their poles flapping, marks carved on their faces.
    const W = m(26);
    const H = m(12);
    const tower = (x0: number, x1: number) =>
      shape(
        poly([
          [x0, 0],
          [x0 + m(1), -H],
          [x1 - m(1), -H],
          [x1, 0],
        ]),
        c,
      ) +
      rect(
        x0 + m(0.6),
        -H - m(0.7),
        x1 - x0 - m(1.2),
        m(0.7),
        darker(c, 0.9),
        0,
      ) +
      Array.from(
        { length: 3 },
        (_, k) =>
          `<ellipse cx="${r1((x0 + x1) / 2)}" cy="${r1(-H * (0.3 + k * 0.2))}" rx="${r1(m(1.6))}" ry="${r1(m(0.5))}" fill="none" stroke="${darker(c, 0.75)}" stroke-width="6"/>`,
      ).join('');
    const flags = [-W / 2 + m(2.5), -W / 2 + m(6), W / 2 - m(6), W / 2 - m(2.5)]
      .map(
        (x, k) =>
          beam(`M${r1(x)},0 L${r1(x)},${r1(-H - m(4))}`, 6, WOOD_DARK) +
          segment(
            k,
            [r1(x), r1(-H - m(4))],
            shape(
              poly([
                [x, -H - m(4)],
                [x + m(2), -H - m(3.6)],
                [x, -H - m(3.1)],
              ]),
              [CLOTH.red, CLOTH.teal, CLOTH.yellow, CLOTH.red][k],
            ),
          ),
      )
      .join('');
    return {
      ...framed(
        shadowOf(W / 2) +
          flags +
          tower(-W / 2, -m(2.6)) +
          tower(m(2.6), W / 2) +
          rect(-m(2.8), -H * 0.72, m(5.6), H * 0.72, c, 0) +
          rect(-m(1.6), -H * 0.6, m(3.2), H * 0.6, DARK, 0) +
          rect(-m(3.2), -H * 0.8, m(6.4), m(1), darker(c, 0.9), 0) +
          circle(0, -H * 0.76, m(0.35), GOLD),
        [-W / 2, -H - m(4), W, H + m(4)],
      ),
      reacts: { as: 'flag', len: r1(m(2)) },
      roosts: [
        [r1(-W / 4), r1(-H - m(0.7))],
        [r1(W / 4), r1(-H - m(0.7))],
      ],
    };
  }
  const gap = m(2.3);
  const W = n * gap + m(1.5);
  const stepH = m(0.4);
  const base = -steps * stepH;
  const colH = m(7);
  const top = base - colH;
  let out = shadowOf(W / 2);
  for (let k = 0; k < steps; k += 1)
    out += rect(
      -W / 2 - (steps - k) * m(0.5),
      -(k + 1) * stepH,
      W + (steps - k) * m(1),
      stepH,
      darker(c, 0.94),
      0,
    );
  for (let k = 0; k < n; k += 1) {
    const x = -W / 2 + m(0.75) + gap * (k + 0.5);
    const broken = ruined && (k * 5 + 3) % 3 === 0;
    const h = broken ? colH * (0.45 + ((k * 7) % 4) * 0.1) : colH;
    const r = m(0.42);
    out +=
      rect(
        x - r,
        base - h + (broken ? 0 : m(0.4)),
        2 * r,
        h - (broken ? 0 : m(0.4)),
        c,
        0,
      ) +
      flatRect(x - r * 0.3, base - h + m(0.5), 6, h - m(0.7), darker(c, 0.9)) +
      flatRect(x + r * 0.3, base - h + m(0.5), 6, h - m(0.7), darker(c, 0.9)) +
      (broken
        ? ''
        : rect(x - r * 1.35, base - h, r * 2.7, m(0.4), darker(c, 0.94), 1));
  }
  const whole = !ruined;
  if (whole || n > 3) {
    const spanW = ruined ? W * 0.45 : W;
    const x0 = -W / 2;
    out +=
      rect(x0, top - m(1.1), spanW, m(1.1), c, 0) +
      flatRect(x0, top - m(0.6), spanW, 6, darker(c, 0.88));
    if (yes(p, 'pediment') && whole)
      out += shape(
        poly([
          [x0 - m(0.3), top - m(1.1)],
          [0, top - m(1.1) - W * 0.16],
          [W / 2 + m(0.3), top - m(1.1)],
        ]),
        c,
      );
  }
  if (ruined)
    out += [0.2, 0.55, 0.8]
      .map((k, i) =>
        rect(
          -W / 2 + W * k,
          -m(0.5) - i * 6,
          m(1.1),
          m(0.5),
          darker(c, 0.9),
          2,
        ),
      )
      .join('');
  const peak =
    yes(p, 'pediment') && whole ? top - m(1.1) - W * 0.16 : top - m(1.1);
  return {
    ...framed(out, [-W / 2 - steps * m(0.5), peak, W + steps * m(1), -peak]),
    roosts: [[0, r1(peak)]],
  };
}

function drawStatue(p: LandmarkParams, colour?: string): SceneryPiece {
  const c = colour ?? (yes(p, 'gold') ? GOLD : STONE);
  const pose = String(p.pose);
  const plinth = yes(p, 'plinth') ? m(1.4) : 0;
  const H = m(4);
  const base = -plinth;
  let out = shadowOf(m(1.4));
  if (plinth)
    out +=
      rect(-m(1.3), -plinth, m(2.6), plinth, STONE, 0) +
      rect(-m(1.5), -plinth - m(0.2), m(3), m(0.25), darker(STONE, 0.9), 0) +
      rect(-m(1.5), -m(0.25), m(3), m(0.25), darker(STONE, 0.9), 0);
  const head = (y: number) => circle(0, y, m(0.36), c);
  if (pose === 'seated') {
    const seatY = base - m(1.4);
    out +=
      rect(-m(1), seatY, m(2), m(1.4), darker(c, 0.9), 0) +
      rect(-m(1), seatY - m(2.2), m(0.5), m(2.2), darker(c, 0.9), 0) +
      shape(
        poly([
          [-m(0.6), seatY],
          [-m(0.5), seatY - m(1.9)],
          [m(0.5), seatY - m(1.9)],
          [m(0.7), seatY],
        ]),
        c,
      ) +
      rect(-m(0.2), seatY - 4, m(1.1), m(0.5), c, 6) +
      rect(m(0.6), seatY, m(0.4), m(1.3), c, 4) +
      head(seatY - m(2.3));
    return {
      ...framed(out, [-m(1.5), seatY - m(2.7), m(3), -(seatY - m(2.7))]),
      roosts: [[0, r1(seatY - m(2.7))]],
    };
  }
  const top = base - H;
  out += shape(
    poly([
      [-m(0.8), base],
      [-m(0.5), top + m(1)],
      [m(0.5), top + m(1)],
      [m(0.8), base],
    ]),
    c,
  );
  out += flatRect(-m(0.1), top + m(1.4), 8, H - m(1.6), darker(c, 0.88));
  if (pose === 'arm raised')
    out +=
      beam(
        `M${r1(m(0.4))},${r1(top + m(1.2))} L${r1(m(0.9))},${r1(top - m(0.4))}`,
        30,
        c,
      ) +
      shape(
        poly([
          [m(0.75), top - m(0.4)],
          [m(0.9), top - m(1.1)],
          [m(1.05), top - m(0.4)],
        ]),
        GOLD,
      );
  else
    out += beam(
      `M${r1(m(0.45))},${r1(top + m(1.2))} L${r1(m(0.6))},${r1(top + m(2.6))}`,
      28,
      c,
    );
  out += head(top + m(0.6));
  const peak = pose === 'arm raised' ? top - m(1.1) : top + m(0.2);
  return {
    ...framed(out, [-m(1.5), peak, m(3), -peak]),
    roosts: [[0, r1(top + m(0.25))]],
  };
}

function drawShip(p: LandmarkParams, colour?: string): SceneryPiece {
  const L = m(26);
  const half = L / 2;
  const deck = -m(3.2);
  const c = colour ?? WOOD;
  const masts = num(p, 'masts');
  let out = shadowOf(half);
  out += shape(
    `M${r1(-half)},${r1(deck - m(0.8))} L${r1(half + m(1.5))},${r1(deck - m(1.2))} Q${r1(half - m(1))},${r1(-m(0.3))} ${r1(half - m(4))},0 L${r1(-half + m(3))},0 Q${r1(-half + m(0.5))},${r1(-m(0.5))} ${r1(-half)},${r1(deck - m(0.8))} Z`,
    c,
  );
  out += flatRect(-half + m(1), deck + m(0.8), L - m(3), 6, darker(c));
  out += rect(
    -half + m(0.5),
    deck - m(0.8),
    L - m(1),
    m(0.4),
    darker(c, 0.8),
    0,
  );
  if (yes(p, 'oars'))
    out += line(
      Array.from({ length: 8 }, (_, k) => {
        const x = -half + m(4) + (k * (L - m(8))) / 7;
        return `M${r1(x)},${r1(deck + m(1))} L${r1(x - m(1.2))},${r1(m(0.6))}`;
      }).join(' '),
      WOOD_DARK,
      6,
    );
  let top = deck - m(0.8);
  for (let k = 0; k < masts; k += 1) {
    const x = masts === 1 ? 0 : -half * 0.45 + (k * half * 0.9) / (masts - 1);
    const h = m(masts === 1 ? 12 : k === Math.floor(masts / 2) ? 13 : 10.5);
    top = Math.min(top, deck - h);
    out += beam(
      `M${r1(x)},${r1(deck)} L${r1(x)},${r1(deck - h)}`,
      10,
      WOOD_DARK,
    );
    if (yes(p, 'sails'))
      out += segment(
        k,
        [r1(x), r1(deck - h + m(0.8))],
        shape(
          poly([
            [x - m(3), deck - h + m(0.8)],
            [x + m(3), deck - h + m(0.8)],
            [x + m(3.4), deck - m(2.2)],
            [x - m(3.4), deck - m(2.2)],
          ]),
          PAPER,
        ) + flatRect(x - m(3.1), deck - h * 0.55, m(6.2), 8, CLOTH.red),
      );
    out += shape(
      poly([
        [x, deck - h],
        [x + m(1.4), deck - h + m(0.4)],
        [x, deck - h + m(0.8)],
      ]),
      CLOTH.red,
    );
  }
  return {
    ...framed(out, [
      -half,
      Math.min(top, deck - m(1.2)),
      L + m(1.5),
      -Math.min(top, deck - m(1.2)),
    ]),
    ...(yes(p, 'sails') && masts
      ? { reacts: { as: 'flag' as const, len: r1(m(3)) } }
      : {}),
    roosts: [[0, r1(top)]],
  };
}

function drawTent(p: LandmarkParams, colour?: string): SceneryPiece {
  const poles = num(p, 'poles');
  const W = m(3.2) + poles * m(2.2);
  const half = W / 2;
  const H = m(2.4);
  const c = colour ?? COATS['dark brown'];
  const peaks = Array.from(
    { length: poles },
    (_, k) => -half + ((k + 1) * W) / (poles + 1),
  );
  let d = `M${r1(-half - m(0.6))},0 L${r1(-half)},${r1(-H * 0.55)}`;
  peaks.forEach((x, k) => {
    d += ` L${r1(x)},${r1(-H)}`;
    if (k < peaks.length - 1)
      d += ` L${r1((x + peaks[k + 1]) / 2)},${r1(-H * 0.8)}`;
  });
  d += ` L${r1(half)},${r1(-H * 0.55)} L${r1(half + m(0.6))},0 Z`;
  let out = shadowOf(half) + shape(d, c);
  if (yes(p, 'stripes'))
    out += [0.3, 0.45]
      .map((k) =>
        flatRect(
          -half + m(0.2),
          -H * k,
          W - m(0.4),
          12,
          k < 0.4 ? COATS.cream : CLOTH.red,
        ),
      )
      .join('');
  const door = peaks[Math.floor(peaks.length / 2)];
  if (yes(p, 'open'))
    out +=
      shape(
        poly([
          [door - m(0.6), 0],
          [door - m(0.45), -H * 0.72],
          [door + m(0.45), -H * 0.72],
          [door + m(0.6), 0],
        ]),
        DARK,
      ) +
      segment(
        0,
        [r1(door + m(0.45)), r1(-H * 0.72)],
        shape(
          poly([
            [door + m(0.45), -H * 0.72],
            [door + m(1.3), -H * 0.6],
            [door + m(0.9), -H * 0.2],
          ]),
          darker(c, 0.85),
        ),
      );
  out += line(
    `M${r1(-half)},${r1(-H * 0.55)} L${r1(-half - m(1))},0 M${r1(half)},${r1(-H * 0.55)} L${r1(half + m(1))},0`,
    FIGURE_INK,
    2,
  );
  return {
    ...framed(out, [-half - m(1), -H, W + m(2), H]),
    ...(yes(p, 'open')
      ? { reacts: { as: 'flag' as const, len: r1(m(0.8)) } }
      : {}),
    roosts: peaks.map((x) => [r1(x), r1(-H)]),
  };
}

function drawThrone(p: LandmarkParams, colour?: string): SceneryPiece {
  const steps = num(p, 'steps');
  const c = colour ?? (yes(p, 'gold') ? GOLD : WOOD);
  const stepH = m(0.2);
  const base = -steps * stepH;
  let out = shadowOf(m(1.4));
  for (let k = 0; k < steps; k += 1)
    out += rect(
      -m(1.2) - (steps - k) * m(0.3),
      -(k + 1) * stepH,
      m(2.4) + (steps - k) * m(0.6),
      stepH,
      k % 2 ? CLOTH.red : darker(STONE, 0.95),
      0,
    );
  const seat = base - m(0.5);
  const back = seat - m(1.5);
  out +=
    rect(-m(0.55), back, m(1.1), m(1.6), c, 6) +
    rect(-m(0.4), back + m(0.2), m(0.8), m(1.2), CLOTH.purple, 6) +
    rect(-m(0.6), seat - m(0.1), m(1.2), m(0.6), c, 3) +
    rect(-m(0.5), seat - m(0.14), m(1), m(0.14), CLOTH.purple, 4) +
    rect(-m(0.72), seat - m(0.45), m(0.2), m(0.9), c, 3) +
    rect(m(0.52), seat - m(0.45), m(0.2), m(0.9), c, 3) +
    circle(0, back - 6, m(0.18), c);
  let top = back - m(0.3);
  if (yes(p, 'canopy')) {
    top = back - m(1.4);
    out =
      beam(
        `M${r1(-m(1.3))},${r1(base)} L${r1(-m(1.3))},${r1(top + m(0.3))} M${r1(m(1.3))},${r1(base)} L${r1(m(1.3))},${r1(top + m(0.3))}`,
        8,
        WOOD_DARK,
      ) +
      out +
      shape(
        `M${r1(-m(1.6))},${r1(top + m(0.4))} Q0,${r1(top - m(0.4))} ${r1(m(1.6))},${r1(top + m(0.4))} L${r1(m(1.4))},${r1(top + m(0.8))} L${r1(-m(1.4))},${r1(top + m(0.8))} Z`,
        CLOTH.red,
      );
  }
  return {
    ...framed(out, [-m(1.8), top - m(0.4), m(3.6), -top + m(0.4)]),
    roosts: [[0, r1(top)]],
  };
}

/** The builders in a line each, for the painter's brief. */
export function landmarkBrief(): string {
  return LANDMARK_KINDS.map((kind) => {
    const spec = LANDMARKS[kind];
    const params = Object.entries(spec.params)
      .map(([name, one]) =>
        one.kind === 'number'
          ? `${name} ${one.min}–${one.max}`
          : one.kind === 'bool'
            ? `${name} true/false`
            : `${name} ${one.options.join('/')}`,
      )
      .join(', ');
    return `${kind} (${spec.words}; ${params})`;
  }).join('; ');
}
