import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import {
  bibleOf,
  briefOf,
  outlineOf,
} from '../../business/domain/studio/studio';
import { RUBRIC_KEYS } from '../../business/domain/studio/studio-script';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { StudioJobData } from '../queues';
import type { SceneProcessor } from './scene.processor';
import { StudioProcessor } from './studio.processor';

/**
 * A story's script written by the worker (story plan S4): once every
 * scene is written, the table read reads it before it is ready; below the
 * bar the failing scene is written again with its notes and kept, and the
 * score is logged, never said to the maker. A read that cannot run leaves
 * the script as written.
 */

const tobi = (file: string): unknown =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../business/domain/studio/__fixtures__/tobi', file),
      'utf8',
    ),
  );
const at = new Date('2026-09-29T08:00:00Z');
const bible = bibleOf(tobi('bible.json'));
const usage = { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 };
/** Every item at n; clarity clear (a first-time viewer follows it). */
const scores = (n: number) => ({
  ...Object.fromEntries(RUBRIC_KEYS.map((k) => [k, n])),
  clarity: 8,
});

function worker(reads: (() => Promise<unknown>)[]) {
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: 'Tobi',
    format: 'story',
    brief: briefOf({
      format: 'story',
      idea: 'A first day at school',
      audience: 'young children',
      minutes: 1.5,
      tone: 'gentle',
      // Its scenes are told by a storyteller: the maker chose one.
      narrator: 'storyteller',
    }),
    bible,
    createdAt: at,
    updatedAt: at,
  };
  const outline = outlineOf({
    title: 'The First Day',
    logline: 'Tobi gets ready for school.',
    scenes: ['Up Before the Alarm', 'Up Before the Alarm'].map((title) => ({
      title,
      summary: 'Tobi gets up and dressed.',
      set: 'bedroom',
      cast: ['tobi', 'mama'],
      seconds: 45,
    })),
  });
  const episodes = new Map<string, StudioEpisodeRecord>([
    [
      'e1',
      {
        id: 'e1',
        showId: 's1',
        userId: 'u1',
        number: 1,
        title: 'The First Day',
        logline: null,
        phase: 'script',
        busy: 'script',
        error: null,
        outline,
        shareToken: null,
        durationMs: null,
        thumbKey: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
  ]);
  const scenes = new Map<string, StudioSceneRecord>();
  const row = (id: string, position: number): StudioSceneRecord => ({
    id,
    episodeId: 'e1',
    position,
    sheet: null,
    sheetHash: null,
    problems: [],
    previousSheet: null,
    status: 'writing',
    step: null,
    error: null,
    sceneKey: null,
    audioKey: null,
    thumbKey: null,
    madeHash: null,
    durationMs: null,
    updatedAt: at,
  });
  const messages: StudioMessageRecord[] = [];
  const repo: Partial<StudioRepository> = {
    findShow: () => Promise.resolve({ ...show }),
    findEpisode: (id) => Promise.resolve(episodes.get(id) ?? null),
    listEpisodes: () => Promise.resolve([...episodes.values()]),
    updateShow: () => Promise.resolve(),
    updateEpisode: (id, patch) => {
      episodes.set(id, { ...episodes.get(id)!, ...patch });
      return Promise.resolve();
    },
    replaceScenes: (_, count) => {
      scenes.clear();
      for (let k = 0; k < count; k += 1) scenes.set(`c${k}`, row(`c${k}`, k));
      return Promise.resolve([...scenes.values()]);
    },
    listScenes: () => Promise.resolve([...scenes.values()]),
    findScene: (id) => Promise.resolve(scenes.get(id) ?? null),
    updateScene: (id, patch) => {
      scenes.set(id, { ...scenes.get(id)!, ...patch });
      return Promise.resolve();
    },
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
  const written: { problems?: string[] }[] = [];
  let read = 0;
  const recorded: string[] = [];
  const llm = {
    studioScene: (input: { problems?: string[] }) => {
      written.push(input);
      const sheet = tobi('s1-sheet.json') as { title: string };
      // Written again with its notes: its title says so.
      return Promise.resolve({
        value: input.problems?.some((p) => p.startsWith('Beat 2'))
          ? { ...sheet, title: 'Up Before the Alarm, Again' }
          : sheet,
        usage,
      });
    },
    studioTableRead: () => {
      const next = reads[Math.min(read, reads.length - 1)];
      read += 1;
      return next().then((value) => ({ value, usage }));
    },
  } as unknown as LlmGatewayPort;
  const processor = new StudioProcessor(
    repo as StudioRepository,
    llm,
    {
      record: ({ task }: { task: string }) => {
        recorded.push(task);
        return Promise.resolve();
      },
    },
    { delete: () => Promise.resolve() } as never,
    {} as SceneProcessor,
    {} as never,
    {} as never,
    { enqueueStudio: () => Promise.resolve() } as never,
  );
  return {
    processor,
    scenes,
    episodes,
    messages,
    written,
    recorded,
    reads: () => read,
  };
}

const job: StudioJobData = {
  kind: 'script',
  showId: 's1',
  episodeId: 'e1',
  userId: 'u1',
};
const context = { attemptsMade: 1, isFinalAttempt: true, jobId: 'j1' };

describe('the table read, as the worker writes a script', () => {
  let logged: string[];
  beforeEach(() => {
    logged = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('reads the whole script before it is ready, writes the failing scene again, and logs the score', async () => {
    const s = worker([
      () =>
        Promise.resolve({
          scores: scores(6),
          overall: 5.9,
          scenes: [
            { scene: 1, score: 8, notes: [] },
            {
              scene: 2,
              score: 4,
              notes: ['Beat 2: Mama says she is proud; show it: a hug.'],
            },
          ],
          verdict: 'Flat in the middle.',
        }),
      () =>
        Promise.resolve({
          scores: scores(8),
          overall: 7.7,
          scenes: [],
          verdict: 'Warm and clear.',
        }),
    ]);
    await s.processor.process(job, context);
    expect(s.reads()).toBe(2);
    // The failing scene only, with its notes.
    const again = s.written.filter((w) => w.problems?.length);
    expect(again[0].problems?.[0]).toBe(
      'Beat 2: Mama says she is proud; show it: a hug.',
    );
    expect(s.scenes.get('c1')?.sheet?.title).toBe('Up Before the Alarm, Again');
    expect(s.scenes.get('c0')?.sheet?.title).toBe('Up Before the Alarm');
    // The critic on the check model; the writer on its own.
    expect(s.recorded.filter((t) => t === 'studio_check')).toHaveLength(2);
    expect(logged.join('\n')).toMatch(
      /studio e1: story: table read 7\.7 \(first read 5\.9; 1 scene rewrites in 1 round; read 2 kept\): Warm and clear\./,
    );
    // Silent to the maker: nothing in the thread of scores or notes.
    expect(s.messages.map((m) => m.content).join(' ')).not.toMatch(
      /table read|5\.9|7\.7|Beat 2/,
    );
    expect(s.episodes.get('e1')?.busy).toBeNull();
  });

  it('leaves the script as written when the read cannot run', async () => {
    const s = worker([() => Promise.reject(new Error('the critic is away'))]);
    await s.processor.process(job, context);
    expect(s.scenes.get('c1')?.sheet?.title).toBe('Up Before the Alarm');
    expect(s.scenes.get('c1')?.status).toBe('ready');
    expect(s.episodes.get('e1')?.error).toBeNull();
  });
});
