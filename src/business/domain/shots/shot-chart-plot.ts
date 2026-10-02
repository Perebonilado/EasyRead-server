/**
 * A graph at full frame, drawn by code from the function itself (worked
 * out by the same locked-down calculator the maths is checked with): its
 * axes with round figures, a faint grid, the curve, and the points the
 * voice names, each marked and named. A model asked to draw a graph draws
 * a picture of one; this is the graph.
 *
 * Parts: the curve `curve` (its path, to draw on), the axes `axis-x` and
 * `axis-y` (their paths), the `grid`, each named point `point-<name>` and
 * its name `label-<name>`, the axes' names `x-label` and `y-label`, the
 * `source`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { compileExpression } from '../scene-math';
import { sample, ticks } from '../scene-plot';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  esc,
  extraOf,
  figuresWidth,
  fit,
  frameOf,
  linesBox,
  mainColour,
  paintOf,
  partSvg,
  r1,
  said,
  slugOf,
  sourceLine,
  sourceSvg,
  textSvg,
  union,
} from './shot-chart-kit';

interface PlotRead {
  fn: string;
  x: [number, number];
  y: [number, number] | null;
  points: { x: number; name: string }[];
  xLabel: string | null;
  yLabel: string | null;
  source: string | null;
}

const num = (v: unknown): number | null => {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim()
        ? Number(v)
        : NaN;
  return Number.isFinite(n) ? n : null;
};

/** A graph's fields made sound: a function with values across a stretch of x, from low to high. */
export function readPlot(raw: Record<string, unknown>): PlotRead | null {
  const body = bodyOf('plot', raw);
  const extra = extraOf('plot', raw);
  const fn = said(body.fn, 120);
  const xs: unknown[] = Array.isArray(body.x) ? body.x : [body.xFrom, body.xTo];
  const ys: unknown[] = Array.isArray(body.y) ? body.y : [body.yFrom, body.yTo];
  const x0 = num(xs[0]);
  const x1 = num(xs[1]);
  if (!fn || x0 === null || x1 === null || !(x1 > x0)) return null;
  let known = 0;
  try {
    known = sample(fn, [x0, x1], 60).filter((p) => p.y !== null).length;
  } catch {
    return null;
  }
  if (known < 18) return null;
  const y0 = num(ys[0]);
  const y1 = num(ys[1]);
  const list: unknown[] = Array.isArray(body.points) ? body.points : [];
  const points = list
    .map((p) => {
      const one = (p && typeof p === 'object' ? p : {}) as Record<
        string,
        unknown
      >;
      return { x: num(one.x), name: said(one.name, 32) };
    })
    .filter(
      (p): p is { x: number; name: string } => p.x !== null && Boolean(p.name),
    )
    .slice(0, 4);
  return {
    fn,
    x: [x0, x1],
    y: y0 !== null && y1 !== null && y1 > y0 ? [y0, y1] : null,
    points,
    xLabel: said(body.xLabel, 40) || null,
    yLabel: said(body.yLabel, 40) || null,
    source: sourceLine(extra.source),
  };
}

/** A tick's figure as it is read: no trailing zeros, no -0, a true minus. */
const shown = (n: number) => {
  const text = Number(n.toPrecision(6)).toString();
  return text === '-0' ? '0' : text.replace('-', '−');
};

export function plotAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const read = readPlot(raw);
  if (!read) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const tall = shape === 'tall';
  const { text } = frame;
  const floor = frame.size.label;
  const colour = mainColour(paint, extraOf('plot', raw).colour);
  const [x0, x1] = read.x;
  const samples = sample(read.fn, [x0, x1]);
  const known = samples
    .map((s) => s.y)
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);
  let [y0, y1] = read.y ?? [
    known[Math.floor(known.length * 0.02)],
    known[Math.ceil(known.length * 0.98) - 1],
  ];
  if (!read.y) {
    const pad = (y1 - y0 || 1) * 0.1;
    y0 -= pad;
    y1 += pad;
    // Zero in view when it is nearly in view: an axis to read from.
    if (y0 > 0 && y0 < (y1 - y0) * 0.3) y0 = 0;
    if (y1 < 0 && -y1 < (y1 - y0) * 0.3) y1 = 0;
  }
  const xt = ticks(x0, x1, tall ? 4 : 6);
  const yt = ticks(y0, y1, tall ? 4 : 5);
  const tickW =
    Math.max(...yt.map((v) => figuresWidth(shown(v), floor, paint.figure))) +
    floor * 0.5;
  const yLabel = read.yLabel
    ? fit(read.yLabel, text.x1 - text.x0, floor, floor, 1, 600)
    : null;
  const xLabel = read.xLabel
    ? fit(read.xLabel, text.x1 - text.x0, floor, floor, 1, 600)
    : null;
  const sourceH = read.source ? frame.size.chip * 2.4 : 0;
  // The plotting area: the words' area less the figures and names round it.
  const ax0 = text.x0 + tickW;
  const ax1 = text.x1 - floor * 0.4;
  const ay0 = text.y0 + (yLabel ? floor * 1.6 : floor * 0.4);
  const ay1 = text.y1 - floor * 1.5 - (xLabel ? floor * 1.4 : 0) - sourceH;
  const px = (x: number) => ax0 + ((x - x0) / (x1 - x0)) * (ax1 - ax0);
  const py = (y: number) => ay1 - ((y - y0) / (y1 - y0)) * (ay1 - ay0);
  const out: string[] = [];
  // The faint grid.
  const grid = [
    ...xt.map((x) => `<path d="M${r1(px(x))} ${r1(ay0)}V${r1(ay1)}"/>`),
    ...yt.map((y) => `<path d="M${r1(ax0)} ${r1(py(y))}H${r1(ax1)}"/>`),
  ].join('');
  book.add('grid', { box: [ax0, ay0, ax1 - ax0, ay1 - ay0], role: 'muted' });
  out.push(
    partSvg('grid', grid, ` stroke="${esc(paint.rule)}" stroke-width="2"`),
  );
  // The axes: at zero where zero is shown, else along the area's edge.
  const axisY = y0 <= 0 && y1 >= 0 ? py(0) : ay1;
  const axisX = x0 <= 0 && x1 >= 0 ? px(0) : ax0;
  const stroke = Math.max(3, frame.H * 0.004);
  const xPath = `M${r1(ax0)} ${r1(axisY)}H${r1(ax1)}`;
  const yPath = `M${r1(axisX)} ${r1(ay1)}V${r1(ay0)}`;
  book.add('axis-x', {
    box: [ax0, axisY - 2, ax1 - ax0, 4],
    path: xPath,
    role: 'ink',
  });
  book.add('axis-y', {
    box: [axisX - 2, ay0, 4, ay1 - ay0],
    path: yPath,
    role: 'ink',
  });
  out.push(
    `<path data-part="axis-x" d="${xPath}" stroke="${esc(paint.ink)}" stroke-width="${r1(stroke)}" stroke-linecap="round"/>`,
    `<path data-part="axis-y" d="${yPath}" stroke="${esc(paint.ink)}" stroke-width="${r1(stroke)}" stroke-linecap="round"/>`,
  );
  // The figures along the axes: under the foot, and at the left.
  const figure = (
    value: number,
    x: number,
    y: number,
    anchor: 'middle' | 'end',
  ) =>
    textSvg([shown(value)], x, y, {
      size: floor,
      fill: paint.muted,
      family: paint.text,
      weight: 600,
      anchor,
      tabular: true,
    });
  out.push(
    `<g>${[
      ...xt.map((x) =>
        figure(x, px(x), ay1 + floor * 0.35 + floor * ASCENT, 'middle'),
      ),
      ...yt.map((y) =>
        figure(y, ax0 - floor * 0.3, py(y) + floor * 0.34, 'end'),
      ),
    ].join('')}</g>`,
  );
  // The curve, broken where it has no value or leaves the view in a jump.
  const span = y1 - y0;
  let d = '';
  let last: number | null = null;
  const inside: ShotBox[] = [];
  for (const s of samples) {
    if (
      s.y === null ||
      s.y < y0 - span * 0.02 ||
      s.y > y1 + span * 0.02 ||
      (last !== null && Math.abs(s.y - last) > span * 0.5)
    ) {
      last = null;
      continue;
    }
    const X = px(s.x);
    const Y = py(s.y);
    d += `${last === null ? 'M' : 'L'}${r1(X)} ${r1(Y)}`;
    inside.push([X, Y, 0, 0]);
    last = s.y;
  }
  if (!d) return null;
  const curveStroke = Math.max(6, frame.H * 0.008);
  book.add('curve', { box: union(...inside), path: d, role: colour.role });
  out.push(
    `<path data-part="curve" d="${d}" fill="none" stroke="${esc(colour.colour)}" stroke-width="${r1(curveStroke)}" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  // The named points, each a dot on the curve and its name beside it.
  const f = compileExpression(read.fn);
  const taken: ShotBox[] = [];
  // How much a name's box would cover of those already set, a gap round each.
  const clash = (b: ShotBox) =>
    taken.reduce((sum, t) => {
      const g = floor * 0.2;
      const ox =
        Math.min(b[0] + b[2], t[0] + t[2] + g) - Math.max(b[0], t[0] - g);
      const oy =
        Math.min(b[1] + b[3], t[1] + t[3] + g) - Math.max(b[1], t[1] - g);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
  const inArea = (b: ShotBox) =>
    b[0] >= text.x0 &&
    b[0] + b[2] <= text.x1 &&
    b[1] >= text.y0 &&
    b[1] + b[3] <= ay1;
  read.points.forEach((point, i) => {
    let y: number;
    try {
      y = Number(f.evaluate({ x: point.x }));
    } catch {
      return;
    }
    if (!Number.isFinite(y) || point.x < x0 || point.x > x1 || y < y0 || y > y1)
      return;
    const cx = px(point.x);
    const cy = py(y);
    const r = curveStroke * 1.3;
    const stem = slugOf(point.name) || String(i + 1);
    const pid = book.id(`point-${stem}`);
    const lid = book.id(`label-${stem}`);
    book.add(pid, {
      box: [cx - r, cy - r, r * 2, r * 2],
      value: y,
      role: 'ink',
      pivot: [0.5, 0.5],
    });
    out.push(
      `<circle data-part="${pid}" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${esc(paint.ink)}" stroke="${esc(paint.paper)}" stroke-width="${r1(r * 0.4)}"/>`,
    );
    // Over to the right, over to the left, under them: the first clear of the rest and inside.
    const tries: [number, number, 'start' | 'end'][] = [
      [cx + r * 1.6, cy - r * 1.6, 'start'],
      [cx - r * 1.6, cy - r * 1.6, 'end'],
      [cx + r * 1.6, cy + r * 1.6 + floor * ASCENT, 'start'],
      [cx - r * 1.6, cy + r * 1.6 + floor * ASCENT, 'end'],
    ];
    const boxes = tries.map(([x, y2, anchor]) =>
      linesBox([point.name], x, y2, floor, anchor, 1.15, 700),
    );
    // The first inside and clear; else the one inside that covers least.
    const ok = boxes.findIndex((b) => inArea(b) && clash(b) === 0);
    const inside = boxes
      .map((b, j) => ({ j, cover: inArea(b) ? clash(b) : Infinity }))
      .sort((p, q) => p.cover - q.cover);
    const k = ok >= 0 ? ok : inside[0].j;
    const [lx, ly, anchor] = tries[k];
    taken.push(boxes[k]);
    book.add(lid, { box: boxes[k], role: 'ink' });
    out.push(
      textSvg(
        [point.name],
        lx,
        ly,
        { size: floor, fill: paint.ink, family: paint.text, anchor },
        lid,
      ),
    );
  });
  if (yLabel) {
    const base = text.y0 + floor * ASCENT;
    const box = linesBox(
      yLabel.lines,
      text.x0,
      base,
      floor,
      'start',
      1.15,
      600,
    );
    book.add('y-label', { box, role: 'ink' });
    out.push(
      textSvg(
        yLabel.lines,
        text.x0,
        base,
        { size: floor, fill: paint.ink, family: paint.text, weight: 600 },
        'y-label',
      ),
    );
  }
  if (xLabel) {
    const base = ay1 + floor * 1.5 + floor * ASCENT;
    const box = linesBox(xLabel.lines, ax1, base, floor, 'end', 1.15, 600);
    book.add('x-label', { box, role: 'ink' });
    out.push(
      textSvg(
        xLabel.lines,
        ax1,
        base,
        {
          size: floor,
          fill: paint.ink,
          family: paint.text,
          weight: 600,
          anchor: 'end',
        },
        'x-label',
      ),
    );
  }
  if (read.source)
    out.push(
      sourceSvg(
        book,
        paint,
        frame,
        read.source,
        text.x0,
        text.y1 - frame.size.chip * 0.35,
        text.x1 - text.x0,
      ).svg,
    );
  return assetOf(frame, paint, out.join(''), book, [
    ax0,
    ay0,
    ax1 - ax0,
    ay1 - ay0,
  ]);
}
