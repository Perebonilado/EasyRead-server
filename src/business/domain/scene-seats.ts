/**
 * A chamber's seats: a parliament's hemicycle, or a chamber's two benches
 * facing across the floor, each seat a dot in its group's colour, filling
 * seat by seat as it arrives (from one end of the arc to the other, so
 * each group is a wedge). Its total in the middle, a key of its groups
 * with their seats, a majority line if asked ("157 for a majority"), and
 * a small source line. Each group is a part the voice points at.
 *
 * The numbers are the writer's, made sound: groups are added up by code,
 * and a chamber too large to draw seat by seat (past MOST_SEATS) is drawn
 * with each dot standing for a round number of members, and a key that
 * says so.
 */
import { measureText } from './scene-font';
import { groupId } from './scene-ids';
import { perIcon } from './scene-icons';
import { numberOf } from './scene-counter';
import {
  GIVE_ORDER,
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
  strokeOf,
  styleOf,
  svgOf,
  textLines,
  uniqueId,
  type InfographicDrawing,
} from './scene-infographic-style';

export const SEAT_LAYOUTS = ['hemicycle', 'chamber'] as const;
export type SeatLayout = (typeof SEAT_LAYOUTS)[number];

export interface SeatsSpec {
  layout: SeatLayout;
  /** In order round the arc (or along the benches): each its name, its seats, its colour. */
  groups: { name: string; seats: number; colour: PaletteToken | null }[];
  majority: boolean;
  /** Its caption: "House of Representatives, 1959". */
  label: string | null;
  source: string | null;
}

/** A chamber as the writer gives it. */
export interface SeatsDraft {
  layout: string | null;
  groups:
    { name: string; seats: number | string; colour?: string | null }[] | null;
  majority: boolean | null;
  label: string | null;
}

/** The most dots a chamber draws: past this, each stands for more members. */
export const MOST_SEATS = 700;
export const MOST_GROUPS = 6;

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** A chamber made sound, or null with no seats. */
export function readSeats(
  raw: SeatsDraft | null | undefined,
  name: string,
  extra: { source?: unknown } = {},
): SeatsSpec | null {
  const groups: SeatsSpec['groups'] = [];
  for (const one of raw?.groups ?? []) {
    const seats = Math.round(numberOf(one?.seats)?.value ?? 0);
    const label = clean(one?.name, 28);
    if (!label || !(seats > 0)) continue;
    const same = groups.find(
      (g) => g.name.toLowerCase() === label.toLowerCase(),
    );
    if (same) same.seats += seats;
    else groups.push({ name: label, seats, colour: tokenOf(one?.colour) });
  }
  if (!groups.length) return null;
  const kept = groups.slice(0, MOST_GROUPS);
  // Groups past the most kept are one "Others".
  const rest = groups.slice(MOST_GROUPS - 1);
  const shown =
    groups.length > MOST_GROUPS
      ? [
          ...kept.slice(0, MOST_GROUPS - 1),
          {
            name: 'Others',
            seats: rest.reduce((n, g) => n + g.seats, 0),
            colour: 'muted' as const,
          },
        ]
      : kept;
  const total = shown.reduce((n, g) => n + g.seats, 0);
  if (total > 100_000) return null;
  return {
    layout: raw?.layout === 'chamber' ? 'chamber' : 'hemicycle',
    groups: shown,
    majority: raw?.majority === true,
    label: clean(raw?.label, 60) || clean(name, 60) || null,
    source: clean(extra.source, 90) || null,
  };
}

export const seatsPartNames = (spec: SeatsSpec): string[] => [
  ...spec.groups.map((g) => g.name),
  ...(spec.majority && spec.layout === 'hemicycle' ? ['majority'] : []),
  ...(spec.label ? ['label'] : []),
  ...(spec.source ? ['source'] : []),
];

/** Each group's colour: its own, else the next the palette has not given, in the chart's order. */
export function groupColours(spec: SeatsSpec): string[] {
  const used = new Set(spec.groups.map((g) => g.colour).filter(Boolean));
  const free = GIVE_ORDER.filter((t) => !used.has(t) && t !== 'chart3');
  let k = 0;
  return spec.groups.map((g) =>
    colourOr(
      g.colour ?? free[k++ % Math.max(1, free.length)] ?? 'muted',
      PAPER.muted,
    ),
  );
}

/** A seat's place, as a share of the chamber's radius (hemicycle) or of its benches (chamber). */
interface Seat {
  x: number;
  y: number;
  /** Its order round the arc: what decides its group and when it fills. */
  order: number;
}

/**
 * A hemicycle's seats: rows from an inner radius out, each with seats in
 * proportion to its length, the fewest rows that keep the seats as far
 * apart along a row as the rows are; ordered round the arc from its first
 * end to its last, so each group is a wedge. Radius 1, its centre at 0, 0.
 */
export function hemicycle(n: number): {
  seats: Seat[];
  dot: number;
  inner: number;
} {
  const inner = n <= 30 ? 0.36 : n <= 120 ? 0.32 : 0.28;
  let best: { seats: Seat[]; dot: number } | null = null;
  // Never more rows than seats: every row holds one at least.
  for (let rows = 1; rows <= Math.min(24, Math.max(1, n)); rows += 1) {
    const radii = Array.from({ length: rows }, (_, i) =>
      rows === 1 ? (1 + inner) / 2 : inner + ((1 - inner) * i) / (rows - 1),
    );
    const sum = radii.reduce((a, b) => a + b, 0);
    const counts = radii.map((r) => Math.max(1, Math.round((n * r) / sum)));
    // The rounding put right on the outermost rows, a seat at a time; a
    // row count it cannot be put right on (every row down to one) is
    // passed over.
    let diff = n - counts.reduce((a, b) => a + b, 0);
    for (
      let i = rows - 1, tries = 0;
      diff !== 0 && tries < rows * (Math.abs(diff) + 1);
      i = (i - 1 + rows) % rows, tries += 1
    ) {
      if (diff > 0) {
        counts[i] += 1;
        diff -= 1;
      } else if (counts[i] > 1) {
        counts[i] -= 1;
        diff += 1;
      }
    }
    if (diff !== 0) continue;
    const radial = rows === 1 ? 1 - inner : (1 - inner) / (rows - 1);
    const along = Math.min(
      ...radii.map((r, i) =>
        counts[i] > 1 ? (Math.PI * r) / (counts[i] - 1) : Math.PI * r,
      ),
    );
    const dot = Math.min(radial, along) * 0.42;
    if (!best || dot > best.dot * 1.001) {
      const seats: Seat[] = [];
      radii.forEach((r, i) => {
        for (let k = 0; k < counts[i]; k += 1) {
          const a =
            counts[i] === 1 ? Math.PI / 2 : Math.PI * (1 - k / (counts[i] - 1));
          seats.push({ x: r * Math.cos(a), y: -r * Math.sin(a), order: 0 });
        }
      });
      // Round the arc, from its first end; inner before outer at one angle.
      const angle = (s: Seat) => Math.atan2(-s.y, s.x);
      seats
        .sort(
          (a, b) =>
            angle(b) - angle(a) || Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y),
        )
        .forEach((s, i) => (s.order = i));
      best = { seats, dot };
    }
  }
  return { ...best!, inner };
}

/**
 * A chamber's two benches facing across the floor: the first half of the
 * seats on one, the rest on the other, each bench filled column by column
 * from its first end, so each group is a block. Units: a seat's pitch is 1.
 */
export function benches(n: number): {
  seats: Seat[];
  cols: number;
  rows: number;
} {
  const half = Math.ceil(n / 2);
  const rows = Math.max(1, Math.min(6, Math.round(Math.sqrt(half / 4))));
  const cols = Math.ceil(half / rows);
  const seats: Seat[] = [];
  for (let i = 0; i < n; i += 1) {
    const upper = i < half;
    const k = upper ? i : i - half;
    const col = Math.floor(k / rows);
    const row = k % rows;
    // The upper bench's front row is its lowest; the lower's its highest.
    const y = upper ? rows - 1 - row : rows + 1.6 + row;
    seats.push({ x: col, y, order: i });
  }
  return { seats, cols, rows };
}

/** A chamber, drawn: its seats by group, filling in turn; its total, key, majority line and source. */
export function renderSeats(
  spec: SeatsSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const members = spec.groups.reduce((n, g) => n + g.seats, 0);
  const per = perIcon(members, MOST_SEATS);
  // Each group's dots: its share, rounded so the dots add up.
  const dots = spec.groups.map((g) => g.seats / per);
  const counts = dots.map(Math.floor);
  let left =
    Math.max(1, Math.round(members / per)) - counts.reduce((a, b) => a + b, 0);
  dots
    .map((d, i) => ({ i, frac: d - Math.floor(d) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (left > 0) {
        counts[i] += 1;
        left -= 1;
      }
    });
  const n = counts.reduce((a, b) => a + b, 0);
  const colours = groupColours(spec);
  const source = sourceText(spec.source);
  const tall = shape === 'tall';
  const width = room.w;
  // The key: a dot and each group's name and seats, in rows that fit.
  const keySize = text;
  const entries = spec.groups.map((g, i) => ({
    words: `${g.name} ${g.seats.toLocaleString('en-GB')}`,
    colour: colours[i],
  }));
  const entryW = (e: { words: string }) =>
    keySize * 1.3 + measureText(e.words, keySize, 700) + keySize * 1.2;
  const keyRows: (typeof entries)[] = [[]];
  let rowW = 0;
  for (const e of entries) {
    const w = entryW(e);
    if (rowW + w > width * 0.96 && keyRows[keyRows.length - 1].length) {
      keyRows.push([]);
      rowW = 0;
    }
    keyRows[keyRows.length - 1].push(e);
    rowW += w;
  }
  const keyH = keyRows.length * keySize * 1.7;
  const label = spec.label
    ? fitWords(spec.label, width * 0.92, text * 1.25, text, 1)
    : null;
  const perKey =
    per > 1 ? `Each dot = ${per.toLocaleString('en-GB')} members` : null;
  const below =
    text * 0.6 +
    keyH +
    (label ? label.size * 1.5 : 0) +
    (perKey ? text * 1.6 : 0) +
    (source ? sourceRoom(text) : 0);
  const out: string[] = [];
  const parts: Record<string, string> = {};
  const used = new Set<string>();
  const fill = 2.2;
  const each = n > 1 ? fill / n : 0;
  const batch = n > 160 ? Math.ceil(n / 120) : 1;
  out.push(
    styleOf({
      s: 'transform-box:fill-box;transform-origin:center;animation:ig-pop .3s ease-out both',
      b: 'animation:ig-show .18s ease-out both',
      show: 'animation:ig-show .4s ease-out both',
      draw: 'animation:ig-draw .5s ease-out both',
    }),
  );
  let chamberBottom = 0;
  let centre = { x: width / 2, y: 0 };
  let seatAt: (s: Seat) => { x: number; y: number };
  let dotR: number;
  let laid: Seat[];
  let majorityLine = '';
  // The highest anything is drawn: the majority's words stand over the arc.
  let highest = 0;
  if (spec.layout === 'hemicycle') {
    const arc = hemicycle(n);
    const radius = Math.min(
      width * 0.47,
      (room.h - below - text * 0.6) / (1 + arc.dot),
      tall ? 330 : 470,
    );
    centre = { x: width / 2, y: radius * (1 + arc.dot) + text * 0.3 };
    dotR = arc.dot * radius;
    seatAt = (s) => ({
      x: centre.x + s.x * radius,
      y: centre.y + s.y * radius,
    });
    laid = arc.seats;
    chamberBottom = centre.y + dotR;
    // The total in its hollow.
    const total = members.toLocaleString('en-GB');
    const totalSize = Math.min(
      arc.inner * radius * 0.62,
      (arc.inner * radius * 1.6) / Math.max(1, measureText(total, 1, 700)),
    );
    out.push(
      `<g id="seats-total" class="show" style="${delayOf(fill * 0.6)}">` +
        textLines([total], centre.x, centre.y - totalSize * 0.28, totalSize, {
          fill: PAPER.ink,
        }) +
        textLines(
          ['seats'],
          centre.x,
          centre.y + text * 0.15 - totalSize * 0.28 + totalSize * 0.62,
          Math.max(text * 0.85, totalSize * 0.3),
          { fill: PAPER.muted, weight: 600 },
        ) +
        `</g>`,
    );
    parts.total = 'seats-total';
    if (spec.majority) {
      const needed = Math.floor(members / 2) + 1;
      const top = centre.y - radius - dotR * 2.2;
      const bottom = centre.y - arc.inner * radius + dotR;
      const words = `${needed.toLocaleString('en-GB')} for a majority`;
      majorityLine =
        `<g id="seats-majority" class="show" style="${delayOf(fill + 0.2)}">` +
        `<path d="M${r1(centre.x)} ${r1(bottom)}V${r1(top)}" stroke="${PAPER.ink}" stroke-width="${r1(strokeOf(text) * 0.9)}" stroke-dasharray="${r1(text * 0.35)} ${r1(text * 0.3)}" stroke-linecap="round"/>` +
        `<text x="${r1(centre.x)}" y="${r1(top - text * 0.4)}" font-size="${r1(text)}" font-weight="700" fill="${PAPER.ink}" text-anchor="middle">${escapeXml(words)}</text>` +
        `</g>`;
      parts.majority = 'seats-majority';
      highest = Math.min(highest, top - text * 1.3);
    }
  } else {
    const bench = benches(n);
    const across = bench.cols;
    const down = bench.rows * 2 + 1.6;
    const pitch = Math.min(
      (width * 0.94) / across,
      (room.h - below - text) / down,
      text * 2.2,
    );
    dotR = pitch * 0.4;
    const x0 = (width - across * pitch) / 2 + pitch / 2;
    seatAt = (s) => ({
      x: x0 + s.x * pitch,
      y: text * 0.3 + pitch / 2 + s.y * pitch,
    });
    laid = bench.seats;
    // The floor between the benches: its table.
    const floorY = text * 0.3 + pitch * (bench.rows + 0.25);
    out.push(
      `<rect class="show" x="${r1(x0 - pitch / 2 + pitch * 0.6)}" y="${r1(floorY + pitch * 0.15)}" width="${r1(across * pitch - pitch * 1.2)}" height="${r1(pitch * 0.8)}" rx="${r1(pitch * 0.2)}" fill="${PAPER.grid}"/>`,
    );
    chamberBottom = text * 0.3 + pitch * down;
  }
  // Each group's seats, in the order round the arc.
  const ordered = [...laid].sort((a, b) => a.order - b.order);
  let start = 0;
  spec.groups.forEach((g, gi) => {
    const id = uniqueId(`seats-${groupId(g.name) || gi + 1}`, used);
    parts[g.name] = id;
    const mine = ordered.slice(start, start + counts[gi]);
    const circles: string[] = [];
    for (let i = 0; i < mine.length; i += batch) {
      const run = mine.slice(i, i + batch);
      const delay = 0.2 + (start + i) * each;
      // A dense chamber's seats on whole units: a tenth of one is never seen, and it keeps the drawing small.
      const at1 = n > 300 ? Math.round : r1;
      const dots = run
        .map((s) => {
          const at = seatAt(s);
          return `<circle cx="${at1(at.x)}" cy="${at1(at.y)}" r="${r1(dotR)}"${batch === 1 ? ` class="s" style="${delayOf(delay)}"` : ''}/>`;
        })
        .join('');
      circles.push(
        batch === 1
          ? dots
          : `<g class="b" style="${delayOf(delay)}">${dots}</g>`,
      );
    }
    start += counts[gi];
    out.push(`<g id="${id}" fill="${colours[gi]}">${circles.join('')}</g>`);
  });
  out.push(majorityLine);
  // Under it: the key, the caption, a dot's worth, the source.
  let y = chamberBottom + text * 0.9;
  const keyItems: string[] = [];
  keyRows.forEach((row) => {
    const rowWidth = row.reduce((sum, e) => sum + entryW(e), 0) - keySize * 1.2;
    let x = (width - rowWidth) / 2;
    for (const e of row) {
      keyItems.push(
        `<circle cx="${r1(x + keySize * 0.45)}" cy="${r1(y + keySize * 0.62)}" r="${r1(keySize * 0.42)}" fill="${e.colour}"/>` +
          `<text x="${r1(x + keySize * 1.3)}" y="${r1(y + keySize * 0.98)}" font-size="${r1(keySize)}" font-weight="700" fill="${PAPER.ink}">${escapeXml(e.words)}</text>`,
      );
      x += entryW(e);
    }
    y += keySize * 1.7;
  });
  out.push(
    `<g id="seats-key" class="show" style="${delayOf(fill * 0.5)}">${keyItems.join('')}</g>`,
  );
  parts.key = 'seats-key';
  if (label) {
    parts.label = 'seats-label';
    out.push(
      `<g id="seats-label" class="show" style="${delayOf(0.1)}">${textLines(label.lines, width / 2, y + label.size * 0.95, label.size)}</g>`,
    );
    y += label.size * 1.5;
  }
  if (perKey) {
    out.push(
      `<g class="show" style="${delayOf(fill)}">${textLines([perKey], width / 2, y + text * 1.05, text, { weight: 600, fill: PAPER.muted })}</g>`,
    );
    y += text * 1.6;
  }
  if (source) {
    parts.source = 'source';
    out.push(
      `<g class="show" style="${delayOf(fill)}">${sourceLineSvg(source, width / 2, y + text * 1.45, width * 0.94, text)}</g>`,
    );
    y += sourceRoom(text);
  }
  const viewBox: [number, number, number, number] = [
    0,
    r1(highest),
    width,
    r1(y + text * 0.3 - highest),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states: {} };
}
