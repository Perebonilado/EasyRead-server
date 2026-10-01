/**
 * A split screen: two sides set against each other along a line (two
 * systems, before and after, one region and another), each with its name
 * and a short list of words, each word with the side's icon. Side by side
 * in a wide film, one over the other in a tall one, so the voice never
 * says which side is where: it names them.
 *
 * One side may change on a cue ("change", a state): its list is wiped
 * away and the new one written in its place, the other side kept.
 */
import { measureText } from './scene-font';
import { iconOf, iconSymbol, iconUse, isIconName, type IconName } from './scene-icon-set';
import { groupId } from './scene-ids';
import { colourOr, tokenOf, type PaletteToken } from './scene-palette';
import type { FilmShape } from './scene-shape';
import { PAPER } from './scene-themes';
import {
  TEXT_FLOOR,
  delayOf,
  fitWords,
  r1,
  roomOf,
  strokeOf,
  styleOf,
  svgOf,
  textLines,
  uniqueId,
  type InfographicDrawing,
} from './scene-infographic-style';

export interface SplitSide {
  label: string;
  /** One to four short items: a word or a few each. */
  items: string[];
  icon: IconName | null;
  colour: PaletteToken | null;
}

export interface SplitSpec {
  sides: [SplitSide, SplitSide];
  /** A side's later list, shown on a cue: which side (0 or 1), and its new name and items. */
  change: { side: 0 | 1; label: string | null; items: string[] } | null;
}

/** A split screen as the writer gives it. */
export interface SplitDraft {
  sides: { label: string | null; items: string[] | null; icon: string | null }[] | null;
  change: { side: number | null; label: string | null; items: string[] | null } | null;
}

export const SPLIT_CHANGE = 'change';
export const MOST_ITEMS = 4;

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

const itemsOf = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw : [])
    .map((item) => clean(item, 32))
    .filter(Boolean)
    .slice(0, MOST_ITEMS);

/** A split screen made sound, or null without two named sides. */
export function readSplit(raw: SplitDraft | null | undefined): SplitSpec | null {
  const sides = (raw?.sides ?? [])
    .map((side) => {
      const label = clean(side?.label, 28);
      if (!label) return null;
      return {
        label,
        items: itemsOf(side?.items),
        icon: (isIconName(side?.icon) ? side.icon : null) ?? iconOf(side?.icon) ?? null,
        colour: null,
      } as SplitSide;
    })
    .filter((side): side is SplitSide => side !== null)
    .slice(0, 2);
  if (sides.length < 2) return null;
  const said = raw?.change;
  const side = said?.side === 2 || said?.side === 1 ? (said.side - 1 as 0 | 1) : said?.side === 0 ? 0 : 1;
  const items = itemsOf(said?.items);
  const label = clean(said?.label, 28) || null;
  return {
    sides: [sides[0], sides[1]],
    change: said && (items.length || label) ? { side, label, items } : null,
  };
}

export const splitPartNames = (spec: SplitSpec): string[] => [
  ...spec.sides.map((s) => s.label),
  ...spec.sides.flatMap((s) => s.items),
];
export const splitStateNames = (spec: SplitSpec): string[] =>
  spec.change
    ? [SPLIT_CHANGE, 'changed', ...(spec.change.label ? [spec.change.label] : [])]
    : [];

/** A split screen, drawn: each side and each item a part; a side's change a state. */
export function renderSplit(
  spec: SplitSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const tall = shape === 'tall';
  const gap = text * 0.9;
  const halfW = tall ? room.w : (room.w - gap) / 2;
  const halfH = tall ? (room.h - gap) / 2 : room.h;
  const colours = spec.sides.map((side, i) =>
    colourOr(side.colour ?? (i === 0 ? 'chart0' : 'chart1'), PAPER.chart[i]),
  );
  const icons = [...new Set(spec.sides.map((s) => s.icon).filter((i): i is IconName => i !== null))];
  const out: string[] = [
    styleOf({
      show: 'animation:ig-show .4s ease-out both',
      rise: 'animation:ig-rise .4s ease-out both',
      draw: 'animation:ig-draw .5s ease-out both',
    }),
    icons.length ? `<defs>${icons.map((name) => iconSymbol(name)).join('')}</defs>` : '',
  ];
  const parts: Record<string, string> = {};
  const used = new Set<string>();
  const originOf = (i: number) =>
    tall ? { x: 0, y: i * (halfH + gap) } : { x: i * (halfW + gap), y: 0 };
  const pad = text * 0.8;

  /** One side's name and list, laid in its half. */
  const sideBody = (
    label: string,
    items: string[],
    icon: IconName | null,
    colour: string,
    i: number,
    delay: number,
    ids: boolean,
  ): string => {
    const { x, y } = originOf(i);
    const inner = halfW - pad * 2;
    const head = fitWords(label, inner, text * 1.6, text * 1.1, 2);
    const headH = head.lines.length * head.size * 1.12;
    const itemSize = Math.max(text, Math.min(text * 1.25, (halfH - pad * 2 - headH - text) / Math.max(1, items.length) / 1.6));
    const iconSize = itemSize * 1.25;
    const rows = items.map((item) =>
      fitWords(item, inner - (icon ? iconSize + text * 0.5 : 0), itemSize, text, 2, 600),
    );
    const rowsH = rows.reduce((h, r) => h + r.lines.length * r.size * 1.2 + text * 0.55, 0);
    const blockH = headH + (items.length ? text * 0.7 + rowsH : 0);
    let cy = y + Math.max(pad, (halfH - blockH) / 2);
    const out2: string[] = [];
    out2.push(
      `<g class="rise" style="${delayOf(delay)}">${textLines(head.lines, x + halfW / 2, cy + head.size * 0.86, head.size, { fill: colour, leading: 1.12 })}</g>`,
    );
    cy += headH + text * 0.7;
    rows.forEach((row, k) => {
      const rowH = row.lines.length * row.size * 1.2;
      const width =
        (icon ? iconSize + text * 0.5 : 0) +
        Math.max(...row.lines.map((l) => measureText(l, row.size, 600)));
      // Each item a row: the side's icon, then its words, the row centred in the half.
      const left = x + Math.max(pad, (halfW - width) / 2);
      const id = ids ? uniqueId(`split-${i + 1}-${groupId(items[k]) || k + 1}`, used) : null;
      if (id && !parts[items[k]]) parts[items[k]] = id;
      out2.push(
        `<g${id ? ` id="${id}"` : ''}><g class="rise" style="${delayOf(delay + 0.2 + k * 0.15)}">` +
          (icon ? iconUse(icon, left, cy + (rowH - iconSize) / 2 - row.size * 0.1, iconSize, colour) : '') +
          textLines(row.lines, left + (icon ? iconSize + text * 0.5 : 0), cy + row.size * 0.9, row.size, { anchor: 'start', weight: 600, fill: PAPER.ink, leading: 1.2 }) +
          `</g></g>`,
      );
      cy += rowH + text * 0.55;
    });
    return out2.join('');
  };

  spec.sides.forEach((side, i) => {
    const { x, y } = originOf(i);
    const id = `split-${i + 1}`;
    parts[side.label] = id;
    used.add(id);
    out.push(
      `<g id="${id}">` +
        `<g class="show" style="${delayOf(0.1 + i * 0.25)}"><rect x="${r1(x)}" y="${r1(y)}" width="${r1(halfW)}" height="${r1(halfH)}" rx="${r1(text * 0.6)}" fill="${colours[i]}" fill-opacity="0.1"/></g>` +
        sideBody(side.label, side.items, side.icon, colours[i], i, 0.25 + i * 0.25, true) +
        `</g>`,
    );
  });
  // The line between them.
  const stroke = strokeOf(text);
  const line = tall
    ? `M${r1(text)} ${r1(halfH + gap / 2)}H${r1(room.w - text)}`
    : `M${r1(halfW + gap / 2)} ${r1(text)}V${r1(room.h - text)}`;
  const length = Math.ceil(tall ? room.w : room.h);
  out.push(
    `<path class="draw" style="--l:${length};stroke-dasharray:${length} ${length};${delayOf(0.05)}" d="${line}" stroke="${PAPER.ink}" stroke-width="${r1(stroke * 1.2)}" stroke-linecap="round"/>`,
  );
  const states: Record<string, string> = {};
  if (spec.change) {
    const i = spec.change.side;
    const side = spec.sides[i];
    const { x, y } = originOf(i);
    states[SPLIT_CHANGE] = 'split-change';
    states.changed = 'split-change';
    if (spec.change.label) states[spec.change.label] = 'split-change';
    out.push(
      `<g id="split-change">` +
        `<rect class="show" style="animation-duration:.2s" x="${r1(x)}" y="${r1(y)}" width="${r1(halfW)}" height="${r1(halfH)}" fill="${PAPER.paper}"/>` +
        `<rect class="show" style="animation-duration:.2s" x="${r1(x)}" y="${r1(y)}" width="${r1(halfW)}" height="${r1(halfH)}" rx="${r1(text * 0.6)}" fill="${colours[i]}" fill-opacity="0.1"/>` +
        sideBody(spec.change.label ?? side.label, spec.change.items.length ? spec.change.items : side.items, side.icon, colours[i], i, 0.15, false) +
        `</g>`,
    );
  }
  const viewBox: [number, number, number, number] = [
    r1(-text * 0.3),
    r1(-text * 0.3),
    r1(room.w + text * 0.6),
    r1(room.h + text * 0.6),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states };
}
