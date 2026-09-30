/**
 * A film's shape, as the Studio keeps it (studio-vertical-plan, Richard's
 * decisions of 2026-09-30): wide by default, vertical when the maker says
 * so, both as twin episodes on one script and one voice, and the other
 * shape made any time after, from the film as made. No model is asked.
 */
import {
  bibleOf,
  briefOf,
  outlineOf,
  storySheetOf,
} from '../../domain/studio/studio';
import { NotFoundError } from '../../domain/errors/errors';
import type { JobQueuePort, StudioJob } from '../../ports/job-queue.port';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../repositories/studio.repository';
import type { SceneVoiceService } from '../admin/scene-voice.service';
import type { EntitlementsService } from '../documents/entitlements.service';
import { StudioCastService } from './studio-cast.service';
import { StudioService } from './studio.service';
import { sceneFingerprint } from './studio-views';
import { needsRemaking } from './studio-twins';

const at = new Date('2026-09-30T12:00:00Z');
const bible = bibleOf({
  characters: [{ name: 'Ama', voice: 'girl', figure: { age: 'child' } }],
  sets: [{ name: 'Market' }],
});
const outline = outlineOf({
  title: 'The Last Mango',
  logline: 'Ama wants the last mango.',
  scenes: [
    { title: 'Stall', summary: 'Ama sees it.', set: 'market', seconds: 30 },
    { title: 'Home', summary: 'She shares it.', set: 'market', seconds: 30 },
  ],
});
const sheetOf = (title: string, say: string) =>
  storySheetOf({
    title,
    set: 'market',
    onStage: [{ who: 'ama', spot: 'left' }],
    beats: [{ kind: 'line', who: 'ama', say, feeling: 'happy' }],
  });

/** A show of one episode of two scenes, in memory, in the phase and shape given. */
function studioWith(
  shape: 'wide' | 'tall' | 'both' | null,
  episodeAt: Partial<StudioEpisodeRecord> = {},
  madeScenes = false,
) {
  const brief = briefOf({
    format: 'story',
    idea: 'A girl and the last mango',
    audience: 'children',
    minutes: 1,
    tone: 'funny',
    ...(shape ? { shape } : {}),
  });
  const shows = new Map<string, StudioShowRecord>();
  const episodes = new Map<string, StudioEpisodeRecord>();
  const scenes = new Map<string, StudioSceneRecord>();
  const messages: StudioMessageRecord[] = [];
  let ids = 0;
  const scene = (patch: Partial<StudioSceneRecord>): StudioSceneRecord => ({
    id: 'c0',
    episodeId: 'e1',
    position: 0,
    sheet: null,
    sheetHash: null,
    problems: [],
    previousSheet: null,
    status: 'ready',
    step: null,
    error: null,
    sceneKey: null,
    audioKey: null,
    thumbKey: null,
    madeHash: null,
    durationMs: null,
    updatedAt: at,
    ...patch,
  });
  const repo: Partial<StudioRepository> = {
    listShows: () => Promise.resolve([...shows.values()]),
    findShow: (id) => Promise.resolve(shows.get(id) ?? null),
    updateShow: (id, patch) => {
      shows.set(id, { ...shows.get(id)!, ...patch });
      return Promise.resolve();
    },
    findEpisode: (id) => Promise.resolve(episodes.get(id) ?? null),
    listEpisodes: (showId) =>
      Promise.resolve(
        [...episodes.values()]
          .filter((e) => e.showId === showId)
          .sort((a, b) => a.number - b.number),
      ),
    createEpisode: (input) => {
      const episode: StudioEpisodeRecord = {
        ...input,
        id: `e${++ids + 100}`,
        logline: null,
        busy: null,
        error: null,
        outline: null,
        shareToken: null,
        durationMs: null,
        thumbKey: null,
        createdAt: at,
        updatedAt: at,
      };
      episodes.set(episode.id, episode);
      return Promise.resolve(episode);
    },
    updateEpisode: (id, patch) => {
      episodes.set(id, { ...episodes.get(id)!, ...patch });
      return Promise.resolve();
    },
    claimEpisode: (id, busy) => {
      const episode = episodes.get(id)!;
      if (episode.busy) return Promise.resolve(false);
      episodes.set(id, { ...episode, busy });
      return Promise.resolve(true);
    },
    listScenes: (episodeId) =>
      Promise.resolve(
        [...scenes.values()]
          .filter((s) => s.episodeId === episodeId)
          .sort((a, b) => a.position - b.position),
      ),
    listScenesOf: (ids) =>
      Promise.resolve(
        [...scenes.values()].filter((s) => ids.includes(s.episodeId)),
      ),
    findScene: (id) => Promise.resolve(scenes.get(id) ?? null),
    updateScene: (id, patch) => {
      scenes.set(id, { ...scenes.get(id)!, ...patch });
      return Promise.resolve();
    },
    syncTwinScenes: (twinId, lead) => {
      for (const one of lead) {
        const kept = [...scenes.values()].find(
          (s) => s.episodeId === twinId && s.twinOf === one.id,
        );
        if (kept)
          scenes.set(kept.id, {
            ...kept,
            position: one.position,
            sheet: one.sheet,
          });
        else {
          const row = scene({
            id: `t${++ids}`,
            episodeId: twinId,
            position: one.position,
            sheet: one.sheet,
            twinOf: one.id,
          });
          scenes.set(row.id, row);
        }
      }
      return repo.listScenes!(twinId);
    },
    makingFor: () => Promise.resolve(0),
    addMessage: (input) => {
      const message: StudioMessageRecord = {
        id: input.id ?? `m${++ids}`,
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
    listMessages: (showId) =>
      Promise.resolve(messages.filter((m) => m.showId === showId)),
    countUserMessagesSince: () => Promise.resolve(0),
  };
  shows.set('s1', {
    id: 's1',
    userId: 'u1',
    title: 'Market Days',
    format: 'story',
    brief,
    bible,
    createdAt: at,
    updatedAt: at,
  });
  episodes.set('e1', {
    id: 'e1',
    showId: 's1',
    userId: 'u1',
    number: 1,
    title: 'The Last Mango',
    logline: outline.logline,
    phase: 'script',
    busy: null,
    error: null,
    outline,
    shareToken: null,
    durationMs: null,
    thumbKey: null,
    createdAt: at,
    updatedAt: at,
    ...episodeAt,
  });
  const sheets = [
    sheetOf('Stall', 'That one is mine!'),
    sheetOf('Home', 'Half each.'),
  ];
  sheets.forEach((sheet, position) => {
    const made = madeScenes
      ? {
          status: 'made' as const,
          sceneKey: `scene-${position}-scene.json`,
          audioKey: `voice-${position}.mp3`,
          thumbKey: `thumb-${position}.png`,
          durationMs: 30_000,
          madeHash: sceneFingerprint(sheet, bible, brief, []),
        }
      : {};
    scenes.set(
      `c${position}`,
      scene({ id: `c${position}`, position, sheet, ...made }),
    );
  });
  const jobs: StudioJob[] = [];
  const queue = {
    enqueueStudio: (more: StudioJob[]) => {
      jobs.push(...more);
      return Promise.resolve();
    },
  } as unknown as JobQueuePort;
  const entitlements = {
    forUser: () => Promise.resolve({ assertStudioAvailable: () => undefined }),
    studioBalance: () =>
      Promise.resolve({
        remainingSeconds: null,
        allowanceSeconds: null,
        usedThisMonthSeconds: 0,
        watermarked: false,
      }),
  } as unknown as EntitlementsService;
  const files = new Map<string, Buffer>();
  const storage = {
    get: (key: string) =>
      files.has(key)
        ? Promise.resolve(files.get(key)!)
        : Promise.reject(new NotFoundError('File')),
    put: ({ key, body }: { key: string; body: Buffer }) => {
      files.set(key, body);
      return Promise.resolve({ key, size: body.length });
    },
    delete: () => Promise.resolve(),
  };
  const service = new StudioService(
    repo as StudioRepository,
    {} as LlmGatewayPort,
    queue,
    storage as never,
    { now: () => at },
    { record: () => Promise.resolve() },
    entitlements,
    new StudioCastService(storage as never),
    {} as SceneVoiceService,
  );
  const twins = () => [...episodes.values()].filter((e) => e.twinOf);
  const rowsOf = (id: string) =>
    [...scenes.values()]
      .filter((s) => s.episodeId === id)
      .sort((a, b) => a.position - b.position);
  return { service, episodes, scenes, jobs, messages, twins, rowsOf, shows };
}

describe('the film’s shape, chosen when it is planned', () => {
  it('is wide by default: no twin, and the episode says wide', async () => {
    const { service, twins } = studioWith(null, { phase: 'cast' });
    const episode = await service.approve('u1', 'e1');
    expect(episode.shape).toBe('wide');
    expect(episode.twin).toBeNull();
    expect(twins()).toHaveLength(0);
  });

  it('makes the episode vertical when the brief asks for it, as the outline is approved', async () => {
    const { service, episodes, twins } = studioWith('tall', { phase: 'cast' });
    const episode = await service.approve('u1', 'e1');
    expect(episode.shape).toBe('tall');
    expect(episodes.get('e1')!.shape).toBe('tall');
    expect(twins()).toHaveLength(0);
  });

  it('begins a vertical twin when the maker chose both, listed on its episode, never as one of its own', async () => {
    const { service, twins } = studioWith('both', { phase: 'cast' });
    const episode = await service.approve('u1', 'e1');
    expect(episode.shape).toBe('wide');
    expect(twins()).toHaveLength(1);
    expect(twins()[0]).toMatchObject({
      shape: 'tall',
      twinOf: 'e1',
      number: 1,
    });
    expect(episode.twin).toMatchObject({ shape: 'tall', made: false });
    const show = await service.show('u1', 's1');
    expect(show.shape).toBe('both');
    expect(show.episodes).toHaveLength(1);
    expect(show.episodes[0]).toMatchObject({ id: 'e1', twinShape: 'tall' });
  });

  it('keeps a made film in the shape it was made in, whatever the brief says after', async () => {
    const { service, episodes } = studioWith('tall', { phase: 'made' }, true);
    await service.make('u1', 'e1').catch(() => undefined);
    expect(episodes.get('e1')!.shape ?? 'wide').toBe('wide');
  });
});

describe('both shapes: twins that share the script and the voice', () => {
  it('makes the lead’s scenes once, and keeps its twin’s scenes in step, each the same sheet', async () => {
    const { service, jobs, twins, rowsOf, episodes } = studioWith('both', {
      phase: 'cast',
    });
    await service.approve('u1', 'e1');
    // The scenes written, as the worker writes them.
    episodes.set('e1', { ...episodes.get('e1')!, busy: null });
    jobs.length = 0;
    await service.make('u1', 'e1');
    // One make of the lead's scenes: its twin is composed with each, on the same voice.
    expect(jobs.map((j) => j.kind)).toEqual(['prepare']);
    const twin = twins()[0];
    const lead = rowsOf('e1');
    const mirrored = rowsOf(twin.id);
    expect(mirrored.map((r) => r.twinOf)).toEqual(lead.map((r) => r.id));
    expect(mirrored.map((r) => r.sheet)).toEqual(lead.map((r) => r.sheet));
  });
});

describe('the other shape, any time after', () => {
  it('makes a vertical version from the film as made: composed only, one job a scene, nothing written or voiced', async () => {
    const { service, jobs, twins, rowsOf, messages } = studioWith(
      null,
      { phase: 'made' },
      true,
    );
    const episode = await service.otherShape('u1', 'e1');
    const twin = twins()[0];
    expect(twin).toMatchObject({ shape: 'tall', twinOf: 'e1' });
    expect(jobs.map((j) => j.kind)).toEqual(['twin', 'twin']);
    expect(jobs.every((j) => j.episodeId === twin.id)).toBe(true);
    expect(rowsOf(twin.id).every((r) => r.status === 'making')).toBe(true);
    expect(episode.twin).toMatchObject({ id: twin.id, shape: 'tall' });
    expect(messages.map((m) => m.content)).toContain(
      'Making the vertical version: 2 scenes, from the same script and voice',
    );
  });

  it('makes a wide version of a vertical film', async () => {
    const { service, twins } = studioWith(
      'tall',
      { phase: 'made', shape: 'tall' },
      true,
    );
    await service.otherShape('u1', 'e1');
    expect(twins()[0]).toMatchObject({ shape: 'wide', twinOf: 'e1' });
  });

  it('marks the twin’s scene to make again when its lead’s script changes, and plays the twin tall on the lead’s title', async () => {
    const { service, twins, rowsOf, scenes } = studioWith(
      null,
      { phase: 'made' },
      true,
    );
    await service.otherShape('u1', 'e1');
    const twin = twins()[0];
    // Made, as the worker makes it: on the lead's voice, at its fingerprint.
    for (const row of rowsOf(twin.id)) {
      const lead = scenes.get(row.twinOf!)!;
      scenes.set(row.id, {
        ...row,
        status: 'made',
        sceneKey: `${row.id}-scene.json`,
        thumbKey: `${row.id}-thumb.png`,
        audioKey: lead.audioKey,
        madeHash: lead.madeHash,
        durationMs: lead.durationMs,
      });
    }
    let lead = await service.episode('u1', 'e1');
    expect(lead.twin).toMatchObject({ made: true, stale: 0 });
    // The second scene rewritten: its twin is behind until it is made again.
    const second = scenes.get('c1')!;
    scenes.set('c1', { ...second, sheet: sheetOf('Home', 'All of it, then.') });
    lead = await service.episode('u1', 'e1');
    expect(lead.twin).toMatchObject({ made: false, stale: 1 });
    const seen = await service.episode('u1', twin.id);
    expect(seen.scenes.map((s) => s.stale)).toEqual([false, true]);
    const play = await service.play('u1', twin.id);
    expect(play).toMatchObject({ shape: 'tall', title: 'The Last Mango' });
    expect((await service.play('u1', 'e1')).shape).toBeUndefined();
  });

  it('says so when every scene is made already in the other shape', async () => {
    const { service, twins, rowsOf, scenes, jobs, episodes } = studioWith(
      null,
      { phase: 'made' },
      true,
    );
    await service.otherShape('u1', 'e1');
    const twin = twins()[0];
    // Made and settled, as the worker leaves it.
    episodes.set(twin.id, { ...episodes.get(twin.id)!, busy: null });
    for (const row of rowsOf(twin.id)) {
      const lead = scenes.get(row.twinOf!)!;
      scenes.set(row.id, {
        ...row,
        status: 'made',
        sceneKey: `${row.id}-scene.json`,
        audioKey: lead.audioKey,
        madeHash: lead.madeHash,
      });
    }
    jobs.length = 0;
    await service.otherShape('u1', 'e1');
    expect(jobs).toHaveLength(0);
  });

  it('tries again only the twin’s scenes that failed, and says why one needs its scene made again', async () => {
    const { service, twins, rowsOf, scenes, jobs, episodes } = studioWith(
      null,
      { phase: 'made' },
      true,
    );
    await service.otherShape('u1', 'e1');
    const twin = twins()[0];
    // Settled by the worker: the first made, the second not.
    episodes.set(twin.id, { ...episodes.get(twin.id)!, busy: null });
    const [first, second] = rowsOf(twin.id);
    const lead = scenes.get(first.twinOf!)!;
    scenes.set(first.id, {
      ...first,
      status: 'made',
      sceneKey: `${first.id}-scene.json`,
      audioKey: lead.audioKey,
      madeHash: lead.madeHash,
    });
    scenes.set(second.id, {
      ...second,
      status: 'failed',
      error: 'This scene needs making again before it can be vertical.',
    });
    const seen = await service.episode('u1', 'e1');
    expect(seen.twin).toMatchObject({
      made: false,
      making: false,
      failed: 1,
      error: 'Scene 2 needs making again before it can be vertical.',
    });
    jobs.length = 0;
    const again = await service.otherShape('u1', 'e1');
    expect(jobs.map((j) => j.sceneId)).toEqual([second.id]);
    expect(scenes.get(second.id)).toMatchObject({
      status: 'making',
      error: null,
    });
    expect(again.twin).toMatchObject({ making: true, failed: 0 });
  });
});

describe('why the other shape could not be made, in the maker’s words', () => {
  it('names the scenes to make again first', () => {
    expect(needsRemaking([3], 'tall')).toBe(
      'Scene 3 needs making again before it can be vertical.',
    );
    expect(needsRemaking([1, 2, 4], 'wide')).toBe(
      'Scenes 1, 2 and 4 need making again before they can be wide.',
    );
  });
});
