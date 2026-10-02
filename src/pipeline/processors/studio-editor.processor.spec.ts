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
  drawnMoments,
  joinedPlan,
  narratedSheet,
  onTheLines,
  plainLesson,
} from './studio-editor.processor';
import { StudioProcessor } from './studio.processor';
import type { SceneProcessor } from './scene.processor';
import {
  rowsOf,
  type EditorialRow,
} from '../../business/domain/studio/studio-editorial';
import { checkExplainer } from '../../business/domain/studio/studio-check';
import { storySheetOf } from '../../business/domain/studio/studio';
import {
  planOf,
  researchOf,
  worldOf,
} from '../../business/domain/studio/studio-editor';

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
    // The world is the show's cast and sets: its people and places, the
    // research's own; an everyday place and an ordinary person made up
    // for the story (no claim names them) are left out.
    const bible = d.show().bible!;
    expect(bible.sets.map((s) => s.id)).toEqual(['the-council-hall', 'rome']);
    expect(bible.characters.map((c) => c.id)).toEqual(['clavius']);
    expect(editor.world!.places.map((p) => [p.name, p.claims])).toEqual([
      ['The council hall', ['c3']],
      ['Rome', ['c1']],
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
    // The steps the editor model was asked, in order: one revision after
    // the read, then (the fake's script being well short of its beat
    // sheet's words, with the research holding more) one filling out.
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
    // The draft, the revision and the one filling out: none written twice.
    expect(d.asked.filter((s) => s === 'script')).toHaveLength(3);
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

describe('research deep enough to show', () => {
  it('searches a thin log again once, with what it lacks, and adds what it finds', async () => {
    const d = desk({ ...EMPTY_EDITOR, question: 'Why did it happen?' });
    const fake = new FakeLlmAdapter();
    const told: string[][] = [];
    // The first search comes back thin: years alone, no people, no scenes, no numbers.
    (d.llm as { editorSearch: unknown }).editorSearch = async (input: {
      step: 'research';
      parts: string[];
    }) => {
      d.asked.push(input.step);
      told.push(input.parts);
      const answer = await fake.editorSearch(input);
      if (told.length > 1) return answer;
      const found = answer.value.found;
      return {
        ...answer,
        value: {
          found,
          value: {
            claims: [
              {
                id: 'c1',
                text: 'It began in 1582.',
                kind: 'date',
                confidence: 'high',
                sources: [found[0].url, found[1].url],
              },
            ],
            timeline: [{ date: '1582', event: 'The change', claims: ['c1'] }],
          },
        },
      };
    };
    await d.processor.run({ kind: 'research' }, d.show(), d.ep());
    expect(d.asked).toEqual(['research', 'research']);
    const again = told[1].join('\n');
    expect(again).toMatch(/It is thin\. Search for what it lacks/);
    expect(again).toMatch(/The timeline has 1 dated event: find at least 5/);
    expect(again).toMatch(/No numbers/);
    expect(again).toMatch(/number new claims from c2/);
    // What the deeper search found is added to the log, its claims after the first.
    const research = d.show().editor!.research!;
    expect(research.claims[0].text).toBe('It began in 1582.');
    expect(research.claims.length).toBeGreaterThan(1);
    expect(research.people?.map((p) => p.name)).toEqual(['Clavius']);
    expect(research.moments).toHaveLength(3);
    expect(d.queued.map((j) => j.kind)).toEqual(['plan']);
  });
});

describe('an episode of three to five minutes', () => {
  it('sends a plan whose first episode is short back once, then fills it from the research', async () => {
    // A deep research: twenty-four sure claims of about fifteen words.
    const research = researchOf({
      claims: Array.from({ length: 24 }, (_, k) => ({
        id: `c${k + 1}`,
        text: `Fact ${k + 1} of the calendar story is a sentence of about fifteen words in all, sourced.`,
        kind: 'claim',
        confidence: 'high',
        sources: [`https://a.example.com/${k + 1}`],
      })),
    });
    const d = desk({
      ...EMPTY_EDITOR,
      stage: 'research',
      question: 'Why do we have leap years?',
      research,
    });
    // The writer plans one episode of two items, twice: under a minute and a half.
    const short = {
      spine: ['1', '2', '3', '4', '5', '6'],
      chain: [{ beat: 'The year is not whole', link: null }],
      items: [1, 2].map((n) => ({
        item: `Item ${n}`,
        claims: [`c${n}`],
        moves: true,
        visual: true,
        decision: 'keep',
        episode: 1,
        seconds: 30,
      })),
      episodes: [{ title: 'The gap', question: 'Why?', covers: [0, 1] }],
    };
    const told: string[][] = [];
    (d.llm as { editorWrite: unknown }).editorWrite = (input: {
      step: string;
      problems?: string[];
    }) => {
      d.asked.push(input.step);
      told.push(input.problems ?? []);
      return Promise.resolve({
        value: short,
        usage: { model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
      });
    };
    await d.processor.run({ kind: 'plan' }, d.show(), d.ep());
    expect(d.asked).toEqual(['plan', 'plan']);
    expect(told[1].join('\n')).toMatch(
      /Episode 1 runs about \d{2} seconds of material; an episode runs three to five minutes, about four/,
    );
    // Still short as written, so code fills it from the research's unused claims.
    const plan = d.show().editor!.plan!;
    expect(plan.episodes).toHaveLength(1);
    expect(plan.episodes[0].minutes).toBeGreaterThanOrEqual(3);
    expect(plan.episodes[0].short).toBeUndefined();
    expect(plan.items.slice(2).map((i) => i.claims[0])).toContain('c3');
    expect(d.queued.map((j) => j.kind)).toEqual(['world']);
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
  it('is a plain one, never a hole in the film and never a keyword card', async () => {
    const d = await planned();
    (d.llm as unknown as { editorBoard: () => Promise<never> }).editorBoard =
      () => Promise.reject(new Error('the board fell over'));
    const count = await d.processor.boards(d.show(), d.ep());
    const outline = d.ep().outline!;
    const rows = d.ep().editorial!.rows;
    expect(count).toBe(outline.scenes.length);
    const shown: string[] = [];
    for (const scene of d.scenes.values()) {
      const planned = outline.scenes[scene.position];
      const said = rows
        .slice(planned.rows![0], planned.rows![1] + 1)
        .map((r) => r.say);
      expect(scene.status).toBe('ready');
      if (scene.sheet?.kind === 'explainer') {
        expect(scene.sheet.draft.beats.map((b) => b.say)).toEqual(said);
        // What the research can show of its lines (a counter, the show's
        // map, exact words), or its title as it opens: never a card.
        for (const thing of scene.sheet.draft.cast) {
          expect(thing.id).not.toMatch(/^card-/);
          expect(
            ['counter', 'map', 'quote'].includes(thing.kind) ||
              (thing.kind === 'words' && thing.style === 'title'),
          ).toBe(true);
          shown.push(thing.kind);
        }
        // And the stage shows it from the first line: never an empty stage.
        const { script } = checkExplainer(scene.sheet, {
          teach: planned.teach,
          stage: null,
          maths: false,
          planned: null,
        });
        expect(script.steps[0]?.stage).toBeTruthy();
        expect(script.steps[0]?.at.beat).toBe(0);
      } else
        expect(
          scene.sheet?.beats
            .filter((b) => b.kind === 'narration')
            .map((b) => b.say),
        ).toEqual(said);
    }
    // The line with a number of the research counts it up.
    expect(shown).toContain('counter');
    const counter = [...d.scenes.values()]
      .flatMap((s) => (s.sheet?.kind === 'explainer' ? s.sheet.draft.cast : []))
      .find((t) => t.kind === 'counter');
    expect(counter?.counter).toMatchObject({
      value: '4',
      unit: 'million',
      label: 'People affected',
    });
    expect(counter?.source).toBeTruthy();
  });
});

describe('with illustrated scenes switched off (STUDIO_ILLUSTRATED)', () => {
  it("cuts no illustrated scene, and never draws a moment of people: one at a real place is the show's map with it pinned", async () => {
    const d = await planned({});
    const outline = d.ep().outline!;
    expect(outline.scenes.some((s) => s.kind === 'illustrated')).toBe(false);
    // The show on its map, and one of its moments in a real place on it.
    const show = d.show();
    d.shows.set('s1', {
      ...show,
      editor: {
        ...show.editor!,
        world: {
          ...show.editor!.world!,
          base: { kind: 'map', region: 'Italy' },
        },
      },
    });
    const ep = d.ep();
    const rows = ep.editorial!.rows.map((r) =>
      r.say === 'A council met to settle it.'
        ? { ...r, show: 'The council hall in Rome: members argue' }
        : r,
    );
    d.episodes.set('e1', { ...ep, editorial: { ...ep.editorial!, rows } });
    // The script still says where its moments of people are.
    expect(rows.some((r) => r.visual === 'scene')).toBe(true);
    await d.processor.boards(d.show(), d.ep());
    let pinned = 0;
    for (const scene of d.scenes.values()) {
      expect(scene.sheet?.kind).toBe('explainer');
      const planned = outline.scenes[scene.position];
      const sheet = scene.sheet as Extract<
        typeof scene.sheet,
        { kind: 'explainer' }
      >;
      // No one drawn, no place drawn: no drawing, no person, no card.
      for (const thing of sheet.draft.cast) {
        expect(['drawing', 'person', 'place']).not.toContain(thing.kind);
        expect(thing.style).not.toBe('card');
      }
      rows.slice(planned.rows![0], planned.rows![1] + 1).forEach((row, k) => {
        const moment = sheet.draft.cast.find((t) => t.id === `moment-${k + 1}`);
        if (row.visual === 'scene' && /Rome/.test(row.show)) {
          pinned += 1;
          expect(moment?.kind).toBe('map');
          expect(moment?.map?.pins).toEqual([{ place: 'Rome', label: null }]);
          expect(moment?.map?.base).toMatchObject({ region: 'Italy' });
        } else expect(moment).toBeUndefined();
      });
    }
    expect(pinned).toBe(1);
  });
});

/** An editor's row as the script writes it. */
const rowOf = (
  say: string,
  visual: EditorialRow['visual'],
  show = '',
  claims: string[] = [],
): EditorialRow => ({
  say,
  visual,
  show,
  claims,
  act: 1,
  plant: null,
  payoff: null,
  delivery: 'explain',
  music: null,
  hold: false,
});

/** The research's claims and numbers, enough for a plain board. */
const RESEARCH = researchOf({
  claims: [
    {
      id: 'c1',
      kind: 'number',
      text: 'About 45 million people lived there in 1960.',
      sources: [{ url: 'https://example.org/un', title: 'UN, 1960' }],
    },
    {
      id: 'c2',
      kind: 'quote',
      text: 'He said we must "build a nation of equals".',
      sources: [{ url: 'https://example.org/speech', title: 'The speech' }],
    },
    {
      id: 'c3',
      kind: 'number',
      text: 'The vote was won by 174 seats.',
      sources: [{ url: 'https://example.org/vote', title: 'The vote' }],
    },
  ],
  numbers: [
    {
      label: 'People in 1960',
      value: '45 million',
      claims: ['c1'],
      checked: true,
    },
  ],
});

describe('a lesson boarded by code alone (plainLesson)', () => {
  const world = worldOf({ map: { region: 'Nigeria' } });
  const editor = { world, research: RESEARCH };
  const lines = [
    rowOf('By 1960, 45 million people lived here.', 'how-many', '', ['c1']),
    rowOf('In Kano, the north gathered.', 'place', 'A pin on Kano'),
    rowOf('He wanted to "build a nation of equals".', 'exact-words', '', [
      'c2',
    ]),
    rowOf('Nobody knew what would come next.', 'why', 'Two arrows'),
    rowOf('The vote was won by 174 seats.', 'how-many', '', ['c3']),
  ];
  const sheet = plainLesson({ title: 'Independence' }, lines, editor);
  const cast = sheet.draft.cast;

  it('shows each line what the research can show of it, never a keyword card', () => {
    expect(cast.map((t) => [t.id, t.kind])).toEqual([
      ['number-1', 'counter'],
      ['map-2', 'map'],
      ['quote-3', 'quote'],
      ['number-5', 'counter'],
    ]);
    expect(cast[0].counter).toMatchObject({
      value: '45',
      unit: 'million',
      label: 'People in 1960',
    });
    expect(cast[0].source).toBe('UN, 1960');
    // A real place on the show's map, pinned, on the show's map.
    expect(cast[1].map).toMatchObject({
      region: 'Nigeria',
      pins: [{ place: 'Kano', label: null }],
      base: { region: 'Nigeria' },
    });
    // Its exact words as the line says them; who said them the voice says.
    expect(cast[2]).toMatchObject({ quote: 'build a nation of equals' });
    // A number claim's own figure, said in the line.
    expect(cast[3].counter).toMatchObject({ value: '174', unit: 'seats' });
  });

  it('holds the picture before on a line it can show nothing of, and stages each on its own line', () => {
    expect(sheet.draft.steps.map((s) => [s.beat, s.layout, s.show])).toEqual([
      [0, 'one', ['number-1']],
      [1, 'one', ['map-2']],
      [2, 'one', ['quote-3']],
      [4, 'one', ['number-5']],
    ]);
    const { script, problems } = checkExplainer(sheet, {
      teach: lines.map((l) => l.say).join(' '),
      stage: null,
      maths: false,
      planned: null,
    });
    expect(script.steps.map((s) => [s.at.beat, s.stage?.show])).toEqual([
      [0, ['number-1']],
      [1, ['map-2']],
      [2, ['quote-3']],
      [4, ['number-5']],
    ]);
    expect(problems.filter((p) => p.level === 'error')).toEqual([]);
  });

  it("opens on the show's map, or its title, when its first line shows nothing", () => {
    const quiet = [rowOf('Nobody knew what would come next.', 'why')];
    const mapped = plainLesson({ title: 'Independence' }, quiet, editor);
    expect(mapped.draft.cast).toMatchObject([
      { id: 'show-map', kind: 'map', map: { region: 'Nigeria' } },
    ]);
    const titled = plainLesson({ title: 'Independence' }, quiet, null);
    expect(titled.draft.cast).toMatchObject([
      { id: 'title', kind: 'words', style: 'title', name: 'Independence' },
    ]);
    expect(titled.draft.steps).toEqual([
      {
        beat: 0,
        phrase: 'Nobody knew what',
        layout: 'one',
        show: ['title'],
        arrows: null,
        effects: null,
      },
    ]);
  });

  it('never counts a number it cannot stand behind: unsaid and unchecked, or a year', () => {
    const unsaid = plainLesson(
      { title: 'x' },
      [rowOf('The vote was close.', 'how-many', '', ['c3'])],
      { world: null, research: RESEARCH },
    );
    expect(unsaid.draft.cast.map((t) => t.kind)).toEqual(['words']);
    const year = plainLesson(
      { title: 'x' },
      [rowOf('It began in 1960.', 'how-many', '', ['c4'])],
      {
        world: null,
        research: researchOf({
          claims: [{ id: 'c4', kind: 'number', text: 'It began in 1960.' }],
        }),
      },
    );
    expect(year.draft.cast.map((t) => t.kind)).toEqual(['words']);
  });
});

describe("a lesson board's moments (drawnMoments)", () => {
  const draft = onTheLines(
    {
      title: 'x',
      cast: [
        {
          id: 'idea',
          kind: 'words',
          name: 'The idea',
          style: 'keyword',
        },
      ],
      steps: [{ beat: 0, phrase: '', layout: 'one', show: ['idea'] }],
    },
    [
      rowOf('He fell ill in Kano.', 'scene', 'In Kano, he falls ill'),
      rowOf('A crowd gathered.', 'scene', 'A crowd in a square'),
    ],
  );

  it("pins a moment at a real place on the show's map, and draws no one and no place", () => {
    const lines = [
      rowOf('He fell ill in Kano.', 'scene', 'In Kano, he falls ill'),
      rowOf('A crowd gathered.', 'scene', 'A crowd in a square'),
    ];
    const moments = drawnMoments(
      draft,
      lines,
      worldOf({ map: { region: 'Nigeria' } }),
    );
    expect(moments.cast.map((t) => [t.id, t.kind])).toEqual([
      ['idea', 'words'],
      ['moment-1', 'map'],
    ]);
    expect(moments.cast[1].map?.pins).toEqual([{ place: 'Kano', label: null }]);
    expect(moments.steps.map((s) => [s.beat, s.show])).toEqual([
      [0, ['idea']],
      [0, ['moment-1']],
    ]);
    // With no map, a moment brings on nothing: the picture before holds.
    expect(drawnMoments(draft, lines, null)).toEqual(draft);
  });
});
