/**
 * A film's video as the API hands it out (studio-export): asked for once
 * and queued; asked again while it is made, the same one; asked for an
 * unchanged film, the one already made; one lost with its worker let go;
 * a twin's video kept under its lead; and the keys that let the render
 * page and a download link in, each for its own film alone.
 */
import type { ConfigService } from '@nestjs/config';
import { EMPTY_BRIEF } from '../../domain/studio/studio';
import {
  EXPORT_FAILED,
  RENDER_KEY_MS,
  STALE_EXPORT_MS,
  keySecret,
  signKey,
} from '../../domain/studio/studio-export';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import type { JobQueuePort } from '../../ports/job-queue.port';
import type {
  StudioExportRecord,
  StudioExportRepository,
} from '../../repositories/studio-export.repository';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
} from '../../repositories/studio.repository';
import type { EntitlementsService } from '../documents/entitlements.service';
import { StudioExportService } from './studio-export.service';

const at = new Date('2026-10-01T12:00:00Z');
const SECRET = keySecret({ access: 'jwt-for-tests' });

const episode = (patch: Partial<StudioEpisodeRecord>): StudioEpisodeRecord => ({
  id: 'e1',
  showId: 's1',
  userId: 'u1',
  number: 1,
  title: 'How it began',
  logline: null,
  phase: 'made',
  busy: null,
  error: null,
  outline: null,
  shareToken: null,
  durationMs: 60_000,
  thumbKey: null,
  shape: 'wide',
  twinOf: null,
  createdAt: at,
  updatedAt: at,
  ...patch,
});

const scene = (id: string, episodeId: string): StudioSceneRecord => ({
  id,
  episodeId,
  position: 0,
  sheet: null,
  sheetHash: null,
  problems: [],
  previousSheet: null,
  status: 'made',
  step: null,
  error: null,
  sceneKey: `${id}.json`,
  audioKey: `${id}.mp3`,
  thumbKey: null,
  madeHash: null,
  durationMs: 30_000,
  updatedAt: at,
});

function api() {
  const episodes = [
    episode({}),
    episode({ id: 'e1t', shape: 'tall', twinOf: 'e1' }),
    episode({ id: 'e2', number: 2, phase: 'outline' }),
  ];
  const scenes = [scene('c1', 'e1'), scene('t1', 'e1t')];
  const studio: Partial<StudioRepository> = {
    findEpisode: (id) =>
      Promise.resolve(episodes.find((e) => e.id === id) ?? null),
    findShow: (id) =>
      Promise.resolve(
        id === 's1'
          ? {
              id: 's1',
              userId: 'u1',
              title: 'The Union',
              format: 'explainer',
              brief: EMPTY_BRIEF,
              bible: null,
              createdAt: at,
              updatedAt: at,
            }
          : null,
      ),
    listEpisodes: () => Promise.resolve(episodes),
    listScenesOf: (ids) =>
      Promise.resolve(scenes.filter((s) => ids.includes(s.episodeId))),
    findScene: (id) => Promise.resolve(scenes.find((s) => s.id === id) ?? null),
  };
  const rows: StudioExportRecord[] = [];
  const exports: StudioExportRepository = {
    create: (input) => {
      const row: StudioExportRecord = {
        id: `x${rows.length + 1}`,
        ...input,
        status: 'queued',
        progress: 0,
        fileKey: null,
        bytes: null,
        error: null,
        createdAt: at,
        updatedAt: at,
      };
      rows.unshift(row);
      return Promise.resolve(row);
    },
    find: (id) => Promise.resolve(rows.find((r) => r.id === id) ?? null),
    update: (id, patch) => {
      const row = rows.find((r) => r.id === id)!;
      Object.assign(row, patch);
      return Promise.resolve();
    },
    listSame: (input) =>
      Promise.resolve(
        rows.filter(
          (r) =>
            r.scope === input.scope &&
            r.shape === input.shape &&
            (input.scope === 'show'
              ? r.showId === input.showId
              : r.episodeId === input.episodeId),
        ),
      ),
    listFor: (input) =>
      Promise.resolve(
        rows.filter(
          (r) =>
            r.episodeId === input.episodeId ||
            (r.showId === input.showId && r.scope === 'show'),
        ),
      ),
  };
  const queued: string[] = [];
  const queue = {
    enqueueStudioExport: (job: { exportId: string }) => {
      queued.push(job.exportId);
      return Promise.resolve();
    },
  } as unknown as JobQueuePort;
  let now = at.getTime();
  const config = {
    get: (key: string) =>
      ({
        JWT_ACCESS_SECRET: 'jwt-for-tests',
        API_PUBLIC_URL: 'https://api.test/api/v1/',
      })[key],
  } as unknown as ConfigService;
  const service = new StudioExportService(
    studio as StudioRepository,
    exports,
    queue,
    { now: () => new Date(now) },
    {
      studioBalance: () => Promise.resolve({ watermarked: false }),
    } as unknown as EntitlementsService,
    config,
  );
  return { service, rows, queued, later: (ms: number) => (now += ms) };
}

describe('StudioExportService', () => {
  it('queues a video once, and hands the same one back while it is made', async () => {
    const { service, queued } = api();
    const first = await service.request('u1', 'e1', { scope: 'episode' });
    expect(first).toMatchObject({
      id: 'x1',
      episodeId: 'e1',
      scope: 'episode',
      shape: 'wide',
      status: 'queued',
      url: null,
    });
    const again = await service.request('u1', 'e1', {
      scope: 'episode',
      shape: 'wide',
    });
    expect(again.id).toBe('x1');
    expect(queued).toEqual(['x1']);
    // Without captions it is another video.
    expect(
      (await service.request('u1', 'e1', { scope: 'episode', captions: false }))
        .id,
    ).toBe('x2');
  });

  it('hands back the video already made of an unchanged film, with a download link good for it alone', async () => {
    const { service, rows, queued } = api();
    await service.request('u1', 'e1', { scope: 'episode' });
    Object.assign(rows[0], {
      status: 'done',
      fileKey: 'studio/s1/e1/export-x1.mp4',
      bytes: 99,
      progress: 1,
    });
    const made = await service.request('u1', 'e1', { scope: 'episode' });
    expect(made).toMatchObject({
      id: 'x1',
      status: 'done',
      bytes: 99,
      progress: 1,
    });
    expect(made.url).toMatch(
      /^https:\/\/api\.test\/api\/v1\/studio\/exports\/x1\/download\?key=f\.x1\./,
    );
    expect(queued).toEqual(['x1']);
    const key = new URL(made.url!).searchParams.get('key')!;
    await expect(service.fileByKey('x1', key)).resolves.toEqual({
      key: 'studio/s1/e1/export-x1.mp4',
      name: 'How it began.mp4',
    });
    await expect(service.fileByKey('x2', key)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // The film changed since: a new video.
    Object.assign(rows[0], { filmHash: 'made-from-something-else' });
    expect((await service.request('u1', 'e1', { scope: 'episode' })).id).toBe(
      'x2',
    );
  });

  it('lets go of a video lost with its worker, so it holds nothing up', async () => {
    const { service, rows, later } = api();
    await service.request('u1', 'e1', { scope: 'episode' });
    later(STALE_EXPORT_MS + 1);
    const next = await service.request('u1', 'e1', { scope: 'episode' });
    expect(next.id).toBe('x2');
    expect(rows.find((r) => r.id === 'x1')).toMatchObject({
      status: 'failed',
      error: EXPORT_FAILED,
    });
  });

  it('keeps a vertical video under its lead, asked from either shape, and lists it with the episode', async () => {
    const { service } = api();
    const tall = await service.request('u1', 'e1t', { scope: 'episode' });
    expect(tall).toMatchObject({ episodeId: 'e1', shape: 'tall' });
    expect(
      (await service.request('u1', 'e1', { scope: 'episode', shape: 'tall' }))
        .id,
    ).toBe(tall.id);
    expect(
      (await service.listFor(episode({ id: 'e1t', twinOf: 'e1' }))).map(
        (x) => x.id,
      ),
    ).toEqual([tall.id]);
  });

  it('refuses a film not made, or not in the shape asked for, and one that is not the maker’s', async () => {
    const { service } = api();
    await expect(
      service.request('u1', 'e2', { scope: 'episode' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.request('u2', 'e1', { scope: 'episode' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.get('u2', 'x1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets the render page in by a key for its own episode, or its own show, and nothing else', async () => {
    const { service } = api();
    const now = at.getTime();
    const forEpisode = signKey(
      { scope: 'episode', id: 'e1', expiresAt: now + RENDER_KEY_MS },
      SECRET,
    );
    const forShow = signKey(
      { scope: 'show', id: 's1', expiresAt: now + RENDER_KEY_MS },
      SECRET,
    );
    await expect(
      service.renderEpisode(forEpisode, 'e1'),
    ).resolves.toMatchObject({ id: 'e1' });
    await expect(service.renderEpisode(forShow, 'e1t')).resolves.toMatchObject({
      id: 'e1t',
    });
    await expect(
      service.renderEpisode(forEpisode, 'e1t'),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.renderFile(forEpisode, 'c1', 'audio')).resolves.toBe(
      'c1.mp3',
    );
    await expect(
      service.renderFile(forEpisode, 't1', 'scene'),
    ).rejects.toBeInstanceOf(NotFoundError);
    const spent = signKey(
      { scope: 'episode', id: 'e1', expiresAt: now - 1 },
      SECRET,
    );
    await expect(service.renderEpisode(spent, 'e1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const download = signKey(
      { scope: 'file', id: 'e1', expiresAt: now + RENDER_KEY_MS },
      SECRET,
    );
    await expect(service.renderEpisode(download, 'e1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
