import {
  bibleOf,
  briefOf,
  outlineOf,
  storySheetOf,
} from '../../domain/studio/studio';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { SHEET_VERSION, type CharacterSheet } from '../../domain/scene-sheet';
import { withCandidate } from '../../domain/studio/studio-drawings';
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
import { StudioCastService, studioCastKey } from './studio-cast.service';
import { StudioService, refusesWords } from './studio.service';
import { sceneFingerprint } from './studio-views';

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
    listShows: (userId) =>
      Promise.resolve([...shows.values()].filter((s) => s.userId === userId)),
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
    listScenesOf: (episodeIds) =>
      Promise.resolve(
        [...scenes.values()]
          .filter((s) => episodeIds.includes(s.episodeId))
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
  // The show's drawings in a store in memory, as the Studio keeps them.
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
    delete: (key: string) => {
      files.delete(key);
      return Promise.resolve();
    },
  };
  const cast = new StudioCastService(storage as never);
  const service = new StudioService(
    repo as StudioRepository,
    llm,
    queue,
    storage as never,
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
    cast,
    files,
    answer,
    repo,
    shows,
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

describe('the Studio lists the shows', () => {
  it('says what a show is busy with, and how long its film runs and in how many scenes', async () => {
    const studio = studioInMemory();
    const [before] = await studio.service.shows('u1');
    expect(before).toMatchObject({
      thumbEpisodeId: null,
      phase: 'script',
      busy: null,
      durationMs: null,
      scenes: null,
    });

    studio.episodes.set('e0', {
      ...studio.episodes.get('e0')!,
      phase: 'made',
      busy: 'make',
      durationMs: 61_000,
      thumbKey: 'studio/e0/thumb.png',
    });
    // One scene made, one not yet: the film has the one.
    studio.scenes.set('c1', {
      ...studio.scenes.get('c1')!,
      sceneKey: 'k1',
      audioKey: 'a1',
      durationMs: 61_000,
    });
    const [now] = await studio.service.shows('u1');
    expect(now).toMatchObject({
      thumbEpisodeId: 'e0',
      phase: 'made',
      busy: 'make',
      durationMs: 61_000,
      scenes: 1,
    });
  });

  it('says the length of the film the player plays: a scene that failed to be made again keeps its file, and is in it', async () => {
    const studio = studioInMemory();
    studio.episodes.set('e0', {
      ...studio.episodes.get('e0')!,
      phase: 'made',
      // What the episode was last settled at: the made scenes only.
      durationMs: 30_000,
      thumbKey: 'studio/e0/thumb.png',
    });
    studio.scenes.set('c1', {
      ...studio.scenes.get('c1')!,
      status: 'made',
      sceneKey: 'k1',
      audioKey: 'a1',
      durationMs: 30_000,
    });
    studio.scenes.set('c2', {
      ...studio.scenes.get('c2')!,
      status: 'failed',
      sceneKey: 'k2',
      audioKey: 'a2',
      durationMs: 25_000,
    });
    const [card] = await studio.service.shows('u1');
    expect(card).toMatchObject({ durationMs: 55_000, scenes: 2 });
  });

  it('stands for a show by its latest made episode, and says where its latest is', async () => {
    const studio = studioInMemory();
    studio.episodes.set('e0', {
      ...studio.episodes.get('e0')!,
      phase: 'made',
      durationMs: 61_000,
      thumbKey: 'studio/e0/thumb.png',
    });
    studio.scenes.set('c1', {
      ...studio.scenes.get('c1')!,
      sceneKey: 'k1',
      audioKey: 'a1',
      durationMs: 61_000,
    });
    studio.episodes.set('e9', {
      ...studio.episodes.get('e0')!,
      id: 'e9',
      number: 2,
      phase: 'outline',
      durationMs: null,
      thumbKey: null,
    });
    const [waiting] = await studio.service.shows('u1');
    expect(waiting).toMatchObject({
      thumbEpisodeId: 'e0',
      phase: 'outline',
      episodes: 2,
    });

    studio.episodes.set('e9', {
      ...studio.episodes.get('e9')!,
      phase: 'made',
      durationMs: 20_000,
      thumbKey: 'studio/e9/thumb.png',
    });
    studio.scenes.set('c9', {
      ...studio.scenes.get('c1')!,
      id: 'c9',
      episodeId: 'e9',
      durationMs: 20_000,
    });
    const [made] = await studio.service.shows('u1');
    expect(made).toMatchObject({
      thumbEpisodeId: 'e9',
      phase: 'made',
      durationMs: 20_000,
      scenes: 1,
    });
  });

  it('reads the scenes of every show in one go, however many shows there are', async () => {
    const studio = studioInMemory();
    for (const id of ['s2', 's3']) {
      studio.shows.set(id, { ...studio.shows.get('s1')!, id });
      studio.episodes.set(`${id}e`, {
        ...studio.episodes.get('e0')!,
        id: `${id}e`,
        showId: id,
        phase: 'made',
        thumbKey: `studio/${id}e/thumb.png`,
      });
    }
    const one = jest.spyOn(studio.repo, 'listScenes');
    const all = jest.spyOn(studio.repo, 'listScenesOf');
    expect(await studio.service.shows('u1')).toHaveLength(3);
    expect(one).not.toHaveBeenCalled();
    expect(all).toHaveBeenCalledTimes(1);
  });
});

describe('a change asked for a scene', () => {
  it("changes each scene asked for, and carries the maker's own words with one that was made", async () => {
    const studio = studioInMemory();
    studio.scenes.set('c1', {
      ...studio.scenes.get('c1')!,
      sceneKey: 'k1',
      audioKey: 'a1',
      status: 'made',
    });
    Object.assign(studio.answer, {
      reply: "Got it. I'm changing that now.",
      action: 'scene',
      scene: 2,
      scenes: [2, 1],
      request: 'Tobi gets out of bed himself',
    });
    const done = await studio.service.turn(
      'u1',
      's1',
      { episodeId: 'e0', message: 'the bed moves with him in scenes 1 and 2' },
      () => undefined,
    );
    expect(studio.jobs.map((j) => [j.kind, j.sceneId])).toEqual([
      ['scene', 'c2'],
      ['scene', 'c1'],
    ]);
    // Scene 2 was never made: nothing to check. Scene 1 was: its film is.
    expect(studio.jobs[0].ask).toBeUndefined();
    expect(studio.jobs[1].ask).toMatchObject({
      words: 'the bed moves with him in scenes 1 and 2',
      request: 'Tobi gets out of bed himself',
      tries: 1,
    });
    expect(studio.jobs[1].ask!.id).toBe(
      studio.messages.find((m) => m.role === 'user')!.id,
    );
    // Never "done" before it is, whatever the producer said: a try, said
    // in the Studio's own words, checked where it was made.
    expect(done.message.content).toBe(
      "I'll rewrite scenes 2 and 1: Tobi gets out of bed himself. Then I'll make scene 1 again and check it; scene 2 shows once the film is made.",
    );
  });

  it('leaves out what the stage cannot show, and says so, never promising it', async () => {
    const studio = studioInMemory();
    studio.scenes.set('c1', {
      ...studio.scenes.get('c1')!,
      sceneKey: 'k1',
      audioKey: 'a1',
      status: 'made',
    });
    Object.assign(studio.answer, {
      reply: "Nice touch! I'll have her ride out and the bus drive past.",
      action: 'scene',
      scene: 1,
      request: 'Ada runs out of the door with her scooter',
      cannot: 'riding a scooter, or a bus going past the window',
    });
    const done = await studio.service.turn(
      'u1',
      's1',
      {
        episodeId: 'e0',
        message:
          'can Ada ride her scooter out of the door, and the bus drive past the window?',
      },
      () => undefined,
    );
    expect(studio.jobs[0].request).toBe(
      'Ada runs out of the door with her scooter. Leave out riding a scooter, or a bus going past the window: the stage cannot show it.',
    );
    expect(done.message.content).toBe(
      "The stage can't show riding a scooter, or a bus going past the window, so I'll leave that out. I'll rewrite scene 1: Ada runs out of the door with her scooter. Then I'll make it again and check it.",
    );
  });

  it('asks which scene when a number is none of them', async () => {
    const studio = studioInMemory();
    Object.assign(studio.answer, {
      reply: 'On it.',
      action: 'scene',
      scene: 5,
      request: 'x',
    });
    const done = await studio.service.turn(
      'u1',
      's1',
      { episodeId: 'e0', message: 'change scene 5' },
      () => undefined,
    );
    expect(done.message.content).toBe(
      'Which scene should I change? Tell me its number.',
    );
    expect(studio.jobs).toEqual([]);
  });
});

/** A drawing kept for a character, as the artist's are. */
const drawnSheet = (svg: string): CharacterSheet => ({
  version: SHEET_VERSION,
  drawing: {
    svg,
    viewBox: [0, 0, 100, 100],
    aspect: 1,
    parts: {},
    labels: {},
    states: {},
    moves: true,
    callouts: [],
    field: null,
  },
  anchors: { head: null, body: null, legs: null },
});

describe('the cast drawn at the cast step, and one character drawn again', () => {
  /** The show with Bingo, a dog the artist draws, beside Tobi, whom the kit draws. */
  function withBingo() {
    const studio = studioInMemory();
    const show = studio.shows.get('s1')!;
    studio.shows.set('s1', {
      ...show,
      bible: bibleOf({
        characters: [
          { name: 'Tobi', voice: 'boy', figure: { age: 'child' } },
          { name: 'Bingo', kind: 'animal', voice: 'creature', look: 'a dog' },
        ],
        sets: [{ name: 'Market' }],
      }),
    });
    return studio;
  }

  it('draws the animals and creatures as the outline is approved, and shows them being drawn', async () => {
    const studio = withBingo();
    studio.episodes.set('e0', {
      ...studio.episodes.get('e0')!,
      phase: 'outline',
    });
    await studio.service.approve('u1', 'e0');
    expect(studio.jobs).toEqual([
      expect.objectContaining({ kind: 'draw', characterIds: ['bingo'] }),
    ]);
    const show = await studio.service.show('u1', 's1');
    const bingo = show.bible!.characters.find((c) => c.id === 'bingo')!;
    expect(bingo.drawingNow).toBe(true);
    expect(
      show.bible!.characters.find((c) => c.id === 'tobi')!.drawingNow,
    ).toBeUndefined();
    // Asked again while being drawn: not drawn twice.
    await studio.service.drawMissing('u1', 's1');
    expect(studio.jobs).toHaveLength(1);
  });

  it('draws only the one character a change asks to be drawn again, never the whole cast', async () => {
    const studio = withBingo();
    await studio.service.rewriteCast(
      'u1',
      's1',
      'e0',
      'redraw Bingo, rounder with a red collar',
    );
    expect(studio.jobs).toEqual([
      expect.objectContaining({
        kind: 'redraw',
        characterId: 'bingo',
        request: 'redraw Bingo, rounder with a red collar',
      }),
    ]);
    // Nothing else is held up: the cast is not being written.
    expect(studio.episodes.get('e0')!.busy).toBeNull();
    expect(studio.events()).toEqual([
      expect.objectContaining({
        what: 'asked',
        step: 'cast',
        line: 'Drawing Bingo again',
      }),
    ]);
    expect(studio.said()).toEqual([
      'Cast: redraw Bingo, rounder with a red collar',
    ]);
  });

  it('draws one character again from their card, or as the producer maps the words to them', async () => {
    const studio = withBingo();
    await studio.service.redrawCharacter('u1', 'e0', 'bingo', 'with spots');
    expect(studio.jobs.at(-1)).toMatchObject({
      kind: 'redraw',
      characterId: 'bingo',
      request: 'with spots',
    });
    expect(studio.said().at(-1)).toBe('Bingo: with spots');
    // Being drawn now: asked again, said so.
    await expect(
      studio.service.redrawCharacter('u1', 'e0', 'bingo', 'bigger'),
    ).rejects.toThrow('Bingo is being drawn right now');

    const chat = withBingo();
    Object.assign(chat.answer, {
      action: 'redraw',
      character: 'Bingo',
      request: 'make the dog rounder',
      reply: 'Done! Bingo is rounder now.',
    });
    const { message } = await chat.service.turn(
      'u1',
      's1',
      { message: 'make the dog rounder' },
      () => undefined,
    );
    expect(chat.jobs).toEqual([
      expect.objectContaining({ kind: 'redraw', characterId: 'bingo' }),
    ]);
    // Said in code's words: a try, waiting to be chosen, never done.
    expect(message.content).toBe(
      "I'll draw Bingo again as you ask. The new drawing will wait on their card beside the one you have: keep whichever you like.",
    );
    // And a "cast" the producer set for it is a drawing again all the same.
    const cast = withBingo();
    Object.assign(cast.answer, { action: 'cast', request: 'redraw Bingo' });
    await cast.service.turn(
      'u1',
      's1',
      { message: 'redraw Bingo' },
      () => undefined,
    );
    expect(cast.jobs.map((j) => j.kind)).toEqual(['redraw']);
  });

  it('changes a person’s look alone, as today, by the cast’s writer', async () => {
    const studio = withBingo();
    await studio.service.redrawCharacter('u1', 'e0', 'tobi', 'a red cap');
    expect(studio.jobs).toEqual([
      expect.objectContaining({
        kind: 'bible',
        request:
          "Change only Tobi's look, as the maker asks: a red cap. Keep everyone else and every place exactly as they are.",
      }),
    ]);
    expect(studio.events().at(-1)?.line).toBe("Changing Tobi's look");
  });

  it('shows a new drawing beside the one they have; only choosing it replaces it, and only their scenes are made again', async () => {
    const studio = withBingo();
    const old = drawnSheet('<svg><circle r="1"/></svg>');
    const rounder = drawnSheet('<svg><circle r="2"/></svg>');
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(JSON.stringify({ bingo: old })),
    );
    await studio.cast.changeWork('s1', (work) =>
      withCandidate(work, 'bingo', rounder, 'rounder', Date.now()),
    );
    // Scene 1 shows Tobi alone; scene 2 shows Bingo; both made as they are.
    const withDog = storySheetOf({
      title: 'Home',
      set: 'market',
      onStage: [
        { who: 'tobi', spot: 'left' },
        { who: 'bingo', spot: 'right' },
      ],
      beats: [{ kind: 'line', who: 'tobi', say: 'There you are.' }],
    });
    studio.scenes.set('c2', { ...studio.scenes.get('c2')!, sheet: withDog });
    const shown = await studio.service.show('u1', 's1');
    const bingo = shown.bible!.characters.find((c) => c.id === 'bingo')!;
    expect(bingo.drawing).toContain('r="1"');
    expect(bingo.candidate?.drawing).toContain('r="2"');
    expect(bingo.candidate?.words).toBe('rounder');
    for (const id of ['c1', 'c2']) {
      const row = studio.scenes.get(id)!;
      studio.scenes.set(id, {
        ...row,
        sceneKey: `k-${id}`,
        madeHash: sceneFingerprint(
          row.sheet!,
          studio.shows.get('s1')!.bible,
          brief,
        ),
      });
    }
    expect(
      (await studio.service.episode('u1', 'e0')).scenes.map((s) => s.stale),
    ).toEqual([false, false]);

    const after = await studio.service.chooseDrawing(
      'u1',
      's1',
      'bingo',
      'use',
    );
    const now = after.bible!.characters.find((c) => c.id === 'bingo')!;
    expect(now.drawing).toContain('r="2"');
    expect(now.candidate).toBeUndefined();
    expect(
      (
        JSON.parse(studio.files.get(studioCastKey('s1'))!.toString()) as Record<
          string,
          CharacterSheet
        >
      ).bingo.drawing.svg,
    ).toContain('r="2"');
    // Only the scene with Bingo in it is to make again.
    expect(
      (await studio.service.episode('u1', 'e0')).scenes.map((s) => s.stale),
    ).toEqual([false, true]);
    expect(studio.events().at(-1)).toMatchObject({
      what: 'edited',
      step: 'cast',
      line: "Bingo's new drawing is in: 1 made scene with Bingo to make again",
    });
  });

  it('lets a new drawing go, keeping the one they have, or draws another from the same words', async () => {
    const studio = withBingo();
    const old = drawnSheet('<svg><circle r="1"/></svg>');
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(JSON.stringify({ bingo: old })),
    );
    const waiting = () =>
      studio.cast.changeWork('s1', (work) =>
        withCandidate(
          work,
          'bingo',
          drawnSheet('<svg><circle r="3"/></svg>'),
          'with spots',
          Date.now(),
        ),
      );
    await waiting();
    const kept = await studio.service.chooseDrawing(
      'u1',
      's1',
      'bingo',
      'keep',
    );
    const bingo = kept.bible!.characters.find((c) => c.id === 'bingo')!;
    expect(bingo.candidate).toBeUndefined();
    expect(bingo.drawing).toContain('r="1"');
    expect(studio.events().at(-1)?.line).toBe('Bingo kept as before');
    expect(bingo).not.toHaveProperty('drawn');

    await waiting();
    await studio.service.chooseDrawing('u1', 's1', 'bingo', 'again');
    expect(studio.jobs.at(-1)).toMatchObject({
      kind: 'redraw',
      characterId: 'bingo',
      request: 'with spots',
    });
    const again = await studio.service.show('u1', 's1');
    expect(
      again.bible!.characters.find((c) => c.id === 'bingo')!.drawingNow,
    ).toBe(true);
    // Nothing waiting: nothing to choose.
    await expect(
      studio.service.chooseDrawing('u1', 's1', 'bingo', 'use'),
    ).rejects.toThrow('There is no new drawing of Bingo.');
  });
});

describe('refusesWords', () => {
  it('lets a classic story with a fight in it through to the producer', () => {
    expect(refusesWords({ flagged: true, categories: ['violence'] })).toBe(
      false,
    );
  });

  it('refuses anything graphic, sexual, hateful or self-harming', () => {
    for (const category of ['violence/graphic', 'sexual', 'hate', 'self-harm'])
      expect(
        refusesWords({ flagged: true, categories: ['violence', category] }),
      ).toBe(true);
  });

  it('refuses a flag that names nothing, and passes what is not flagged', () => {
    expect(refusesWords({ flagged: true, categories: [] })).toBe(true);
    expect(refusesWords({ flagged: false, categories: ['violence'] })).toBe(
      false,
    );
  });
});
