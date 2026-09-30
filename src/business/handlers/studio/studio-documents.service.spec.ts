import { briefOf } from '../../domain/studio/studio';
import { ValidationError } from '../../domain/errors/errors';
import type { JobQueuePort, StudioJob } from '../../ports/job-queue.port';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioShowRecord,
} from '../../repositories/studio.repository';
import type { SceneVoiceService } from '../admin/scene-voice.service';
import type { EntitlementsService } from '../documents/entitlements.service';
import { StudioCastService } from './studio-cast.service';
import { StudioDocumentsService } from './studio-documents.service';
import { StudioService } from './studio.service';

/**
 * A document given in the Studio's chat: its card in the thread, its
 * pages chosen on the card or in words, kept on the episode (or a series
 * of them), whom it is for read from it as one chip to say yes to, and
 * the outline written once nothing is missing.
 */

const at = new Date('2026-09-30T10:00:00Z');
const TOPICS = [
  { id: 't1', title: 'Chapter 1: Cells', startPage: 1, endPage: 20 },
  { id: 't2', title: 'Chapter 2: Membranes', startPage: 21, endPage: 40 },
  { id: 't3', title: 'Chapter 3: Osmosis', startPage: 41, endPage: 58 },
  { id: 't4', title: 'Chapter 4: Division', startPage: 59, endPage: 120 },
].map((t, k) => ({ ...t, shortDescription: null, orderIndex: k }));

function studioWithDocument(
  options: {
    brief?: Record<string, unknown>;
    firstPage?: string;
    origin?: 'reader' | 'studio';
  } = {},
) {
  const shows = new Map<string, StudioShowRecord>();
  const episodes = new Map<string, StudioEpisodeRecord>();
  const messages: StudioMessageRecord[] = [];
  let ids = 0;
  shows.set('s1', {
    id: 's1',
    userId: 'u1',
    title: 'New show',
    format: null,
    brief: briefOf(options.brief ?? {}),
    bible: null,
    createdAt: at,
    updatedAt: at,
  });
  episodes.set('e1', {
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
  });
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
        id: `e${++ids + 1}`,
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
    listScenes: () => Promise.resolve([]),
    listScenesOf: () => Promise.resolve([]),
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
    listMessages: (showId, limit = 60) =>
      Promise.resolve(
        messages.filter((m) => m.showId === showId).slice(-limit),
      ),
  };
  const doc = {
    id: 'd1',
    contentVersion: 1,
    isOwnedBy: (userId: string) => userId === 'u1',
    props: {
      title: 'Cell Biology',
      fileName: 'cells.pdf',
      pageCount: 120,
      status: 'ready',
      failureReason: null,
      origin: options.origin ?? 'studio',
      createdAt: at,
    },
  };
  const jobs: StudioJob[] = [];
  const queue = {
    enqueueStudio: (more: StudioJob[]) => {
      jobs.push(...more);
      return Promise.resolve();
    },
  } as unknown as JobQueuePort;
  const intents: unknown[] = [];
  const documents = new StudioDocumentsService(
    repo as StudioRepository,
    {
      findById: (id: string) => Promise.resolve(id === 'd1' ? doc : null),
    } as never,
    {
      findRange: () =>
        Promise.resolve([
          { pageNumber: 1, text: options.firstPage ?? 'Cells are small.' },
        ]),
    } as never,
    { listByDocument: () => Promise.resolve(TOPICS) } as never,
    queue,
    { now: () => at },
    {
      list: () => Promise.resolve([]),
      countSince: () => Promise.resolve(3),
    } as never,
    {
      handle: (input: unknown) => {
        intents.push(input);
        return Promise.resolve({
          data: {
            documentId: 'd2',
            uploadUrl: '/documents/d2/content',
            uploadMode: 'proxy',
          },
        });
      },
    } as never,
  );
  /** What the producer answers: nothing it took for pages unless a test says. */
  const answer: Record<string, unknown> = {};
  const llm = {
    moderate: () => Promise.resolve({ flagged: false, categories: [] }),
    studioTurn: () =>
      Promise.resolve({
        value: {
          reply: 'Sure.',
          choices: [],
          brief: {},
          action: 'none',
          scene: null,
          request: null,
          refuse: false,
          ...answer,
        },
        usage: { model: 'm', tokensIn: 1, tokensOut: 1, latencyMs: 1 },
      }),
  } as unknown as LlmGatewayPort;
  const service = new StudioService(
    repo as StudioRepository,
    llm,
    queue,
    { get: () => Promise.reject(new Error('none')) } as never,
    { now: () => at },
    { record: () => Promise.resolve() },
    {
      studioBalance: () =>
        Promise.resolve({
          remainingSeconds: null,
          allowanceSeconds: null,
          usedThisMonthSeconds: 0,
          watermarked: false,
        }),
    } as unknown as EntitlementsService,
    new StudioCastService({
      get: () => Promise.reject(new Error('none')),
    } as never),
    {} as SceneVoiceService,
    documents,
  );
  const events = () =>
    messages
      .filter((m) => m.meta?.kind === 'event')
      .map((m) => ({ ...m.meta!.event!, episodeId: m.episodeId }));
  const said = () =>
    messages
      .filter((m) => m.role === 'assistant' && m.meta?.kind !== 'event')
      .map((m) => ({ content: m.content, choices: m.meta?.choices ?? [] }));
  return {
    documents,
    service,
    shows,
    episodes,
    jobs,
    events,
    said,
    answer,
    intents,
  };
}

describe('a document given in the chat', () => {
  it("is uploaded as the Studio's own, not one of the library's", async () => {
    const studio = studioWithDocument();
    await studio.documents.intent('u1', {
      filename: 'cells.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
    });
    expect(studio.intents).toEqual([
      expect.objectContaining({ userId: 'u1', origin: 'studio' }),
    ]);
  });

  it('is kept by the show, and its card comes in the thread', async () => {
    const studio = studioWithDocument();
    await studio.documents.attach('u1', 's1', { documentId: 'd1' });
    expect(studio.shows.get('s1')).toMatchObject({
      documentId: 'd1',
      format: 'explainer',
      brief: {
        format: 'explainer',
        document: {
          documentId: 'd1',
          title: 'Cell Biology',
          pageCount: 120,
          ranges: [],
        },
      },
    });
    expect(studio.events()).toEqual([
      expect.objectContaining({
        what: 'document',
        documentId: 'd1',
        line: 'Document: “Cell Biology”',
      }),
    ]);
  });

  it("is never someone else's, nor one of the library's", async () => {
    const studio = studioWithDocument({ origin: 'reader' });
    await expect(
      studio.documents.attach('u1', 's1', { documentId: 'd1' }),
    ).rejects.toThrow('not found');
    await expect(
      studio.documents.attach('u2', 's1', { documentId: 'd1' }),
    ).rejects.toThrow('not found');
  });
});

describe('its pages chosen on the card', () => {
  it('are kept on the episode, the brief reckoned from them, and whom it is for asked as one chip', async () => {
    const studio = studioWithDocument({
      firstPage:
        'Lecture notes for first-year university students. Semester 2.',
    });
    await studio.documents.attach('u1', 's1', { documentId: 'd1' });
    await studio.documents.usePages('u1', 's1', {
      documentId: 'd1',
      ranges: [],
      topicIds: ['t3'],
    });
    expect(studio.episodes.get('e1')!.pages).toEqual({
      ranges: [[41, 58]],
      topicIds: ['t3'],
      label: 'Chapter 3: Osmosis',
    });
    const brief = studio.shows.get('s1')!.brief;
    expect(brief).toMatchObject({
      format: 'explainer',
      idea: 'Chapter 3: Osmosis, from “Cell Biology”',
      minutes: 4,
      audience: 'adults',
      who: { band: 'university' },
      document: { ranges: [[41, 58]], label: 'Chapter 3: Osmosis' },
    });
    expect(studio.events().map((e) => e.line)).toEqual([
      'Document: “Cell Biology”',
      'Using Chapter 3: Osmosis (p. 41–58) of “Cell Biology”',
    ]);
    // A guess, so asked, with one chip to say yes; nothing written yet.
    const [asked] = studio.said();
    expect(studio.said()).toHaveLength(1);
    expect(asked.content).toMatch(
      /^It reads like it's for .+\. Is that who it's for\?$/,
    );
    expect(asked.choices).toEqual(['Yes, University']);
    expect(studio.jobs).toEqual([]);
  });

  it('asks whom it is for with the chips, when the document does not say', async () => {
    const studio = studioWithDocument();
    await studio.documents.usePages('u1', 's1', {
      documentId: 'd1',
      ranges: [[3, 9]],
      topicIds: [],
    });
    const [asked] = studio.said();
    expect(asked.content).toBe('Who is it for?');
    expect(asked.choices).toEqual(
      expect.arrayContaining(['University', 'Teens']),
    );
  });

  it('writes the outline straight away when the maker has said the rest', async () => {
    const studio = studioWithDocument({
      brief: {
        audience: 'teens',
        tone: 'calm',
        minutes: 2,
        format: 'explainer',
        idea: 'cells',
      },
    });
    await studio.documents.usePages('u1', 's1', {
      documentId: 'd1',
      ranges: [[3, 9]],
      topicIds: [],
    });
    expect(studio.jobs).toEqual([
      { kind: 'outline', showId: 's1', episodeId: 'e1', userId: 'u1' },
    ]);
    expect(studio.said()).toEqual([]);
    // The maker's own length and idea stand.
    expect(studio.shows.get('s1')!.brief).toMatchObject({
      minutes: 2,
      idea: 'cells',
    });
  });

  it('holds an episode to sixty pages, and makes a series of more, one a chapter', async () => {
    const studio = studioWithDocument();
    await expect(
      studio.documents.usePages('u1', 's1', {
        documentId: 'd1',
        ranges: [[1, 70]],
        topicIds: [],
      }),
    ).rejects.toThrow(ValidationError);
    await studio.documents.usePages('u1', 's1', {
      documentId: 'd1',
      ranges: [],
      topicIds: ['t1', 't2', 't3'],
      series: true,
    });
    const all = [...studio.episodes.values()].sort(
      (a, b) => a.number - b.number,
    );
    expect(all.map((e) => [e.number, e.title, e.pages?.ranges])).toEqual([
      [1, 'Episode 1', [[1, 20]]],
      [2, 'Chapter 2: Membranes', [[21, 40]]],
      [3, 'Chapter 3: Osmosis', [[41, 58]]],
    ]);
    expect(studio.events().at(-1)!.line).toBe(
      'A series of 3 episodes from “Cell Biology”, one a chapter',
    );
  });

  it('starts a new episode when this one is written already', async () => {
    const studio = studioWithDocument();
    studio.episodes.set('e1', { ...studio.episodes.get('e1')!, phase: 'made' });
    const { episodeId } = await studio.documents.usePages('u1', 's1', {
      documentId: 'd1',
      ranges: [[5, 6]],
      topicIds: [],
    });
    expect(episodeId).not.toBe('e1');
    expect(studio.episodes.get(episodeId)).toMatchObject({
      number: 2,
      pages: { ranges: [[5, 6]] },
    });
    expect(studio.episodes.get('e1')!.pages).toBeUndefined();
  });
});

describe('its pages chosen in words', () => {
  it('hears "chapter 2" by code, whatever the producer took it for', async () => {
    const studio = studioWithDocument({
      brief: { audience: 'adults', format: 'explainer' },
    });
    await studio.documents.attach('u1', 's1', { documentId: 'd1' });
    const done = await studio.service.turn(
      'u1',
      's1',
      { episodeId: 'e1', message: "Let's do chapter 2" },
      () => undefined,
    );
    expect(studio.episodes.get('e1')!.pages).toMatchObject({
      ranges: [[21, 40]],
      topicIds: ['t2'],
    });
    // The one thing still missing, asked with chips.
    expect(done.message).toMatchObject({
      content: 'How should it feel?',
      choices: ['Calm', 'Gentle', 'Exciting', 'Funny', 'Serious'],
    });
    expect(done.show.brief.document).toMatchObject({
      label: 'Chapter 2: Membranes',
    });
  });

  it('hears a subject only when the producer took it as pages', async () => {
    const studio = studioWithDocument({
      brief: {
        audience: 'adults',
        format: 'explainer',
        tone: 'calm',
        minutes: 2,
        idea: 'cells',
      },
    });
    await studio.documents.attach('u1', 's1', { documentId: 'd1' });
    await studio.service.turn(
      'u1',
      's1',
      { episodeId: 'e1', message: 'osmosis' },
      () => undefined,
    );
    expect(studio.episodes.get('e1')!.pages).toBeUndefined();
    Object.assign(studio.answer, {
      action: 'pages',
      request: 'the part about osmosis',
    });
    await studio.service.turn(
      'u1',
      's1',
      { episodeId: 'e1', message: 'the part about osmosis' },
      () => undefined,
    );
    expect(studio.episodes.get('e1')!.pages).toMatchObject({
      topicIds: ['t3'],
    });
    // Nothing missing: the outline is being written.
    expect(studio.jobs).toEqual([
      { kind: 'outline', showId: 's1', episodeId: 'e1', userId: 'u1' },
    ]);
  });

  it('asks which part when the words choose none of it', async () => {
    const studio = studioWithDocument();
    await studio.documents.attach('u1', 's1', { documentId: 'd1' });
    Object.assign(studio.answer, {
      action: 'pages',
      request: 'the bit on photosynthesis',
    });
    const done = await studio.service.turn(
      'u1',
      's1',
      { episodeId: 'e1', message: 'the bit on photosynthesis' },
      () => undefined,
    );
    expect(done.message.content).toBe(
      'Which part of it? Tell me a chapter or the pages, or choose them on the card.',
    );
  });
});
