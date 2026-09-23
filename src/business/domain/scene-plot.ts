/**
 * A graph on the stage, drawn by code from the function itself.
 *
 * The writer names the function and the stretch of it to show; code
 * works the curve out (with the same locked-down calculator the maths
 * is checked with), draws the axes with round ticks, and marks the
 * points the voice will point at. The curve draws itself as it arrives.
 * A model asked to draw a graph draws a picture of one; this is the
 * graph.
 */
import type { Callout } from './scene-callouts';
import { compileExpression } from './scene-math';
import { groupId } from './scene-ids';

export interface PlotSpec {
  /** In x, as mathjs reads it: "x^2 - 4", "2*sin(x)". */
  fn: string;
  x: [number, number];
  /** The heights to show; null to fit the curve. */
  y: [number, number] | null;
  points: { x: number; name: string }[];
  xLabel: string | null;
  yLabel: string | null;
}

const W = 960;
const H = 600;
const AREA = { x0: 110, x1: 920, y0: 40, y1: 500 };
const INK = '#1F2A37';
const MUTED = '#5B6675';
const GRID = '#E9E1D1';
const CURVE = '#E0663A';
const POINT = '#3D8FD1';

/** Round ticks across a range: steps of 1, 2, 2.5 or 5 times a power of ten. */
export function ticks(min: number, max: number, about = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / about;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  // To the step's own precision, so 3 × 0.2 is 0.6 and not 0.6000000000000001.
  const decimals = Math.max(0, 1 - Math.floor(Math.log10(step)));
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step)
    out.push(Number((Math.round(v / step) * step).toFixed(decimals)));
  return out;
}

/** A tick's number as it is read: no trailing zeros, no -0. */
const show = (n: number) => {
  const text = Number(n.toPrecision(6)).toString();
  return text === '-0' ? '0' : text;
};

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The function worked out across its stretch; null where it has no real value. */
export function sample(
  fn: string,
  [from, to]: [number, number],
  count = 240,
): { x: number; y: number | null }[] {
  const compiled = compileExpression(fn);
  return Array.from({ length: count + 1 }, (_, i) => {
    const x = from + ((to - from) * i) / count;
    try {
      const y = Number(compiled.evaluate({ x }));
      return { x, y: Number.isFinite(y) ? y : null };
    } catch {
      return { x, y: null };
    }
  });
}

/** A graph, drawn: its SVG, the parts the voice can point at, and its points' labels for the stage to set. */
export function renderPlot(spec: PlotSpec): {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
  callouts: Callout[];
} {
  const [x0, x1] = spec.x[0] < spec.x[1] ? spec.x : [spec.x[1], spec.x[0]];
  if (!(x1 > x0)) throw new Error('the graph needs a stretch of x to show');
  const samples = sample(spec.fn, [x0, x1]);
  const known = samples
    .map((s) => s.y)
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);
  if (known.length < samples.length * 0.3)
    throw new Error(`the function ${spec.fn} has no values to draw there`);
  let [y0, y1] =
    spec.y && spec.y[1] > spec.y[0]
      ? spec.y
      : [
          // Fitted to the curve, but not to an asymptote's spike.
          known[Math.floor(known.length * 0.02)],
          known[Math.ceil(known.length * 0.98) - 1],
        ];
  if (!spec.y) {
    const pad = (y1 - y0 || 1) * 0.1;
    y0 -= pad;
    y1 += pad;
    // Zero in view when it is nearly in view: an axis to read from.
    if (y0 > 0 && y0 < (y1 - y0) * 0.3) y0 = 0;
    if (y1 < 0 && -y1 < (y1 - y0) * 0.3) y1 = 0;
  }
  const px = (x: number) =>
    AREA.x0 + ((x - x0) / (x1 - x0)) * (AREA.x1 - AREA.x0);
  const py = (y: number) =>
    AREA.y1 - ((y - y0) / (y1 - y0)) * (AREA.y1 - AREA.y0);
  const out: string[] = [];
  // The grid, then the axes: at zero when zero is shown, else along the edge.
  const xs = ticks(x0, x1);
  const ys = ticks(y0, y1);
  for (const x of xs)
    out.push(
      `<line x1="${r(px(x))}" y1="${AREA.y0}" x2="${r(px(x))}" y2="${AREA.y1}" stroke="${GRID}" stroke-width="2"/>`,
    );
  for (const y of ys)
    out.push(
      `<line x1="${AREA.x0}" y1="${r(py(y))}" x2="${AREA.x1}" y2="${r(py(y))}" stroke="${GRID}" stroke-width="2"/>`,
    );
  const axisY = y0 <= 0 && y1 >= 0 ? py(0) : AREA.y1;
  const axisX = x0 <= 0 && x1 >= 0 ? px(0) : AREA.x0;
  out.push(
    `<line x1="${AREA.x0}" y1="${r(axisY)}" x2="${AREA.x1}" y2="${r(axisY)}" stroke="${MUTED}" stroke-width="3" stroke-linecap="round"/>`,
  );
  out.push(
    `<line x1="${r(axisX)}" y1="${AREA.y0}" x2="${r(axisX)}" y2="${AREA.y1}" stroke="${MUTED}" stroke-width="3" stroke-linecap="round"/>`,
  );
  for (const x of xs)
    out.push(
      `<text x="${r(px(x))}" y="${AREA.y1 + 30}" font-size="22" fill="${MUTED}" text-anchor="middle">${show(x)}</text>`,
    );
  for (const y of ys)
    out.push(
      `<text x="${AREA.x0 - 12}" y="${r(py(y) + 8)}" font-size="22" fill="${MUTED}" text-anchor="end">${show(y)}</text>`,
    );
  if (spec.xLabel)
    out.push(
      `<text x="${(AREA.x0 + AREA.x1) / 2}" y="${AREA.y1 + 70}" font-size="28" font-weight="600" fill="${INK}" text-anchor="middle">${escape(spec.xLabel)}</text>`,
    );
  if (spec.yLabel)
    out.push(
      `<text x="0" y="0" transform="translate(28 ${(AREA.y0 + AREA.y1) / 2}) rotate(-90)" font-size="28" font-weight="600" fill="${INK}" text-anchor="middle">${escape(spec.yLabel)}</text>`,
    );
  // The curve, broken where it has no value or leaves the view in a jump.
  const span = y1 - y0;
  let d = '';
  let length = 0;
  let last: { x: number; y: number } | null = null;
  for (const s of samples) {
    const inView =
      s.y !== null && s.y >= y0 - span * 0.5 && s.y <= y1 + span * 0.5;
    if (!inView || (last && s.y !== null && Math.abs(s.y - last.y) > span)) {
      last = null;
      if (!inView) continue;
    }
    const X = px(s.x);
    const Y = py(Math.min(y1 + span * 0.05, Math.max(y0 - span * 0.05, s.y!)));
    if (last)
      length += Math.hypot(
        X - px(last.x),
        Y - py(Math.min(y1 + span * 0.05, Math.max(y0 - span * 0.05, last.y))),
      );
    d += `${last ? 'L' : 'M'}${r(X)} ${r(Y)}`;
    last = { x: s.x, y: s.y! };
  }
  const drawn = Math.ceil(length) + 10;
  const parts: Record<string, string> = { curve: 'curve' };
  const callouts: Callout[] = [];
  out.push(
    `<style>@keyframes draw{from{stroke-dashoffset:${drawn}}to{stroke-dashoffset:0}}#curve path{stroke-dasharray:${drawn};animation:draw 1.8s ease-out forwards}</style>`,
    `<defs><clipPath id="view"><rect x="${AREA.x0}" y="${AREA.y0}" width="${AREA.x1 - AREA.x0}" height="${AREA.y1 - AREA.y0}"/></clipPath></defs>`,
    `<g id="curve" clip-path="url(#view)"><path d="${d}" fill="none" stroke="${CURVE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  );
  // The points the voice will point at, each a part, its name a label for the stage.
  const f = compileExpression(spec.fn);
  for (const point of spec.points) {
    let y: number;
    try {
      y = Number(f.evaluate({ x: point.x }));
    } catch {
      continue;
    }
    if (!Number.isFinite(y) || point.x < x0 || point.x > x1 || y < y0 || y > y1)
      continue;
    const id = `point-${groupId(point.name) || 'p'}`;
    parts[point.name] = id;
    out.push(
      `<g id="${id}"><circle cx="${r(px(point.x))}" cy="${r(py(y))}" r="11" fill="${POINT}" stroke="#FFFFFF" stroke-width="3"/></g>`,
    );
    callouts.push({
      part: point.name,
      text: point.name,
      anchor: [r(px(point.x)), r(py(y))],
    });
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`,
    viewBox: [0, 0, W, H],
    parts,
    callouts,
  };
}

const r = (n: number) => Math.round(n * 10) / 10;
