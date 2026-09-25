import { SIGNS, sayLatex } from './maths-speech';
/**
 * What the voice is handed, as against what the reader sees.
 *
 * The rented voice reads a page the way a stranger reads it off a slide:
 * "CNS" as a word, "1998–99" as a mumble, "Trypanosoma brucei" as a guess.
 * A listener who hears that stops trusting the lecturer. The voice takes
 * no phonetic markup, so the one lever is the text itself, and this module
 * rewrites the spoken text only, never the script on screen or the board.
 *
 * Three kinds of rewrite, in this order: a school's own pronunciation
 * list, one word for one word; abbreviations said as letters; numbers,
 * years, units and symbols said as words. Every original word keeps a
 * record of which spoken words it became, so the follow-along, which
 * aligns the audio to the words the reader sees, can be mapped back.
 */

/** A school's kept pronunciations: the word as written, lower-cased, to how it is said. */
export type Pronunciations = ReadonlyMap<string, string>;

export interface SpokenForm {
  /** The text the voice is given. */
  text: string;
  /** For each word of the original (whitespace-split), the half-open range of spoken words it became. */
  spans: [number, number][];
}

/** Acronyms said as a word, not letter by letter. */
const SAID_AS_WORDS = new Set([
  'AIDS',
  'SARS',
  'MERS',
  'COVID',
  'NASA',
  'UNICEF',
  'UNESCO',
  'NATO',
  'LASER',
  'RADAR',
  'SCUBA',
  'ELISA',
  'CRISPR',
  'NSAID',
  'NSAIDS',
  'ACE',
  'ARB',
  'ARBS',
  'GERD',
  'COPD',
  'ICU',
]);

/** Abbreviations said as letters even though a dictionary could read them as words. */
const ALWAYS_LETTERS = new Set(['ACE', 'ARB', 'ARBS', 'COPD', 'ICU']);

const SHORT_FORMS: Record<string, string> = {
  'e.g.': 'for example',
  'i.e.': 'that is',
  'etc.': 'et cetera',
  'vs.': 'versus',
  vs: 'versus',
  'cf.': 'compare',
  'approx.': 'approximately',
  '&': 'and',
  '→': 'to',
  '±': 'plus or minus',
  '≥': 'at least',
  '≤': 'at most',
  'Fig.': 'figure',
  'fig.': 'figure',
  'Figs.': 'figures',
  'Tbl.': 'table',
  'Ch.': 'chapter',
  'ch.': 'chapter',
  'Sec.': 'section',
  'sec.': 'section',
  'Eq.': 'equation',
  'eq.': 'equation',
  'No.': 'number',
  'no.': 'number',
  'p.': 'page',
  'pp.': 'pages',
  '°C': 'degrees Celsius',
  '°F': 'degrees Fahrenheit',
  '%': 'percent',
};

/** Units that follow a number, said in full. */
/**
 * Units that are only ever said under a slash. On their own, "s" is a
 * plural and "m" is a metre or a minute depending on the page, so a
 * glued "1970s" must not become a count of seconds.
 */
const PER_UNITS: Record<string, [string, string]> = {
  s: ['second', 'seconds'],
  m: ['minute', 'minutes'],
  y: ['year', 'years'],
  yr: ['year', 'years'],
  d: ['day', 'days'],
  wk: ['week', 'weeks'],
  mo: ['month', 'months'],
};

const UNITS: Record<string, [string, string]> = {
  mg: ['milligram', 'milligrams'],
  g: ['gram', 'grams'],
  kg: ['kilogram', 'kilograms'],
  mcg: ['microgram', 'micrograms'],
  µg: ['microgram', 'micrograms'],
  ug: ['microgram', 'micrograms'],
  ng: ['nanogram', 'nanograms'],
  ml: ['millilitre', 'millilitres'],
  mL: ['millilitre', 'millilitres'],
  l: ['litre', 'litres'],
  L: ['litre', 'litres'],
  dl: ['decilitre', 'decilitres'],
  dL: ['decilitre', 'decilitres'],
  mmol: ['millimole', 'millimoles'],
  mol: ['mole', 'moles'],
  mm: ['millimetre', 'millimetres'],
  cm: ['centimetre', 'centimetres'],
  km: ['kilometre', 'kilometres'],
  mmHg: ['millimetre of mercury', 'millimetres of mercury'],
  kPa: ['kilopascal', 'kilopascals'],
  h: ['hour', 'hours'],
  hr: ['hour', 'hours'],
  hrs: ['hours', 'hours'],
  min: ['minute', 'minutes'],
  ms: ['millisecond', 'milliseconds'],
  bpm: ['beat per minute', 'beats per minute'],
  IU: ['international unit', 'international units'],
  '%': ['percent', 'percent'],
};

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];
const ORDINALS: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  four: 'fourth',
  five: 'fifth',
  six: 'sixth',
  seven: 'seventh',
  eight: 'eighth',
  nine: 'ninth',
  ten: 'tenth',
  eleven: 'eleventh',
  twelve: 'twelfth',
  twenty: 'twentieth',
  thirty: 'thirtieth',
  forty: 'fortieth',
  fifty: 'fiftieth',
  sixty: 'sixtieth',
  seventy: 'seventieth',
  eighty: 'eightieth',
  ninety: 'ninetieth',
  hundred: 'hundredth',
  thousand: 'thousandth',
};

function belowThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) {
    if (hundreds) parts.push('and');
    parts.push(
      rest < 20
        ? ONES[rest]
        : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ''}`,
    );
  }
  return parts.join(' ');
}

/** A whole number as words: 45000 is "forty-five thousand". */
export function cardinal(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value < 0) return `minus ${cardinal(-value)}`;
  if (value === 0) return 'zero';
  const scales: [number, string][] = [
    [1_000_000_000_000, 'trillion'],
    [1_000_000_000, 'billion'],
    [1_000_000, 'million'],
    [1_000, 'thousand'],
  ];
  const parts: string[] = [];
  let rest = Math.floor(value);
  for (const [size, name] of scales) {
    const count = Math.floor(rest / size);
    if (count) {
      parts.push(`${belowThousand(count)} ${name}`);
      rest %= size;
    }
  }
  if (rest) {
    if (parts.length && rest < 100) parts.push('and');
    parts.push(belowThousand(rest));
  }
  return parts.join(' ');
}

/** A year as it is said: 1998 is "nineteen ninety-eight", 2005 "two thousand and five", 2010 "twenty ten". */
export function year(value: number): string {
  if (value < 1000 || value > 2099) return cardinal(value);
  const century = Math.floor(value / 100);
  const rest = value % 100;
  if (value >= 2000 && value < 2010) {
    return rest ? `two thousand and ${ONES[rest]}` : 'two thousand';
  }
  if (rest === 0) return `${belowThousand(century)} hundred`;
  const tail = rest < 10 ? `oh ${ONES[rest]}` : belowThousand(rest);
  return `${belowThousand(century)} ${tail}`;
}

/** The digits of a number as words, with a decimal point read out. */
export function numberWords(raw: string): string {
  const clean = raw.replace(/,/g, '');
  if (/^\d+\.\d+$/.test(clean)) {
    const [whole, fraction] = clean.split('.');
    return `${cardinal(Number(whole))} point ${[...fraction].map((d) => ONES[Number(d)]).join(' ')}`;
  }
  if (/^\.\d+$/.test(clean)) {
    return `zero point ${[...clean.slice(1)].map((d) => ONES[Number(d)]).join(' ')}`;
  }
  return cardinal(Number(clean));
}

/** A four-digit figure from 1500 to 2099 with no comma reads as a year. */
const looksLikeYear = (raw: string) =>
  /^\d{4}$/.test(raw) && Number(raw) >= 1500 && Number(raw) <= 2099;

function ordinal(words: string): string {
  const parts = words.split(/(\s|-)/);
  const last = parts[parts.length - 1];
  parts[parts.length - 1] =
    ORDINALS[last] ??
    (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return parts.join('');
}

/**
 * One written word as the voice should say it, or null to leave it. The
 * word arrives with its punctuation; the punctuation is kept around the
 * spoken words so pauses fall where the writer put them.
 */
function sayWord(word: string, next: string | undefined): string | null {
  const lead = word.match(/^[("'“‘[]+/)?.[0] ?? '';
  // A short form keeps its own full stops: "e.g.," is "e.g." then a comma.
  const stem = word.slice(lead.length).replace(/[)"'”’\],;:!?]+$/, '');
  const stemTrail = word.slice(lead.length + stem.length);
  if (SHORT_FORMS[stem] || SHORT_FORMS[stem.toLowerCase()]) {
    return `${lead}${SHORT_FORMS[stem] ?? SHORT_FORMS[stem.toLowerCase()]}${stemTrail}`;
  }
  if (/^[A-Z]\.[a-z]\.$/.test(stem)) {
    return `${lead}${stem[0]} ${stem[2].toUpperCase()}${stemTrail}`;
  }
  if (/^[A-Z]\.$/.test(stem) && next && /^[A-Za-z]/.test(next)) {
    return `${lead}${stem[0]}${stemTrail}`;
  }
  const trail = word.match(/[)"'”’\].,;:!?]+$/)?.[0] ?? '';
  const core = word.slice(lead.length, word.length - trail.length);
  if (!core) return null;
  const said = sayCore(core, next);
  if (said === null) return null;
  return `${lead}${said}${trail}`;
}

/** A unit as it is said under a slash, from either table. */
const denom = (unit: string): [string, string] | undefined =>
  UNITS[unit] ?? PER_UNITS[unit];

function sayCore(core: string, next: string | undefined): string | null {
  const nextCore = next?.replace(/[)"'”’\].,;:!?]+$/, '') ?? '';

  // Fixed short forms and symbols.
  if (SHORT_FORMS[core]) return SHORT_FORMS[core];
  if (SHORT_FORMS[core.toLowerCase()]) return SHORT_FORMS[core.toLowerCase()];

  // "T.b." and "T." before a name: letters.
  if (/^[A-Z]\.[a-z]\.$/.test(core))
    return `${core[0]} ${core[2].toUpperCase()}`;
  if (/^[A-Z]\.$/.test(core)) return core[0];

  // An abbreviation of two to five capitals, said as letters unless it is
  // one people say as a word.
  const bare = core.replace(/s$/, '');
  if (/^[A-Z]{2,5}$/.test(bare) || /^[A-Z]{2,5}s$/.test(core)) {
    if (SAID_AS_WORDS.has(core) && !ALWAYS_LETTERS.has(core)) return null;
    const letters = [...bare].join(' ');
    return core.endsWith('s') && !/^[A-Z]+$/.test(core)
      ? `${letters}s`
      : letters;
  }

  // A year range: 1998–99 is "nineteen ninety-eight to ninety-nine", 1978-1980 both years in full.
  const range = core.match(/^(\d{4})[-–—](\d{2}|\d{4})$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(
      range[2].length === 4 ? range[2] : range[1].slice(0, 2) + range[2],
    );
    if (!looksLikeYear(range[1])) return `${cardinal(from)} to ${cardinal(to)}`;
    if (range[2].length === 2) {
      const rest = to % 100;
      return `${year(from)} to ${rest < 10 ? `oh ${ONES[rest]}` : belowThousand(rest)}`;
    }
    return `${year(from)} to ${year(to)}`;
  }

  // A range of numbers: 10-20, 5–10.
  const span = core.match(/^(\d+(?:\.\d+)?)[-–—](\d+(?:\.\d+)?)$/);
  if (span) return `${numberWords(span[1])} to ${numberWords(span[2])}`;

  // "10-fold", "3-day", "2-hour": the number said, the word kept.
  const hyphenated = core.match(/^(\d+(?:\.\d+)?)-([a-zA-Z]+)$/);
  if (hyphenated) {
    const said = numberWords(hyphenated[1]);
    return hyphenated[2] === 'fold'
      ? `${said}fold`
      : `${said}-${hyphenated[2]}`;
  }

  // A range that carries its unit: 5-10%, 5-10mg.
  const spanUnit = core.match(
    /^(\d+(?:\.\d+)?)[-–—](\d+(?:\.\d+)?)(%|°C|°F|[a-zA-Zµ]+)$/,
  );
  if (spanUnit && (UNITS[spanUnit[3]] || SHORT_FORMS[spanUnit[3]])) {
    const unit = UNITS[spanUnit[3]];
    const said = unit ? unit[1] : SHORT_FORMS[spanUnit[3]];
    return `${numberWords(spanUnit[1])} to ${numberWords(spanUnit[2])} ${said}`;
  }

  // One number over another: a blood pressure, a ratio written as a
  // fraction. "120/80" is read the way a clinician says it.
  const over = core.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (over) return `${numberWords(over[1])} over ${numberWords(over[2])}`;

  // A ratio with a colon, only in the plain forms where it cannot be a
  // clock time: 3:1, 1:4.
  const ratio = core.match(/^(\d{1,3}):(\d{1,3})$/);
  if (ratio && (ratio[1] === '1' || ratio[2] === '1'))
    return `${numberWords(ratio[1])} to ${numberWords(ratio[2])}`;

  // A compound unit: mg/dL, mL/min, km/h. Said as one per the other.
  const per = core.match(/^([a-zA-Zµ]+)\/([a-zA-Zµ]+)$/);
  if (per && UNITS[per[1]] && denom(per[2])) {
    return `${UNITS[per[1]][1]} per ${denom(per[2])![0]}`;
  }

  // A number glued to a compound unit: 5mg/dL.
  const gluedPer = core.match(/^(\d+(?:[.,]\d+)*)([a-zA-Zµ]+)\/([a-zA-Zµ]+)$/);
  if (gluedPer && UNITS[gluedPer[2]] && denom(gluedPer[3])) {
    const value = Number(gluedPer[1].replace(/,/g, ''));
    const top = value === 1 ? UNITS[gluedPer[2]][0] : UNITS[gluedPer[2]][1];
    return `${numberWords(gluedPer[1])} ${top} per ${denom(gluedPer[3])![0]}`;
  }

  // A chemical formula: letters as letters, the counts as numbers, so
  // H2O is "H two O" and CO2 is "C O two". Never a word nobody says.
  if (
    /^(?:[A-Z][a-z]?\d*){2,6}$/.test(core) &&
    /\d/.test(core) &&
    core.length <= 9
  ) {
    const said = [...core.matchAll(/([A-Z][a-z]?)(\d*)/g)]
      .flatMap(([, element, count]) => [
        element.length === 2 ? element : element,
        count ? cardinal(Number(count)) : '',
      ])
      .filter(Boolean);
    return said.join(' ');
  }

  // A number glued to its unit or sign: 5mg, 37.5°C, 10%.
  const glued = core.match(/^(\d+(?:[.,]\d+)*)(%|°C|°F|[a-zA-Zµ]+)$/);
  if (glued && (UNITS[glued[2]] || SHORT_FORMS[glued[2]])) {
    const value = Number(glued[1].replace(/,/g, ''));
    const unit = UNITS[glued[2]];
    const unitSaid = unit
      ? value === 1
        ? unit[0]
        : unit[1]
      : SHORT_FORMS[glued[2]];
    return `${numberWords(glued[1])} ${unitSaid}`;
  }

  // A decade: 1970s is "nineteen seventies", 2000s "two thousands".
  const decade = core.match(/^(\d{3})0s$/);
  if (decade && looksLikeYear(`${decade[1]}0`)) {
    const said = year(Number(`${decade[1]}0`));
    return said.endsWith('hundred')
      ? `${said}s`
      : said.endsWith('thousand')
        ? `${said}s`
        : said.replace(/y$/, 'ies');
  }

  // An ordinal: 1st, 2nd, 3rd, 21st.
  const ord = core.match(/^(\d+)(st|nd|rd|th)$/);
  if (ord) return ordinal(cardinal(Number(ord[1])));

  // A plain number, a year, a decimal, with commas or without.
  if (
    /^\d{1,3}(,\d{3})+$/.test(core) ||
    /^\d+$/.test(core) ||
    /^\d*\.\d+$/.test(core)
  ) {
    if (looksLikeYear(core)) return year(Number(core));
    const said = numberWords(core);
    // A unit as the next word: "5 mg" is "five milligrams".
    if (nextCore && UNITS[nextCore]) return said;
    return said;
  }

  return null;
}

/** A unit word after a number is said in full; on its own it is left alone. */
function sayUnitAfterNumber(
  word: string,
  previous: string | undefined,
): string | null {
  if (!previous) return null;
  const prevCore = previous
    .replace(/^[("'“‘[]+/, '')
    .replace(/[)"'”’\].,;:!?]+$/, '');
  if (!/^\d/.test(prevCore)) return null;
  const lead = word.match(/^[("'“‘[]+/)?.[0] ?? '';
  const trail = word.match(/[)"'”’\].,;:!?]+$/)?.[0] ?? '';
  const core = word.slice(lead.length, word.length - trail.length);
  const unit = UNITS[core];
  if (!unit) return null;
  const value = Number(prevCore.replace(/[^\d.]/g, ''));
  return `${lead}${value === 1 ? unit[0] : unit[1]}${trail}`;
}

/**
 * The spoken form of a script, with the map back to its written words.
 * A pronunciation entry matches a written word with its punctuation
 * stripped, case-insensitively, and replaces the word alone; the entry's
 * spoken form may be several words, which the map records.
 */
export function spokenForm(
  text: string,
  pronunciations: Pronunciations = new Map(),
): SpokenForm {
  const words = text.match(/\S+/g) ?? [];
  const out: string[] = [];
  const spans: [number, number][] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const start = out.length;
    // Maths between dollar signs, however many words it runs to, is said
    // as maths: its first written word takes all the spoken words, and
    // the rest of it none.
    if (/^\$/.test(word)) {
      let end = i;
      while (
        end < words.length - 1 &&
        !/\$[.,;:!?)]*$/.test(words[end].slice(end === i ? 1 : 0))
      )
        end += 1;
      const run = words.slice(i, end + 1).join(' ');
      const tex = /^\$\$?([\s\S]*?)\$\$?([.,;:!?)]*)$/.exec(run);
      if (tex && tex[1].trim()) {
        const said = `${sayLatex(tex[1])}${tex[2]}`.match(/\S+/g) ?? [word];
        out.push(...said);
        spans.push([start, out.length]);
        for (let k = i + 1; k <= end; k += 1)
          spans.push([out.length, out.length]);
        i = end;
        continue;
      }
    }
    // A sign on its own, and a power written on a word: "=", "x²".
    const sign = SIGNS[word];
    if (sign) {
      out.push(...sign.split(' '));
      spans.push([start, out.length]);
      continue;
    }
    const power = /^([\p{L}\d]+)([²³])([.,;:!?)]*)$/u.exec(word);
    if (power) {
      out.push(
        power[1],
        `${power[2] === '²' ? 'squared' : 'cubed'}${power[3]}`,
      );
      spans.push([start, out.length]);
      continue;
    }
    const lead = word.match(/^[("'“‘[]+/)?.[0] ?? '';
    const trail = word.match(/[)"'”’\].,;:!?]+$/)?.[0] ?? '';
    const core = word.slice(lead.length, word.length - trail.length);
    const listed = pronunciations.get(core.toLowerCase());
    let said: string | null = null;
    if (listed) {
      said = `${lead}${listed}${trail}`;
    } else {
      said =
        sayUnitAfterNumber(word, words[i - 1]) ?? sayWord(word, words[i + 1]);
    }
    const pieces = (said ?? word).match(/\S+/g) ?? [word];
    out.push(...pieces);
    spans.push([start, out.length]);
  }
  return { text: out.join(' '), spans };
}

/**
 * Word timings measured on the spoken text, mapped back to the written
 * words: each written word takes the span of the spoken words it became.
 * Both texts are read as whitespace-split words, and the character
 * offsets returned are into the written text, which is what the reader
 * sees and the follow-along highlights.
 */
export function remapAligned(
  aligned: {
    text: string;
    startMs: number;
    endMs: number;
    charStart: number;
    charEnd: number;
  }[],
  spoken: SpokenForm,
  written: string,
): {
  text: string;
  startMs: number;
  endMs: number;
  charStart: number;
  charEnd: number;
}[] {
  // Which spoken word each aligned entry belongs to, by its character range in the spoken text.
  const spokenWords: { start: number; end: number }[] = [];
  const pattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(spoken.text)) !== null) {
    spokenWords.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  const timesBySpoken: ({ startMs: number; endMs: number } | null)[] =
    spokenWords.map(() => null);
  let cursor = 0;
  for (let i = 0; i < spokenWords.length; i += 1) {
    const { start, end } = spokenWords[i];
    while (cursor < aligned.length && aligned[cursor].charEnd <= start)
      cursor += 1;
    const hit = aligned[cursor];
    if (hit && hit.charStart <= start && hit.charEnd >= end - 1) {
      timesBySpoken[i] = { startMs: hit.startMs, endMs: hit.endMs };
    }
  }

  const out: {
    text: string;
    startMs: number;
    endMs: number;
    charStart: number;
    charEnd: number;
  }[] = [];
  const writtenPattern = /\S+/g;
  let index = 0;
  while ((match = writtenPattern.exec(written)) !== null) {
    const span = spoken.spans[index];
    index += 1;
    if (!span) break;
    const covered = timesBySpoken.slice(span[0], span[1]).filter(Boolean) as {
      startMs: number;
      endMs: number;
    }[];
    if (!covered.length) continue;
    out.push({
      text: match[0],
      startMs: Math.min(...covered.map((t) => t.startMs)),
      endMs: Math.max(...covered.map((t) => t.endMs)),
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }
  return out;
}
