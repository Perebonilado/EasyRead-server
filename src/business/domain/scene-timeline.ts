/**
 * A timeline on the stage, drawn by code: an axis, and the page's events
 * along it in order. Spaced by their dates when every one is a year (or a
 * plain number), evenly when they are stages or steps. Each event is a
 * part the voice can point at; the axis draws itself as it arrives and
 * the events come in along it, one after another. Labels take turns above
 * and below the axis, so neighbours never share a line.
 */
import { measureText } from './scene-font';
import { groupId } from './scene-ids';

export interface TimelineSpec {
  events: { when: string; name: string }[];
}

/** The most events one timeline holds: more is a second timeline. */
export const MAX_EVENTS = 8;

const W = 1100;
const H = 460;
const AXIS_Y = 230;
const LEFT = 160;
const RIGHT = 940;
/** Kept clear at the drawing's edges. */
const EDGE = 12;
const WHEN_SIZE = 30;
const NAME_SIZE = 25;
const LINE = 1.2;
/** How far a label stands from the axis. */
const STEM = 34;
const INK = '#1F2A37';
const MUTED = '#5B6675';
const ACCENT = '#E0663A';
const DOT = '#3D8FD1';

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r = (n: number) => Math.round(n * 10) / 10;

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/**
 * A date as a number of years: "1914", "44 BC", "AD 79", and with a month
 * or a day, "June 1910" or "14 Dec 1911", a fraction into its year. Null
 * for "Stage 2" or "Spring".
 */
export function dateOf(when: string): number | null {
  const m = /^\s*(AD|CE)?\s*(-?\d{1,4}(?:\.\d+)?)\s*(BC|BCE|AD|CE)?\s*$/i.exec(
    when,
  );
  if (m) {
    const value = Number(m[2]);
    if (!Number.isFinite(value)) return null;
    return /^BCE?$/i.test(m[3] ?? '') ? -value : value;
  }
  const year = /\b(\d{3,4})\b/.exec(when);
  const month =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?![a-z])/i.exec(
      when,
    );
  if (!year || !month) return null;
  const day = /\b(\d{1,2})\b/.exec(when.replace(year[0], ''));
  return (
    Number(year[1]) +
    MONTHS.indexOf(month[1].toLowerCase()) / 12 +
    (day ? (Math.min(31, Number(day[1])) - 1) / 365 : 0)
  );
}

/** Words broken into lines no wider than a width, at most `most` lines, the last cut short. */
function lines(
  text: string,
  width: number,
  size: number,
  most: number,
): string[] {
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
  if (out.length <= most) return out;
  const kept = out.slice(0, most);
  let last = kept[most - 1];
  while (last.length > 1 && measureText(`${last}…`, size, 600) > width)
    last = last.slice(0, -1);
  kept[most - 1] = `${last.trimEnd()}…`;
  return kept;
}

/**
 * Where each event sits along the axis, from 0 to 1: by date when every
 * event has one, and no two closer than a share of the axis they need to
 * be read; evenly otherwise.
 */
export function positions(events: TimelineSpec['events']): number[] {
  const n = events.length;
  const even = events.map((_, i) => (n === 1 ? 0.5 : i / (n - 1)));
  const dates = events.map((e) => dateOf(e.when));
  if (n < 2 || dates.some((d) => d === null)) return even;
  const known = dates as number[];
  const low = Math.min(...known);
  const high = Math.max(...known);
  if (!(high > low)) return even;
  const at = known.map((d) => (d - low) / (high - low));
  // Pushed apart where dates crowd, and drawn back in to the axis's ends.
  const gap = Math.min(1 / (n - 1), 0.11);
  for (let i = 1; i < n; i += 1) at[i] = Math.max(at[i], at[i - 1] + gap);
  const over = at[n - 1] - 1;
  if (over > 0) {
    at[n - 1] = 1;
    for (let i = n - 2; i >= 0; i -= 1)
      at[i] = Math.min(at[i], at[i + 1] - gap);
  }
  return at.map((a) => Math.max(0, Math.min(1, a)));
}

/** A timeline, drawn: its SVG, and each event as a part the voice can point at. */
export function renderTimeline(spec: TimelineSpec): {
  svg: string;
  viewBox: [number, number, number, number];
  parts: Record<string, string>;
} {
  const given = spec.events
    .filter((e) => e.name.trim() || e.when.trim())
    .slice(0, MAX_EVENTS);
  if (given.length < 2) throw new Error('a timeline needs at least two events');
  // In date order when all are dated; as the page tells them otherwise.
  const dated = given.every((e) => dateOf(e.when) !== null);
  const events = dated
    ? [...given].sort((a, b) => dateOf(a.when)! - dateOf(b.when)!)
    : given;
  const at = positions(events);
  const xs = at.map((a) => LEFT + a * (RIGHT - LEFT));
  // A label may reach halfway to its neighbours on its own side of the
  // axis, or to the drawing's edge, and stands off its event toward the
  // side with more room when one side is tight.
  const span = (i: number) => {
    const same = xs.filter((_, k) => k % 2 === i % 2);
    const k = Math.floor(i / 2);
    const left = k > 0 ? (xs[i] - same[k - 1]) / 2 - 8 : xs[i] - EDGE;
    const right =
      k < same.length - 1 ? (same[k + 1] - xs[i]) / 2 - 8 : W - EDGE - xs[i];
    const width = Math.max(100, Math.min(320, left + right));
    const centre = Math.min(
      Math.max(xs[i], xs[i] - left + width / 2),
      xs[i] + right - width / 2,
    );
    return { width, centre };
  };
  const parts: Record<string, string> = {};
  const out: string[] = [];
  const length = RIGHT - LEFT + 40;
  out.push(
    `<style>` +
      `@keyframes axis{from{stroke-dashoffset:${length}}to{stroke-dashoffset:0}}` +
      `@keyframes up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}` +
      `@keyframes down{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}` +
      `.axis{stroke-dasharray:${length};animation:axis 1.2s ease-out both}` +
      `.up{animation:up .55s ease-out both}.down{animation:down .55s ease-out both}` +
      `</style>`,
    `<line class="axis" x1="${LEFT - 20}" y1="${AXIS_Y}" x2="${RIGHT + 20}" y2="${AXIS_Y}" stroke="${MUTED}" stroke-width="5" stroke-linecap="round"/>`,
  );
  events.forEach((event, i) => {
    const x = r(xs[i]);
    const above = i % 2 === 0;
    const { width, centre } = span(i);
    const cx = r(centre);
    const when = lines(event.when, width, WHEN_SIZE, 1);
    const name = lines(event.name, width, NAME_SIZE, 2);
    const block =
      (when.length ? WHEN_SIZE * LINE : 0) + name.length * NAME_SIZE * LINE;
    const top = above ? AXIS_Y - STEM - block : AXIS_Y + STEM;
    const key = event.name || event.when;
    if (parts[key]) return;
    const id = `event-${groupId(key) || String(i + 1)}`;
    parts[key] = id;
    const texts: string[] = [];
    let y = top;
    for (const line of when) {
      y += WHEN_SIZE;
      texts.push(
        `<text x="${cx}" y="${r(y)}" font-size="${WHEN_SIZE}" font-weight="700" fill="${ACCENT}" text-anchor="middle">${escape(line)}</text>`,
      );
      y += WHEN_SIZE * (LINE - 1);
    }
    for (const line of name) {
      y += NAME_SIZE;
      texts.push(
        `<text x="${cx}" y="${r(y)}" font-size="${NAME_SIZE}" font-weight="600" fill="${INK}" text-anchor="middle">${escape(line)}</text>`,
      );
      y += NAME_SIZE * (LINE - 1);
    }
    const stemTo = above ? AXIS_Y - STEM + 6 : AXIS_Y + STEM - 6;
    out.push(
      `<g id="${id}"><g class="${above ? 'up' : 'down'}" style="animation-delay:${(0.5 + i * 0.35).toFixed(2)}s">` +
        `<line x1="${x}" y1="${AXIS_Y}" x2="${x}" y2="${stemTo}" stroke="${MUTED}" stroke-width="3" stroke-linecap="round"/>` +
        `<circle cx="${x}" cy="${AXIS_Y}" r="13" fill="${DOT}" stroke="#FFFFFF" stroke-width="4"/>` +
        texts.join('') +
        `</g></g>`,
    );
  });
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`,
    viewBox: [0, 0, W, H],
    parts,
  };
}
