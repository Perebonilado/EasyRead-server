/**
 * Numbers as pictures, for a young learner: what a sum does, shown. Two
 * amounts put together as blocks or bars; one taken from another, the
 * part taken away crossed through; a times table as rows of dots;
 * sharing as dots in groups; a fraction as a bar cut into equal parts,
 * some shaded. Drawn by code under the working it pictures, so the
 * picture and the sum are always the same numbers.
 */
import type { MathLine } from './scene-math';

export type NumberPicture =
  | { kind: 'add'; a: number; b: number }
  | { kind: 'take'; a: number; b: number }
  | { kind: 'times'; a: number; b: number }
  | { kind: 'share'; a: number; b: number }
  | { kind: 'fraction'; n: number; d: number };

const whole = (text: string) => {
  const n = Number(text.replace(/\{,\}|,/g, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * The picture a working's sum can be drawn as, from the last line that is
 * one, so the picture is of what the working comes to (60 + 15 = 75, not
 * the 40 + 20 on the way): two whole numbers and a sign (47 + 28, 120 −
 * 36, 6 × 7, 12 ÷ 3), or a fraction (3/4). None for anything bigger than
 * a picture can show a child plainly.
 */
export function numberPicture(
  lines: readonly MathLine[],
): NumberPicture | null {
  for (const line of [...lines].reverse()) {
    const tex = line.latex.replace(/\\term\{[^{}]*\}\{([^{}]*)\}/g, '$1');
    const sum =
      /^\s*=?\s*(\d[\d{},]*)\s*(\+|-|−|\\times|×|\\cdot|\\div|÷)\s*(\d[\d{},]*)\s*(?:=|$)/u.exec(
        tex,
      );
    if (sum) {
      const a = whole(sum[1]);
      const b = whole(sum[3]);
      if (a === null || b === null) continue;
      const sign = sum[2];
      if (sign === '+' && a + b <= 1000) return { kind: 'add', a, b };
      if ((sign === '-' || sign === '−') && b < a && a <= 1000)
        return { kind: 'take', a, b };
      if (/times|×|cdot/u.test(sign) && a <= 12 && b <= 12)
        return { kind: 'times', a, b };
      if (/div|÷/u.test(sign) && b <= 10 && a <= 60 && a % b === 0)
        return { kind: 'share', a, b };
      continue;
    }
    const fraction = /\\frac\{(\d+)\}\{(\d+)\}/.exec(tex);
    if (fraction) {
      const n = Number(fraction[1]);
      const d = Number(fraction[2]);
      if (d >= 2 && d <= 12 && n >= 1 && n <= d)
        return { kind: 'fraction', n, d };
    }
  }
  return null;
}

const INK = '#2d2a32';
const ONE = '#4a8fd9';
const TWO = '#f0924a';
const GONE = '#e7e2d8';
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Text in the picture, as the kit's labels are set. */
const label = (x: number, y: number, text: string, size = 44) =>
  `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" font-weight="700" text-anchor="middle" fill="${INK}" font-family="Plus Jakarta Sans, sans-serif">${text}</text>`;

/**
 * The picture, drawn in a box 1000 across: its markup and how tall it is.
 * Small amounts are blocks a child can count; bigger ones are bars.
 */
export function drawNumbers(picture: NumberPicture): {
  markup: string;
  height: number;
} {
  const out: string[] = [];
  const W = 1000;
  switch (picture.kind) {
    case 'add':
    case 'take': {
      const { a, b } = picture;
      const total = picture.kind === 'add' ? a + b : a;
      if (total <= 20) {
        // Blocks to count, in two colours; those taken away crossed through.
        const size = Math.min(84, (W - 40) / total - 8);
        // Centred, so a few blocks sit under the middle of the sum.
        const from = (W - (total * (size + 8) - 8)) / 2;
        for (let i = 0; i < total; i += 1) {
          const x = from + i * (size + 8);
          const taken = picture.kind === 'take' && i >= a - b;
          const colour =
            picture.kind === 'add' ? (i < a ? ONE : TWO) : taken ? GONE : ONE;
          out.push(
            `<rect x="${r1(x)}" y="70" width="${r1(size)}" height="${r1(size)}" rx="6" fill="${colour}" stroke="${INK}" stroke-width="3"/>`,
          );
          if (taken)
            out.push(
              `<path d="M${r1(x + 6)},${r1(76)} L${r1(x + size - 6)},${r1(64 + size)}" stroke="#d9534f" stroke-width="5" stroke-linecap="round"/>`,
            );
        }
        out.push(
          label(
            W / 2,
            50,
            picture.kind === 'add'
              ? `${a} + ${b} = ${a + b}`
              : `${a} − ${b} = ${a - b}`,
          ),
        );
        return { markup: out.join(''), height: 70 + size + 20 };
      }
      // Bars: the whole, and its two parts.
      const k = (W - 40) / total;
      const first = picture.kind === 'add' ? a : a - b;
      const second = b;
      out.push(
        `<rect x="20" y="80" width="${r1(first * k)}" height="70" rx="8" fill="${ONE}" stroke="${INK}" stroke-width="3"/>`,
        `<rect x="${r1(20 + first * k)}" y="80" width="${r1(second * k)}" height="70" rx="8" fill="${picture.kind === 'add' ? TWO : GONE}" stroke="${INK}" stroke-width="3" ${picture.kind === 'take' ? 'stroke-dasharray="10 8"' : ''}/>`,
        label(
          20 + (first * k) / 2,
          128,
          String(picture.kind === 'add' ? a : a - b),
          40,
        ),
        label(
          20 + first * k + (second * k) / 2,
          128,
          picture.kind === 'add' ? String(b) : `−${b}`,
          40,
        ),
        `<path d="M20,64 L20,52 L${r1(20 + total * k)},52 L${r1(20 + total * k)},64" fill="none" stroke="${INK}" stroke-width="3"/>`,
        label(20 + (total * k) / 2, 40, String(total), 40),
      );
      return { markup: out.join(''), height: 170 };
    }
    case 'times': {
      // Rows of dots: a rows of b.
      const { a, b } = picture;
      const gap = Math.min(80, (W - 40) / Math.max(b, 1));
      const r = Math.min(26, gap * 0.36);
      const from = (W - b * gap) / 2;
      for (let row = 0; row < a; row += 1)
        for (let col = 0; col < b; col += 1)
          out.push(
            `<circle cx="${r1(from + gap / 2 + col * gap)}" cy="${r1(70 + gap / 2 + row * gap)}" r="${r1(r)}" fill="${row % 2 ? ONE : TWO}" stroke="${INK}" stroke-width="2.5"/>`,
          );
      out.push(label(W / 2, 48, `${a} rows of ${b}`, 40));
      return { markup: out.join(''), height: 70 + a * gap + 10 };
    }
    case 'share': {
      // Shared into b groups, each ring holding a / b dots.
      const { a, b } = picture;
      const each = a / b;
      const ring = Math.min(210, (W - 40) / b - 12);
      const from = (W - (b * (ring + 12) - 12)) / 2;
      for (let g = 0; g < b; g += 1) {
        const cx = from + ring / 2 + g * (ring + 12);
        out.push(
          `<circle cx="${r1(cx)}" cy="${r1(80 + ring / 2)}" r="${r1(ring / 2)}" fill="#fbf7ee" stroke="${INK}" stroke-width="3"/>`,
        );
        for (let i = 0; i < each; i += 1) {
          const angle = (i / each) * Math.PI * 2;
          const d = each > 1 ? ring * 0.28 : 0;
          out.push(
            `<circle cx="${r1(cx + Math.cos(angle) * d)}" cy="${r1(80 + ring / 2 + Math.sin(angle) * d)}" r="${r1(Math.min(14, ring / 9))}" fill="${ONE}" stroke="${INK}" stroke-width="2"/>`,
          );
        }
      }
      out.push(
        label(W / 2, 52, `${a} shared into ${b} groups: ${each} each`, 38),
      );
      return { markup: out.join(''), height: 80 + ring + 20 };
    }
    case 'fraction': {
      // A bar in d equal parts, n shaded.
      const { n, d } = picture;
      const part = (W - 40) / d;
      for (let i = 0; i < d; i += 1)
        out.push(
          `<rect x="${r1(20 + i * part)}" y="70" width="${r1(part)}" height="80" fill="${i < n ? ONE : '#ffffff'}" stroke="${INK}" stroke-width="3"/>`,
        );
      out.push(label(W / 2, 50, `${n} of ${d} equal parts`, 40));
      return { markup: out.join(''), height: 170 };
    }
  }
}
