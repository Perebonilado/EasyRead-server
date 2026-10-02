/**
 * A film made into a video file on the worker (studio-export): the row's
 * life from queued to done or failed, the render page each film is drawn
 * from (its key, its options), the sound built from each voice and the
 * page's beds, the films joined with their chapters, the file kept, and
 * the thread told. The browser and ffmpeg are fakes: their own parts are
 * the domain's (studio-export.spec) and the capture's.
 */
import { writeFile } from 'node:fs/promises';
import type { ConfigService } from '@nestjs/config';
import { EMPTY_BRIEF } from '../../business/domain/studio/studio';
import {
  EXPORT_FAILED,
  keySecret,
  readKey,
} from '../../business/domain/studio/studio-export';
import type { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import type { StoragePort } from '../../business/ports/storage.port';
import type {
  StudioExportPatch,
  StudioExportRecord,
  StudioExportRepository,
} from '../../business/repositories/studio-export.repository';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { VideoTools } from '../export/ffmpeg';
import type {
  CaptureInput,
  CapturedFilm,
  FilmCapturePort,
} from '../export/film-capture';
import { StudioExportProcessor } from './studio-export.processor';

const at = new Date('2026-10-01T12:00:00Z');
const SECRET_ENV = { JWT_ACCESS_SECRET: 'jwt-for-tests' };

const LOUDNORM = `{
  "input_i" : "-23.0", "input_tp" : "-4.0", "input_lra" : "6.0", "input_thresh" : "-33.5",
  "output_i" : "-14.0", "output_tp" : "-1.5", "output_lra" : "5.0", "output_thresh" : "-24.0",
  "normalization_type" : "dynamic", "target_offset" : "0.2"
}`;

function episode(patch: Partial<StudioEpisodeRecord>): StudioEpisodeRecord {
  return {
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
  };
}

function scene(
  id: string,
  episodeId: string,
  position: number,
  made = true,
): StudioSceneRecord {
  return {
    id,
    episodeId,
    position,
    sheet: null,
    sheetHash: null,
    problems: [],
    previousSheet: null,
    status: made ? 'made' : 'ready',
    step: null,
    error: null,
    sceneKey: made ? `${id}-scene.json` : null,
    audioKey: made ? `${id}-voice.mp3` : null,
    thumbKey: null,
    madeHash: null,
    durationMs: made ? 30_000 : null,
    updatedAt: at,
  };
}

function worker(
  options: { fail?: (input: CaptureInput) => Error | null } = {},
) {
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: 'The Union',
    format: 'explainer',
    brief: EMPTY_BRIEF,
    bible: null,
    createdAt: at,
    updatedAt: at,
  };
  const episodes = new Map<string, StudioEpisodeRecord>([
    ['e1', episode({})],
    ['e1t', episode({ id: 'e1t', shape: 'tall', twinOf: 'e1' })],
    ['e2', episode({ id: 'e2', number: 2, title: 'Why it nearly fell apart' })],
    [
      'e3',
      episode({ id: 'e3', number: 3, title: 'Not yet made', phase: 'outline' }),
    ],
  ]);
  const scenes = [
    scene('c1', 'e1', 0),
    scene('c2', 'e1', 1),
    scene('t1', 'e1t', 0),
    scene('d1', 'e2', 0),
    scene('x1', 'e3', 0, false),
  ];
  const messages: StudioMessageRecord[] = [];
  const studio: Partial<StudioRepository> = {
    findShow: () => Promise.resolve(show),
    findEpisode: (id) => Promise.resolve(episodes.get(id) ?? null),
    listEpisodes: () => Promise.resolve([...episodes.values()]),
    listScenesOf: (ids) =>
      Promise.resolve(scenes.filter((s) => ids.includes(s.episodeId))),
    findScene: (id) => Promise.resolve(scenes.find((s) => s.id === id) ?? null),
    addMessage: (input) => {
      const message: StudioMessageRecord = {
        id: input.id ?? `m${messages.length}`,
        showId: input.showId,
        episodeId: input.episodeId,
        role: input.role,
        content: input.content,
        meta: input.meta ?? null,
        createdAt: at,
      };
      messages.push(message);
      return Promise.resolve(message);
    },
    listMessages: () => Promise.resolve([...messages]),
  };

  const rows = new Map<string, StudioExportRecord>();
  const history: StudioExportPatch[] = [];
  const exports: StudioExportRepository = {
    create: () => Promise.reject(new Error('not here')),
    find: (id) => Promise.resolve(rows.get(id) ?? null),
    update: (id, patch) => {
      history.push(patch);
      rows.set(id, { ...rows.get(id)!, ...patch });
      return Promise.resolve();
    },
    listSame: () => Promise.resolve([]),
    listFor: () => Promise.resolve([]),
  };
  const add = (patch: Partial<StudioExportRecord>) => {
    const row: StudioExportRecord = {
      id: 'x1',
      showId: 's1',
      episodeId: 'e1',
      userId: 'u1',
      scope: 'episode',
      shape: 'wide',
      captions: true,
      status: 'queued',
      progress: 0,
      fileKey: null,
      bytes: null,
      error: null,
      filmHash: 'asked',
      createdAt: at,
      updatedAt: at,
      ...patch,
    };
    rows.set(row.id, row);
    return row;
  };

  const kept: { key: string; mimeType: string }[] = [];
  const storage: Partial<StoragePort> = {
    get: (ref) => Promise.resolve(Buffer.from(`voice of ${ref}`)),
    put: async ({ key, body, mimeType }) => {
      // Read through, as the adapters do.
      if (!Buffer.isBuffer(body)) for await (const chunk of body) void chunk;
      kept.push({ key, mimeType });
      return { ref: key, sizeBytes: 123_456, mimeType };
    },
  };

  const runs: string[][] = [];
  const tools: VideoTools = {
    run: async (args) => {
      runs.push([...args]);
      // What it writes, written: the last argument, a file.
      const out = args[args.length - 1];
      if (out.endsWith('.mp4')) await writeFile(out, 'mp4');
      return { report: args.includes('null') ? LOUDNORM : '' };
    },
    encoder: () => {
      throw new Error('the capture is a fake');
    },
    durationOf: () => Promise.resolve(0),
  };

  const captures: CaptureInput[] = [];
  const capture: FilmCapturePort = {
    capture: (input) => {
      captures.push(input);
      const failure = options.fail?.(input);
      if (failure) return Promise.reject(failure);
      input.onFrames?.(10, 20);
      input.onFrames?.(20, 20);
      const episodeId = new URL(input.url).pathname.split('/').pop()!;
      const voices = scenes
        .filter((s) => s.episodeId === episodeId && s.audioKey)
        .map((s, k) => ({
          sceneId: s.id,
          url: `x/${s.id}`,
          startsAtMs: 1500 + k * 31_000,
          inMs: 0,
          outMs: 30_000,
        }));
      const film: CapturedFilm = {
        durationMs: 66_500,
        frames: 1996,
        voices,
        chapters:
          episodeId === 'e1' ? [{ atMs: 31_000, title: 'The deal' }] : [],
        music: `${input.workDir}/${input.name}-music.wav`,
        effects: null,
        stats: { ms: 1000, framesPerSecond: 20, relaunches: 0, pages: 1 },
      };
      return Promise.resolve(film);
    },
    stills: () => Promise.reject(new Error('the export takes no stills')),
  };

  const config = {
    get: (key: string) =>
      ({ ...SECRET_ENV, RENDER_WEB_URL: 'http://web.test/', EXPORT_FPS: '30' })[
        key
      ],
  } as unknown as ConfigService;
  const entitlements = {
    studioBalance: () => Promise.resolve({ watermarked: false }),
  } as unknown as EntitlementsService;

  const processor = new StudioExportProcessor(
    exports,
    studio as StudioRepository,
    storage as StoragePort,
    { now: () => at },
    entitlements,
    config,
    tools,
    capture,
  );
  return { processor, add, rows, history, captures, runs, kept, messages };
}

const go = { attemptsMade: 1, isFinalAttempt: false };

describe('StudioExportProcessor', () => {
  it('draws the episode from its render page, builds its sound, keeps the video and says it is ready', async () => {
    const w = worker();
    w.add({});
    await w.processor.process({ exportId: 'x1' }, go);

    // Drawn from the render page, by a key good for that episode alone.
    expect(w.captures).toHaveLength(1);
    const url = new URL(w.captures[0].url);
    expect(url.origin + url.pathname).toBe('http://web.test/render/e1');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      captions: '1',
      title: '1',
      end: '1',
      fps: '30',
    });
    const secret = keySecret({ access: SECRET_ENV.JWT_ACCESS_SECRET });
    expect(
      readKey(url.searchParams.get('key'), secret, at.getTime()),
    ).toMatchObject({ scope: 'episode', id: 'e1' });
    expect([w.captures[0].width, w.captures[0].height]).toEqual([1920, 1080]);

    // The sound: measured, then muxed with each voice from storage and the page's music.
    const [measure, mux, meta] = w.runs;
    expect(measure.join(' ')).toContain('print_format=json');
    expect(mux.filter((a) => a.endsWith('.mp3'))).toHaveLength(2);
    expect(mux.some((a) => a.endsWith('film-0-music.wav'))).toBe(true);
    expect(mux.join(' ')).toContain('measured_I=-23');
    // One film: given its title and its acts as chapters, its streams copied.
    expect(meta).toEqual(
      expect.arrayContaining(['-map_chapters', '1', 'copy']),
    );

    // Kept beside the episode's scenes, done, and told in the thread.
    expect(w.kept).toEqual([
      { key: 'studio/s1/e1/export-x1.mp4', mimeType: 'video/mp4' },
    ]);
    expect(w.rows.get('x1')).toMatchObject({
      status: 'done',
      progress: 1,
      fileKey: 'studio/s1/e1/export-x1.mp4',
      bytes: 123_456,
      error: null,
    });
    expect(w.rows.get('x1')!.filmHash).toHaveLength(32);
    expect(w.history[0]).toEqual({
      status: 'rendering',
      progress: 0,
      error: null,
    });
    expect(
      w.history.some(
        (p) => p.progress !== undefined && p.progress > 0 && p.progress < 1,
      ),
    ).toBe(true);
    const told = w.messages.map((m) => m.meta?.event);
    expect(told).toEqual([
      expect.objectContaining({
        what: 'export',
        step: 'made',
        line: 'Your video is ready: “How it began” (wide, 1:07)',
      }),
    ]);
  });

  it('draws a vertical video from the episode’s tall twin', async () => {
    const w = worker();
    w.add({ shape: 'tall' });
    await w.processor.process({ exportId: 'x1' }, go);
    expect(new URL(w.captures[0].url).pathname).toBe('/render/e1t');
    expect([w.captures[0].width, w.captures[0].height]).toEqual([1080, 1920]);
    expect(w.rows.get('x1')!.status).toBe('done');
  });

  it('makes a whole show’s video: each made episode in order, one end card, joined with chapters', async () => {
    const w = worker();
    w.add({ scope: 'show', captions: false });
    await w.processor.process({ exportId: 'x1' }, go);
    expect(w.captures.map((c) => new URL(c.url).pathname)).toEqual([
      '/render/e1',
      '/render/e2',
    ]);
    expect(
      w.captures.map((c) => new URL(c.url).searchParams.get('end')),
    ).toEqual(['0', '1']);
    expect(
      w.captures.map((c) => new URL(c.url).searchParams.get('captions')),
    ).toEqual(['0', '0']);
    const join = w.runs[w.runs.length - 1];
    expect(join).toEqual(
      expect.arrayContaining(['concat', '-map_chapters', 'copy']),
    );
    expect(w.messages[0].meta?.event?.line).toBe(
      'Your video is ready: “The Union” (the whole show, 2:13)',
    );
  });

  it('puts the video back in the queue when a try fails with another to come, and fails it in plain words on the last', async () => {
    const crash = () => new Error('Target closed');
    const w = worker({ fail: crash });
    w.add({});
    await expect(w.processor.process({ exportId: 'x1' }, go)).rejects.toThrow(
      'Target closed',
    );
    expect(w.rows.get('x1')).toMatchObject({
      status: 'queued',
      progress: 0,
      error: null,
    });

    await expect(
      w.processor.process(
        { exportId: 'x1' },
        { attemptsMade: 2, isFinalAttempt: true },
      ),
    ).rejects.toThrow();
    expect(w.rows.get('x1')).toMatchObject({
      status: 'failed',
      error: EXPORT_FAILED,
    });
    expect(w.kept).toEqual([]);
  });

  it('fails at once a video of nothing made, and leaves alone one done or let go', async () => {
    const w = worker();
    w.add({ episodeId: 'e3' });
    await expect(w.processor.process({ exportId: 'x1' }, go)).rejects.toThrow(
      'No film of it is made',
    );
    expect(w.rows.get('x1')!.status).toBe('failed');

    for (const status of ['done', 'failed'] as const) {
      const again = worker();
      again.add({ status });
      await again.processor.process({ exportId: 'x1' }, go);
      expect(again.captures).toEqual([]);
    }
    await worker().processor.process({ exportId: 'gone' }, go);
  });
});
