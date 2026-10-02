/**
 * A character's clothes, drawn (WP17): the garment over the torso and its
 * skirt below the hips, the sleeves, the legs and the feet, in either view,
 * from the wardrobe's closed lists (wardrobe.ts). Each garment is a few
 * numbers (how far it reaches, how it flares, its sleeves) and a few
 * details over it (a belt, banded armour, a drape over one shoulder, an
 * ermine collar, a row of buttons), so a tunic, a toga, a robe, a coat and
 * a uniform are all drawn by the same code, as the reference's are: flat
 * colours, one outline, nothing fussy.
 *
 * Everything here is drawn at rest, in the piece's units, its feet on y =
 * 0 (character-draw's frame); characters.ts carries each part to where the
 * pose puts it.
 */
import {
  type Pt,
  type Shape,
  blob,
  capsule,
  circle,
  ellipse,
  rect,
  rounded,
} from './shape';
import { mixOk, shadeOk } from './style';
import type { Frame, Ink, Paint, View } from './character-draw';
import { painted, stroked } from './character-draw';
import type { Outfit, Top } from './wardrobe';
import { CLOTH } from './wardrobe';

const n = (v: number) => Math.round(v * 10) / 10;

/** How deep a body is seen in profile, as a share of its width across the shoulders. */
const DEPTH = 0.62;
const p2 = (p: Pt) => `${n(p[0])} ${n(p[1])}`;

/** How far a garment reaches below the hips, how much it flares, and its sleeves. */
export const GARMENT: Readonly<
  Record<
    Top,
    {
      length: 'none' | 'thigh' | 'knee' | 'shin' | 'ankle';
      flare: number;
      sleeves: 'none' | 'short' | 'long' | 'wide';
    }
  >
> = {
  tunic: { length: 'knee', flare: 3, sleeves: 'short' },
  toga: { length: 'shin', flare: 4, sleeves: 'short' },
  robe: { length: 'ankle', flare: 6, sleeves: 'long' },
  'wide-robe': { length: 'ankle', flare: 8, sleeves: 'wide' },
  armour: { length: 'knee', flare: 3, sleeves: 'short' },
  coat: { length: 'knee', flare: 3, sleeves: 'long' },
  uniform: { length: 'thigh', flare: 1.5, sleeves: 'long' },
  suit: { length: 'none', flare: 0, sleeves: 'long' },
  shirt: { length: 'none', flare: 0, sleeves: 'long' },
  dress: { length: 'ankle', flare: 13, sleeves: 'long' },
  gown: { length: 'ankle', flare: 9, sleeves: 'long' },
  unku: { length: 'knee', flare: 2, sleeves: 'short' },
  kilt: { length: 'knee', flare: 4, sleeves: 'none' },
  apron: { length: 'knee', flare: 1, sleeves: 'long' },
};

/** Where a garment's hem is. */
export function hemOf(f: Frame, top: Top): number | null {
  const length = GARMENT[top].length;
  switch (length) {
    case 'thigh':
      return f.hipY * 0.6;
    case 'knee':
      return f.kneeY + 3;
    case 'shin':
      return f.kneeY * 0.42;
    case 'ankle':
      return f.ankleY + 0.5;
    default:
      return null;
  }
}

/** The colour the torso's garment shows: the armour's metal over a tunic, the skin of a bare chest, or the cloth. */
export function torsoColour(outfit: Outfit, skin: string): string {
  if (outfit.top === 'kilt') return skin;
  if (outfit.top === 'armour')
    return outfit.armour === 'plate' && outfit.main === CLOTH.bronze
      ? CLOTH.bronze
      : outfit.armour === 'mail'
        ? '#9aa2aa'
        : '#b4bcc4';
  if (outfit.top === 'apron') return outfit.main;
  return outfit.main;
}

/** The torso's outline at rest: shoulders to hips, facing the camera or in profile. */
export function torsoShape(f: Frame, view: View): Shape {
  const top = f.chin - 3;
  const sh = f.shoulderY;
  const mid = (sh + f.hipY) / 2 + 3;
  if (view === 'side') {
    const d = f.chest * DEPTH;
    return rounded(
      [
        [-d * 0.7, top],
        [d * 0.55, top],
        [d * 1.05, sh + 9],
        [d * 1.0, mid],
        [d * 0.95, f.hipY + 3],
        [-d * 0.95, f.hipY + 3],
        [-d * 1.0, mid],
        [-d * 0.95, sh + 4],
      ],
      5,
    );
  }
  return rounded(
    [
      [-f.chest * 0.55, top],
      [f.chest * 0.55, top],
      [f.chest, sh + 3],
      [f.chest - 0.8, sh + 13],
      [f.waist, mid],
      [f.hips, f.hipY + 3],
      [-f.hips, f.hipY + 3],
      [-f.waist, mid],
      [-f.chest + 0.8, sh + 13],
      [-f.chest, sh + 3],
    ],
    5,
  );
}

/** A band across the torso at y (a belt, an armour's band), as wide as the torso there. */
function bandAt(f: Frame, view: View, y: number, h: number, inset = 0): Shape {
  const sh = f.shoulderY;
  const mid = (sh + f.hipY) / 2 + 3;
  const half = (yy: number) => {
    if (view === 'side') return f.chest * DEPTH;
    if (yy <= sh + 13) return f.chest - 0.8;
    if (yy <= mid)
      return (
        f.chest -
        0.8 +
        ((f.waist - f.chest + 0.8) * (yy - sh - 13)) / (mid - sh - 13)
      );
    return f.waist + ((f.hips - f.waist) * (yy - mid)) / (f.hipY + 3 - mid);
  };
  const a = half(y) - inset;
  const b = half(y + h) - inset;
  return view === 'side'
    ? rect(-a, y, 2 * a, h, 1)
    : rounded(
        [
          [-a, y],
          [a, y],
          [b, y + h],
          [-b, y + h],
        ],
        1,
      );
}

/** The torso's garment and what is over it, at rest, as markup. */
export function torsoMarkup(
  f: Frame,
  outfit: Outfit,
  view: View,
  skin: string,
  ink: Ink,
): string {
  const side = view === 'side';
  const shape = torsoShape(f, view);
  const fill = torsoColour(outfit, skin);
  const sh = f.shoulderY;
  const waistY = (sh + f.hipY) / 2 + 2;
  let out = '';
  // A soft shadow under the chin, the head's, drawn on the body.
  const shadow = ellipse(
    [side ? 1 : 0, f.chin + 1],
    side ? f.chest * 0.45 : f.chest * 0.62,
    4.5,
  );
  out += painted(shape.d, { fill }, ink);
  out += `<path d="${shadow.d}" fill="#000000" opacity="0.12"/>`;
  const line = (d: string, colour = ink.colour, w = ink.thin) =>
    stroked(d, colour, w);
  const belt = (colour: string, y = waistY, h = 4.5) =>
    painted(bandAt(f, view, y, h).d, { fill: colour }, ink);
  switch (outfit.top) {
    case 'armour': {
      if (outfit.armour === 'bands') {
        for (let k = 0; k < 4; k += 1) {
          const y = sh + 7 + k * ((f.hipY - sh - 14) / 4);
          out += painted(
            bandAt(f, view, y, (f.hipY - sh - 14) / 4 - 0.6, 0.6).d,
            { fill: k % 2 ? '#c3cad1' : '#b0b8c0', stroke: 'thin' },
            ink,
          );
        }
        if (!side) out += line(`M${p2([0, sh + 6])}L${p2([0, f.hipY - 7])}`);
      } else if (outfit.armour === 'plate') {
        if (!side) {
          out += line(`M${p2([0, sh + 4])}L${p2([0, f.hipY - 4])}`);
          out += line(
            `M${p2([-f.chest * 0.75, sh + 14])}Q${p2([-f.chest * 0.35, sh + 21])} ${p2([0, sh + 15])}Q${p2([f.chest * 0.35, sh + 21])} ${p2([f.chest * 0.75, sh + 14])}`,
          );
        }
      } else {
        // Mail as rows of small arcs; scales as rows of small rounded plates.
        const rows = 5;
        for (let k = 0; k < rows; k += 1) {
          const y = sh + 6 + k * ((f.hipY - sh - 6) / rows);
          const half = side ? f.chest * 0.45 : f.waist - 1;
          const step = outfit.armour === 'mail' ? 4.2 : 5.4;
          let d = '';
          for (let x = -half + (k % 2) * step * 0.5; x < half; x += step)
            d +=
              outfit.armour === 'mail'
                ? `M${p2([x, y])}Q${p2([x + step / 2, y + 3])} ${p2([x + step, y])}`
                : `M${p2([x, y])}L${p2([x, y + 3.2])}Q${p2([x + step / 2, y + 5.5])} ${p2([x + step, y + 3.2])}L${p2([x + step, y])}`;
          out += line(d, shadeOk(fill, 0.35), ink.thin * 0.8);
        }
      }
      // Its trim colour at the neck and a belt.
      out += belt(
        outfit.trim === CLOTH.gold ? '#7a4f2e' : outfit.accent,
        f.hipY - 4,
        5,
      );
      break;
    }
    case 'toga': {
      // The cloth over the near shoulder and across the chest to the far hip.
      if (side)
        out += painted(
          rounded(
            [
              [-f.chest * 0.5, sh],
              [f.chest * 0.45, sh + 2],
              [f.chest * 0.5, sh + 20],
              [-f.chest * 0.5, f.hipY],
            ],
            4,
          ).d,
          { fill: shadeOk(fill, 0.06) },
          ink,
        );
      else {
        const drape = blob(
          [
            [f.chest * 0.2, f.chin - 2],
            [f.chest * 1.02, sh + 1],
            [f.chest * 0.85, sh + 16],
            [-f.waist * 0.35, f.hipY + 2],
            [-f.hips * 0.95, f.hipY + 2],
            [-f.waist * 0.55, waistY - 4],
          ],
          0.55,
        );
        out += painted(drape.d, { fill: shadeOk(fill, 0.05) }, ink);
        out += line(
          `M${p2([f.chest * 0.75, sh + 6])}Q${p2([0, sh + 18])} ${p2([-f.waist * 0.55, f.hipY - 2])}`,
          shadeOk(fill, 0.3),
        );
        if (outfit.accent !== CLOTH.brown && outfit.accent !== CLOTH.black)
          out += stroked(
            `M${p2([f.chest * 0.95, sh + 14])}Q${p2([f.chest * 0.2, sh + 26])} ${p2([-f.waist * 0.25, f.hipY + 1])}`,
            outfit.accent,
            2.6,
          );
      }
      break;
    }
    case 'robe': {
      if (!side) {
        out += line(
          `M${p2([0, f.chin + 2])}L${p2([0, f.hipY + 2])}`,
          shadeOk(fill, 0.3),
        );
        out += painted(
          rounded(
            [
              [-f.chest * 0.42, f.chin - 2],
              [f.chest * 0.42, f.chin - 2],
              [0, f.chin + 8],
            ],
            2,
          ).d,
          { fill: shadeOk(fill, 0.1), stroke: 'thin' },
          ink,
        );
      }
      out += belt(outfit.accent, waistY + 2, 4);
      break;
    }
    case 'wide-robe': {
      // A crossed collar, the near side over the far.
      if (!side)
        out += stroked(
          `M${p2([-f.chest * 0.5, f.chin - 2])}L${p2([f.waist * 0.45, waistY])}M${p2([f.chest * 0.5, f.chin - 2])}L${p2([0, f.chin + 10])}`,
          outfit.trim,
          4,
          'butt',
        );
      out += belt(outfit.accent, waistY - 1, 7);
      break;
    }
    case 'coat': {
      if (!side) {
        const open = blob(
          [
            [-6, f.chin - 1],
            [6, f.chin - 1],
            [f.waist * 0.45, f.hipY + 3],
            [-f.waist * 0.45, f.hipY + 3],
          ],
          0.2,
        );
        out += painted(open.d, { fill: outfit.trim, stroke: 'thin' }, ink);
        for (let k = 0; k < 3; k += 1)
          out += `<circle cx="0" cy="${n(sh + 14 + k * 7)}" r="1.4" fill="${shadeOk(outfit.trim, 0.45)}"/>`;
        // The cravat.
        out += painted(
          blob(
            [
              [-4.5, f.chin - 1],
              [4.5, f.chin - 1],
              [3, f.chin + 7],
              [0, f.chin + 9],
              [-3, f.chin + 7],
            ],
            0.6,
          ).d,
          { fill: CLOTH.white, stroke: 'thin' },
          ink,
        );
        out += line(`M${p2([-6, f.chin])}L${p2([-f.waist * 0.5, f.hipY + 2])}`);
        out += line(`M${p2([6, f.chin])}L${p2([f.waist * 0.5, f.hipY + 2])}`);
      }
      break;
    }
    case 'uniform': {
      if (!side) {
        for (let k = 0; k < 4; k += 1)
          out += `<circle cx="${n(f.chest * 0.1)}" cy="${n(sh + 9 + k * 7)}" r="1.5" fill="${CLOTH.gold}" stroke="${ink.colour}" stroke-width="0.6"/>`;
        out += line(
          `M${p2([f.chest * 0.1 - 2.5, f.chin])}L${p2([f.chest * 0.1 - 2.5, f.hipY + 2])}`,
          shadeOk(fill, 0.35),
        );
      }
      // The high collar.
      out += painted(
        rect(
          side ? -f.chest * 0.35 : -f.chest * 0.45,
          f.chin - 3,
          side ? f.chest * 0.8 : f.chest * 0.9,
          5,
          1.5,
        ).d,
        { fill: outfit.trim === CLOTH.gold ? '#c43b3b' : outfit.trim },
        ink,
      );
      out += belt(
        outfit.main === CLOTH.olive ? '#6a5131' : '#2f2b2c',
        waistY + 3,
        4.5,
      );
      break;
    }
    case 'suit': {
      if (!side) {
        out += painted(
          blob(
            [
              [-6.5, f.chin - 1],
              [6.5, f.chin - 1],
              [0, sh + 20],
            ],
            0.1,
          ).d,
          { fill: CLOTH.white, stroke: 'thin' },
          ink,
        );
        out += painted(
          blob(
            [
              [-1.6, f.chin + 1],
              [1.6, f.chin + 1],
              [2.4, sh + 16],
              [0, sh + 19],
              [-2.4, sh + 16],
            ],
            0.3,
          ).d,
          {
            fill: outfit.accent === CLOTH.brown ? CLOTH.red : outfit.accent,
            stroke: 'thin',
          },
          ink,
        );
        out += line(
          `M${p2([-7, f.chin])}L${p2([-1, sh + 22])}L${p2([-2, f.hipY + 2])}`,
        );
        out += line(`M${p2([7, f.chin])}L${p2([1, sh + 22])}`);
      }
      break;
    }
    case 'shirt': {
      if (!side) {
        out += painted(
          rounded(
            [
              [-6, f.chin - 2],
              [0, f.chin + 4],
              [6, f.chin - 2],
              [4, f.chin + 4],
              [0, f.chin + 6],
              [-4, f.chin + 4],
            ],
            1,
          ).d,
          { fill: shadeOk(fill, 0.08), stroke: 'thin' },
          ink,
        );
        out += line(
          `M${p2([0, f.chin + 5])}L${p2([0, f.hipY + 2])}`,
          shadeOk(fill, 0.3),
        );
      }
      break;
    }
    case 'dress': {
      out += belt(outfit.accent, waistY + 1, 4);
      if (!side)
        out += stroked(
          `M${p2([-f.chest * 0.5, f.chin - 1])}Q${p2([0, f.chin + 7])} ${p2([f.chest * 0.5, f.chin - 1])}`,
          shadeOk(fill, 0.3),
          ink.thin,
        );
      break;
    }
    case 'gown': {
      // An ermine collar over the shoulders: white, with its black tails.
      const collar = side
        ? rounded(
            [
              [-f.chest * 0.75, f.chin - 4],
              [f.chest * 0.65, f.chin - 4],
              [f.chest * 0.6, sh + 10],
              [-f.chest * 0.8, sh + 12],
            ],
            5,
          )
        : blob(
            [
              [-f.chest * 1.12, sh + 2],
              [-f.chest * 0.6, f.chin - 4],
              [f.chest * 0.6, f.chin - 4],
              [f.chest * 1.12, sh + 2],
              [f.chest * 0.9, sh + 13],
              [0, sh + 17],
              [-f.chest * 0.9, sh + 13],
            ],
            0.6,
          );
      out += painted(collar.d, { fill: '#f7f5ef' }, ink);
      for (const [x, y] of side
        ? [
            [-6, sh + 5],
            [3, sh + 7],
          ]
        : [
            [-f.chest * 0.65, sh + 6],
            [-f.chest * 0.2, sh + 10],
            [f.chest * 0.25, sh + 10],
            [f.chest * 0.7, sh + 6],
          ])
        out += `<path d="M${p2([x - 1.2, y - 1.5])}L${p2([x + 1.2, y - 1.5])}L${p2([x, y + 2])}Z" fill="#2b2727"/>`;
      if (!side)
        out += stroked(
          `M${p2([0, sh + 17])}L${p2([0, f.hipY + 2])}`,
          outfit.trim === CLOTH.white ? GOLDLINE : outfit.trim,
          2.4,
        );
      break;
    }
    case 'unku': {
      // A band of woven squares across the chest.
      const y = sh + 12;
      const half = side ? f.chest * 0.5 : f.chest - 1.5;
      const step = 4.2;
      let k = 0;
      for (let x = -half; x < half - 0.5; x += step, k += 1)
        out += `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.min(step, half - x))}" height="${n(step)}" fill="${k % 2 ? outfit.trim : '#2b2727'}"/>`;
      out += stroked(
        `M${p2([-half, y])}L${p2([half, y])}M${p2([-half, y + step])}L${p2([half, y + step])}`,
        ink.colour,
        ink.thin * 0.8,
      );
      if (!side)
        out += painted(
          blob(
            [
              [-5, f.chin - 2],
              [5, f.chin - 2],
              [0, f.chin + 5],
            ],
            0.3,
          ).d,
          { fill: skin, stroke: 'thin' },
          ink,
        );
      break;
    }
    case 'kilt': {
      // A broad collar of bands over the chest.
      const c: Pt = [side ? f.chest * 0.2 : 0, f.chin - 4];
      for (const [r, colour] of [
        [f.chest * 0.98, CLOTH.gold],
        [f.chest * 0.8, CLOTH.blue],
        [f.chest * 0.62, CLOTH.gold],
      ] as [number, string][]) {
        const arc = blob(
          side
            ? [
                [c[0] - r * 0.55, c[1]],
                [c[0] + r * 0.55, c[1]],
                [c[0] + r * 0.45, c[1] + r * 0.62],
                [c[0] - r * 0.45, c[1] + r * 0.62],
              ]
            : [
                [c[0] - r, c[1] + 1],
                [c[0] + r, c[1] + 1],
                [c[0] + r * 0.7, c[1] + r * 0.62],
                [c[0], c[1] + r * 0.78],
                [c[0] - r * 0.7, c[1] + r * 0.62],
              ],
          0.7,
        );
        out += painted(arc.d, { fill: colour }, ink);
      }
      out += belt(outfit.main, f.hipY - 1, 5);
      break;
    }
    case 'apron': {
      const a = side ? f.chest * 0.55 : f.waist * 0.75;
      out += painted(
        rounded(
          [
            [side ? 0 : -a * 0.8, sh + 10],
            [side ? a : a * 0.8, sh + 10],
            [side ? a + 1 : a, f.hipY + 4],
            [side ? -1 : -a, f.hipY + 4],
          ],
          2,
        ).d,
        { fill: outfit.accent === CLOTH.brown ? CLOTH.beige : outfit.accent },
        ink,
      );
      if (!side)
        out += stroked(
          `M${p2([-a * 0.8, sh + 10])}L${p2([-f.chest * 0.5, f.chin - 1])}M${p2([a * 0.8, sh + 10])}L${p2([f.chest * 0.5, f.chin - 1])}`,
          ink.colour,
          ink.thin,
        );
      break;
    }
    default: {
      // A tunic: a round neck and a belt.
      if (!side)
        out += stroked(
          `M${p2([-f.chest * 0.42, f.chin - 1])}Q${p2([0, f.chin + 6])} ${p2([f.chest * 0.42, f.chin - 1])}`,
          shadeOk(fill, 0.3),
          ink.thin,
        );
      out += belt(outfit.accent, waistY + 3, 4.5);
    }
  }
  if (outfit.sash && !side)
    out += stroked(
      `M${p2([-f.chest * 0.85, sh + 3])}L${p2([f.waist * 0.9, f.hipY - 2])}`,
      outfit.top === 'gown'
        ? '#3a63b8'
        : outfit.accent === CLOTH.gold
          ? '#3a63b8'
          : CLOTH.blue,
      5.5,
      'butt',
    );
  if (outfit.medals && !side)
    [CLOTH.red, CLOTH.blue, CLOTH.gold].forEach((colour, k) => {
      const x = -f.chest * 0.62 + k * 4.4;
      out += `<rect x="${n(x)}" y="${n(sh + 9)}" width="3.6" height="4" fill="${colour}" stroke="${ink.colour}" stroke-width="0.6"/>`;
      out += `<circle cx="${n(x + 1.8)}" cy="${n(sh + 15.5)}" r="1.8" fill="${CLOTH.gold}" stroke="${ink.colour}" stroke-width="0.6"/>`;
    });
  if (outfit.necklace && outfit.top !== 'kilt') {
    out += stroked(
      side
        ? `M${p2([-2, f.chin])}Q${p2([f.chest * 0.4, sh + 10])} ${p2([f.chest * 0.45, f.chin])}`
        : `M${p2([-f.chest * 0.45, f.chin - 1])}Q${p2([0, sh + 16])} ${p2([f.chest * 0.45, f.chin - 1])}`,
      CLOTH.gold,
      2.2,
    );
    if (!side)
      out += painted(
        circle([0, sh + 12.5], 2.6).d,
        { fill: CLOTH.gold, stroke: 'thin' },
        ink,
      );
  }
  return out;
}

const GOLDLINE = '#d9a92e';

/** The garment below the hips at rest (a tunic's, a robe's, a coat's tails), or none; its paint. */
export function skirtMarkup(
  f: Frame,
  outfit: Outfit,
  view: View,
  ink: Ink,
): { markup: string; shape: Shape } | null {
  const hem = hemOf(f, outfit.top);
  if (hem === null) return null;
  const side = view === 'side';
  const g = GARMENT[outfit.top];
  const y0 = f.hipY - 3;
  const top = side ? f.chest * DEPTH * 0.96 : f.hips + 0.4;
  const bottom = top + g.flare * (side ? 0.8 : 1);
  const fill =
    outfit.top === 'kilt'
      ? outfit.main
      : outfit.top === 'apron'
        ? outfit.accent === CLOTH.brown
          ? CLOTH.beige
          : outfit.accent
        : outfit.main;
  if (outfit.top === 'coat' && !side) {
    // Two tails, the legs between them.
    const tails = [-1, 1].map((s) =>
      rounded(
        [
          [s * 1.5, y0],
          [s * top, y0],
          [s * (bottom + 1), hem],
          [s * 3, hem - 2],
        ],
        3,
      ),
    );
    return {
      markup: tails.map((t) => painted(t.d, { fill }, ink)).join(''),
      shape: { d: tails.map((t) => t.d).join(''), box: unionBoxes(tails) },
    };
  }
  if (outfit.top === 'apron') {
    const a = side ? f.chest * 0.55 : f.waist * 0.75;
    const shape = rounded(
      [
        [side ? 0 : -a, y0],
        [side ? a + 1 : a, y0],
        [side ? a + 2 : a + 1, hem],
        [side ? -1 : -a - 1, hem],
      ],
      3,
    );
    return { markup: painted(shape.d, { fill }, ink), shape };
  }
  const shape = side
    ? rounded(
        [
          [-top, y0],
          [top, y0],
          [bottom * 0.95, hem],
          [-bottom * 1.05, hem],
        ],
        4,
      )
    : rounded(
        [
          [-top, y0],
          [top, y0],
          [bottom, hem],
          [-bottom, hem],
        ],
        4,
      );
  let markup = painted(shape.d, { fill }, ink);
  const lines: string[] = [];
  if (outfit.top === 'armour') {
    // Leather strips hanging from the belt over the tunic.
    const strips = side ? 3 : 6;
    const span = 2 * (top - 1);
    for (let k = 0; k < strips; k += 1) {
      const x = -top + 1 + (span * (k + 0.5)) / strips;
      lines.push(
        painted(
          rect(
            x - span / strips / 2 + 0.6,
            y0 + 2,
            span / strips - 1.2,
            (hem - y0) * 0.55,
            1,
          ).d,
          {
            fill:
              outfit.trim === CLOTH.gold
                ? '#8a5a35'
                : shadeOk(outfit.trim, 0.2),
            stroke: 'thin',
          },
          ink,
        ),
      );
    }
  } else if (outfit.top === 'unku' || outfit.top === 'gown') {
    // A band at the hem: woven squares, or ermine.
    const y = hem - 5.5;
    if (outfit.top === 'gown') {
      lines.push(
        painted(
          rounded(
            [
              [-bottom + 0.3, y],
              [bottom - 0.3, y],
              [bottom, hem],
              [-bottom, hem],
            ],
            1,
          ).d,
          { fill: '#f7f5ef', stroke: 'thin' },
          ink,
        ),
      );
    } else {
      let k = 0;
      for (let x = -bottom + 1; x < bottom - 1.5; x += 4.2, k += 1)
        lines.push(
          `<rect x="${n(x)}" y="${n(y)}" width="4.2" height="4.2" fill="${k % 2 ? outfit.trim : '#2b2727'}"/>`,
        );
    }
  } else if (
    outfit.top === 'robe' ||
    outfit.top === 'wide-robe' ||
    outfit.top === 'dress'
  ) {
    // A fold or two.
    lines.push(
      stroked(
        `M${p2([-top * 0.4, y0 + 6])}L${p2([-bottom * 0.45, hem - 2])}`,
        shadeOk(fill, 0.25),
        ink.thin,
      ),
      stroked(
        `M${p2([top * 0.35, y0 + 6])}L${p2([bottom * 0.4, hem - 2])}`,
        shadeOk(fill, 0.25),
        ink.thin,
      ),
    );
  } else if (outfit.top === 'toga') {
    lines.push(
      stroked(
        `M${p2([top * 0.6, y0 + 4])}Q${p2([0, hem - 6])} ${p2([-bottom * 0.5, hem - 1])}`,
        shadeOk(fill, 0.28),
        ink.thin,
      ),
    );
  }
  markup += lines.join('');
  return { markup, shape };
}

function unionBoxes(shapes: readonly Shape[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    const [x, y, w, h] = s.box;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  }
  return [x0, y0, x1 - x0, y1 - y0] as [number, number, number, number];
}

/** The colours of the arm: its sleeve's over the upper arm and the forearm, and a cuff. */
export function sleeveColours(
  outfit: Outfit,
  skin: string,
): { upper: string; fore: string; cuff: string | null; wide: boolean } {
  const g = GARMENT[outfit.top].sleeves;
  const upper =
    g === 'none'
      ? skin
      : outfit.top === 'armour'
        ? outfit.main
        : outfit.top === 'apron'
          ? outfit.main
          : outfit.main;
  const fore = g === 'long' || g === 'wide' ? upper : skin;
  const cuff =
    outfit.top === 'coat' || outfit.top === 'uniform'
      ? outfit.trim === CLOTH.gold
        ? '#c43b3b'
        : outfit.trim
      : outfit.top === 'gown'
        ? '#f7f5ef'
        : null;
  return { upper, fore, cuff, wide: g === 'wide' };
}

/** What is worn on the legs, and the feet. */
export function legColours(
  outfit: Outfit,
  skin: string,
): { leg: string; boot: string | null; foot: string; straps: boolean } {
  const leg = outfit.trousers ? outfit.legs : skin;
  const boot =
    outfit.feet === 'boots'
      ? outfit.legs === CLOTH.black
        ? '#5a3a24'
        : '#3a2c26'
      : null;
  const foot =
    outfit.feet === 'bare'
      ? skin
      : outfit.feet === 'sandals'
        ? skin
        : (boot ?? '#3b3238');
  return { leg, boot, foot, straps: outfit.feet === 'sandals' };
}

/** A shoe or a bare foot at rest, round its ankle: facing the camera it turns out a little; in profile it points ahead. */
export function footShape(ankle: Pt, s: 1 | -1, view: View, f: Frame): Shape {
  const k = f.leg / 6.6;
  if (view === 'side')
    return rounded(
      [
        [ankle[0] - 5.5 * k, ankle[1] - 3 * k],
        [ankle[0] + 4 * k, ankle[1] - 3.5 * k],
        [ankle[0] + 12 * k, ankle[1] + 2.5 * k],
        [ankle[0] + 12 * k, -ankle[1] * 0 + 0],
        [ankle[0] - 5.5 * k, 0],
      ],
      3.5 * k,
    );
  return ellipse(
    [ankle[0] + s * 2.6 * k, -3.9 * k],
    7.6 * k,
    4.4 * k,
    s * 0.12,
  );
}

/** Sandal straps over a bare foot and up the shin, as lines. */
export function strapLines(
  ankle: Pt,
  knee: Pt,
  ink: Ink,
  roman: boolean,
): string {
  const a = ankle;
  let d = `M${p2([a[0] - 6, a[1] + 3])}L${p2([a[0] + 6, a[1] + 3])}`;
  if (roman)
    for (const t of [0.3, 0.6])
      d += `M${p2([a[0] - 6, a[1] + (knee[1] - a[1]) * t])}L${p2([a[0] + 6, a[1] + (knee[1] - a[1]) * t - 1])}`;
  return stroked(d, '#7a4f2e', ink.thin * 1.4);
}

/** A boot's upper over the shin, from mid-shin to the ankle. */
export function bootShape(knee: Pt, ankle: Pt, r: number): Shape {
  const top: Pt = [
    knee[0] + (ankle[0] - knee[0]) * 0.3,
    knee[1] + (ankle[1] - knee[1]) * 0.3,
  ];
  return capsule(top, r * 1.08, ankle, r * 1.05);
}

/** A wide sleeve at rest round its forearm, from the elbow to past the wrist. */
export function wideSleeve(elbow: Pt, wrist: Pt, r: number): Shape {
  const dx = wrist[0] - elbow[0];
  const dy = wrist[1] - elbow[1];
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const u: Pt = [dx / len, dy / len];
  const nn: Pt = [-u[1], u[0]];
  const at = (a: number, b: number): Pt => [
    elbow[0] + u[0] * a + nn[0] * b,
    elbow[1] + u[1] * a + nn[1] * b,
  ];
  return rounded(
    [
      at(-r * 0.6, -r * 1.05),
      at(-r * 0.6, r * 1.05),
      at(len + r * 0.5, r * 2.1),
      at(len + r * 0.5, -r * 2.1),
    ],
    r * 0.7,
  );
}

/** Shoulder plates or epaulettes over the top of the arm, at rest round the shoulder. */
export function shoulderPiece(
  outfit: Outfit,
  shoulder: Pt,
  elbow: Pt,
  r: number,
  ink: Ink,
): string {
  if (outfit.top === 'armour' && outfit.armour === 'bands') {
    let out = '';
    for (const k of [0, 1]) {
      const a: Pt = [
        shoulder[0] + (elbow[0] - shoulder[0]) * (0.05 + k * 0.28),
        shoulder[1] + (elbow[1] - shoulder[1]) * (0.05 + k * 0.28),
      ];
      out += painted(
        ellipse(
          a,
          r * 1.35,
          r * 0.75,
          Math.atan2(elbow[1] - shoulder[1], elbow[0] - shoulder[0]) +
            Math.PI / 2,
        ).d,
        { fill: k ? '#c3cad1' : '#b0b8c0', stroke: 'thin' },
        ink,
      );
    }
    return out;
  }
  if (outfit.top === 'uniform' && outfit.trim === CLOTH.gold) {
    const e = ellipse([shoulder[0], shoulder[1] - 0.5], r * 1.45, r * 0.7);
    return (
      painted(e.d, { fill: CLOTH.gold, stroke: 'thin' }, ink) +
      stroked(
        `M${p2([shoulder[0] - r * 1.2, shoulder[1] + 0.5])}L${p2([shoulder[0] - r * 1.25, shoulder[1] + 4])}M${p2([shoulder[0], shoulder[1] + 0.8])}L${p2([shoulder[0], shoulder[1] + 4.5])}M${p2([shoulder[0] + r * 1.2, shoulder[1] + 0.5])}L${p2([shoulder[0] + r * 1.25, shoulder[1] + 4])}`,
        CLOTH.gold,
        1.3,
      )
    );
  }
  return '';
}

/** A cloak behind the body at rest: from the shoulders to the calves, flaring. */
export function capeShape(f: Frame, view: View): Shape {
  const side = view === 'side';
  const y0 = f.chin + 1;
  const hem = f.kneeY * 0.35;
  return side
    ? blob(
        [
          [-2, y0],
          [-f.chest * 0.6, y0 + 2],
          [-f.chest * 1.1, hem],
          [-f.chest * 0.1, hem + 2],
          [f.chest * 0.2, f.hipY],
        ],
        0.6,
      )
    : rounded(
        [
          [-f.chest * 0.95, y0],
          [f.chest * 0.95, y0],
          [f.chest * 1.4, hem],
          [-f.chest * 1.4, hem],
        ],
        6,
      );
}

export { mixOk };
export type { Paint };
