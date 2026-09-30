/**
 * A scene's voice put right after it is voiced, never voiced again: each
 * lesson sentence played at its target rate by a small time-stretch, the
 * long gaps a voice leaves inside a sentence trimmed, and every silence
 * between sentences made what it was planned to be (a pause the voice
 * never left put in; one it held too long cut back). The word times move
 * with the audio, so the scene is timed on what is heard.
 *
 * Pure: samples and times in, samples and a map of times out.
 */
import type { SceneDto } from '../../contracts';
import type { Pcm } from './wav';
import { sentenceWpm, tempoFor } from './scene-pace';
import { stretchPcm } from './time-stretch';

/** One change to the audio: `[from, to)` of the input, in samples, played in `out` samples. */
export interface PaceEdit {
  from: number;
  to: number;
  out: number;
  /** Speech stretched (pitch kept), or silence made longer or shorter. */
  kind: 'stretch' | 'quiet';
}

/** Loudness is measured in frames this long, in ms. */
const FRAME_MS = 10;
/** Quieter than this share of the loudest frame is silence. */
const QUIET_SHARE = 0.04;
/** A gap inside a sentence longer than this is the voice's own hesitation. */
export const INSIDE_GAP_MS = 600;
/** …and is trimmed to this. */
export const INSIDE_KEEP_MS = 250;
/** A pause shorter than planned by more than this is made up. */
const SHORT_BY_MS = 120;
/** A pause longer than planned by more than this is cut back to it. */
const LONG_BY_MS = 250;
/** Silence kept either side of where some is taken out, in ms. */
const EDGE_MS = 40;

/** Each frame's loudness, and the level below which it is silence. */
function loudness(pcm: Pcm): {
  frame: number;
  level: Float32Array;
  floor: number;
} {
  const frame = Math.max(1, Math.round((pcm.sampleRate * FRAME_MS) / 1000));
  const count = Math.floor(pcm.samples.length / frame);
  const level = new Float32Array(count);
  let loudest = 0;
  for (let f = 0; f < count; f += 1) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i += 1)
      sum += pcm.samples[i] * pcm.samples[i];
    level[f] = Math.sqrt(sum / frame);
    loudest = Math.max(loudest, level[f]);
  }
  return { frame, level, floor: loudest * QUIET_SHARE };
}

type Heard = ReturnType<typeof loudness>;

/** The quiet runs between two sample positions, longest first, in samples. */
function quietRuns(heard: Heard, a: number, b: number): [number, number][] {
  const { frame, level, floor } = heard;
  const runs: [number, number][] = [];
  let start = -1;
  const first = Math.max(0, Math.ceil(a / frame));
  const last = Math.min(level.length - 1, Math.floor(b / frame) - 1);
  for (let f = first; f <= last + 1; f += 1) {
    const quiet = f <= last && level[f] <= floor;
    if (quiet && start < 0) start = f;
    if (!quiet && start >= 0) {
      runs.push([start * frame, f * frame]);
      start = -1;
    }
  }
  return runs.sort((x, y) => y[1] - y[0] - (x[1] - x[0]));
}

/** The quietest frame's middle between two sample positions. */
function quietest(heard: Heard, a: number, b: number): number {
  const { frame, level } = heard;
  let best = Math.round((a + b) / 2);
  let least = Infinity;
  for (
    let f = Math.ceil(a / frame);
    (f + 1) * frame <= b && f < level.length;
    f += 1
  )
    if (level[f] < least) {
      least = level[f];
      best = f * frame + Math.round(frame / 2);
    }
  return best;
}

/** What the pace step did, for the log. */
export interface PaceNotes {
  stretched: number;
  /** Sentences further from their target than the stretch may go. */
  beyond: number;
  trimmed: number;
  added: number;
  shortened: number;
}

/**
 * The edits that bring a voiced scene to its plan. `targets` are each
 * sentence's words a minute, null for one left at its own pace (a
 * story's line); `pauses` the silence planned after each, in seconds,
 * null for one left as it came. Gaps inside a sentence are trimmed only
 * where `trimInside` is on (a lesson's narration, not an actor's line).
 */
export function planPaceEdits(input: {
  pcm: Pcm;
  beats: readonly {
    text: string;
    startMs: number;
    endMs: number;
    words: number[][];
  }[];
  targets: readonly (number | null)[];
  pauses: readonly (number | null)[];
  trimInside: boolean;
  /** Whether a silence held longer than planned is cut back (a lesson's), or only a short one made up (a story's). */
  shorten?: boolean;
  /** The quiet planned before the first word, in ms: made up where the voice gave less. */
  leadMs?: number;
  /** Quicken or slow every sentence by this much more (a maker's nudge on a made scene). */
  tempo?: number;
}): { edits: PaceEdit[]; notes: PaceNotes } {
  const { pcm, beats } = input;
  const rate = pcm.sampleRate;
  const at = (ms: number) =>
    Math.max(0, Math.min(pcm.samples.length, Math.round((ms * rate) / 1000)));
  const heard = loudness(pcm);
  const edits: PaceEdit[] = [];
  const notes: PaceNotes = {
    stretched: 0,
    beyond: 0,
    trimmed: 0,
    added: 0,
    shortened: 0,
  };
  const edge = at(EDGE_MS);
  // The quiet before the first word, made up where the voice gave less
  // (an older Kokoro keeps a lead to three seconds).
  const firstStart = beats.find((b) => b.endMs > b.startMs)?.startMs;
  if (
    input.leadMs &&
    firstStart !== undefined &&
    firstStart < input.leadMs - SHORT_BY_MS
  ) {
    edits.push({
      from: 0,
      to: 0,
      out: at(input.leadMs - firstStart),
      kind: 'quiet',
    });
    notes.added += 1;
  }
  beats.forEach((beat, k) => {
    if (beat.endMs <= beat.startMs) return;
    const s = at(beat.startMs);
    const e = at(beat.endMs);
    // The voice's own long hesitations inside the sentence, between words.
    const trims: [number, number][] = [];
    if (input.trimInside)
      for (let w = 1; w < beat.words.length; w += 1) {
        const a = at(beat.words[w - 1][3]);
        const b = at(beat.words[w][2]);
        if (b - a < at(INSIDE_GAP_MS) - edge) continue;
        const run = quietRuns(
          heard,
          Math.max(s, a - edge),
          Math.min(e, b + edge),
        )[0];
        if (!run || run[1] - run[0] < at(INSIDE_GAP_MS)) continue;
        trims.push(run);
      }
    trims.sort((x, y) => x[0] - y[0]);
    const removed = trims.reduce(
      (n, [a, b]) => n + (b - a - at(INSIDE_KEEP_MS)),
      0,
    );
    const target = input.targets[k] ?? null;
    let tempo = 1;
    if (target) {
      const found = tempoFor(
        sentenceWpm(beat, (removed / rate) * 1000),
        target,
      );
      tempo = found.tempo;
      if (found.beyond) notes.beyond += 1;
    }
    tempo *= input.tempo ?? 1;
    // The speech between the trims, stretched; each trim, quiet kept short.
    let from = s;
    const spans: [number, number][] = [];
    for (const [a, b] of trims) {
      if (a > from) spans.push([from, a]);
      edits.push({ from: a, to: b, out: at(INSIDE_KEEP_MS), kind: 'quiet' });
      notes.trimmed += 1;
      from = b;
    }
    if (e > from) spans.push([from, e]);
    if (Math.abs(tempo - 1) > 1e-3) {
      notes.stretched += 1;
      for (const [a, b] of spans)
        edits.push({
          from: a,
          to: b,
          out: Math.round((b - a) / tempo),
          kind: 'stretch',
        });
    }
    // The silence after it, as planned.
    const next = beats[k + 1];
    const planned = input.pauses[k];
    if (planned === null || planned === undefined) return;
    if (!next) {
      // After the last: the quiet the scene's last moments play in.
      const tailMs = ((pcm.samples.length - e) / rate) * 1000;
      if (tailMs < planned * 1000 - SHORT_BY_MS) {
        const end = pcm.samples.length;
        edits.push({
          from: end,
          to: end,
          out: at(planned * 1000 - tailMs),
          kind: 'quiet',
        });
        notes.added += 1;
      }
      return;
    }
    const gapFrom = e;
    const gapTo = Math.max(e, at(next.startMs));
    const gapMs = ((gapTo - gapFrom) / rate) * 1000;
    const wanted = planned * 1000;
    if (gapMs < wanted - SHORT_BY_MS) {
      const put =
        gapTo - gapFrom > 2 * heard.frame
          ? quietest(heard, gapFrom, gapTo)
          : gapFrom;
      edits.push({
        from: put,
        to: put,
        out: at(wanted - gapMs),
        kind: 'quiet',
      });
      notes.added += 1;
    } else if (input.shorten !== false && gapMs > wanted + LONG_BY_MS) {
      const run = quietRuns(heard, gapFrom, gapTo)[0];
      if (!run) return;
      const less = Math.min(
        at(gapMs - wanted),
        Math.max(0, run[1] - run[0] - 2 * edge),
      );
      if (less <= 0) return;
      edits.push({
        from: run[0],
        to: run[1],
        out: run[1] - run[0] - less,
        kind: 'quiet',
      });
      notes.shortened += 1;
    }
  });
  return { edits: sortedApart(edits), notes };
}

/**
 * Whether a voiced scene may need the pace step at all, from its times
 * alone: a sentence off its target, a long gap inside one, a silence
 * that is not as planned. When not, its audio is never decoded.
 */
export function paceWanted(input: {
  beats: readonly {
    text: string;
    startMs: number;
    endMs: number;
    words: number[][];
  }[];
  targets: readonly (number | null)[];
  pauses: readonly (number | null)[];
  trimInside: boolean;
  shorten?: boolean;
  leadMs?: number;
  durationMs: number;
}): boolean {
  const { beats } = input;
  const spoken = beats.filter((b) => b.endMs > b.startMs);
  if (!spoken.length) return false;
  if (input.leadMs && spoken[0].startMs < input.leadMs - SHORT_BY_MS)
    return true;
  return beats.some((beat, k) => {
    if (beat.endMs <= beat.startMs) return false;
    const target = input.targets[k];
    if (target && tempoFor(sentenceWpm(beat), target).tempo !== 1) return true;
    if (
      input.trimInside &&
      beat.words.some(
        (w, i) => i > 0 && w[2] - beat.words[i - 1][3] >= INSIDE_GAP_MS,
      )
    )
      return true;
    const planned = input.pauses[k];
    if (planned === null || planned === undefined) return false;
    const next = beats[k + 1];
    const gap = (next ? next.startMs : input.durationMs) - beat.endMs;
    if (gap < planned * 1000 - SHORT_BY_MS) return true;
    return (
      Boolean(next) &&
      input.shorten !== false &&
      gap > planned * 1000 + LONG_BY_MS
    );
  });
}

/** Edits in order, none overlapping the one before (a later one that would is dropped). */
function sortedApart(edits: PaceEdit[]): PaceEdit[] {
  const sorted = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: PaceEdit[] = [];
  for (const edit of sorted) {
    const last = out[out.length - 1];
    if (last && edit.from < last.to) continue;
    out.push(edit);
  }
  return out;
}

/** A quiet stretch of `length` samples made from `input` (quiet already): shortened from its middle, or lengthened with silence there. */
function quietOf(input: Int16Array, length: number): Int16Array {
  const out = new Int16Array(length);
  if (!input.length) return out;
  const head = Math.min(Math.floor(length / 2), Math.floor(input.length / 2));
  const tail = Math.min(length - head, input.length - head);
  out.set(input.subarray(0, head), 0);
  out.set(input.subarray(input.length - tail), length - tail);
  return out;
}

/** The audio with its edits made. */
export function applyPaceEdits(pcm: Pcm, edits: readonly PaceEdit[]): Pcm {
  if (!edits.length) return pcm;
  const parts: Int16Array[] = [];
  let from = 0;
  for (const edit of edits) {
    if (edit.from > from) parts.push(pcm.samples.subarray(from, edit.from));
    const piece = pcm.samples.subarray(edit.from, edit.to);
    parts.push(
      edit.kind === 'stretch'
        ? stretchPcm(
            piece,
            pcm.sampleRate,
            edit.out / Math.max(1, piece.length),
            edit.out,
          )
        : quietOf(piece, edit.out),
    );
    from = edit.to;
  }
  if (from < pcm.samples.length) parts.push(pcm.samples.subarray(from));
  const samples = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let put = 0;
  for (const part of parts) {
    samples.set(part, put);
    put += part.length;
  }
  return { samples, sampleRate: pcm.sampleRate };
}

/** Where a moment of the voice as it came is heard once edited, in ms. */
export type TimeMap = (ms: number) => number;

/** The map of times the edits make: straight lines, piece by piece. */
export function timeMapOf(edits: readonly PaceEdit[], rate: number): TimeMap {
  const pieces = edits.map((edit) => ({ ...edit }));
  return (ms: number) => {
    const t = (ms * rate) / 1000;
    let shift = 0;
    for (const edit of pieces) {
      if (t < edit.from) break;
      const length = edit.to - edit.from;
      if (t < edit.to && length > 0) {
        const into = ((t - edit.from) / length) * edit.out;
        return Math.round(((edit.from + shift + into) / rate) * 1000);
      }
      shift += edit.out - length;
    }
    return Math.round(((t + shift) / rate) * 1000);
  };
}

/** Timed sentences moved with the audio. */
export function retimeBeats<
  T extends { startMs: number; endMs: number; words: number[][] },
>(beats: readonly T[], map: TimeMap): T[] {
  return beats.map((beat) => ({
    ...beat,
    startMs: map(beat.startMs),
    endMs: map(beat.endMs),
    words: beat.words.map(([a, b, s, e]) => [a, b, map(s), map(e)]),
  }));
}

/**
 * A made lesson scene timed again on its audio as edited: its sentences,
 * steps, effects and music cues moved with the voice. Null for a scene
 * with acting, props or a set (a story's), whose timing is more than these.
 */
export function retimeScene(
  scene: SceneDto,
  map: TimeMap,
  durationMs: number,
): SceneDto | null {
  if (scene.acting || scene.props?.length || scene.setting?.full) return null;
  return {
    ...scene,
    durationMs,
    ...(scene.settledMs !== undefined
      ? { settledMs: Math.max(durationMs, map(scene.settledMs)) }
      : {}),
    beats: retimeBeats(scene.beats, map),
    steps: scene.steps.map((step) => ({ ...step, atMs: map(step.atMs) })),
    effects: scene.effects.map((effect) => ({
      ...effect,
      atMs: map(effect.atMs),
      ...(effect.untilMs !== undefined ? { untilMs: map(effect.untilMs) } : {}),
    })),
    ...(scene.sound
      ? {
          sound: {
            ...scene.sound,
            ...(scene.sound.music
              ? {
                  music: scene.sound.music.map((cue) => ({
                    ...cue,
                    atMs: map(cue.atMs),
                  })),
                }
              : {}),
          },
        }
      : {}),
  };
}
