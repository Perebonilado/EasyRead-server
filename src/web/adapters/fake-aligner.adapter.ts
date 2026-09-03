import { Injectable } from '@nestjs/common';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { AlignedWord } from '../../business/domain/board';

/**
 * An aligner for tests and the offline driver: words evenly spread over
 * the audio's length, which it takes from the text at fifteen characters
 * a second. `broken` makes it return times that fail the sanity checks,
 * so the fallback path can be exercised.
 */
@Injectable()
export class FakeAlignerAdapter implements AlignerPort {
  broken = false;
  off = false;

  enabled(): boolean {
    return !this.off;
  }

  align(input: {
    audio: Buffer;
    mimeType: string;
    text: string;
  }): Promise<{ words: AlignedWord[]; engine: 'whisper' | 'dtw' } | null> {
    if (this.off) return Promise.resolve(null);
    const durationMs = (input.text.length / 15) * 1000;
    const words: AlignedWord[] = [];
    const pattern = /\S+/g;
    let match: RegExpExecArray | null;
    const perChar = durationMs / Math.max(input.text.length, 1);
    while ((match = pattern.exec(input.text)) !== null) {
      const charStart = match.index;
      const charEnd = charStart + match[0].length;
      words.push({
        text: match[0],
        charStart,
        charEnd,
        startMs: this.broken ? 0 : Math.round(charStart * perChar),
        endMs: this.broken ? 9000 : Math.round(charEnd * perChar),
      });
    }
    return Promise.resolve({ words, engine: 'whisper' });
  }
}
