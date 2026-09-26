import {
  bibleOf,
  briefOf,
  outlineOf,
  storySheetOf,
} from '../../domain/studio/studio';
import { ValidationError } from '../../domain/errors/errors';
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
import type { StudioCastService } from './studio-cast.service';
import { StudioService } from './studio.service';

const brief = briefOf({
  format: 'story',
  idea: 'A lost dog',
  audience: 'children',
  minutes: 1,
  tone: 'funny',
});
const bible = bibleOf({
  characters: [{ name: 'Tobi', voice: 'boy', figure: { age: 'child' } }],
  sets: [{ name: 'Market' }],
});
const outline = outlineOf({
  title: 'Lost',
  logline: 'Tobi loses his dog.',
  scenes: [
    { title: 'Market', summary: 'Bingo runs off.', set: 'market', seconds: 30 },
    { title: 'Home', summary: 'Bingo comes home.', set: 'market', seconds: 30 },
  ],
});
const sheetOf = (title: string, say: string) =>
  storySheetOf({
    title,
    set: 'market',
    onStage: [{ who: 'tobi', spot: 'left' }],
    beats: [{ kind: 'line', who: 'tobi', say, feeling: 'happy' }],
  });

/** A show, its episodes, scenes and thread, in memory: as much of the repository as the service asks of it. */
function studioInMemory() {
  const at = new Date('2026-09-26T10:00:00Z');
  const shows = new Map<string, StudioShowRecord>();
  const episodes = new Map<string, StudioEpisodeRecord>();
  const scenes = new Map<string, StudioSceneRecord>();
  const messages: StudioMessageRecord[] = [];
  let ids = 0;
  const repo: Partial<StudioRepository> = {
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
        id: `e${++ids}`,
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
    findScene: (id) => Promise.resolve(scenes.get(id) ?? null),
    updateScene: (id, patch) => {
      scenes.set(id, { ...scenes.get(id)!, ...patch });
      return Promise.resolve();
    },
    insertScene: (episodeId, position) => {
      for (const s of scenes.values())
        if (s.episodeId === episodeId && s.position >= position)
          scenes.set(s.id, { ...s, position: s.position + 1 });
      const row = scene({ id: `c${++ids}`, episodeId, position, sheet: null });
      scenes.set(row.id, row);
      return Promise.resolve(row);
    },
    removeScene: (id) => {
      const gone = scenes.get(id)!;
      scenes.delete(id);
      for (const s of scenes.values())
        if (s.episodeId === gone.episodeId && s.position > gone.position)
          scenes.set(s.id, { ...s, position: s.position - 1 });
      return Promise.resolve();
    },
    makingFor: () => Promise.resolve(0),
    addMessage: (input) => {
      const there = input.id && messages.find((m) => m.id === input.id);
      if (there) return Promise.resolve(there);
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
    listMessages: (showId, limit = 60) =>
      Promise.resolve(
        messages.filter((m) => m.showId === showId).slice(-limit),
      ),
    countUserMessagesSince: () => Promise.resolve(0),
  };
  const scene = (patch: Partial<StudioSceneRecord>): StudioSceneRecord => ({
    id: 'c0',
    episodeId: 'e0',
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

  shows.set('s1', {
    id: 's1',
    userId: 'u1',
    title: 'Lost',
    format: 'story',
    brief,
    bible,
    createdAt: at,
    updatedAt: at,
  });
  episodes.set('e0', {
    id: 'e0',
    showId: 's1',
    userId: 'u1',
    number: 1,
    title: 'Lost',
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
  });
  scenes.set(
    'c1',
    scene({ id: 'c1', position: 0, sheet: sheetOf('Market', 'Bingo!') }),
  );
  scenes.set(
    'c2',
    scene({
      id: 'c2',
      position: 1,
      sheet: sheetOf('Home', 'There you are.'),
      previousSheet: sheetOf('Home', 'Found you.'),
    }),
  );

  const jobs: StudioJob[] = [];
  const queue = {
    enqueueStudio: (more: StudioJob[]) => {
      jobs.push(...more);
      return Promise.resolve();
    },
  } as unknown as JobQueuePort;
  const heard: {
    state: string;
    history: { role: string; content: string }[];
  }[] = [];
  /** What the producer answers, over its usual "Lovely.". */
  const answer: Record<string, unknown> = {};
  const llm = {
    moderate: ({ text }: { text: string }) =>
      Promise.resolve({ flagged: text.includes('gore'), categories: [] }),
    studioTurn: (input: {
      state: string;
      history: { role: string; content: string }[];
    }) => {
      heard.push(input);
      return Promise.resolve({
        value: {
          reply: 'Lovely.',
          choices: ['Looks good'],
          brief: {},
          action: 'none',
          scene: null,
          request: null,
          refuse: false,
          ...answer,
        },
        usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
      });
    },
  } as unknown as LlmGatewayPort;
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
  const cast = {
    drawings: () => Promise.resolve({ characters: new Map(), sets: new Map() }),
  } as unknown as StudioCastService;
  const service = new StudioService(
    repo as StudioRepository,
    llm,
    queue,
    { delete: () => Promise.resolve() } as never,
    { now: () => at },
    { record: () => Promise.resolve() },
    entitlements,
    cast,
    {} as SceneVoiceService,
  );
  const events = () =>
    messages
      .filter((m) => m.meta?.kind === 'event')
      .map((m) => ({ ...m.meta!.event!, episodeId: m.episodeId }));
  const said = () =>
    messages.filter((m) => m.role === 'user').map((m) => m.content);
  return {
    service,
    answer,
    repo,
    episodes,
    scenes,
    messages,
    jobs,
    heard,
    events,
    said,
  };
}

describe('the Studio records what happens in the thread', () => {
  it('records approving the outline, then the cast, a line each at the step it opens', async () => {
    const studio = studioInMemory();
    studio.episodes.set('e0', {
      ...studio.episodes.get('e0')!,
      phase: 'outline',
    });
    await studio.service.approve('u1', 'e0');
    await studio.service.approve('u1', 'e0');
    expect(studio.events()).toEqual([
      expect.objectContaining({
        what: 'approved',
        step: 'cast',
        line: 'Outline approved: meet the cast',
        episodeId: 'e0',
      }),
      expect.objectContaining({
        what: 'approved',
        step: 'script',
        line: 'Cast approved: writing the scenes',
      }),
    ]);
  });

  it('records making the film and sharing it, once each', async () => {
    const studio = studioInMemory();
    await studio.service.make('u1', 'e0');
    await studio.service.share('u1', 'e0', true);
    // Already shared: nothing happened, nothing recorded.
    await studio.service.share('u1', 'e0', true);
    expect(studio.events()).toEqual([
      expect.objectContaining({
        what: 'make',
        step: 'made',
        line: 'Making the film: 2 scenes, about 0:03',
      }),
      expect.objectContaining({
        what: 'shared',
        step: 'made',
        line: 'Link on: anyone with it can watch',
      }),
    ]);
  });

  it("keeps the maker's words for a scene, and what the Studio does with them", async () => {
    const studio = studioInMemory();
    await studio.service.rewriteScene('u1', 'c2', 'make them laugh at the end');
    expect(studio.said()).toEqual(['Scene 2: make them laugh at the end']);
    expect(studio.events()).toEqual([
      expect.objectContaining({
        what: 'asked',
        step: 'script',
        sceneId: 'c2',
        line: 'Writing scene 2 again',
      }),
    ]);
    expect(studio.jobs).toEqual([
      expect.objectContaining({ kind: 'scene', sceneId: 'c2' }),
    ]);
  });

  it('records nothing when a change cannot be asked for, or is refused', async () => {
    const studio = studioInMemory();
    await expect(
      studio.service.rewriteScene('u1', 'c2', 'add some gore'),
    ).rejects.toBeInstanceOf(ValidationError);
    studio.scenes.set('c1', {
      ...studio.scenes.get('c1')!,
      status: 'writing',
    });
    await expect(
      studio.service.rewriteScene('u1', 'c1', 'shorter'),
    ).rejects.toThrow(/being worked on/);
    expect(studio.messages).toEqual([]);
  });

  it('records changes by hand: an edit, an undo, a scene taken out', async () => {
    const studio = studioInMemory();
    await studio.service.editScene('u1', 'c1', sheetOf('Market', 'Bingo?'));
    await studio.service.undoScene('u1', 'c2');
    await studio.service.removeScene('u1', 'c2');
    expect(studio.events().map((e) => [e.what, e.step, e.line])).toEqual([
      ['edited', 'script', 'Scene 1 changed by hand'],
      ['edited', 'script', 'Scene 2: the last change undone'],
      ['edited', 'script', 'Scene 2 taken out: “Home”'],
    ]);
  });

  it('keeps words for a new scene and a new episode, under the episode each belongs to', async () => {
    const studio = studioInMemory();
    await studio.service.addScene('u1', 'e0', 0, 'Bingo finds a bone');
    studio.episodes.set('e0', { ...studio.episodes.get('e0')!, busy: null });
    const next = await studio.service.addEpisode(
      'u1',
      's1',
      'Bingo goes to school',
    );
    expect(studio.said()).toEqual([
      'New scene 2: Bingo finds a bone',
      'Episode 2: Bingo goes to school',
    ]);
    expect(studio.events()).toEqual([
      expect.objectContaining({
        what: 'asked',
        step: 'script',
        line: 'Writing the new scene 2',
        episodeId: 'e0',
      }),
      expect.objectContaining({
        what: 'episode',
        step: 'outline',
        line: 'Episode 2 begun: writing its outline',
        episodeId: next.id,
      }),
    ]);
    expect(
      studio.messages.filter((m) => m.role === 'user').map((m) => m.episodeId),
    ).toEqual(['e0', next.id]);
  });

  it('adds the new scene, once, even when the maker’s words cannot be kept', async () => {
    const studio = studioInMemory();
    const keep = studio.repo.addMessage!;
    studio.repo.addMessage = (input) =>
      input.role === 'user'
        ? Promise.reject(new Error('the database blinked'))
        : keep(input);
    await expect(
      studio.service.addScene('u1', 'e0', 0, 'Bingo finds a bone'),
    ).resolves.toBeDefined();
    expect(studio.jobs.filter((j) => j.kind === 'scene')).toHaveLength(1);
    expect(studio.events().map((e) => e.line)).toEqual([
      'Writing the new scene 2',
    ]);
  });

  it('while the outline is being written, takes in what the brief now says, and promises nothing else', async () => {
    const studio = studioInMemory();
    studio.episodes.set('e0', {
      ...studio.episodes.get('e0')!,
      phase: 'outline',
      busy: 'outline',
    });
    const ask = async (brief: Record<string, unknown>) => {
      Object.assign(studio.answer, {
        reply: 'Writing the outline now.',
        action: 'outline',
        brief,
      });
      return (
        await studio.service.turn(
          'u1',
          's1',
          { episodeId: 'e0', message: 'make sure it has a prism' },
          () => undefined,
        )
      ).message.content;
    };
    expect(await ask({ include: 'a tiny prism' })).toBe(
      'Noted. The outline is being written right now; once it is done I will write it again with that in it.',
    );
    // Nothing the brief keeps: asked again after, never promised.
    expect(await ask({})).toBe(
      'I am still working on the last change; ask me again once it is done.',
    );
    expect(studio.jobs).toEqual([]);
  });

  it('gives the producer what the buttons did, and what the maker is looking at', async () => {
    const studio = studioInMemory();
    await studio.service.make('u1', 'e0');
    const done = await studio.service.turn(
      'u1',
      's1',
      {
        episodeId: 'e0',
        message: 'make it funnier',
        focus: { step: 'script', sceneId: 'c2' },
      },
      () => undefined,
    );
    expect(studio.heard[0].history).toEqual([
      {
        role: 'studio',
        content: 'Making the film: 2 scenes, about 0:03',
      },
    ]);
    expect(studio.heard[0].state).toContain(
      'The maker is looking at scene 2 ("Home")',
    );
    expect(done.message).toMatchObject({ kind: 'say', event: null });
    expect(done.show.messages.map((m) => m.kind)).toEqual([
      'event',
      'say',
      'say',
    ]);
    expect(done.show.moreMessages).toBe(false);
  });
});
