import {
  briefOf,
  type StudioOutline,
} from '../../business/domain/studio/studio';
import {
  EMPTY_EDITOR,
  type StudioEditor,
} from '../../business/domain/studio/studio-editor';
import { withAngle } from '../../business/domain/studio/studio-editor-checks';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { AiCallLogInput } from '../../business/repositories/ai-call-log.repository';
import { FakeLlmAdapter } from '../../web/adapters/fake-llm.adapter';
import type { StudioJobData } from '../queues';
import {
  StudioEditorProcessor,
  joinedPlan,
  narratedSheet,
  onTheLines,
} from './studio-editor.processor';
import { StudioProcessor } from './studio.processor';
import type { SceneProcessor } from './scene.processor';
import { rowsOf } from '../../business/domain/studio/studio-editorial';
import { storySheetOf } from '../../business/domain/studio/studio';
import { planOf, researchOf } from '../../business/domain/studio/studio-editor';

/**
 * The editor's desk on the worker, against the fake model: a show planned
 * (angles, research, plan, world) and its first episode written, each job
 * setting the next going; its scenes boarded on the written rows; a later
 * episode planned around what the maker asks.
 */

const at = new Date('2026-10-01T10:00:00Z');

function desk(
  editor: StudioEditor | null = EMPTY_EDITOR,
  /** The worker's settings: illustrated scenes on, unless a test says. */
  settings: Record<string, string> = { STUDIO_ILLUSTRATED: 'on' },
) {
  const shows = new Map<string, StudioShowRecord>([
    [
      's1',
      {
        id: 's1',
        userId: 'u1',
        title: 'New show',
        format: 'explainer',
        brief: briefOf({
          format: 'explainer',
          idea: 'Why we have leap years',
          audience: 'adults',
          tone: 'calm',
        }),
        bible: null,
        editor,
        createdAt: at,
        updatedAt: at,
      },
    ],
  ]);
  const episode = (
    patch: Partial<StudioEpisodeRecord>,
  ): StudioEpisodeRecord => ({
    id: 'e1',
    showId: 's1',
    userId: 'u1',
    number: 1,
    title: 'Episode 1',
    logline: null,
    phase: 'brief',
    busy: 'angles',
    error: null,
    outline: null,
    shareToken: null,
    durationMs: null,
    thumbKey: null,
    createdAt: at,
    updatedAt: at,
    ...patch,
  });
  const episodes = new Map<string, StudioEpisodeRecord>([['e1', episode({})]]);
  const scenes = new Map<string, StudioSceneRecord>();
  const messages: StudioMessageRecord[] = [];
  const repo: Partial<StudioRepository> = {
    findShow: (id) =>
      Promise.resolve(shows.has(id) ? structuredClone(shows.get(id)!) : null),
    updateShow: (id, patch) => {
      shows.set(id, { ...shows.get(id)!, ...structuredClone(patch) });
      return Promise.resolve();
    },
    findEpisode: (id) =>
      Promise.resolve(
        episodes.has(id) ? structuredClone(episodes.get(id)!) : null,
      ),
    listEpisodes: () =>
      Promise.resolve([...episodes.values()].map((e) => structuredClone(e))),
    updateEpisode: (id, patch) => {
      episodes.set(id, { ...episodes.get(id)!, ...structuredClone(patch) });
      return Promise.resolve();
    },
    replaceScenes: (episodeId, count) => {
      for (const [id, row] of scenes)
        if (row.episodeId === episodeId) scenes.delete(id);
      const rows = Array.from({ length: count }, (_, position) => ({
        id: `${episodeId}-c${position}`,
        episodeId,
        position,
        sheet: null,
        sheetHash: null,
        problems: [],
        previousSheet: null,
        status: 'writing' as const,
        step: null,
        error: null,
        sceneKey: null,
        audioKey: null,
        thumbKey: null,
        madeHash: null,
        durationMs: null,
        updatedAt: at,
      }));
      for (const row of rows) scenes.set(row.id, row);
      return Promise.resolve(rows.map((r) => ({ ...r })));
    },
    listScenes: (episodeId) =>
      Promise.resolve(
        [...scenes.values()]
          .filter((s) => s.episodeId === episodeId)
          .sort((a, b) => a.position - b.position),
      ),
    updateScene: (id, patch) => {
      scenes.set(id, { ...scenes.get(id)!, ...structuredClone(patch) });
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
  const fake = new FakeLlmAdapter();
  /** Each step the model is asked, in order. */
  const asked: string[] = [];
  /** A step that fails, as often as it is asked, until taken off. */
  const failing = new Set<string>();
  const llm = {
    editorWrite: (input: Parameters<LlmGatewayPort['editorWrite']>[0]) => {
      asked.push(input.step);
      if (failing.has(input.step))
        return Promise.reject(new Error(`${input.step} fell over`));
      return fake.editorWrite(input);
    },
    editorSearch: (input: Parameters<LlmGatewayPort['editorSearch']>[0]) => {
      asked.push(input.step);
      if (failing.has(input.step))
        return Promise.reject(new Error(`${input.step} fell over`));
      return fake.editorSearch(input);
    },
    editorBoard: (input: Parameters<LlmGatewayPort['editorBoard']>[0]) => {
      asked.push(`board:${input.kind}`);
      return fake.editorBoard(input);
    },
  } as unknown as LlmGatewayPort;
  const queued: StudioJobData[] = [];
  const ledger: AiCallLogInput[] = [];
  const processor = new StudioEditorProcessor({
    studio: repo as StudioRepository,
    llm,
    calls: {
      record: (input) => {
        ledger.push(input);
        return Promise.resolve();
      },
    },
    queue: {
      enqueueStudio: (jobs) => {
        queued.push(...(jobs as StudioJobData[]));
        return Promise.resolve();
      },
    },
    setting: (name) => settings[name],
    logger: { log: () => undefined, warn: () => undefined },
  });
  const show = () => structuredClone(shows.get('s1')!);
  const ep = (id = 'e1') => structuredClone(episodes.get(id)!);
  /** Runs what was queued last, as the worker would, for its episode. */
  const runNext = async () => {
    const job = queued.shift()!;
    await processor.run(job, show(), ep(job.episodeId), `job:${job.kind}`);
    return job.kind;
  };
  const events = () =>
    messages
      .filter((m) => m.meta?.kind === 'event')
      .map((m) => ({ what: m.meta!.event!.what, line: m.content }));
  return {
    processor,
    repo,
    llm,
    shows,
    episodes,
    scenes,
    messages,
    queued,
    ledger,
    asked,
    failing,
    show,
    ep,
    runNext,
    events,
    episode,
  };
}

/** The show planned from angles to world, its first episode written. */
async function planned(settings?: Record<string, string>) {
  const d = desk(EMPTY_EDITOR, settings);
  await d.processor.run({ kind: 'angles' }, d.show(), d.ep());
  // The maker leaves it to the Studio: the best angle.
  d.shows.set('s1', {
    ...d.shows.get('s1')!,
    editor: withAngle(d.show().editor!, null)!,
  });
  d.queued.push({
    kind: 'research',
    showId: 's1',
    episodeId: 'e1',
    userId: 'u1',
  });
  const ran: string[] = [];
  while (d.queued.length) ran.push(await d.runNext());
  return { ...d, ran };
}

describe("the editor's desk on the worker", () => {
  it('offers the angles, best first, and frees the episode for the maker to pick', async () => {
    const d = desk();
    await d.processor.run({ kind: 'angles' }, d.show(), d.ep(), 'job:a');
    const editor = d.show().editor!;
    expect(editor.stage).toBe('angles');
    expect(editor.question).toBeNull();
    expect(editor.angles.map((a) => a.total)).toEqual([18, 15, 15, 13]);
    expect(editor.takeaway).toMatch(/leap years/);
    expect(d.events()).toEqual([
      {
        what: 'angles',
        line: '3 questions this show could answer: pick one, or let me choose',
      },
    ]);
    expect(d.ep()).toMatchObject({ busy: null, error: null });
    // Its searches are in the ledger beside the call, priced.
    expect(d.ledger.map((l) => [l.task, l.model])).toEqual([
      ['explainer_research', 'fake-local'],
      ['explainer_research', 'fake-local:web-search'],
    ]);
    expect(d.ledger[1].costUsd).toBeCloseTo(0.03, 6);
  });

  it('researches, plans, draws up the world and writes episode 1, each job setting the next going', async () => {
    const d = await planned();
    expect(d.ran).toEqual(['research', 'plan', 'world', 'edit']);
    const editor = d.show().editor!;
    expect(editor.stage).toBe('ready');
    // Only pages the search found stand as sources.
    expect(
      editor.research!.claims.every((c) =>
        c.sources.every((s) => s.url.startsWith('https://example.org/')),
      ),
    ).toBe(true);
    expect(editor.research!.searched).toBe(3);
    expect(editor.plan!.episodes.map((e) => [e.number, e.episodeId])).toEqual([
      [1, 'e1'],
      [2, null],
    ]);
    expect(editor.plan!.leftOut).toContain('Part 11 of Why we have leap years');
    // The world is the show's cast and sets: its people and places.
    const bible = d.show().bible!;
    expect(bible.sets.map((s) => s.id)).toEqual([
      'the-council-hall',
      'the-town-square',
    ]);
    expect(bible.characters.map((c) => c.id)).toEqual([
      'clavius',
      'a-council-member',
    ]);
    // Episode 1: written, cut into lesson and illustrated scenes, ready to make.
    const episode = d.ep();
    expect(episode).toMatchObject({ phase: 'outline', busy: null });
    expect(episode.editorial).toMatchObject({ number: 1, stage: 'ready' });
    expect(episode.editorial!.rows.length).toBeGreaterThan(10);
    expect(episode.editorial!.facts!.length).toBeGreaterThan(0);
    expect(episode.editorial!.package?.title).toMatch(/Days That Vanished/);
    const outline = episode.outline as StudioOutline;
    expect(outline.editor).toBe(true);
    expect(outline.scenes.some((s) => s.kind === 'illustrated')).toBe(true);
    expect(outline.scenes.every((s) => s.rows)).toBe(true);
    expect(d.show().title).toMatch(/Days That Vanished/);
    expect(d.events().map((e) => e.what)).toEqual([
      'angles',
      'research',
      'plan',
      'world',
      'editorial',
    ]);
    // The producer says it is ready, with the next step as buttons.
    expect(d.messages.at(-1)).toMatchObject({
      role: 'assistant',
      meta: { choices: ['Make it', 'Read the script'] },
    });
    // The steps the editor model was asked, in order: one revision after the read.
    expect(d.asked).toEqual([
      'angles',
      'research',
      'plan',
      'world',
      'beats',
      'hooks',
      'script',
      'read',
      'script',
      'facts',
      'package',
    ]);
  });

  it('carries on an edit where a failed try stopped, never writing a step twice', async () => {
    const d = desk();
    await d.processor.run({ kind: 'angles' }, d.show(), d.ep());
    d.shows.set('s1', {
      ...d.shows.get('s1')!,
      editor: withAngle(d.show().editor!, 0)!,
    });
    d.queued.push({
      kind: 'research',
      showId: 's1',
      episodeId: 'e1',
      userId: 'u1',
    });
    while (d.queued[0]?.kind !== 'edit') await d.runNext();
    d.failing.add('facts');
    await expect(d.runNext()).rejects.toThrow('facts fell over');
    expect(d.ep().editorial).toMatchObject({ stage: 'read' });
    d.failing.clear();
    await d.processor.run({ kind: 'edit' }, d.show(), d.ep(), 'job:edit');
    expect(d.ep().editorial).toMatchObject({ stage: 'ready' });
    expect(d.asked.filter((s) => s === 'beats')).toHaveLength(1);
    expect(d.asked.filter((s) => s === 'script')).toHaveLength(2);
  });

  it('says a job given up on in the thread, and frees the episode', async () => {
    const d = desk();
    await d.processor.failed(d.show(), d.ep(), 'research', 'job:r:failed');
    expect(d.events()).toEqual([
      {
        what: 'failed',
        line: 'The research could not be done. Try again in a moment.',
      },
    ]);
    expect(d.ep()).toMatchObject({ busy: null });
  });

  it('boards every scene on its written rows: a lesson storyboard, an illustrated scene narrated exactly', async () => {
    const d = await planned();
    const count = await d.processor.boards(d.show(), d.ep());
    const outline = d.ep().outline!;
    expect(count).toBe(outline.scenes.length);
    const rows = d.ep().editorial!.rows;
    for (const scene of [...d.scenes.values()]) {
      const planned = outline.scenes[scene.position];
      const said = rows
        .slice(planned.rows![0], planned.rows![1] + 1)
        .map((r) => r.say);
      expect(scene.status).toBe('ready');
      if (planned.kind === 'illustrated') {
        expect(scene.sheet?.kind).toBe('story');
        const sheet = scene.sheet as Extract<
          typeof scene.sheet,
          { kind: 'story' }
        >;
        // No one speaks; the narration is the rows, word for word.
        expect(sheet.beats.some((b) => b.kind === 'line')).toBe(false);
        expect(
          sheet.beats.filter((b) => b.kind === 'narration').map((b) => b.say),
        ).toEqual(said);
        expect(d.show().bible!.sets.map((s) => s.id)).toContain(sheet.set);
      } else {
        expect(scene.sheet?.kind).toBe('explainer');
        const sheet = scene.sheet as Extract<
          typeof scene.sheet,
          { kind: 'explainer' }
        >;
        expect(sheet.draft.beats.map((b) => b.say)).toEqual(said);
      }
    }
    // Each scene boarded once, and sent back at most once.
    const boards = d.asked.filter((s) => s.startsWith('board:')).length;
    expect(boards).toBeGreaterThanOrEqual(count);
    expect(boards).toBeLessThanOrEqual(count * 2);
  });

  it('offers the next planned episodes once a film is made, and the whole show once the map is used up', async () => {
    const d = await planned();
    await d.processor.afterMade(d.show(), d.ep(), 'film-1');
    await d.processor.afterMade(d.show(), d.ep(), 'film-1');
    expect(
      d.messages.filter((m) => /is ready/.test(m.content)).at(-1),
    ).toMatchObject({
      content: "Episode 1 is ready. There's more to tell:",
      meta: { choices: ['The fix', 'Something else'] },
    });
    // Once a film: the same film said once.
    expect(
      d.messages.filter((m) => m.content.startsWith('Episode 1 is ready.')),
    ).toHaveLength(1);
    const editor = d.show().editor!;
    d.shows.set('s1', {
      ...d.shows.get('s1')!,
      editor: {
        ...editor,
        plan: {
          ...editor.plan!,
          episodes: editor.plan!.episodes.map((e) => ({
            ...e,
            episodeId: e.episodeId ?? 'e2',
          })),
        },
      },
    });
    await d.processor.afterMade(d.show(), d.ep(), 'film-2');
    expect(d.messages.at(-1)).toMatchObject({
      meta: { choices: ['Download the whole show'] },
    });
  });

  it('plans the episodes not made yet around what the maker asks, the made ones kept', async () => {
    const d = await planned();
    d.episodes.set(
      'e2',
      d.episode({ id: 'e2', number: 2, busy: 'research', title: 'Episode 2' }),
    );
    await d.processor.run(
      { kind: 'replan', request: 'how other calendars handle it' },
      d.show(),
      d.ep('e2'),
      'job:replan',
    );
    const plan = d.show().editor!.plan!;
    expect(plan.episodes[0]).toMatchObject({ number: 1, episodeId: 'e1' });
    expect(plan.episodes[1]).toMatchObject({ number: 2, episodeId: 'e2' });
    expect(d.ep('e2').editorial).toMatchObject({ number: 2, stage: 'beats' });
    expect(d.queued).toEqual([
      expect.objectContaining({ kind: 'edit', episodeId: 'e2' }),
    ]);
    expect(d.events().at(-1)?.line).toMatch(
      /^Planned again around “how other calendars handle it”/,
    );
  });
});

describe('what the editor’s boards are held to', () => {
  const lines = rowsOf(
    [
      {
        say: 'In 1582, ten days vanished.',
        visual: 'scene',
        show: 'A square at dawn',
        act: 1,
        hold: true,
      },
      {
        say: 'Nobody lost any sleep.',
        visual: 'scene',
        show: 'People asleep',
        act: 1,
      },
    ],
    new Set(),
  );

  it('keeps a lesson board to the written lines, word for word', () => {
    const draft = onTheLines(
      {
        title: 'X',
        beats: [
          {
            say: 'Something else entirely.',
            pause: 'short',
            delivery: 'key',
            music: 'tense',
          },
        ],
        cast: [],
        steps: [{ beat: 7, phrase: 'gone', show: ['a'] }],
      },
      lines,
    );
    expect(
      draft.beats.map((b) => [b.say, b.pause, b.delivery, b.music]),
    ).toEqual([
      ['In 1582, ten days vanished.', 'long', 'explain', 'tense'],
      ['Nobody lost any sleep.', 'short', 'explain', null],
    ]);
    expect(draft.steps[0]).toMatchObject({ beat: 1, phrase: '' });
    // Paced as the playbook paces a film, a held row held still.
    expect(draft.pace).toBe('infographic');
    expect(draft.beats.map((b) => b.hold ?? null)).toEqual([true, null]);
  });

  it('keeps an illustrated scene narrated by its lines, its acting where the board put it, no one speaking', () => {
    const bible = {
      characters: [{ id: 'clavius' }, { id: 'pope' }],
      sets: [{ id: 'square' }],
    } as never;
    const sheet = narratedSheet(
      storySheetOf({
        set: 'nowhere',
        onStage: [
          { who: 'clavius', spot: 'centre' },
          { who: 'stranger', spot: 'left' },
          { who: 'pope', spot: 'centre' },
        ],
        beats: [
          {
            kind: 'action',
            who: 'clavius',
            do: 'look',
            say: 'Clavius looks up',
          },
          { kind: 'narration', say: 'A different first line.' },
          { kind: 'action', who: 'clavius', do: 'point', say: 'He points' },
          { kind: 'line', who: 'clavius', say: 'I speak!' },
          { kind: 'narration', say: 'A different second line.' },
          { kind: 'pause', seconds: 1 },
        ],
        camera: [{ beat: 2, shot: 'close', on: 'clavius' }],
      }),
      lines,
      'square',
      bible,
    );
    expect(sheet.set).toBe('square');
    expect(sheet.onStage.map((p) => p.who)).toEqual(['clavius']);
    expect(sheet.beats.map((b) => [b.kind, b.say])).toEqual([
      ['action', 'Clavius looks up'],
      ['narration', 'In 1582, ten days vanished.'],
      ['action', 'He points'],
      ['narration', 'Nobody lost any sleep.'],
      ['pause', ''],
    ]);
    // The shot on "He points" moved with it.
    expect(sheet.camera).toEqual([
      { beat: 2, shot: 'close', on: 'clavius', with: null },
    ]);
  });

  it('spreads acting over the lines where the board wrote no narration', () => {
    const sheet = narratedSheet(
      storySheetOf({
        set: 'square',
        beats: [
          { kind: 'action', who: 'a', do: 'look', say: 'one' },
          { kind: 'action', who: 'a', do: 'nod', say: 'two' },
        ],
      }),
      lines,
      'square',
      { characters: [], sets: [{ id: 'square' }] } as never,
    );
    expect(sheet.beats.map((b) => b.kind)).toEqual([
      'narration',
      'action',
      'narration',
      'action',
    ]);
  });

  it('joins a new plan after the episodes made, numbered on from them', () => {
    const research = researchOf({ claims: [{ id: 'c1', text: 'x' }] });
    const old = planOf(
      {
        spine: ['a'],
        items: [
          { item: 'kept', moves: true, visual: true, episode: 1, seconds: 30 },
          {
            item: 'waiting',
            moves: true,
            visual: true,
            episode: 2,
            seconds: 30,
          },
        ],
        episodes: [
          { title: 'One', question: 'Q1', covers: [0], episodeId: 'e1' },
          { title: 'Two', question: 'Q2', covers: [1] },
        ],
        leftOut: ['old cut'],
      },
      research,
    );
    const fresh = planOf(
      {
        spine: ['b'],
        items: [
          { item: 'new', moves: true, visual: true, episode: 1, seconds: 30 },
        ],
        episodes: [
          {
            title: 'New two',
            question: 'Q2b',
            covers: [0],
            plants: [{ id: 'p9', text: 't', paidIn: 1 }],
          },
        ],
        leftOut: ['new cut'],
      },
      research,
    );
    const joined = joinedPlan(old, fresh);
    expect(joined.items.map((i) => [i.item, i.episode])).toEqual([
      ['kept', 1],
      ['new', 2],
    ]);
    expect(
      joined.episodes.map((e) => [e.number, e.title, e.covers, e.episodeId]),
    ).toEqual([
      [1, 'One', [0], 'e1'],
      [2, 'New two', [1], null],
    ]);
    expect(joined.episodes[1].plants[0].paidIn).toBe(2);
    expect(joined.spine).toEqual(['b']);
    expect(joined.leftOut).toEqual(['old cut', 'new cut']);
  });
});

describe('the Studio processor hands the editor its work', () => {
  const studioProcessor = (d: Awaited<ReturnType<typeof planned>>) =>
    new StudioProcessor(
      d.repo as StudioRepository,
      d.llm,
      { record: () => Promise.resolve() },
      { delete: () => Promise.resolve() } as never,
      {} as SceneProcessor,
      {
        forUser: () =>
          Promise.resolve({ assertStudioAvailable: () => undefined }),
      } as never,
      {} as never,
      {
        enqueueStudio: (jobs: StudioJobData[]) => {
          d.queued.push(...jobs);
          return Promise.resolve();
        },
      } as never,
    );
  const last = { attemptsMade: 1, isFinalAttempt: true, jobId: 'j1' };

  it('boards an editor\'s script and, made with "Make it", makes the film after', async () => {
    const d = await planned();
    d.episodes.set('e1', { ...d.ep(), phase: 'script', busy: 'script' });
    await studioProcessor(d).process(
      {
        kind: 'script',
        make: true,
        showId: 's1',
        episodeId: 'e1',
        userId: 'u1',
      },
      last,
    );
    const rows = [...d.scenes.values()];
    expect(rows.length).toBe(d.ep().outline!.scenes.length);
    expect(rows.every((r) => r.status === 'making')).toBe(true);
    expect(d.ep().busy).toBe('make');
    expect(d.queued).toEqual([
      expect.objectContaining({
        kind: 'prepare',
        sceneIds: rows.map((r) => r.id),
      }),
    ]);
    expect(
      d
        .events()
        .map((e) => e.what)
        .slice(-2),
    ).toEqual(['scenes', 'make']);
  });

  it("says an editor's job given up on, and frees the episode", async () => {
    const d = await planned();
    d.failing.add('beats');
    d.episodes.set('e1', { ...d.ep(), editorial: null, busy: 'edit' });
    await studioProcessor(d).process(
      { kind: 'edit', showId: 's1', episodeId: 'e1', userId: 'u1' },
      last,
    );
    expect(d.events().at(-1)).toEqual({
      what: 'failed',
      line: 'The script could not be written. Try again in a moment.',
    });
    expect(d.ep()).toMatchObject({ busy: null });
  });
});

describe('a board that cannot be had', () => {
  it('is a plain one, never a hole in the film', async () => {
    const d = await planned();
    (d.llm as unknown as { editorBoard: () => Promise<never> }).editorBoard =
      () => Promise.reject(new Error('the board fell over'));
    const count = await d.processor.boards(d.show(), d.ep());
    const outline = d.ep().outline!;
    const rows = d.ep().editorial!.rows;
    expect(count).toBe(outline.scenes.length);
    for (const scene of d.scenes.values()) {
      const planned = outline.scenes[scene.position];
      const said = rows
        .slice(planned.rows![0], planned.rows![1] + 1)
        .map((r) => r.say);
      expect(scene.status).toBe('ready');
      if (scene.sheet?.kind === 'explainer') {
        expect(scene.sheet.draft.beats.map((b) => b.say)).toEqual(said);
        expect(scene.sheet.draft.cast.every((t) => t.kind === 'words')).toBe(
          true,
        );
      } else
        expect(
          scene.sheet?.beats
            .filter((b) => b.kind === 'narration')
            .map((b) => b.say),
        ).toEqual(said);
    }
  });
});

describe('with illustrated scenes switched off (STUDIO_ILLUSTRATED)', () => {
  it('cuts no illustrated scene, and boards each moment of people as a drawing of it, never a word card', async () => {
    const d = await planned({});
    const outline = d.ep().outline!;
    expect(outline.scenes.some((s) => s.kind === 'illustrated')).toBe(false);
    const rows = d.ep().editorial!.rows;
    // The script still says where its moments of people are.
    expect(rows.some((r) => r.visual === 'scene')).toBe(true);
    await d.processor.boards(d.show(), d.ep());
    for (const scene of d.scenes.values()) {
      expect(scene.sheet?.kind).toBe('explainer');
      const planned = outline.scenes[scene.position];
      const sheet = scene.sheet as Extract<
        typeof scene.sheet,
        { kind: 'explainer' }
      >;
      rows.slice(planned.rows![0], planned.rows![1] + 1).forEach((row, k) => {
        if (row.visual !== 'scene') return;
        const shown = sheet.draft.steps
          .filter((st) => st.beat === k)
          .flatMap((st) => st.show ?? []);
        expect(
          shown.some(
            (id) =>
              sheet.draft.cast.find((t) => t.id === id)?.kind === 'drawing',
          ),
        ).toBe(true);
      });
    }
  });
});
