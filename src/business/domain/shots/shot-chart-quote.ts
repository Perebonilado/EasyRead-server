/**
 * Someone's exact words at full frame: the quotation set large in the
 * display face from a strong left edge, a great opening mark hung in the
 * margin before it, and who said it (and when) under it. Only exact words
 * from the research are ever set here: a quote card never stands in for a
 * picture of a person or a place.
 *
 * Parts: each line `quote-line-<n>`, all of them `quote`; a phrase the
 * voice dwells on, where it falls within one line, `phrase-<name>` (a span
 * of its line, for a recipe to recolour); the opening mark `mark`; who said
 * it, `speaker`. A tall frame's quotation longer than the words' area runs
 * on down, and the camera travels down it as it is read.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
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
  partSvg,
  r1,
  said,
  slugOf,
  textSvg,
  union,
  wordsWidth,
  wrap,
} from './shot-chart-kit';

/** The most words a quotation on the stage holds: past this it is cut, with an ellipsis. */
export const MOST_QUOTE_WORDS = 60;

interface QuoteRead {
  text: string;
  speaker: string | null;
  when: string | null;
  phrases: { name: string; phrase: string }[];
}

export function readQuote(raw: Record<string, unknown>): QuoteRead | null {
  const body = bodyOf('quote', raw);
  const given =
    typeof raw.quote === 'string'
      ? raw.quote
      : typeof body.text === 'string'
        ? body.text
        : typeof body.quote === 'string'
          ? body.quote
          : '';
  const words = given
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return null;
  const text =
    words.length > MOST_QUOTE_WORDS
      ? `${words.slice(0, MOST_QUOTE_WORDS).join(' ')}…`
      : words.join(' ');
  const speaker =
    said(
      raw.speaker ??
        body.speaker ??
        raw.by ??
        body.by ??
        raw.who ??
        body.who ??
        raw.author ??
        body.author ??
        raw.attribution ??
        body.attribution,
      60,
    ) || null;
  const when =
    said(
      raw.when ?? body.when ?? raw.date ?? body.date ?? raw.year ?? body.year,
      24,
    ) || null;
  const list = Array.isArray(raw.phrases)
    ? raw.phrases
    : Array.isArray(body.phrases)
      ? body.phrases
      : [];
  const phrases = list
    .map((p: unknown) => {
      const one = (p && typeof p === 'object' ? p : {}) as Record<
        string,
        unknown
      >;
      const phrase = said(one.phrase, 80);
      return { name: said(one.name, 40) || phrase, phrase };
    })
    .filter((p) => p.phrase)
    .slice(0, 4);
  return { text, speaker, when, phrases };
}

const key = (word: string) =>
  word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '')
    .replace(/'/g, '');

/** Where a phrase's words fall in a line's words: [first, last + 1], or null. */
function inLine(line: string, phrase: string): [number, number] | null {
  const words = line.split(' ').map(key);
  const want = phrase.split(/\s+/).map(key).filter(Boolean);
  if (!want.length) return null;
  for (let i = 0; i + want.length <= words.length; i += 1)
    if (want.every((w, k) => words[i + k] === w)) return [i, i + want.length];
  return null;
}

/** A quotation drawn to fill the frame, or null with no words. */
export function quoteAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const read = readQuote(raw);
  if (!read) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const tall = shape === 'tall';
  const { text } = frame;
  const floor = frame.size.label;
  const accent = mainColour(paint, extraOf('quote', raw).colour);
  // Who said it, and when: "— Herbert Macaulay, 1946".
  const credit = read.speaker
    ? `— ${read.speaker}${read.when ? `, ${read.when}` : ''}`
    : read.when
      ? `— ${read.when}`
      : null;
  const markRoom = tall ? 0 : frame.W * 0.07;
  const x = text.x0 + markRoom;
  const width = (tall ? text.x1 : Math.min(text.x1, x + frame.W * 0.78)) - x;
  const creditFit = credit ? fit(credit, width, floor, floor, 2, 600) : null;
  const creditH = creditFit
    ? floor * 0.9 + creditFit.lines.length * floor * 1.15
    : 0;
  // The largest size whose lines fit the words' area (a tall frame's may run on down).
  const markH = tall ? frame.size.title * 1.1 : 0;
  const band = text.y1 - text.y0 - creditH - markH;
  const leading = 1.22;
  // A short saying as large as a title or more; a long one down to the floor,
  // a tall frame's running on down past the words' area when it must.
  let chosen: { size: number; lines: string[] } | null = null;
  for (
    let s = tall ? frame.size.title * 1.1 : frame.size.hero;
    s >= floor;
    s -= 1
  ) {
    const set = wrap(read.text, width, s, tall ? 14 : 7, 600, 'display');
    if (set && set.length * s * leading <= band) {
      chosen = { size: r1(s), lines: set };
      break;
    }
  }
  const { size, lines } =
    chosen ??
    fit(read.text, width, floor, floor, tall ? 14 : 8, 600, 'display');
  const blockH =
    markH +
    (lines.length - 1) * size * leading +
    size * (ASCENT + 0.24) +
    creditH;
  const top = Math.max(text.y0, text.y0 + (text.y1 - text.y0 - blockH) * 0.45);
  const out: string[] = [];
  // The opening mark: hung in the margin before the first line, or over it in a tall frame.
  const markSize = Math.max(size * 2.2, frame.size.title * 1.6);
  const markX = tall ? x : x - markRoom * 0.92;
  const markY = tall
    ? top + markSize * 0.62
    : top + size * ASCENT + markSize * 0.42;
  const markBox: ShotBox = [
    markX,
    markY - markSize * 0.7,
    markSize * 0.5,
    markSize * 0.42,
  ];
  book.add('mark', { box: markBox, role: accent.role });
  out.push(
    `<text data-part="mark" x="${r1(markX)}" y="${r1(markY)}" font-family="${esc(paint.display)}" font-size="${r1(markSize)}" font-weight="700" fill="${esc(accent.colour)}">“</text>`,
  );
  const first = top + markH + size * ASCENT;
  const lineBoxes: ShotBox[] = [];
  const spans: string[] = [];
  lines.forEach((line, i) => {
    const y = first + i * size * leading;
    const id = book.id(`quote-line-${i + 1}`);
    const box = linesBox([line], x, y, size, 'start', leading, 600, 'display');
    book.add(id, { box, role: 'ink' });
    lineBoxes.push(box);
    // A phrase the voice dwells on, where it falls within this line: its own span.
    const found = read.phrases
      .map((p) => ({ p, at: inLine(line, p.phrase) }))
      .find((f) => f.at !== null);
    if (!found?.at) {
      spans.push(
        textSvg(
          [line],
          x,
          y,
          { size, fill: paint.ink, family: paint.display, weight: 600 },
          id,
        ),
      );
      return;
    }
    const words = line.split(' ');
    const [a, b] = found.at;
    const before = words.slice(0, a).join(' ');
    const inside = words.slice(a, b).join(' ');
    const after = words.slice(b).join(' ');
    const pid = book.id(`phrase-${slugOf(found.p.name) || String(i + 1)}`);
    const px =
      x + (before ? wordsWidth(`${before} `, size, 600, 'display') : 0);
    const pw = wordsWidth(inside, size, 600, 'display');
    book.add(pid, { box: [px, box[1], pw, box[3]], role: 'ink' });
    spans.push(
      `<text data-part="${esc(id)}" x="${r1(x)}" y="${r1(y)}" font-family="${esc(paint.display)}" font-size="${r1(size)}" font-weight="600" fill="${esc(paint.ink)}">` +
        (before ? `${esc(before)} ` : '') +
        `<tspan data-part="${esc(pid)}">${esc(inside)}</tspan>` +
        (after ? ` ${esc(after)}` : '') +
        `</text>`,
    );
  });
  const all = union(...lineBoxes);
  book.add('quote', { box: all, role: 'ink' });
  out.push(partSvg('quote', spans.join('')));
  let bottom = all[1] + all[3];
  if (creditFit) {
    const y = bottom + floor * 0.9 + floor * ASCENT;
    const box = linesBox(creditFit.lines, x, y, floor, 'start', 1.15, 600);
    book.add('speaker', { box, role: 'muted' });
    out.push(
      textSvg(
        creditFit.lines,
        x,
        y,
        { size: floor, fill: paint.muted, family: paint.text, weight: 600 },
        'speaker',
      ),
    );
    bottom = box[1] + box[3];
  }
  const focal = union(all, markBox, book.parts.speaker?.box);
  const long = tall && bottom > text.y1;
  const box: ShotBox = long
    ? [0, 0, frame.W, Math.ceil(bottom + (frame.H - text.y1))]
    : [0, 0, frame.W, frame.H];
  return assetOf(
    frame,
    paint,
    out.join(''),
    book,
    long ? [0, 0, frame.W, frame.H] : focal,
    box,
  );
}
