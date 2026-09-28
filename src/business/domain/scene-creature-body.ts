/**
 * The creature kit's bodies (scene-creature): a creature drawn from its
 * spec, facing the viewer as the kit's people do, in the kit's units, its
 * feet (or its body, or the air below it) on the ground at y = 0. It is
 * built as the animal kit builds an animal (scene-animal-body's `Built`),
 * so the animal kit's own drawing (scene-animal-draw's `drawBuilt`) puts
 * the kit's eyes, feelings and mouths on it, and moves it on the stage's
 * clock: each part that moves in a group of its own about its joint, with
 * the artist rig's classes (rig-arm-r and rig-arm-l turn as the kit's
 * people's arms do, rig-leg-a and rig-leg-b step, rig-flap, rig-tail,
 * rig-ear, rig-head), every pivot written here, nothing measured.
 *
 * Its face is set by code: in the upper third of its body, or on its head
 * when it has one, the eyes as far apart as the body is wide there, so it
 * reads at card size and never shrinks into a small oval on its belly.
 */
import {
  CREATURE_PAINT,
  CREATURE_TALL,
  type CreatureBody,
  type CreatureSpec,
} from './scene-creature';
import {
  CLOTH,
  FIGURE_INK,
  KIT_EXTRAS,
  flat,
  inked,
  line,
  shade,
} from './scene-ink';
import {
  LINE,
  eyeLineOf,
  type AnimalPose,
  type Built,
} from './scene-animal-body';
import {
  add,
  blob,
  blobSamples,
  circle,
  ellipse,
  ellipsePoints,
  lerp,
  limb,
  path,
  pivoted,
  placed,
  polar,
  pt,
  r1,
  tapered,
  type P,
} from './scene-animal-shapes';

const SHOE = KIT_EXTRAS.shoe;
const GOLD = KIT_EXTRAS.gold;
const BONE = '#f1e2c4';
const GLOVE = CLOTH.white;
const CARROT = CLOTH.orange;
const GLASS = KIT_EXTRAS.glass;
const HAT = '#3a3740';

/** How wide each body is for how tall, before its build. */
const ASPECT: Record<CreatureBody, number> = {
  egg: 0.78,
  pear: 0.86,
  ball: 1,
  bean: 0.74,
  box: 0.84,
  cone: 0.82,
  cloud: 1.3,
  flame: 0.74,
  star: 1.02,
  column: 0.5,
  drop: 0.8,
  stack: 1,
  ghost: 0.76,
};

/** How much wider a build is. */
const GIRTH = { slim: 0.86, average: 1, stout: 1.2 } as const;

/** Where its eyes are on a body with no head, as a share of its half height up from its middle. */
const FACE_UP: Record<CreatureBody, number> = {
  egg: 0.36,
  pear: 0.3,
  ball: 0.3,
  bean: 0.36,
  box: 0.36,
  cone: 0.02,
  cloud: 0.14,
  flame: -0.02,
  star: 0.14,
  column: 0.5,
  drop: 0.02,
  stack: 0,
  ghost: 0.34,
};

/** The kit's eyes at the face's scale: a pair, with their gap, is this wide. */
const PAIR_WIDE = 59;
const ONE_WIDE = 30;
const THREE_WIDE = 74;
const THREE_DX = 22;

// ── The body's shape ───────────────────────────────────────────────────────

/** A body's outline: its closed curves, how round, and every point along it. */
interface Shape {
  loops: P[][];
  tension: number;
  /** Points along its outline, as drawn: for its width at a height, and its reach. */
  samples: P[];
}

/** A superellipse's points: n 2 an ellipse, higher a rounded box. */
function superellipse(at: P, w: number, h: number, n: number, k = 28): P[] {
  return Array.from({ length: k }, (_, i) => {
    const t = (i / k) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [
      at[0] + w * Math.sign(c) * Math.abs(c) ** (2 / n),
      at[1] + h * Math.sign(s) * Math.abs(s) ** (2 / n),
    ] as P;
  });
}

/** Points round a middle by angle, each at its own share of w and h: y down, 0 to the right. */
function spoked(at: P, w: number, h: number, shares: [number, number][]): P[] {
  return shares.map(([x, y]) => [at[0] + x * w, at[1] + y * h] as P);
}

/**
 * A body's shape about its middle `B`, `w` half as wide and `h` half as
 * tall: each kind its own curve through a few points.
 */
function bodyShape(kind: CreatureBody, B: P, w: number, h: number): Shape {
  let loops: P[][];
  let tension = 1;
  switch (kind) {
    case 'egg':
    case 'pear': {
      // Wider below the middle: a pear more so.
      const more = kind === 'pear' ? 0.34 : 0.14;
      loops = [
        Array.from({ length: 16 }, (_, i) => {
          const t = (i / 16) * 2 * Math.PI;
          const f = (1 + more * Math.sin(t)) / (1 + more);
          return [B[0] + w * Math.cos(t) * f, B[1] + h * Math.sin(t)] as P;
        }),
      ];
      break;
    }
    case 'ball':
      loops = [ellipsePoints(B, w, h, 0, 12)];
      break;
    case 'bean':
      loops = [superellipse(B, w, h, 2.6, 20)];
      break;
    case 'box':
      loops = [superellipse(B, w, h, 7, 32)];
      break;
    case 'column':
      loops = [superellipse(B, w, h, 3.2, 24)];
      break;
    case 'cone':
      tension = 0.8;
      loops = [
        spoked(B, w, h, [
          [0, -1],
          [0.3, -0.6],
          [0.62, 0.2],
          [0.96, 0.78],
          [0.72, 1],
          [0, 1],
          [-0.72, 1],
          [-0.96, 0.78],
          [-0.62, 0.2],
          [-0.3, -0.6],
        ]),
      ];
      break;
    case 'drop':
    case 'flame':
      tension = 0.85;
      loops = [
        spoked(
          B,
          w,
          h,
          kind === 'drop'
            ? [
                [0, -1],
                [0.36, -0.46],
                [0.9, 0.18],
                [0.86, 0.72],
                [0.4, 0.98],
                [-0.4, 0.98],
                [-0.86, 0.72],
                [-0.9, 0.18],
                [-0.36, -0.46],
              ]
            : [
                [0.12, -1],
                [0.4, -0.5],
                [0.8, -0.14],
                [0.94, 0.4],
                [0.7, 0.88],
                [0, 1],
                [-0.7, 0.88],
                [-0.94, 0.4],
                [-0.78, -0.2],
                [-0.52, -0.46],
                [-0.3, -0.78],
                [-0.14, -0.4],
              ],
        ),
      ];
      break;
    case 'star':
      tension = 0.4;
      loops = [
        Array.from({ length: 10 }, (_, i) => {
          const a = ((-90 + i * 36) * Math.PI) / 180;
          const r = i % 2 ? 0.52 : 1;
          return [
            B[0] + Math.cos(a) * w * r,
            B[1] + Math.sin(a) * h * r + h * 0.08,
          ] as P;
        }),
      ];
      break;
    case 'cloud':
      loops = [
        Array.from({ length: 18 }, (_, i) => {
          const t = (i / 18) * 2 * Math.PI;
          const r = i % 2 ? 0.86 : 1.04;
          return [
            B[0] + w * r * Math.cos(t),
            B[1] + h * r * Math.sin(t) * (Math.sin(t) > 0 ? 0.86 : 1),
          ] as P;
        }),
      ];
      break;
    case 'ghost': {
      tension = 0.9;
      const hem: P[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const x = 1 - (i * 2) / 6;
        hem.push([x * 0.96, i % 2 ? 0.8 : 1]);
      }
      loops = [
        spoked(B, w, h, [
          [0.96, 0.1],
          [0.9, -0.5],
          [0.55, -0.9],
          [0, -1],
          [-0.55, -0.9],
          [-0.9, -0.5],
          [-0.96, 0.1],
          ...hem.reverse(),
        ]),
      ];
      break;
    }
    case 'stack': {
      // Two balls, the lower the larger: a snowman's body (its head apart).
      const r1 = h / 1.85;
      const r2 = r1 * 0.74;
      const low: P = [B[0], B[1] + h - r1];
      const up: P = [B[0], low[1] - r1 - r2 * 0.7];
      loops = [
        ellipsePoints(low, r1 * (w / h), r1, 0, 12),
        ellipsePoints(up, r2 * (w / h), r2, 0, 12),
      ];
      break;
    }
  }
  return {
    loops,
    tension,
    samples: loops.flatMap((one) => blobSamples(one, tension, 6)),
  };
}

/** A shape's outline as one path's `d`. */
const dOf = (shape: Shape) =>
  shape.loops.map((one) => blob(one, shape.tension)).join(' ');

/** How far across a shape goes at a height, either side of its middle: half its width there. */
function halfAt(shape: Shape, y: number, x0 = 0): number {
  let most = 0;
  const pts = shape.samples;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    most = Math.max(most, Math.abs(x - x0));
  }
  return most;
}

/** Its top and bottom, as drawn. */
const topOf = (shape: Shape) => Math.min(...shape.samples.map((p) => p[1]));
const bottomOf = (shape: Shape) => Math.max(...shape.samples.map((p) => p[1]));

/** A tufty edge round a shape, for fur: its outline pushed out and in by turns. */
function furOf(shape: Shape, B: P): string {
  return shape.loops
    .map((one) => {
      const smooth = blobSamples(one, shape.tension, 3);
      const tufts = smooth.map((p, i) => {
        const k = i % 2 ? 0.97 : 1.07;
        return [B[0] + (p[0] - B[0]) * k, B[1] + (p[1] - B[1]) * k] as P;
      });
      return blob(tufts, 0.4);
    })
    .join(' ');
}

/** A stable little number from a name and a count: where spots and patches go. */
function seeded(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return (h >>> 0) / 0xffffffff;
  };
}

// ── The pieces ─────────────────────────────────────────────────────────────

/** Where the face is, and what is round it: to keep a texture off it. */
interface FaceZone {
  at: P;
  s: number;
  /** Its half width and the mouth's bottom. */
  half: number;
  top: number;
  bottom: number;
}

/**
 * What is on its body, clipped to it: a crack (a proper jagged line with a
 * darker inner edge), scales, spots, stripes, a panel and rivets, patches,
 * a paler belly, buttons. Kept off its face.
 */
function textureOf(
  spec: CreatureSpec,
  shape: Shape,
  B: P,
  w: number,
  h: number,
  zone: FaceZone | null,
  body: string,
  seed: string,
): string {
  const colour = spec.textureColour ? CREATURE_PAINT[spec.textureColour] : null;
  const below = zone ? zone.bottom + 3 : B[1] - h * 0.3;
  const low = bottomOf(shape);
  const out: string[] = [];
  const random = seeded(`${seed}:texture`);
  switch (spec.texture) {
    case 'crack': {
      // Across its crown and down its left side, over its brows: a jagged
      // line with a thin darker inner edge.
      const top = topOf(shape);
      // Each point a share of how wide it is there, so it keeps on it.
      const d = [
        [0.5, -0.02],
        [0.3, 0.12],
        [0.04, 0.07],
        [-0.24, 0.2],
        [-0.4, 0.13],
        [-0.62, 0.26],
        [-0.78, 0.34],
        [-1.2, 0.4],
      ].map(([x, y]) => {
        const at = top + y * h;
        return [B[0] + x * Math.max(w * 0.12, halfAt(shape, at)), at] as P;
      });
      const branch = [d[3], [d[3][0] + 0.02 * w, d[3][1] + 0.1 * h] as P];
      const inner = d.map(([x, y]) => [x + 0.9, y + 1.1] as P);
      out.push(
        line(`M${inner.map(pt).join(' L')}`, shade(body, 0.7), 1.6),
        line(`M${d.map(pt).join(' L')}`, FIGURE_INK, 2.4),
        line(`M${branch.map(pt).join(' L')}`, FIGURE_INK, 2),
      );
      break;
    }
    case 'scales': {
      const c = colour ?? shade(body, 0.78);
      const step = Math.max(6, w * 0.2);
      for (
        let row = 0, y = below + step * 0.4;
        y < low;
        row += 1, y += step * 0.7
      )
        for (let x = -w - (row % 2 ? step / 2 : 0); x < w + step; x += step)
          out.push(
            line(
              `M${pt([B[0] + x - step * 0.42, y])} Q${pt([B[0] + x, y + step * 0.62])} ${pt([B[0] + x + step * 0.42, y])}`,
              c,
              1.8,
            ),
          );
      break;
    }
    case 'spots':
    case 'patches': {
      const c = colour ?? shade(body, 0.76);
      const n = spec.texture === 'spots' ? 7 : 3;
      let placedCount = 0;
      for (let tries = 0; tries < 60 && placedCount < n; tries += 1) {
        const at: P = [
          B[0] + (random() * 2 - 1) * w * 0.9,
          B[1] + (random() * 2 - 1) * h * 0.9,
        ];
        const r =
          spec.texture === 'spots'
            ? w * (0.08 + random() * 0.08)
            : w * (0.2 + random() * 0.1);
        if (
          zone &&
          Math.abs(at[0] - zone.at[0]) < zone.half + r &&
          at[1] > zone.top - r &&
          at[1] < zone.bottom + r
        )
          continue;
        out.push(
          spec.texture === 'spots'
            ? circle(at, r, flat(c))
            : path(
                blob(
                  ellipsePoints(at, r, r * 0.75, random() * 90, 6).map((p, i) =>
                    lerp(at, p, i % 2 ? 0.8 : 1.05),
                  ),
                  0.9,
                ),
                flat(c),
              ),
        );
        placedCount += 1;
      }
      break;
    }
    case 'stripes': {
      const c = colour ?? shade(body, 0.74);
      const band = Math.max(3, h * 0.09);
      for (let y = below + band; y < low; y += band * 2.4)
        out.push(
          path(
            `M${pt([B[0] - w * 1.2, y])} Q${pt([B[0], y + band * 0.8])} ${pt([B[0] + w * 1.2, y])} L${pt([B[0] + w * 1.2, y + band])} Q${pt([B[0], y + band * 1.8])} ${pt([B[0] - w * 1.2, y + band])} Z`,
            flat(c),
          ),
        );
      break;
    }
    case 'belly': {
      const c = colour ?? shade(body, 1.4);
      const top = Math.max(below - 2, B[1] - h * 0.2);
      out.push(
        ellipse(
          [B[0], (top + low) / 2 + h * 0.08],
          w * 0.6,
          (low - top) / 2 + h * 0.08,
          flat(c),
        ),
      );
      break;
    }
    case 'fur': {
      const c = colour ?? shade(body, 0.8);
      // Tufts over it, short curved strokes, clear of the face.
      for (let k = 0, made = 0; k < 60 && made < 6; k += 1) {
        const at: P = [
          B[0] + (random() * 2 - 1) * w * 0.72,
          B[1] + (random() * 2 - 1) * h * 0.78,
        ];
        if (halfAt(shape, at[1]) - Math.abs(at[0] - B[0]) < w * 0.14) continue;
        if (
          zone &&
          Math.abs(at[0] - zone.at[0]) < zone.half + 4 &&
          at[1] > zone.top - 4 &&
          at[1] < zone.bottom + 4
        )
          continue;
        made += 1;
        const r = w * 0.09;
        out.push(
          line(
            `M${pt(add(at, [-r, 0]))} L${pt(add(at, [-r * 0.4, -r * 0.9]))} L${pt(add(at, [0, 0]))} L${pt(add(at, [r * 0.5, -r * 0.8]))} L${pt(add(at, [r, 0]))}`,
            c,
            1.8,
          ),
        );
      }
      break;
    }
    case 'rivets': {
      // A panel on its chest, a screen, and rivets round it.
      const top = Math.max(below + 1, B[1] - h * 0.25);
      const bottom = Math.min(low - h * 0.12, top + h * 0.6);
      const half = Math.min(w * 0.46, halfAt(shape, (top + bottom) / 2) * 0.62);
      const rx = Math.min(4, half * 0.2);
      out.push(
        `<rect x="${r1(B[0] - half)}" y="${r1(top)}" width="${r1(half * 2)}" height="${r1(bottom - top)}" rx="${r1(rx)}" ${inked(GLASS)}/>`,
        line(
          `M${pt([B[0] - half * 0.6, (top + bottom) / 2])} L${pt([B[0] - half * 0.2, (top + bottom) / 2 - (bottom - top) * 0.18])} L${pt([B[0] + half * 0.15, (top + bottom) / 2 + (bottom - top) * 0.15])} L${pt([B[0] + half * 0.6, (top + bottom) / 2 - (bottom - top) * 0.05])}`,
          CLOTH.teal,
          2,
        ),
      );
      const r = Math.max(1.6, w * 0.04);
      for (const x of [-1, 1])
        for (const y of [top - r * 2.2, bottom + r * 2.2])
          if (y < low - r * 2)
            out.push(circle([B[0] + x * half, y], r, flat(CLOTH.grey)));
      break;
    }
    case 'buttons': {
      const c = colour ?? HAT;
      const r = Math.max(2.2, w * 0.07);
      const from = below + r * 2;
      const gap = Math.max(r * 3, (low - from) / 3.2);
      for (let y = from; y < low - r * 2; y += gap)
        out.push(circle([B[0], y], r, inked(c)));
      break;
    }
    default:
      break;
  }
  return out.join('');
}

/** A kit's arm for a creature: its colour, its width, its hand's size. */
interface ArmMake {
  colour: string;
  hand: string;
  width: number;
  handR: number;
}

/**
 * One arm, hanging and a little out from its shoulder, in the group the
 * rig turns about the shoulder (rig-arm-r to the viewer's right, rig-arm-l
 * to the left), as the kit's people's arms turn.
 */
function armOf(
  spec: CreatureSpec,
  S: P,
  side: 1 | -1,
  len: number,
  make: ArmMake,
  k: number,
): string {
  const cls = `rig-arm rig-arm-${side > 0 ? 'r' : 'l'}`;
  // A snowman's twigs stick out and up; any other arm hangs, a little out.
  const twigs = spec.body === 'stack' && spec.arms === 'stick';
  const E: P = twigs
    ? add(S, [side * len * 0.55, -len * 0.08])
    : add(S, [side * len * 0.4, len * 0.42]);
  const H: P = twigs
    ? add(E, [side * len * 0.4, -len * 0.3])
    : add(E, [side * len * 0.16, len * 0.5]);
  let markup: string;
  switch (spec.arms) {
    case 'stick': {
      const d = `M${pt(S)} L${pt(E)} L${pt(H)}`;
      markup =
        (spec.limbColour ? limb(d, make.colour, 3) : line(d, FIGURE_INK, 3.6)) +
        circle(H, make.handR, inked(make.hand));
      break;
    }
    case 'tentacles': {
      const pts: P[] = [
        S,
        add(S, [side * len * 0.35, len * 0.2]),
        add(S, [side * len * 0.45, len * 0.55]),
        add(S, [side * len * 0.75, len * 0.8]),
        add(S, [side * len * 0.95, len * 0.7]),
      ];
      markup =
        path(
          tapered(pts, make.width * 1.2, make.width * 0.45),
          inked(make.colour),
        ) +
        [0.35, 0.6]
          .map((t) =>
            circle(
              lerp(pts[1], pts[3], t),
              make.width * 0.14,
              flat(shade(make.colour, 1.35)),
            ),
          )
          .join('');
      break;
    }
    case 'wings': {
      const tip = add(S, [side * len * 0.55, len * 0.75]);
      markup =
        path(
          blob(
            [
              add(S, [0, -len * 0.1]),
              add(S, [side * len * 0.45, len * 0.05]),
              tip,
              add(S, [side * len * 0.18, len * 0.5]),
            ],
            0.9,
          ),
          inked(make.colour),
        ) +
        line(
          `M${pt(add(S, [side * len * 0.12, len * 0.12]))} Q${pt(add(S, [side * len * 0.35, len * 0.3]))} ${pt(lerp(S, tip, 0.85))}`,
          shade(make.colour, 0.72),
          1.8,
        );
      break;
    }
    default: {
      // The kit's arm: its outline, its colour over it, a mitten hand; a
      // box's (a robot's) a claw of two pincers.
      const d = `M${pt(S)} L${pt(E)} L${pt(H)}`;
      const down = (Math.atan2(-(H[1] - E[1]), H[0] - E[0]) * 180) / Math.PI;
      // A claw: an open ring round where the hand is, its gap downward.
      const R = make.handR * 1.35;
      const claw =
        spec.body === 'box'
          ? limb(
              `M${pt(polar(H, R, down + 42))} A${r1(R)},${r1(R)} 0 1 0 ${pt(polar(H, R, down - 42))}`,
              make.hand,
              Math.max(3.4, make.handR * 0.85),
            )
          : '';
      markup =
        limb(d, make.colour, make.width) +
        (claw || circle(H, make.handR, inked(make.hand)));
    }
  }
  void k;
  return pivoted(cls, S, markup);
}

/** Wings on its back, each turning about its root (rig-flap): a feathered pair, a bat's, an insect's. */
function wingsOf(
  spec: CreatureSpec,
  roots: P[],
  span: number,
  body: string,
): string {
  return roots
    .map((root, i) => {
      const side = i === 0 ? -1 : 1;
      const at = (x: number, y: number): P =>
        add(root, [side * x * span, y * span]);
      let markup: string;
      switch (spec.wings) {
        case 'bat': {
          const colour = shade(body, 0.78);
          const d = `M${pt(at(0, -0.05))} Q${pt(at(0.4, -0.62))} ${pt(at(1, -0.5))} Q${pt(at(0.92, -0.2))} ${pt(at(0.95, 0.08))} Q${pt(at(0.78, -0.02))} ${pt(at(0.66, 0.16))} Q${pt(at(0.52, 0.04))} ${pt(at(0.38, 0.2))} Q${pt(at(0.24, 0.08))} ${pt(at(0.06, 0.2))} Z`;
          markup =
            path(d, inked(colour)) +
            [0.95, 0.66, 0.38]
              .map((x, j) =>
                line(
                  `M${pt(at(0.04, 0))} L${pt(at(x, [0.08, 0.16, 0.2][j]))}`,
                  shade(colour, 0.72),
                  1.8,
                ),
              )
              .join('');
          break;
        }
        case 'insect':
          markup =
            ellipse(
              at(0.42, -0.36),
              span * 0.46,
              span * 0.24,
              inked(GLASS),
              side * -32,
            ) +
            ellipse(
              at(0.34, 0.06),
              span * 0.3,
              span * 0.16,
              inked(GLASS),
              side * 24,
            );
          break;
        default: {
          // Feathered, as the kit's angels' are, and folded out a little.
          const d = `M${pt(at(0, 0.1))} Q${pt(at(0.38, -0.8))} ${pt(at(1, -0.55))} Q${pt(at(0.88, -0.05))} ${pt(at(0.8, 0.12))} Q${pt(at(0.62, 0.36))} ${pt(at(0.3, 0.3))} Z`;
          markup =
            path(d, inked('#fbfbf6')) +
            [0, 1, 2]
              .map((j) =>
                line(
                  `M${pt(at(0.2 + j * 0.08, 0.2 - j * 0.04))} Q${pt(at(0.46 + j * 0.1, 0.02 - j * 0.14))} ${pt(at(0.72 + j * 0.08, -0.12 - j * 0.14))}`,
                  '#d7d5cc',
                  2,
                ),
              )
              .join('');
        }
      }
      return pivoted('rig-flap', root, markup);
    })
    .join('');
}

/** A tail from behind its lower body, out to the viewer's right and up, turning about its root. */
function tailOf(
  spec: CreatureSpec,
  root: P,
  len: number,
  colour: string,
  k: number,
): string {
  const pts: P[] =
    spec.tail === 'short'
      ? [
          root,
          add(root, [len * 0.3, 0.02 * len]),
          add(root, [len * 0.45, -len * 0.14]),
        ]
      : [
          root,
          add(root, [len * 0.4, len * 0.12]),
          add(root, [len * 0.78, -len * 0.02]),
          add(root, [len * 0.92, -len * 0.3]),
        ];
  const width = Math.max(5, 9 * k);
  const tip = pts[pts.length - 1];
  const spikes =
    spec.tail === 'spiked'
      ? path(
          blob(
            [
              add(tip, [-width * 0.5, width * 0.2]),
              add(tip, [width * 0.2, -width * 1.3]),
              add(tip, [width * 1.1, width * 0.1]),
              add(tip, [width * 0.1, width * 0.5]),
            ],
            0.35,
          ),
          inked(shade(colour, 0.78)),
        ) +
        [0.35, 0.62]
          .map((t) => {
            const at = lerp(pts[1], pts[2], t);
            return path(
              `M${pt(add(at, [-width * 0.45, -width * 0.2]))} L${pt(add(at, [0, -width * 1.05]))} L${pt(add(at, [width * 0.45, -width * 0.25]))} Z`,
              inked(shade(colour, 0.78)),
            );
          })
          .join('')
      : '';
  return pivoted(
    'rig-tail',
    root,
    spikes +
      path(
        tapered(pts, spec.tail === 'short' ? width * 1.3 : width, width * 0.5),
        inked(colour),
      ),
  );
}

/** What grows or sits on top, at its top `T`, `half` its width there: behind it, and in front of it. */
function onTop(
  spec: CreatureSpec,
  T: P,
  half: number,
  k: number,
  body: string,
): { behind: string; before: string; ears: P[] } {
  const accent = spec.textureColour ? CREATURE_PAINT[spec.textureColour] : null;
  const behind: string[] = [];
  const before: string[] = [];
  const ears: P[] = [];
  const u = Math.max(half, 12);
  switch (spec.top) {
    case 'tuft': {
      const c = accent ?? shade(body, 0.7);
      for (const [dx, deg, len] of [
        [-0.18, 112, 0.55],
        [0, 88, 0.72],
        [0.18, 66, 0.55],
      ] as const) {
        const base = add(T, [dx * u, u * 0.1]);
        const tip = polar(base, u * len, deg);
        behind.push(
          path(
            blob(
              [
                add(base, [-u * 0.09, 0]),
                lerp(base, tip, 0.5),
                tip,
                add(lerp(base, tip, 0.5), [u * 0.14, 0]),
                add(base, [u * 0.09, 0]),
              ],
              0.8,
            ),
            inked(c),
          ),
        );
      }
      break;
    }
    case 'horns':
      for (const side of [-1, 1]) {
        const base = add(T, [side * u * 0.5, u * 0.2]);
        behind.push(
          path(
            tapered(
              [
                base,
                add(base, [side * u * 0.12, -u * 0.36]),
                add(base, [side * u * 0.3, -u * 0.58]),
              ],
              u * 0.32,
              u * 0.06,
            ),
            inked(BONE),
          ),
        );
      }
      break;
    case 'antennae':
      for (const side of [-1, 1]) {
        const base = add(T, [side * u * 0.3, u * 0.14]);
        const tip = add(base, [side * u * 0.26, -u * 0.66]);
        ears.push(base);
        behind.push(
          pivoted(
            `rig-ear${side > 0 ? ' rig-ear-r' : ''}`,
            base,
            line(
              `M${pt(base)} Q${pt(add(base, [side * u * 0.02, -u * 0.4]))} ${pt(tip)}`,
              FIGURE_INK,
              3,
            ) + circle(tip, Math.max(3, u * 0.13), inked(accent ?? CLOTH.red)),
          ),
        );
      }
      break;
    case 'ears':
      for (const side of [-1, 1]) {
        const base = add(T, [side * u * 0.62, u * 0.34]);
        ears.push(base);
        const tip = add(base, [side * u * 0.3, -u * 0.62]);
        behind.push(
          pivoted(
            `rig-ear${side > 0 ? ' rig-ear-r' : ''}`,
            base,
            path(
              blob(
                [
                  add(base, [-side * u * 0.22, u * 0.1]),
                  add(base, [side * u * 0.02, -u * 0.36]),
                  tip,
                  add(base, [side * u * 0.34, -u * 0.08]),
                  add(base, [side * u * 0.18, u * 0.14]),
                ],
                0.85,
              ),
              inked(body),
            ) +
              path(
                blob(
                  [
                    add(base, [-side * u * 0.08, 0]),
                    add(base, [side * u * 0.06, -u * 0.3]),
                    lerp(base, tip, 0.86),
                    add(base, [side * u * 0.2, -u * 0.06]),
                  ],
                  0.85,
                ),
                flat(accent ?? shade(body, 1.35)),
              ),
          ),
        );
      }
      break;
    case 'crown': {
      const w = u * 0.62;
      const y = T[1] + u * 0.12;
      before.push(
        path(
          `M${pt([T[0] - w, y])} L${pt([T[0] - w * 1.05, y - w * 0.8])} L${pt([T[0] - w * 0.5, y - w * 0.4])} L${pt([T[0], y - w * 0.95])} L${pt([T[0] + w * 0.5, y - w * 0.4])} L${pt([T[0] + w * 1.05, y - w * 0.8])} L${pt([T[0] + w, y])} Z`,
          inked(GOLD),
        ) +
          circle([T[0], y - w * 0.3], Math.max(1.8, w * 0.12), flat(CLOTH.red)),
      );
      break;
    }
    case 'halo':
      before.push(
        `<path d="M${pt([T[0] - u * 0.8, T[1] - u * 0.4])} a${r1(u * 0.8)},${r1(u * 0.27)} 0 1 0 ${r1(u * 1.6)},0 a${r1(u * 0.8)},${r1(u * 0.27)} 0 1 0 ${r1(-u * 1.6)},0 Z M${pt([T[0] - u * 0.48, T[1] - u * 0.4])} a${r1(u * 0.48)},${r1(u * 0.11)} 0 1 0 ${r1(u * 0.96)},0 a${r1(u * 0.48)},${r1(u * 0.11)} 0 1 0 ${r1(-u * 0.96)},0 Z" fill-rule="evenodd" ${inked(GOLD)}/>`,
      );
      break;
    case 'hat': {
      // A top hat, its band in what it wears' colour.
      const w = u * 0.62;
      const y = T[1] + u * 0.1;
      const band = spec.wearColour ? CLOTH[spec.wearColour] : CLOTH.red;
      before.push(
        ellipse([T[0], y], w * 1.45, w * 0.26, inked(HAT)) +
          `<rect x="${r1(T[0] - w)}" y="${r1(y - w * 1.4)}" width="${r1(w * 2)}" height="${r1(w * 1.4)}" ${inked(HAT)}/>` +
          `<rect x="${r1(T[0] - w)}" y="${r1(y - w * 0.46)}" width="${r1(w * 2)}" height="${r1(w * 0.3)}" ${inked(band)}/>`,
      );
      break;
    }
    case 'flame': {
      const w = u * 0.4;
      const base = add(T, [0, u * 0.12]);
      before.push(
        path(
          blob(
            [
              add(base, [-w, 0]),
              add(base, [-w * 0.9, -w * 1.2]),
              add(base, [-w * 0.2, -w * 1.1]),
              add(base, [0, -w * 2.2]),
              add(base, [w * 0.7, -w * 1.2]),
              add(base, [w, 0]),
            ],
            0.8,
          ),
          inked(CREATURE_PAINT.orange),
        ) +
          path(
            blob(
              [
                add(base, [-w * 0.45, -w * 0.1]),
                add(base, [0, -w * 1.3]),
                add(base, [w * 0.45, -w * 0.1]),
              ],
              0.8,
            ),
            flat(CREATURE_PAINT.yellow),
          ),
      );
      break;
    }
    case 'spikes': {
      const c = accent ?? shade(body, 0.8);
      for (const [dx, deg, len] of [
        [-0.45, 125, 0.34],
        [-0.16, 100, 0.46],
        [0.16, 80, 0.46],
        [0.45, 55, 0.34],
      ] as const) {
        const base = add(T, [dx * u * 1.1, u * 0.14 + Math.abs(dx) * u * 0.18]);
        const tip = polar(base, u * len, deg);
        const across = u * 0.16;
        behind.push(
          path(
            `M${pt(polar(base, across, deg + 90))} L${pt(tip)} L${pt(polar(base, across, deg - 90))} Z`,
            inked(c),
          ),
        );
      }
      break;
    }
    default:
      break;
  }
  void k;
  return { behind: behind.join(''), before: before.join(''), ears };
}

/**
 * What it wears round its neck, at `N` (below its mouth, or where its head
 * meets its body), `half` its body's width there.
 */
function neckWearOf(
  spec: CreatureSpec,
  at: P,
  half: number,
  k: number,
): string {
  let N = at;
  const c = CLOTH[spec.wearColour ?? 'red'];
  const u = Math.max(4, 6 * k);
  switch (spec.wear.neck) {
    case 'bow tie':
      return (
        path(
          `M${pt(N)} L${pt(add(N, [-u * 2, -u * 1.1]))} Q${pt(add(N, [-u * 2.4, 0]))} ${pt(add(N, [-u * 2, u * 1.1]))} Z`,
          inked(c),
        ) +
        path(
          `M${pt(N)} L${pt(add(N, [u * 2, -u * 1.1]))} Q${pt(add(N, [u * 2.4, 0]))} ${pt(add(N, [u * 2, u * 1.1]))} Z`,
          inked(c),
        ) +
        ellipse(N, u * 0.6, u * 0.7, inked(shade(c, 0.85)))
      );
    case 'scarf':
      // Below the mouth: its band's top at the neck.
      N = add(N, [0, u * 0.6]);
      return (
        path(
          `M${pt(add(N, [half * 0.2, u * 0.4]))} L${pt(add(N, [half * 0.34, u * 4.4]))} L${pt(add(N, [half * 0.34 + u * 2, u * 4]))} L${pt(add(N, [half * 0.2 + u * 2.2, u * 0.2]))} Z`,
          inked(shade(c, 0.9)),
        ) +
        `<rect x="${r1(N[0] - half)}" y="${r1(N[1] - u * 0.9)}" width="${r1(half * 2)}" height="${r1(u * 1.9)}" rx="${r1(u * 0.9)}" ${inked(c)}/>`
      );
    case 'collar':
      return (
        `<rect x="${r1(N[0] - half)}" y="${r1(N[1] - u * 0.55)}" width="${r1(half * 2)}" height="${r1(u * 1.1)}" rx="${r1(u * 0.5)}" ${inked(c)}/>` +
        circle(add(N, [0, u * 1.2]), u * 0.7, inked(GOLD))
      );
    default:
      return '';
  }
}

/** A belt round its middle and a waistcoat over its front, clipped to its body. */
function bodyWearOf(
  spec: CreatureSpec,
  shape: Shape,
  B: P,
  w: number,
  h: number,
  neckY: number,
  /** Below what is round its neck. */
  clear: number,
): string {
  const c = CLOTH[spec.wearColour ?? 'red'];
  const low = bottomOf(shape);
  switch (spec.wear.body) {
    case 'belt': {
      const band = Math.max(4.5, h * 0.12);
      const y = Math.min(
        B[1] + h * 0.72,
        Math.max(
          B[1] + h * (spec.body === 'stack' ? 0.2 : 0.46),
          clear + band / 2 + 1,
        ),
      );
      const half = halfAt(shape, y) + 4;
      return (
        `<rect x="${r1(B[0] - half)}" y="${r1(y - band / 2)}" width="${r1(half * 2)}" height="${r1(band)}" ${inked(c)}/>` +
        `<rect x="${r1(B[0] - band * 0.6)}" y="${r1(y - band * 0.62)}" width="${r1(band * 1.2)}" height="${r1(band * 1.24)}" rx="1" ${inked(GOLD)}/>`
      );
    }
    case 'waistcoat': {
      const top = neckY;
      const vee = lerp([B[0], top], [B[0], low], 0.42);
      const out = w * 1.3;
      return (
        [-1, 1]
          .map((side) =>
            path(
              `M${pt([B[0] + side * w * 0.08, top])} L${pt([B[0] + side * out, top - h * 0.1])} L${pt([B[0] + side * out, low + 4])} L${pt([B[0] + side * w * 0.04, low + 4])} L${pt(add(vee, [side * w * 0.04, 0]))} Z`,
              inked(c),
            ),
          )
          .join('') +
        [0.55, 0.72]
          .map((t) =>
            circle(
              lerp(vee, [B[0], low], t),
              Math.max(1.6, w * 0.05),
              flat(GOLD),
            ),
          )
          .join('')
      );
    }
    default:
      return '';
  }
}

/** A cape from its shoulders, behind it, to near the ground. */
function capeOf(spec: CreatureSpec, left: P, right: P, down: number): string {
  if (spec.wear.body !== 'cape') return '';
  const c = shade(CLOTH[spec.wearColour ?? 'red'], 0.9);
  const flare = (right[0] - left[0]) * 0.28;
  return path(
    `M${pt(left)} Q${pt(lerp(left, right, 0.5))} ${pt(right)} L${pt([right[0] + flare, down])} Q${pt([(left[0] + right[0]) / 2, down + 6])} ${pt([left[0] - flare, down])} Z`,
    inked(c),
  );
}

/** How far below its eyes its mouth is, in the face's units, by its nose. */
const NOSE_DROP: Record<CreatureSpec['nose'], number> = {
  none: 29,
  button: 34,
  beak: 38,
  carrot: 42,
  snout: 42,
};

/** Its nose, between its eyes and its mouth: where, and the mouth's place below it. */
function noseOf(
  spec: CreatureSpec,
  eyes: P,
  s: number,
  body: string,
): { markup: string; mouthY: number } {
  const y = eyes[1];
  switch (spec.nose) {
    case 'button':
      return {
        markup: ellipse(
          [eyes[0], y + 20 * s],
          6.5 * s,
          5 * s,
          inked(shade(body, 0.72)),
        ),
        mouthY: y + NOSE_DROP.button * s,
      };
    case 'beak':
      return {
        markup: path(
          `M${pt([eyes[0] - 7 * s, y + 13 * s])} L${pt([eyes[0] + 7 * s, y + 13 * s])} L${pt([eyes[0], y + 27 * s])} Z`,
          inked(CREATURE_PAINT.golden),
        ),
        mouthY: y + NOSE_DROP.beak * s,
      };
    case 'carrot': {
      // Large enough to be orange, not ink, however small the face.
      const half = Math.max(5, 9 * s);
      const base: P = [eyes[0] - 3 * s, y + 20 * s];
      const tip: P = add(base, [Math.max(24, 46 * s), half * 0.35]);
      return {
        markup:
          path(
            `M${pt(add(base, [0, -half]))} L${pt(tip)} L${pt(add(base, [0, half]))} Q${pt(add(base, [-half * 0.6, 0]))} ${pt(add(base, [0, -half]))} Z`,
            inked(CARROT),
          ) +
          line(
            `M${pt(lerp(base, tip, 0.3))} l${r1(-1)},${r1(-half * 0.45)}`,
            shade(CARROT, 0.72),
            1.4,
          ) +
          line(
            `M${pt(lerp(base, tip, 0.55))} l${r1(-1)},${r1(half * 0.35)}`,
            shade(CARROT, 0.72),
            1.4,
          ),
        mouthY: y + NOSE_DROP.carrot * s,
      };
    }
    case 'snout': {
      // A snout below its eyes, its nostrils on it; the mouth under it.
      const at: P = [eyes[0], y + 23 * s];
      return {
        markup:
          ellipse(at, 19 * s, 9.5 * s, inked(shade(body, 1.18))) +
          ellipse(add(at, [-6 * s, -1 * s]), 2.4 * s, 2 * s, flat(FIGURE_INK)) +
          ellipse(add(at, [6 * s, -1 * s]), 2.4 * s, 2 * s, flat(FIGURE_INK)),
        mouthY: y + NOSE_DROP.snout * s,
      };
    }
    default:
      return { markup: '', mouthY: y + NOSE_DROP.none * s };
  }
}

/** Glasses round its eyes, or a monocle on one: over the eyes, in the face's place. */
function glassesOf(spec: CreatureSpec, face: Built['face']): string {
  const { at, s, dx } = face;
  const count = face.count ?? 2;
  const r = 18 * s;
  const rim = (cx: number) =>
    `<circle cx="${r1(cx)}" cy="${r1(at[1])}" r="${r1(r)}" fill="none" stroke="${FIGURE_INK}" stroke-width="2.4"/>`;
  if (spec.wear.face === 'monocle') {
    const cx = at[0] + (count === 1 ? 0 : dx * s);
    return (
      rim(cx) +
      line(
        `M${pt([cx + r * 0.7, at[1] + r * 0.7])} Q${pt([cx + r * 1.2, at[1] + r * 2])} ${pt([cx + r * 0.6, at[1] + r * 2.8])}`,
        GOLD,
        1.8,
      )
    );
  }
  if (spec.wear.face !== 'glasses') return '';
  if (count === 1) return rim(at[0]);
  const xs = [at[0] - dx * s, at[0] + dx * s];
  const gap = xs[1] - xs[0] - r * 2;
  return (
    xs.map(rim).join('') +
    (gap > 0
      ? line(
          `M${pt([xs[0] + r, at[1]])} Q${pt([at[0], at[1] - r * 0.3])} ${pt([xs[1] - r, at[1]])}`,
          FIGURE_INK,
          2.4,
        )
      : '')
  );
}

// ── The whole ──────────────────────────────────────────────────────────────

/** How tall it stands, to the top of its body or head, in the kit's units. */
export const creatureTall = (spec: CreatureSpec): number =>
  CREATURE_TALL[spec.size];

/** The poses a creature has: standing, and sitting when it has legs to sit on. */
export const hasLegs = (spec: CreatureSpec) =>
  spec.legs === 'stick' || spec.legs === 'kit';

/**
 * A creature built from its spec, as the animal kit builds an animal: each
 * pose's body, the head every pose shares (its face's place, its nose,
 * its head's own shape when it has one), its joints and how it goes.
 */
export function buildCreature(
  spec: CreatureSpec,
  id: string,
  seed: string,
): Built {
  const T = creatureTall(spec);
  const k = T / CREATURE_TALL.medium;
  const g = GIRTH[spec.build];
  const body = CREATURE_PAINT[spec.bodyColour];
  const limbColour = spec.limbColour
    ? CREATURE_PAINT[spec.limbColour]
    : spec.arms === 'stick' || spec.legs === 'stick'
      ? FIGURE_INK
      : body;
  const floats =
    spec.legs === 'tail' ||
    (spec.legs === 'none' && (spec.body === 'ghost' || spec.body === 'cloud'));
  const legLen =
    spec.legs === 'kit'
      ? 0.26 * T
      : spec.legs === 'stick'
        ? 0.28 * T
        : spec.legs === 'feet'
          ? 0.07 * T
          : floats
            ? 0.12 * T
            : 0;
  const A = T - legLen;
  // Its head, apart from its body: large, as a cartoon's is, so its face
  // reads; a snowman's no larger than its middle ball.
  const headH =
    spec.head === 'none'
      ? 0
      : A * (spec.body === 'stack' ? 0.34 : spec.head === 'box' ? 0.44 : 0.46);
  const overlap = headH * 0.16;
  const bodyH = A - headH + overlap;
  const h = bodyH / 2;
  const B: P = [0, -legLen - h];
  const w = h * ASPECT[spec.body] * g;
  const shape = bodyShape(spec.body, B, w, h);
  const bodyTop = topOf(shape);
  const bodyLow = bottomOf(shape);

  // ── The head, when it has one; else the face is on the body.
  const r = headH / 2;
  const headBottom = bodyTop + overlap;
  const Hc: P = [0, headBottom - r];
  const headShape: Shape | null =
    spec.head === 'round'
      ? {
          loops: [ellipsePoints(Hc, r * 1.04, r, 0, 12)],
          tension: 1,
          samples: blobSamples(ellipsePoints(Hc, r * 1.04, r, 0, 12), 1, 6),
        }
      : spec.head === 'box'
        ? (() => {
            const loop = superellipse(Hc, r * 1.12, r * 0.94, 6, 28);
            return {
              loops: [loop],
              tension: 1,
              samples: blobSamples(loop, 1, 6),
            };
          })()
        : null;
  // Where its face is, and how large: the eyes as far apart as it is
  // wide there, a little more than half.
  const count = spec.eyes;
  const eyeY = headShape
    ? Hc[1] - r * 0.28
    : spec.body === 'stack'
      ? (() => {
          // On the upper ball, a little above its middle.
          const up = shape.loops[1];
          const ys = up.map((p) => p[1]);
          const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
          return mid - (Math.max(...ys) - mid) * 0.12;
        })()
      : // A crack on top has room above the face.
        B[1] - h * (FACE_UP[spec.body] - (spec.texture === 'crack' ? 0.1 : 0));
  const acrossHalf = headShape ? halfAt(headShape, eyeY) : halfAt(shape, eyeY);
  const across = acrossHalf * 2;
  const share = count === 1 ? 0.44 : count === 3 ? 0.66 : 0.58;
  const wide = count === 1 ? ONE_WIDE : count === 3 ? THREE_WIDE : PAIR_WIDE;
  // No larger than a person's face, nor so large it fills the body; on a
  // head of its own, its mouth still on the head.
  const s = Math.min(
    (share * across) / wide,
    headShape ? (r * 1.02) / (NOSE_DROP[spec.nose] + 13) : h / 36,
    0.95,
  );
  const faceAt: P = [0, count === 3 ? eyeY + 10 * s : eyeY];
  const nose = noseOf(spec, faceAt, s, body);
  const mouthAt: P = [0, nose.mouthY];
  const ms = Math.max(0.5, s * 1.05);
  const mouthBottom = mouthAt[1] + 12 * ms;
  const zone: FaceZone | null = headShape
    ? null
    : {
        at: faceAt,
        s,
        half: Math.max(across * 0.42, 24 * s),
        top: faceAt[1] - (count === 3 ? 48 : 20) * s,
        bottom: mouthBottom,
      };
  const face: Built['face'] = {
    at: faceAt,
    s,
    skin: body,
    eyeLine: eyeLineOf(s),
    dx: count === 3 ? THREE_DX : 14.5,
    count,
  };

  // ── Its pieces: the body, what is on it, what it wears.
  const clipId = `${id}-body`;
  const bodyD = dOf(shape);
  const texture = textureOf(spec, shape, B, w, h, zone, body, seed);
  // Round its neck: where its head meets its body, or below its mouth,
  // a bow tie's half height clear of it.
  const neckY = headShape
    ? headBottom
    : mouthBottom + Math.max(4, 6 * k) * 1.1 + 2;
  const neckWear = spec.wear.neck
    ? neckWearOf(
        spec,
        [0, neckY],
        headShape ? r * 0.72 : Math.max(8, halfAt(shape, neckY) * 0.8),
        k,
      )
    : '';
  const bodyWear = bodyWearOf(
    spec,
    shape,
    B,
    w,
    h,
    neckY + 3,
    spec.wear.neck && !headShape ? neckY + Math.max(4, 6 * k) * 1.2 + 2 : neckY,
  );
  const clipped = texture + bodyWear;
  // Each of its loops a shape of its own, the lower first (a snowman's
  // upper ball over the lower): its fill, what is clipped to it, and its
  // outline again over that, so its edge is whole.
  const outlines =
    spec.texture === 'fur'
      ? [furOf(shape, B)]
      : shape.loops.map((one) => blob(one, shape.tension));
  const clips =
    spec.texture === 'fur' || outlines.length === 1 ? [bodyD] : outlines;
  const bodyMarkup = [
    `<defs>${clips.map((d, i) => `<clipPath id="${clipId}${i ? `-${i}` : ''}"><path d="${d}"/></clipPath>`).join('')}</defs>`,
    ...outlines.map((d, i) =>
      [
        path(d, inked(body)),
        clipped
          ? `<g clip-path="url(#${clipId}${i ? `-${i}` : ''})">${clipped}</g><path d="${d}" fill="none"/>`
          : '',
      ].join(''),
    ),
    // Round its neck with no head: below its mouth, on its body.
    headShape ? '' : neckWear,
  ].join('');

  // ── What is on top: of its head, or of its body.
  const topAt: P = headShape ? [0, topOf(headShape)] : [0, bodyTop];
  const topHalf = headShape
    ? r
    : Math.max(halfAt(shape, bodyTop + h * 0.2), w * 0.35);
  const top = onTop(spec, topAt, topHalf, k, body);

  // ── Arms, at its shoulders.
  const shoulderY = headShape
    ? bodyTop + bodyH * 0.24
    : spec.body === 'stack'
      ? (() => {
          const up = shape.loops[1];
          const ys = up.map((p) => p[1]);
          return (
            (Math.min(...ys) + Math.max(...ys)) / 2 +
            (Math.max(...ys) - Math.min(...ys)) * 0.1
          );
        })()
      : Math.max(mouthBottom, B[1] - h * 0.05);
  const shoulderHalf = halfAt(shape, shoulderY);
  const armW = Math.max(6, Math.min(15, w * 0.22)) * Math.min(1, k + 0.2);
  const handR = spec.arms === 'stick' ? Math.max(4.2, 5.4 * k) : armW * 0.62;
  // Sitting, the body sinks this far: its hands still off the ground.
  const seat = hasLegs(spec) ? legLen * 0.72 : 0;
  const armLen = Math.max(
    8,
    Math.min(
      Math.max(24 * k, bodyH * 0.46),
      (-(shoulderY + seat) - handR - LINE) / 0.92,
    ),
  );
  const make: ArmMake = {
    colour: spec.arms === 'stick' && !spec.limbColour ? FIGURE_INK : limbColour,
    hand:
      spec.arms === 'stick'
        ? spec.limbColour
          ? shade(limbColour, 0.85)
          : GLOVE
        : shade(limbColour === FIGURE_INK ? body : limbColour, 1.12),
    width: armW,
    handR,
  };
  const shoulders: P[] =
    spec.arms === 'none'
      ? []
      : [1, -1].map(
          (side) =>
            [side * (shoulderHalf - Math.max(2.5, armW * 0.3)), shoulderY] as P,
        );
  const arms = shoulders.map((S, i) =>
    armOf(spec, S, i === 0 ? 1 : -1, armLen, make, k),
  );

  // ── Legs, at its hips.
  const hipY = bodyLow - Math.max(3, h * 0.08);
  const hipHalf = Math.min(halfAt(shape, hipY) * 0.62, w * 0.42);
  const legW = Math.max(6.5, Math.min(17, w * 0.26)) * Math.min(1, k + 0.2);
  const shoeRx = spec.legs === 'stick' ? Math.max(6, 8 * k) : legW * 0.95;
  const shoeRy = spec.legs === 'stick' ? Math.max(3.4, 4.4 * k) : legW * 0.48;
  const footColour =
    spec.legs === 'stick'
      ? spec.limbColour
        ? shade(limbColour, 0.7)
        : SHOE
      : shade(limbColour === FIGURE_INK ? body : limbColour, 0.72);
  const legColour =
    limbColour === FIGURE_INK && spec.legs !== 'stick' ? body : limbColour;
  const legOf = (hip: P, side: 1 | -1, sit: number): string => {
    const foot: P = sit
      ? [hip[0] + side * legLen * 0.5, -shoeRy - LINE / 2]
      : [hip[0] + side * 1.5, -shoeRy - LINE / 2];
    const at: P = sit ? add(hip, [0, sit]) : hip;
    const toe: P = add(foot, [side * shoeRx * 0.35, 0]);
    const d =
      spec.legs === 'stick'
        ? `M${pt(at)} L${pt(add(foot, [0, -shoeRy * 0.4]))}`
        : `M${pt(at)} L${pt(add(foot, [0, -shoeRy * 0.2]))}`;
    const leg =
      spec.legs === 'stick'
        ? spec.limbColour
          ? limb(d, legColour, 3)
          : line(d, FIGURE_INK, 3.6)
        : limb(d, legColour, legW);
    return (
      leg + ellipse(toe, shoeRx, shoeRy, inked(footColour), sit ? side * 16 : 0)
    );
  };
  const hips: P[] = [1, -1].map((side) => [side * hipHalf, hipY] as P);
  const legsStand = (() => {
    switch (spec.legs) {
      case 'stick':
      case 'kit':
        return hips
          .map((hip, i) =>
            pivoted(
              `rig-leg rig-leg-${i === 0 ? 'a' : 'b'}`,
              hip,
              legOf(hip, i === 0 ? 1 : -1, 0),
            ),
          )
          .join('');
      case 'feet':
        return hips
          .map((hip, i) => {
            const side = i === 0 ? 1 : -1;
            const foot: P = [hip[0] + side * 2, -shoeRy - LINE / 2];
            const top: P = [foot[0], bodyLow - shoeRy];
            return pivoted(
              `rig-leg rig-leg-${i === 0 ? 'a' : 'b'}`,
              top,
              ellipse(
                add(foot, [side * shoeRx * 0.2, 0]),
                shoeRx * 1.1,
                shoeRy * 1.15,
                inked(footColour),
              ),
            );
          })
          .join('');
      case 'tail': {
        // A wisp it floats on, curling to one side.
        const from: P = [0, bodyLow - h * 0.2];
        return path(
          tapered(
            [
              from,
              add(from, [-w * 0.1, legLen * 0.6]),
              add(from, [w * 0.25, legLen * 0.95]),
              add(from, [w * 0.5, legLen * 0.7]),
            ],
            w * 0.9,
            Math.max(4, w * 0.12),
          ),
          inked(body),
        );
      }
      default:
        return '';
    }
  })();

  // ── Wings and a tail, behind.
  const wingRoots: P[] =
    spec.wings === 'none'
      ? []
      : [-1, 1].map(
          (side) =>
            [
              side * w * 0.42,
              headShape ? bodyTop + bodyH * 0.3 : B[1] - h * 0.3,
            ] as P,
        );
  const wings = wingsOf(
    spec,
    wingRoots,
    (spec.wings === 'insect' ? 0.36 : 0.44) * T,
    body,
  );
  const tailRoot: P = [w * 0.46, B[1] + h * 0.5];
  const tail =
    spec.tail === 'none'
      ? ''
      : tailOf(spec, tailRoot, Math.max(w * 1.3, 0.5 * T), body, k);
  const cape = capeOf(
    spec,
    [-shoulderHalf * 0.9, headShape ? bodyTop + 4 : shoulderY - h * 0.2],
    [shoulderHalf * 0.9, headShape ? bodyTop + 4 : shoulderY - h * 0.2],
    // To just above its body's bottom: seen from the front, a cape shows
    // either side of it, never below it like a skirt.
    Math.min(bodyLow - h * 0.08, -Math.max(4, legLen * 0.35)),
  );

  // ── The poses: standing, and sitting when it has legs to sit on.
  const legsGroup = (markup: string, suffix = '') =>
    markup
      ? `<g id="legs${suffix}" class="rig-legs">${markup}</g>`
      : `<g id="legs${suffix}"/>`;
  const upper = (by: P) =>
    [
      `<g class="rig-breathe">${placed(wings + cape + tail + (headShape ? '' : top.behind), by)}</g>`,
    ].join('');
  const front = (by: P, suffix = '') =>
    [
      `<g class="rig-breathe" id="body${suffix}">${placed(bodyMarkup + (headShape ? '' : top.before), by)}</g>`,
      arms.length
        ? `<g class="rig-breathe">${placed(arms.join(''), by)}</g>`
        : '',
    ].join('');
  const stand = [upper([0, 0]), legsGroup(legsStand), front([0, 0])].join('');
  const sit = seat
    ? [
        upper([0, seat]),
        legsGroup(
          hips.map((hip, i) => legOf(hip, i === 0 ? 1 : -1, seat)).join(''),
          '-sit',
        ),
        front([0, seat], '-sit'),
      ].join('')
    : '';
  const poses: Partial<Record<AnimalPose, string>> = seat
    ? { stand, sit, lie: sit, curl: sit }
    : { stand };

  // ── The head: its own shape and what is on it, or its face's nose alone.
  const headMarkup = headShape
    ? [
        top.behind,
        path(dOf(headShape), inked(body)),
        spec.head === 'box'
          ? line(
              `M${pt([Hc[0] - r * 0.7, Hc[1] + r * 0.72])} L${pt([Hc[0] + r * 0.7, Hc[1] + r * 0.72])}`,
              shade(body, 0.8),
              1.8,
            )
          : '',
        nose.markup,
        top.before,
        neckWear,
      ].join('')
    : nose.markup;
  const neck: P | null = headShape ? [0, headBottom - r * 0.1] : null;
  const allTop = Math.min(topAt[1], bodyTop, headShape ? topOf(headShape) : 0);
  const reachX = Math.max(w, headShape ? r * 1.2 : 0);
  return {
    plan: 'climber',
    poses,
    headAt: seat
      ? {
          stand: { by: [0, 0], turn: 0 },
          sit: { by: [0, seat], turn: 0 },
          lie: { by: [0, seat], turn: neck ? 8 : 0 },
          curl: { by: [0, seat], turn: neck ? 12 : 0 },
        }
      : { stand: { by: [0, 0], turn: 0 } },
    head: headMarkup,
    over: glassesOf(spec, face),
    neck,
    dip: neck ? 14 : 0,
    face,
    mouth: { at: mouthAt, s: ms, kind: 'muzzle', wide: 1 },
    bounds: { left: -reachX, right: reachX, top: allTop },
    anchors: {
      head: headShape ? Hc : faceAt,
      body: B,
      legs: [0, -Math.max(legLen, 2) / 2],
    },
    legs:
      spec.legs === 'stick' || spec.legs === 'kit' || spec.legs === 'feet'
        ? hips.map((hip, i) => ({
            hip: spec.legs === 'feet' ? [hip[0], bodyLow - shoeRy] : hip,
            foot: [hip[0], -shoeRy],
            step: i === 0 ? ('a' as const) : ('b' as const),
          }))
        : [],
    tail: spec.tail === 'none' ? null : tailRoot,
    ears: top.ears,
    arms: shoulders,
    wings: wingRoots,
    gait:
      spec.legs === 'stick' || spec.legs === 'kit' || spec.legs === 'feet'
        ? 'walk'
        : floats
          ? 'float'
          : 'hop',
    sink: seat,
  };
}
