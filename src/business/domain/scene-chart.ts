/**
 * A chart on the stage, drawn by code from the page's own numbers: bars,
 * or a line through points. The axis runs from zero with round ticks,
 * every value is written on its bar, and each bar (or point) is a part
 * the voice can point at. The bars grow up from the axis as the chart
 * arrives, one after another; a line draws itself. The numbers are held
 * to the page (see numbersIn): a chart never shows a number the page
 * does not give.
 */
import { measureText } from './scene-font';
import { groupId } from './scene-ids';
import { ticks } from './scene-plot';

export interface ChartSpec {
  kind: 'bar' | 'line';
  /** What the numbers are in, written after each: "%", "million", "°C". */
  unit: string | null;
  bars: { label: string; value: number }[];
}

/** The most bars one chart holds. */
export const MAX_BARS = 8;

const W = 1000;
const H = 620;
const AREA = { x0: 110, x1: 960, y0: 70, y1: 470 };
const INK = '#1F2A37';
const MUTED = '#5B6675';
const GRID = '#E9E1D1';
const BAR = '#3D8FD1';
const LINE_COLOUR = '#E0663A';
const VALUE_SIZE = 28;
const LABEL_SIZE = 24;

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r = (n: number) => Math.round(n * 10) / 10;

/** A number as it is read, with its unit: "70%", "1.5 million", "12 °C". */
export function valueText(value: number, unit: string | null): string {
  const number = Number(value.toPrecision(6)).toLocaleString('en-GB', {
    maximumFractionDigits: 6,
  });
  if (!unit) return number;
  return /^[%°]/.test(unit) ? `${number}${unit}` : `${number} ${unit}`;
}

/**
 * Every number a text gives, as numbers: "1,500" is 1500, "3.5" is 3.5,
 * "70%" is 70. What a chart's values are held to.
 */
export function numbersIn(text: string): number[] {
  // A comma only between thousands: "1,500" is one number, "1911, and" one too.
  return [...text.matchAll(/-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g)]
    .map((m) => Number(m[0].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

/** Words broken into at most two lines inside a width, the second cut short. */
function twoLines(text: string, width: number, size: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measureText(next, size, 600) > width) {
      out.push(current);
      current = word;
    } else current = next;
  }
  if (current) out.push(current);
  if (out.length <= 2) return out;
  let last = out[1];
  while (last.length > 1 && measureText(`${last}…`, size, 600) > width)
    last = last.slice(0, -1);
  return [out[0], `${last.trimEnd()}…`];
}

/** A chart, drawn: its SVG, and each bar or point as a part the voice can point at. */
export function renderChart(spec: ChartSpec): {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
} {
  const bars = spec.bars
    .filter((b) => b.label.trim() && Number.isFinite(b.value))
    .slice(0, MAX_BARS);
  if (bars.length < 2) throw new Error('a chart needs at least two numbers');
  const values = bars.map((b) => b.value);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  if (!(high > low))
    throw new Error('a chart needs numbers that are not all zero');
  const ys = ticks(low, high + (high - low) * 0.08, 5);
  const y0 = Math.min(low, ys[0]);
  const y1 = Math.max(high, ys[ys.length - 1]);
  const py = (v: number) =>
    AREA.y1 - ((v - y0) / (y1 - y0)) * (AREA.y1 - AREA.y0);
  const slot = (AREA.x1 - AREA.x0) / bars.length;
  const cx = (i: number) => AREA.x0 + slot * (i + 0.5);
  const zero = py(0);
  const out: string[] = [];
  const parts: Record<string, string> = {};
  for (const y of ys)
    out.push(
      `<line x1="${AREA.x0}" y1="${r(py(y))}" x2="${AREA.x1}" y2="${r(py(y))}" stroke="${GRID}" stroke-width="2"/>`,
      `<text x="${AREA.x0 - 14}" y="${r(py(y) + 8)}" font-size="22" fill="${MUTED}" text-anchor="end">${escape(valueText(y, spec.unit === '%' ? '%' : null))}</text>`,
    );
  out.push(
    `<line x1="${AREA.x0}" y1="${r(zero)}" x2="${AREA.x1}" y2="${r(zero)}" stroke="${MUTED}" stroke-width="3" stroke-linecap="round"/>`,
  );
  // Each bar's name under the axis, broken to fit its slot.
  bars.forEach((bar, i) => {
    twoLines(bar.label, slot * 0.92, LABEL_SIZE).forEach((line, k) =>
      out.push(
        `<text x="${r(cx(i))}" y="${r(AREA.y1 + 34 + k * LABEL_SIZE * 1.2)}" font-size="${LABEL_SIZE}" font-weight="600" fill="${INK}" text-anchor="middle">${escape(line)}</text>`,
      ),
    );
  });
  // Each bar a part, once: a second bar of the same name is not drawn.
  const keyed = (bar: ChartSpec['bars'][number], i: number) => {
    if (parts[bar.label]) return null;
    const id = `bar-${groupId(bar.label) || String(i + 1)}`;
    parts[bar.label] = id;
    return id;
  };
  const valueLabel = (bar: ChartSpec['bars'][number], x: number, y: number) =>
    `<text x="${r(x)}" y="${r(bar.value >= 0 ? y - 14 : y + VALUE_SIZE + 8)}" font-size="${VALUE_SIZE}" font-weight="700" fill="${INK}" text-anchor="middle">${escape(valueText(bar.value, spec.unit))}</text>`;
  if (spec.kind === 'line') {
    const points = bars.map((bar, i) => [cx(i), py(bar.value)] as const);
    const length = points
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
        0,
      );
    const drawn = Math.ceil(length) + 10;
    out.push(
      `<style>@keyframes draw{from{stroke-dashoffset:${drawn}}to{stroke-dashoffset:0}}` +
        `@keyframes pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}` +
        `.line{stroke-dasharray:${drawn};animation:draw 1.6s ease-out both}` +
        `.pop{transform-box:fill-box;transform-origin:center;animation:pop .4s ease-out both}</style>`,
      `<path class="line" d="${points.map((p, i) => `${i ? 'L' : 'M'}${r(p[0])} ${r(p[1])}`).join('')}" fill="none" stroke="${LINE_COLOUR}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    bars.forEach((bar, i) => {
      const id = keyed(bar, i);
      if (!id) return;
      const [x, y] = points[i];
      out.push(
        `<g id="${id}"><g class="pop" style="animation-delay:${(0.3 + (1.3 * i) / bars.length).toFixed(2)}s">` +
          `<circle cx="${r(x)}" cy="${r(y)}" r="12" fill="${LINE_COLOUR}" stroke="#FFFFFF" stroke-width="4"/>` +
          valueLabel(bar, x, y) +
          `</g></g>`,
      );
    });
  } else {
    const width = Math.min(150, slot * 0.62);
    out.push(
      `<style>@keyframes grow{from{transform:scaleY(0)}to{transform:none}}` +
        `@keyframes show{from{opacity:0}to{opacity:1}}` +
        `.grow{transform-box:fill-box;animation:grow .7s cubic-bezier(.2,.8,.3,1) both}` +
        `.up{transform-origin:bottom}.down{transform-origin:top}` +
        `.show{animation:show .3s ease-out both}</style>`,
    );
    bars.forEach((bar, i) => {
      const id = keyed(bar, i);
      if (!id) return;
      const top = Math.min(py(bar.value), zero);
      const height = Math.max(2, Math.abs(zero - py(bar.value)));
      const delay = 0.3 + i * 0.22;
      out.push(
        `<g id="${id}">` +
          `<rect class="grow ${bar.value >= 0 ? 'up' : 'down'}" style="animation-delay:${delay.toFixed(2)}s" x="${r(cx(i) - width / 2)}" y="${r(top)}" width="${r(width)}" height="${r(height)}" rx="8" fill="${BAR}"/>` +
          `<g class="show" style="animation-delay:${(delay + 0.5).toFixed(2)}s">${valueLabel(bar, cx(i), py(bar.value))}</g>` +
          `</g>`,
      );
    });
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`,
    viewBox: [0, 0, W, H],
    parts,
  };
}
