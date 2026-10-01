/**
 * Calendars: when something happens, as a tear-off desk calendar shows a
 * date. One calendar or a few side by side ("1957", "1959"), each page a
 * date read by code (a day with its month and year, a month and a year, a
 * year, or a few words: "Day 44"). A later page is a state, shown on its
 * cue: the page before flips up over the binding and the new one is there.
 * Several calendars may slide together into one date ("merge"), the day
 * they all came to.
 */
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
  type InfographicDrawing,
} from './scene-infographic-style';

/** One page: what it says, and the date code read in it. */
export interface CalendarPage {
  text: string;
  day: number | null;
  /** 1 to 12. */
  month: number | null;
  /** The year as it is written: "1960", "44 BC". */
  year: string | null;
}

export interface CalendarSpec {
  /** One to three calendars, each one to four pages, in order. */
  calendars: { label: string | null; pages: CalendarPage[] }[];
  /** The one date they all slide together into, when shown. */
  merge: CalendarPage | null;
  colour: PaletteToken | null;
}

/** Calendars as the writer gives them. */
export interface CalendarDraft {
  calendars: { label: string | null; dates: string[] | null }[] | null;
  merge: string | null;
}

export const MOST_CALENDARS = 3;
export const MOST_PAGES = 4;
/** The state that brings every calendar together into one date. */
export const CALENDAR_MERGE = 'merge';

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const monthOf = (word: string): number | null => {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return null;
  const i = MONTHS.findIndex((m) => m.startsWith(w));
  return i >= 0 ? i + 1 : null;
};

/**
 * A page read from what the writer wrote: "1 October 1960", "October 1,
 * 1960", "1960-10-01", "May 1953", "1957", "44 BC", "1 October"; anything
 * else ("Day 44", "Independence") is its own words.
 */
export function pageOf(raw: string): CalendarPage | null {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 32);
  if (!text) return null;
  const iso = /^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(text);
  if (iso) {
    const month = Number(iso[2]);
    const day = iso[3] ? Number(iso[3]) : null;
    if (month >= 1 && month <= 12 && (day === null || (day >= 1 && day <= 31)))
      return { text, day, month, year: iso[1] };
  }
  let day: number | null = null;
  let month: number | null = null;
  let year: string | null = null;
  const era = /\b(\d{1,4})\s*(BC|BCE|AD|CE)\b/i.exec(text);
  if (era) year = `${era[1]} ${era[2].toUpperCase()}`;
  const rest = era ? text.replace(era[0], ' ') : text;
  const words = rest
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^(?:the|of|on|in)$/i.test(w));
  const unread: string[] = [];
  for (const word of words) {
    const ordinal = /^(\d{1,2})(?:st|nd|rd|th)?$/i.exec(word);
    const m = monthOf(word);
    if (m && month === null) month = m;
    else if (/^\d{3,4}s?$/.test(word) && year === null) year = word;
    else if (ordinal && day === null && Number(ordinal[1]) >= 1 && Number(ordinal[1]) <= 31)
      day = Number(ordinal[1]);
    else unread.push(word);
  }
  // A date only when every word was part of one, and it has a month or a year.
  if (!unread.length && (month !== null || year !== null) && !(day !== null && month === null))
    return { text, day, month, year };
  return { text, day: null, month: null, year: null };
}

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** Calendars made sound, or null with no date. */
export function readCalendar(
  raw: CalendarDraft | null | undefined,
  extra: { colour?: unknown } = {},
): CalendarSpec | null {
  const calendars = (raw?.calendars ?? [])
    .map((one) => ({
      label: clean(one?.label, 32) || null,
      pages: (one?.dates ?? [])
        .map((date) => (typeof date === 'string' ? pageOf(date) : null))
        .filter((page): page is CalendarPage => page !== null)
        .slice(0, MOST_PAGES),
    }))
    .filter((one) => one.pages.length)
    .slice(0, MOST_CALENDARS);
  if (!calendars.length) return null;
  let merge = raw?.merge ? pageOf(raw.merge) : null;
  // One calendar has nothing to meet: its "merge" is its next page.
  if (merge && calendars.length === 1) {
    if (calendars[0].pages.length < MOST_PAGES) calendars[0].pages.push(merge);
    merge = null;
  }
  return { calendars, merge, colour: tokenOf(extra.colour) };
}

/** The states a page flips to: its date's words, and "page 2" and on for the first calendar. */
function pageStates(spec: CalendarSpec): { name: string; c: number; p: number }[] {
  const out: { name: string; c: number; p: number }[] = [];
  const taken = new Set<string>();
  const add = (name: string, c: number, p: number) => {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!key || taken.has(key)) return;
    taken.add(key);
    out.push({ name, c, p });
  };
  spec.calendars.forEach((one, c) =>
    one.pages.forEach((page, p) => {
      if (p === 0) return;
      add(page.text, c, p);
      if (c === 0) add(`page ${p + 1}`, c, p);
      if (one.label) add(`${one.label} page ${p + 1}`, c, p);
    }),
  );
  return out;
}

export const calendarPartNames = (spec: CalendarSpec): string[] =>
  spec.calendars.map((one, c) => one.label ?? one.pages[0].text ?? `calendar ${c + 1}`);
export const calendarStateNames = (spec: CalendarSpec): string[] => [
  ...pageStates(spec).map((s) => s.name),
  ...(spec.merge && spec.calendars.length > 1
    ? [CALENDAR_MERGE, spec.merge.text]
    : []),
];

const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** What a page shows: the small words in its band, and its big words. */
export function faceOf(page: CalendarPage): { band: string; big: string } {
  if (page.day !== null && page.month !== null)
    return {
      band: `${MONTHS[page.month - 1].toUpperCase()}${page.year ? ` ${page.year}` : ''}`,
      big: String(page.day),
    };
  if (page.month !== null)
    return { band: page.year ?? '', big: SHORT[page.month - 1] };
  if (page.year !== null) return { band: '', big: page.year };
  return { band: '', big: page.text };
}

/** One calendar page, drawn at a place: rings, its band, its big words. */
function pageSvg(
  page: CalendarPage,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
  text: number,
): string {
  const face = faceOf(page);
  const band = h * 0.24;
  const corner = Math.min(w, h) * 0.07;
  const stroke = strokeOf(text);
  const bandWords = face.band
    ? fitWords(face.band, w * 0.86, Math.min(band * 0.5, text * 1.25), text * 0.8, 1)
    : null;
  const bigRoom = h - band - h * 0.12;
  const big = fitWords(
    face.big,
    w * 0.84,
    Math.min(bigRoom * (face.big.length <= 2 ? 0.86 : 0.62), w * 0.9),
    text,
    /^\d+$/.test(face.big) ? 1 : 2,
  );
  const bigH = big.lines.length * big.size * 1.05;
  const rings = [0.28, 0.72]
    .map(
      (k) =>
        `<rect x="${r1(x + w * k - w * 0.03)}" y="${r1(y - h * 0.05)}" width="${r1(w * 0.06)}" height="${r1(h * 0.11)}" rx="${r1(w * 0.03)}" fill="${PAPER.ink}"/>`,
    )
    .join('');
  return (
    `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(corner)}" fill="${PAPER.card}" stroke="${PAPER.paperEdge}" stroke-width="${r1(stroke)}"/>` +
    `<path d="M${r1(x)} ${r1(y + band)}V${r1(y + corner)}Q${r1(x)} ${r1(y)} ${r1(x + corner)} ${r1(y)}H${r1(x + w - corner)}Q${r1(x + w)} ${r1(y)} ${r1(x + w)} ${r1(y + corner)}V${r1(y + band)}Z" fill="${colour}"/>` +
    (bandWords
      ? textLines(bandWords.lines, x + w / 2, y + band / 2 + bandWords.size * 0.36, bandWords.size, { fill: PAPER.card, spacing: bandWords.size * 0.06 })
      : '') +
    textLines(
      big.lines,
      x + w / 2,
      y + band + (h - band - bigH) / 2 + big.size * 0.86,
      big.size,
      { fill: PAPER.ink, leading: 1.05 },
    ) +
    rings
  );
}

/** Calendars, drawn: each a part by its label; each later page and their meeting, states. */
export function renderCalendar(
  spec: CalendarSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const n = spec.calendars.length;
  const colour = colourOr(spec.colour, PAPER.accent);
  const cols = shape === 'tall' ? Math.min(n, 2) : n;
  const rows = Math.ceil(n / cols);
  const labelled = spec.calendars.some((one) => one.label);
  const labelRoom = labelled ? text * 2.6 : 0;
  const gap = text * 1.4;
  const ratio = 1.12;
  const merged = spec.merge && n > 1;
  // A page's size: the room shared by the calendars, or by the one they merge into when it is larger.
  const w = Math.min(
    (room.w - gap * (cols - 1)) / cols,
    ((room.h - labelRoom * rows - gap * (rows - 1)) / rows - text * 0.4) / ratio,
    shape === 'tall' ? 330 : 380,
  );
  const h = w * ratio;
  const width = cols * w + gap * (cols - 1);
  const cellH = h + labelRoom;
  const placeOf = (c: number) => {
    const row = Math.floor(c / cols);
    const inRow = Math.min(cols, n - row * cols);
    const x0 = (width - (inRow * w + gap * (inRow - 1))) / 2;
    return { x: x0 + (c - row * cols) * (w + gap), y: text * 0.5 + row * (cellH + gap) };
  };
  const out: string[] = [
    styleOf({
      pop: 'transform-box:fill-box;transform-origin:center;animation:ig-pop .45s cubic-bezier(.2,.8,.3,1.2) both',
      rise: 'animation:ig-rise .4s ease-out both',
      flip: 'transform-box:fill-box;transform-origin:50% 0;animation:ig-flip .42s cubic-bezier(.5,0,.8,.4) both',
      show: 'animation:ig-show .3s ease-out both',
      gather: 'animation:ig-gather .55s cubic-bezier(.5,0,.6,1) both',
    }).replace(
      '</style>',
      '@keyframes ig-gather{from{transform:none;opacity:1}to{transform:translate(var(--dx),var(--dy)) scale(.7);opacity:0}}</style>',
    ),
  ];
  const parts: Record<string, string> = {};
  const states: Record<string, string> = {};
  spec.calendars.forEach((one, c) => {
    const { x, y } = placeOf(c);
    const id = `calendar-${c + 1}`;
    const name = one.label ?? one.pages[0].text;
    if (!parts[name]) parts[name] = id;
    out.push(
      `<g id="${id}"><g class="pop" style="${delayOf(0.15 + c * 0.25)}">` +
        pageSvg(one.pages[0], x, y, w, h, colour, text) +
        (one.label
          ? textLines(
              fitWords(one.label, w + gap * 0.8, text * 1.15, text, 1).lines,
              x + w / 2,
              y + h + text * 1.75,
              fitWords(one.label, w + gap * 0.8, text * 1.15, text, 1).size,
            )
          : '') +
        `</g></g>`,
    );
  });
  // Each later page: the one before flips up and away, and it is there.
  for (const state of pageStates(spec)) {
    const one = spec.calendars[state.c];
    const { x, y } = placeOf(state.c);
    const id = `calendar-${state.c + 1}-page-${state.p + 1}`;
    const already = Object.values(states).includes(id);
    states[state.name] = id;
    if (already) continue;
    const ghosts: string[] = [];
    // More flips for more time passing: years apart, or a day count.
    const before = one.pages[state.p - 1];
    const after = one.pages[state.p];
    const years = Math.abs((Number.parseInt(after.year ?? '', 10) || 0) - (Number.parseInt(before.year ?? '', 10) || 0));
    const flips = years >= 2 ? 3 : 1;
    for (let k = flips - 1; k >= 0; k -= 1)
      ghosts.push(
        `<g class="flip" opacity="0" style="${delayOf(0.05 + k * 0.16)}">${pageSvg(k === flips - 1 ? before : { text: '', day: null, month: null, year: null }, x, y, w, h, colour, text)}</g>`,
      );
    out.push(`<g id="${id}">${pageSvg(after, x, y, w, h, colour, text)}${ghosts.join('')}</g>`);
  }
  // Their meeting: each calendar slides to the middle and goes, and the one date is there.
  let bottom = rows * cellH + gap * (rows - 1) + text * 0.5;
  if (merged && spec.merge) {
    const bigW = Math.min(w * 1.25, room.w * 0.6);
    const bigH = bigW * ratio;
    const cx = width / 2;
    const cy = Math.max(h / 2 + text * 0.5, bigH / 2 + text * 0.5);
    const mx = cx - bigW / 2;
    const my = cy - bigH / 2;
    // From above the rings of the calendars it covers, and of its own.
    const top = Math.min(text * 0.5 - h * 0.09, my - bigH * 0.09);
    const coverH = Math.max(bottom, my + bigH + text * 0.5) - top;
    const gathering = spec.calendars
      .map((one, c) => {
        const { x, y } = placeOf(c);
        const last = one.pages[one.pages.length - 1];
        const dx = cx - (x + w / 2);
        const dy = cy - (y + h / 2);
        return `<g class="gather" opacity="0" style="--dx:${r1(dx)}px;--dy:${r1(dy)}px;${delayOf(0.05)}">${pageSvg(last, x, y, w, h, colour, text)}</g>`;
      })
      .join('');
    states[CALENDAR_MERGE] = 'calendar-merge';
    states[spec.merge.text] = 'calendar-merge';
    out.push(
      `<g id="calendar-merge"><rect class="show" x="${r1(-text)}" y="${r1(top)}" width="${r1(width + text * 2)}" height="${r1(coverH)}" fill="${PAPER.paper}"/>` +
        gathering +
        `<g class="pop" style="${delayOf(0.5)}">${pageSvg(spec.merge, mx, my, bigW, bigH, colour, text * 1.1)}</g></g>`,
    );
    bottom = Math.max(bottom, my + bigH + text * 0.4);
  }
  const viewBox: [number, number, number, number] = [
    r1(-text * 0.5),
    r1(-h * 0.08),
    r1(width + text),
    r1(bottom + h * 0.08),
  ];
  return { svg: svgOf(viewBox, out.join('')), viewBox, parts, states };
}
