import {
  bibleOf,
  briefOf,
  outlineOf,
  storySheetOf,
} from '../../business/domain/studio/studio';
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
import { StudioProcessor, studioMakeOf } from './studio.processor';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../contracts';

/**
 * What the thread gets from the Studio's work: one line when a job's
 * result comes or it finally fails, never two for one job however often
 * the queue tries it, and one for the film however many of its scenes
 * finish at once.
 */

const at = new Date('2026-09-26T10:00:00Z');
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
const outline = {
  title: 'Lost',
  logline: 'Tobi loses his dog.',
  scenes: [
    {
      title: 'Market',
      summary: 'Bingo runs off.',
      set: 'market',
      cast: ['tobi'],
      seconds: 30,
    },
    {
      title: 'Home',
      summary: 'Bingo comes home.',
      set: 'market',
      cast: ['tobi'],
      seconds: 30,
    },
  ],
};
const sheet = storySheetOf({
  title: 'Market',
  set: 'market',
  onStage: [{ who: 'tobi', spot: 'left' }],
  beats: [{ kind: 'line', who: 'tobi', say: 'Bingo!', feeling: 'happy' }],
});

function worker() {
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: 'Lost',
    format: 'story',
    brief,
    bible,
    createdAt: at,
    updatedAt: at,
  };
  const episodes = new Map<string, StudioEpisodeRecord>([
    [
      'e1',
      {
        id: 'e1',
        showId: 's1',
        userId: 'u1',
        number: 1,
        title: 'Lost',
        logline: null,
        phase: 'script',
        busy: 'make',
        error: null,
        outline: outlineOf(outline),
        shareToken: null,
        durationMs: null,
        thumbKey: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
  ]);
  const row = (patch: Partial<StudioSceneRecord>): StudioSceneRecord => ({
    id: 'c1',
    episodeId: 'e1',
    position: 0,
    sheet,
    sheetHash: null,
    problems: [],
    previousSheet: null,
    status: 'making',
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
  const scenes = new Map<string, StudioSceneRecord>([
    [
      'c1',
      row({
        status: 'made',
        sceneKey: 'k1',
        audioKey: 'a1',
        thumbKey: 't1',
        durationMs: 31_000,
      }),
    ],
    ['c2', row({ id: 'c2', position: 1 })],
    ['c3', row({ id: 'c3', position: 2 })],
  ]);
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
    listScenes: () =>
      Promise.resolve(
        [...scenes.values()].sort((a, b) => a.position - b.position),
      ),
    findScene: (id) => Promise.resolve(scenes.get(id) ?? null),
    updateScene: (id, patch) => {
      scenes.set(id, { ...scenes.get(id)!, ...patch });
      return Promise.resolve();
    },
    addMessage: (input) => {
      const there = input.id && messages.find((m) => m.id === input.id);
      if (there) return Promise.resolve(there);
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
  // What happens while the outline is being written: nothing, unless a test says.
  const meanwhile = { outline: () => undefined as void };
  const llm = {
    studioOutline: () => {
      meanwhile.outline();
      return Promise.resolve({
        value: outline,
        usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
      });
    },
  } as unknown as LlmGatewayPort;
  const queued: StudioJobData[] = [];
  // The stage makes the scenes in `makes`, each a new file; any other falls over.
  const makes = new Set<string>();
  const stage = {
    make: ({ keepAs }: { keepAs: string }) => {
      const id = keepAs.replace('studio-', '');
      return makes.has(id)
        ? Promise.resolve({
            fit: 'good',
            scene: { title: 'Market', steps: [], effects: [] },
            sceneKey: `k-${id}-${messages.length}`,
            thumbKey: `t-${id}`,
            voice: { audioKey: `a-${id}`, durationMs: 31_000 },
          })
        : Promise.reject(new Error('The stage fell over'));
    },
  } as unknown as SceneProcessor;
  const processor = new StudioProcessor(
    repo as StudioRepository,
    llm,
    { record: () => Promise.resolve() },
    { delete: () => Promise.resolve() } as never,
    stage,
    { recordStudioSeconds: () => Promise.resolve() } as never,
    {} as never,
    {
      enqueueStudio: (jobs: StudioJobData[]) => {
        queued.push(...jobs);
        return Promise.resolve();
      },
    } as never,
  );
  const events = () =>
    messages.map((m) => ({
      what: m.meta?.event?.what,
      sceneId: m.meta?.event?.sceneId,
      line: m.content,
    }));
  return {
    processor,
    show,
    episodes,
    scenes,
    events,
    makes,
    meanwhile,
    queued,
  };
}

const job = (patch: Partial<StudioJobData>): StudioJobData => ({
  kind: 'make',
  showId: 's1',
  episodeId: 'e1',
  userId: 'u1',
  ...patch,
});
const last = (jobId: string) => ({
  attemptsMade: 2,
  isFinalAttempt: true,
  jobId,
});

describe('the Studio at work, as the thread records it', () => {
  it('records a scene that could not be made once, however often its job is tried', async () => {
    const studio = worker();
    const make = job({ sceneId: 'c2' });
    // A try with more to come records nothing.
    await expect(
      studio.processor.process(make, {
        attemptsMade: 1,
        isFinalAttempt: false,
        jobId: 'j2',
      }),
    ).rejects.toThrow('The stage fell over');
    expect(studio.events()).toEqual([]);
    await studio.processor.process(make, last('j2'));
    // Taken up again after its worker went: the same job, the same line.
    studio.scenes.set('c2', { ...studio.scenes.get('c2')!, status: 'making' });
    await studio.processor.process(make, last('j2'));
    expect(studio.events()).toEqual([
      {
        what: 'failed',
        sceneId: 'c2',
        line: 'Scene 2 could not be made. Make the film again to try once more.',
      },
    ]);
  });

  it('records the film once, when its last scene is settled', async () => {
    const studio = worker();
    await studio.processor.process(job({ sceneId: 'c2' }), last('j2'));
    // Scene 3 is still being made: no film yet.
    expect(studio.events().map((e) => e.what)).toEqual(['failed']);
    await studio.processor.process(job({ sceneId: 'c3' }), last('j3'));
    // And a second settling of the same film, as two scenes finishing at once would.
    await studio.processor.process(job({ sceneId: 'c3' }), last('j3b'));
    expect(studio.events()).toEqual([
      expect.objectContaining({ what: 'failed', sceneId: 'c2' }),
      expect.objectContaining({ what: 'failed', sceneId: 'c3' }),
      {
        what: 'made',
        sceneId: undefined,
        line: 'Film made with 1 of 3 scenes: “Lost”, 0:31',
      },
      expect.objectContaining({ what: 'failed', sceneId: 'c3' }),
    ]);
    expect(studio.episodes.get('e1')).toMatchObject({
      phase: 'made',
      busy: null,
    });
  });

  it('records no film again when a make made nothing new', async () => {
    const studio = worker();
    // The film made: scenes 2 and 3 made, with scene 1 made before them.
    studio.makes.add('c2').add('c3');
    await studio.processor.process(job({ sceneId: 'c2' }), last('j2'));
    await studio.processor.process(job({ sceneId: 'c3' }), last('j3'));
    expect(studio.events().map((e) => e.line)).toEqual([
      'Film made: “Lost”, 1:33',
    ]);
    // Both changed and made again, and neither could be: said so, and no
    // second film, for nothing new was made.
    studio.makes.clear();
    for (const id of ['c2', 'c3'])
      studio.scenes.set(id, { ...studio.scenes.get(id)!, status: 'making' });
    await studio.processor.process(job({ sceneId: 'c2' }), last('j4'));
    await studio.processor.process(job({ sceneId: 'c3' }), last('j5'));
    expect(studio.events().map((e) => e.what)).toEqual([
      'made',
      'failed',
      'failed',
    ]);
    // One of them made after all: a film again, with what it has.
    studio.makes.add('c3');
    studio.scenes.set('c3', { ...studio.scenes.get('c3')!, status: 'making' });
    await studio.processor.process(job({ sceneId: 'c3' }), last('j6'));
    expect(
      studio
        .events()
        .map((e) => e.line)
        .at(-1),
    ).toBe('Film made with 2 of 3 scenes: “Lost”, 1:02');
  });

  it('records a written outline once for its job', async () => {
    const studio = worker();
    studio.episodes.set('e1', {
      ...studio.episodes.get('e1')!,
      phase: 'outline',
      busy: 'outline',
      outline: null,
    });
    const write = job({ kind: 'outline' });
    await studio.processor.process(write, last('j9'));
    await studio.processor.process(write, last('j9'));
    expect(studio.events()).toEqual([
      {
        what: 'outline',
        sceneId: undefined,
        line: 'Outline written: “Lost”, 2 scenes, about 1:00',
      },
    ]);
  });

  it('writes the outline again when the brief changed while it was being written', async () => {
    const studio = worker();
    studio.episodes.set('e1', {
      ...studio.episodes.get('e1')!,
      phase: 'outline',
      busy: 'outline',
      outline: null,
    });
    // The maker adds to the brief in the chat as the outline is written.
    studio.meanwhile.outline = () => {
      studio.show.brief = { ...studio.show.brief, include: 'a tiny prism' };
    };
    await studio.processor.process(job({ kind: 'outline' }), last('j10'));
    expect(studio.episodes.get('e1')).toMatchObject({
      phase: 'outline',
      busy: 'outline',
    });
    expect(studio.queued).toEqual([
      expect.objectContaining({
        kind: 'outline',
        request: 'Take in what the brief says now.',
      }),
    ]);
    expect(studio.events().map((e) => e.line)).toEqual([
      'Outline written: “Lost”, 2 scenes, about 1:00',
      'Writing the outline again with what the brief says now',
    ]);
    // Written again with it, and nothing more changed: done.
    studio.meanwhile.outline = () => undefined;
    await studio.processor.process(
      job({ kind: 'outline', request: 'Take in what the brief says now.' }),
      last('j11'),
    );
    expect(studio.episodes.get('e1')?.busy).toBeNull();
    expect(studio.queued).toHaveLength(1);
  });
});

describe('a Studio scene as it is made', () => {
  const maya = (file: string): unknown =>
    JSON.parse(
      readFileSync(
        join(__dirname, '../../business/domain/studio/__fixtures__/maya', file),
        'utf8',
      ),
    );
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: 'Maya and the Missing Pup',
    format: 'story',
    brief,
    bible: bibleOf(maya('bible.json')),
    createdAt: at,
    updatedAt: at,
  };
  const episode = {
    id: 'e1',
    showId: 's1',
    userId: 'u1',
    number: 1,
    title: 'Maya and the Missing Pup',
    logline: null,
    phase: 'made',
    busy: null,
    error: null,
    outline: null,
    shareToken: null,
    durationMs: null,
    thumbKey: null,
    createdAt: at,
    updatedAt: at,
  } as StudioEpisodeRecord;
  const rows = [4, 5].map(
    (n, k) =>
      ({
        id: `c${n}`,
        episodeId: 'e1',
        position: k,
        sheet: storySheetOf(maya(`s${n}-sheet.json`)),
        status: 'made',
      }) as StudioSceneRecord,
  );

  it('carries on from the scene before, and plays again by its fallback a beat the film showed nothing for', () => {
    const made = studioMakeOf(show, episode, rows[1], rows, show.bible!);
    // Pip still has the ball from the field, in his mouth: a thing of its
    // own, never drawn into him.
    const pip = made.script?.cast.find((t) => t.id === 'pip') as {
      holding?: string;
    };
    expect(pip.holding).toBeUndefined();
    expect(made.script?.propsHeld?.ball).toEqual({ by: 'pip', in: 'mouth' });
    // The film made before these words won shows Pip doing nothing where
    // he drops the ball: that beat is played again, and logged for us.
    const again = made.recheck!(maya('s5-made.json') as SceneDto);
    expect(again.script).not.toBeNull();
    expect(again.notes.join(' ')).toMatch(/pip drop: unseen/);
    expect(again.script?.beats.map((b) => b.say)).toEqual(
      made.script?.beats.map((b) => b.say),
    );
  });

  it('brings someone on holding what the scene before left them with, not what they always carry', () => {
    const [s2, s3] = [2, 3].map(
      (n, k) =>
        ({
          id: `c${n}`,
          episodeId: 'e1',
          position: k,
          sheet: storySheetOf(maya(`s${n}-sheet.json`)),
          status: 'made',
        }) as StudioSceneRecord,
    );
    const made = studioMakeOf(show, episode, s3, [s2, s3], show.bible!);
    // Maya always carries a ball, but left the market with nothing.
    const cast = (id: string) =>
      made.script?.cast.find((t) => t.id === id) as { holding?: string };
    expect(cast('maya').holding).toBeUndefined();
    expect(made.script?.propsHeld?.ball).toBeUndefined();
    // Tobi comes on with his magnifier, a thing of its own in his hand.
    expect(made.script?.propsHeld?.magnifier).toEqual({
      by: 'tobi',
      in: 'hand',
    });
  });
});

describe("a show's own things and features, as a film is made", () => {
  const kofi = bibleOf({
    characters: [
      { name: 'Kofi', voice: 'boy', figure: { age: 'child' } },
      { name: 'Ama', voice: 'girl', figure: { age: 'child' } },
    ],
    sets: [{ name: 'Field', look: 'a dusty field' }],
  });
  const flies = storySheetOf({
    title: 'The kite',
    set: 'field',
    onStage: [
      { who: 'kofi', spot: 'centre-left' },
      { who: 'ama', spot: 'right' },
    ],
    beats: [
      { kind: 'line', who: 'kofi', say: 'Look!', feeling: 'happy' },
      {
        kind: 'business',
        who: 'kofi',
        do: 'raise',
        say: 'Kofi flies his kite.',
      },
      {
        kind: 'action',
        who: 'ama',
        do: 'run',
        say: 'Ama runs to the signpost.',
      },
      { kind: 'line', who: 'ama', say: 'Here!', feeling: 'happy' },
    ],
  });
  const show: StudioShowRecord = {
    id: 's9',
    userId: 'u1',
    title: 'Kofi and the Kite',
    format: 'story',
    brief,
    bible: kofi,
    createdAt: at,
    updatedAt: at,
  };
  const episode = {
    id: 'e9',
    showId: 's9',
    userId: 'u1',
    number: 1,
    title: 'The kite',
    logline: null,
    phase: 'script',
    busy: null,
    error: null,
    outline: null,
    shareToken: null,
    durationMs: null,
    thumbKey: null,
    createdAt: at,
    updatedAt: at,
  } as StudioEpisodeRecord;
  const row = {
    id: 'c9',
    episodeId: 'e9',
    position: 0,
    sheet: flies,
    status: 'ready',
  } as StudioSceneRecord;

  it('stages the kite and the signpost the words name, kept where the show keeps its own', () => {
    const made = studioMakeOf(show, episode, row, [row], kofi);
    expect(made.story?.ownKey).toBe('studio/s9/own.json');
    expect(made.script?.ownThings).toEqual([{ id: 'kite', name: 'kite' }]);
    expect(made.script?.propsHeld).toEqual({
      kite: { by: 'kofi', in: 'hand' },
    });
    expect(made.script?.features?.map((f) => [f.id, f.kind])).toEqual([
      ['signpost', 'drawn'],
    ]);
  });

  it("draws the show's own once, before its scenes are made side by side", async () => {
    const grown = {
      ...kofi,
      things: [{ id: 'kite', name: 'kite', kind: 'thing' as const }],
      sets: kofi.sets.map((s) => ({
        ...s,
        features: [
          {
            id: 'signpost',
            name: 'signpost',
            kind: 'drawn' as const,
            spot: 'right' as const,
            opens: false,
          },
        ],
      })),
    };
    const prepared: unknown[][] = [];
    const processor = new StudioProcessor(
      {
        findShow: () => Promise.resolve({ ...show, bible: grown }),
        findEpisode: () => Promise.resolve(episode),
        listScenes: () => Promise.resolve([row]),
        updateScene: () => Promise.resolve(),
      } as unknown as StudioRepository,
      {} as LlmGatewayPort,
      { record: () => Promise.resolve() },
      {} as never,
      {
        prepareStory: (...args: unknown[]) => {
          prepared.push(args);
          return Promise.resolve();
        },
      } as unknown as SceneProcessor,
      {} as never,
      {} as never,
      { enqueueStudio: () => Promise.resolve() } as never,
    );
    await processor.process(
      {
        kind: 'prepare',
        showId: 's9',
        episodeId: 'e9',
        userId: 'u1',
        sceneIds: ['c9'],
      },
      { attemptsMade: 1, isFinalAttempt: true },
    );
    expect(prepared).toHaveLength(1);
    const [story, , , , own] = prepared[0] as [
      { ownKey: string },
      unknown,
      unknown,
      unknown,
      { things: unknown[]; features: { id: string }[] },
    ];
    expect(story.ownKey).toBe('studio/s9/own.json');
    expect(own.things).toEqual([{ id: 'kite', name: 'kite', kind: 'thing' }]);
    expect(own.features.map((f) => f.id)).toEqual(['signpost']);
  });
});
