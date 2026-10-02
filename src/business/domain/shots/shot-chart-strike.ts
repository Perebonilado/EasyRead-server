/**
 * Words struck out and replaced, at full frame: a decision changed, a
 * promise rewritten ("IF" becomes "HOW"; "1956" becomes "AS SOON AS
 * PRACTICABLE"). The words that stood are set large in ink; a line runs
 * through them; the new words stand under them in the accent, as an
 * editor corrects a page.
 *
 * Parts: the words that stood `old`; the line through them `strike` (its
 * path, for a recipe to draw on) and the new words `new`, both of the
 * picture's later state; a few words over them, `label`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { readStrike, type StrikeDraft } from '../scene-strike';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  esc,
  extraOf,
  fit,
  frameOf,
  linesBox,
  mainColour,
  paintOf,
  r1,
  textSvg,
  union,
  wordsWidth,
  wordsWithin,
} from './shot-chart-kit';

export function strikeAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const extra = extraOf('strike', raw);
  // Its words kept whole within the lengths the reader keeps them to.
  const read = readStrike(
    wordsWithin(bodyOf('strike', raw) as unknown as StrikeDraft, {
      from: 40,
      to: 40,
      label: 32,
    }),
    extra,
  );
  if (!read) return null;
  const label = read.label ?? (extra.name || null);
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const tall = shape === 'tall';
  const { text } = frame;
  const floor = frame.size.label;
  const colour = mainColour(paint, read.colour);
  const x = tall ? text.x0 : text.x0 + frame.W * 0.05;
  const width = text.x1 - x;
  const kicker = label
    ? fit(label.toUpperCase(), width, floor, floor, 1, 700)
    : null;
  const kickerH = kicker ? floor * 1.5 : 0;
  // The two as large as the area lets them be, the new words no smaller than the old.
  const band = text.y1 - text.y0 - kickerH;
  let old = fit(
    read.from,
    width,
    frame.size.hero * 1.3,
    floor,
    2,
    700,
    'display',
  );
  let fresh = fit(
    read.to,
    width,
    frame.size.hero * 1.3,
    floor,
    2,
    700,
    'display',
  );
  const height = () =>
    old.lines.length * old.size * 1.08 +
    floor * 0.6 +
    fresh.lines.length * fresh.size * 1.08;
  for (
    let k = 0;
    k < 40 && height() > band && (old.size > floor || fresh.size > floor);
    k += 1
  ) {
    const s = Math.max(floor, Math.max(old.size, fresh.size) * 0.94);
    old = fit(
      read.from,
      width,
      Math.min(old.size, s),
      floor,
      2,
      700,
      'display',
    );
    fresh = fit(
      read.to,
      width,
      Math.min(fresh.size, s),
      floor,
      2,
      700,
      'display',
    );
  }
  const top = text.y0 + Math.max(0, (band - height()) * 0.45);
  const out: string[] = [];
  let y = top;
  if (kicker) {
    const base = y + floor * ASCENT;
    const box = linesBox(kicker.lines, x, base, floor, 'start', 1.15, 700);
    book.add('label', { box, role: 'muted' });
    out.push(
      textSvg(
        kicker.lines,
        x,
        base,
        {
          size: floor,
          fill: paint.muted,
          family: paint.text,
          weight: 700,
          spacing: floor * 0.06,
        },
        'label',
      ),
    );
    y += kickerH;
  }
  const oldBase = y + old.size * ASCENT;
  const oldBox = linesBox(
    old.lines,
    x,
    oldBase,
    old.size,
    'start',
    1.08,
    700,
    'display',
  );
  book.add('old', { box: oldBox, role: 'ink' });
  out.push(
    textSvg(
      old.lines,
      x,
      oldBase,
      { size: old.size, fill: paint.ink, family: paint.display, leading: 1.08 },
      'old',
    ),
  );
  // The line through each line of the old words, a little rising, as a pen strikes.
  const stroke = Math.max(6, old.size * 0.085);
  const segments = old.lines.map((line, i) => {
    const w =
      wordsWidth(line, old.size, 700, 'display') / 1.06 + old.size * 0.12;
    const mid = oldBase + i * old.size * 1.08 - old.size * 0.3;
    const x0 = x - old.size * 0.06;
    return `M${r1(x0)} ${r1(mid + stroke * 0.5)}L${r1(x0 + w)} ${r1(mid - stroke * 0.5)}`;
  });
  const path = segments.join('');
  book.add('strike', {
    box: [
      oldBox[0] - old.size * 0.06,
      oldBox[1],
      oldBox[2] + old.size * 0.12,
      oldBox[3],
    ],
    path,
    role: colour.role,
    later: true,
  });
  out.push(
    `<path data-part="strike" d="${path}" fill="none" stroke="${esc(colour.colour)}" stroke-width="${r1(stroke)}" stroke-linecap="round"/>`,
  );
  y = oldBox[1] + oldBox[3] + floor * 0.6;
  const freshBase = y + fresh.size * ASCENT;
  const freshBox = linesBox(
    fresh.lines,
    x,
    freshBase,
    fresh.size,
    'start',
    1.08,
    700,
    'display',
  );
  book.add('new', { box: freshBox, role: colour.role, later: true });
  out.push(
    textSvg(
      fresh.lines,
      x,
      freshBase,
      {
        size: fresh.size,
        fill: colour.colour,
        family: paint.display,
        leading: 1.08,
      },
      'new',
    ),
  );
  const focal: ShotBox = union(oldBox, freshBox, book.parts.label?.box);
  return assetOf(frame, paint, out.join(''), book, focal);
}
