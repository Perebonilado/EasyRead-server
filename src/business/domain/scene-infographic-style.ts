/**
 * What the infographic kinds share (infographic-editor-plan §3, stage 6):
 * a counter, a unit chart of icons, a name card, a calendar, a chamber's
 * seats, words struck out and replaced, things moving between two boxes,
 * a document with its stamp, and a split screen. Each is drawn by code
 * from what the writer names, in the paper theme's tokens (recoloured for
 * every other look), in stage units for the film's frame (EXACT_ROOM), at
 * its audience's text size, with every meaningful piece a part the voice
 * can point at.
 *
 * Motion is CSS: keyframes in one <style>, each piece's own delay from
 * when the picture arrives (the player sets every drawing's animations to
 * its own time on the voice's clock). Every animation runs from where it
 * starts to the picture as drawn ("to{transform:none}"), so the still
 * drawing (a thumbnail, the measure of its ink) is the picture as it
 * ends. A state is a group the player keeps hidden until an effect shows
 * it; its own animation starts as it is shown.
 */
import { EXACT_ROOM, TEXT_FLOOR, escapeXml, r1 } from './scene-exact-style';
import { measureText } from './scene-font';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';

export { EXACT_ROOM, TEXT_FLOOR, escapeXml, r1 };

/** What one of the kinds is, drawn: its SVG, its frame, and its parts and states by name. */
export interface InfographicDrawing {
  svg: string;
  viewBox: [number, number, number, number];
  /** Part name to the id of its group: what the voice points at. */
  parts: Record<string, string>;
  /** State name to the id of its group: hidden until shown. */
  states: Record<string, string>;
}

/**
 * The house's keyframes, by name. Every name starts "ig-", clear of the
 * player's own loops ("step", "bob"), which it drives by a walk's strides.
 */
const KEYFRAMES: Record<string, string> = {
  'ig-pop':
    '@keyframes ig-pop{from{opacity:0;transform:scale(.55)}70%{opacity:1;transform:scale(1.06)}to{opacity:1;transform:none}}',
  'ig-show': '@keyframes ig-show{from{opacity:0}to{opacity:1}}',
  'ig-rise':
    '@keyframes ig-rise{from{opacity:0;transform:translateY(var(--rise,24px))}to{opacity:1;transform:none}}',
  'ig-draw':
    '@keyframes ig-draw{from{stroke-dashoffset:var(--l)}to{stroke-dashoffset:0}}',
  'ig-roll':
    '@keyframes ig-roll{from{transform:translateY(var(--from))}to{transform:none}}',
  'ig-wipe':
    '@keyframes ig-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}',
  'ig-wipe-down':
    '@keyframes ig-wipe-down{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}',
  'ig-flip':
    '@keyframes ig-flip{from{transform:none;opacity:1}to{transform:scaleY(0);opacity:.6}}',
  'ig-slam':
    '@keyframes ig-slam{from{opacity:0;transform:scale(2.4)}55%{opacity:1;transform:scale(.94)}75%{transform:scale(1.04)}to{opacity:1;transform:none}}',
  'ig-shake':
    '@keyframes ig-shake{0%,100%{transform:none}20%{transform:translate(-5px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,1px)}80%{transform:translate(2px,0)}}',
  'ig-slide':
    '@keyframes ig-slide{from{transform:translate(var(--dx,0),var(--dy,0));opacity:1}to{transform:none;opacity:0}}',
  'ig-close':
    '@keyframes ig-close{from{transform:rotate(var(--open,-120deg))}70%{transform:rotate(6deg)}85%{transform:rotate(-3deg)}to{transform:none}}',
  'ig-fade-out': '@keyframes ig-fade-out{from{opacity:1}to{opacity:0}}',
  'ig-dim': '@keyframes ig-dim{from{opacity:0}to{opacity:var(--dim,.55)}}',
};

/**
 * The <style> a drawing uses: the keyframes it names, and its classes.
 * Each class runs one keyframe once, "both", so a piece is at its start
 * before its delay and as drawn after it.
 */
export function styleOf(classes: Record<string, string>): string {
  const rules = Object.values(classes);
  // A keyframe named whole: "ig-wipe" is not used by "ig-wipe-down".
  const frames = Object.keys(KEYFRAMES)
    .filter((name) =>
      rules.some((rule) =>
        new RegExp(`(?:^|[\\s:,])${name}(?=[\\s;,]|$)`).test(rule),
      ),
    )
    .map((name) => KEYFRAMES[name]);
  const classed = Object.entries(classes).map(
    ([name, rule]) => `.${name}{${rule}}`,
  );
  return `<style>${frames.join('')}${classed.join('')}</style>`;
}

/** A piece's own delay, in seconds, as a style attribute's value. */
export const delayOf = (seconds: number): string =>
  `animation-delay:${Math.max(0, seconds).toFixed(2)}s`;

/** An SVG of a frame, its markup inside. */
export function svgOf(
  viewBox: [number, number, number, number],
  inner: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.map(r1).join(' ')}">${inner}</svg>`;
}

/**
 * Words set to fit a width: the largest size from `most` down to `least`
 * at which they fit on at most `lines` lines; at the least, they are cut
 * short with an ellipsis.
 */
export function fitWords(
  text: string,
  width: number,
  most: number,
  least: number,
  lines = 2,
  weight: 600 | 700 = 700,
): { size: number; lines: string[] } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const breakAt = (size: number): string[] => {
    const out: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && measureText(next, size, weight) > width) {
        out.push(current);
        current = word;
      } else current = next;
    }
    if (current) out.push(current);
    return out;
  };
  for (
    let size = Math.round(most);
    size >= least;
    size -= Math.max(1, size * 0.04)
  ) {
    const set = breakAt(size);
    if (
      set.length <= lines &&
      set.every((line) => measureText(line, size, weight) <= width)
    )
      return { size: Math.round(size), lines: set };
  }
  const size = Math.round(least);
  const set = breakAt(size);
  const kept = set.slice(0, lines);
  if (
    set.length > lines ||
    kept.some((l) => measureText(l, size, weight) > width)
  ) {
    let last = set.slice(lines - 1).join(' ');
    while (last.length > 1 && measureText(`${last}…`, size, weight) > width)
      last = last.slice(0, -1);
    kept[kept.length - 1] = `${last.trimEnd()}…`;
  }
  return { size, lines: kept };
}

/** Lines of text set one under another, centred on x (or from it), the first's baseline at y. */
export function textLines(
  lines: readonly string[],
  x: number,
  y: number,
  size: number,
  options: {
    weight?: 600 | 700;
    fill?: string;
    anchor?: 'start' | 'middle' | 'end';
    leading?: number;
    spacing?: number;
  } = {},
): string {
  const {
    weight = 700,
    fill = PAPER.ink,
    anchor = 'middle',
    leading = 1.18,
    spacing,
  } = options;
  return lines
    .map(
      (line, i) =>
        `<text x="${r1(x)}" y="${r1(y + i * size * leading)}" font-size="${r1(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${r1(spacing)}"` : ''}>${escapeXml(line)}</text>`,
    )
    .join('');
}

// ── Source lines ───────────────────────────────────────────────────────────

/** The most of a source line kept: a credit, not a citation. */
export const SOURCE_MOST = 90;

/**
 * A source as its line reads: "Source: K.W.J. Post, 1963". One that
 * already says where it is from ("Source:", "Data:", "From …", "Census
 * 2011") is kept as written.
 */
export function sourceText(raw: string | null | undefined): string | null {
  const said = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, SOURCE_MOST);
  if (!said) return null;
  if (/^(sources?|data|from|via|after|figures?)\b/i.test(said)) return said;
  return `Source: ${said}`;
}

/**
 * A data picture's source line: small and muted, under it, at the
 * audience's smallest text (what a viewer can still read on a phone);
 * cut short to its width. A part, "source", the voice can point at.
 */
export function sourceLineSvg(
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  anchor: 'start' | 'middle' = 'middle',
): string {
  let line = text;
  while (line.length > 8 && measureText(line, size, 600) > width)
    line = `${line.slice(0, -2).trimEnd()}…`.replace(/……$/, '…');
  return (
    `<g id="source"><text x="${r1(x)}" y="${r1(y)}" font-size="${r1(size)}" font-weight="600" ` +
    `fill="${PAPER.muted}" text-anchor="${anchor}">${escapeXml(line)}</text></g>`
  );
}

/** How much a source line adds under a picture: its gap above, and its own line. */
export const sourceRoom = (size: number) => size * 2.1;

/**
 * A drawing given its source line under everything it draws: its viewBox
 * grown down by the line's room, the line centred across its width. For
 * the kinds drawn on their own canvas (a chart, a graph, a timeline), set
 * at the size of their own smallest words.
 */
export function withSourceLine(
  svg: string,
  viewBox: [number, number, number, number],
  source: string,
  size?: number,
): { svg: string; viewBox: [number, number, number, number] } {
  const own = [...svg.matchAll(/font-size="([\d.]+)"/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0);
  const set = size ?? (own.length ? Math.min(...own) : TEXT_FLOOR);
  const [x, y, w, h] = viewBox;
  const grown: [number, number, number, number] = [
    x,
    y,
    w,
    r1(h + sourceRoom(set)),
  ];
  const line = sourceLineSvg(
    source,
    x + w / 2,
    y + h + set * 1.45,
    w * 0.96,
    set,
  );
  const close = svg.lastIndexOf('</svg>');
  const body = `${svg.slice(0, close)}${line}${svg.slice(close)}`;
  return {
    svg: body.replace(/viewBox="[^"]*"/, `viewBox="${grown.join(' ')}"`),
    viewBox: grown,
  };
}

// ── Sizes ──────────────────────────────────────────────────────────────────

/** The room a kind is drawn in for the film's shape, in stage units. */
export const roomOf = (shape: FilmShape) => EXACT_ROOM[shape];

/** A stroke the house draws lines with, for a text size: never a hairline. */
export const strokeOf = (text: number) => Math.max(3, text * 0.12);

/** A deterministic number from words, for what code varies with no meaning (a document's line lengths). */
export function seedOf(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

/** A name's own id, unique among those already given. */
export function uniqueId(base: string, used: Set<string>): string {
  let id = base || 'part';
  let k = 2;
  while (used.has(id)) id = `${base}-${k++}`;
  used.add(id);
  return id;
}
