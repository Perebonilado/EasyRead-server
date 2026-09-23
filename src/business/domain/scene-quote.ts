/**
 * The text's own words on the stage, set by code: close reading.
 *
 * In a poem or a story the words are the subject, so the stage shows
 * them, as the page has them, and never a cartoon of them. Code sets the
 * passage in lines measured to fit, marks each phrase the voice will talk
 * about as a span the stage can light, and hands each phrase's note ("a
 * metaphor: time as a thief") to the stage to set beside it, the way a
 * teacher writes in the margin.
 */
import type { Callout } from './scene-callouts';
import { measureText } from './scene-font';
import { groupId } from './scene-ids';

export interface QuoteSpec {
  text: string;
  phrases: { name: string; phrase: string; note: string | null }[];
}

const WIDTH = 1000;
const SIZE = 44;
const LEADING = 1.45;
const LEFT = 118;
const RIGHT = 60;
const TOP = 70;
const RULE_X = 40;
const INK = '#1F2A37';
const ACCENT = '#E0663A';

/** A word reduced to what it is, to find a phrase in the passage. */
const key = (word: string) =>
  word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, '')
    .replace(/'/g, '');

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Where a phrase's words start in the passage's words, or -1. */
export function findPhrase(words: string[], phrase: string): number {
  const want = phrase.split(/\s+/).map(key).filter(Boolean);
  const keys = words.map(key);
  if (!want.length) return -1;
  for (let i = 0; i + want.length <= keys.length; i += 1)
    if (want.every((w, k) => keys[i + k] === w)) return i;
  return -1;
}

/** Whether the quote is the page's own words: every word, in order, somewhere in the page. */
export function isVerbatim(quote: string, page: string): boolean {
  const q = quote.split(/\s+/).map(key).filter(Boolean).join(' ');
  const p = page.split(/\s+/).map(key).filter(Boolean).join(' ');
  return q.length > 0 && p.includes(q);
}

/** A passage set: its SVG, its phrases as parts, and each phrase's note for the stage to set. */
export function renderQuote(spec: QuoteSpec): {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
  callouts: Callout[];
  /** The size its words are set at. */
  size: number;
} {
  // Lines kept as the poem has them; within a line, words wrapped to fit.
  const source = spec.text
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const words: string[] = [];
  const lines: number[][] = [];
  const room = WIDTH - LEFT - RIGHT;
  for (const given of source) {
    let current: number[] = [];
    let width = 0;
    for (const word of given.split(/\s+/)) {
      const w = measureText(word, SIZE, 600);
      const space = current.length ? measureText(' ', SIZE, 600) : 0;
      if (current.length && width + space + w > room) {
        lines.push(current);
        current = [];
        width = 0;
      }
      words.push(word);
      current.push(words.length - 1);
      width += (current.length > 1 ? measureText(' ', SIZE, 600) : 0) + w;
    }
    if (current.length) lines.push(current);
  }
  // Each phrase: which words, so its spans can be marked wherever the lines fall.
  const marks = new Map<number, { id: string; first: boolean }>();
  const parts: Record<string, string> = {};
  const found: {
    name: string;
    id: string;
    start: number;
    end: number;
    note: string | null;
  }[] = [];
  for (const phrase of spec.phrases) {
    const start = findPhrase(words, phrase.phrase);
    if (start < 0) continue;
    const length = phrase.phrase.split(/\s+/).filter((w) => key(w)).length;
    const id = `phrase-${groupId(phrase.name) || 'p'}`;
    if (parts[phrase.name]) continue;
    parts[phrase.name] = id;
    found.push({
      name: phrase.name,
      id,
      start,
      end: start + length,
      note: phrase.note,
    });
    for (let i = start; i < start + length; i += 1)
      if (!marks.has(i)) marks.set(i, { id, first: i === start });
  }
  const lineHeight = SIZE * LEADING;
  const out: string[] = [];
  const callouts: Callout[] = [];
  const space = measureText(' ', SIZE, 600);
  const middleOf = (row: number) =>
    Math.round(TOP + SIZE + row * lineHeight - SIZE * 0.35);
  const lineEnd = (row: number) =>
    LEFT +
    lines[row].reduce(
      (sum, i, n) => sum + measureText(words[i], SIZE, 600) + (n ? space : 0),
      0,
    );
  const rowOf = (index: number) =>
    lines.findIndex((line) => line.includes(index));
  lines.forEach((line, row) => {
    const baseline = TOP + SIZE + row * lineHeight;
    let x = LEFT;
    const spans: string[] = [];
    let open: string | null = null;
    let segment = 0;
    line.forEach((index, k) => {
      const mark = marks.get(index);
      const id = mark?.id ?? null;
      // The space between words stays outside a phrase's span: a span's
      // own leading space is dropped when the text is laid out.
      if (id !== open) {
        if (open) spans.push('</tspan>');
        if (k) spans.push(' ');
        if (id) {
          // The first span of a phrase carries its id; a phrase that runs
          // onto the next line goes on in a span of its own.
          const already =
            spans.join('').includes(`id="${id}"`) ||
            out.join('').includes(`id="${id}"`);
          segment += 1;
          spans.push(`<tspan id="${already ? `${id}-${segment}` : id}">`);
        }
        open = id;
      }
      const word = words[index];
      const w = measureText(word, SIZE, 600);
      const spaced =
        spans[spans.length - 1] === ' ' ||
        spans[spans.length - 1]?.startsWith('<tspan');
      spans.push(`${k && !spaced ? ' ' : ''}${escape(word)}`);
      // A phrase's note points at the middle of its first word's line of it.
      const phrase = found.find((f) => f.start === index);
      if (phrase?.note) {
        const ends = line.filter((i) => i >= phrase.start && i < phrase.end);
        const width = ends.reduce(
          (sum, i, n) =>
            sum + measureText(words[i], SIZE, 600) + (n ? space : 0),
          0,
        );
        // Its leader comes in from the margin: to the end of the line the
        // phrase ends on, or to the rule before the line it starts on.
        const last = rowOf(phrase.end - 1);
        callouts.push({
          part: phrase.name,
          text: phrase.note,
          anchor: [
            Math.round(x + (k ? space : 0) + width / 2),
            Math.round(baseline - SIZE * 0.35),
          ],
          ends: {
            left: [RULE_X - 14, middleOf(row)],
            right: [Math.round(lineEnd(last) + 16), middleOf(last)],
          },
        });
      }
      x += (k ? space : 0) + w;
    });
    if (open) spans.push('</tspan>');
    out.push(
      `<text x="${LEFT}" y="${baseline}" font-size="${SIZE}" font-weight="500" fill="${INK}">${spans.join('')}</text>`,
    );
  });
  const height = TOP + lines.length * lineHeight + 30;
  // A rule down the left, and a large opening mark: a quotation, plainly.
  const frame = [
    `<rect x="${RULE_X}" y="${TOP - 6}" width="8" height="${Math.round(height - TOP - 24)}" rx="4" fill="${ACCENT}"/>`,
    `<text x="62" y="${TOP + SIZE * 0.95}" font-size="${SIZE * 1.6}" font-weight="700" fill="${ACCENT}">“</text>`,
  ];
  const viewBox: [number, number, number, number] = [
    0,
    0,
    WIDTH,
    Math.round(height),
  ];
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}">${frame.join('')}${out.join('')}</svg>`,
    viewBox,
    parts,
    callouts,
    size: SIZE,
  };
}
