/**
 * A chart at full frame, from the page's own numbers: bars, or a line
 * through points. Labelled directly, as an editorial chart is: every bar
 * carries its value and its name, so there is no axis to read and no
 * legend; a line names its first and last values. The bars stand on one
 * baseline and use most of the frame: columns when every name fits under
 * its bar, rows otherwise (and always in a tall frame, where a long chart
 * runs on down past the frame's foot for the camera to travel down).
 *
 * Parts: each bar `bar-<name>` (its value, and its pivot on the baseline
 * so it grows from there), its value `value-<name>` and its name
 * `label-<name>`; all the bars together `bars`; the baseline `axis` (with
 * its path); a line's stroke `line` (with its path) and each of its
 * points `point-<name>`; a word unit written once over the chart, `unit`;
 * and the `source`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { valueText } from '../scene-chart';
import { ticks } from '../scene-plot';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  coloursFor,
  extraOf,
  figuresWidth,
  fit,
  frameOf,
  linesBox,
  paintOf,
  partSvg,
  r1,
  said,
  sideFor,
  slugOf,
  sourceLine,
  sourceSvg,
  textSvg,
  union,
  wordsWidth,
  wrap,
  type Colour,
  type Frame,
  type Paint,
} from './shot-chart-kit';

/** The most bars one chart holds. */
export const MOST_BARS = 8;

interface Bar {
  label: string;
  value: number;
  colour: Colour;
  /** Its part ids: the bar, its value, its name, its point on a line. */
  id: string;
  valueId: string;
  labelId: string;
}

interface ChartRead {
  kind: 'bar' | 'line';
  unit: string | null;
  bars: { label: string; value: number; colour: unknown }[];
  source: string | null;
}

/** A chart's fields made sound: at least two named, finite numbers, at most MOST_BARS. */
export function readChart(raw: Record<string, unknown>): ChartRead | null {
  const body = bodyOf('chart', raw);
  const extra = extraOf('chart', raw);
  const list = Array.isArray(body.bars)
    ? body.bars
    : Array.isArray(body.points)
      ? body.points
      : [];
  const bars = list
    .map((b: unknown) => {
      const one = (b && typeof b === 'object' ? b : {}) as Record<
        string,
        unknown
      >;
      const value =
        typeof one.value === 'number'
          ? one.value
          : Number(said(one.value, 30).replace(/,/g, ''));
      return { label: said(one.label, 40), value, colour: one.colour };
    })
    .filter((b) => b.label && Number.isFinite(b.value))
    .slice(0, MOST_BARS);
  if (bars.length < 2) return null;
  if (!bars.some((b) => b.value !== 0)) return null;
  return {
    kind: body.kind === 'line' ? 'line' : 'bar',
    unit: said(body.unit, 16) || null,
    bars,
    source: sourceLine(extra.source),
  };
}

/** Whether a unit is written against its number ("54%") rather than as a word after it ("1.5 million"). */
const attachedUnit = (unit: string | null) =>
  Boolean(unit && /^(?:%|°[CF]?|‰|x|×)$/.test(unit));

/** Each bar's colour: a side the show names, a token the writer gave; else one colour for all, the accent. */
function coloursOf(paint: Paint, read: ChartRead): Colour[] {
  const own = read.bars.map(
    (b) => Boolean(sideFor(paint, b.label)) || Boolean(b.colour),
  );
  if (!own.some(Boolean))
    return read.bars.map(() => ({ colour: paint.accent, role: 'accent' }));
  // Some have their own colour: the rest stand back in the muted ink.
  const given = coloursFor(
    paint,
    read.bars.map((b) => ({ name: b.label, token: b.colour })),
  );
  return given.map((c, i) =>
    own[i] ? c : { colour: paint.muted, role: 'muted' },
  );
}

/** The parts' ids of each bar, from its name. */
function named(book: PartBook, read: ChartRead, colours: Colour[]): Bar[] {
  return read.bars.map((b, i) => {
    const slug = slugOf(b.label) || String(i + 1);
    const id = book.id(`bar-${slug}`);
    // Its value and its name share its stem, so a second "North" is "-2" in all three.
    const stem = id.slice(4);
    return {
      label: b.label,
      value: b.value,
      colour: colours[i],
      id,
      valueId: book.id(`value-${stem}`),
      labelId: book.id(`label-${stem}`),
    };
  });
}

/** A value as its bar shows it, with the unit or without it. */
const shown = (value: number, unit: string | null, withUnit: boolean) =>
  valueText(value, withUnit ? unit : null);

interface Scale {
  low: number;
  high: number;
}

const scaleOf = (values: number[]): Scale => ({
  low: Math.min(0, ...values),
  high: Math.max(0, ...values),
});

/** The unit written once over a chart whose values go without it: "million", "people". */
function unitLine(
  book: PartBook,
  paint: Paint,
  frame: Frame,
  unit: string,
  x: number,
  y: number,
): { svg: string; box: ShotBox } {
  const size = frame.size.label;
  const box = linesBox([unit], x, y, size, 'start', 1.15, 600);
  book.add('unit', { box, role: 'muted' });
  return {
    svg: textSvg(
      [unit],
      x,
      y,
      { size, fill: paint.muted, family: paint.text, weight: 600 },
      'unit',
    ),
    box,
  };
}

/** Columns standing on one baseline, each with its value over it and its name under it. */
function columns(
  frame: Frame,
  paint: Paint,
  book: PartBook,
  read: ChartRead,
  bars: Bar[],
  withUnit: boolean,
  labelSize: number,
  valueSize: number,
  labels: string[][],
): { svg: string; focal: ShotBox } {
  const { text } = frame;
  const out: string[] = [];
  const x0 = text.x0 + frame.W * 0.02;
  const x1 = text.x1 - frame.W * 0.02;
  const slot = (x1 - x0) / bars.length;
  const barW = Math.min(slot * 0.64, frame.H * 0.26);
  const unitRoom =
    read.unit && !withUnit && !attachedUnit(read.unit)
      ? frame.size.label * 1.5
      : 0;
  const most = Math.max(...labels.map((l) => l.length));
  const labelRoom =
    labelSize * 0.7 + (most - 1) * labelSize * 1.12 + labelSize * 1.05;
  const sourceRoom = read.source ? frame.size.chip * 2.2 : 0;
  const top = text.y0 + unitRoom + valueSize * 1.25;
  const base = text.y1 - sourceRoom - labelRoom;
  const { low, high } = scaleOf(bars.map((b) => b.value));
  // Negative bars hang under the zero line; their values go under them.
  const below = low < 0 ? valueSize * 1.25 : 0;
  const span = high - low;
  const plotH = base - below - top;
  const zero = top + (high / span) * plotH;
  const y = (v: number) => zero - (v / span) * plotH;
  if (unitRoom)
    out.push(
      unitLine(
        book,
        paint,
        frame,
        read.unit!,
        x0,
        text.y0 + frame.size.label * ASCENT,
      ).svg,
    );
  const barBoxes: ShotBox[] = [];
  const marks: string[] = [];
  bars.forEach((bar, i) => {
    const cx = x0 + slot * (i + 0.5);
    const top1 = Math.min(y(bar.value), zero);
    const h = Math.max(2, Math.abs(zero - y(bar.value)));
    const box: ShotBox = [cx - barW / 2, top1, barW, h];
    barBoxes.push(box);
    book.add(bar.id, {
      box,
      value: bar.value,
      role: bar.colour.role,
      pivot: bar.value >= 0 ? [0.5, 1] : [0.5, 0],
    });
    marks.push(
      partSvg(
        bar.id,
        `<rect x="${r1(box[0])}" y="${r1(box[1])}" width="${r1(barW)}" height="${r1(h)}" rx="${r1(Math.min(barW * 0.06, 8))}"/>`,
        ` fill="${bar.colour.colour}"`,
      ),
    );
    // Its value: over a bar that stands up, under one that hangs down.
    const vy =
      bar.value >= 0
        ? box[1] - valueSize * 0.32
        : box[1] + h + valueSize * (ASCENT + 0.22);
    const value = shown(bar.value, read.unit, withUnit);
    const vbox = linesBox(
      [value],
      cx,
      vy,
      valueSize,
      'middle',
      1.15,
      700,
      'display',
      paint.figure,
    );
    book.add(bar.valueId, { box: vbox, value: bar.value, role: 'ink' });
    out.push(
      textSvg(
        [value],
        cx,
        vy,
        {
          size: valueSize,
          fill: paint.ink,
          family: paint.display,
          anchor: 'middle',
          tabular: true,
        },
        bar.valueId,
      ),
    );
    // Its name under the baseline, broken to its slot.
    const ly = base + labelSize * 0.7 + labelSize * ASCENT;
    const lbox = linesBox(labels[i], cx, ly, labelSize, 'middle', 1.12, 600);
    book.add(bar.labelId, { box: lbox, role: 'ink' });
    out.push(
      textSvg(
        labels[i],
        cx,
        ly,
        {
          size: labelSize,
          fill: paint.ink,
          family: paint.text,
          weight: 600,
          anchor: 'middle',
          leading: 1.12,
        },
        bar.labelId,
      ),
    );
  });
  const all = union(...barBoxes);
  book.add('bars', { box: all, pivot: [0.5, 1] });
  out.unshift(partSvg('bars', marks.join('')));
  // The baseline, over the bars' feet: where they grow from.
  const axisPath = `M${r1(x0)} ${r1(zero)}H${r1(x1)}`;
  book.add('axis', {
    box: [x0, zero - 2, x1 - x0, 4],
    path: axisPath,
    role: 'ink',
  });
  out.push(
    partSvg(
      'axis',
      `<path d="${axisPath}" stroke="${paint.ink}" stroke-width="${r1(Math.max(3, frame.H * 0.004))}" stroke-linecap="round"/>`,
    ),
  );
  if (read.source)
    out.push(
      sourceSvg(
        book,
        paint,
        frame,
        read.source,
        x0,
        text.y1 - frame.size.chip * 0.35,
        x1 - x0,
      ).svg,
    );
  const valueTop = Math.min(...bars.map((b) => book.parts[b.valueId].box[1]));
  return {
    svg: out.join(''),
    focal: union(all, [x0, valueTop, x1 - x0, base - valueTop + labelRoom]),
  };
}

/**
 * Rows, one bar a row: in a wide frame each name in a column at the left
 * and its bar to its right with the value at its end; in a tall frame the
 * name over its bar, the value at the row's right, the rows running down
 * the words' area and on past it.
 */
function rows(
  frame: Frame,
  paint: Paint,
  book: PartBook,
  read: ChartRead,
  bars: Bar[],
  withUnit: boolean,
): { svg: string; focal: ShotBox; bottom: number } {
  const { text } = frame;
  const tall = frame.shape === 'tall';
  const out: string[] = [];
  const floor = frame.size.label;
  const x0 = tall ? text.x0 : text.x0 + frame.W * 0.02;
  const values = bars.map((b) => shown(b.value, read.unit, withUnit));
  const unitRoom =
    read.unit && !withUnit && !attachedUnit(read.unit) ? floor * 1.6 : 0;
  if (unitRoom)
    out.push(
      unitLine(book, paint, frame, read.unit!, x0, text.y0 + floor * ASCENT)
        .svg,
    );
  const { low, high } = scaleOf(bars.map((b) => b.value));
  const span = high - low;
  const marks: string[] = [];
  const barBoxes: ShotBox[] = [];
  let bottom = 0;
  if (tall) {
    // The name and the value on one line, the bar under them.
    const valueSize = floor;
    const valueW = Math.max(
      ...values.map((v) => figuresWidth(v, valueSize, paint.figure)),
    );
    const nameW = text.x1 - x0 - valueW - floor * 0.5;
    const names = bars.map(
      (b) =>
        wrap(b.label, nameW, floor, 2, 600) ??
        fit(b.label, nameW, floor, floor, 2, 600).lines,
    );
    // The longest bar ends under the values' right edge.
    const barX0 = x0;
    const barX1 = text.x1;
    const thick = floor * 0.62;
    const zeroX = barX0 + ((0 - low) / span) * (barX1 - barX0);
    let y = text.y0 + unitRoom;
    bars.forEach((bar, i) => {
      const base = y + floor * ASCENT;
      const lbox = linesBox(names[i], x0, base, floor, 'start', 1.12, 600);
      book.add(bar.labelId, { box: lbox, role: 'ink' });
      out.push(
        textSvg(
          names[i],
          x0,
          base,
          {
            size: floor,
            fill: paint.ink,
            family: paint.text,
            weight: 600,
            leading: 1.12,
          },
          bar.labelId,
        ),
      );
      const vbox = linesBox(
        [values[i]],
        text.x1,
        base,
        valueSize,
        'end',
        1.15,
        700,
        'display',
        paint.figure,
      );
      book.add(bar.valueId, { box: vbox, value: bar.value, role: 'ink' });
      out.push(
        textSvg(
          [values[i]],
          text.x1,
          base,
          {
            size: valueSize,
            fill: paint.ink,
            family: paint.display,
            anchor: 'end',
            tabular: true,
          },
          bar.valueId,
        ),
      );
      const barY = lbox[1] + lbox[3] + floor * 0.22;
      const end = barX0 + ((bar.value - low) / span) * (barX1 - barX0);
      const bx = Math.min(zeroX, end);
      const bw = Math.max(3, Math.abs(end - zeroX));
      const box: ShotBox = [bx, barY, bw, thick];
      barBoxes.push(box);
      book.add(bar.id, {
        box,
        value: bar.value,
        role: bar.colour.role,
        pivot: bar.value >= 0 ? [0, 0.5] : [1, 0.5],
      });
      marks.push(
        partSvg(
          bar.id,
          `<rect x="${r1(bx)}" y="${r1(barY)}" width="${r1(bw)}" height="${r1(thick)}" rx="${r1(thick * 0.12)}"/>`,
          ` fill="${bar.colour.colour}"`,
        ),
      );
      y = barY + thick + floor * 0.62;
    });
    bottom = y;
    // The baseline down the rows' zero.
    const axisPath = `M${r1(zeroX)} ${r1(text.y0 + unitRoom)}V${r1(y - floor * 0.4)}`;
    book.add('axis', {
      box: [
        zeroX - 2,
        text.y0 + unitRoom,
        4,
        y - floor * 0.4 - text.y0 - unitRoom,
      ],
      path: axisPath,
      role: 'ink',
    });
    if (low < 0)
      out.push(
        partSvg(
          'axis',
          `<path d="${axisPath}" stroke="${paint.ink}" stroke-width="3" stroke-linecap="round"/>`,
        ),
      );
    else
      out.push(
        partSvg(
          'axis',
          `<path d="${axisPath}" stroke="${paint.rule}" stroke-width="3" stroke-linecap="round"/>`,
        ),
      );
  } else {
    // Names in a column at the left, the bars from one edge, the values at their ends.
    const labelSize = floor;
    const names = bars.map(
      (b) => fit(b.label, frame.W * 0.3, labelSize, labelSize, 2, 600).lines,
    );
    const nameW = Math.max(
      ...names.map((l) =>
        Math.max(...l.map((line) => wordsWidth(line, labelSize, 600))),
      ),
    );
    const valueSize = Math.min(frame.size.title, floor * 1.15);
    const valueW = Math.max(
      ...values.map((v) => figuresWidth(v, valueSize, paint.figure)),
    );
    const barX0 = x0 + nameW + floor * 0.6;
    const barX1 = text.x1 - valueW - floor * 0.5;
    const sourceRoom = read.source ? frame.size.chip * 2.2 : 0;
    const top = text.y0 + unitRoom;
    const room = text.y1 - sourceRoom - top;
    const rowH = Math.min(room / bars.length, frame.H * 0.2);
    const thick = Math.min(rowH * 0.62, frame.H * 0.11);
    const zeroX = barX0 + ((0 - low) / span) * (barX1 - barX0);
    const startY = top + (room - rowH * bars.length) / 2;
    bars.forEach((bar, i) => {
      const cy = startY + rowH * (i + 0.5);
      const lines = names[i];
      const base =
        cy - ((lines.length - 1) * labelSize * 1.12) / 2 + labelSize * 0.35;
      const lbox = linesBox(lines, x0, base, labelSize, 'start', 1.12, 600);
      book.add(bar.labelId, { box: lbox, role: 'ink' });
      out.push(
        textSvg(
          lines,
          x0,
          base,
          {
            size: labelSize,
            fill: paint.ink,
            family: paint.text,
            weight: 600,
            leading: 1.12,
          },
          bar.labelId,
        ),
      );
      const end = barX0 + ((bar.value - low) / span) * (barX1 - barX0);
      const bx = Math.min(zeroX, end);
      const bw = Math.max(3, Math.abs(end - zeroX));
      const box: ShotBox = [bx, cy - thick / 2, bw, thick];
      barBoxes.push(box);
      book.add(bar.id, {
        box,
        value: bar.value,
        role: bar.colour.role,
        pivot: bar.value >= 0 ? [0, 0.5] : [1, 0.5],
      });
      marks.push(
        partSvg(
          bar.id,
          `<rect x="${r1(bx)}" y="${r1(cy - thick / 2)}" width="${r1(bw)}" height="${r1(thick)}" rx="${r1(Math.min(thick * 0.1, 8))}"/>`,
          ` fill="${bar.colour.colour}"`,
        ),
      );
      // Its value just past its end: right of a bar that grows right, left of one that grows left.
      const right = bar.value >= 0;
      const vx = right ? bx + bw + floor * 0.3 : bx - floor * 0.3;
      const vy = cy + valueSize * 0.35;
      const anchor = right ? 'start' : 'end';
      const vbox = linesBox(
        [values[i]],
        vx,
        vy,
        valueSize,
        anchor,
        1.15,
        700,
        'display',
        paint.figure,
      );
      book.add(bar.valueId, { box: vbox, value: bar.value, role: 'ink' });
      out.push(
        textSvg(
          [values[i]],
          vx,
          vy,
          {
            size: valueSize,
            fill: paint.ink,
            family: paint.display,
            anchor,
            tabular: true,
          },
          bar.valueId,
        ),
      );
    });
    bottom = startY + rowH * bars.length;
    const axisPath = `M${r1(zeroX)} ${r1(startY)}V${r1(bottom)}`;
    book.add('axis', {
      box: [zeroX - 2, startY, 4, bottom - startY],
      path: axisPath,
      role: 'ink',
    });
    out.push(
      partSvg(
        'axis',
        `<path d="${axisPath}" stroke="${paint.ink}" stroke-width="${r1(Math.max(3, frame.H * 0.004))}" stroke-linecap="round"/>`,
      ),
    );
    if (read.source)
      out.push(
        sourceSvg(
          book,
          paint,
          frame,
          read.source,
          x0,
          text.y1 - frame.size.chip * 0.35,
          text.x1 - x0,
        ).svg,
      );
  }
  const all = union(...barBoxes);
  book.add('bars', { box: all, pivot: [0, 0.5] });
  out.unshift(partSvg('bars', marks.join('')));
  if (tall && read.source) {
    const drawn = sourceSvg(
      book,
      paint,
      frame,
      read.source,
      x0,
      bottom + frame.size.chip * 0.9,
      text.x1 - x0,
    );
    out.push(drawn.svg);
    bottom = drawn.box[1] + drawn.box[3];
  }
  const labelsBox = union(...bars.map((b) => book.parts[b.labelId].box));
  const valuesBox = union(...bars.map((b) => book.parts[b.valueId].box));
  return { svg: out.join(''), focal: union(all, labelsBox, valuesBox), bottom };
}

/**
 * The size every name is set at under its column, or null when some name
 * will not go on two lines under its bar at the floor: the chart is drawn
 * in rows instead.
 */
function columnLabels(
  frame: Frame,
  bars: Bar[],
): { size: number; lines: string[][] } | null {
  const { text } = frame;
  const slot = (text.x1 - text.x0 - frame.W * 0.04) / bars.length;
  for (
    let size = frame.size.title;
    size >= frame.size.label;
    size -= Math.max(0.5, size * 0.04)
  ) {
    const lines = bars.map((b) => wrap(b.label, slot * 0.92, size, 2, 600));
    if (lines.every((l): l is string[] => l !== null))
      return { size: r1(size), lines };
  }
  return null;
}

/**
 * Names along a foot, as many as fit: the first and the last always, then
 * the rest in an even spread, each kept only where it clears those
 * already set.
 */
function spreadNames(
  xs: readonly number[],
  widths: readonly number[],
  gap: number,
): number[] {
  const n = xs.length;
  const order = [0, n - 1];
  for (let step = n - 1; step > 1; step = Math.ceil(step / 2))
    for (let i = 0; i < n; i += Math.ceil(step / 2)) order.push(i);
  for (let i = 0; i < n; i += 1) order.push(i);
  const kept: number[] = [];
  for (const i of order) {
    if (kept.includes(i)) continue;
    const clear = kept.every(
      (k) => Math.abs(xs[i] - xs[k]) >= (widths[i] + widths[k]) / 2 + gap,
    );
    if (clear) kept.push(i);
  }
  return kept.sort((a, b) => a - b);
}

/**
 * A line through the points: a few faint lines across with their figures
 * at the left (a wide frame's), the line itself, a dot at each point, its
 * first and last values written by their points, and the names along the
 * foot as many as fit. The baseline is drawn in ink only where it is
 * zero: a line need not start from zero, and a heavy foot would say it did.
 */
function lineChart(
  frame: Frame,
  paint: Paint,
  book: PartBook,
  read: ChartRead,
  bars: Bar[],
  withUnit: boolean,
): { svg: string; focal: ShotBox } {
  const { text } = frame;
  const tall = frame.shape === 'tall';
  const out: string[] = [];
  const floor = frame.size.label;
  const values = bars.map((b) => b.value);
  const rawLow = Math.min(...values);
  const rawHigh = Math.max(...values);
  const pad = (rawHigh - rawLow || Math.abs(rawHigh) || 1) * 0.12;
  // From zero when zero is close by; else from just under the lowest.
  let low = rawLow - pad;
  let high = rawHigh + pad;
  if (low > 0 && low < (high - low) * 0.25) low = 0;
  if (high < 0 && -high < (high - low) * 0.25) high = 0;
  const grid = ticks(low, high, tall ? 3 : 4).filter(
    (v) => v >= low && v <= high,
  );
  // The range ends on the lines across where they hold the points, so a line is never drawn twice.
  if (grid.length && grid[0] <= rawLow) low = grid[0];
  if (grid.length && grid[grid.length - 1] >= rawHigh)
    high = grid[grid.length - 1];
  const y0v = low;
  const y1v = high;
  const valueSize = tall ? floor : Math.min(frame.size.title, floor * 1.15);
  const tickText = (v: number) => shown(v, read.unit, attachedUnit(read.unit));
  const tickW = tall
    ? 0
    : Math.max(
        ...grid.map((v) => figuresWidth(tickText(v), floor, paint.figure)),
      ) +
      floor * 0.6;
  const lastText = shown(bars[bars.length - 1].value, read.unit, withUnit);
  const endRoom = tall
    ? 0
    : figuresWidth(lastText, valueSize, paint.figure) + floor * 0.7;
  const stroke = Math.max(5, frame.H * 0.0075);
  const dot = stroke * 1.5;
  // A tall frame's line stays inside the words' area: its values and names are on it.
  const x0 = text.x0 + tickW + (tall ? dot : 0);
  const x1 = text.x1 - endRoom - (tall ? dot : 0);
  const unitRoom =
    read.unit && !withUnit && !attachedUnit(read.unit) ? floor * 1.6 : 0;
  const sourceRoom = read.source ? frame.size.chip * 2.2 : 0;
  const labelRoom = floor * (tall ? 1.6 : 2.1);
  // Room over the line for its first and last values.
  const top = text.y0 + unitRoom + valueSize * (tall ? 1 : 1.5);
  const foot = text.y1;
  const bottom = foot - sourceRoom - labelRoom;
  const px = (i: number) => x0 + ((x1 - x0) * i) / (bars.length - 1);
  const py = (v: number) => bottom - ((v - y0v) / (y1v - y0v)) * (bottom - top);
  if (unitRoom)
    out.push(
      unitLine(
        book,
        paint,
        frame,
        read.unit!,
        text.x0,
        text.y0 + floor * ASCENT,
      ).svg,
    );
  // The faint lines across, each with its figure at the left in a wide frame.
  const rules = grid
    .filter((v) => v !== 0 || tall)
    .map(
      (v) =>
        (v === y0v || v === 0
          ? ''
          : `<path d="M${r1(x0)} ${r1(py(v))}H${r1(x1)}" stroke="${paint.rule}" stroke-width="2"/>`) +
        (tall
          ? ''
          : textSvg([tickText(v)], text.x0, py(v) + floor * 0.34, {
              size: floor,
              fill: paint.muted,
              family: paint.text,
              weight: 600,
              tabular: true,
            })),
    )
    .join('');
  book.add('grid', {
    box: tall
      ? [x0, top, x1 - x0, bottom - top]
      : [text.x0, top - floor, x1 - text.x0, bottom - top + floor * 2],
    role: 'muted',
  });
  out.push(partSvg('grid', rules));
  // The foot: zero in ink when zero is in view, else a faint floor.
  const zeroIn = y0v <= 0 && y1v >= 0;
  const axisY = zeroIn ? py(0) : bottom;
  const axisPath = `M${r1(x0)} ${r1(axisY)}H${r1(x1)}`;
  book.add('axis', {
    box: [x0, axisY - 2, x1 - x0, 4],
    path: axisPath,
    role: zeroIn ? 'ink' : 'muted',
  });
  out.push(
    partSvg(
      'axis',
      `<path d="${axisPath}" stroke="${zeroIn ? paint.ink : paint.rule}" stroke-width="3" stroke-linecap="round"/>`,
    ),
  );
  const points = bars.map((b, i) => [px(i), py(b.value)] as const);
  const path = points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`)
    .join('');
  const colour = bars[0].colour;
  book.add('line', {
    box: union(...points.map(([x, y]): ShotBox => [x, y, 0, 0])),
    path,
    role: colour.role,
  });
  out.push(
    partSvg(
      'line',
      `<path d="${path}" fill="none" stroke-width="${r1(stroke)}" stroke-linecap="round" stroke-linejoin="round"/>`,
      ` stroke="${colour.colour}"`,
    ),
  );
  bars.forEach((bar, i) => {
    const [x, y] = points[i];
    book.add(bar.id, {
      box: [x - dot, y - dot, dot * 2, dot * 2],
      value: bar.value,
      role: colour.role,
    });
    out.push(
      partSvg(
        bar.id,
        `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(dot)}" stroke="${paint.paper}" stroke-width="${r1(stroke * 0.6)}"/>`,
        ` fill="${colour.colour}"`,
      ),
    );
  });
  // The names along the foot, as many as fit, the ends' kept inside the words' area.
  const widths = bars.map((b) => wordsWidth(b.label, floor, 600));
  const at = points.map(([x], i) =>
    Math.min(Math.max(x, text.x0 + widths[i] / 2), text.x1 - widths[i] / 2),
  );
  const named = spreadNames(at, widths, floor * 0.8);
  for (const i of named) {
    const bar = bars[i];
    const ax = at[i];
    const ly = bottom + floor * 0.75 + floor * ASCENT;
    const lbox = linesBox([bar.label], ax, ly, floor, 'middle', 1.15, 600);
    book.add(bar.labelId, { box: lbox, role: 'muted' });
    out.push(
      textSvg(
        [bar.label],
        ax,
        ly,
        {
          size: floor,
          fill: paint.muted,
          family: paint.text,
          weight: 600,
          anchor: 'middle',
        },
        bar.labelId,
      ),
    );
  }
  // Each end's value where it clears the line, the names and the other
  // value: tried over and under its point, from it and toward the middle.
  const taken: ShotBox[] = named.map((i) => book.parts[bars[i].labelId].box);
  const segments = points.slice(1).map((p, k) => [points[k], p] as const);
  const hitsLine = (b: ShotBox) =>
    segments.some(([a, c]) => {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a[0] + (c[0] - a[0]) * t;
        const y = a[1] + (c[1] - a[1]) * t;
        if (
          x > b[0] - stroke &&
          x < b[0] + b[2] + stroke &&
          y > b[1] - stroke &&
          y < b[1] + b[3] + stroke
        )
          return true;
      }
      return false;
    });
  const overlaps = (a: ShotBox, b: ShotBox) =>
    a[0] < b[0] + b[2] &&
    a[0] + a[2] > b[0] &&
    a[1] < b[1] + b[3] &&
    a[1] + a[3] > b[1];
  const inside = (b: ShotBox) =>
    b[0] >= text.x0 - 1 &&
    b[0] + b[2] <= text.x1 + 1 &&
    b[1] >= text.y0 - 1 &&
    b[1] + b[3] <= bottom + labelRoom;
  const write = (i: number, toward: 'start' | 'end') => {
    const bar = bars[i];
    const [x, y] = points[i];
    const value = shown(bar.value, read.unit, withUnit);
    const above = -dot - valueSize * 0.35;
    const below = valueSize * (ASCENT + 0.1) + dot * 1.2;
    const side = toward === 'start' ? dot * 1.8 : -dot * 1.8;
    const tries: ['start' | 'end' | 'middle', number, number][] = [
      ...(tall
        ? []
        : [
            [toward, side, valueSize * 0.35] as [
              'start' | 'end',
              number,
              number,
            ],
          ]),
      [toward, toward === 'start' ? -dot : dot, above],
      [toward, toward === 'start' ? -dot : dot, below],
      ['middle', 0, above],
      ['middle', 0, below],
      [toward === 'start' ? 'end' : 'start', -side, valueSize * 0.35],
    ];
    const boxes = tries.map(([anchor, dx, dy]) =>
      linesBox(
        [value],
        x + dx,
        y + dy,
        valueSize,
        anchor,
        1.15,
        700,
        'display',
        paint.figure,
      ),
    );
    const pick = boxes.findIndex(
      (b) => inside(b) && !hitsLine(b) && !taken.some((t) => overlaps(b, t)),
    );
    const k =
      pick >= 0
        ? pick
        : boxes.findIndex((b) => inside(b)) >= 0
          ? boxes.findIndex((b) => inside(b))
          : 0;
    const [anchor, dx, dy] = tries[k];
    const vbox = boxes[k];
    taken.push(vbox);
    book.add(bar.valueId, { box: vbox, value: bar.value, role: colour.role });
    out.push(
      textSvg(
        [value],
        x + dx,
        y + dy,
        {
          size: valueSize,
          fill: colour.colour,
          family: paint.display,
          anchor,
          tabular: true,
        },
        bar.valueId,
      ),
    );
  };
  write(bars.length - 1, tall ? 'end' : 'start');
  write(0, 'start');
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
  const ends = union(
    book.parts[bars[0].valueId].box,
    book.parts[bars[bars.length - 1].valueId].box,
  );
  return {
    svg: out.join(''),
    focal: union([x0, top, x1 - x0, bottom - top + labelRoom], ends),
  };
}

/** A chart drawn to fill the frame, or null with fewer than two numbers. */
export function barsAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const read = readChart(raw);
  if (!read) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const bars = named(book, read, coloursOf(paint, read));
  // A word unit goes on every value while the values still fit; else once, over the chart.
  const attached = attachedUnit(read.unit);
  if (read.kind === 'line') {
    const longest = Math.max(
      ...bars.map((b) =>
        figuresWidth(
          valueText(b.value, read.unit),
          frame.size.label,
          paint.figure,
        ),
      ),
    );
    const withUnit =
      attached || longest < frame.W * (shape === 'tall' ? 0.3 : 0.16);
    const drawn = lineChart(frame, paint, book, read, bars, withUnit);
    return assetOf(frame, paint, drawn.svg, book, drawn.focal);
  }
  const labels = shape === 'wide' ? columnLabels(frame, bars) : null;
  if (labels && bars.length <= 6) {
    const slot = (frame.text.x1 - frame.text.x0 - frame.W * 0.04) / bars.length;
    const fitsAt = (size: number, withUnit: boolean) =>
      bars.every(
        (b) =>
          figuresWidth(
            shown(b.value, read.unit, withUnit),
            size,
            paint.figure,
          ) <=
          slot * 0.95,
      );
    const withUnit = attached || fitsAt(frame.size.label, true);
    let valueSize = frame.size.label;
    for (let s = frame.size.title * 1.15; s >= frame.size.label; s -= 1)
      if (fitsAt(s, withUnit)) {
        valueSize = r1(s);
        break;
      }
    const drawn = columns(
      frame,
      paint,
      book,
      read,
      bars,
      withUnit,
      labels.size,
      valueSize,
      labels.lines,
    );
    return assetOf(frame, paint, drawn.svg, book, drawn.focal);
  }
  const valueRoom = shape === 'tall' ? frame.W * 0.36 : frame.W * 0.2;
  const withUnit =
    attached ||
    bars.every(
      (b) =>
        figuresWidth(
          shown(b.value, read.unit, true),
          frame.size.label,
          paint.figure,
        ) <= valueRoom,
    );
  const drawn = rows(frame, paint, book, read, bars, withUnit);
  // A tall chart longer than the words' area runs on down: the camera travels down it.
  const { text } = frame;
  const box: ShotBox =
    shape === 'tall' && drawn.bottom > text.y1
      ? [0, 0, frame.W, Math.ceil(drawn.bottom + (frame.H - text.y1))]
      : [0, 0, frame.W, frame.H];
  const focal: ShotBox =
    box[3] > frame.H ? [0, 0, frame.W, frame.H] : drawn.focal;
  return assetOf(frame, paint, drawn.svg, book, focal, box);
}
