/**
 * When something happened, at full frame. A single date with its month
 * is that month's page laid out as a grid of real weekdays (worked out by
 * code, for the Gregorian years), the day marked, with the date written
 * large beside it (over it in a tall frame). Anything else (years alone,
 * several dates, two calendars that come to one day) is a row of calendar
 * sheets, each its month and year in a band over its big day or year, in
 * the order the writer gave; the day they come to is of the picture's
 * later state.
 *
 * Parts: a grid's days `day-<n>`, the days together `grid`, the weekday
 * letters `weekdays`, the marked day `date` and the written date `title`;
 * sheets `date-<n>` in order, each calendar's name `label-<name>`, and
 * the day they come to, `merge`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import {
  faceOf,
  readCalendar,
  type CalendarDraft,
  type CalendarPage,
  type CalendarSpec,
} from '../scene-calendar';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  esc,
  extraOf,
  fit,
  fitBalanced,
  frameOf,
  linesBox,
  mainColour,
  paintOf,
  partSvg,
  r1,
  slugOf,
  textSvg,
  union,
  wordsOn,
  type Colour,
  type Frame,
  type Paint,
} from './shot-chart-kit';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** A calendar as the writer gives it, or as code keeps it (pages instead of dates). */
function draftOf(raw: Record<string, unknown>): CalendarDraft {
  const body = bodyOf('calendar', raw);
  const calendars = Array.isArray(body.calendars)
    ? body.calendars.map((c: unknown) => {
        const one = (c && typeof c === 'object' ? c : {}) as Record<
          string,
          unknown
        >;
        const dates = Array.isArray(one.dates)
          ? one.dates
          : Array.isArray(one.pages)
            ? one.pages.map((p: unknown) =>
                p && typeof p === 'object' ? (p as { text?: string }).text : p,
              )
            : typeof one.date === 'string'
              ? [one.date]
              : null;
        return {
          label: (one.label as string | null) ?? null,
          dates: dates as string[] | null,
        };
      })
    : typeof body.date === 'string'
      ? [{ label: null, dates: [body.date] }]
      : Array.isArray(body.dates)
        ? [{ label: null, dates: body.dates as string[] }]
        : null;
  const merge = body.merge;
  return {
    calendars,
    merge:
      typeof merge === 'string'
        ? merge
        : merge && typeof merge === 'object'
          ? ((merge as { text?: string }).text ?? null)
          : null,
  };
}

/** The year a page names as a number, for a Gregorian year the grid can be worked out for. */
function gregorianYear(page: CalendarPage): number | null {
  if (!page.year || /BC|BCE/i.test(page.year)) return null;
  const year = Number.parseInt(page.year.replace(/\D/g, ''), 10);
  return year >= 1583 && year <= 9999 ? year : null;
}

/** Monday 0 to Sunday 6, for a day of a Gregorian month. */
const weekdayOf = (year: number, month: number, day: number) =>
  (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;

const daysIn = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** A month's page: its days in a grid of weeks, the day marked, the date written large. */
function monthGrid(
  frame: Frame,
  paint: Paint,
  book: PartBook,
  page: CalendarPage,
  year: number,
  colour: Colour,
): { svg: string; focal: ShotBox } {
  const { text } = frame;
  const tall = frame.shape === 'tall';
  const floor = frame.size.label;
  const month = page.month!;
  const days = daysIn(year, month);
  const first = weekdayOf(year, month, 1);
  const weeks = Math.ceil((first + days) / 7);
  const out: string[] = [];
  // The date written large: "1 October 1960", the weekday over it.
  const dated = page.day !== null;
  const words = dated
    ? `${page.day} ${MONTHS[month - 1]} ${year}`
    : `${MONTHS[month - 1]} ${year}`;
  const weekday = dated ? WEEKDAYS[weekdayOf(year, month, page.day!)] : null;
  const titleW = tall ? text.x1 - text.x0 : frame.W * 0.36;
  // Large beside a wide frame's grid; a tall frame's at a title's size,
  // so the grid under it keeps room for its days inside the band.
  const title = fitBalanced(
    words,
    titleW,
    tall ? frame.size.title : frame.size.hero,
    floor,
    tall ? 2 : 3,
    700,
    'display',
  );
  const kicker = weekday ? fit(weekday, titleW, floor, floor, 1, 600) : null;
  const titleH =
    (kicker ? floor * 1.4 : 0) + title.lines.length * title.size * 1.08;
  // The grid's area: the right of a wide frame, under the words in a tall one.
  // A tall frame's grid under the date, inside the safe band: its days are words.
  const area = tall
    ? {
        x0: text.x0,
        x1: text.x1,
        y0: text.y0 + titleH + floor * 0.5,
        y1: text.y1,
      }
    : {
        x0: text.x0 + titleW + floor * 1.5,
        x1: text.x1,
        y0: text.y0,
        y1: text.y1,
      };
  const cols = 7;
  const rows = weeks + 1;
  // Cells as wide as the area allows and as tall as its height does: a
  // tall frame's are wider than they are tall, its rows inside the band.
  const cellW = Math.min((area.x1 - area.x0) / cols, floor * 3);
  const cellH = Math.min(cellW, (area.y1 - area.y0) / (rows + 0.2));
  const cell = Math.min(cellW, cellH);
  const gw = cellW * cols;
  const gh = cellH * rows;
  const gx = area.x0 + (area.x1 - area.x0 - gw) / 2;
  const gy = tall ? area.y0 : area.y0 + (area.y1 - area.y0 - gh) / 2;
  const size = Math.max(floor, Math.min(cell * 0.46, floor * 1.25));
  // The weekdays' letters over the columns.
  const letters = WEEKDAYS.map((d) => d[0]);
  const wbase = gy + cellH * 0.5 + size * 0.34;
  book.add('weekdays', { box: [gx, gy, gw, cellH], role: 'muted' });
  out.push(
    partSvg(
      'weekdays',
      letters
        .map((l, i) =>
          textSvg([l], gx + cellW * (i + 0.5), wbase, {
            size,
            fill: paint.muted,
            family: paint.text,
            weight: 700,
            anchor: 'middle',
          }),
        )
        .join(''),
    ),
  );
  const cells: string[] = [];
  const at = (d: number) => {
    const k = first + d - 1;
    return {
      cx: gx + cellW * ((k % 7) + 0.5),
      cy: gy + cellH * (Math.floor(k / 7) + 1.5),
    };
  };
  for (let d = 1; d <= days; d += 1) {
    const { cx, cy } = at(d);
    const id = `day-${d}`;
    book.add(id, {
      box: [cx - cellW / 2, cy - cellH / 2, cellW, cellH],
      value: d,
      role: 'ink',
    });
    cells.push(
      textSvg(
        [String(d)],
        cx,
        cy + size * 0.34,
        {
          size,
          fill: paint.ink,
          family: paint.text,
          weight: 600,
          anchor: 'middle',
          tabular: true,
        },
        id,
      ),
    );
  }
  const gridBox: ShotBox = [gx, gy + cellH, gw, cellH * weeks];
  book.add('grid', { box: gridBox, role: 'ink' });
  out.push(partSvg('grid', cells.join('')));
  // The day marked: a disc in the colour, its number on it.
  if (dated) {
    const { cx, cy } = at(page.day!);
    const r = cell * 0.46;
    book.add('date', {
      box: [cx - r, cy - r, r * 2, r * 2],
      value: page.day!,
      role: colour.role,
      pivot: [0.5, 0.5],
    });
    out.push(
      partSvg(
        'date',
        `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}" fill="${esc(colour.colour)}"/>` +
          textSvg([String(page.day)], cx, cy + size * 0.34, {
            size,
            fill: wordsOn(paint, colour.colour),
            family: paint.text,
            weight: 700,
            anchor: 'middle',
          }),
      ),
    );
  }
  // The date in words, beside the grid (over it in a tall frame).
  const tx = text.x0;
  let y = tall ? text.y0 : gy + gh / 2 - titleH / 2;
  y = Math.max(text.y0, y);
  const parts: ShotBox[] = [union(gridBox, [gx, gy, gw, cell])];
  if (kicker) {
    const base = y + floor * ASCENT;
    out.push(
      textSvg(kicker.lines, tx, base, {
        size: floor,
        fill: paint.muted,
        family: paint.text,
        weight: 600,
      }),
    );
    y += floor * 1.4;
  }
  const base = y + title.size * ASCENT;
  const tbox = linesBox(
    title.lines,
    tx,
    base,
    title.size,
    'start',
    1.08,
    700,
    'display',
  );
  book.add('title', {
    box: union(tbox, kicker ? [tx, y - floor * 1.4, tbox[2], floor] : null),
    role: colour.role,
  });
  out.push(
    textSvg(
      title.lines,
      tx,
      base,
      {
        size: title.size,
        fill: colour.colour,
        family: paint.display,
        leading: 1.08,
      },
      'title',
    ),
  );
  parts.push(tbox);
  return { svg: out.join(''), focal: union(...parts) };
}

/** One sheet: a band with its month and year, the big day (or year, or words) under it. */
function sheet(
  frame: Frame,
  paint: Paint,
  page: CalendarPage,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: Colour,
): string {
  const floor = frame.size.label;
  const face = faceOf(page);
  const band = Math.max(h * 0.24, floor * 1.5);
  const corner = Math.min(w, h) * 0.06;
  const stroke = Math.max(2.5, frame.H * 0.003);
  // The band's month in full, or its first three letters where the sheet is narrow.
  const short = face.band.replace(/^([A-Z]{3})[A-Z]+/, '$1');
  const bandFit = (words: string) =>
    words
      ? fit(words, w * 0.88, Math.max(floor, band * 0.5), floor, 1, 700)
      : null;
  const full = bandFit(face.band);
  const bandWords =
    full && full.lines.some((l) => l.endsWith('…')) ? bandFit(short) : full;
  const bigRoom = h - band;
  const big = fit(
    face.big,
    w * 0.84,
    Math.min(bigRoom * 0.7, w * 0.62),
    floor,
    /^\d+$/.test(face.big) ? 1 : 2,
    700,
    'display',
  );
  const bigH = big.lines.length * big.size * 1.02;
  return (
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(corner)}" fill="${esc(paint.sheet)}" stroke="${esc(paint.edge)}" stroke-width="${r1(stroke)}"/>` +
    `<path d="M${r1(x)} ${r1(y + band)}V${r1(y + corner)}Q${r1(x)} ${r1(y)} ${r1(x + corner)} ${r1(y)}H${r1(x + w - corner)}Q${r1(x + w)} ${r1(y)} ${r1(x + w)} ${r1(y + corner)}V${r1(y + band)}Z" fill="${esc(colour.colour)}"/>` +
    (bandWords
      ? textSvg(
          bandWords.lines,
          x + w / 2,
          y + band / 2 + bandWords.size * 0.36,
          {
            size: bandWords.size,
            fill: wordsOn(paint, colour.colour),
            family: paint.text,
            anchor: 'middle',
            spacing: bandWords.size * 0.05,
          },
        )
      : '') +
    textSvg(
      big.lines,
      x + w / 2,
      y + band + (bigRoom - bigH) / 2 + big.size * 0.8,
      {
        size: big.size,
        fill: paint.ink,
        family: paint.display,
        anchor: 'middle',
        leading: 1.02,
        tabular: true,
      },
    )
  );
}

/** Calendar sheets in order, each calendar's name over its first, the day they come to last. */
function sheets(
  frame: Frame,
  paint: Paint,
  book: PartBook,
  spec: CalendarSpec,
  colour: Colour,
): { svg: string; focal: ShotBox; bottom: number } {
  const { text } = frame;
  const tall = frame.shape === 'tall';
  const floor = frame.size.label;
  const pages: { page: CalendarPage; label: string | null; merge: boolean }[] =
    [];
  spec.calendars.forEach((c) =>
    c.pages.forEach((page, p) =>
      pages.push({ page, label: p === 0 ? c.label : null, merge: false }),
    ),
  );
  if (spec.merge && spec.calendars.length > 1)
    pages.push({ page: spec.merge, label: null, merge: true });
  const n = pages.length;
  const labelled = pages.some((p) => p.label);
  // Room over each row for its calendars' names, as many lines as the longest takes.
  const labelLines = Math.max(
    0,
    ...pages
      .filter((p) => p.label)
      .map(
        (p) =>
          fit(
            p.label!,
            (text.x1 - text.x0) / (tall ? Math.min(n, 2) : Math.min(n, 4)),
            floor,
            floor,
            2,
            600,
          ).lines.length,
      ),
  );
  const labelH = labelled ? floor * (labelLines * 1.15 + 0.45) : 0;
  // A tall frame's sheets one under another, each the words' width; a
  // wide frame's side by side.
  const cols = tall ? Math.min(n, 2) : Math.min(n, 4);
  const rows = Math.ceil(n / cols);
  const gap = floor * 0.8;
  const width = text.x1 - text.x0;
  const w = Math.min(
    (width - gap * (cols - 1)) / cols,
    tall ? width : frame.W * 0.24,
  );
  const ratio = tall ? 1 : 1.1;
  // As tall as the band lets every row be: its words stay inside it.
  const h = Math.min(
    w * ratio,
    (text.y1 - text.y0 - labelH * rows - gap * (rows - 1)) / rows,
  );
  const cellH = h + labelH;
  const totalW = cols * w + (cols - 1) * gap;
  const x0 = tall ? text.x0 : (frame.W - totalW) / 2;
  const totalH = rows * cellH + (rows - 1) * gap;
  const y0 = tall ? text.y0 : text.y0 + (text.y1 - text.y0 - totalH) / 2;
  const out: string[] = [];
  const boxes: ShotBox[] = [];
  pages.forEach((one, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = x0 + c * (w + gap);
    const y = y0 + r * (cellH + gap) + labelH;
    const id = one.merge ? 'merge' : `date-${i + 1}`;
    if (one.label) {
      const lid = book.id(`label-${slugOf(one.label) || String(i + 1)}`);
      const l = fit(one.label, w + gap * 0.8, floor, floor, 2, 600);
      const base = y - floor * 0.45 - (l.lines.length - 1) * floor * 1.15;
      const lbox = linesBox(l.lines, x, base, floor, 'start', 1.15, 600);
      book.add(lid, { box: lbox, role: 'ink' });
      out.push(
        textSvg(
          l.lines,
          x,
          base,
          { size: floor, fill: paint.ink, family: paint.text, weight: 600 },
          lid,
        ),
      );
    }
    const box: ShotBox = [x, y, w, h];
    book.add(id, {
      box,
      role: colour.role,
      pivot: [0.5, 0],
      ...(one.merge ? { later: true } : {}),
    });
    out.push(partSvg(id, sheet(frame, paint, one.page, x, y, w, h, colour)));
    boxes.push(box);
  });
  const all = union(...boxes);
  return {
    svg: out.join(''),
    focal: union(all, [all[0], all[1] - labelH, all[2], labelH]),
    bottom: all[1] + all[3],
  };
}

export function calendarAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const extra = extraOf('calendar', raw);
  const spec = readCalendar(draftOf(raw), extra);
  if (!spec) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const colour = mainColour(paint, spec.colour);
  const only =
    spec.calendars.length === 1 && spec.calendars[0].pages.length === 1
      ? spec.calendars[0].pages[0]
      : null;
  const year = only && only.month !== null ? gregorianYear(only) : null;
  if (only && year !== null) {
    const drawn = monthGrid(frame, paint, book, only, year, colour);
    return assetOf(frame, paint, drawn.svg, book, drawn.focal);
  }
  const drawn = sheets(frame, paint, book, spec, colour);
  const long = shape === 'tall' && drawn.bottom > frame.text.y1;
  const box: ShotBox = long
    ? [0, 0, frame.W, Math.ceil(drawn.bottom + (frame.H - frame.text.y1))]
    : [0, 0, frame.W, frame.H];
  return assetOf(
    frame,
    paint,
    drawn.svg,
    book,
    long ? [0, 0, frame.W, frame.H] : drawn.focal,
    box,
  );
}
