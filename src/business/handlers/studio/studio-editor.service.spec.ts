import { briefOf, outlineOf } from '../../domain/studio/studio';
import {
  EMPTY_EDITOR,
  anglesOf,
  planOf,
  researchOf,
  worldOf,
  type StudioEditor,
} from '../../domain/studio/studio-editor';
import { editorialOf } from '../../domain/studio/studio-editorial';
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
import { StudioCastService } from './studio-cast.service';
import { StudioService } from './studio.service';

/**
 * The editor's desk as the maker meets it: a new explainer is planned by
 * the editor (never asked how long it runs), the question picked on its
 * card or in words, "Make it" makes a written script in one go, and a new
 * episode is the plan's own when named, else planned around what was asked.
 */

const at = new Date('2026-10-01T10:00:00Z');
const research = researchOf({
  claims: [
    {
      id: 'c1',
      text: 'Ten days went in 1582.',
      sources: ['https://a.example.com'],
    },
  ],
});
const planned: StudioEditor = {
  ...EMPTY_EDITOR,
  stage: 'ready',
  question: 'Where did ten days go?',
  angles: anglesOf([{ question: 'Where did ten days go?' }]),
  research,
  plan: planOf(
    {
      spine: ['1', '2', '3', '4', '5', '6'],
      episodes: [
        {
          title: 'The lost days',
          question: 'Where did ten days go?',
          episodeId: 'e1',
        },
        {
          title: 'The rule of 400',
          question: 'Why skip a leap year every century?',
        },
      ],
    },
    research,
  ),
  world: worldOf({
    era: 'today',
    places: [{ name: 'A square', kind: 'square' }],
  }),
};
const editorial = editorialOf({
  number: 1,
  question: 'Where did ten days go?',
  stage: 'ready',
  beats: { acts: [{ title: 'One', seconds: 120, words: 300 }] },
  rows: [
    {
      say: 'In 1582, ten days went.',
      visual: 'when',
      show: 'A calendar',
      claims: ['c1'],
      act: 1,
    },
  ],
  package: {
    title: 'The Ten Days That Never Happened',
    thumbnail: { words: 'TEN DAYS GONE', row: 0 },
    description: 'Why.',
    pinned: 'Why?',
    hashtags: ['calendar'],
  },
})!;
const outline = outlineOf({
  title: 'The lost days',
  logline: 'Where did ten days go?',
  editor: true,
  scenes: [
    { title: 'One', summary: 'x', seconds: 20, teach: 'x', rows: [0, 0] },
  ],
});

function desk(editor: StudioEditor | null = EMPTY_EDITOR) {
  const shows = new Map<string, StudioShowRecord>();
  const episodes = new Map<string, StudioEpisodeRecord>();
  const scenes = new Map<string, StudioSceneRecord>();
  const messages: StudioMessageRecord[] = [];
  let ids = 1;
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
    busy: null,
    error: null,
    outline: null,
    shareToken: null,
    durationMs: null,
    thumbKey: null,
    createdAt: at,
    updatedAt: at,
    ...patch,
  });
  shows.set('s1', {
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
  });
  episodes.set('e1', episode({}));
  const repo: Partial<StudioRepository> = {
    findShow: (id) => Promise.resolve(shows.get(id) ?? null),
    updateShow: (id, patch) => {
      shows.set(id, { ...shows.get(id)!, ...patch });
      return Promise.resolve();
    },
    findEpisode: (id) => Promise.resolve(episodes.get(id) ?? null),
    listEpisodes: () =>
      Promise.resolve(
        [...episodes.values()].sort((a, b) => a.number - b.number),
      ),
    createEpisode: (input) => {
      const made = episode({ ...input, id: `e${++ids}` });
      episodes.set(made.id, made);
      return Promise.resolve(made);
    },
    updateEpisode: (id, patch) => {
      episodes.set(id, { ...episodes.get(id)!, ...patch });
      return Promise.resolve();
    },
    claimEpisode: (id, busy) => {
      const one = episodes.get(id)!;
      if (one.busy) return Promise.resolve(false);
      episodes.set(id, { ...one, busy });
      return Promise.resolve(true);
    },
    listScenes: (episodeId) =>
      Promise.resolve(
        [...scenes.values()].filter((s) => s.episodeId === episodeId),
      ),
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
    listMessages: () => Promise.resolve([...messages]),
    countUserMessagesSince: () => Promise.resolve(0),
  };
  const jobs: StudioJob[] = [];
  const queue = {
    enqueueStudio: (more: StudioJob[]) => {
      jobs.push(...more);
      return Promise.resolve();
    },
  } as unknown as JobQueuePort;
  /** What the producer answers, over its usual "Lovely.". */
  const answer: Record<string, unknown> = {};
  const heard: string[] = [];
  const llm = {
    moderate: () => Promise.resolve({ flagged: false, categories: [] }),
    studioTurn: (input: { state: string }) => {
      heard.push(input.state);
      return Promise.resolve({
        value: {
          reply: 'Lovely.',
          choices: [],
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
  const storage = {
    get: () => Promise.reject(new Error('none')),
    put: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  };
  const service = new StudioService(
    repo as StudioRepository,
    llm,
    queue,
    storage as never,
    { now: () => at },
    { record: () => Promise.resolve() },
    entitlements,
    new StudioCastService(storage as never),
    {} as SceneVoiceService,
  );
  const events = () =>
    messages
      .filter((m) => m.meta?.kind === 'event')
      .map((m) => m.meta!.event!.line);
  return {
    service,
    shows,
    episodes,
    scenes,
    messages,
    jobs,
    answer,
    heard,
    events,
    episode,
  };
}

const turn = (d: ReturnType<typeof desk>, message: string, episodeId = 'e1') =>
  d.service.turn('u1', 's1', { message, episodeId }, () => undefined);

describe("the editor's desk in the Studio", () => {
  it('never asks how long an explainer of its runs, and begins with the questions it could answer', async () => {
    const d = desk();
    const show = await d.service.show('u1', 's1');
    expect(show.briefMissing).toEqual([]);
    // Not begun yet: no editor shown.
    expect(show.editor).toBeNull();
    d.answer.action = 'outline';
    await turn(d, 'Yes, go ahead');
    expect(d.jobs).toEqual([
      expect.objectContaining({ kind: 'angles', episodeId: 'e1' }),
    ]);
    expect(d.episodes.get('e1')!.busy).toBe('angles');
    // The producer is told how the show is planned.
    expect(d.heard[0]).toMatch(/planned as an editor plans a video/);
  });

  it('leaves a show made before the editor, or a story, on the old path', async () => {
    const d = desk(null);
    d.answer.action = 'outline';
    const show = await d.service.show('u1', 's1');
    expect(show.briefMissing).toEqual(['minutes']);
    expect(show.editor).toBeUndefined();
  });

  const offered = (): StudioEditor => ({
    ...EMPTY_EDITOR,
    stage: 'angles',
    angles: anglesOf([
      {
        question: 'Where did ten days go?',
        scores: { gap: 5, tension: 5, visual: 5, payoff: 5 },
      },
      {
        question: 'Why skip a leap year?',
        scores: { gap: 4, tension: 4, visual: 4, payoff: 4 },
      },
      {
        question: 'Who counted the year?',
        scores: { gap: 3, tension: 3, visual: 3, payoff: 3 },
      },
    ]),
  });

  it('takes the pick on its card and starts the research', async () => {
    const d = desk(offered());
    const show = await d.service.pickAngle('u1', 's1', { pick: 1 });
    expect(show.editor?.question).toBe('Why skip a leap year?');
    expect(d.jobs).toEqual([
      expect.objectContaining({ kind: 'research', episodeId: 'e1' }),
    ]);
    expect(d.events()).toEqual(['Going with: “Why skip a leap year?”']);
    // Picked once: a second pick is refused, and sets nothing going.
    await expect(
      d.service.pickAngle('u1', 's1', { pick: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(d.jobs).toHaveLength(1);
  });

  it('hears the pick in words, or "you choose", whatever the producer made of it', async () => {
    const d = desk(offered());
    d.answer.action = 'outline';
    const { message } = await turn(d, 'you choose');
    expect(d.shows.get('s1')!.editor!.question).toBe('Where did ten days go?');
    expect(message.content).toMatch(/^Going with “Where did ten days go\?”/);
    expect(d.jobs.map((j) => j.kind)).toEqual(['research']);
  });

  it('makes a written script in one go when the maker says "Make it", or presses approve', async () => {
    for (const how of ['words', 'approve'] as const) {
      const d = desk(planned);
      d.episodes.set('e1', {
        ...d.episodes.get('e1')!,
        phase: 'outline',
        outline,
        editorial,
      });
      if (how === 'words') await turn(d, 'Make it');
      else await d.service.approve('u1', 'e1');
      expect(d.episodes.get('e1')).toMatchObject({
        phase: 'script',
        busy: 'script',
      });
      expect(d.jobs).toEqual([
        expect.objectContaining({ kind: 'script', make: true }),
      ]);
      expect(d.events()).toContain(
        'Script approved: boarding the scenes, then making the film',
      );
    }
  });

  it("writes the plan's own episode when it is named, and plans around anything else", async () => {
    const d = desk(planned);
    d.episodes.set('e1', {
      ...d.episodes.get('e1')!,
      phase: 'made',
      editorial,
    });
    const named = await d.service.addEpisode(
      'u1',
      's1',
      'Why skip a leap year every century?',
    );
    expect(named.title).toBe('The rule of 400');
    expect(d.jobs.at(-1)).toMatchObject({ kind: 'edit', episodeId: named.id });
    expect(d.episodes.get(named.id)!.editorial).toMatchObject({ number: 2 });
    expect(d.shows.get('s1')!.editor!.plan!.episodes[1].episodeId).toBe(
      named.id,
    );
    const other = await d.service.addEpisode(
      'u1',
      's1',
      'how moon calendars cope',
    );
    expect(d.jobs.at(-1)).toMatchObject({
      kind: 'replan',
      episodeId: other.id,
      request: 'how moon calendars cope',
    });
    expect(d.episodes.get(other.id)!.busy).toBe('research');
  });

  it("gives an editor's episode its script, and its player the plan's next and the package", async () => {
    const d = desk(planned);
    d.episodes.set('e1', {
      ...d.episodes.get('e1')!,
      phase: 'outline',
      outline,
      editorial,
    });
    const episode = await d.service.episode('u1', 'e1');
    expect(episode.editorial).toMatchObject({
      number: 1,
      rows: [expect.objectContaining({ say: 'In 1582, ten days went.' })],
    });
    expect(episode.editorial?.package?.chapters).toEqual([
      { atMs: 0, title: 'One' },
    ]);
    const play = await d.service.play('u1', 'e1');
    expect(play.next).toEqual(['Why skip a leap year every century?']);
    expect(play.package?.title).toBe('The Ten Days That Never Happened');
    const show = await d.service.show('u1', 's1');
    expect(show.editor?.plan?.episodes).toHaveLength(2);
  });
});

describe('planning that stopped', () => {
  it('carries on where it stopped when the maker asks again, and waits while it runs', async () => {
    const d = desk({
      ...EMPTY_EDITOR,
      stage: 'angles',
      question: 'Where did ten days go?',
      angles: anglesOf([{ question: 'Where did ten days go?' }]),
    });
    d.answer.action = 'outline';
    await turn(d, 'try again');
    expect(d.jobs).toEqual([
      expect.objectContaining({ kind: 'research', episodeId: 'e1' }),
    ]);
    // Running now: asked again, it is left to finish.
    const { message } = await turn(d, 'go on');
    expect(message.content).toMatch(/still planning the show/);
    expect(d.jobs).toHaveLength(1);
  });
});
