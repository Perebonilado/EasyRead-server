/**
 * A Studio film made into a video file (studio-export), as the API sees
 * it: asked for, looked at, downloaded; and the render page's way in
 * without an account, by a key the worker signs for one episode.
 *
 * One video of a film is made at a time: asking again while one is made
 * is handed that one; asking for a film that has not changed since its
 * video was made is handed the video already made. The work itself is
 * the worker's (pipeline/processors/studio-export.processor.ts).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StudioExportDto, StudioExportRequest } from '../../../contracts';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import {
  EXPORT_FAILED,
  FILE_KEY_MS,
  STALE_EXPORT_MS,
  downloadName,
  exportDtoOf,
  filmPrint,
  keySecret,
  readKey,
  signKey,
  type ExportScope,
  type KeyClaim,
} from '../../domain/studio/studio-export';
import type { FilmShape } from '../../domain/scene-shape';
import type { ClockPort } from '../../ports/clock.port';
import type { JobQueuePort } from '../../ports/job-queue.port';
import { CLOCK, JOB_QUEUE } from '../../ports/tokens';
import type {
  StudioExportRecord,
  StudioExportRepository,
} from '../../repositories/studio-export.repository';
import type {
  StudioEpisodeRecord,
  StudioRepository,
} from '../../repositories/studio.repository';
import {
  STUDIO_EXPORT_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../../repositories/tokens';
import { EntitlementsService } from '../documents/entitlements.service';
import { exportFilms } from './studio-export-films';
import { episodeShape } from './studio-twins';

/** How many videos the maker sees under an episode. */
const LISTED = 8;

/** A file of a scene the render page draws from. */
export type RenderFile = 'scene' | 'audio' | 'thumb';

@Injectable()
export class StudioExportService {
  private readonly logger = new Logger(StudioExportService.name);
  private readonly secret: string;
  /** Where the API is, as a browser reaches it: a download link starts here. */
  private readonly apiBase: string;

  constructor(
    @Inject(STUDIO_REPOSITORY) private readonly studio: StudioRepository,
    @Inject(STUDIO_EXPORT_REPOSITORY)
    private readonly exports: StudioExportRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly entitlements: EntitlementsService,
    config: ConfigService,
  ) {
    this.secret = keySecret({
      own: config.get<string>('STUDIO_EXPORT_SECRET'),
      access: config.get<string>('JWT_ACCESS_SECRET'),
    });
    this.apiBase = (
      config.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${config.get<string>('PORT') ?? '4000'}/api/v1`
    ).replace(/\/+$/, '');
    if (
      config.get<string>('NODE_ENV') === 'production' &&
      !config.get<string>('API_PUBLIC_URL')
    )
      this.logger.warn(
        'API_PUBLIC_URL is not set: video download links will point at localhost',
      );
  }

  /** A video of the film, as the maker asks: the one being made, the one made, or a new one. */
  async request(
    userId: string,
    episodeId: string,
    asked: StudioExportRequest,
  ): Promise<StudioExportDto> {
    const episode = await this.studio.findEpisode(episodeId);
    if (!episode || episode.userId !== userId)
      throw new NotFoundError('Episode');
    const show = await this.studio.findShow(episode.showId);
    if (!show || show.userId !== userId) throw new NotFoundError('Show');
    // A twin's videos are its lead's: either shape lists them.
    const lead = episode.twinOf
      ? ((await this.studio.findEpisode(episode.twinOf)) ?? episode)
      : episode;
    const scope: ExportScope = asked.scope === 'show' ? 'show' : 'episode';
    const shape: FilmShape =
      asked.shape === 'tall' || asked.shape === 'wide'
        ? asked.shape
        : episodeShape(episode);
    const captions = asked.captions !== false;

    const films = await exportFilms(this.studio, show, lead, scope, shape);
    if (!films.length)
      throw new ValidationError(
        scope === 'show'
          ? 'No episode of this show is made in that shape yet.'
          : shape === episodeShape(lead)
            ? 'This film is not made yet.'
            : `This film has no ${shape === 'tall' ? 'vertical' : 'wide'} version yet.`,
      );
    const { watermarked } = await this.entitlements.studioBalance(userId);
    const print = filmPrint({
      scope,
      shape,
      captions,
      showTitle: show.title,
      watermark: watermarked,
      films: films.map(({ episode: film, scenes, title, number }) => ({
        episodeId: film.id,
        number,
        title,
        scenes: scenes.map((s) => ({
          id: s.id,
          sceneKey: s.sceneKey,
          audioKey: s.audioKey,
          durationMs: s.durationMs,
        })),
      })),
    });

    const now = this.clock.now().getTime();
    const same = await this.exports.listSame({
      showId: show.id,
      episodeId: lead.id,
      scope,
      shape,
      limit: 12,
    });
    for (const one of same) {
      const active = one.status === 'queued' || one.status === 'rendering';
      // Lost with its worker: let go, so it holds nothing up.
      if (active && now - one.updatedAt.getTime() > STALE_EXPORT_MS) {
        await this.exports.update(one.id, {
          status: 'failed',
          error: EXPORT_FAILED,
        });
        continue;
      }
      if (one.captions !== captions) continue;
      if (active) return this.dtoOf(one);
      if (one.status === 'done' && one.fileKey && one.filmHash === print)
        return this.dtoOf(one);
    }

    const made = await this.exports.create({
      showId: show.id,
      episodeId: lead.id,
      userId,
      scope,
      shape,
      captions,
      filmHash: print,
    });
    try {
      await this.queue.enqueueStudioExport({ exportId: made.id });
    } catch (error) {
      await this.exports.update(made.id, {
        status: 'failed',
        error: EXPORT_FAILED,
      });
      throw error;
    }
    return this.dtoOf(made);
  }

  /** A video, as the maker sees it. */
  async get(userId: string, id: string): Promise<StudioExportDto> {
    return this.dtoOf(await this.owned(userId, id));
  }

  /** A made video's file, for its owner: where it is kept and what it is called. */
  async fileFor(
    userId: string,
    id: string,
  ): Promise<{ key: string; name: string }> {
    return this.fileOf(await this.owned(userId, id));
  }

  /** A made video's file, for whoever holds its download link. */
  async fileByKey(
    id: string,
    key: string,
  ): Promise<{ key: string; name: string }> {
    const claim = this.claim(key);
    if (!claim || claim.scope !== 'file' || claim.id !== id)
      throw new NotFoundError('Video');
    const record = await this.exports.find(id);
    if (!record) throw new NotFoundError('Video');
    return this.fileOf(record);
  }

  /** What the maker sees under an episode: its videos and its show's whole-show ones, the latest first. */
  async listFor(
    episode: Pick<StudioEpisodeRecord, 'id' | 'showId' | 'twinOf'>,
  ): Promise<StudioExportDto[]> {
    const rows = await this.exports.listFor({
      showId: episode.showId,
      episodeId: episode.twinOf ?? episode.id,
      limit: LISTED,
    });
    return rows.map((row) => this.dtoOf(row));
  }

  // ── The render page's way in ───────────────────────────────────────────

  /** The episode a render key lets its holder draw: the one it names, or any of the show it names. */
  async renderEpisode(
    key: string,
    episodeId: string,
  ): Promise<StudioEpisodeRecord> {
    const claim = this.claim(key);
    const episode = claim ? await this.studio.findEpisode(episodeId) : null;
    if (
      !claim ||
      !episode ||
      !(
        (claim.scope === 'episode' && claim.id === episode.id) ||
        (claim.scope === 'show' && claim.id === episode.showId)
      )
    )
      throw new NotFoundError('Film');
    return episode;
  }

  /** A scene's file the render page draws from: its scene, its voice, or its still. */
  async renderFile(
    key: string,
    sceneId: string,
    what: RenderFile,
  ): Promise<string> {
    const scene = await this.studio.findScene(sceneId);
    if (!scene) throw new NotFoundError('Scene');
    await this.renderEpisode(key, scene.episodeId);
    const file =
      what === 'scene'
        ? scene.sceneKey
        : what === 'audio'
          ? scene.audioKey
          : scene.thumbKey;
    if (!file) throw new NotFoundError('Scene');
    return file;
  }

  // ── Within ─────────────────────────────────────────────────────────────

  private claim(key: string): KeyClaim | null {
    return readKey(key, this.secret, this.clock.now().getTime());
  }

  private async owned(userId: string, id: string): Promise<StudioExportRecord> {
    const record = await this.exports.find(id);
    if (!record || record.userId !== userId) throw new NotFoundError('Video');
    return record;
  }

  private async fileOf(
    record: StudioExportRecord,
  ): Promise<{ key: string; name: string }> {
    if (record.status !== 'done' || !record.fileKey)
      throw new NotFoundError('Video');
    const [show, episode] = await Promise.all([
      this.studio.findShow(record.showId),
      this.studio.findEpisode(record.episodeId),
    ]);
    return {
      key: record.fileKey,
      name: downloadName({
        showTitle: show?.title ?? '',
        episodeTitle: episode?.title ?? '',
        scope: record.scope,
        shape: record.shape,
      }),
    };
  }

  /** A video as the maker sees it, with a fresh download link once it is done. */
  private dtoOf(record: StudioExportRecord): StudioExportDto {
    const key = signKey(
      {
        scope: 'file',
        id: record.id,
        expiresAt: this.clock.now().getTime() + FILE_KEY_MS,
      },
      this.secret,
    );
    return exportDtoOf(
      record,
      `${this.apiBase}/studio/exports/${record.id}/download?key=${key}`,
    );
  }
}
