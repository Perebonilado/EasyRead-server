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
import {
  StudioProcessor,
  settledEpisode,
  studioMakeOf,
} from './studio.processor';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../contracts';
import { NotFoundError } from '../../business/domain/errors/errors';
import {
  SHEET_VERSION,
  optionsKey,
  type CharacterSheet,
} from '../../business/domain/scene-sheet';
import {
  StudioCastService,
  studioCastKey,
} from '../../business/handlers/studio/studio-cast.service';
import { markDrawing } from '../../business/domain/studio/studio-drawings';

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
/** The story "Lost" is built from: a premise, Tobi's sheet, five beats and two scenes. */
const premise = {
  title: 'Lost',
  logline:
    'Tobi wants to find his dog before the market closes, but every stall he asks sends him the wrong way.',
  theme: 'asking for help',
  hook: 'An empty lead.',
  genre: 'comedy',
  ending: 'happy',
  stakes: 'his dog, alone at closing time',
  tools: ['ticking clock'],
  gag: 'everyone points a different way',
  clues: [],
};
const persona = {
  id: 'tobi',
  want: 'to find his dog',
  need: 'to ask for help',
  flaw: 'too proud to ask',
  fear: 'being laughed at',
  personality: ['counts everything', 'hums when nervous'],
  voice: 'short sentences',
  habits: ['tugs his cap'],
  relationships: [],
  arc: { from: 'alone', to: 'asking' },
};
const beat = (
  role: string,
  intensity: number,
  plants: string[] = [],
  pays: string[] = [],
) => ({
  role,
  what: `The ${role}.`,
  wants: 'Tobi wants his dog',
  stops: 'the crowd',
  changes: 'it changes',
  intensity,
  plants,
  pays,
});
const beats = [
  beat('setup', 2, ['whistle']),
  beat('problem', 5),
  beat('attempt', 6),
  beat('twist', 8),
  beat('payoff', 3, [], ['whistle']),
];
const plan = {
  scenes: outline.scenes.map((scene, k) => ({
    ...scene,
    beats: k ? [3, 4] : [0, 1, 2],
    purpose: 'moves it on',
    conflict: 'Tobi against the crowd',
    turn: k ? 'the dog is found' : 'the dog is gone',
    shift: 'calm to panic',
    moment: 'the empty lead',
  })),
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
  const usage = { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 };
  const llm = {
    studioOutline: () => {
      meanwhile.outline();
      return Promise.resolve({ value: outline, usage });
    },
    // A story developed in steps, its outline built from the plan: "Lost".
    studioPremise: () => Promise.resolve({ value: premise, usage }),
    studioCharacters: () =>
      Promise.resolve({ value: { characters: [persona] }, usage }),
    studioBeats: () => Promise.resolve({ value: { beats }, usage }),
    studioScenePlan: () => {
      meanwhile.outline();
      return Promise.resolve({ value: plan, usage });
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
      { what: 'story', sceneId: undefined, line: 'Story developed: “Lost”' },
      {
        what: 'outline',
        sceneId: undefined,
        line: 'Outline written: “Lost”, 2 scenes, about 1:00',
      },
    ]);
    // Built from its story, which it keeps; Tobi is who he is now.
    const written = studio.episodes.get('e1')!.outline!;
    expect(written.story?.premise.title).toBe('Lost');
    expect(written.story?.plan.scenes[1].turn).toBe('the dog is found');
    expect(written.scenes.map((s) => s.title)).toEqual(['Market', 'Home']);
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
      'Story developed: “Lost”',
      'Outline written: “Lost”, 2 scenes, about 1:00',
      'Writing the outline again with what the brief says now',
    ]);
    // A story's is developed again with it.
    expect(studio.queued[0]).toMatchObject({ story: true });
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

describe('an episode as its scenes leave it', () => {
  const row = (
    status: StudioSceneRecord['status'],
    durationMs: number | null,
    n: number,
  ) => ({
    status,
    sceneKey: status === 'made' || status === 'failed' ? `s${n}.json` : null,
    durationMs,
    thumbKey: `s${n}.png`,
  });

  it('is made, as long as its made scenes, its still the first made one', () => {
    expect(
      settledEpisode([row('made', 30000, 1), row('made', 12000, 2)]),
    ).toEqual({
      phase: 'made',
      durationMs: 42000,
      thumbKey: 's1.png',
      error: null,
    });
  });

  it('says so when a scene could not be made, and counts only those made', () => {
    const settled = settledEpisode([
      row('failed', 9000, 1),
      row('made', 12000, 2),
    ]);
    expect(settled.durationMs).toBe(12000);
    expect(settled.thumbKey).toBe('s2.png');
    expect(settled.error).toMatch(/could not be made/);
  });

  it('keeps its film as it was when none is made', () => {
    const settled = settledEpisode([row('failed', null, 1)]);
    expect(Object.keys(settled)).toEqual(['error']);
    expect(settled.error).toMatch(/could not be made/);
  });
});

describe('the cast drawn by the artist, at the cast step and again as asked', () => {
  const drawn = (svg: string): CharacterSheet => ({
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
  const humptyBible = bibleOf({
    characters: [
      { name: 'Humpty', id: 'humpty', kind: 'creature', look: 'an egg' },
      {
        name: 'Horse',
        id: 'horse',
        kind: 'animal',
        look: 'a brown horse',
        voicePick: 1,
      },
      {
        name: 'Tobi',
        voice: 'boy',
        figure: { age: 'child', hair: 'short', hairColour: 'brown' },
      },
    ],
    sets: [{ name: 'The Wall', id: 'wall' }],
  });

  function artist(
    start: typeof humptyBible = humptyBible,
    /** What the cast's writer answers, from the bible and the request it is given. */
    writes?: (given: typeof humptyBible, request: string) => unknown,
  ) {
    const files = new Map<string, Buffer>();
    const requests: string[] = [];
    const storage = {
      get: (key: string) =>
        files.has(key)
          ? Promise.resolve(files.get(key)!)
          : Promise.reject(new NotFoundError('File')),
      put: ({ key, body }: { key: string; body: Buffer }) => {
        files.set(key, body);
        return Promise.resolve({ key, size: body.length });
      },
    };
    const cast = new StudioCastService(storage as never);
    const keptAt = (key: string): Record<string, CharacterSheet> =>
      files.has(key)
        ? (JSON.parse(files.get(key)!.toString()) as Record<
            string,
            CharacterSheet
          >)
        : {};
    const messages: StudioMessageRecord[] = [];
    const asked: {
      id: string;
      words: string;
      now: CharacterSheet | null;
    }[] = [];
    const prepared: { characters: Set<string>; places: Set<string> }[] = [];
    const bible: { current: typeof humptyBible } = { current: start };
    let answer: CharacterSheet | null = drawn('<svg><circle r="2"/></svg>');
    /** Every take's best, when the artist drew more than one. */
    let answers: CharacterSheet[] | null = null;
    const takes: (number | undefined)[] = [];
    const show = (): StudioShowRecord => ({
      id: 's1',
      userId: 'u1',
      title: "Humpty's Big Wobble",
      format: 'story',
      brief,
      bible: bible.current,
      createdAt: at,
      updatedAt: at,
    });
    const episode: StudioEpisodeRecord = {
      id: 'e1',
      showId: 's1',
      userId: 'u1',
      number: 1,
      title: 'Wobble',
      logline: null,
      phase: 'cast',
      busy: null,
      error: null,
      outline: null,
      shareToken: null,
      durationMs: null,
      thumbKey: null,
      createdAt: at,
      updatedAt: at,
    };
    const queued: StudioJobData[] = [];
    const processor = new StudioProcessor(
      {
        findShow: () => Promise.resolve(show()),
        findEpisode: () => Promise.resolve(episode),
        updateShow: (_: string, patch: { bible?: typeof humptyBible }) => {
          if (patch.bible) bible.current = patch.bible;
          return Promise.resolve();
        },
        updateEpisode: () => Promise.resolve(),
        listEpisodes: () => Promise.resolve([episode]),
        listScenes: () => Promise.resolve([]),
        addMessage: (input: StudioMessageRecord) => {
          const there = input.id && messages.find((m) => m.id === input.id);
          if (there) return Promise.resolve(there);
          const message = { ...input, id: input.id ?? `m${messages.length}` };
          messages.push(message);
          return Promise.resolve(message);
        },
        listMessages: () => Promise.resolve([...messages]),
      } as unknown as StudioRepository,
      {
        studioBible: (input: {
          previous?: typeof humptyBible;
          request?: string;
        }) => {
          requests.push(input.request ?? '');
          return Promise.resolve({
            value: writes
              ? writes(input.previous ?? bible.current, input.request ?? '')
              : {
                  ...humptyBible,
                  characters: humptyBible.characters.map((c) =>
                    c.id === 'horse' ? { ...c, look: 'a white horse' } : c,
                  ),
                },
            usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
          });
        },
      } as unknown as LlmGatewayPort,
      { record: () => Promise.resolve() },
      storage as never,
      {
        drawCandidates: (
          _story: unknown,
          id: string,
          words: string,
          now: CharacterSheet | null,
          _documentId: string,
          _who: string,
          options?: { takes?: number },
        ) => {
          asked.push({ id, words, now });
          takes.push(options?.takes);
          return Promise.resolve(answers ?? (answer ? [answer] : []));
        },
        keepSheet: (key: string, id: string, sheet: CharacterSheet) => {
          files.set(
            key,
            Buffer.from(JSON.stringify({ ...keptAt(key), [id]: sheet })),
          );
          return Promise.resolve();
        },
        prepareStory: (
          story: { castKey: string },
          _documentId: string,
          _who: string,
          only: { characters: Set<string>; places: Set<string> },
        ) => {
          prepared.push(only);
          const kept = keptAt(story.castKey);
          for (const id of only.characters)
            kept[id] = drawn(`<svg><rect id="${id}"/></svg>`);
          files.set(story.castKey, Buffer.from(JSON.stringify(kept)));
          return Promise.resolve();
        },
      } as unknown as SceneProcessor,
      {} as never,
      cast,
      {
        enqueueStudio: (jobs: StudioJobData[]) => {
          queued.push(...jobs);
          return Promise.resolve();
        },
      } as never,
    );
    const lines = () => messages.map((m) => m.content);
    return {
      processor,
      cast,
      files,
      asked,
      prepared,
      queued,
      lines,
      bible,
      requests,
      takes,
      setAnswer: (next: CharacterSheet | null) => {
        answer = next;
      },
      setAnswers: (next: CharacterSheet[]) => {
        answers = next;
      },
    };
  }
  const cast = (files: Map<string, Buffer>) =>
    JSON.parse(files.get(studioCastKey('s1'))?.toString() ?? '{}') as Record<
      string,
      CharacterSheet
    >;

  it('draws the animals and creatures asked for, before any film, and says who is drawn', async () => {
    const studio = artist();
    await studio.cast.changeWork('s1', (work) =>
      markDrawing(work, ['humpty', 'horse'], Date.now()),
    );
    await studio.processor.process(
      job({ kind: 'draw', characterIds: ['humpty', 'horse'] }),
      last('d1'),
    );
    expect(studio.prepared).toEqual([
      { characters: new Set(['humpty', 'horse']), places: new Set() },
    ]);
    expect(Object.keys(cast(studio.files)).sort()).toEqual(['horse', 'humpty']);
    expect((await studio.cast.work('s1')).drawing).toEqual({});
    expect(studio.lines()).toEqual(['Humpty and Horse drawn — have a look']);
  });

  it('draws only the one character asked for again, from the drawing they have, and keeps it waiting beside it', async () => {
    const studio = artist();
    const old = drawn('<svg><circle r="1"/></svg>');
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(JSON.stringify({ humpty: old, horse: old })),
    );
    await studio.cast.changeWork('s1', (work) =>
      markDrawing(work, ['humpty'], Date.now(), 'rounder, a crack on top'),
    );
    await studio.processor.process(
      job({
        kind: 'redraw',
        characterId: 'humpty',
        request: 'rounder, a crack on top',
      }),
      last('r1'),
    );
    expect(studio.asked).toEqual([
      { id: 'humpty', words: 'rounder, a crack on top', now: old },
    ]);
    // The drawing they have is untouched; the new one waits to be chosen.
    expect(cast(studio.files).humpty.drawing.svg).toContain('r="1"');
    const work = await studio.cast.work('s1');
    expect(Object.keys(work.candidates)).toEqual(['humpty']);
    expect(work.candidates.humpty.words).toBe('rounder, a crack on top');
    expect(work.drawing).toEqual({});
    expect(studio.lines()).toEqual(['Humpty redrawn — have a look']);
    expect(studio.lines().join(' ')).not.toContain('Cast changed');
  });

  it('draws a character again three ways, the artist’s takes, and says so', async () => {
    const studio = artist();
    const old = drawn('<svg><circle r="1"/></svg>');
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(JSON.stringify({ humpty: old })),
    );
    studio.setAnswers(
      [2, 3, 4].map((r) => drawn(`<svg><circle r="${r}"/></svg>`)),
    );
    await studio.processor.process(
      job({ kind: 'redraw', characterId: 'humpty', request: 'rounder' }),
      last('r3'),
    );
    // Three takes side by side, as a new character's.
    expect(studio.takes).toEqual([3]);
    const waiting = (await studio.cast.work('s1')).candidates.humpty;
    expect(waiting.options.map((o) => o.sheet!.drawing.svg)).toEqual([
      '<svg><circle r="2"/></svg>',
      '<svg><circle r="3"/></svg>',
      '<svg><circle r="4"/></svg>',
    ]);
    expect(studio.lines()).toEqual(['Humpty redrawn three ways — pick one']);
    // The thread's line names him, so it can show the three to choose from.
    expect(
      (await studio.cast.work('s1')).candidates.humpty.first,
    ).toBeUndefined();
  });

  it('offers a first drawing’s other takes beside it, the best in use', async () => {
    const studio = artist();
    studio.files.set(
      optionsKey(studioCastKey('s1')),
      Buffer.from(
        JSON.stringify({
          humpty: [5, 6].map((r) => drawn(`<svg><circle r="${r}"/></svg>`)),
        }),
      ),
    );
    await studio.cast.changeWork('s1', (work) =>
      markDrawing(work, ['humpty', 'horse'], Date.now()),
    );
    await studio.processor.process(
      job({ kind: 'draw', characterIds: ['humpty', 'horse'] }),
      last('d2'),
    );
    const waiting = (await studio.cast.work('s1')).candidates.humpty;
    expect(waiting.first).toBe(true);
    expect(waiting.words).toBe('');
    expect(waiting.options.map((o) => o.sheet!.drawing.svg)).toEqual([
      '<svg><rect id="humpty"/></svg>',
      '<svg><circle r="5"/></svg>',
      '<svg><circle r="6"/></svg>',
    ]);
    expect(studio.lines()).toEqual([
      'Horse drawn — have a look',
      'Humpty drawn three ways — the first is in use, or pick another',
    ]);
  });

  it('draws a person again as the kit’s readings of the words: the writer’s, and the nearest others', async () => {
    const studio = artist(humptyBible, (given) => ({
      ...given,
      characters: given.characters.map((c) =>
        c.id === 'tobi'
          ? {
              ...c,
              look: 'a boy with dark brown curly hair',
              figure: { ...c.figure, hairColour: 'dark brown', hair: 'curly' },
            }
          : c,
      ),
    }));
    await studio.processor.process(
      job({
        kind: 'redraw',
        characterId: 'tobi',
        request: 'darker, wavier hair',
      }),
      last('p1'),
    );
    expect(studio.asked).toEqual([]);
    const waiting = (await studio.cast.work('s1')).candidates.tobi;
    const figures = waiting.options.map((o) => o.figure!);
    expect(figures).toHaveLength(3);
    expect(figures[0]).toMatchObject({
      hairColour: 'dark brown',
      hair: 'curly',
    });
    // Another reading of each field the change touched, one field each:
    // the nearest shade of dark brown, and another style the words left open.
    expect(figures[1]).toMatchObject({ hairColour: 'black', hair: 'curly' });
    expect(figures[2].hairColour).toBe('dark brown');
    expect(figures[2].hair).toBe('afro');
    expect(waiting.options.every((o) => !o.sheet)).toBe(true);
    expect(waiting.options[0].look).toBe('a boy with dark brown curly hair');
    expect(waiting.options[1].look).toBe('a boy with black curly hair');
    expect(studio.lines()).toEqual(['Tobi redrawn three ways — pick one']);
    // Theirs is as it was until the maker chooses.
    expect(studio.bible.current.characters[2].figure?.hair).toBe('short');
  });

  /** Clover, drawn by the animal kit: a chestnut horse. */
  const cloverBible = bibleOf({
    characters: [
      {
        name: 'Clover',
        id: 'clover',
        kind: 'animal',
        look: 'a gentle chestnut horse',
        animal: { species: 'horse' },
      },
      { name: 'Tobi', voice: 'boy', figure: { age: 'child' } },
    ],
    sets: [{ name: 'The Field', id: 'field' }],
  });
  /** A writer that gives Clover a red saddle blanket, in her spec and in words. */
  const blanketed = (given: typeof humptyBible) => ({
    ...given,
    characters: given.characters.map((c) =>
      c.id === 'clover'
        ? {
            ...c,
            look: 'a gentle chestnut horse with a red saddle blanket',
            animal: {
              ...c.animal,
              wear: { back: 'saddle blanket' },
              wearColour: 'red',
            },
          }
        : c,
    ),
  });

  it('draws an animal the kit draws again as its spec changed by the cast’s writer, waiting to be chosen', async () => {
    const studio = artist(cloverBible, blanketed);
    await studio.cast.changeWork('s1', (work) =>
      markDrawing(
        work,
        ['clover'],
        Date.now(),
        'give her a red saddle blanket',
      ),
    );
    await studio.processor.process(
      job({
        kind: 'redraw',
        characterId: 'clover',
        request: 'give her a red saddle blanket',
      }),
      last('k1'),
    );
    // The writer is asked for her alone; no artist is asked at all.
    expect(studio.requests).toHaveLength(1);
    expect(studio.requests[0]).toContain(
      "Change only Clover's look, as the maker asks: give her a red saddle blanket.",
    );
    expect(studio.asked).toEqual([]);
    const work = await studio.cast.work('s1');
    const waiting = work.candidates.clover;
    // What she asks for is named ("a red saddle blanket"), and red has no
    // near shade: one reading, the writer's.
    expect(waiting.options).toHaveLength(1);
    expect(waiting.options[0].sheet!.animal).toMatchObject({
      species: 'horse',
      wear: { back: 'saddle blanket' },
      wearColour: 'red',
    });
    expect(waiting.options[0].look).toBe(
      'a gentle chestnut horse with a red saddle blanket',
    );
    expect(waiting.options[0].sheet!.drawing.svg).toContain('#d9534f');
    expect(waiting.words).toBe('give her a red saddle blanket');
    expect(work.drawing).toEqual({});
    expect(studio.lines()).toEqual(['Clover redrawn — have a look']);
    // Her spec in the bible is as it was until the maker chooses.
    expect(studio.bible.current.characters[0].animal?.wear).toEqual({});
  });

  it('asks once more when the writer changes nothing, and says so if it still does not', async () => {
    const studio = artist(cloverBible, (given) => given);
    await studio.cast.changeWork('s1', (work) =>
      markDrawing(work, ['clover'], Date.now(), 'make her happier'),
    );
    await studio.processor.process(
      job({
        kind: 'redraw',
        characterId: 'clover',
        request: 'make her happier',
      }),
      last('k2'),
    );
    expect(studio.requests).toHaveLength(2);
    expect(studio.requests[1]).toContain('That came back as it was');
    expect(studio.asked).toEqual([]);
    expect(await studio.cast.work('s1')).toEqual({
      drawing: {},
      candidates: {},
    });
    expect(studio.lines()).toEqual([
      "Clover's new look could not be worked out from that. Say it another way, or try again.",
    ]);
  });

  it('offers an animal the artist drew as the kit’s, when the writer gives it a spec', async () => {
    const studio = artist(humptyBible, (given) => ({
      ...given,
      characters: given.characters.map((c) =>
        c.id === 'horse'
          ? { ...c, animal: { species: 'horse', coat: 'white' } }
          : c,
      ),
    }));
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(
        JSON.stringify({ horse: drawn('<svg><circle r="1"/></svg>') }),
      ),
    );
    await studio.processor.process(
      job({ kind: 'redraw', characterId: 'horse', request: 'make him white' }),
      last('k3'),
    );
    expect(studio.asked).toEqual([]);
    const waiting = (await studio.cast.work('s1')).candidates.horse;
    expect(waiting.options[0].sheet!.animal).toMatchObject({
      species: 'horse',
      coat: 'white',
    });
    // The artist's drawing stays theirs until the maker chooses.
    expect(cast(studio.files).horse.drawing.svg).toContain('r="1"');
  });

  it('offers a creature the artist drew as the creature kit’s, when the writer gives it a spec', async () => {
    const studio = artist(humptyBible, (given) => ({
      ...given,
      characters: given.characters.map((c) =>
        c.id === 'humpty'
          ? {
              ...c,
              look: 'a round white egg with a crack on top',
              creature: {
                body: 'egg',
                build: 'stout',
                bodyColour: 'white',
                texture: 'crack',
              },
            }
          : c,
      ),
    }));
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(
        JSON.stringify({ humpty: drawn('<svg><circle r="1"/></svg>') }),
      ),
    );
    await studio.processor.process(
      job({
        kind: 'redraw',
        characterId: 'humpty',
        request: 'rounder, a crack on top',
      }),
      last('k4'),
    );
    // No artist asked: the kit drew what the writer said.
    expect(studio.asked).toEqual([]);
    const waiting = (await studio.cast.work('s1')).candidates.humpty;
    expect(waiting.options[0].sheet!.creature).toMatchObject({
      body: 'egg',
      build: 'stout',
      texture: 'crack',
    });
    expect(waiting.options[0].look).toBe(
      'a round white egg with a crack on top',
    );
    // A spec new to him: only its colours read another way (white, cream, silver).
    expect(
      waiting.options.map((one) => one.sheet!.creature!.bodyColour),
    ).toEqual(['white', 'cream', 'silver']);
    // The artist's drawing stays his until the maker chooses.
    expect(cast(studio.files).humpty.drawing.svg).toContain('r="1"');
  });

  it('says so when no new drawing came, and stops showing them as being drawn', async () => {
    const studio = artist();
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(
        JSON.stringify({ humpty: drawn('<svg><circle r="1"/></svg>') }),
      ),
    );
    await studio.cast.changeWork('s1', (work) =>
      markDrawing(work, ['humpty'], Date.now(), 'rounder'),
    );
    studio.setAnswer(null);
    await studio.processor.process(
      job({ kind: 'redraw', characterId: 'humpty', request: 'rounder' }),
      last('r2'),
    );
    expect(studio.lines()).toEqual([
      'Humpty could not be drawn again. Try again in a moment.',
    ]);
    expect(await studio.cast.work('s1')).toEqual({
      drawing: {},
      candidates: {},
    });
  });

  it('says what a change to the whole cast changed, and draws anyone whose look changed', async () => {
    const studio = artist();
    const old = drawn('<svg><circle r="1"/></svg>');
    studio.files.set(
      studioCastKey('s1'),
      Buffer.from(JSON.stringify({ humpty: old, horse: old })),
    );
    await studio.processor.process(
      job({ kind: 'bible', request: 'make the horse white' }),
      last('b1'),
    );
    expect(studio.lines()).toEqual(["Cast changed: Horse's look"]);
    // The horse's drawing is forgotten and drawn again; Humpty's is kept.
    expect(Object.keys(cast(studio.files))).toEqual(['humpty']);
    expect(studio.queued).toEqual([
      expect.objectContaining({ kind: 'draw', characterIds: ['horse'] }),
    ]);
  });
});

describe("an explainer's scene written for whom it teaches (Ask 8)", () => {
  const usage = { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 };
  const HARD =
    'The hydrological cycle constitutes a continuous circulation of water, which is driven primarily by solar radiation; evaporation from oceanic surfaces transports substantial quantities of moisture into the atmosphere.';
  const card = (id: string, name: string) => ({
    id,
    kind: 'words',
    name,
    style: 'keyword',
  });
  const draft = (say: string, steps: boolean) => ({
    fit: 'good',
    fitReason: null,
    title: 'The cycle',
    mood: 'curious',
    beats: [{ say, pause: 'short', delivery: 'explain' }],
    cast: [card('cycle', 'water cycle'), card('sea', 'evaporation')],
    steps: steps
      ? [
          {
            beat: 0,
            phrase: 'hydrological cycle',
            layout: 'one',
            show: ['cycle'],
            arrows: null,
            effects: null,
          },
          {
            beat: 0,
            phrase: 'evaporation from',
            layout: 'one',
            show: ['sea'],
            arrows: null,
            effects: null,
          },
        ]
      : [],
  });

  /** The writer, mocked: each call answers with the next draft. No model is called. */
  function writing(drafts: unknown[]) {
    const asked: { profile: string; problems?: string[] }[] = [];
    const saved: Partial<StudioSceneRecord>[] = [];
    const processor = new StudioProcessor(
      {
        updateScene: (_id: string, patch: Partial<StudioSceneRecord>) => {
          saved.push(patch);
          return Promise.resolve();
        },
      } as unknown as StudioRepository,
      {
        sceneScript: (input: { profile: string; problems?: string[] }) => {
          asked.push(input);
          return Promise.resolve({
            value: drafts[Math.min(asked.length, drafts.length) - 1],
            usage,
          });
        },
      } as unknown as LlmGatewayPort,
      { record: () => Promise.resolve() },
      {} as never,
      {} as SceneProcessor,
      {} as never,
      {} as never,
      {} as never,
    );
    const show = {
      id: 's1',
      userId: 'u1',
      title: 'Water',
      format: 'explainer',
      brief: briefOf({
        format: 'explainer',
        idea: 'The water cycle',
        who: { band: 'primary-upper', said: 'Grade 5' },
        minutes: 1.5,
        tone: 'calm',
      }),
      bible: null,
      createdAt: at,
      updatedAt: at,
    } as StudioShowRecord;
    const water = outlineOf({
      title: 'Water',
      logline: 'Where rain comes from.',
      scenes: [30, 30, 30].map((seconds, k) => ({
        title: `Scene ${k + 1}`,
        summary: 'The water cycle.',
        seconds,
        teach: 'The sun warms water and it rises as water vapour.',
        points: [],
      })),
    });
    const write = (k: number) =>
      (
        processor as unknown as {
          writeExplainerScene: (...args: unknown[]) => Promise<unknown>;
        }
      ).writeExplainerScene(
        show,
        { id: 'e1', number: 1 },
        water,
        bibleOf({ subject: 'The water cycle' }),
        { id: `c${k}`, position: k, sheet: null },
        k,
      );
    return { asked, saved, write };
  }

  it('tells the writer the recipe, and splits a too-long sentence by code without sending it back for words alone', async () => {
    const { asked, saved, write } = writing([draft(HARD, true)]);
    await write(0);
    expect(asked).toHaveLength(1);
    expect(asked[0].profile).toMatch(
      /eight to eleven[^\n]*The maker said "Grade 5"/,
    );
    expect(asked[0].profile).toMatch(/no question for the viewer/);
    const sheet = saved[0].sheet as { draft: { beats: { say: string }[] } };
    expect(sheet.draft.beats.length).toBeGreaterThan(1);
    expect(sheet.draft.beats[0].say).toBe(
      'The hydrological cycle constitutes a continuous circulation of water.',
    );
    // What is still too hard is never shown to the maker.
    expect(saved[0].problems?.some((p) => p.rule === 'plain')).toBe(false);
  });

  it('lets what is too hard ride along when the scene goes back anyway', async () => {
    const { asked, write } = writing([
      draft(HARD, false),
      draft('The sun warms the sea.', true),
    ]);
    await write(2);
    expect(asked).toHaveLength(2);
    // The last scene of a grade 5 film asks them a question.
    expect(asked[0].profile).toMatch(/this scene asks the viewer one question/);
    expect(asked[1].problems).toEqual(
      expect.arrayContaining([
        'Nothing is ever shown on the stage.',
        expect.stringMatching(/reads at about grade \d+; for these learners/),
        expect.stringMatching(/Ask the viewer one question/),
      ]),
    );
  });
});
