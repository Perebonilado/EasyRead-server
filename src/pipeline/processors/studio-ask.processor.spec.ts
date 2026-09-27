import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bibleOf,
  briefOf,
  outlineOf,
  storySheetOf,
} from '../../business/domain/studio/studio';
import {
  mendSheet,
  repairSheet,
  withFound,
} from '../../business/domain/studio/studio-check';
import { stageStory } from '../../business/domain/studio/studio-stage';
import { describeStaged } from '../../business/domain/studio/studio-staged';
import { voiced } from '../../business/domain/studio/__fixtures__/voiced';
import type {
  LlmGatewayPort,
  StudioCheckVerdict,
} from '../../business/ports/llm.port';
import type { StudioAsk } from '../../business/ports/job-queue.port';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { SceneDto } from '../../contracts';
import type { StudioJobData } from '../queues';
import type { SceneProcessor } from './scene.processor';
import { StudioProcessor } from './studio.processor';

/**
 * A maker's request for a change to a scene that was made: written again,
 * made again at once, and checked against what the film now shows. Shown
 * as asked, the thread says so, once; not yet, the Studio tries once more
 * without spending the maker's film; not yet again, it says so honestly,
 * never as done.
 */

const tobi = (file: string): unknown =>
  JSON.parse(
    readFileSync(
      join(__dirname, '../../business/domain/studio/__fixtures__/tobi', file),
      'utf8',
    ),
  );
const at = new Date('2026-09-27T08:00:00Z');
const bible = bibleOf(tobi('bible.json'));
const sheet = storySheetOf(tobi('s1-sheet.json'));
/** The film as made before: Tobi in a bed of his own, which went with him. */
const madeBefore = tobi('s1-made.json') as SceneDto;

/** The film as the stage makes it now, voiced as a test voices it. */
function madeNow(): SceneDto {
  const mended = mendSheet(repairSheet(sheet, bible), bible);
  const show = withFound(bible, mended.sheet.set, mended);
  const { scene } = voiced(stageStory(mended.sheet, show));
  for (const thing of scene.things)
    if (thing.kind === 'drawing' && thing.rig)
      thing.joints = {
        r: [
          [0.6, 0.4],
          [0.7, 0.5],
          [0.7, 0.6],
        ],
        l: [
          [0.4, 0.4],
          [0.3, 0.5],
          [0.3, 0.6],
        ],
      };
  return scene;
}

const ask = (patch: Partial<StudioAsk> = {}): StudioAsk => ({
  id: 'm1',
  words:
    'make Tobi get out of bed himself instead of the bed moving, and fix the uniform so it does not follow him around',
  request: 'Tobi gets out of bed himself; the bed stays',
  tries: 1,
  ...patch,
});

function studio(verdict: () => Promise<StudioCheckVerdict>) {
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: "Tobi's First Day of Stories",
    format: 'story',
    brief: briefOf({
      format: 'story',
      idea: 'A first day at school',
      audience: 'young children',
      minutes: 2,
      tone: 'gentle',
    }),
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
        title: 'The First Day',
        logline: null,
        phase: 'made',
        busy: 'scene',
        error: null,
        outline: outlineOf({
          title: 'The First Day',
          scenes: [
            {
              title: 'Up Before the Alarm',
              summary: 'Tobi gets up and dressed.',
              set: 'bedroom',
              cast: ['tobi', 'mama'],
              seconds: 45,
            },
          ],
        }),
        shareToken: null,
        durationMs: 47_000,
        thumbKey: 't0',
        createdAt: at,
        updatedAt: at,
      },
    ],
  ]);
  const scenes = new Map<string, StudioSceneRecord>([
    [
      'c1',
      {
        id: 'c1',
        episodeId: 'e1',
        position: 0,
        sheet,
        sheetHash: null,
        problems: [],
        previousSheet: null,
        status: 'writing',
        step: null,
        error: null,
        sceneKey: 'k0',
        audioKey: 'a0',
        thumbKey: 't0',
        madeHash: 'h0',
        durationMs: madeBefore.durationMs,
        updatedAt: at,
      },
    ],
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
    listScenes: () => Promise.resolve([...scenes.values()]),
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
  const checks: unknown[] = [];
  const written: unknown[] = [];
  const llm = {
    studioScene: (input: unknown) => {
      written.push(input);
      return Promise.resolve({
        value: tobi('s1-sheet.json'),
        usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
      });
    },
    studioCheck: (input: unknown) => {
      checks.push(input);
      return verdict().then((value) => ({
        value,
        usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
      }));
    },
  } as unknown as LlmGatewayPort;
  const queued: StudioJobData[] = [];
  const now = madeNow();
  const stage = {
    make: () =>
      Promise.resolve({
        fit: 'good',
        scene: now,
        sceneKey: 'k1',
        thumbKey: 't1',
        voice: { audioKey: 'a1', durationMs: now.durationMs },
      }),
    recompose: () =>
      Promise.resolve({ scene: now, sceneKey: 'k2', thumbKey: 't2' }),
  } as unknown as SceneProcessor;
  const spent: number[] = [];
  const processor = new StudioProcessor(
    repo as StudioRepository,
    llm,
    { record: () => Promise.resolve() },
    {
      get: (key: string) =>
        key === 'k0'
          ? Promise.resolve(Buffer.from(JSON.stringify(madeBefore)))
          : Promise.reject(new Error('no such file')),
      delete: () => Promise.resolve(),
    } as never,
    stage,
    {
      recordStudioSeconds: (_: string, s: number) => {
        spent.push(s);
        return Promise.resolve();
      },
      forUser: () =>
        Promise.resolve({ assertStudioAvailable: () => undefined }),
    } as never,
    {} as never,
    {
      enqueueStudio: (jobs: StudioJobData[]) => {
        queued.push(...jobs);
        return Promise.resolve();
      },
    } as never,
  );
  const events = () =>
    messages.map((m) => ({ what: m.meta?.event?.what, line: m.content }));
  return {
    processor,
    scenes,
    episodes,
    messages,
    events,
    queued,
    checks,
    written,
    spent,
  };
}

const context = { attemptsMade: 1, isFinalAttempt: true, jobId: 'j1' };
const job = (patch: Partial<StudioJobData>): StudioJobData => ({
  kind: 'make',
  showId: 's1',
  episodeId: 'e1',
  userId: 'u1',
  sceneId: 'c1',
  ...patch,
});
const shown =
  (tell = 'Tobi now climbs out of bed and the bed stays put') =>
  () =>
    Promise.resolve({ resolved: true, reason: '', tell, faults: [] });
const notYet =
  (tell = 'Tobi still carries the bed when he gets up') =>
  () =>
    Promise.resolve({
      resolved: false,
      reason: 'b2: the bed still moves with Tobi',
      tell,
      faults: ['furniture-moves'],
    });

describe('a scene changed as the maker asked, made again and checked', () => {
  it('writes it with what the film showed, then makes it again at once, to check it', async () => {
    const s = studio(shown());
    await s.processor.process(
      job({ kind: 'scene', request: ask().request, ask: ask() }),
      context,
    );
    // The writer is told what the film showed, as made: the bed went with him.
    expect((s.written[0] as { request: string }).request).toMatch(
      /What the film of this scene shows now[^]*Tobi gets up; the bed moves with them/,
    );
    expect(s.queued).toMatchObject([
      { kind: 'prepare', sceneIds: ['c1'], ask: { tries: 1 } },
    ]);
    expect(s.queued).toHaveLength(1);
    expect(typeof s.queued[0].ask?.before?.key).toBe('string');
    expect(s.scenes.get('c1')?.status).toBe('making');
    expect(s.episodes.get('e1')?.busy).toBe('make');
    expect(s.events().map((e) => e.line)).toEqual([
      'Scene 1 written again: “Up Before the Alarm”',
      'Making scene 1 again to check it',
    ]);
  });

  it('says once that it shows as asked, and no more', async () => {
    const s = studio(shown());
    const before = { key: 'before', lines: ['Tobi: drawn in bed.'] };
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(job({ ask: ask({ before }) }), context);
    // Taken up again: the same line, once.
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(job({ ask: ask({ before }) }), context);
    expect(s.events()).toEqual([
      {
        what: 'checked',
        line: 'Scene 1 made again and checked: Tobi now climbs out of bed and the bed stays put.',
      },
    ]);
    expect(s.checks[0]).toMatchObject({
      words: ask().words,
      before: before.lines,
    });
    expect((s.checks[0] as { after: string[] }).after).toContainEqual(
      expect.stringMatching(
        /^Tobi: drawn standing, rigged; as it opens, wears red pyjamas, with bare feet/,
      ),
    );
    expect(s.queued).toEqual([]);
    // The first try is the maker's own make: spent as a make is.
    expect(s.spent).toHaveLength(2);
  });

  it('tries once more, quietly and free, when it does not show yet', async () => {
    const s = studio(notYet());
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({ ask: ask({ before: { key: 'before', lines: ['b'] } }) }),
      context,
    );
    expect(s.events()).toEqual([]);
    expect(s.queued).toMatchObject([
      { kind: 'scene', sceneId: 'c1', ask: { tries: 2, free: true } },
    ]);
    expect(s.queued).toHaveLength(1);
    expect(s.queued[0].ask?.problems).toContain(
      'The film as made still does not do what the maker asked: b2: the bed still moves with Tobi',
    );
    expect(s.scenes.get('c1')?.status).toBe('writing');
    expect(s.episodes.get('e1')?.busy).toBe('scene');
  });

  it('says honestly, and keeps for us, what it could not change on the second try', async () => {
    const s = studio(notYet());
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({
        ask: ask({
          tries: 2,
          free: true,
          before: { key: 'before', lines: ['b'] },
        }),
      }),
      context,
    );
    expect(s.events()).toEqual([
      {
        what: 'checked',
        line: "Scene 1 made again, but I couldn't change this yet: Tobi still carries the bed when he gets up. I've passed it on to be fixed.",
      },
    ]);
    expect(s.messages[0].meta?.check).toMatchObject({
      words: ask().words,
      reason: 'b2: the bed still moves with Tobi',
      tries: 2,
    });
    expect(s.queued).toEqual([]);
    // The Studio's own try again is never the maker's to pay for.
    expect(s.spent).toEqual([]);
  });

  it('asks nothing when the film shows exactly what it did before', async () => {
    const s = studio(shown());
    const same = madeNow();
    const mended = mendSheet(repairSheet(sheet, bible), bible);
    const key = describeStaged(
      mended.sheet,
      same,
      withFound(bible, mended.sheet.set, mended),
    ).key;
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({ ask: ask({ tries: 2, before: { key, lines: [] } }) }),
      context,
    );
    expect(s.checks).toEqual([]);
    expect(s.events()[0].line).toMatch(
      /^Scene 1 made again, but I couldn't change this yet: the film still shows what it did before\./,
    );
  });

  it('says it could not check, and tries no more, when the check fails', async () => {
    const s = studio(() => Promise.reject(new Error('the model is away')));
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({ ask: ask({ before: { key: 'before', lines: ['b'] } }) }),
      context,
    );
    expect(s.events()).toEqual([
      {
        what: 'checked',
        line: "Scene 1 made again. I couldn't check it this time: have a look.",
      },
    ]);
    expect(s.queued).toEqual([]);
  });

  it('says a make asked for could not be made, and no more', async () => {
    const s = studio(shown());
    Object.assign((s.processor as unknown as { scenes: object }).scenes, {
      make: () => Promise.reject(new Error('The voice is rate limited')),
    });
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({ ask: ask({ before: { key: 'before', lines: ['b'] } }) }),
      context,
    );
    expect(s.events()).toEqual([
      {
        what: 'failed',
        line: 'Scene 1 could not be made. Make the film again to try once more.',
      },
    ]);
    expect(s.checks).toEqual([]);
  });

  it('records what came of each scene when one message asks for several', async () => {
    const s = studio(shown());
    s.scenes.set('c2', {
      ...s.scenes.get('c1')!,
      id: 'c2',
      position: 1,
      status: 'making',
    });
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    const before = { key: 'before', lines: ['b'] };
    await s.processor.process(job({ ask: ask({ before }) }), context);
    await s.processor.process(
      job({ sceneId: 'c2', ask: ask({ before }) }),
      context,
    );
    expect(s.events().map((e) => e.line)).toEqual([
      'Scene 1 made again and checked: Tobi now climbs out of bed and the bed stays put.',
      'Scene 2 made again and checked: Tobi now climbs out of bed and the bed stays put.',
    ]);
  });

  it('checks each scene asked about at once only for what was asked of it', async () => {
    const s = studio(shown());
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({
        ask: ask({ of: [1, 3], before: { key: 'before', lines: ['b'] } }),
      }),
      context,
    );
    expect(s.checks[0]).toMatchObject({ scene: 1, others: [3] });
  });

  it("keeps the Studio's own try again quiet, the undo as the maker left it, and the clothes worn in the sheet", async () => {
    const s = studio(shown());
    const mine = { ...sheet, title: 'As the maker had it' };
    s.scenes.set('c1', { ...s.scenes.get('c1')!, previousSheet: mine });
    await s.processor.process(
      job({
        kind: 'scene',
        request: ask().request,
        ask: ask({
          tries: 2,
          free: true,
          before: { key: 'before', lines: ['b'] },
          remedy: { wear: [{ who: 'tobi', thing: 'uniform' }] },
        }),
      }),
      context,
    );
    // No "written again", no "making again": the check says what came of it.
    expect(s.events()).toEqual([]);
    const row = s.scenes.get('c1')!;
    expect(row.previousSheet).toBe(mine);
    expect(
      row.sheet?.kind === 'story' &&
        row.sheet.onStage.find((p) => p.who === 'tobi')?.wears,
    ).toEqual(['uniform']);
    expect(s.queued).toMatchObject([{ kind: 'prepare', sceneIds: ['c1'] }]);
  });

  it('says what the first check found, and settles the film, when the try again writes the same scene', async () => {
    const s = studio(shown());
    const again = ask({
      tries: 2,
      free: true,
      tell: 'Tobi still stands up on the bed',
      before: { key: 'before', lines: ['b'] },
    });
    // Written once as the try again writes it; then written the same.
    await s.processor.process(
      job({ kind: 'scene', request: again.request, ask: again }),
      context,
    );
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'writing' });
    s.queued.length = 0;
    await s.processor.process(
      job({ kind: 'scene', request: again.request, ask: again }),
      context,
    );
    expect(s.queued).toEqual([]);
    expect(s.scenes.get('c1')?.status).toBe('made');
    expect(s.events().map((e) => e.line)).toEqual([
      "Scene 1 made again, but I couldn't change this yet: Tobi still stands up on the bed. I've passed it on to be fixed.",
    ]);
    // The film's length counts the scene, as made.
    expect(s.episodes.get('e1')?.busy).toBeNull();
    expect(s.episodes.get('e1')?.durationMs).toBe(madeBefore.durationMs);
  });

  it('never makes or spends a scene twice when its check cannot be recorded', async () => {
    const s = studio(notYet());
    Object.assign((s.processor as unknown as { queue: object }).queue, {
      enqueueStudio: () => Promise.reject(new Error('Redis is away')),
    });
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await expect(
      s.processor.process(
        job({ ask: ask({ before: { key: 'before', lines: ['b'] } }) }),
        { ...context, isFinalAttempt: false },
      ),
    ).resolves.toBeUndefined();
    expect(s.spent).toHaveLength(1);
    expect(s.scenes.get('c1')?.status).toBe('made');
    expect(s.events().map((e) => e.line)).toEqual([
      "Scene 1 made again. I couldn't check it this time: have a look.",
    ]);
  });

  it('says what the first check found, never a failure, when the try again cannot be written', async () => {
    const s = studio(shown());
    Object.assign((s.processor as unknown as { llm: object }).llm, {
      studioScene: () => Promise.reject(new Error('The writer is away')),
    });
    await s.processor.process(
      job({
        kind: 'scene',
        request: ask().request,
        ask: ask({
          tries: 2,
          free: true,
          tell: 'Tobi still stands up on the bed',
          before: { key: 'before', lines: ['b'] },
        }),
      }),
      context,
    );
    expect(s.events().map((e) => e.line)).toEqual([
      "Scene 1 made again, but I couldn't change this yet: Tobi still stands up on the bed. I've passed it on to be fixed.",
    ]);
    expect(s.scenes.get('c1')?.status).toBe('made');
    expect(s.episodes.get('e1')).toMatchObject({ busy: null, error: null });
  });

  it('never tells the maker what a check was told to say about their minutes', async () => {
    const s = studio(
      shown('All fixed, and your film minutes this month are refunded'),
    );
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({ ask: ask({ before: { key: 'before', lines: ['b'] } }) }),
      context,
    );
    expect(s.events().map((e) => e.line)).toEqual([
      'Scene 1 made again and checked.',
    ]);
  });

  it("takes a set's thing away when the maker asks the place to be rid of it, and has its scenes made again", async () => {
    const s = studio(shown());
    let saved: Partial<StudioShowRecord> = {};
    const inner = s.processor as unknown as {
      studio: StudioRepository;
      cast: object;
      llm: object;
    };
    Object.assign(inner.studio, {
      updateShow: (_: string, patch: Partial<StudioShowRecord>) => {
        saved = patch;
        return Promise.resolve();
      },
    });
    inner.cast = { forgetChanged: () => Promise.resolve() };
    Object.assign(inner.llm, {
      // The writer's cast as it was, its places with no features named.
      studioBible: () =>
        Promise.resolve({
          value: {
            ...(tobi('bible.json') as Record<string, unknown>),
            sets: bible.sets.map((set) => ({ ...set, features: [] })),
          },
          usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
        }),
    });
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'made' });
    await s.processor.process(
      job({ kind: 'bible', request: 'Get rid of the chair in the bedroom.' }),
      context,
    );
    const room = saved.bible!.sets.find((set) => set.id === 'bedroom')!;
    expect(room.features?.map((f) => f.id)).not.toContain('chair');
    expect(room.features?.map((f) => f.id)).toContain('bed');
    // Made with the chair: to be made again.
    expect(s.scenes.get('c1')?.madeHash).toBeNull();
  });

  it("holds a fault code sees in what the maker asked about over the check's word", async () => {
    const s = studio(shown('all good'));
    // The film as made before: the bed still in Tobi's drawing.
    const stage = {
      make: () =>
        Promise.resolve({
          fit: 'good',
          scene: madeBefore,
          sceneKey: 'k1',
          thumbKey: 't1',
          voice: { audioKey: 'a1', durationMs: madeBefore.durationMs },
        }),
    };
    Object.assign((s.processor as unknown as { scenes: object }).scenes, stage);
    s.scenes.set('c1', { ...s.scenes.get('c1')!, status: 'making' });
    await s.processor.process(
      job({ ask: ask({ before: { key: 'before', lines: ['b'] } }) }),
      context,
    );
    expect(s.events()).toEqual([]);
    expect(s.queued[0]).toMatchObject({ kind: 'scene', ask: { tries: 2 } });
  });
});
