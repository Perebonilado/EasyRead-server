import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { AlignedWord } from '../../business/domain/board';

type Engine = 'whisper' | 'dtw';

interface TimelineEntry {
  type: string;
  text: string;
  startTime: number;
  endTime: number;
  startOffsetUtf16?: number;
  endOffsetUtf16?: number;
  timeline?: TimelineEntry[];
}

/**
 * Forced alignment with echogarden, in this process.
 *
 * The transcript we hand it is the spoken text of the row, so the offsets
 * it returns index straight into that text and the board's anchors need
 * no matching step. Measured on this stack: the dtw engine (eSpeak as the
 * reference, then dynamic time warping) aligns an eighty-second page in
 * about eight seconds with no model to load; the whisper engine (guided
 * decoding with whisper.cpp) takes five times as long and needs a 130 MB
 * model, so dtw is the default and whisper the option for a host with
 * spare CPU. Both are fetched into echogarden's own package directory the
 * first time they are needed.
 */
@Injectable()
export class EchogardenAlignerAdapter implements AlignerPort {
  private readonly logger = new Logger(EchogardenAlignerAdapter.name);

  constructor(private readonly config: ConfigService) {}

  private engine(): Engine | null {
    const value = this.config.get<string>('LECTURE_ALIGN_ENGINE', 'dtw');
    if (value === 'whisper' || value === 'dtw') return value;
    return null;
  }

  enabled(): boolean {
    return this.engine() !== null;
  }

  async align(input: {
    audio: Buffer;
    mimeType: string;
    text: string;
  }): Promise<{ words: AlignedWord[]; engine: Engine } | null> {
    const engine = this.engine();
    if (!engine) return null;
    const threads = Number(
      this.config.get<string>('LECTURE_ALIGN_THREADS', '2'),
    );
    const packagesDir = this.config.get<string>('ECHOGARDEN_PACKAGES_DIR');
    const ffmpegPath = this.config.get<string>('ECHOGARDEN_FFMPEG_PATH');
    const started = Date.now();
    try {
      const echogarden = await import('echogarden');
      const result = await echogarden.align(input.audio, input.text, {
        engine,
        language: 'en',
        crop: false,
        plainText: { paragraphBreaks: 'double', whitespace: 'collapse' },
        ...(engine === 'whisper'
          ? {
              whisper: {
                model: 'base.en',
                timestampAccuracy: 'high',
                threadCount:
                  Number.isFinite(threads) && threads > 0 ? threads : 2,
              },
            }
          : { dtw: { granularity: 'high' } }),
        ...(packagesDir ? { packageBaseDir: packagesDir } : {}),
        ...(ffmpegPath ? { ffmpegPath } : {}),
      } as never);
      const words = flatten(result.wordTimeline as TimelineEntry[]);
      this.logger.log(
        `Aligned ${words.length} words in ${Date.now() - started}ms via ${engine}`,
      );
      return { words, engine };
    } catch (error) {
      this.logger.warn(
        `Alignment failed after ${Date.now() - started}ms — ${(error as Error).message}`,
      );
      return null;
    }
  }
}

/** The word entries of a timeline, with their times in milliseconds. */
export function flatten(entries: TimelineEntry[]): AlignedWord[] {
  const words: AlignedWord[] = [];
  const walk = (list: TimelineEntry[]) => {
    for (const entry of list) {
      if (entry.type === 'word') {
        if (
          typeof entry.startOffsetUtf16 === 'number' &&
          typeof entry.endOffsetUtf16 === 'number'
        ) {
          words.push({
            text: entry.text,
            startMs: Math.round(entry.startTime * 1000),
            endMs: Math.round(entry.endTime * 1000),
            charStart: entry.startOffsetUtf16,
            charEnd: entry.endOffsetUtf16,
          });
        }
      } else if (entry.timeline) {
        walk(entry.timeline);
      }
    }
  };
  walk(entries);
  return words;
}
