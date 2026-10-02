/**
 * Things moving from one to another at full frame: money from the South
 * to the North, papers from a press to its readers, people from a village
 * to a city. Two ends, each its name large on a sheet edged in its side's
 * colour, and an arc from one to the other with the tokens standing along
 * it as they travel; a word or two on the arc says what moves. Side by
 * side in a wide frame, one over the other in a tall one.
 *
 * Parts: the ends `from` and `to`; the arc `arc` (its path, from the first
 * to the second: what the transfer recipe moves tokens along); the tokens
 * `token-<n>` along it; what moves, `label`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { iconPaths } from '../scene-icon-set';
import { readTransfer, type TransferDraft } from '../scene-transfer';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  coloursFor,
  defsPrefix,
  esc,
  extraOf,
  fitBalanced,
  frameOf,
  linesBox,
  mainColour,
  paintOf,
  partSvg,
  r1,
  textSvg,
  union,
  wordsWithin,
} from './shot-chart-kit';

/** How many tokens stand along the arc. */
export const TOKENS = 5;

/** A transfer as the writer gives it, or as code keeps it (its ends objects). */
function draftOf(raw: Record<string, unknown>): TransferDraft {
  const body = bodyOf('transfer', raw);
  const end = (v: unknown) =>
    v && typeof v === 'object'
      ? ((v as { label?: string }).label ?? null)
      : (v as string | null);
  return {
    from: end(body.from),
    to: end(body.to),
    token: (body.token as string | null) ?? null,
    label: (body.label as string | null) ?? null,
    shut: (body.shut as boolean | null) ?? null,
  };
}

/** A cubic's point at t. */
const bez = (t: number, a: number, b: number, c: number, d: number) =>
  (1 - t) ** 3 * a +
  3 * (1 - t) ** 2 * t * b +
  3 * (1 - t) * t ** 2 * c +
  t ** 3 * d;

export function transferAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const extra = extraOf('transfer', raw);
  // Its words kept whole within the lengths the reader keeps them to.
  const spec = readTransfer(
    wordsWithin(draftOf(raw), { from: 32, to: 32, label: 24 }),
    extra.name,
    extra,
  );
  if (!spec) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const tall = shape === 'tall';
  const { text } = frame;
  const floor = frame.size.label;
  const [fromColour, toColour] = coloursFor(paint, [
    { name: spec.from.label, token: spec.from.colour },
    { name: spec.to.label, token: spec.to.colour },
  ]);
  const tokenColour = mainColour(paint, spec.colour);
  const prefix = defsPrefix(
    `transfer|${spec.from.label}|${spec.to.label}|${spec.token}`,
  );
  const symbol = `${prefix}-${spec.token}`;
  const out: string[] = [
    `<defs><symbol id="${symbol}" viewBox="0 0 100 100">${iconPaths(spec.token)}</symbol></defs>`,
  ];
  const stroke = Math.max(3, frame.H * 0.004);
  // The two ends: sheets with their names, edged in their sides' colours.
  // The two ends side by side: across a wide frame, at the top of a tall
  // one's words (the arc then swoops down the frame between them).
  const boxW = tall ? (text.x1 - text.x0 - floor * 0.8) / 2 : frame.W * 0.27;
  const nameOf = (label: string) =>
    fitBalanced(
      label,
      boxW - floor * 1.2,
      frame.size.title,
      floor,
      2,
      700,
      'display',
    );
  const names = [nameOf(spec.from.label), nameOf(spec.to.label)];
  const boxH = Math.max(
    ...names.map((n) => n.lines.length * n.size * 1.1 + floor * 1.4),
    tall ? floor * 2.4 : frame.H * 0.24,
  );
  const tokenSize = floor * 1.5;
  const laid = (): {
    a: ShotBox;
    b: ShotBox;
    p0: [number, number];
    c1: [number, number];
    c2: [number, number];
    p3: [number, number];
  } => {
    if (tall) {
      // The ends inside the band, at its top; the arc leaves the first's
      // foot, swoops down the frame (a picture may run past the words) and
      // comes back up into the second's.
      const a: ShotBox = [text.x0, text.y0, boxW, boxH];
      const b: ShotBox = [text.x1 - boxW, text.y0, boxW, boxH];
      const p0: [number, number] = [a[0] + boxW / 2, a[1] + boxH];
      const p3: [number, number] = [b[0] + boxW / 2, b[1] + boxH];
      const lowest = frame.H * 0.84;
      const deep = p0[1] + (lowest - p0[1]) / 0.75;
      return { a, b, p0, p3, c1: [p0[0], deep], c2: [p3[0], deep] };
    }
    // Side by side at the foot of the words' area, the arc rising over the
    // middle to just under the words at its top.
    const y = text.y1 - boxH;
    const a: ShotBox = [text.x0, y, boxW, boxH];
    const b: ShotBox = [text.x1 - boxW, y, boxW, boxH];
    const p0: [number, number] = [a[0] + boxW * 0.62, a[1]];
    const p3: [number, number] = [b[0] + boxW * 0.38, b[1]];
    const ceiling = text.y0 + (spec.label ? floor * 1.5 : 0) + tokenSize * 0.6;
    const rise = (y - ceiling) / 0.75;
    return {
      a,
      b,
      p0,
      p3,
      c1: [p0[0] + (p3[0] - p0[0]) * 0.1, p0[1] - rise],
      c2: [p0[0] + (p3[0] - p0[0]) * 0.9, p3[1] - rise],
    };
  };
  const { a, b, p0, c1, c2, p3 } = laid();
  const path = `M${r1(p0[0])} ${r1(p0[1])}C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p3[0])} ${r1(p3[1])}`;
  const samples = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    return [
      bez(t, p0[0], c1[0], c2[0], p3[0]),
      bez(t, p0[1], c1[1], c2[1], p3[1]),
    ] as const;
  });
  const arcBox = union(...samples.map(([x, y]): ShotBox => [x, y, 0, 0]));
  book.add('arc', { box: arcBox, path, role: 'muted' });
  out.push(
    partSvg(
      'arc',
      `<path d="${path}" fill="none" stroke="${esc(paint.rule)}" stroke-width="${r1(stroke * 1.6)}" stroke-dasharray="${r1(floor * 0.3)} ${r1(floor * 0.28)}" stroke-linecap="round"/>`,
    ),
  );
  // The tokens along it, as they travel: not at its ends, where the sheets are.
  const tokens: string[] = [];
  const tokenBoxes: ShotBox[] = [];
  for (let k = 0; k < TOKENS; k += 1) {
    const t = 0.2 + (0.6 * k) / (TOKENS - 1);
    const x = bez(t, p0[0], c1[0], c2[0], p3[0]) - tokenSize / 2;
    const y = bez(t, p0[1], c1[1], c2[1], p3[1]) - tokenSize / 2;
    const id = `token-${k + 1}`;
    const box: ShotBox = [x, y, tokenSize, tokenSize];
    book.add(id, { box, role: tokenColour.role, pivot: [0.5, 0.5] });
    tokenBoxes.push(box);
    tokens.push(
      `<use data-part="${id}" href="#${symbol}" x="${r1(x)}" y="${r1(y)}" width="${r1(tokenSize)}" height="${r1(tokenSize)}"/>`,
    );
  }
  book.add('tokens', { box: union(...tokenBoxes), role: tokenColour.role });
  out.push(
    partSvg('tokens', tokens.join(''), ` fill="${esc(tokenColour.colour)}"`),
  );
  // The ends, over the arc's ends.
  const end = (
    id: 'from' | 'to',
    box: ShotBox,
    i: number,
    colour: { colour: string; role?: string },
  ) => {
    const name = names[i];
    const [x, y, w, h] = box;
    const textH = name.lines.length * name.size * 1.1;
    const base = y + (h - textH) / 2 + name.size * ASCENT;
    book.add(id, { box, role: colour.role });
    out.push(
      partSvg(
        id,
        `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(floor * 0.3)}" fill="${esc(paint.sheet)}" stroke="${esc(colour.colour)}" stroke-width="${r1(stroke * 2)}"/>` +
          textSvg(name.lines, x + w / 2, base, {
            size: name.size,
            fill: paint.ink,
            family: paint.display,
            anchor: 'middle',
            leading: 1.1,
          }),
      ),
    );
  };
  end('from', a, 0, fromColour);
  end('to', b, 1, toColour);
  // What moves, written by the arc's top (beside it in a tall frame).
  if (spec.label) {
    const size = floor;
    // Over the arc's top in a wide frame; inside its swoop, under the ends, in a tall one.
    const at: [number, number] = tall
      ? [
          frame.W / 2 - (frame.W / 2 - (text.x0 + text.x1) / 2),
          a[1] + a[3] + floor * 1.3,
        ]
      : [frame.W / 2, arcBox[1] - tokenSize / 2 - floor * 0.7];
    const anchor = 'middle';
    const box = linesBox(
      [spec.label],
      at[0],
      at[1] + size * 0.35,
      size,
      anchor,
      1.15,
      700,
    );
    book.add('label', { box, role: 'ink' });
    out.push(
      textSvg(
        [spec.label],
        at[0],
        at[1] + size * 0.35,
        { size, fill: paint.ink, family: paint.text, anchor },
        'label',
      ),
    );
  }
  const focal = union(a, b, arcBox, book.parts.label?.box);
  return assetOf(frame, paint, out.join(''), book, focal);
}
