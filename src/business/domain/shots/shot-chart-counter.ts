/**
 * A counter at full frame: one number, as large as the frame lets it be,
 * with what it counts under it and its source, set from a strong left
 * edge as a magazine sets a figure. The number is one text part,
 * `number`, holding its figures alone (grouped, in tabular figures, set
 * from its right edge), so the count recipe can roll it from any value
 * to its own without it moving; a currency sign or a word before it
 * (`prefix`), its unit (`unit`) and its caption (`label`) are parts of
 * their own.
 *
 * A counter that rolls on to a later value ("then") is drawn at its first
 * value, with room for the later one: the board counts on from one to the
 * other on the same part.
 */
import type {
  FilmShape,
  ShotBox,
  ShotLookDto,
  ShotSvgAssetDto,
} from '../../../contracts';
import { readCounter, type CounterDraft } from '../scene-counter';
import {
  ASCENT,
  PartBook,
  assetOf,
  bodyOf,
  extraOf,
  figuresWidth,
  fit,
  frameOf,
  grouped,
  linesBox,
  mainColour,
  paintOf,
  placesOf,
  sourceLine,
  sourceSvg,
  textSvg,
  union,
  wordsWidth,
  type Frame,
  wordsWithin,
} from './shot-chart-kit';

/** A prefix that is a sign or a currency, set beside the figures; any other ("about") is a word over them. */
const SIGN = /^[^\p{L}]{1,3}$|^(?:US\$|A\$|C\$|R\$|N|KSh|Rs|₹|₦|€|£|\$|¥)$/u;
/** A unit set against the figures ("%", "°C"); any other is a word after them, smaller. */
const ATTACHED = /^(?:%|°[CF]?|‰|x|×)$/;

/** The largest a counter's figures are set, as a share of the frame's height. */
const MOST = { wide: 0.56, tall: 0.3 } as const;

/** How a counter is laid out at one size of its figures. */
interface Laid {
  size: number;
  signW: number;
  unitSize: number;
  unitW: number;
  unitUnder: boolean;
  /** The number's line: sign, figures and a unit beside them. */
  width: number;
  kicker: { size: number; lines: string[] } | null;
  label: { size: number; lines: string[] } | null;
  /** The block's height, word over the figures to source under the label. */
  height: number;
}

interface Read {
  figures: string;
  /** The display face's figure width. */
  share: number;
  sign: string | null;
  word: string | null;
  unit: string | null;
  label: string | null;
  source: string | null;
}

function layAt(
  frame: Frame,
  read: Read,
  size: number,
  under: boolean,
  room: number,
): Laid {
  const attached = read.unit ? ATTACHED.test(read.unit) : false;
  const { label: floor, title } = frame.size;
  const signW = read.sign
    ? wordsWidth(read.sign, Math.max(floor, size * 0.6), 700, 'display') +
      size * 0.05
    : 0;
  const unitSize = read.unit
    ? attached
      ? Math.max(floor, size * 0.55)
      : under
        ? Math.max(floor, Math.min(title, size * 0.3))
        : Math.max(floor, size * 0.28)
    : 0;
  const unitW =
    read.unit && !under
      ? wordsWidth(read.unit, unitSize, 600, attached ? 'display' : 'text') +
        size * (attached ? 0.04 : 0.12)
      : 0;
  const kicker = read.word ? fit(read.word, room, floor, floor, 1, 600) : null;
  const label = read.label
    ? fit(
        read.label,
        frame.shape === 'tall' ? room : Math.min(room, frame.W * 0.62),
        frame.shape === 'tall' ? floor : title,
        floor,
        frame.shape === 'tall' ? 3 : 2,
        600,
      )
    : null;
  const height =
    (kicker ? kicker.size * 1.45 : 0) +
    size * 0.74 +
    (read.unit && under ? unitSize * 1.35 : 0) +
    (label
      ? Math.max(size * 0.16, floor * 0.6) +
        (label.lines.length - 1) * label.size * 1.15 +
        label.size * (ASCENT + 0.24)
      : 0) +
    (read.source ? frame.size.chip * 2.2 : 0);
  return {
    size,
    signW,
    unitSize,
    unitW,
    unitUnder: under,
    width: signW + figuresWidth(read.figures, size, read.share) + unitW,
    kicker,
    label,
    height,
  };
}

/**
 * The largest figures whose whole block fits the words' area: its line
 * across, its height down. A word unit goes under the figures when beside
 * them it would make them a quarter smaller.
 */
function layOut(frame: Frame, read: Read, room: number, band: number): Laid {
  const attached = read.unit ? ATTACHED.test(read.unit) : false;
  const largest = MOST[frame.shape] * frame.H;
  const least = frame.size.label * 1.2;
  const fitting = (under: boolean): Laid | null => {
    for (let s = largest; s >= least; s -= Math.max(1, s * 0.03)) {
      const laid = layAt(frame, read, s, under, room);
      if (laid.width <= room && laid.height <= band) return laid;
    }
    return null;
  };
  const beside = fitting(false);
  const under = read.unit && !attached ? fitting(true) : null;
  if (under && (!beside || under.size > beside.size * 1.25)) return under;
  return beside ?? under ?? layAt(frame, read, least, false, room);
}

/** A counter drawn to fill the frame, or null when it has no number. */
export function counterAsset(
  raw: Record<string, unknown>,
  look: ShotLookDto,
  shape: FilmShape,
): ShotSvgAssetDto | null {
  const extra = extraOf('counter', raw);
  // Its words kept whole within the lengths the reader keeps them to.
  const spec = readCounter(
    wordsWithin(bodyOf('counter', raw) as unknown as CounterDraft, {
      unit: 16,
      prefix: 12,
      label: 60,
    }),
    extra,
  );
  if (!spec) return null;
  const frame = frameOf(shape);
  const paint = paintOf(look);
  const book = new PartBook();
  const tall = shape === 'tall';
  const { text } = frame;
  const colour = mainColour(paint, spec.colour);
  const main = grouped(spec.value, spec.places);
  const later =
    spec.then !== null ? grouped(spec.then, placesOf(spec.then)) : null;
  const sign = spec.prefix && SIGN.test(spec.prefix) ? spec.prefix : null;
  const read: Read = {
    // Laid out for the wider of its values, so a later count fits where it is.
    figures:
      later && figuresWidth(later, 1) > figuresWidth(main, 1) ? later : main,
    share: paint.figure,
    sign,
    word: spec.prefix && !sign ? spec.prefix : null,
    unit: spec.unit,
    label: spec.label ?? (extra.name || null),
    source: sourceLine(spec.source),
  };
  // From the left edge of the words' area: a wide frame's a little in.
  const x = tall ? text.x0 : text.x0 + frame.W * 0.05;
  const room = text.x1 - x;
  const band = text.y1 - text.y0;
  const laid = layOut(frame, read, room, band);
  const S = laid.size;
  const attached = read.unit ? ATTACHED.test(read.unit) : false;
  // The block stands a little above the middle of the words' area.
  const middle = text.y0 + band * 0.47;
  let y = Math.max(
    text.y0,
    Math.min(text.y1 - laid.height, middle - laid.height / 2),
  );
  const out: string[] = [];
  const subject: ShotBox[] = [];
  if (laid.kicker) {
    const { size, lines } = laid.kicker;
    const base = y + size * ASCENT;
    const box = linesBox(lines, x, base, size, 'start', 1.15, 600);
    book.add('prefix', { box, role: 'muted' });
    out.push(
      textSvg(
        lines,
        x,
        base,
        { size, fill: paint.muted, family: paint.text, weight: 600 },
        'prefix',
      ),
    );
    subject.push(box);
    y += size * 1.45;
  }
  // The number's line: the sign, the figures to their right edge, the unit.
  const baseline = y + S * 0.74;
  const figuresW = figuresWidth(read.figures, S, paint.figure);
  const right = x + laid.signW + figuresW;
  if (sign) {
    const size = Math.max(frame.size.label, S * 0.6);
    const base = baseline - S * 0.14;
    const box = linesBox([sign], x, base, size, 'start', 1.15, 700, 'display');
    book.add('prefix', { box, role: colour.role });
    out.push(
      textSvg(
        [sign],
        x,
        base,
        { size, fill: colour.colour, family: paint.display },
        'prefix',
      ),
    );
    subject.push(box);
  }
  const numberBox: ShotBox = [
    right - figuresW,
    baseline - S * 0.72,
    figuresW,
    S * 0.74,
  ];
  book.add('number', { box: numberBox, value: spec.value, role: colour.role });
  out.push(
    textSvg(
      [main],
      right,
      baseline,
      {
        size: S,
        fill: colour.colour,
        family: paint.display,
        anchor: 'end',
        tabular: true,
      },
      'number',
    ),
  );
  subject.push(numberBox);
  y += S * 0.74;
  if (read.unit) {
    let ux: number;
    let uy: number;
    if (laid.unitUnder) {
      ux = x;
      uy = y + laid.unitSize * 1.1;
      y += laid.unitSize * 1.35;
    } else {
      ux = right + S * (attached ? 0.04 : 0.12);
      uy = attached ? baseline - S * 0.02 : baseline;
    }
    const weight = attached ? 700 : 600;
    const face = attached ? 'display' : 'text';
    const box = linesBox(
      [read.unit],
      ux,
      uy,
      laid.unitSize,
      'start',
      1.15,
      weight,
      face,
    );
    book.add('unit', { box, role: attached ? colour.role : 'ink' });
    out.push(
      textSvg(
        [read.unit],
        ux,
        uy,
        {
          size: laid.unitSize,
          fill: attached ? colour.colour : paint.ink,
          family: attached ? paint.display : paint.text,
          weight,
        },
        'unit',
      ),
    );
    subject.push(box);
  }
  const focal: ShotBox[] = [...subject];
  if (laid.label) {
    const { size, lines } = laid.label;
    y += Math.max(S * 0.16, frame.size.label * 0.6);
    const base = y + size * ASCENT;
    const box = linesBox(lines, x, base, size, 'start', 1.15, 600);
    book.add('label', { box, role: 'ink' });
    out.push(
      textSvg(
        lines,
        x,
        base,
        { size, fill: paint.ink, family: paint.text, weight: 600 },
        'label',
      ),
    );
    focal.push(box);
    y = box[1] + box[3];
  }
  if (read.source)
    out.push(
      sourceSvg(
        book,
        paint,
        frame,
        read.source,
        x,
        y + frame.size.chip * 1.9,
        room,
      ).svg,
    );
  return assetOf(frame, paint, out.join(''), book, union(...focal));
}
