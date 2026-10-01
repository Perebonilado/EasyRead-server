/**
 * A counter: one number, large, that rolls up to its value as it arrives,
 * the way an odometer's wheels turn (each digit a wheel; the last turns
 * most), with what it counts and a small source line under it. "About
 * 45 million" is 45, unit "million", prefix "about". The voice says what
 * the number means; the stage shows the number.
 *
 * It may roll on to a later value on a cue ("then": the state of the
 * same name), the old number covered and its wheels turning on from where
 * they stood.
 */
import type { FilmShape } from './scene-shape';
import { measureText } from './scene-font';
import { colourOr, tokenOf, type PaletteToken } from './scene-palette';
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
  styleOf,
  svgOf,
  textLines,
  type InfographicDrawing,
} from './scene-infographic-style';

export interface CounterSpec {
  value: number;
  /** How many places after the point it is written with. */
  places: number;
  /** What it is in, written after it: "million", "%", "km", "people". */
  unit: string | null;
  /** Written before it: a currency ("$", "£") at its size, or a word ("about", "over") small. */
  prefix: string | null;
  /** What it counts, under it: "people lived in the colony". */
  label: string | null;
  /** A later value it rolls on to when its "then" state is shown. */
  then: number | null;
  colour: PaletteToken | null;
  source: string | null;
}

/** A counter as the writer gives it. */
export interface CounterDraft {
  value: number | string | null;
  unit: string | null;
  prefix: string | null;
  label: string | null;
  then: number | string | null;
}

/** The name of the state that rolls a counter on to its later value. */
export const COUNTER_THEN = 'then';

const clean = (text: unknown, most: number) =>
  typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, most)
    : '';

/** A number as the writer gave it ("45", "1,500", "3.5", 45): its value and its places; null for none. */
export function numberOf(
  raw: unknown,
): { value: number; places: number } | null {
  if (typeof raw === 'number')
    return Number.isFinite(raw)
      ? {
          value: raw,
          places: Math.min(3, (/\.(\d+)/.exec(String(raw))?.[1] ?? '').length),
        }
      : null;
  if (typeof raw !== 'string') return null;
  const m = /-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/.exec(raw);
  if (!m) return null;
  const value = Number(m[0].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return {
    value,
    places: Math.min(3, (/\.(\d+)/.exec(m[0])?.[1] ?? '').length),
  };
}

/** A counter made sound, or null when it has no number. */
export function readCounter(
  raw: CounterDraft | null | undefined,
  extra: { colour?: unknown; source?: unknown } = {},
): CounterSpec | null {
  const read = numberOf(raw?.value);
  if (!read || Math.abs(read.value) >= 1e15) return null;
  const then = numberOf(raw?.then);
  return {
    value: read.value,
    places: read.places,
    unit: clean(raw?.unit, 16) || null,
    prefix: clean(raw?.prefix, 12) || null,
    label: clean(raw?.label, 60) || null,
    then:
      then && then.value !== read.value && Math.abs(then.value) < 1e15
        ? then.value
        : null,
    colour: tokenOf(extra.colour),
    source: clean(extra.source, 90) || null,
  };
}

/** What the voice may point at on a counter, and the state it may show. */
export const counterPartNames = (spec: CounterSpec): string[] => [
  'number',
  ...(spec.label ? ['label'] : []),
  ...(spec.source ? ['source'] : []),
];
export const counterStateNames = (spec: CounterSpec): string[] =>
  spec.then === null ? [] : [COUNTER_THEN];

/** A value as it is read, grouped by thousands: "1,500,000", "3.5". */
export function counterText(value: number, places: number): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** A prefix that is a sign or a currency, set at the number's own size. */
const SIGN = /^[^\p{L}]{1,3}$|^(?:US\$|A\$|C\$|R\$|N|KSh|Rs|₹|₦|€|£|\$|¥)$/u;

/** A unit set against the number at its size ("%", "°C"); any other is written after it, smaller. */
const ATTACHED = /^(?:%|°[CF]?|‰|x|×)$/;

interface Laid {
  size: number;
  prefixSize: number;
  unitSize: number;
  /** The widths of the pieces at their sizes. */
  prefixW: number;
  numberW: number;
  unitW: number;
  /** The unit under the number, when beside it is too wide. */
  unitUnder: boolean;
}

/**
 * How wide each wheel of a counter is, at a size: a little under the
 * reading font's widest digit (its 0, whose advance carries room either
 * side), so a number reads as one word and not as spaced figures.
 */
const digitWidth = (size: number) => size * 0.62;
/** A separator's room between wheels ("," "."): a little under its own advance, as figures set close. */
const markWidth = (ch: string, size: number) =>
  measureText(ch, size, 700) * 0.8;

/** How wide a number is as its wheels set it: digits at one width, the rest as they are. */
function wheelsWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text)
    w += /\d/.test(ch) ? digitWidth(size) : markWidth(ch, size);
  return w;
}

function layOut(
  texts: string[],
  spec: CounterSpec,
  width: number,
  most: number,
  least: number,
): Laid {
  const widest = Math.max(...texts.map((t) => wheelsWidth(t, 1)));
  const sign = spec.prefix ? SIGN.test(spec.prefix) : false;
  const attached = spec.unit ? ATTACHED.test(spec.unit) : false;
  const at = (size: number, unitUnder: boolean): Laid => {
    const prefixSize = spec.prefix
      ? sign
        ? size
        : Math.max(least * 0.5, size * 0.34)
      : 0;
    const unitSize = spec.unit
      ? attached
        ? size * 0.62
        : Math.max(least * 0.5, size * 0.38)
      : 0;
    const prefixW = spec.prefix
      ? measureText(spec.prefix, prefixSize, 700) +
        (sign ? size * 0.04 : size * 0.12)
      : 0;
    const unitW =
      spec.unit && !unitUnder
        ? measureText(spec.unit, unitSize, 700) +
          (attached ? size * 0.03 : size * 0.12)
        : 0;
    return {
      size,
      prefixSize,
      unitSize,
      prefixW,
      numberW: widest * size,
      unitW,
      unitUnder,
    };
  };
  const total = (l: Laid) => l.prefixW + l.numberW + l.unitW;
  const largest = (under: boolean): Laid | null => {
    for (let size = most; size >= least; size -= Math.max(1, size * 0.04)) {
      const laid = at(Math.round(size), under);
      if (total(laid) <= width) return laid;
    }
    return null;
  };
  // The unit beside the number while the number stays large; else under it.
  const beside = largest(false);
  const canGoUnder = Boolean(spec.unit) && !attached;
  if (beside && (beside.size >= least * 1.8 || !canGoUnder)) return beside;
  const under = canGoUnder ? largest(true) : null;
  return under ?? beside ?? at(least, canGoUnder);
}

/** One number's wheels: each digit a column that turns from `from` to its own digit; the rest set still. */
function wheels(
  text: string,
  fromText: string | null,
  x0: number,
  baseline: number,
  size: number,
  fill: string,
  delay: number,
): string {
  const lineH = size * 1.12;
  const digits = [...text];
  const fromDigits = fromText ? [...fromText.replace(/[^\d]/g, '')] : null;
  const ownDigits = digits.filter((ch) => /\d/.test(ch)).length;
  let x = x0;
  let k = 0;
  const out: string[] = [];
  digits.forEach((ch) => {
    if (!/\d/.test(ch)) {
      const w = markWidth(ch, size);
      out.push(
        `<text x="${r1(x + w / 2)}" y="${r1(baseline)}" font-size="${r1(size)}" font-weight="700" fill="${fill}" text-anchor="middle">${escapeXml(ch)}</text>`,
      );
      x += w;
      return;
    }
    const d = Number(ch);
    const fromRight = ownDigits - 1 - k;
    // Where this wheel starts: the old number's digit in the same place, or 0.
    const startAt =
      fromDigits && fromDigits.length - 1 - fromRight >= 0
        ? Number(fromDigits[fromDigits.length - 1 - fromRight])
        : 0;
    // The last wheels turn round once or twice more, as an odometer's do.
    const turns = Math.min(2, fromRight === 0 ? 2 : fromRight === 1 ? 1 : 0);
    const run: number[] = [];
    for (let v = startAt; ; v += 1) {
      run.push(v % 10);
      if (v >= startAt + turns * 10 && v % 10 === d) break;
      if (run.length > 40) break;
    }
    const cx = x + digitWidth(size) / 2;
    const n = run.length;
    const strip = run
      .map(
        (v, i) =>
          `<text x="${r1(cx)}" y="${r1(baseline - (n - 1 - i) * lineH)}" font-size="${r1(size)}" font-weight="700" fill="${fill}" text-anchor="middle">${v}</text>`,
      )
      .join('');
    out.push(
      n > 1
        ? `<g class="roll" style="--from:${r1((n - 1) * lineH)}px;${delayOf(delay)}">${strip}</g>`
        : strip,
    );
    x += digitWidth(size);
    k += 1;
  });
  return out.join('');
}

/** A counter, drawn: its number on wheels, what it counts, its source; and its later value as a state. */
export function renderCounter(
  spec: CounterSpec,
  shape: FilmShape = 'wide',
  text = TEXT_FLOOR,
): InfographicDrawing {
  const room = roomOf(shape);
  const colour = colourOr(spec.colour, PAPER.accent);
  const main = counterText(spec.value, spec.places);
  // A later number keeps its own figures: "8 billion" after "2.5 billion".
  const later =
    spec.then !== null
      ? counterText(
          spec.then,
          Math.min(3, (String(spec.then).split('.')[1] ?? '').length),
        )
      : null;
  const most = shape === 'tall' ? 230 : 250;
  const laid = layOut(
    later ? [main, later] : [main],
    spec,
    room.w * 0.94,
    most,
    text * 1.6,
  );
  const { size } = laid;
  const label = spec.label
    ? fitWords(
        spec.label,
        room.w * 0.9,
        text * 1.35,
        text,
        shape === 'tall' ? 3 : 2,
      )
    : null;
  const source = sourceText(spec.source);
  // Down the frame: the number's band, the unit under it if it must, the label, the source.
  const numberTop = 0;
  const baseline = numberTop + size * 0.92;
  const unitUnderH = laid.unitUnder ? laid.unitSize * 1.3 : 0;
  const labelTop =
    baseline + size * 0.2 + unitUnderH + (label ? text * 0.3 : 0);
  const labelH = label ? label.lines.length * label.size * 1.18 : 0;
  const sourceTop = labelTop + labelH;
  const height = sourceTop + (source ? sourceRoom(text) : text * 0.3);
  const width = room.w;
  const lineW = (t: string) => laid.prefixW + wheelsWidth(t, size) + laid.unitW;
  const lineX = (t: string) => (width - lineW(t)) / 2;
  const parts: Record<string, string> = {};
  const states: Record<string, string> = {};

  /** One number's line: its prefix, its wheels, its unit beside it. */
  const line = (t: string, from: string | null, delay: number) => {
    const x = lineX(t);
    const out: string[] = [];
    if (spec.prefix) {
      const sign = laid.prefixSize === size;
      out.push(
        `<text x="${r1(x)}" y="${r1(sign ? baseline : baseline - size * 0.05)}" font-size="${r1(laid.prefixSize)}" font-weight="700" fill="${sign ? colour : PAPER.muted}">${escapeXml(spec.prefix)}</text>`,
      );
    }
    out.push(wheels(t, from, x + laid.prefixW, baseline, size, colour, delay));
    if (spec.unit && !laid.unitUnder) {
      const attached = ATTACHED.test(spec.unit);
      const ux =
        x +
        laid.prefixW +
        wheelsWidth(t, size) +
        (attached ? size * 0.03 : size * 0.12);
      out.push(
        `<text x="${r1(ux)}" y="${r1(attached ? baseline - size * 0.02 : baseline)}" font-size="${r1(laid.unitSize)}" font-weight="700" fill="${attached ? colour : PAPER.ink}">${escapeXml(spec.unit)}</text>`,
      );
    }
    return out.join('');
  };

  const bandTop = baseline - size * 0.98;
  const bandH = size * 1.2;
  const out: string[] = [
    styleOf({
      roll: 'animation:ig-roll 1.7s cubic-bezier(.16,.7,.22,1) both',
      rise: 'animation:ig-rise .5s ease-out both',
      show: 'animation:ig-show .4s ease-out both',
      cover: 'animation:ig-show .2s ease-out both',
    }),
    // The window the wheels turn in: only the number's own line shows.
    `<defs><clipPath id="counter-window"><rect x="0" y="${r1(bandTop)}" width="${r1(width)}" height="${r1(bandH)}"/></clipPath></defs>`,
  ];
  parts.number = 'counter-number';
  out.push(
    `<g id="counter-number"><g clip-path="url(#counter-window)">${line(main, null, 0.25)}</g></g>`,
  );
  if (spec.unit && laid.unitUnder)
    out.push(
      `<g class="show" style="${delayOf(1.2)}">${textLines([spec.unit], width / 2, baseline + size * 0.18 + laid.unitSize, laid.unitSize, { fill: PAPER.ink })}</g>`,
    );
  if (label) {
    parts.label = 'counter-label';
    out.push(
      `<g id="counter-label"><g class="rise" style="${delayOf(1.1)}">${textLines(label.lines, width / 2, labelTop + label.size * 0.95, label.size, { weight: 600 })}</g></g>`,
    );
  }
  if (source) {
    parts.source = 'source';
    out.push(
      `<g class="show" style="${delayOf(1.6)}">${sourceLineSvg(source, width / 2, sourceTop + text * 1.45, width * 0.94, text)}</g>`,
    );
  }
  if (later) {
    // Its later value: the old number covered (no wider than the wider of
    // the two), its wheels turning on.
    const coverW = Math.max(lineW(main), lineW(later)) + size * 0.2;
    states[COUNTER_THEN] = 'counter-then';
    out.push(
      `<g id="counter-then"><rect class="cover" x="${r1((width - coverW) / 2)}" y="${r1(bandTop)}" width="${r1(coverW)}" height="${r1(bandH)}" fill="${PAPER.paper}"/>` +
        `<g clip-path="url(#counter-window)">${line(later, main, 0.05)}</g></g>`,
    );
  }
  const viewBox: [number, number, number, number] = [
    0,
    r1(bandTop - text * 0.2),
    width,
    r1(height - bandTop + text * 0.2),
  ];
  const svg = svgOf(viewBox, out.join(''));
  // Its ink measured with each wheel at its own digit only: the digits
  // turning above the window are cut by its clip, which the measure does
  // not see.
  const ink = svg.replace(
    /<g class="roll"[^>]*>((?:<text[^>]*>\d<\/text>)+)<\/g>/g,
    (_all, strip: string) => strip.match(/<text[^>]*>\d<\/text>/g)?.pop() ?? '',
  );
  return { svg, viewBox, parts, states, ink };
}
