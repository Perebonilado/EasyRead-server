/**
 * When everything happens: each word of the narration on the audio, and
 * each step of the storyboard on its words.
 *
 * The words are timed three ways, best first. The voice itself says when
 * it spoke each word (Kokoro puts a start and end on every token it
 * renders). Failing that, the aligner measures them on the audio.
 * Failing that, they are spread by length inside each sentence, whose
 * start the voice always reports. The guess never crosses a sentence.
 *
 * A step is anchored on a phrase in its written sentence. The spoken form
 * maps written words to spoken ones ("1918" is said as two), so the
 * phrase lands where it is heard.
 */
import type { SpokenForm } from './spoken';
import { wordKey } from './scene-script';

/** Each spoken word: [charStart, charEnd, startMs, endMs], chars into the scene's spoken text. */
export type SpokenWords = number[][];

/** A sentence on the audio, its words the written words the captions show. */
export interface TimedBeat {
  text: string;
  startMs: number;
  endMs: number;
  /** One per whitespace word of `text`: [charStart, charEnd, startMs, endMs], chars into `text`. */
  words: number[][];
}

/** Visuals a breath before the word feel in time; on the word they feel late. */
export const LEAD_MS = 200;
/** A step on a sentence's first word lands in the pause before it. */
export const FIRST_WORD_LEAD_MS = 450;
/** Two changes closer than this are staggered, so each is its own event. */
export const MIN_GAP_MS = 450;
/** Longer than this with nothing changing, and something is added. */
export const MAX_QUIET_MS = 6000;
/** How far outside its sentence's span a measured word may fall before the sentence is pinned. */
export const PIN_SLACK_MS = 150;

/**
 * The spoken text of the whole scene: each sentence's spoken form, one
 * per line, with where each sentence starts in it. The voice and the
 * aligner both see exactly this text.
 */
export function sceneSpoken(forms: SpokenForm[]): {
  text: string;
  starts: number[];
} {
  const starts: number[] = [];
  let text = '';
  forms.forEach((form, index) => {
    if (index > 0) text += '\n';
    starts.push(text.length);
    text += form.text;
  });
  return { text, starts };
}

/**
 * The span each sentence is spoken in, from where the voice said its
 * pieces start: a sentence runs from its start to the next start less
 * the pause after it; the last to the end less its pause. Null when the
 * voice measured nothing or the count does not match.
 */
export function sentenceWindows(
  count: number,
  pausesS: number[],
  durationMs: number,
  pieceStartsMs?: number[],
): [number, number][] | null {
  if (!pieceStartsMs || pieceStartsMs.length !== count || count === 0)
    return null;
  for (let i = 1; i < count; i += 1)
    if (pieceStartsMs[i] < pieceStartsMs[i - 1]) return null;
  return pieceStartsMs.map((start, i) => {
    const next = i + 1 < count ? pieceStartsMs[i + 1] : durationMs;
    const end = Math.max(start + 200, next - (pausesS[i] ?? 0) * 1000);
    return [start, end];
  });
}

/**
 * Word times guessed for a voice that was never measured: the silences
 * the voice was asked for are taken out, each sentence gets a share of
 * what is left by its length, and its words are spread inside it. Pinned
 * to the sentences' measured starts when the voice gave them.
 */
export function estimateSpokenWords(input: {
  forms: SpokenForm[];
  pausesS: number[];
  durationMs: number;
  pieceStartsMs?: number[];
}): SpokenWords {
  const { forms, pausesS, durationMs } = input;
  const { starts } = sceneSpoken(forms);
  const windows = sentenceWindows(
    forms.length,
    pausesS,
    durationMs,
    input.pieceStartsMs,
  );
  const silence = pausesS.reduce((sum, s) => sum + s, 0) * 1000;
  const speech = Math.max(durationMs * 0.4, durationMs - silence);
  const chars = forms.reduce((sum, form) => sum + form.text.length, 0) || 1;
  const perChar = speech / chars;
  const words: SpokenWords = [];
  let cursor = 0;
  forms.forEach((form, index) => {
    const start = starts[index];
    const window = windows?.[index];
    const from0 = window ? window[0] : cursor;
    const span = window
      ? Math.max(200, window[1] - window[0])
      : form.text.length * perChar;
    const length = Math.max(1, form.text.length);
    for (const match of form.text.matchAll(/\S+/g)) {
      const from = match.index;
      const to = from + match[0].length;
      words.push([
        start + from,
        start + to,
        Math.round(from0 + (from / length) * span),
        Math.round(from0 + (to / length) * span),
      ]);
    }
    cursor = window
      ? window[1] + (pausesS[index] ?? 0) * 1000
      : cursor + span + (pausesS[index] ?? 0) * 1000;
  });
  return words;
}

/**
 * Measured words pinned to the sentences the voice said it spoke: a
 * sentence whose words the aligner put outside its own span is remapped
 * into that span, so the aligner only decides where a word falls inside
 * its sentence.
 */
export function pinSpokenWords(
  words: SpokenWords,
  forms: SpokenForm[],
  pausesS: number[],
  durationMs: number,
  pieceStartsMs?: number[],
): SpokenWords {
  const windows = sentenceWindows(
    forms.length,
    pausesS,
    durationMs,
    pieceStartsMs,
  );
  if (!windows) return words;
  const { starts } = sceneSpoken(forms);
  const out = words.map((w) => [...w]);
  forms.forEach((form, index) => {
    const start = starts[index];
    const end = start + form.text.length;
    const own = out.filter((w) => w[0] >= start && w[1] <= end && w[2] >= 0);
    if (!own.length) return;
    const [ws, we] = windows[index];
    const first = Math.min(...own.map((w) => w[2]));
    const last = Math.max(...own.map((w) => w[3]));
    if (first >= ws - PIN_SLACK_MS && last <= we + PIN_SLACK_MS) return;
    const scale = last > first ? (we - ws) / (last - first) : 1;
    for (const w of own) {
      w[2] = Math.round(ws + (w[2] - first) * scale);
      w[3] = Math.round(ws + (w[3] - first) * scale);
    }
  });
  return out;
}

/** A word the voice spoke, with when, as the voice reported it. */
export interface VoiceWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * The voice's own word times laid on the spoken text. The voice splits
 * some words ("don't" is "do" and "n't", "well-known" three tokens) and
 * says punctuation as tokens of its own, so tokens are joined until they
 * spell the word. Null when too much of the text cannot be found, so the
 * page falls back to the aligner rather than trusting a bad match.
 */
export function spokenWordsFromVoice(
  voice: VoiceWord[],
  spoken: string,
): SpokenWords | null {
  const tokens = voice
    .map((token) => ({ ...token, key: wordKey(token.text) }))
    .filter(
      (token) =>
        token.key &&
        Number.isFinite(token.startMs) &&
        Number.isFinite(token.endMs),
    );
  const words = [...spoken.matchAll(/\S+/g)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    key: wordKey(m[0]),
  }));
  if (!words.length || !tokens.length) return null;
  const timed: (number[] | null)[] = words.map(() => null);
  let j = 0;
  let missed = 0;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word.key) continue;
    let found = false;
    // Look a few tokens ahead, in case the voice said something extra.
    for (
      let skip = 0;
      skip < 4 && j + skip < tokens.length && !found;
      skip += 1
    ) {
      let k = j + skip;
      let joined = tokens[k].key;
      while (
        joined.length < word.key.length &&
        word.key.startsWith(joined) &&
        k + 1 < tokens.length
      ) {
        k += 1;
        joined += tokens[k].key;
      }
      if (joined === word.key) {
        timed[i] = [
          word.start,
          word.end,
          tokens[j + skip].startMs,
          tokens[k].endMs,
        ];
        j = k + 1;
        found = true;
      }
    }
    if (!found) missed += 1;
  }
  const keyed = words.filter((w) => w.key).length;
  if (missed > Math.max(2, keyed * 0.1)) return null;
  // Words not found, and punctuation standing alone, take their times from their neighbours.
  const out: SpokenWords = [];
  for (let i = 0; i < words.length; i += 1) {
    const own = timed[i];
    if (own) {
      out.push(own);
      continue;
    }
    const before = out.length ? out[out.length - 1][3] : 0;
    const after = timed.slice(i + 1).find(Boolean)?.[2] ?? before;
    out.push([words[i].start, words[i].end, before, Math.max(before, after)]);
  }
  // Monotone: a token the voice reported out of order cannot move a word back.
  for (let i = 1; i < out.length; i += 1) {
    if (out[i][2] < out[i - 1][2]) out[i][2] = out[i - 1][2];
    if (out[i][3] < out[i][2]) out[i][3] = out[i][2];
  }
  return out;
}

/**
 * The sentences on the audio, each with its written words timed: the
 * spoken words each written word became, from its first start to its
 * last end. What the captions light and what the anchors land on.
 */
export function timeBeats(
  beats: { say: string }[],
  forms: SpokenForm[],
  spoken: SpokenWords,
): TimedBeat[] {
  const { starts } = sceneSpoken(forms);
  return beats.map((beat, k) => {
    const from = starts[k];
    const to = from + (forms[k]?.text.length ?? 0);
    const own = spoken.filter((w) => w[0] >= from && w[1] <= to);
    const written = [...beat.say.matchAll(/\S+/g)];
    const spans = forms[k]?.spans ?? [];
    const first = own[0];
    const last = own[own.length - 1];
    const words = written.map((match, i) => {
      const span = spans[i];
      let a = span ? own[span[0]] : undefined;
      let b = span ? own[Math.max(span[0], span[1] - 1)] : undefined;
      if (!a || !b) {
        // No map for this word: its share of the sentence by position.
        const at =
          own[
            Math.min(
              own.length - 1,
              Math.round((i / Math.max(1, written.length)) * own.length),
            )
          ];
        a = at ?? first;
        b = at ?? last;
      }
      const start = a ? a[2] : 0;
      const end = b ? Math.max(start, b[3]) : start;
      return [match.index, match.index + match[0].length, start, end];
    });
    return {
      text: beat.say,
      startMs: words.length ? words[0][2] : (first?.[2] ?? 0),
      endMs: words.length ? words[words.length - 1][3] : (last?.[3] ?? 0),
      words,
    };
  });
}

/**
 * When a step lands: a breath before its phrase's first word. On a
 * sentence's first word it comes in the pause before the sentence, so the
 * picture is there as the words begin, but never over the sentence before.
 */
export function anchorMs(
  beats: TimedBeat[],
  beat: number,
  word: number,
): number {
  const b = beats[beat];
  if (!b) return 0;
  const w = b.words[Math.max(0, Math.min(word, b.words.length - 1))];
  const start = w ? w[2] : b.startMs;
  if (word <= 0) {
    const before = beat > 0 ? beats[beat - 1].endMs + 40 : 0;
    return Math.max(0, before, start - FIRST_WORD_LEAD_MS);
  }
  return Math.max(0, b.startMs - 100, start - LEAD_MS);
}

/** Times in order made at least MIN_GAP_MS apart, pushed later, never past the end. */
export function spaced(times: number[], durationMs: number): number[] {
  const out: number[] = [];
  for (const t of times) {
    const previous = out.length ? out[out.length - 1] : -Infinity;
    out.push(
      Math.min(
        Math.max(t, previous + MIN_GAP_MS),
        Math.max(0, durationMs - 100),
      ),
    );
  }
  return out;
}

/** The stretches longer than MAX_QUIET_MS between one change and the next. */
export function quietGaps(
  times: number[],
  durationMs: number,
): [number, number][] {
  const points = [...times].sort((a, b) => a - b);
  const gaps: [number, number][] = [];
  for (let i = 0; i < points.length; i += 1) {
    const next = i + 1 < points.length ? points[i + 1] : durationMs;
    if (next - points[i] > MAX_QUIET_MS) gaps.push([points[i], next]);
  }
  return gaps;
}
