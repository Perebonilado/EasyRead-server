/**
 * When an infographic thing's later looks come, when the writer did not
 * say: each state on the words the voice says for it (the new words of a
 * strike, a calendar's next date, a stamp's words, a counter's later
 * number), as a working's lines come on the number they reach. A state
 * that is the thing's whole point (the strike, the stamp, the calendars'
 * meeting) comes anyway when its words are never said, spread through its
 * time on the stage as a working's lines are; a flow is shut only when the
 * voice says it stops.
 */
import { numbersIn } from './scene-chart';
import { COUNTER_THEN } from './scene-counter';
import { ICONS_HIGHLIGHT } from './scene-icons';
import { CALENDAR_MERGE } from './scene-calendar';
import { STRIKE_REPLACED } from './scene-strike';
import { TRANSFER_SHUT } from './scene-transfer';
import { DOCUMENT_STAMP } from './scene-document';
import { SPLIT_CHANGE } from './scene-split';
import type { InfographicThing } from './scene-script';

/** One state and what cues it: words said together, or a number; and whether it comes even unsaid. */
export interface StateCue {
  state: string;
  /** Words said one after another, as the voice says them (lower case, letters and digits). */
  words: string[][];
  numbers: number[];
  /** Shown through its time on the stage when its words are never said. */
  unsaid: boolean;
}

/** A word as compared: lower case, letters and digits only. */
export const wordOf = (word: string) =>
  word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** A phrase's words as compared, small joining words kept (so "as soon as" is three). */
const wordsOf = (text: string | null | undefined): string[] =>
  (text ?? '').split(/\s+/).map(wordOf).filter(Boolean);

/** The words that say a flow has stopped. */
const STOPS = [['shut'], ['shuts'], ['closed'], ['closes'], ['close'], ['stopped'], ['stops'], ['stop'], ['ended'], ['ends'], ['halted'], ['cut', 'off']];

/** Each later look of a thing, in the order it comes, with its cues. */
export function stateCues(thing: InfographicThing): StateCue[] {
  switch (thing.kind) {
    case 'counter': {
      const then = thing.counter.then;
      return then === null
        ? []
        : [{ state: COUNTER_THEN, words: [], numbers: [then], unsaid: true }];
    }
    case 'icons': {
      const hl = thing.icons.highlight;
      return hl
        ? [
            {
              state: ICONS_HIGHLIGHT,
              words: hl.label ? [wordsOf(hl.label)] : [],
              numbers: [hl.count],
              unsaid: true,
            },
          ]
        : [];
    }
    case 'calendar': {
      const out: StateCue[] = [];
      thing.calendar.calendars.forEach((one, c) =>
        one.pages.forEach((page, p) => {
          if (p === 0) return;
          out.push({
            state: c === 0 ? `page ${p + 1}` : page.text,
            words: [wordsOf(page.text)],
            numbers: numbersIn(page.text),
            unsaid: true,
          });
        }),
      );
      const merge = thing.calendar.merge;
      if (merge && thing.calendar.calendars.length > 1)
        out.push({
          state: CALENDAR_MERGE,
          words: [wordsOf(merge.text)],
          numbers: numbersIn(merge.text),
          unsaid: true,
        });
      return out;
    }
    case 'strike':
      return [
        {
          state: STRIKE_REPLACED,
          words: [wordsOf(thing.strike.to)],
          numbers: numbersIn(thing.strike.to),
          unsaid: true,
        },
      ];
    case 'document':
      return thing.document.stamp
        ? [
            {
              state: DOCUMENT_STAMP,
              words: [wordsOf(thing.document.stamp)],
              numbers: [],
              unsaid: true,
            },
          ]
        : [];
    case 'split': {
      const change = thing.split.change;
      return change
        ? [
            {
              state: SPLIT_CHANGE,
              words: [
                ...(change.label ? [wordsOf(change.label)] : []),
                ...change.items.slice(0, 1).map(wordsOf),
              ],
              numbers: change.label ? numbersIn(change.label) : [],
              unsaid: true,
            },
          ]
        : [];
    }
    case 'transfer':
      return thing.transfer.shut
        ? [{ state: TRANSFER_SHUT, words: STOPS, numbers: [], unsaid: false }]
        : [];
    default:
      return [];
  }
}

/** A spoken word and when it is said. */
export interface SaidWord {
  word: string;
  at: number;
}

/**
 * When the voice first says one of the phrases (its words one after
 * another), after a moment and before another; null if it never does.
 */
export function phraseSaidAt(
  said: readonly SaidWord[],
  phrases: readonly string[][],
  after: number,
  before: number,
): number | null {
  let best: number | null = null;
  for (const phrase of phrases) {
    if (!phrase.length) continue;
    for (let i = 0; i < said.length; i += 1) {
      const at = said[i].at;
      if (at <= after || at >= before) continue;
      if (phrase.every((w, j) => wordOf(said[i + j]?.word ?? '') === w)) {
        if (best === null || at < best) best = at;
        break;
      }
    }
  }
  return best;
}
