/**
 * An official paper or a newspaper at full frame: a sheet laid on the
 * paper, as tall as the frame lets it be, with its title, a headline in
 * type when it has one, and its lines as grey bars (never real text: an
 * article's words would be invented, and too small to read). A paper ends
 * in a signature the pen can draw on; either can be stamped
 * ("NOT RECOMMENDED", "APPROVED"), the stamp being of its later state.
 *
 * Parts: the sheet `page`; its `title` and `headline`; its grey `lines`; a
 * paper's `signature` (its path); the `stamp`, later.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { readDocument, type DocumentDraft } from '../scene-document';
import { seedOf } from '../scene-infographic-style';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  colourOf,
  esc,
  extraOf,
  fit,
  frameOf,
  linesBox,
  paintOf,
  partSvg,
  r1,
  textSvg,
  union,
  wordsWidth,
  wordsWithin,
} from './shot-chart-kit';

export function documentAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const extra = extraOf('document', raw);
  // Its words kept whole within the lengths the reader keeps them to.
  const spec = readDocument(
    wordsWithin(bodyOf('document', raw) as unknown as DocumentDraft, {
      title: 48,
      headline: 60,
      stamp: 24,
    }),
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
  const random = seedOf(`${spec.title}|${spec.headline ?? ''}`);
  const newspaper = spec.style === 'newspaper';
  // The sheet: in a wide frame as tall as the frame and centred; in a tall
  // one as wide as the words' area, from just over it down the frame.
  let pageH = tall ? frame.H * 0.8 : frame.H * 0.9;
  // A tall frame's sheet spans the picture; its words stay inside the safe edge.
  const pageW = tall
    ? frame.pic.x1 - frame.pic.x0
    : Math.min(frame.W * 0.62, pageH * (newspaper ? 0.92 : 0.74));
  const px = tall ? frame.pic.x0 : (frame.W - pageW) / 2;
  const py = tall ? text.y0 - floor * 0.6 : (frame.H - pageH) / 2;
  const pad = Math.max(pageW * 0.07, floor * 0.6);
  const inner = tall ? text.x1 - px - pad : pageW - pad * 2;
  const out: string[] = [];
  const stroke = Math.max(2.5, frame.H * 0.003);
  // The sheet goes under everything, once its height is known.
  out.push('');
  let y = py + pad;
  const title = fit(
    newspaper ? spec.title.toUpperCase() : spec.title,
    inner,
    newspaper ? frame.size.title * 1.15 : frame.size.title,
    floor,
    3,
    700,
    'display',
  );
  const titleX = newspaper ? px + pad + inner / 2 : px + pad;
  const anchor = newspaper ? 'middle' : 'start';
  const titleBase = y + title.size * ASCENT;
  const titleBox = linesBox(
    title.lines,
    titleX,
    titleBase,
    title.size,
    anchor,
    1.1,
    700,
    'display',
  );
  book.add('title', { box: titleBox, role: 'ink' });
  out.push(
    textSvg(
      title.lines,
      titleX,
      titleBase,
      {
        size: title.size,
        fill: paint.ink,
        family: paint.display,
        anchor,
        leading: 1.1,
        spacing: newspaper ? title.size * 0.03 : undefined,
      },
      'title',
    ),
  );
  y = titleBox[1] + titleBox[3] + floor * 0.35;
  // A masthead's two rules, or a paper's short one under its title.
  out.push(
    newspaper
      ? `<rect x="${r1(px + pad)}" y="${r1(y)}" width="${r1(inner)}" height="${r1(stroke * 1.6)}" fill="${esc(paint.ink)}"/>` +
          `<rect x="${r1(px + pad)}" y="${r1(y + stroke * 3)}" width="${r1(inner)}" height="${r1(stroke * 0.7)}" fill="${esc(paint.ink)}"/>`
      : `<rect x="${r1(px + pad)}" y="${r1(y)}" width="${r1(inner * 0.32)}" height="${r1(stroke * 1.4)}" fill="${esc(paint.ink)}"/>`,
  );
  y += stroke * 3 + floor * 0.7;
  if (spec.headline) {
    const head = fit(
      newspaper ? spec.headline.toUpperCase() : spec.headline,
      inner,
      newspaper ? frame.size.title * 1.2 : floor * 1.1,
      floor,
      tall ? 5 : 4,
      700,
      newspaper ? 'display' : 'text',
    );
    const base = y + head.size * ASCENT;
    const box = linesBox(
      head.lines,
      titleX,
      base,
      head.size,
      anchor,
      1.1,
      700,
      newspaper ? 'display' : 'text',
    );
    book.add('headline', { box, role: 'ink' });
    out.push(
      textSvg(
        head.lines,
        titleX,
        base,
        {
          size: head.size,
          fill: paint.ink,
          family: newspaper ? paint.display : paint.text,
          anchor,
          leading: 1.1,
        },
        'headline',
      ),
    );
    y = box[1] + box[3] + floor * 0.6;
  }
  // The body: grey bars, each its own length, in paragraphs (a paper) or
  // columns (a newspaper); a tall frame's page grows to hold some under
  // its words, and runs on past the frame's foot when it must.
  const bar = Math.max(floor * 0.22, pageW * 0.016);
  const step = bar * 2.6;
  const bodyTop = y;
  const sign = newspaper ? 0 : floor * 1.6;
  if (tall) pageH = Math.max(pageH, bodyTop - py + step * 8 + pad + sign);
  const foot = py + pageH - pad - sign;
  const bars: string[] = [];
  const cols = newspaper ? (tall ? 2 : 3) : 1;
  const colGap = pad * 0.5;
  const colW = (inner - colGap * (cols - 1)) / cols;
  for (let c = 0; c < cols; c += 1) {
    let by = y;
    let run = 0;
    let paragraph = 3 + Math.floor(random() * 3);
    while (by + bar <= foot) {
      run += 1;
      const last = run === paragraph;
      const length = last ? 0.35 + random() * 0.3 : 0.84 + random() * 0.16;
      bars.push(
        `<rect x="${r1(px + pad + c * (colW + colGap))}" y="${r1(by)}" width="${r1(colW * length)}" height="${r1(bar)}" rx="${r1(bar / 2)}"/>`,
      );
      by += step;
      if (last) {
        by += step * 0.5;
        run = 0;
        paragraph = 3 + Math.floor(random() * 3);
      }
    }
  }
  book.add('lines', {
    box: [px + pad, y, inner, Math.max(0, foot - y)],
    role: 'muted',
  });
  out.push(partSvg('lines', bars.join(''), ` fill="${esc(paint.rule)}"`));
  if (!newspaper) {
    // A signature at the foot: a pen's line the draw recipe can write.
    const sx = px + pad;
    const sy = py + pageH - pad - floor * 0.2;
    const w = Math.min(inner * 0.42, floor * 6);
    const h = floor * 0.7;
    const d =
      `M${r1(sx)} ${r1(sy)}c${r1(w * 0.12)} ${r1(-h * 1.3)} ${r1(w * 0.22)} ${r1(h * 0.7)} ${r1(w * 0.32)} ${r1(-h * 0.3)}` +
      `s${r1(w * 0.18)} ${r1(h * 0.8)} ${r1(w * 0.3)} ${r1(-h * 0.1)}s${r1(w * 0.2)} ${r1(-h * 0.5)} ${r1(w * 0.38)} ${r1(h * 0.1)}`;
    book.add('signature', {
      box: [sx, sy - h * 1.1, w * 1.05, h * 1.6],
      path: d,
      role: 'ink',
    });
    out.push(
      `<path data-part="signature" d="${d}" fill="none" stroke="${esc(paint.ink)}" stroke-width="${r1(stroke * 1.2)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  out[0] = partSvg(
    'page',
    `<rect x="${r1(px)}" y="${r1(py)}" width="${r1(pageW)}" height="${r1(pageH)}" rx="${r1(floor * 0.12)}" fill="${esc(paint.sheet)}" stroke="${esc(paint.edge)}" stroke-width="${r1(stroke)}"/>`,
  );
  book.add('page', { box: [px, py, pageW, pageH], role: 'ink' });
  if (spec.stamp) {
    // The stamp: a double-ruled box of words, turned, over the body, below
    // the headline it would hide (a tall frame's as wide as its picture).
    const colour = colourOf(paint, null, spec.colour ?? 'bad', 0);
    const room = tall ? (frame.pic.x1 - frame.pic.x0) * 0.8 : pageW * 0.78;
    const words = fit(
      spec.stamp.toUpperCase(),
      room,
      frame.size.title,
      floor,
      2,
      700,
    );
    const ww =
      Math.max(...words.lines.map((l) => wordsWidth(l, words.size, 700))) +
      words.size * 1.1;
    const wh = words.lines.length * words.size * 1.1 + words.size * 0.8;
    const cx = tall ? (frame.pic.x0 + frame.pic.x1) / 2 : px + pageW / 2;
    // Over the body, below the headline it would hide; a tall frame's inside the safe band.
    const lowest = tall
      ? Math.min(foot, text.y1) - wh * 0.62
      : foot - wh * 0.62;
    const cy = Math.max(
      bodyTop + wh * 0.62,
      Math.min(lowest, (bodyTop + foot) / 2),
    );
    const ring = Math.max(4, words.size * 0.08);
    const turn = tall ? -5 : -8;
    const inside =
      `<rect x="${r1(cx - ww / 2)}" y="${r1(cy - wh / 2)}" width="${r1(ww)}" height="${r1(wh)}" rx="${r1(words.size * 0.18)}" fill="none" stroke="${esc(colour.colour)}" stroke-width="${r1(ring)}"/>` +
      `<rect x="${r1(cx - ww / 2 + ring * 1.7)}" y="${r1(cy - wh / 2 + ring * 1.7)}" width="${r1(ww - ring * 3.4)}" height="${r1(wh - ring * 3.4)}" rx="${r1(words.size * 0.12)}" fill="none" stroke="${esc(colour.colour)}" stroke-width="${r1(ring * 0.45)}"/>` +
      textSvg(
        words.lines,
        cx,
        cy - (words.lines.length * words.size * 1.1) / 2 + words.size * 0.84,
        {
          size: words.size,
          fill: colour.colour,
          family: paint.text,
          anchor: 'middle',
          leading: 1.1,
          spacing: words.size * 0.05,
        },
      );
    // Its box round the turned stamp.
    const a = (Math.abs(turn) * Math.PI) / 180;
    const bw = ww * Math.cos(a) + wh * Math.sin(a);
    const bh = ww * Math.sin(a) + wh * Math.cos(a);
    book.add('stamp', {
      box: [cx - bw / 2, cy - bh / 2, bw, bh],
      role: colour.role ?? 'accent',
      pivot: [0.5, 0.5],
      later: true,
    });
    out.push(
      partSvg(
        'stamp',
        `<g transform="rotate(${turn} ${r1(cx)} ${r1(cy)})">${inside}</g>`,
      ),
    );
  }
  const bottom = py + pageH + floor * 0.6;
  const long = tall && bottom > frame.H;
  const focal: ShotBox = long
    ? [0, 0, frame.W, frame.H]
    : tall
      ? union(titleBox, book.parts.headline?.box, book.parts.stamp?.box)
      : [px, py, pageW, pageH];
  const box: ShotBox = long
    ? [0, 0, frame.W, Math.ceil(bottom)]
    : [0, 0, frame.W, frame.H];
  return assetOf(frame, paint, out.join(''), book, focal, box);
}
