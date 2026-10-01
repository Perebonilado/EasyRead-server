/**
 * A unit chart: a number shown as that many icons (soldiers, schools,
 * coins), multiplying into a grid as it arrives: one, then one more, then
 * two, four, eight, until all are there. A number too large to draw one
 * by one is drawn with each icon standing for a round number of them, and
 * a key says so ("each = 10,000"); a part of one is a part of an icon.
 *
 * A subset may be picked out later ("highlight", shown on its cue): those
 * icons in a colour that stands apart from the rest in every look, the
 * rest dimmed, with its own few words.
 */
import { valueText } from './scene-chart';
import { measureText } from './scene-font';
import {
  iconOf,
  iconSymbol,
  iconUse,
  isIconName,
  type IconName,
} from './scene-icon-set';
import {
  clashesInEveryTheme,
  colourOr,
  tokenOf,
  type PaletteToken,
} from './scene-palette';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';
import {
  TEXT_FLOOR,
  delayOf,
  escapeXml,
  fitWords,
  r1,
  roomOf,
  sourceLineSvg,
  sourceRoom,
  sourceText,
  styleOf,
  svgOf,
  textLines,
  type InfographicDrawing,
} from './scene-infographic-style';
import { numberOf } from './scene-counter';

export interface IconsSpec {
  icon: IconName;
  /** The number shown. */
  count: number;
  /** How many each icon stands for: 1, or a round number for a large count. */
  per: number;
  /** What is counted ("soldiers"), for the key and a label of its own. */
  unit: string | null;
  /** The caption under the grid. */
  label: string | null;
  /** A subset picked out on a cue: how many of `count`, and its own few words. */
  highlight: { count: number; label: string | null } | null;
  colour: PaletteToken | null;
  source: string | null;
}

/** A unit chart as the writer gives it. */
export interface IconsDraft {
  icon: string | null;
  count: number | string | null;
  per: number | null;
  unit: string | null;
  label: string | null;
  highlight: number | string | null;
  highlightLabel: string | null;
}

/** The most icons a grid draws, by the film's shape: past this, each stands for more. */
export const MOST_ICONS: Record<FilmShape, number> = { wide: 100, tall: 80 };

/** The state that picks a subset out. */
export const ICONS_HIGHLIGHT = 'highlight';

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/**
 * How many each icon stands for, so the grid holds at most `most`: 1 while
 * the count fits, else the least of 2, 5, 10, 20, 50 … that brings it under.
 */
export function perIcon(count: number, most: number, asked?: number | null): number {
  if (asked && asked >= 1 && Number.isFinite(asked) && count / asked <= most && count / asked >= 1)
    return asked;
  if (count <= most) return 1;
  for (let power = 1; ; power *= 10)
    for (const step of [1, 2, 5]) {
      const per = step * power;
      if (count / per <= most) return per;
    }
}

/** A unit chart made sound, or null when it counts nothing. */
export function readIcons(
  raw: IconsDraft | null | undefined,
  name: string,
  extra: { colour?: unknown; source?: unknown } = {},
): IconsSpec | null {
  const count = numberOf(raw?.count)?.value ?? null;
  if (count === null || !(count > 0) || count >= 1e13) return null;
  const unit = clean(raw?.unit, 24) || null;
  const icon =
    (isIconName(raw?.icon) ? raw.icon : null) ??
    iconOf(raw?.icon) ??
    iconOf(unit) ??
    iconOf(name) ??
    'dot';
  const subset = numberOf(raw?.highlight)?.value ?? null;
  return {
    icon,
    count,
    per: perIcon(count, MOST_ICONS.wide, raw?.per ?? null),
    unit,
    label: clean(raw?.label, 60) || null,
    highlight:
      subset !== null && subset > 0 && subset < count
        ? { count: subset, label: clean(raw?.highlightLabel, 40) || null }
        : null,
    colour: tokenOf(extra.colour),
    source: clean(extra.source, 90) || null,
  };
}

export const iconsPartNames = (spec: IconsSpec): string[] => [
  'icons',
  ...(spec.label || spec.unit ? ['label'] : []),
  ...(spec.source ? ['source'] : []),
];
export const iconsStateNames = (spec: IconsSpec): string[] =>
  spec.highlight
    ? [ICONS_HIGHLIGHT, ...(spec.highlight.label ? [spec.highlight.label] : [])]
    : [];

/** The colour a subset is picked out in: the first apart from the grid's own in every look. */
export function highlightColourOf(base: PaletteToken | null): PaletteToken {
  const from: PaletteToken = base ?? 'chart0';
  const candidates: PaletteToken[] = ['accent', 'chart3', 'chart1', 'chart2', 'chart5'];
  return (
    candidates.find(
      (one) => one !== from && !clashesInEveryTheme([from, one]).length,
    ) ?? 'chart3'
  );
}

/** Columns for n square cells in a box: the layout that gives each the most room. */
export function gridOf(
  n: number,
  w: number,
  h: number,
): { cols: number; rows: number; cell: number } {
  let best = { cols: 1, rows: n, cell: Math.min(w, h / n) };
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    const cell = Math.min(w / cols, h / rows);
    if (cell > best.cell + 0.01) best = { cols, rows, cell };
  }
  return best;
}

/** The waves icons come in: one, one, two, four, eight … each the size of all before it. */
export function wavesOf(n: number): number[] {
  const out: number[] = [];
  let k = 0;
  let wave = 0;
  while (k < n) {
    const size = wave === 0 ? 1 : Math.max(1, 2 ** (wave - 1));
    for (let i = 0; i < size && k < n; i += 1) out.push(wave);
    k += size;
    wave += 1;
  }
  return out.slice(0, n);
}

/** A unit chart, drawn: its grid of icons, its key, its words, its source; its subset as a state. */
export function renderIcons(
  spec: IconsSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const per = perIcon(spec.count, MOST_ICONS[shape], spec.per);
  const exact = spec.count / per;
  const whole = Math.floor(exact + 1e-9);
  const part = exact - whole > 0.04 ? exact - whole : 0;
  const n = whole + (part ? 1 : 0);
  const colourToken = spec.colour ?? 'chart0';
  const colour = colourOr(colourToken, PAPER.chart[0]);
  const lit = colourOr(highlightColourOf(colourToken), PAPER.accent);
  const width = room.w;
  // What goes under the grid: the label (its count and unit if it has none), the key, the source.
  const labelText =
    spec.label ?? (spec.unit ? valueText(spec.count, spec.unit) : null);
  const label = labelText
    ? fitWords(labelText, width * 0.92, text * 1.3, text, 2)
    : null;
  // The key, when an icon is more than one of what it counts: "= 1,000
  // soldiers", "= 1 billion dollars".
  const scaled = /\b(?:thousand|million|billion|trillion|lakh|crore|bn|m|k)\b/i.test(
    spec.unit ?? '',
  );
  const keyText =
    per > 1 || scaled ? `= ${valueText(per, spec.unit)}` : null;
  const source = sourceText(spec.source);
  const below =
    (label ? label.lines.length * label.size * 1.2 + text * 0.5 : 0) +
    (keyText ? text * 1.9 : 0) +
    (source ? sourceRoom(text) : 0);
  const highlightLabel = spec.highlight?.label ?? null;
  const above = highlightLabel ? text * 1.9 : 0;
  const gridH = Math.max(text * 3, room.h - below - above);
  const most = shape === 'tall' ? text * 4.2 : text * 5.2;
  const laid = gridOf(Math.max(1, n), width, gridH);
  const cell = Math.min(laid.cell, most);
  const size = cell * 0.84;
  const gridW = laid.cols * cell;
  const rowsUsed = Math.ceil(n / laid.cols);
  const x0 = (width - gridW) / 2;
  const y0 = above;
  const cellAt = (i: number) => ({
    x: x0 + (i % laid.cols) * cell + (cell - size) / 2,
    y: y0 + Math.floor(i / laid.cols) * cell + (cell - size) / 2,
  });
  const waves = wavesOf(n);
  const out: string[] = [
    styleOf({
      pop: 'transform-box:fill-box;transform-origin:center;animation:ig-pop .38s cubic-bezier(.2,.8,.3,1.2) both',
      show: 'animation:ig-show .4s ease-out both',
      rise: 'animation:ig-rise .45s ease-out both',
      dim: 'animation:ig-dim .4s ease-out both',
    }),
    `<defs>${iconSymbol(spec.icon)}` +
      // The last icon, when it is a part of one, cut to its share.
      (part
        ? `<clipPath id="icons-part"><rect x="${r1(cellAt(n - 1).x)}" y="${r1(cellAt(n - 1).y - 2)}" width="${r1(size * part)}" height="${r1(size + 4)}"/></clipPath>`
        : '') +
      `</defs>`,
  ];
  const parts: Record<string, string> = { icons: 'icons-grid' };
  const states: Record<string, string> = {};
  const waveDelay = (w: number) => 0.2 + w * 0.2;
  const uses: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const { x, y } = cellAt(i);
    const style = `style="${delayOf(waveDelay(waves[i]))}"`;
    const used = iconUse(spec.icon, x, y, size, colour, `class="pop" ${style}`);
    uses.push(
      part && i === n - 1
        ? `<g clip-path="url(#icons-part)">${used}</g>`
        : used,
    );
  }
  out.push(`<g id="icons-grid">${uses.join('')}</g>`);
  const gridBottom = y0 + rowsUsed * cell;
  const arrived = waveDelay(waves[n - 1] ?? 0) + 0.4;
  let y = gridBottom + text * 0.5;
  if (label) {
    parts.label = 'icons-label';
    out.push(
      `<g id="icons-label"><g class="rise" style="${delayOf(arrived)}">${textLines(label.lines, width / 2, y + label.size * 0.9, label.size)}</g></g>`,
    );
    y += label.lines.length * label.size * 1.2 + text * 0.2;
  }
  if (keyText) {
    // The key: one icon, and what it stands for.
    const keySize = text * 1.1;
    const tw = measureText(keyText, text, 600);
    const kx = (width - (keySize + text * 0.3 + tw)) / 2;
    parts.key = 'icons-key';
    out.push(
      `<g id="icons-key" class="show" style="${delayOf(arrived + 0.2)}">` +
        iconUse(spec.icon, kx, y + text * 0.25, keySize, colour) +
        `<text x="${r1(kx + keySize + text * 0.3)}" y="${r1(y + text * 1.15)}" font-size="${r1(text)}" font-weight="600" fill="${PAPER.muted}">${escapeXml(keyText)}</text></g>`,
    );
    y += text * 1.9;
  }
  if (source) {
    parts.source = 'source';
    out.push(
      `<g class="show" style="${delayOf(arrived + 0.3)}">${sourceLineSvg(source, width / 2, y + text * 1.45, width * 0.94, text)}</g>`,
    );
    y += sourceRoom(text);
  }
  if (spec.highlight) {
    // The subset: the rest dimmed, its icons in their own colour, its words over the grid.
    const many = Math.max(1, Math.min(n, Math.round(spec.highlight.count / per)));
    const lits: string[] = [];
    for (let i = 0; i < many; i += 1) {
      const at = cellAt(i);
      lits.push(
        iconUse(spec.icon, at.x, at.y, size, lit, `class="pop" style="${delayOf(0.1 + Math.min(0.6, i * 0.03))}"`),
      );
    }
    const words = highlightLabel
      ? fitWords(highlightLabel, width * 0.9, text * 1.2, text, 1)
      : null;
    states[ICONS_HIGHLIGHT] = 'icons-highlight';
    if (highlightLabel) states[highlightLabel] = 'icons-highlight';
    out.push(
      `<g id="icons-highlight">` +
        `<rect class="dim" style="--dim:.6" opacity="0.6" x="${r1(x0)}" y="${r1(y0)}" width="${r1(gridW)}" height="${r1(rowsUsed * cell)}" fill="${PAPER.paper}"/>` +
        lits.join('') +
        (words
          ? `<g class="rise" style="${delayOf(0.3)}">${textLines(words.lines, width / 2, words.size * 0.95, words.size, { fill: lit })}</g>`
          : '') +
        `</g>`,
    );
  }
  const top = highlightLabel ? 0 : y0;
  const viewBox: [number, number, number, number] = [
    0,
    r1(top - text * 0.2),
    width,
    r1(y - top + text * 0.4),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states };
}
