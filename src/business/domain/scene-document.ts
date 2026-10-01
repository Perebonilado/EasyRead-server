/**
 * An official paper or a newspaper: a card with its title, a headline in
 * type when it has one, and its lines as grey bars (never real text: an
 * article's words would be invented, and too small to read). On a cue it
 * is stamped ("stamp", a state): the stamp slams down from above the
 * page, settles, and leaves drops of its ink: "NOT RECOMMENDED",
 * "APPROVED", "SECRET".
 */
import { measureText } from './scene-font';
import { colourOr, tokenOf, type PaletteToken } from './scene-palette';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';
import {
  TEXT_FLOOR,
  delayOf,
  fitWords,
  r1,
  roomOf,
  seedOf,
  strokeOf,
  styleOf,
  svgOf,
  textLines,
  type InfographicDrawing,
} from './scene-infographic-style';

export const DOCUMENT_STYLES = ['paper', 'newspaper'] as const;
export type DocumentStyle = (typeof DOCUMENT_STYLES)[number];

export interface DocumentSpec {
  style: DocumentStyle;
  /** Its title or a newspaper's name: "The Willink Report", "Daily Times". */
  title: string;
  /** One headline in type: "NIGERIA TO BE FREE IN 1960". */
  headline: string | null;
  /** What it is stamped with, when shown. */
  stamp: string | null;
  /** The stamp's colour: the bad token unless the show says. */
  colour: PaletteToken | null;
}

/** A document as the writer gives it. */
export interface DocumentDraft {
  style: string | null;
  title: string | null;
  headline: string | null;
  stamp: string | null;
}

export const DOCUMENT_STAMP = 'stamp';

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** A document made sound, or null with no title. */
export function readDocument(
  raw: DocumentDraft | null | undefined,
  name: string,
  extra: { colour?: unknown } = {},
): DocumentSpec | null {
  const title = clean(raw?.title, 48) || clean(name, 48);
  if (!title) return null;
  return {
    style: raw?.style === 'newspaper' ? 'newspaper' : 'paper',
    title,
    headline: clean(raw?.headline, 60) || null,
    stamp: clean(raw?.stamp, 24) || null,
    colour: tokenOf(extra.colour),
  };
}

export const documentPartNames = (spec: DocumentSpec): string[] => [
  'title',
  ...(spec.headline ? ['headline'] : []),
  'page',
];
export const documentStateNames = (spec: DocumentSpec): string[] =>
  spec.stamp ? [DOCUMENT_STAMP, spec.stamp] : [];

/** A run of grey bars, as lines of text too small to read, each its own length. */
function bars(
  x: number,
  y: number,
  w: number,
  lines: number,
  size: number,
  random: () => number,
  last = true,
): string {
  const out: string[] = [];
  for (let i = 0; i < lines; i += 1) {
    const end = last && i === lines - 1 ? 0.35 + random() * 0.3 : 0.82 + random() * 0.18;
    out.push(
      `<rect x="${r1(x)}" y="${r1(y + i * size * 1.75)}" width="${r1(w * end)}" height="${r1(size * 0.62)}" rx="${r1(size * 0.31)}" fill="${PAPER.grid}"/>`,
    );
  }
  return out.join('');
}

/** A document, drawn: its title, headline and page parts; its stamp a state. */
export function renderDocument(
  spec: DocumentSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const tall = shape === 'tall';
  const random = seedOf(`${spec.title}|${spec.headline ?? ''}`);
  const stroke = strokeOf(text);
  // A page's proportion: portrait, as large as the room lets it be.
  const pageH = Math.min(room.h * 0.98, tall ? 760 : 600);
  const pageW = Math.min(room.w * (tall ? 0.94 : 0.62), pageH * (spec.style === 'newspaper' ? 0.92 : 0.76));
  const pad = pageW * 0.08;
  const inner = pageW - pad * 2;
  const bar = Math.max(text * 0.42, pageW * 0.022);
  const out: string[] = [
    styleOf({
      card: 'animation:ig-rise .5s cubic-bezier(.2,.8,.3,1) both',
      show: 'animation:ig-show .4s ease-out both',
      slam: 'transform-box:fill-box;transform-origin:center;animation:ig-slam .42s cubic-bezier(.3,0,.4,1) both',
      ink: 'animation:ig-show .2s ease-out both',
    }),
  ];
  const parts: Record<string, string> = { page: 'document-page' };
  const states: Record<string, string> = {};
  const body: string[] = [];
  body.push(
    `<rect x="0" y="0" width="${r1(pageW)}" height="${r1(pageH)}" rx="${r1(text * 0.3)}" fill="${PAPER.card}" stroke="${PAPER.paperEdge}" stroke-width="${r1(stroke)}"/>`,
  );
  let y = pad;
  if (spec.style === 'newspaper') {
    // The masthead: the paper's name across the top, between two rules.
    const name = fitWords(spec.title.toUpperCase(), inner, text * 1.9, text, 1);
    body.push(
      `<g id="document-title">${textLines(name.lines, pageW / 2, y + name.size * 0.86, name.size, { fill: PAPER.ink, spacing: name.size * 0.04 })}</g>`,
    );
    y += name.size * 1.1;
    body.push(
      `<rect x="${r1(pad)}" y="${r1(y)}" width="${r1(inner)}" height="${r1(stroke * 1.2)}" fill="${PAPER.ink}"/>`,
      `<rect x="${r1(pad)}" y="${r1(y + stroke * 2.2)}" width="${r1(inner)}" height="${r1(stroke * 0.5)}" fill="${PAPER.ink}"/>`,
    );
    y += stroke * 2.2 + text * 0.7;
    if (spec.headline) {
      const head = fitWords(spec.headline.toUpperCase(), inner, text * 2.1, text, 3);
      parts.headline = 'document-headline';
      body.push(
        `<g id="document-headline">${textLines(head.lines, pageW / 2, y + head.size * 0.86, head.size, { fill: PAPER.ink, leading: 1.08 })}</g>`,
      );
      y += head.lines.length * head.size * 1.08 + text * 0.5;
    }
    // Its columns of grey lines, to the foot of the page.
    const cols = 3;
    const gap = pad * 0.6;
    const colW = (inner - gap * (cols - 1)) / cols;
    const lines = Math.max(2, Math.floor((pageH - pad - y) / ((bar / 0.62) * 1.75)));
    for (let c = 0; c < cols; c += 1)
      body.push(bars(pad + c * (colW + gap), y, colW, lines, bar / 0.62, random));
  } else {
    // A paper: its title, a rule, paragraphs of grey lines, a signature.
    const title = fitWords(spec.title, inner, text * 1.5, text, 2);
    body.push(
      `<g id="document-title">${textLines(title.lines, pad, y + title.size * 0.86, title.size, { anchor: 'start', fill: PAPER.ink, leading: 1.12 })}</g>`,
    );
    y += title.lines.length * title.size * 1.12 + text * 0.3;
    body.push(
      `<rect x="${r1(pad)}" y="${r1(y)}" width="${r1(inner * 0.4)}" height="${r1(stroke)}" fill="${PAPER.ink}"/>`,
    );
    y += text * 0.9;
    if (spec.headline) {
      const head = fitWords(spec.headline, inner, text * 1.25, text, 2);
      parts.headline = 'document-headline';
      body.push(
        `<g id="document-headline">${textLines(head.lines, pad, y + head.size * 0.86, head.size, { anchor: 'start', fill: PAPER.ink, leading: 1.15 })}</g>`,
      );
      y += head.lines.length * head.size * 1.15 + text * 0.5;
    }
    // Paragraphs of three to five lines, down to the signature.
    const step = (bar / 0.62) * 1.75;
    const limit = pageH - pad - text * 2.4;
    while (y + step <= limit) {
      const fits = Math.floor((limit - y) / step);
      const run = Math.min(fits, 3 + Math.floor(random() * 3));
      body.push(bars(pad, y, inner, run, bar / 0.62, random));
      y += run * step + step * 0.55;
    }
    // A signature line at the foot.
    const sy = pageH - pad - text * 0.4;
    body.push(
      `<path d="M${r1(pad)} ${r1(sy)}c${r1(inner * 0.06)} ${r1(-text * 0.9)} ${r1(inner * 0.12)} ${r1(text * 0.6)} ${r1(inner * 0.18)} ${r1(-text * 0.2)}s${r1(inner * 0.1)} ${r1(text * 0.5)} ${r1(inner * 0.16)} 0" fill="none" stroke="${PAPER.ink}" stroke-width="${r1(stroke * 0.9)}" stroke-linecap="round"/>`,
    );
  }
  parts.title = 'document-title';
  // The page, a little turned, as a paper set down.
  const turn = tall ? -1.5 : -2;
  const ox = (room.w - pageW) / 2;
  out.push(
    `<g id="document-page" transform="translate(${r1(ox)} 0) rotate(${turn} ${r1(pageW / 2)} ${r1(pageH / 2)})"><g class="card" style="${delayOf(0.1)}">${body.join('')}</g></g>`,
  );
  if (spec.stamp) {
    // The stamp: a double-ruled box of words, turned, slammed down over
    // the page's middle; a few drops of its ink round it.
    const colour = colourOr(spec.colour, PAPER.bad);
    const words = fitWords(spec.stamp.toUpperCase(), pageW * 0.78, text * 2, text, 2);
    const ww = Math.max(...words.lines.map((l) => measureText(l, words.size, 700))) + words.size * 1.2;
    const wh = words.lines.length * words.size * 1.1 + words.size * 0.9;
    const cx = room.w / 2;
    const cy = pageH * 0.56;
    const ring = stroke * 1.6;
    const drops = Array.from({ length: 5 }, () => {
      const a = random() * Math.PI * 2;
      const d = (Math.max(ww, wh) / 2) * (0.75 + random() * 0.35);
      return `<circle cx="${r1(cx + Math.cos(a) * d)}" cy="${r1(cy + Math.sin(a) * d * 0.6)}" r="${r1(stroke * (0.4 + random() * 0.7))}" fill="${colour}" opacity="0.7"/>`;
    }).join('');
    states[DOCUMENT_STAMP] = 'document-stamp';
    states[spec.stamp] = 'document-stamp';
    out.push(
      `<g id="document-stamp">` +
        `<g class="slam">` +
        `<g transform="rotate(-9 ${r1(cx)} ${r1(cy)})">` +
        `<rect x="${r1(cx - ww / 2)}" y="${r1(cy - wh / 2)}" width="${r1(ww)}" height="${r1(wh)}" rx="${r1(text * 0.3)}" fill="none" stroke="${colour}" stroke-width="${r1(ring)}"/>` +
        `<rect x="${r1(cx - ww / 2 + ring * 1.6)}" y="${r1(cy - wh / 2 + ring * 1.6)}" width="${r1(ww - ring * 3.2)}" height="${r1(wh - ring * 3.2)}" rx="${r1(text * 0.2)}" fill="none" stroke="${colour}" stroke-width="${r1(ring * 0.45)}"/>` +
        textLines(words.lines, cx, cy - (words.lines.length * words.size * 1.1) / 2 + words.size * 0.84, words.size, { fill: colour, leading: 1.1, spacing: words.size * 0.05 }) +
        `</g></g>` +
        `<g class="ink" style="${delayOf(0.38)}">${drops}</g>` +
        `</g>`,
    );
  }
  const viewBox: [number, number, number, number] = [
    r1(ox - text * 0.8),
    r1(-text * 0.8),
    r1(pageW + text * 1.6),
    r1(pageH + text * 1.6),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states };
}
