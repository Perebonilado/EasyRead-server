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
import { StudioProcessor } from './studio.processor';

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
