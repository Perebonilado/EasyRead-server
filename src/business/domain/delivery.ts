/**
 * How a page is handed to a voice that answers to pace, weight and
 * silence, and to nothing else.
 *
 * The lecture already knows where a moment matters: the writer places a
 * [pause] where the listener is meant to think, the figures are in the
 * text, and the plan says which page opens a chapter and which lands it.
 * This turns those into pieces: runs of sentences said at one pace, with
 * a silence after each. A figure's sentence and a chapter's landing
 * sentence go a little slower and the figure itself carries stress; the
 * clause that joins a page to the last goes a little quicker; a [pause]
 * becomes a held silence, longer for a slow learner than a quick one.
 * Everything else is said plain, at the style's pace, which is what makes
 * the marked moments land.
 */
import type { LectureStyle } from '../../contracts';

export interface DeliveryPiece {
  /** The words, with Kokoro's stress mark around a phrase that carries weight. */
  text: string;
  speed: number;
  /** Silence after the piece, in seconds. */
  pauseAfter: number;
}

export interface DeliveryInput {
  /**
   * The spoken form of the page, cut at each [pause] the writer placed:
   * one entry per stretch between pauses, each already through
   * `scriptForTts` and `spokenForm`, paragraphs still separated by a
   * blank line.
   */
  stretches: string[];
  style: LectureStyle;
  /** A page after the chapter's first: its opening join goes quicker. */
  midChapter: boolean;
  /** The chapter's last page: its last sentence lands slower. */
  landing: boolean;
  /** The phrases the writer said a listener should catch, one per section at most. */
  emphasis?: string[] | null;
}

/** The delivery a style gets: how long it holds, how far it slows, how much it quickens. */
export interface DeliveryTuning {
  /** A [pause] as a held silence, in seconds. */
  hold: number;
  /** A held silence beyond the second on a page, so a page never stalls. */
  breath: number;
  /** The pace of a figure's sentence and a landing sentence, against the style's. */
  slow: number;
  /** The pace of an opening join, against the style's. */
  quick: number;
}

export const DELIVERY: Record<LectureStyle, DeliveryTuning> = {
  gentle: { hold: 1.0, breath: 0.35, slow: 0.93, quick: 1.03 },
  steady: { hold: 0.75, breath: 0.3, slow: 0.93, quick: 1.04 },
  brisk: { hold: 0.5, breath: 0.25, slow: 0.95, quick: 1.04 },
};

/** Silence between paragraphs inside a stretch, the breath the voice took on its own before. */
export const PARAGRAPH_BREATH = 0.25;
/** Held silences a page may carry at its full length: the turn and one ask. */
const HOLDS_PER_PAGE = 2;
/** What goes into an audio file's name, so a change here voices every page again. */
export const DELIVERY_VERSION = 'delivery-1';

const NUMBER_WORDS = new Set([
  'zero',
  'nought',
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
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'million',
  'billion',
  'trillion',
  'half',
  'quarter',
  'third',
  'thirds',
  'quarters',
  'point',
  // decades and rounds, as the spoken form says them
  'twenties',
  'thirties',
  'forties',
  'fifties',
  'sixties',
  'seventies',
  'eighties',
  'nineties',
  'hundreds',
  'thousands',
  'millions',
  'billions',
]);
/** Words that join number words inside one figure: "two thousand and five". */
const JOINERS = new Set(['and']);
const DECADES = new Set([
  'twenties',
  'thirties',
  'forties',
  'fifties',
  'sixties',
  'seventies',
  'eighties',
  'nineties',
]);
const CENTURIES = new Set([
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
]);
const BIG = new Set(['hundred', 'thousand', 'million', 'billion', 'trillion']);
/** What a number is counted in, said after it. */
const UNIT_WORDS = new Set([
  'percent',
  'per',
  'cent',
  'times',
  'fold',
  'years',
  'year',
  'months',
  'month',
  'weeks',
  'week',
  'days',
  'day',
  'hours',
  'hour',
  'minutes',
  'minute',
  'seconds',
  'second',
  'milligrams',
  'milligram',
  'grams',
  'gram',
  'kilograms',
  'kilogram',
  'micrograms',
  'microgram',
  'litres',
  'litre',
  'millilitres',
  'millilitre',
  'metres',
  'metre',
  'centimetres',
  'kilometres',
  'degrees',
  'cases',
  'people',
  'patients',
  'deaths',
  'births',
  'doses',
  'dose',
  'millimoles',
  'moles',
  'units',
  'beats',
  'kilos',
  'pounds',
  'dollars',
  'naira',
  'cells',
  'species',
  'countries',
  'million',
  'billion',
]);
const CLEAN = /^[^a-z0-9]*([a-z0-9][a-z0-9'-]*)?[^a-z0-9]*$/i;

/** Whether a token ends a clause or a sentence, so a run stops at it. */
const closes = (token: string): boolean => /[,;:.!?)\]…—–]$/.test(token);

const bare = (token: string): string =>
  (CLEAN.exec(token)?.[1] ?? '').toLowerCase();

const isNumberWord = (token: string): boolean => {
  const word = bare(token);
  if (!word) return false;
  if (/^\d/.test(word)) return true;
  if (/\d/.test(word)) return true;
  // "nineteen oh five": the oh is part of the year.
  if (word === 'oh') return true;
  if (word.endsWith('fold') && NUMBER_WORDS.has(word.slice(0, -4))) return true;
  return word.split('-').every((part) => NUMBER_WORDS.has(part));
};

/**
 * Whether a run of number words is a date: a decade, or a year the way
 * the spoken form says one ("nineteen ninety-eight", "two thousand and
 * five", "twenty ten"). A date is context, not the figure: it is said
 * plain.
 */
function isDate(words: string[]): boolean {
  if (words.some((word) => DECADES.has(word))) return true;
  if (words[0] === 'two' && words[1] === 'thousand') return true;
  if (words.length >= 2 && CENTURIES.has(words[0])) {
    const next = words[1];
    return (
      next === 'hundred' ||
      next === 'oh' ||
      next.split('-').every((part) => NUMBER_WORDS.has(part))
    );
  }
  return false;
}

/**
 * The runs of number words in a sentence that count something, with the
 * unit said after each, as token index ranges. A run of everyday words
 * alone ("one of them", "half the class") is not a figure, and neither
 * is a date; a big number, a digit, two number words together, or a
 * number with its unit is.
 */
export function figureRuns(tokens: string[]): [number, number][] {
  const runs: [number, number][] = [];
  let index = 0;
  while (index < tokens.length) {
    if (!isNumberWord(tokens[index])) {
      index += 1;
      continue;
    }
    let end = index;
    // A run never crosses a comma or a clause: "the seventies, cases" is
    // a decade and then a word, not a figure with its unit.
    while (end + 1 < tokens.length && !closes(tokens[end])) {
      if (isNumberWord(tokens[end + 1])) {
        end += 1;
      } else if (
        JOINERS.has(bare(tokens[end + 1])) &&
        end + 2 < tokens.length &&
        isNumberWord(tokens[end + 2])
      ) {
        end += 2;
      } else {
        break;
      }
    }
    let withUnit = end;
    if (
      withUnit + 1 < tokens.length &&
      !closes(tokens[withUnit]) &&
      UNIT_WORDS.has(bare(tokens[withUnit + 1]))
    ) {
      withUnit += 1;
      // "per cent", "per hundred thousand": the unit's own words.
      if (bare(tokens[withUnit]) === 'per') {
        while (
          withUnit + 1 < tokens.length &&
          !closes(tokens[withUnit]) &&
          (UNIT_WORDS.has(bare(tokens[withUnit + 1])) ||
            isNumberWord(tokens[withUnit + 1]))
        ) {
          withUnit += 1;
        }
      }
    }
    const words = tokens.slice(index, end + 1).map(bare);
    const counts =
      !isDate(words) &&
      (words.some(
        (word) => /\d/.test(word) || BIG.has(word) || word.endsWith('fold'),
      ) ||
        words.length >= 2 ||
        withUnit > end);
    if (counts) runs.push([index, withUnit]);
    index = withUnit + 1;
  }
  return runs;
}

/** The words of a sentence, a dash or an ellipsis standing on its own so a number beside it is still seen. */
const tokenize = (sentence: string): string[] =>
  sentence
    .replace(/([—–…])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);

/** Whether a sentence carries a figure: a number the listener is meant to catch. */
export function hasFigure(sentence: string): boolean {
  return figureRuns(tokenize(sentence)).length > 0;
}

/** Kokoro's stress mark around a phrase: said with more weight, the words unchanged. */
const stressed = (phrase: string): string => `[${phrase}](+1)`;

/**
 * The sentence with its figures stressed, and the writer's phrase where it
 * appears and is not already inside a figure. A stressed phrase keeps its
 * punctuation outside the mark, so the voice still reads the sentence's
 * shape from it.
 */
export function stressSentence(
  sentence: string,
  emphasis: string[] = [],
): string {
  const tokens = tokenize(sentence);
  const runs = figureRuns(tokens);
  const inRun = new Set<number>();
  for (const [from, to] of runs)
    for (let i = from; i <= to; i += 1) inRun.add(i);

  // The writer's phrase, as a token range, when its words appear in order
  // and none of them is already a figure.
  const phraseRuns: [number, number][] = [];
  const lowered = tokens.map(bare);
  for (const phrase of emphasis) {
    const words = phrase.split(/\s+/).map(bare).filter(Boolean);
    if (!words.length || words.length > 6) continue;
    for (let start = 0; start + words.length <= tokens.length; start += 1) {
      const fits = words.every((word, k) => lowered[start + k] === word);
      if (!fits) continue;
      const clear = words.every((_, k) => !inRun.has(start + k));
      if (clear) {
        phraseRuns.push([start, start + words.length - 1]);
        for (let k = 0; k < words.length; k += 1) inRun.add(start + k);
      }
      break;
    }
  }

  const marks = [...runs, ...phraseRuns].sort((a, b) => a[0] - b[0]);
  if (!marks.length) return sentence;
  const out: string[] = [];
  let cursor = 0;
  for (const [from, to] of marks) {
    for (let i = cursor; i < from; i += 1) out.push(tokens[i]);
    const words = tokens.slice(from, to + 1);
    // Punctuation that closes the last word stays outside the mark.
    const last = words[words.length - 1];
    const trailing = /[^a-z0-9%]+$/i.exec(last)?.[0] ?? '';
    words[words.length - 1] = trailing ? last.slice(0, -trailing.length) : last;
    const leading = /^[^a-z0-9]+/i.exec(words[0])?.[0] ?? '';
    words[0] = leading ? words[0].slice(leading.length) : words[0];
    out.push(`${leading}${stressed(words.join(' '))}${trailing}`);
    cursor = to + 1;
  }
  for (let i = cursor; i < tokens.length; i += 1) out.push(tokens[i]);
  return out.join(' ');
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** Sentences of one paragraph, split where a sentence ends. */
const sentencesIn = (paragraph: string): string[] =>
  paragraph
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/**
 * The page as pieces, in order, for the voice to say and join.
 *
 * Sentences that share a pace and have no silence between them are one
 * piece, so the voice keeps its line through them. Two slowed sentences
 * never run together: the second is said at pace.
 */
export function deliveryPieces(input: DeliveryInput): DeliveryPiece[] {
  const tuning = DELIVERY[input.style];
  const base = STYLE_SPEED[input.style];
  const emphasis = (input.emphasis ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const pieces: DeliveryPiece[] = [];
  let holds = 0;
  let firstSentence = true;
  let lastSlowed = false;

  const stretches = input.stretches
    .map((stretch) => stretch.trim())
    .filter(Boolean);
  const sentenceCount = stretches.reduce(
    (count, stretch) =>
      count +
      stretch
        .split(/\n{2,}/)
        .reduce((n, paragraph) => n + sentencesIn(paragraph).length, 0),
    0,
  );
  let seen = 0;

  const push = (text: string, speed: number, pauseAfter: number) => {
    const last = pieces[pieces.length - 1];
    if (last && last.speed === speed && last.pauseAfter === 0) {
      last.text = `${last.text} ${text}`;
      last.pauseAfter = pauseAfter;
      return;
    }
    pieces.push({ text, speed, pauseAfter });
  };

  stretches.forEach((stretch, stretchIndex) => {
    const paragraphs = stretch
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const sentences = sentencesIn(paragraph);
      sentences.forEach((sentence, sentenceIndex) => {
        seen += 1;
        const isLast = seen === sentenceCount;
        const figure = hasFigure(sentence);
        const landing = input.landing && isLast;
        const join = firstSentence && input.midChapter;
        firstSentence = false;

        let factor = 1;
        if ((figure || landing) && !lastSlowed) factor = tuning.slow;
        else if (join && !figure) factor = tuning.quick;
        lastSlowed = factor === tuning.slow;

        const text =
          figure || emphasis.length
            ? stressSentence(sentence, emphasis)
            : sentence;
        const endOfParagraph = sentenceIndex === sentences.length - 1;
        const endOfStretch =
          endOfParagraph && paragraphIndex === paragraphs.length - 1;
        let pauseAfter = 0;
        if (endOfStretch) {
          if (stretchIndex < stretches.length - 1) {
            holds += 1;
            pauseAfter = holds <= HOLDS_PER_PAGE ? tuning.hold : tuning.breath;
          }
        } else if (endOfParagraph) {
          pauseAfter = PARAGRAPH_BREATH;
        }
        push(
          text,
          round(Math.min(2, Math.max(0.5, base * factor))),
          pauseAfter,
        );
      });
    });
  });
  return pieces;
}

/** The style's own pace, the number the voice is handed for a plain sentence. */
export const STYLE_SPEED: Record<LectureStyle, number> = {
  gentle: 0.9,
  steady: 1,
  brisk: 1.1,
};
