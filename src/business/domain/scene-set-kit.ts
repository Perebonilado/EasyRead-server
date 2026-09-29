/**
 * The scenery pieces L3 adds (studio-scenery-plan §5.3, §5.7): the
 * clutter that makes a place busy and lived in (poles and wires, bins,
 * plastic chairs, a laundry line, a generator, a parked car, an okada,
 * water drums, a bicycle, a street sign, a hydrant, clay pots, a
 * woodpile), and the pieces the packs need: an ancient riverside's
 * obelisk, temple columns, reeds and palm grove; a city's subway
 * entrance, streetlamp, taxi and hot-dog cart; a Lagos street's umbrella
 * stall, a danfo parked, a gutter bridge.
 *
 * Each is drawn at its real size in the kit's units (a metre is about
 * 132), so it stands true beside the people wherever it is placed. Signs
 * are shapes only, never words. What sways, flaps or hangs is a segment
 * of its own, and says how (`reacts`); where birds may sit, `roosts`.
 */
import { CLOTH, COATS, KIT_EXTRAS, SET_COLOURS, FIGURE_INK } from './scene-ink';
import { segment } from './scene-set-pieces';
import type { SceneryPiece } from './scene-set-scenery';
import {
  circle,
  flatRect,
  flatShape,
  framed,
  line,
  m,
  palmCrown,
  poly,
  r1,
  rect,
  shadowOf,
  shape,
} from './scene-set-draw';

export const KIT_KINDS = [
  // Clutter.
  'poles',
  'bin',
  'plastic chair',
  'laundry line',
  'generator',
  'parked car',
  'okada',
  'water drum',
  'bicycle',
  'street sign',
  'hydrant',
  'clay pots',
  'woodpile',
  // An ancient riverside's.
  'obelisk',
  'columns',
  'reeds',
  'palm grove',
  // A city's.
  'subway entrance',
  'streetlamp',
  'taxi',
  'hot dog cart',
  // A Lagos street's.
  'umbrella stall',
  'danfo',
  'gutter bridge',
] as const;
export type KitKind = (typeof KIT_KINDS)[number];
export const isKitKind = (kind: string): kind is KitKind =>
  (KIT_KINDS as readonly string[]).includes(kind);
/** Of them, what lies flat on the ground, and is ground. */
export const KIT_FLAT: readonly KitKind[] = ['gutter bridge'];

const WOOD = SET_COLOURS.wood;
const WOOD_DARK = KIT_EXTRAS['dark wood'];
const PLANK = KIT_EXTRAS.plank;
const LEAF = SET_COLOURS.leaves;
const LEAF_DARK = KIT_EXTRAS['dark leaf'];
const PAPER = KIT_EXTRAS.paper;
const STEEL = KIT_EXTRAS.steel;
const GLASS = KIT_EXTRAS.glass;
const GOLD = KIT_EXTRAS.gold;
const CONCRETE = KIT_EXTRAS.concrete;
const STONE = SET_COLOURS.stone;
const DARK = '#3a3740';
const TYRE = '#3b3440';
const TERRACOTTA = SET_COLOURS.roofs;

/** A wheel side on: its tyre, its rim, its hub. */
const wheel = (x: number, r: number, rim = STEEL) =>
  circle(x, -r, r, TYRE) +
  circle(x, -r, r * 0.55, rim) +
  circle(x, -r, r * 0.16, DARK);

/** A car side on, `long` metres long: its body, its windows and its wheels; a taxi's sign on its roof. */
function car(colour: string, long: number, taxi: boolean): string {
  const L = m(long) / 2;
  const sill = -m(0.35);
  const belt = -m(0.95);
  const roof = -m(1.42);
  const body = poly([
    [-L, sill],
    [-L, belt + 18],
    [-L + m(0.35), belt],
    [-L + m(1.15), belt],
    [-L + m(1.55), roof],
    [L - m(1.35), roof],
    [L - m(0.8), belt],
    [L - m(0.15), belt + 10],
    [L, belt + 30],
    [L, sill],
  ]);
  const glass = poly([
    [-L + m(1.3), belt - 6],
    [-L + m(1.62), roof + 10],
    [-2, roof + 10],
    [-2, belt - 6],
  ]);
  const glass2 = poly([
    [8, belt - 6],
    [8, roof + 10],
    [L - m(1.42), roof + 10],
    [L - m(0.95), belt - 6],
  ]);
  return (
    shadowOf(L * 0.9) +
    shape(body, colour) +
    shape(glass, GLASS) +
    shape(glass2, GLASS) +
    line(
      `M${r1(-L + 20)},${r1(belt + 40)} L${r1(L - 20)},${r1(belt + 40)}`,
      FIGURE_INK,
      2,
    ) +
    (taxi
      ? rect(-m(0.3), roof - m(0.2), m(0.6), m(0.2), PAPER, 4) +
        flatRect(-L + 10, belt + 50, 2 * L - 20, 14, DARK)
      : '') +
    rect(L - 30, belt + 26, 26, 16, GOLD, 4) +
    wheel(-L + m(0.85), m(0.34)) +
    wheel(L - m(0.85), m(0.34))
  );
}

/**
 * A piece of the kit's added scenery, drawn; `colour` is its own where it
 * has one (a car's, a chair's, a drum's), else its usual.
 */
export function drawKit(kind: KitKind, colour?: string): SceneryPiece {
  switch (kind) {
    case 'poles': {
      // A wooden electricity pole with its crossarm, insulators and a
      // transformer, and its wires sagging away to either side beyond its
      // frame, as a street's run from pole to pole. Birds sit on them.
      const top = -m(8);
      const arm = top + 44;
      const wires = [-60, 0, 60]
        .map((x, k) => {
          const y = arm - 14 + (k === 1 ? -30 : 0);
          return (
            line(
              `M${x},${r1(y)} Q${r1(x - 460)},${r1(y + 150 + k * 20)} ${r1(x - 920)},${r1(y + 4)}`,
              FIGURE_INK,
              2.2,
            ) +
            line(
              `M${x},${r1(y)} Q${r1(x + 460)},${r1(y + 150 + k * 20)} ${r1(x + 920)},${r1(y + 4)}`,
              FIGURE_INK,
              2.2,
            )
          );
        })
        .join('');
      return {
        ...framed(
          shadowOf(20) +
            wires +
            shape(
              `M-13,0 L-9,${r1(top)} L9,${r1(top)} L13,0 Z`,
              colour ?? WOOD,
            ) +
            rect(-78, arm, 156, 14, WOOD_DARK) +
            [-60, 60]
              .map((x) => rect(x - 5, arm - 14, 10, 14, PAPER, 3))
              .join('') +
            rect(-5, top - 30, 10, 14, PAPER, 3) +
            rect(12, arm + 110, 44, 60, STEEL, 4) +
            line(`M34,${r1(arm + 110)} L20,${r1(arm + 10)}`, FIGURE_INK, 2),
          [-80, top - 30, 160, -top + 30],
        ),
        roosts: [
          [-60, r1(arm - 14)],
          [0, r1(top - 30)],
          [60, r1(arm - 14)],
          [-460, r1(arm + 110)],
          [480, r1(arm + 120)],
        ],
      };
    }
    case 'bin': {
      // A street bin: its body, its lid and a band round it.
      const c = colour ?? LEAF_DARK;
      return framed(
        shadowOf(40) +
          shape(`M-34,0 L-38,${r1(-m(0.9))} L38,${r1(-m(0.9))} L34,0 Z`, c) +
          flatRect(-36, -m(0.62), 72, 10, KIT_EXTRAS.leaf) +
          rect(-42, -m(1.0), 84, m(0.1), c, 6) +
          rect(-10, -m(1.06), 20, 10, DARK, 3),
        [-42, -m(1.06), 84, m(1.06)],
      );
    }
    case 'plastic chair': {
      // A plastic chair all of one piece: its back with its slots, its
      // seat, its legs splayed.
      const c = colour ?? CLOTH.white;
      return {
        ...framed(
          shadowOf(40) +
            shape('M-36,0 L-28,-58 L-20,-58 L-24,0 Z', c) +
            shape('M36,0 L28,-58 L20,-58 L24,0 Z', c) +
            shape('M-40,-66 L40,-66 L36,-54 L-36,-54 Z', c) +
            shape('M-34,-62 L-38,-108 Q0,-120 38,-108 L34,-62 Z', c) +
            [-16, 0, 16]
              .map((x) => rect(x - 3, -102, 6, 26, shadeOf(c), 3))
              .join(''),
          [-40, -118, 80, 118],
        ),
        seat: 60,
      };
    }
    case 'laundry line': {
      // Two posts and the line sagging between them, the washing pegged
      // on it, each piece flapping on the wind about its peg.
      const w = m(1.5);
      const top = -m(1.8);
      const sag = (x: number) => top + 12 + 30 * (1 - (x / w) ** 2);
      const cloth: [number, number, number, string][] = [
        [-130, 70, 90, CLOTH.blue],
        [-30, 60, 70, CLOTH.yellow],
        [60, 64, 100, CLOTH.red],
        [150, 44, 56, PAPER],
      ];
      return {
        ...framed(
          shadowOf(w) +
            rect(-w - 5, top, 10, -top, WOOD_DARK) +
            rect(w - 5, top, 10, -top, WOOD_DARK) +
            line(
              `M${r1(-w)},${r1(top + 12)} Q0,${r1(top + 72)} ${r1(w)},${r1(top + 12)}`,
              FIGURE_INK,
              2,
            ) +
            cloth
              .map(([x, cw, ch, c], k) =>
                segment(
                  k,
                  [x, r1(sag(x))],
                  shape(
                    poly([
                      [x - cw / 2, sag(x - cw / 2)],
                      [x + cw / 2, sag(x + cw / 2)],
                      [x + cw / 2 - 4, sag(x + cw / 2) + ch],
                      [x - cw / 2 + 4, sag(x - cw / 2) + ch],
                    ]),
                    c,
                  ),
                ),
              )
              .join(''),
          [-w - 5, top, 2 * w + 10, -top],
        ),
        reacts: { as: 'flag', len: 80 },
        roosts: [[r1(-w), r1(top)]],
      };
    }
    case 'generator': {
      // A petrol generator in its frame: its tank, its panel of knobs and
      // its exhaust.
      const c = colour ?? CLOTH.red;
      const W = m(0.55);
      const H = m(0.72);
      return framed(
        shadowOf(W) +
          rect(-W, -H, 2 * W, H - 8, DARK, 6) +
          rect(-W + 10, -H + 10, 2 * W - 20, H - 30, c, 4) +
          rect(-W + 20, -H + 22, W * 0.8, H * 0.4, STEEL, 3) +
          [0, 1, 2]
            .map((k) => circle(-W + 38 + k * 22, -H + 52, 6, DARK))
            .join('') +
          rect(W * 0.2, -H - 12, W * 0.5, 14, c, 4) +
          rect(W - 20, -H * 0.6, 26, 12, DARK, 3) +
          wheel(-W + 16, 12) +
          wheel(W - 16, 12),
        [-W, -H - 12, 2 * W + 10, H + 12],
      );
    }
    case 'parked car':
      return framed(car(colour ?? CLOTH.blue, 4.2, false), [
        -m(2.1),
        -m(1.45),
        m(4.2),
        m(1.45),
      ]);
    case 'taxi':
      return framed(car(colour ?? CLOTH.yellow, 4.4, true), [
        -m(2.2),
        -m(1.65),
        m(4.4),
        m(1.65),
      ]);
    case 'okada': {
      // A motorbike on its stand: two wheels, its frame and tank, its
      // seat, its handlebars and its lamp.
      const c = colour ?? CLOTH.red;
      const L = m(0.95);
      const r = m(0.3);
      return framed(
        shadowOf(L) +
          wheel(-L + r, r) +
          wheel(L - r, r) +
          line(
            `M${r1(-L + r)},${r1(-r)} L${r1(-m(0.1))},${r1(-m(0.62))} L${r1(L - r)},${r1(-r)}`,
            FIGURE_INK,
            7,
          ) +
          line(
            `M${r1(-L + r)},${r1(-r)} L${r1(-m(0.1))},${r1(-m(0.62))} L${r1(L - r)},${r1(-r)}`,
            DARK,
            3,
          ) +
          shape(
            `M${r1(-m(0.35))},${r1(-m(0.62))} Q${r1(-m(0.1))},${r1(-m(0.86))} ${r1(m(0.3))},${r1(-m(0.72))} L${r1(m(0.2))},${r1(-m(0.55))} Z`,
            c,
          ) +
          rect(-m(0.75), -m(0.76), m(0.5), m(0.1), DARK, 8) +
          line(
            `M${r1(m(0.42))},${r1(-m(0.6))} L${r1(m(0.62))},${r1(-m(1.08))} L${r1(m(0.5))},${r1(-m(1.12))}`,
            FIGURE_INK,
            4,
          ) +
          circle(m(0.7), -m(0.9), 12, GOLD),
        [-L, -m(1.15), 2 * L, m(1.15)],
      );
    }
    case 'water drum': {
      const c = colour ?? CLOTH.blue;
      const W = m(0.3);
      const H = m(0.9);
      return framed(
        shadowOf(W) +
          rect(-W, -H, 2 * W, H, c, 14) +
          [0.3, 0.55, 0.8]
            .map((k) => flatRect(-W, -H * k, 2 * W, 5, shadeOf(c)))
            .join('') +
          rect(-W * 0.4, -H - 8, W * 0.8, 10, shadeOf(c), 4),
        [-W, -H - 8, 2 * W, H + 8],
      );
    }
    case 'bicycle': {
      const r = m(0.33);
      const L = m(0.85);
      const c = colour ?? CLOTH.teal;
      const hubL: [number, number] = [-L + r, -r];
      const hubR: [number, number] = [L - r, -r];
      const seat: [number, number] = [-m(0.12), -m(0.92)];
      const bars: [number, number] = [m(0.38), -m(0.98)];
      const crank: [number, number] = [-m(0.02), -r];
      const spokes = (x: number) =>
        line(
          `M${r1(x - r * 0.8)},${r1(-r)} L${r1(x + r * 0.8)},${r1(-r)} M${r1(x)},${r1(-r * 1.8)} L${r1(x)},${r1(-r * 0.2)}`,
          FIGURE_INK,
          1.4,
        );
      const frame = `M${r1(hubL[0])},${r1(hubL[1])} L${r1(seat[0])},${r1(seat[1] + 20)} L${r1(crank[0])},${r1(crank[1])} Z M${r1(seat[0])},${r1(seat[1] + 20)} L${r1(bars[0] - 10)},${r1(bars[1] + 20)} L${r1(crank[0])},${r1(crank[1])} M${r1(bars[0] - 10)},${r1(bars[1] + 20)} L${r1(hubR[0])},${r1(hubR[1])}`;
      return framed(
        shadowOf(L) +
          circle(hubL[0], hubL[1], r, 'none') +
          circle(hubR[0], hubR[1], r, 'none') +
          spokes(hubL[0]) +
          spokes(hubR[0]) +
          line(frame, FIGURE_INK, 7) +
          line(frame, c, 3.4) +
          rect(seat[0] - 22, seat[1], 44, 10, DARK, 5) +
          line(
            `M${r1(bars[0] - 10)},${r1(bars[1] + 20)} L${r1(bars[0])},${r1(bars[1])} L${r1(bars[0] + 24)},${r1(bars[1] - 4)}`,
            FIGURE_INK,
            4,
          ),
        [-L, -m(1.05), 2 * L, m(1.05)],
      );
    }
    case 'street sign': {
      // A pole with a plate on it: an arrow, a bar, a ring; never words.
      const c = colour ?? CLOTH.green;
      const top = -m(2.6);
      return framed(
        shadowOf(14) +
          rect(-5, top + 40, 10, -top - 40, STEEL, 2) +
          rect(-70, top, 140, 64, c, 6) +
          flatShape(
            `M-50,${r1(top + 26)} L22,${r1(top + 26)} L22,${r1(top + 14)} L52,${r1(top + 32)} L22,${r1(top + 50)} L22,${r1(top + 38)} L-50,${r1(top + 38)} Z`,
            PAPER,
          ),
        [-70, top, 140, -top],
      );
    }
    case 'hydrant': {
      const c = colour ?? KIT_EXTRAS['bright red'];
      const H = m(0.75);
      return framed(
        shadowOf(30) +
          rect(-34, -14, 68, 14, c, 3) +
          rect(-24, -H + 20, 48, H - 30, c, 6) +
          rect(-40, -H * 0.62, 80, 22, c, 8) +
          shape(
            `M-26,${r1(-H + 22)} Q0,${r1(-H - 12)} 26,${r1(-H + 22)} Z`,
            c,
          ) +
          rect(-6, -H - 8, 12, 12, c, 3) +
          circle(0, -H * 0.62 + 11, 6, GOLD),
        [-40, -H - 8, 80, H + 8],
      );
    }
    case 'clay pots': {
      // A tall jar, a round pot and a small one, together.
      const jar =
        shape(
          `M-40,0 Q-70,${r1(-m(0.3))} -50,${r1(-m(0.52))} Q-40,${r1(-m(0.62))} -46,${r1(-m(0.68))} L-26,${r1(-m(0.68))} Q-32,${r1(-m(0.62))} -22,${r1(-m(0.52))} Q-2,${r1(-m(0.3))} -32,0 Z`,
          TERRACOTTA,
        ) + rect(-50, -m(0.72), 28, 10, COATS.chestnut, 3);
      const round =
        shape(
          `M10,0 Q-14,${r1(-m(0.2))} 14,${r1(-m(0.36))} L42,${r1(-m(0.36))} Q70,${r1(-m(0.2))} 46,0 Z`,
          COATS.tan,
        ) + flatRect(6, -m(0.22), 44, 5, COATS.chestnut);
      const small = shape(
        `M58,0 Q48,-28 62,-38 L74,-38 Q88,-28 78,0 Z`,
        COATS.chestnut,
      );
      return framed(shadowOf(60) + jar + round + small, [
        -70,
        -m(0.72),
        160,
        m(0.72),
      ]);
    }
    case 'woodpile': {
      // Logs stacked with their cut ends to the viewer, ring in ring.
      const r = 17;
      const ends: string[] = [];
      [4, 3, 2].forEach((n, row) => {
        for (let k = 0; k < n; k += 1) {
          const x = (k - (n - 1) / 2) * 2 * r;
          const y = -r - row * r * 1.72;
          ends.push(circle(x, y, r, PLANK) + circle(x, y, r * 0.45, 'none'));
        }
      });
      return framed(shadowOf(80) + ends.join(''), [
        -4 * r,
        -r * 5.5,
        8 * r,
        r * 5.5,
      ]);
    }
    case 'obelisk': {
      // A tall stone needle on its base, its tip of gold, a few marks
      // down its face (shapes, never writing).
      const H = m(8);
      const b = m(0.55);
      const t = m(0.36);
      const tip = m(0.55);
      const marks = Array.from({ length: 6 }, (_, k) => {
        const y = -m(1.4) - k * m(0.95);
        return (
          flatRect(-t * 0.5, y, t, 8, shadeOf(STONE, 0.86), 3) +
          `<ellipse cx="0" cy="${r1(y - 26)}" rx="${r1(t * 0.35)}" ry="10" fill="none" stroke="${shadeOf(STONE, 0.8)}" stroke-width="4"/>`
        );
      }).join('');
      return {
        ...framed(
          shadowOf(b + 30) +
            rect(-b - 30, -m(0.5), 2 * b + 60, m(0.5), STONE, 2) +
            shape(
              poly([
                [-b, -m(0.5)],
                [-t, -H + tip],
                [t, -H + tip],
                [b, -m(0.5)],
              ]),
              COATS.cream,
            ) +
            marks +
            shape(
              poly([
                [-t, -H + tip],
                [0, -H],
                [t, -H + tip],
              ]),
              GOLD,
            ),
          [-b - 30, -H, 2 * b + 60, H],
        ),
        roosts: [[0, r1(-H)]],
      };
    }
    case 'columns': {
      // Three stone columns of a temple still standing, the beam across
      // their tops, on steps.
      const H = m(6);
      const r = m(0.34);
      const at = [-m(2), 0, m(2)];
      const column = (x: number) =>
        rect(x - r, -H + m(0.6), 2 * r, H - m(1.05), COATS.cream, 0) +
        [-0.5, 0, 0.5]
          .map((k) =>
            flatRect(
              x + k * r - 3,
              -H + m(0.7),
              6,
              H - m(1.2),
              shadeOf(COATS.cream, 0.9),
            ),
          )
          .join('') +
        rect(x - r * 1.4, -H + m(0.45), r * 2.8, m(0.2), STONE, 2) +
        rect(x - r * 1.3, -m(0.65), r * 2.6, m(0.2), STONE, 2);
      return {
        ...framed(
          shadowOf(m(2.8)) +
            rect(-m(3), -m(0.45), m(6), m(0.25), STONE, 1) +
            rect(-m(3.2), -m(0.22), m(6.4), m(0.22), STONE, 1) +
            at.map(column).join('') +
            rect(-m(2.8), -H, m(5.6), m(0.48), COATS.cream, 1) +
            flatRect(
              -m(2.8),
              -H + m(0.2),
              m(5.6),
              5,
              shadeOf(COATS.cream, 0.88),
            ),
          [-m(3.2), -H, m(6.4), H],
        ),
        roosts: [
          [r1(-m(2)), r1(-H)],
          [0, r1(-H)],
          [r1(m(2)), r1(-H)],
        ],
      };
    }
    case 'reeds': {
      // A clump of reeds and papyrus at the water's edge, bending as one
      // on the wind about their roots.
      const H = m(1.9);
      const blades = [-44, -30, -14, 0, 14, 28, 42]
        .map((x, k) => {
          const h = H * (0.62 + ((k * 37) % 5) * 0.08);
          const lean = (k - 3) * 9;
          return shape(
            `M${x - 5},0 Q${x + lean * 0.4},${r1(-h * 0.6)} ${x + lean},${r1(-h)} Q${x + lean * 0.3 + 6},${r1(-h * 0.55)} ${x + 5},0 Z`,
            k % 2 ? LEAF : LEAF_DARK,
          );
        })
        .join('');
      const heads = [
        [-20, -H * 0.94],
        [22, -H],
        [-2, -H * 0.82],
      ]
        .map(
          ([x, y]) =>
            line(`M${x},${r1(y + 70)} L${x},${r1(y)}`, LEAF_DARK, 3) +
            shape(
              `M${x},${r1(y)} L${x - 22},${r1(y - 26)} Q${x},${r1(y - 38)} ${x + 22},${r1(y - 26)} Z`,
              KIT_EXTRAS.leaf,
            ),
        )
        .join('');
      return {
        ...framed(segment(0, [0, 0], blades + heads), [
          -66,
          -H - 40,
          132,
          H + 40,
        ]),
        lives: 'sway',
        reacts: { as: 'sway', len: r1(H) },
      };
    }
    case 'palm grove': {
      // Three palms of different heights, leaning apart, each crown its
      // own, turning on the wind at the top of its trunk.
      const palms: [number, number, number][] = [
        [-m(1.6), m(6.2), -0.06],
        [m(0.2), m(8), 0.05],
        [m(1.9), m(5.4), 0.12],
      ];
      const k = 0.9;
      let out = shadowOf(m(2.6));
      palms.forEach(([x, h, lean], n) => {
        const topX = x + lean * h;
        out +=
          shape(
            `M${r1(x - 16)},0 Q${r1(x + lean * h * 0.3)},${r1(-h * 0.55)} ${r1(topX - 8)},${r1(-h)} L${r1(topX + 10)},${r1(-h + 4)} Q${r1(x + lean * h * 0.3 + 18)},${r1(-h * 0.55)} ${r1(x + 16)},0 Z`,
            WOOD,
          ) +
          segment(
            n,
            [r1(topX), r1(-h)],
            palmCrown(topX, -h, k, LEAF, LEAF_DARK, WOOD_DARK),
          );
      });
      return {
        ...framed(out, [-m(3.2), -m(8) - 60, m(6.6), m(8) + 60]),
        lives: 'sway',
        reacts: { as: 'sway', len: r1(m(8)) },
        roosts: palms.map(([x, h, lean]) => [r1(x + lean * h), r1(-h - 40)]),
      };
    }
    case 'subway entrance': {
      // Stairs going down under the street, railed each side, and a lamp
      // post with its globe at each corner.
      const W = m(1.1);
      const rail = -m(1.05);
      const globe = (x: number) =>
        rect(x - 5, -m(2.5), 10, m(2.5), DARK, 2) +
        circle(x, -m(2.6), 20, CLOTH.green);
      const bars = (x0: number, x1: number) =>
        line(
          Array.from({ length: 5 }, (_, k) => {
            const x = x0 + ((x1 - x0) * (k + 0.5)) / 5;
            return `M${r1(x)},0 L${r1(x)},${r1(rail)}`;
          }).join(' '),
          FIGURE_INK,
          2.4,
        );
      return framed(
        rect(-W, -m(0.9), 2 * W, m(0.9), DARK, 0) +
          [0.2, 0.42, 0.62, 0.8]
            .map((k) =>
              flatRect(-W + 10, -m(0.9) * (1 - k), 2 * W - 20, 6, '#5f5d66'),
            )
            .join('') +
          rect(-W - m(0.5), rail, m(0.5), 10, STEEL, 3) +
          rect(W, rail, m(0.5), 10, STEEL, 3) +
          bars(-W - m(0.5), -W) +
          bars(W, W + m(0.5)) +
          globe(-W - m(0.5)) +
          globe(W + m(0.5)),
        [-W - m(0.5) - 20, -m(2.6) - 20, 2 * W + m(1) + 40, m(2.6) + 20],
      );
    }
    case 'streetlamp': {
      // A lamp on a post with a curved arm, its lamp hanging from it and
      // swinging when the street is bumped.
      const H = m(4.6);
      const c = colour ?? DARK;
      return {
        ...framed(
          shadowOf(26) +
            rect(-18, -18, 36, 18, c, 3) +
            rect(-6, -H, 12, H - 16, c, 2) +
            line(
              `M0,${r1(-H)} Q40,${r1(-H - 50)} 110,${r1(-H + 10)}`,
              FIGURE_INK,
              10,
            ) +
            line(`M0,${r1(-H)} Q40,${r1(-H - 50)} 110,${r1(-H + 10)}`, c, 5) +
            segment(
              0,
              [110, r1(-H + 10)],
              line(`M110,${r1(-H + 10)} L110,${r1(-H + 30)}`, FIGURE_INK, 2.4) +
                shape(
                  `M92,${r1(-H + 30)} L128,${r1(-H + 30)} L120,${r1(-H + 66)} L100,${r1(-H + 66)} Z`,
                  c,
                ) +
                rect(100, -H + 40, 20, 20, GOLD, 3),
            ),
          [-26, -H - 40, 160, H + 40],
        ),
        reacts: { as: 'hang', len: 36 },
        roosts: [[40, r1(-H - 36)]],
      };
    }
    case 'hot dog cart': {
      // A steel cart on two wheels under its striped umbrella, flapping.
      const W = m(0.9);
      const top = -m(0.95);
      const c = colour ?? CLOTH.red;
      const stripes = [-3, -1, 1, 3]
        .map((k) =>
          shape(
            `M${r1(k * 34 - 34)},${r1(-m(2.2))} Q${r1(k * 34)},${r1(-m(2.55))} ${r1(k * 34 + 34)},${r1(-m(2.2))} Z`,
            k % 4 === 1 || k % 4 === -3 ? PAPER : c,
          ),
        )
        .join('');
      return {
        ...framed(
          shadowOf(W) +
            rect(-W, top, 2 * W, -top - 30, STEEL, 6) +
            rect(-W + 14, top + 14, W - 20, -top - 60, PAPER, 3) +
            rect(10, top + 14, W - 24, 30, CLOTH.yellow, 3) +
            rect(-W - 10, top - 12, 2 * W + 20, 14, STEEL, 4) +
            line(`M0,${r1(top - 12)} L0,${r1(-m(2.2))}`, FIGURE_INK, 5) +
            wheel(-W + 40, 30) +
            wheel(W - 40, 30) +
            segment(
              0,
              [0, r1(-m(2.2))],
              shape(
                `M-150,${r1(-m(2.2))} Q0,${r1(-m(2.62))} 150,${r1(-m(2.2))} Z`,
                c,
              ) + stripes,
            ),
          [-150, -m(2.62), 300, m(2.62)],
        ),
        reacts: { as: 'flag', len: 60 },
        counter: true,
      };
    }
    case 'umbrella stall': {
      // A big market umbrella in its colours over a table of wares, and
      // the stool the seller sits on.
      const R = m(1.3);
      const top = -m(2.5);
      const colours = [
        CLOTH.red,
        CLOTH.yellow,
        CLOTH.blue,
        CLOTH.green,
        CLOTH.orange,
        CLOTH.yellow,
      ];
      const panels = colours
        .map((c, k) => {
          const a = -R + (k * 2 * R) / colours.length;
          const b = a + (2 * R) / colours.length;
          const mid = (a + b) / 2;
          return shape(
            `M${r1(a)},${r1(top + 60)} Q${r1(mid)},${r1(top + 10 - (1 - Math.abs(mid) / R) * 50)} ${r1(b)},${r1(top + 60)} Q${r1(mid)},${r1(top + 50)} ${r1(a)},${r1(top + 60)} Z`,
            colour && k % 2 ? colour : c,
          );
        })
        .join('');
      const wares = [-70, -44, -18, 8, 34, 60]
        .map((x, k) =>
          circle(
            x,
            -m(0.82) - 12,
            12,
            [CLOTH.orange, CLOTH.green, KIT_EXTRAS['bright red'], CLOTH.yellow][
              k % 4
            ],
          ),
        )
        .join('');
      return {
        ...framed(
          shadowOf(R * 0.8) +
            line(`M0,0 L0,${r1(top + 20)}`, FIGURE_INK, 7) +
            line(`M0,0 L0,${r1(top + 20)}`, PAPER, 3) +
            rect(-m(0.7), -m(0.8), m(1.4), m(0.1), PLANK, 3) +
            rect(-m(0.62), -m(0.72), m(1.24), m(0.72) - 4, WOOD, 2) +
            wares +
            rect(m(0.8), -m(0.45), m(0.35), m(0.08), CLOTH.blue, 3) +
            line(
              `M${r1(m(0.84))},0 L${r1(m(0.84))},${r1(-m(0.4))} M${r1(m(1.1))},0 L${r1(m(1.1))},${r1(-m(0.4))}`,
              FIGURE_INK,
              3,
            ) +
            segment(
              0,
              [0, r1(top + 20)],
              `<path d="M${r1(-R)},${r1(top + 60)} Q0,${r1(top - 50)} ${r1(R)},${r1(top + 60)} Z" fill="${colour ?? CLOTH.red}"/>${panels}`,
            ),
          [-R, top - 50, 2 * R, -top + 50],
        ),
        reacts: { as: 'flag', len: 70 },
        counter: true,
      };
    }
    case 'danfo': {
      // A danfo parked: the yellow minibus with its black stripes, its
      // windows, and its roof rack loaded.
      const L = m(2.5);
      const c = colour ?? CLOTH.yellow;
      const top = -m(2.05);
      return framed(
        shadowOf(L * 0.9) +
          shape(
            poly([
              [-L, -m(0.35)],
              [-L, top + 30],
              [-L + 20, top],
              [L - m(0.8), top],
              [L - m(0.2), top + m(0.8)],
              [L, top + m(0.9)],
              [L, -m(0.35)],
            ]),
            c,
          ) +
          flatRect(-L, -m(0.95), 2 * L, 16, DARK) +
          flatRect(-L, -m(0.75), 2 * L, 10, DARK) +
          [0, 1, 2, 3]
            .map((k) =>
              rect(-L + 30 + k * m(0.95), top + 24, m(0.8), m(0.62), GLASS, 4),
            )
            .join('') +
          shape(
            poly([
              [L - m(0.95), top + 24],
              [L - m(0.72), top + 24],
              [L - m(0.28), top + m(0.8)],
              [L - m(0.95), top + m(0.8)],
            ]),
            GLASS,
          ) +
          rect(-L + 40, top - 20, 2 * L - m(1.2), 14, STEEL, 3) +
          rect(-L + 70, top - 58, 90, 40, CLOTH.blue, 6) +
          rect(-L + 180, top - 46, 120, 28, CLOTH.red, 6) +
          rect(L - 24, -m(0.9), 24, 18, GOLD, 4) +
          wheel(-L + m(0.8), m(0.4)) +
          wheel(L - m(0.8), m(0.4)),
        [-L, top - 58, 2 * L, -top + 58],
      );
    }
    case 'gutter bridge': {
      // An open drain along the street and the slab laid over it to cross:
      // flat on the ground, and ground.
      const W = m(1.9);
      return {
        ...framed(
          rect(-W, -m(0.12), 2 * W, m(0.12), '#5f5d66', 0) +
            flatRect(-W, -m(0.12), 2 * W, 6, '#8d8f96') +
            rect(-m(0.6), -m(0.16), m(1.2), m(0.16), CONCRETE, 3) +
            flatRect(-m(0.6), -m(0.07), m(1.2), 4, shadeOf(CONCRETE)),
          [-W, -m(0.16), 2 * W, m(0.16)],
        ),
        flat: true,
      };
    }
  }
}

/** A colour a little darker, for a band or a mark. */
function shadeOf(hex: string, k = 0.86): string {
  const n = parseInt(hex.slice(1), 16);
  return `#${[n >> 16, (n >> 8) & 255, n & 255]
    .map((v) =>
      Math.round(v * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
