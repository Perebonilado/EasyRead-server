/**
 * A Studio film made into a video file, on the worker (studio-export,
 * infographic-editor-plan stage 9).
 *
 * Each film of the video (one episode, or every made episode of the show
 * in order) is drawn by a headless browser from the client's render page,
 * frame by frame into ffmpeg (pipeline/export/film-capture.ts). Its sound
 * is built apart: each voice from storage laid where the page says the
 * film plays it, under the music and the stage's sounds the page rendered
 * offline, brought to the platforms' loudness in two passes, muxed as AAC.
 * A show's films are then joined end to end without re-encoding, with
 * their titles as chapters (and an editor's acts inside them); one
 * episode keeps its acts as chapters. The file is kept beside the
 * episode's scenes, its row says it is done and how big, and the thread
 * says "Your video is ready".
 *
 * Progress is written to the row as the frames are drawn, a couple of
 * times a second at most. A failure with an attempt left puts the row
 * back to queued; the last one fails it, in plain words.
 */
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidationError } from '../../business/domain/errors/errors';
import { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import { logEvent } from '../../business/handlers/studio/studio-log';
import {
  exportFilms,
  type ExportFilm,
} from '../../business/handlers/studio/studio-export-films';
import {
  EXPORT_FAILED,
  EXPORT_SIZE,
  RENDER_KEY_MS,
  concatArgs,
  concatList,
  exportFps,
  exportKey,
  ffmetadata,
  filmPrint,
  keySecret,
  loudnessOf,
  measureArgs,
  metadataArgs,
  muxArgs,
  progressOf,
  readyLine,
  showChapters,
  signKey,
  soundChapters,
  type Chapter,
  type SoundPlan,
} from '../../business/domain/studio/studio-export';
import type { ClockPort } from '../../business/ports/clock.port';
import type { StoragePort } from '../../business/ports/storage.port';
import { CLOCK, STORAGE } from '../../business/ports/tokens';
import type {
  StudioExportRecord,
  StudioExportRepository,
} from '../../business/repositories/studio-export.repository';
import type { StudioRepository } from '../../business/repositories/studio.repository';
import {
  STUDIO_EXPORT_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../../business/repositories/tokens';
import { Ffmpeg, type VideoTools } from '../export/ffmpeg';
import {
  PuppeteerFilmCapture,
  exportGl,
  chromePath,
  type FilmCapturePort,
} from '../export/film-capture';
import type { StudioExportJobData } from '../queues';
import type { JobContext } from './base.processor';

/** Tokens for the browser and ffmpeg, given by a test; the worker makes its own. */
export const FILM_CAPTURE = Symbol('FilmCapture');
export const VIDEO_TOOLS = Symbol('VideoTools');

/** The least time between two writes of a row's progress. */
const PROGRESS_EVERY_MS = 1500;

@Injectable()
export class StudioExportProcessor {
  private readonly logger = new Logger(StudioExportProcessor.name);
  private readonly secret: string;
  private readonly web: string;
  private readonly fps: number;
  private readonly tools: VideoTools;
  private readonly capture: FilmCapturePort;

  constructor(
    @Inject(STUDIO_EXPORT_REPOSITORY)
    private readonly exports: StudioExportRepository,
    @Inject(STUDIO_REPOSITORY) private readonly studio: StudioRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly entitlements: EntitlementsService,
    config: ConfigService,
    @Optional() @Inject(VIDEO_TOOLS) tools?: VideoTools,
    @Optional() @Inject(FILM_CAPTURE) capture?: FilmCapturePort,
  ) {
    this.secret = keySecret({
      own: config.get<string>('STUDIO_EXPORT_SECRET'),
      access: config.get<string>('JWT_ACCESS_SECRET'),
    });
    this.web = (
      config.get<string>('RENDER_WEB_URL') ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');
    this.fps = exportFps(config.get<string>('EXPORT_FPS'));
    this.tools =
      tools ?? new Ffmpeg(config.get<string>('FFMPEG_PATH') || 'ffmpeg');
    this.capture =
      capture ??
      new PuppeteerFilmCapture(this.tools, {
        chrome: chromePath(config.get<string>('CHROME_PATH')),
        pages: Math.min(
          4,
          Math.max(1, Number(config.get<string>('EXPORT_PAGES')) || 1),
        ),
        gl: exportGl(config.get<string>('EXPORT_GL')),
      });
  }

  async process(data: StudioExportJobData, context: JobContext): Promise<void> {
    const record = await this.exports.find(data.exportId);
    // Gone, made already, or let go as lost while it waited: nothing to do.
    if (!record || record.status === 'done' || record.status === 'failed')
      return;
    const started = Date.now();
    const work = await mkdtemp(join(tmpdir(), 'studio-export-'));
    try {
      const made = await this.make(record, work);
      this.logger.log(
        `${record.id}: ${record.scope} ${record.shape} video made in ${Math.round((Date.now() - started) / 1000)}s, ${made.bytes} bytes, ${made.stats}`,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${record.id}: the video could not be made: ${message}`);
      const last = context.isFinalAttempt || error instanceof ValidationError;
      await this.exports.update(
        record.id,
        last
          ? { status: 'failed', error: EXPORT_FAILED }
          : { status: 'queued', progress: 0, error: null },
      );
      throw error;
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** The video made, kept, and said to be ready. */
  private async make(
    record: StudioExportRecord,
    work: string,
  ): Promise<{ bytes: number; stats: string }> {
    const [show, lead] = await Promise.all([
      this.studio.findShow(record.showId),
      this.studio.findEpisode(record.episodeId),
    ]);
    if (!show || !lead) throw new ValidationError('The film is gone');
    const films = await exportFilms(
      this.studio,
      show,
      lead,
      record.scope,
      record.shape,
    );
    if (!films.length) throw new ValidationError('No film of it is made');
    await this.exports.update(record.id, {
      status: 'rendering',
      progress: 0,
      error: null,
    });

    const size = EXPORT_SIZE[record.shape];
    let told = 0;
    const tell = async (progress: number, force = false) => {
      const now = Date.now();
      if (!force && now - told < PROGRESS_EVERY_MS) return;
      told = now;
      await this.exports.update(record.id, { progress }).catch(() => undefined);
    };

    const parts: {
      file: string;
      durationMs: number;
      chapters: Chapter[];
      film: ExportFilm;
    }[] = [];
    const stats: string[] = [];
    for (const [k, film] of films.entries()) {
      const key = signKey(
        {
          scope: 'episode',
          id: film.episode.id,
          expiresAt: this.clock.now().getTime() + RENDER_KEY_MS,
        },
        this.secret,
      );
      const query = new URLSearchParams({
        key,
        captions: record.captions ? '1' : '0',
        title: '1',
        // A show's video has one end card, after its last episode.
        end: k === films.length - 1 ? '1' : '0',
        fps: String(this.fps),
      });
      const captured = await this.capture.capture({
        url: `${this.web}/render/${film.episode.id}?${query.toString()}`,
        width: size.width,
        height: size.height,
        fps: this.fps,
        video: join(work, `film-${k}-picture.mp4`),
        workDir: work,
        name: `film-${k}`,
        onFrames: (done, total) =>
          void tell(
            progressOf({
              framesDone: k * 1000 + (1000 * done) / Math.max(1, total),
              framesTotal: films.length * 1000,
              soundDone: k,
              soundTotal: films.length,
            }),
          ),
      });
      stats.push(
        `film ${k + 1}: ${captured.frames} frames in ${Math.round(captured.stats.ms / 1000)}s (${captured.stats.framesPerSecond} fps, ${captured.stats.pages} page${captured.stats.pages === 1 ? '' : 's'}, ${captured.stats.relaunches} relaunch${captured.stats.relaunches === 1 ? '' : 'es'})`,
      );

      // The sound: each voice from storage where the page lays it, under the music and the stage's sounds.
      const voices = await Promise.all(
        captured.voices.map(async (voice, n) => ({
          file: await this.voiceFile(
            voice.sceneId,
            join(work, `film-${k}-voice-${n}.mp3`),
          ),
          startsAtMs: voice.startsAtMs,
          inMs: voice.inMs,
          outMs: voice.outMs,
        })),
      );
      const durationMs = Math.round((captured.frames * 1000) / this.fps);
      const plan: SoundPlan = {
        voices,
        beds: [captured.music, captured.effects].filter((one): one is string =>
          Boolean(one),
        ),
        durationMs,
      };
      const measured = loudnessOf(
        (await this.tools.run(measureArgs(plan))).report,
      );
      const file = join(work, `film-${k}.mp4`);
      await this.tools.run(
        muxArgs(plan, join(work, `film-${k}-picture.mp4`), measured, file),
      );
      parts.push({ file, durationMs, chapters: captured.chapters, film });
      await tell(
        progressOf({
          framesDone: (k + 1) * 1000,
          framesTotal: films.length * 1000,
          soundDone: k + 1,
          soundTotal: films.length,
        }),
        true,
      );
    }

    // Joined, with the title and the chapters.
    const out = join(work, 'video.mp4');
    const metadata = join(work, 'metadata.txt');
    const totalMs = parts.reduce((n, part) => n + part.durationMs, 0);
    const title =
      record.scope === 'show'
        ? show.title
        : (parts[0]?.film.title ?? show.title);
    const chapters =
      record.scope === 'show'
        ? showChapters(
            parts.map((part) => ({
              number: part.film.number,
              title: part.film.title,
              durationMs: part.durationMs,
              chapters: part.chapters,
            })),
          )
        : soundChapters(parts[0].chapters, totalMs, title);
    await writeFile(
      metadata,
      ffmetadata({ title, chapters, durationMs: totalMs }),
    );
    if (parts.length > 1) {
      const list = join(work, 'parts.txt');
      await writeFile(list, concatList(parts.map((part) => part.file)));
      await this.tools.run(concatArgs(list, metadata, out));
    } else await this.tools.run(metadataArgs(parts[0].file, metadata, out));

    // Kept beside the episode's scenes, and said to be ready.
    const fileKey = exportKey(show.id, lead.id, record.id);
    const stored = await this.storage.put({
      key: fileKey,
      body: createReadStream(out),
      mimeType: 'video/mp4',
    });
    const { watermarked } = await this.entitlements
      .studioBalance(record.userId)
      .catch(() => ({ watermarked: false }));
    await this.exports.update(record.id, {
      status: 'done',
      progress: 1,
      fileKey,
      bytes: stored.sizeBytes,
      error: null,
      // What it was made from, as made: the same film asked for again is handed this.
      filmHash: filmPrint({
        scope: record.scope,
        shape: record.shape,
        captions: record.captions,
        showTitle: show.title,
        watermark: watermarked,
        films: films.map((film) => ({
          episodeId: film.episode.id,
          number: film.number,
          title: film.title,
          scenes: film.scenes.map((s) => ({
            id: s.id,
            sceneKey: s.sceneKey,
            audioKey: s.audioKey,
            durationMs: s.durationMs,
          })),
        })),
      }),
    });
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: lead.id },
      {
        what: 'export',
        step: 'made',
        line: readyLine({
          scope: record.scope,
          shape: record.shape,
          title,
          durationMs: totalMs,
        }),
      },
      `export:${record.id}`,
    ).catch((error: Error) =>
      this.logger.warn(
        `${record.id}: could not say the video is ready: ${error.message}`,
      ),
    );
    return { bytes: stored.sizeBytes, stats: stats.join('; ') };
  }

  /** A scene's voice, from storage into the work directory. */
  private async voiceFile(sceneId: string, path: string): Promise<string> {
    const scene = await this.studio.findScene(sceneId);
    if (!scene?.audioKey) throw new Error(`scene ${sceneId} has no voice`);
    await writeFile(path, await this.storage.get(scene.audioKey));
    return path;
  }
}
