import type { AlignedWord } from '../domain/board';

/**
 * Forced alignment: where each word of a known text is heard in its audio.
 *
 * The voice we use returns no timing, so the board learns it afterwards
 * by aligning the script we already have against the file. Null means the
 * aligner is off or could not run; the board then falls back to estimated
 * timing, which is a worse board, never a missing page.
 */
export interface AlignerPort {
  /** Whether alignment is configured at all; a cheap check before fetching audio. */
  enabled(): boolean;
  align(input: { audio: Buffer; mimeType: string; text: string }): Promise<{
    words: AlignedWord[];
    engine: 'whisper' | 'dtw';
  } | null>;
}
