/**
 * A timeline at full frame: a spine the camera travels along, and the
 * page's events on it in order. In a wide frame the spine runs across and
 * the events take turns over and under it, spaced by their dates when
 * every one has a date (pushed apart where dates crowd), evenly when they
 * are stages; in a tall frame it runs down at the left, one event a row
 * with its words beside it, and on down past the frame's foot when the
 * events need more room than one frame (the camera travels down it).
 *
 * Parts: the spine `spine` (its path: what the camera and a draw-on
 * follow); each event `event-<name>`, holding its dot `dot-<name>`, its
 * date `date-<name>` and its words `label-<name>`; the `source`.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { dateOf } from '../scene-timeline';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  extraOf,
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
  wordsWidth,
  type Frame,
  type Paint,
} from './shot-chart-kit';

/** The most events one timeline holds: more is a second timeline. */
export const MOST_EVENTS = 8;

interface Event {
  when: string;
  name: string;
}

/** A timeline's events made sound: each a date or a stage and its words, at least two, in date order when every one is dated. */
export function readTimeline(raw: Record<string, unknown>): Event[] | null {
  const body = bodyOf('timeline', raw);
  const list: unknown[] = Array.isArray(raw.timeline)
    ? raw.timeline
    : Array.isArray(body.events)
      ? body.events
      : Array.isArray(raw.events)
        ? raw.events
        : [];
  const events = list
    .map((e) => {
      const one = (e && typeof e === 'object' ? e : {}) as Record<
        string,
        unknown
      >;
      return {
        when: said(one.when ?? one.date ?? one.year, 24),
        name: said(one.name ?? one.label ?? one.event, 60),
      };
    })
    .filter((e) => e.when || e.name)
    .slice(0, MOST_EVENTS);
  if (events.length < 2) return null;
  const dated = events.every((e) => dateOf(e.when) !== null);
  return dated
    ? [...events].sort((a, b) => dateOf(a.when)! - dateOf(b.when)!)
    : events;
}

interface Ids {
  event: string;
  dot: string;
  date: string;
  label: string;
}

const idsOf = (book: PartBook, events: Event[]): Ids[] =>
  events.map((e, i) => {
    const event = book.id(`event-${slugOf(e.name || e.when) || String(i + 1)}`);
    const stem = event.slice(6);
    return {
      event,
      dot: book.id(`dot-${stem}`),
      date: book.id(`date-${stem}`),
      label: book.id(`label-${stem}`),
    };
  });

/** One event's dot, stem, date and words, as a part holding three. */
function eventSvg(
  book: PartBook,
  paint: Paint,
  colour: { colour: string; role?: string },
  ids: Ids,
  dot: [number, number],
  r: number,
  stem: [number, number, number, number] | null,
  date: {
    lines: string[];
    size: number;
    x: number;
    y: number;
    anchor: 'start' | 'middle';
  } | null,
  name: {
    lines: string[];
    size: number;
    x: number;
    y: number;
    anchor: 'start' | 'middle';
  } | null,
): { svg: string; box: ShotBox } {
  const inner: string[] = [];
  const boxes: ShotBox[] = [];
  if (stem) {
    inner.push(
      `<path d="M${r1(stem[0])} ${r1(stem[1])}L${r1(stem[2])} ${r1(stem[3])}" stroke="${paint.muted}" stroke-width="${r1(Math.max(2, r * 0.22))}" stroke-linecap="round"/>`,
    );
  }
  const dotBox: ShotBox = [dot[0] - r, dot[1] - r, r * 2, r * 2];
  book.add(ids.dot, { box: dotBox, role: colour.role, pivot: [0.5, 0.5] });
  inner.push(
    `<circle data-part="${ids.dot}" cx="${r1(dot[0])}" cy="${r1(dot[1])}" r="${r1(r)}" fill="${colour.colour}" stroke="${paint.paper}" stroke-width="${r1(r * 0.35)}"/>`,
  );
  boxes.push(dotBox);
  if (date) {
    const box = linesBox(
      date.lines,
      date.x,
      date.y,
      date.size,
      date.anchor,
      1.1,
      700,
      'display',
    );
    book.add(ids.date, { box, role: colour.role });
    inner.push(
      textSvg(
        date.lines,
        date.x,
        date.y,
        {
          size: date.size,
          fill: colour.colour,
          family: paint.display,
          anchor: date.anchor,
          leading: 1.1,
          tabular: true,
        },
        ids.date,
      ),
    );
    boxes.push(box);
  }
  if (name) {
    const box = linesBox(
      name.lines,
      name.x,
      name.y,
      name.size,
      name.anchor,
      1.12,
      600,
    );
    book.add(ids.label, { box, role: 'ink' });
    inner.push(
      textSvg(
        name.lines,
        name.x,
        name.y,
        {
          size: name.size,
          fill: paint.ink,
          family: paint.text,
          weight: 600,
          anchor: name.anchor,
          leading: 1.12,
        },
        ids.label,
      ),
    );
    boxes.push(box);
  }
  const box = union(
    ...boxes,
    stem
      ? [
          Math.min(stem[0], stem[2]),
          Math.min(stem[1], stem[3]),
          Math.abs(stem[2] - stem[0]),
          Math.abs(stem[3] - stem[1]),
        ]
      : null,
  );
  book.add(ids.event, { box });
  return { svg: partSvg(ids.event, inner.join('')), box };
}

/**
 * Where each event sits along the spine, 0 to 1: by its date when every
 * event has one, pushed apart so neighbours are never closer than most of
 * an even share (a timeline's dates may crowd, its words may not); evenly
 * when they are stages.
 */
export function spread(events: Event[]): number[] {
  const n = events.length;
  const even = events.map((_, i) => i / (n - 1));
  const dates = events.map((e) => dateOf(e.when));
  if (dates.some((d) => d === null)) return even;
  const known = dates as number[];
  const low = known[0];
  const high = known[n - 1];
  if (!(high > low)) return even;
  const at = known.map((d) => (d - low) / (high - low));
  const gap = 0.75 / (n - 1);
  // Pushed apart forward, then drawn back from the far end, then forward once more.
  for (let i = 1; i < n; i += 1) at[i] = Math.max(at[i], at[i - 1] + gap);
  at[n - 1] = Math.min(at[n - 1], 1);
  for (let i = n - 2; i >= 0; i -= 1) at[i] = Math.min(at[i], at[i + 1] - gap);
  at[0] = Math.max(at[0], 0);
  for (let i = 1; i < n; i += 1) at[i] = Math.max(at[i], at[i - 1] + gap);
  return at.map((a) => Math.max(0, Math.min(1, a)));
}

/** Across the frame: the events over and under the spine by turns. */
function across(
  frame: Frame,
  paint: Paint,
  book: PartBook,
  events: Event[],
  colour: { colour: string; role?: string },
  source: string | null,
): { svg: string; focal: ShotBox } {
  const { text } = frame;
  const floor = frame.size.label;
  const n = events.length;
  const ids = idsOf(book, events);
  // Each block as wide as its words need (two lines where it can, three
  // at most), then packed along its side of the spine: centred on its dot
  // where there is room, pushed along where it meets a neighbour, kept
  // inside the words' area.
  const gap = floor * 0.5;
  const most = frame.W * 0.3;
  const largest = floor * 1.15;
  const need = events.map((e) => {
    const words = (e.name || '').split(/[\s-]+/).filter(Boolean);
    const longest = Math.max(
      floor * 3,
      ...words.map((w) => wordsWidth(w, largest, 600)),
      e.when ? wordsWidth(e.when, frame.size.title, 700, 'display') : 0,
    );
    const whole = wordsWidth(e.name || '', largest, 600);
    // A name of two words or fewer on one line: broken, one would stand alone.
    if (words.length <= 2 && whole <= most) return Math.max(longest, whole);
    return Math.min(most, Math.max(longest, whole / 2 + floor));
  });
  // The first and last dots in from the words' edges by half their words,
  // so every block can stand centred on its own dot.
  const xa = text.x0 + Math.max(need[0] / 2, frame.W * 0.04);
  const xb = text.x1 - Math.max(need[n - 1] / 2, frame.W * 0.04);
  const xs = spread(events).map((a) => xa + a * (xb - xa));
  const room = events.map((_, i) => ({ w: need[i], cx: xs[i] }));
  for (const side of [0, 1]) {
    const mine = events.map((_, i) => i).filter((i) => i % 2 === side);
    const span = text.x1 - text.x0 - gap * (mine.length - 1);
    const total = mine.reduce((sum, i) => sum + room[i].w, 0);
    // More than the side holds: every block narrowed alike.
    if (total > span) for (const i of mine) room[i].w *= span / total;
    let edge = text.x0 - gap;
    for (const i of mine) {
      const { w } = room[i];
      room[i].cx = Math.min(
        Math.max(xs[i], edge + gap + w / 2),
        text.x1 - w / 2,
      );
      edge = room[i].cx + w / 2;
    }
    edge = text.x1 + gap;
    for (const i of [...mine].reverse()) {
      const { w } = room[i];
      room[i].cx = Math.max(
        Math.min(room[i].cx, edge - gap - w / 2),
        text.x0 + w / 2,
      );
      edge = room[i].cx - w / 2;
    }
    // Every block still hangs from its own dot; where that brings two
    // together again, both give way to the line halfway between them.
    for (const i of mine) {
      const reach = room[i].w / 2 - floor * 0.6;
      room[i].cx = Math.min(Math.max(room[i].cx, xs[i] - reach), xs[i] + reach);
    }
    for (let k = 1; k < mine.length; k += 1) {
      const a = room[mine[k - 1]];
      const b = room[mine[k]];
      const over = a.cx + a.w / 2 + gap - (b.cx - b.w / 2);
      if (over <= 0) continue;
      const middle = (a.cx + a.w / 2 + b.cx - b.w / 2) / 2;
      const aRight = middle - gap / 2;
      const bLeft = middle + gap / 2;
      const aLeft = a.cx - a.w / 2;
      const bRight = b.cx + b.w / 2;
      a.w = Math.max(floor * 2.5, aRight - aLeft);
      a.cx = aLeft + a.w / 2;
      b.w = Math.max(floor * 2.5, bRight - bLeft);
      b.cx = bLeft + b.w / 2;
    }
  }
  let dateSize = floor;
  for (let s = frame.size.title * 1.1; s >= floor; s -= 1)
    if (
      events.every(
        (e, i) => !e.when || wordsWidth(e.when, s, 700, 'display') <= room[i].w,
      )
    ) {
      dateSize = r1(s);
      break;
    }
  // One size for every event's words: the largest at which all fit on three lines.
  let nameSize = floor;
  for (let s = largest; s >= floor; s -= 0.5)
    if (
      events.every(
        (e, i) =>
          !e.name ||
          fit(e.name, room[i].w, s, s, 3, 600).lines.every(
            (l) => !l.endsWith('…'),
          ),
      )
    ) {
      nameSize = r1(s);
      break;
    }
  const lines = events.map((e, i) =>
    e.name ? fit(e.name, room[i].w, nameSize, nameSize, 3, 600).lines : [],
  );
  const blockH = (i: number) =>
    (events[i].when ? dateSize * 1.12 : 0) + lines[i].length * nameSize * 1.12;
  const stem = floor * 0.75;
  const r = floor * 0.3;
  const sourceRoom = source ? frame.size.chip * 2.4 : 0;
  // The spine where the tallest blocks over and under it both fit.
  const overH = Math.max(
    0,
    ...events.map((_, i) => (i % 2 === 0 ? blockH(i) : 0)),
  );
  const underH = Math.max(
    0,
    ...events.map((_, i) => (i % 2 === 1 ? blockH(i) : 0)),
  );
  const reach = r + stem;
  const free = text.y1 - sourceRoom - text.y0 - overH - underH - reach * 2;
  const spineY = text.y0 + overH + reach + Math.max(0, free) / 2;
  const out: string[] = [];
  const spinePath = `M${r1(frame.pic.x0)} ${r1(spineY)}H${r1(frame.pic.x1)}`;
  book.add('spine', {
    box: [frame.pic.x0, spineY - 2, frame.pic.x1 - frame.pic.x0, 4],
    path: spinePath,
    role: 'ink',
  });
  out.push(
    partSvg(
      'spine',
      `<path d="${spinePath}" stroke="${paint.ink}" stroke-width="${r1(Math.max(3, frame.H * 0.005))}" stroke-linecap="round"/>`,
    ),
  );
  const boxes: ShotBox[] = [];
  events.forEach((e, i) => {
    const above = i % 2 === 0;
    const x = xs[i];
    const { cx } = room[i];
    const h = blockH(i);
    const top = above ? spineY - reach - h : spineY + reach + floor * 0.12;
    const date = e.when
      ? {
          lines: [e.when],
          size: dateSize,
          x: cx,
          y: top + dateSize * (ASCENT + 0.04),
          anchor: 'middle' as const,
        }
      : null;
    const nameTop = top + (e.when ? dateSize * 1.12 : 0);
    const name = lines[i].length
      ? {
          lines: lines[i],
          size: nameSize,
          x: cx,
          y: nameTop + nameSize * ASCENT,
          anchor: 'middle' as const,
        }
      : null;
    const stemLine: [number, number, number, number] = above
      ? [x, spineY - r, x, spineY - r - stem * 0.8]
      : [x, spineY + r, x, spineY + r + stem * 0.8];
    const drawn = eventSvg(
      book,
      paint,
      colour,
      ids[i],
      [x, spineY],
      r,
      stemLine,
      date,
      name,
    );
    out.push(drawn.svg);
    boxes.push(drawn.box);
  });
  if (source)
    out.push(
      sourceSvg(
        book,
        paint,
        frame,
        source,
        text.x0,
        text.y1 - frame.size.chip * 0.35,
        text.x1 - text.x0,
      ).svg,
    );
  return {
    svg: out.join(''),
    focal: union(...boxes, [xs[0], spineY, xs[n - 1] - xs[0], 1]),
  };
}

/**
 * Down the frame: a spine at the left of each column and its events in
 * rows beside it, every word inside the safe band: one column where the
 * events fit it, two (read down the first, then the second) where they do
 * not, and where even two will not hold them, pages: each a frame's
 * height of one column, its events inside that frame's band, the spine
 * running on down through them all for the camera to travel. The spine
 * runs up and down the frame past the words, a picture.
 */
function down(
  frame: Frame,
  paint: Paint,
  book: PartBook,
  events: Event[],
  colour: { colour: string; role?: string },
  source: string | null,
): { svg: string; focal: ShotBox; bottom: number; pages: number } {
  const { text } = frame;
  const floor = frame.size.label;
  const ids = idsOf(book, events);
  const n = events.length;
  const r = floor * 0.26;
  const sourceH = source ? frame.size.chip * 2.6 : 0;
  const band = text.y1 - text.y0 - sourceH;
  const colGap = floor * 0.8;
  const minGap = floor * 0.45;
  /** Each event's block laid out for a column of a width: its date's size, its words' lines and its height. */
  const laidFor = (width: number) => {
    let dateSize = floor;
    for (let s = frame.size.title; s >= floor; s -= 1)
      if (
        events.every(
          (e) => !e.when || wordsWidth(e.when, s, 700, 'display') <= width,
        )
      ) {
        dateSize = r1(s);
        break;
      }
    const blocks = events.map((e) => {
      const lines = e.name
        ? fit(e.name, width, floor, floor, 3, 600).lines
        : [];
      return {
        lines,
        h: (e.when ? dateSize * 1.08 : 0) + lines.length * floor * 1.12,
      };
    });
    return { dateSize, blocks };
  };
  const fits = (blocks: { h: number }[]) =>
    blocks.reduce((sum, b) => sum + b.h, 0) + (blocks.length - 1) * minGap <=
    band;
  const full = text.x1 - text.x0 - r * 2 - floor * 0.35;
  const half = (text.x1 - text.x0 - colGap) / 2 - r * 2 - floor * 0.35;
  // The columns (or pages) and which events each holds.
  let laid = laidFor(full);
  let groups: number[][] = [events.map((_, i) => i)];
  let paged = false;
  if (!fits(laid.blocks)) {
    const two = laidFor(half);
    const per = Math.ceil(n / 2);
    const a = two.blocks.slice(0, per);
    const b = two.blocks.slice(per);
    if (fits(a) && fits(b)) {
      laid = two;
      groups = [
        events.slice(0, per).map((_, i) => i),
        events.slice(per).map((_, i) => per + i),
      ];
    } else {
      // Pages of one column: as many events on each as its band holds.
      paged = true;
      groups = [];
      let page: number[] = [];
      let used = 0;
      laid.blocks.forEach((block, i) => {
        const more = (page.length ? minGap : 0) + block.h;
        if (page.length && used + more > band) {
          groups.push(page);
          page = [];
          used = 0;
        }
        page.push(i);
        used += page.length > 1 ? more : block.h;
      });
      if (page.length) groups.push(page);
      // As even as the pages allow: the same count on each where they fit.
      const per = Math.ceil(n / groups.length);
      const even = groups
        .map((_, g) =>
          events.slice(g * per, (g + 1) * per).map((_, i) => g * per + i),
        )
        .filter((group) => group.length);
      if (even.every((group) => fits(group.map((i) => laid.blocks[i]))))
        groups = even;
    }
  }
  const cols = paged ? 1 : groups.length;
  const colW = (text.x1 - text.x0 - colGap * (cols - 1)) / cols;
  const out: string[] = [];
  const boxes: ShotBox[] = [];
  const spines: string[] = [];
  const spineBoxes: ShotBox[] = [];
  let bottom = 0;
  groups.forEach((group, g) => {
    const c = paged ? 0 : g;
    const oy = paged ? g * frame.H : 0;
    const spineX = text.x0 + c * (colW + colGap) + r;
    const x = spineX + r + floor * 0.35;
    // The rows spread down the band, a little air between them.
    const used = group.reduce((sum, i) => sum + laid.blocks[i].h, 0);
    const gap = Math.min(
      floor * 1.6,
      Math.max(minGap, (band - used) / Math.max(1, group.length)),
    );
    let y = oy + text.y0 + Math.min(gap * 0.3, floor * 0.3);
    const dots: number[] = [];
    for (const i of group) {
      const e = events[i];
      const { lines, h } = laid.blocks[i];
      const date = e.when
        ? {
            lines: [e.when],
            size: laid.dateSize,
            x,
            y: y + laid.dateSize * ASCENT,
            anchor: 'start' as const,
          }
        : null;
      const nameTop = y + (e.when ? laid.dateSize * 1.08 : 0);
      const name = lines.length
        ? {
            lines,
            size: floor,
            x,
            y: nameTop + floor * ASCENT,
            anchor: 'start' as const,
          }
        : null;
      // The dot level with the date (or the words' first line).
      const dotY = y + (e.when ? laid.dateSize : floor) * 0.42;
      dots.push(dotY);
      const drawn = eventSvg(
        book,
        paint,
        colour,
        ids[i],
        [spineX, dotY],
        r,
        null,
        date,
        name,
      );
      out.push(drawn.svg);
      boxes.push(drawn.box);
      y += h + gap;
    }
    bottom = Math.max(bottom, y - gap);
    if (paged) return;
    // The spine: down the whole frame for one column; for two, from the
    // frame's top to past the first's last event, and from before the
    // second's first event to the frame's foot.
    const top = c === 0 ? frame.pic.y0 : dots[0] - floor * 1.2;
    const foot =
      c === cols - 1 ? frame.pic.y1 : dots[dots.length - 1] + floor * 1.2;
    spines.push(`M${r1(spineX)} ${r1(top)}V${r1(foot)}`);
    spineBoxes.push([spineX - 2, top, 4, foot - top]);
  });
  const pages = paged ? groups.length : 1;
  if (paged) {
    // One spine down through every page.
    const spineX = text.x0 + r;
    const foot = (pages - 1) * frame.H + frame.pic.y1;
    spines.push(`M${r1(spineX)} ${r1(frame.pic.y0)}V${r1(foot)}`);
    spineBoxes.push([spineX - 2, frame.pic.y0, 4, foot - frame.pic.y0]);
  }
  const spinePath = spines.join('');
  book.add('spine', {
    box: union(...spineBoxes),
    path: spinePath,
    role: 'ink',
  });
  out.unshift(
    partSvg(
      'spine',
      `<path d="${spinePath}" stroke="${paint.ink}" stroke-width="${r1(Math.max(4, floor * 0.1))}" stroke-linecap="round"/>`,
    ),
  );
  if (source) {
    // Under the first frame's words, inside its band.
    const firstBottom = Math.max(
      ...groups
        .filter((_, g) => (paged ? g === 0 : true))
        .flat()
        .map((i) => book.parts[ids[i].event].box)
        .map((b) => b[1] + b[3]),
    );
    // Set where the events' words start, clear of the spine (and, in two
    // columns, under the first).
    const indent = r * 2 + floor * 0.35;
    const drawn = sourceSvg(
      book,
      paint,
      frame,
      source,
      text.x0 + indent,
      Math.min(
        text.y1 - frame.size.chip * 0.4,
        firstBottom + frame.size.chip * 1.6,
      ),
      (cols === 2 ? colW : text.x1 - text.x0) - indent,
    );
    out.push(drawn.svg);
  }
  return {
    svg: out.join(''),
    focal: union(...boxes, ...spineBoxes),
    bottom,
    pages,
  };
}

/** A timeline drawn to fill the frame, or null with fewer than two events. */
export function timelineAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const events = readTimeline(raw);
  if (!events) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const colour = mainColour(paint, extraOf('timeline', raw).colour);
  const source = sourceLine(extraOf('timeline', raw).source);
  if (shape === 'wide') {
    const drawn = across(frame, paint, book, events, colour, source);
    return assetOf(frame, paint, drawn.svg, book, drawn.focal);
  }
  const drawn = down(frame, paint, book, events, colour, source);
  // Pages of a frame's height each: the camera travels down from one to the next.
  const long = drawn.pages > 1;
  const box: ShotBox = [0, 0, frame.W, frame.H * drawn.pages];
  return assetOf(
    frame,
    paint,
    drawn.svg,
    book,
    long ? [0, 0, frame.W, frame.H] : drawn.focal,
    box,
  );
}
