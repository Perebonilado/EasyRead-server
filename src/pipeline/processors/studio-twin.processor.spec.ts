import {
  WATER_OUTLINE,
  WATER_PICTURES,
  WATER_SHEETS,
} from '../../business/domain/__fixtures__/water-cycle-build';
import { briefOf, type StudioBible } from '../../business/domain/studio/studio';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { SceneDto } from '../../contracts';
import type { SceneParts, SceneProcessor } from './scene.processor';
import { StudioProcessor, studioMakeOf } from './studio.processor';

/**
 * An episode's twin in the other shape, made by the worker (studio-
 * vertical-plan §1.4): with its lead, from the same drawings and voice in
 * one make; or later, from its lead's parts as kept. Never voiced, drawn
 * or written again, and never spent again. From fixtures: no model asked.
 */
const at = new Date('2026-09-30T12:00:00Z');
const bible = {
  characters: [],
  sets: [],
  world: null,
  subject: 'science: the water cycle',
  maths: false,
  pictures: WATER_PICTURES,
} as unknown as StudioBible;
const show: StudioShowRecord = {
  id: 'w1',
  userId: 'u1',
  title: 'The Water Cycle',
  format: 'explainer',
  brief: briefOf({
    format: 'explainer',
    idea: 'the water cycle',
    audience: 'children',
    minutes: 1,
    shape: 'both',
  }),
  bible,
  createdAt: at,
  updatedAt: at,
};
const episodeOf = (
  patch: Partial<StudioEpisodeRecord>,
): StudioEpisodeRecord => ({
  id: 'we1',
  showId: 'w1',
  userId: 'u1',
  number: 1,
  title: 'The water cycle',
  logline: null,
  phase: 'script',
  busy: null,
  error: null,
  outline: { title: 'The water cycle', logline: '', scenes: WATER_OUTLINE },
  shareToken: null,
  durationMs: null,
  thumbKey: null,
  createdAt: at,
  updatedAt: at,
  ...patch,
});

/** The water cycle's lead (wide) and its twin (tall), in memory, and a worker over them. */
function worker(
  leadMade: boolean,
  /** Its lead's parts as kept (null: made before they were), and its lead's films as stored, by key. */
  kept: { parts?: SceneParts | null; films?: Record<string, SceneDto> } = {},
) {
  const episodes = new Map<string, StudioEpisodeRecord>([
    ['we1', episodeOf({ shape: 'wide' })],
    ['wt1', episodeOf({ id: 'wt1', shape: 'tall', twinOf: 'we1' })],
  ]);
  const scenes = new Map<string, StudioSceneRecord>();
  WATER_SHEETS.forEach((sheet, position) => {
    scenes.set(`ws${position}`, {
      id: `ws${position}`,
      episodeId: 'we1',
      position,
      sheet,
      status: leadMade ? 'made' : 'making',
      ...(leadMade
        ? {
            sceneKey: `lead-${position}-scene.json`,
            audioKey: `voice-${position}.mp3`,
            thumbKey: `lead-${position}-thumb.png`,
            madeHash: `hash-${position}`,
            durationMs: 20_000,
          }
        : {}),
    } as StudioSceneRecord);
  });
  const repo = {
    findShow: () => Promise.resolve(show),
    findEpisode: (id: string) => Promise.resolve(episodes.get(id) ?? null),
    listEpisodes: () => Promise.resolve([...episodes.values()]),
    updateEpisode: (id: string, patch: Partial<StudioEpisodeRecord>) => {
      episodes.set(id, { ...episodes.get(id)!, ...patch });
      return Promise.resolve();
    },
    listScenes: (episodeId: string) =>
      Promise.resolve(
        [...scenes.values()]
          .filter((s) => s.episodeId === episodeId)
          .sort((a, b) => a.position - b.position),
      ),
    findScene: (id: string) => Promise.resolve(scenes.get(id) ?? null),
    updateScene: (id: string, patch: Partial<StudioSceneRecord>) => {
      scenes.set(id, { ...scenes.get(id)!, ...patch });
      return Promise.resolve();
    },
    syncTwinScenes: (
      twinId: string,
      lead: Pick<StudioSceneRecord, 'id' | 'position' | 'sheet'>[],
    ) => {
      for (const one of lead)
        if (![...scenes.values()].some((s) => s.twinOf === one.id))
          scenes.set(`t-${one.id}`, {
            id: `t-${one.id}`,
            episodeId: twinId,
            position: one.position,
            sheet: one.sheet,
            status: 'ready',
            twinOf: one.id,
          } as StudioSceneRecord);
      return repo.listScenes(twinId);
    },
    noteActivity: () => Promise.resolve(),
    addMessage: () => Promise.resolve({}),
    listMessages: () => Promise.resolve([]),
  };
  const calls = {
    make: [] as Record<string, unknown>[],
    reshape: [] as Record<string, unknown>[],
  };
  const spent: number[] = [];
  const parts: SceneParts = {
    version: 1,
    script: { title: 'x', cast: [], beats: [], steps: [] } as never,
    drawings: [],
    beats: [],
    durationMs: 20_000,
    timing: 'aligned',
  };
  const scenesProcessor = {
    drawThings: () => Promise.resolve(new Map()),
    make: (input: Record<string, unknown>) => {
      calls.make.push(input);
      const twin = input.twin as { base: string } | undefined;
      return Promise.resolve({
        fit: 'good',
        scene: { title: 'x', steps: [], effects: [] },
        sceneKey: `${input.base as string}-scene.json`,
        thumbKey: `${input.base as string}-thumb.png`,
        voice: { audioKey: 'voice-new.mp3', durationMs: 21_000 },
        drawings: new Map(),
        ...(twin
          ? {
              twin: {
                scene: { title: 'x', steps: [], effects: [] },
                sceneKey: `${twin.base}-scene.json`,
                thumbKey: `${twin.base}-thumb.png`,
              },
            }
          : {}),
      });
    },
    partsOf: () =>
      Promise.resolve(kept.parts === undefined ? parts : kept.parts),
    reshape: (input: Record<string, unknown>) => {
      calls.reshape.push(input);
      return Promise.resolve({
        scene: { title: 'x', steps: [], effects: [] },
        sceneKey: `${input.base as string}-scene.json`,
        thumbKey: `${input.base as string}-thumb.png`,
      });
    },
  } as unknown as SceneProcessor;
  const processor = new StudioProcessor(
    repo as unknown as StudioRepository,
    {} as LlmGatewayPort,
    { record: () => Promise.resolve() },
    {
      get: (key: string) =>
        kept.films?.[key]
          ? Promise.resolve(Buffer.from(JSON.stringify(kept.films[key])))
          : Promise.reject(new Error('none')),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    } as never,
    scenesProcessor,
    {
      recordStudioSeconds: (_: string, seconds: number) => {
        spent.push(seconds);
        return Promise.resolve();
      },
    } as never,
    { cast: () => Promise.reject(new Error('none')) } as never,
    { enqueueStudio: () => Promise.resolve() } as never,
  );
  const run = (job: {
    kind: 'make' | 'twin';
    episodeId: string;
    sceneId: string;
  }) =>
    processor.process(
      { ...job, showId: 'w1', userId: 'u1' },
      { attemptsMade: 1, isFinalAttempt: true },
    );
  return { run, calls, spent, scenes, episodes, repo };
}

/** A lead scene's film as stored: its script's words on a voice, and each drawing it asks for as shown. */
function filmOf(position: number, words?: (say: string) => string): SceneDto {
  const w = worker(true);
  const rows = [...w.scenes.values()].filter((s) => s.episodeId === 'we1');
  const of = studioMakeOf(
    show,
    episodeOf({ shape: 'wide' }),
    rows[position],
    rows,
    bible,
  );
  const script = of.script!;
  return {
    title: script.title,
    durationMs: 20_000,
    timing: 'aligned',
    beats: script.beats.map((beat, k) => ({
      text: words ? words(beat.say) : beat.say,
      startMs: k * 1000,
      endMs: k * 1000 + 800,
      words: [],
    })),
    things: script.cast.flatMap((thing) =>
      thing.kind === 'drawing'
        ? [
            {
              id: thing.id,
              kind: 'drawing',
              svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="p"><circle cx="50" cy="50" r="40"/></g></svg>',
              aspect: 1,
              caption: thing.name,
              parts: {},
              labels: {},
              states: {},
              hidden: [],
              moves: false,
            },
          ]
        : [],
    ),
    steps: [],
    effects: [],
  } as unknown as SceneDto;
}

describe('an episode made in both shapes', () => {
  it('composes the twin’s scene in the same make: one voice, one set of drawings, the audio shared', async () => {
    const { run, calls, spent, scenes, episodes } = worker(false);
    await run({ kind: 'make', episodeId: 'we1', sceneId: 'ws0' });
    expect(calls.make).toHaveLength(1);
    expect(calls.reshape).toHaveLength(0);
    // The lead in its own shape (wide says nothing), its parts kept, its twin asked for tall.
    expect(calls.make[0]).toMatchObject({
      parts: true,
      twin: { shape: 'tall' },
    });
    expect(calls.make[0].shape).toBeUndefined();
    const lead = scenes.get('ws0')!;
    const twin = scenes.get('t-ws0')!;
    expect(twin).toMatchObject({
      status: 'made',
      episodeId: 'wt1',
      audioKey: lead.audioKey,
      madeHash: lead.madeHash,
      durationMs: lead.durationMs,
      sheet: lead.sheet,
    });
    expect(twin.sceneKey).toMatch(/^studio\/w1\/wt1\//);
    expect(twin.sceneKey).not.toBe(lead.sceneKey);
    // Spent once, for the lead: the twin is the same film.
    expect(spent).toEqual([21]);
    // The twin settles once none of its scenes is making.
    expect(episodes.get('wt1')!.busy).toBeNull();
  });
});

describe('the other shape made later', () => {
  it('composes a twin’s scene from its lead’s parts: nothing made, voiced or spent', async () => {
    const { run, calls, spent, scenes } = worker(true);
    scenes.set('t-ws1', {
      id: 't-ws1',
      episodeId: 'wt1',
      position: 1,
      sheet: WATER_SHEETS[1],
      status: 'making',
      twinOf: 'ws1',
    } as StudioSceneRecord);
    await run({ kind: 'twin', episodeId: 'wt1', sceneId: 't-ws1' });
    expect(calls.make).toHaveLength(0);
    expect(calls.reshape).toHaveLength(1);
    expect(calls.reshape[0]).toMatchObject({ shape: 'tall', story: null });
    expect(spent).toEqual([]);
    expect(scenes.get('t-ws1')).toMatchObject({
      status: 'made',
      audioKey: 'voice-1.mp3',
      madeHash: 'hash-1',
      durationMs: 20_000,
    });
  });

  it('says a twin’s scene could not be made when its lead’s is not made, and leaves the lead as it is', async () => {
    const { run, scenes } = worker(false);
    scenes.set('t-ws0', {
      id: 't-ws0',
      episodeId: 'wt1',
      position: 0,
      sheet: WATER_SHEETS[0],
      status: 'making',
      twinOf: 'ws0',
    } as StudioSceneRecord);
    await run({ kind: 'twin', episodeId: 'wt1', sceneId: 't-ws0' });
    expect(scenes.get('t-ws0')).toMatchObject({ status: 'failed' });
    expect(scenes.get('ws0')!.status).toBe('making');
  });

  it('rebuilds a lesson’s parts from its film when it was made before they were kept: nothing made, voiced or spent', async () => {
    const film = filmOf(1);
    const { run, calls, spent, scenes } = worker(true, {
      parts: null,
      films: { 'lead-1-scene.json': film },
    });
    scenes.set('t-ws1', {
      id: 't-ws1',
      episodeId: 'wt1',
      position: 1,
      sheet: WATER_SHEETS[1],
      status: 'failed',
      twinOf: 'ws1',
    } as StudioSceneRecord);
    await run({ kind: 'twin', episodeId: 'wt1', sceneId: 't-ws1' });
    expect(calls.make).toHaveLength(0);
    expect(calls.reshape).toHaveLength(1);
    const parts = calls.reshape[0].parts as SceneParts;
    expect(calls.reshape[0]).toMatchObject({ shape: 'tall', story: null });
    // Its voice as the film plays it, its drawings as the film shows them.
    expect(parts.beats.map((b) => b.text)).toEqual(
      film.beats.map((b) => b.text),
    );
    expect(parts.drawings.map(([id]) => id)).toEqual(
      film.things.map((t) => t.id),
    );
    expect(spent).toEqual([]);
    expect(scenes.get('t-ws1')).toMatchObject({
      status: 'made',
      audioKey: 'voice-1.mp3',
      error: null,
    });
  });

  it('says plainly that a scene must be made again when its film is not its script’s now', async () => {
    const { run, calls, scenes } = worker(true, {
      parts: null,
      films: { 'lead-1-scene.json': filmOf(1, (say) => `${say} Changed.`) },
    });
    scenes.set('t-ws1', {
      id: 't-ws1',
      episodeId: 'wt1',
      position: 1,
      sheet: WATER_SHEETS[1],
      status: 'making',
      twinOf: 'ws1',
    } as StudioSceneRecord);
    await run({ kind: 'twin', episodeId: 'wt1', sceneId: 't-ws1' });
    expect(calls.reshape).toHaveLength(0);
    expect(scenes.get('t-ws1')).toMatchObject({
      status: 'failed',
      error: 'This scene needs making again before it can be vertical.',
    });
  });

  it('never leaves a twin’s scene making when its lead’s scene is gone', async () => {
    const { run, scenes } = worker(true);
    scenes.set('t-gone', {
      id: 't-gone',
      episodeId: 'wt1',
      position: 9,
      sheet: WATER_SHEETS[0],
      status: 'making',
      twinOf: 'nowhere',
    } as StudioSceneRecord);
    await run({ kind: 'twin', episodeId: 'wt1', sceneId: 't-gone' });
    expect(scenes.get('t-gone')).toMatchObject({
      status: 'failed',
      error: 'This scene needs making again before it can be vertical.',
    });
  });
});
