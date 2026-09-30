import { bibleOf, briefOf } from '../../business/domain/studio/studio';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type { PageText } from '../../business/repositories/document-page.repository';
import type {
  StudioEpisodeRecord,
  StudioMessageRecord,
  StudioRepository,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import { FakeLlmAdapter } from '../../web/adapters/fake-llm.adapter';
import type { StudioJobData } from '../queues';
import type { SceneProcessor } from './scene.processor';
import { StudioMaterialService } from './studio-material';
import { StudioProcessor } from './studio.processor';

/**
 * An explainer made from pages of a document, outlined on the worker with
 * the fake writer: a short choice is outlined from the pages as they are;
 * a long one from their teacher's notes, read in parts of twenty pages;
 * each scene is tied to the pages it teaches, and its writer is given
 * them; a series is outlined one episode after another.
 */

const at = new Date('2026-09-30T10:00:00Z');
const PARAGRAPH =
  'Osmosis is the movement of water across a membrane, from where there is more water to where there is less. The membrane lets water through but holds back the salt. ';

function page(n: number, chars: number): PageText {
  return {
    pageNumber: n,
    text: `Page ${n}. ${PARAGRAPH.repeat(Math.ceil(chars / PARAGRAPH.length))}`.slice(
      0,
      chars,
    ),
    charCount: chars,
    isEmpty: false,
    textSource: 'extracted',
    hasMaths: false,
  };
}

function worker(options: { pages: number; chars: number; series?: boolean }) {
  const pages = Array.from({ length: options.pages }, (_, k) =>
    page(k + 1, options.chars),
  );
  const pick = (from: number, to: number, label: string) => ({
    ranges: [[from, to]] as [number, number][],
    topicIds: [],
    label,
  });
  const show: StudioShowRecord = {
    id: 's1',
    userId: 'u1',
    title: 'Cells',
    format: 'explainer',
    brief: briefOf({
      format: 'explainer',
      idea: 'Osmosis, from “Cells”',
      audience: 'adults',
      minutes: 2,
      tone: 'calm',
      document: {
        documentId: 'd1',
        title: 'Cells',
        pageCount: options.pages,
        ranges: [[1, options.pages]],
        topicIds: [],
        label: 'Pages',
      },
    }),
    bible: bibleOf({ subject: 'biology', pictures: [] }),
    documentId: 'd1',
    createdAt: at,
    updatedAt: at,
  };
  const episode = (
    id: string,
    number: number,
    pages: StudioEpisodeRecord['pages'],
  ): StudioEpisodeRecord => ({
    id,
    showId: 's1',
    userId: 'u1',
    number,
    title: `Episode ${number}`,
    logline: null,
    phase: 'brief',
    busy: number === 1 ? 'outline' : null,
    error: null,
    outline: null,
    shareToken: null,
    durationMs: null,
    thumbKey: null,
    pages,
    createdAt: at,
    updatedAt: at,
  });
  const half = Math.floor(options.pages / 2);
  const episodes = new Map<string, StudioEpisodeRecord>(
    options.series
      ? [
          ['e1', episode('e1', 1, pick(1, half, 'Chapter 1'))],
          ['e2', episode('e2', 2, pick(half + 1, options.pages, 'Chapter 2'))],
        ]
      : [['e1', episode('e1', 1, pick(1, options.pages, 'Pages'))]],
  );
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
    claimEpisode: (id, busy) => {
      const one = episodes.get(id)!;
      if (one.busy) return Promise.resolve(false);
      episodes.set(id, { ...one, busy });
      return Promise.resolve(true);
    },
    listScenes: () => Promise.resolve([]),
    addMessage: (input) => {
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
  // The fake writer, watched: what each call was given.
  const fake = new FakeLlmAdapter();
  const calls = {
    notes: [] as { from: number; to: number }[],
    outline: [] as string[],
    scene: [] as string[],
  };
  const llm = new Proxy(fake, {
    get(target, name: string) {
      if (name === 'sceneNotes')
        return (input: { from: number; to: number }) => {
          calls.notes.push({ from: input.from, to: input.to });
          return target.sceneNotes(input as never);
        };
      if (name === 'studioOutline')
        return (input: { brief: string }) => {
          calls.outline.push(input.brief);
          return target.studioOutline(input as never);
        };
      if (name === 'sceneScript')
        return (input: { material: string }) => {
          calls.scene.push(input.material);
          return target.sceneScript(input as never);
        };
      return (target as unknown as Record<string, unknown>)[name];
    },
  }) as unknown as LlmGatewayPort;
  const kept = new Map<string, Buffer>();
  const storage = {
    get: (key: string) =>
      kept.has(key)
        ? Promise.resolve(kept.get(key)!)
        : Promise.reject(new Error('not found')),
    put: ({ key, body }: { key: string; body: Buffer }) => {
      kept.set(key, body);
      return Promise.resolve();
    },
  };
  const read: number[][] = [];
  const material = new StudioMaterialService(
    {
      findById: () =>
        Promise.resolve({
          id: 'd1',
          contentVersion: 1,
          props: { title: 'Cells', deletedAt: null },
        }),
    } as never,
    {
      findRange: (_id: string, from: number, to: number) =>
        Promise.resolve(
          pages.filter((p) => p.pageNumber >= from && p.pageNumber <= to),
        ),
    } as never,
    llm,
    storage as never,
    {
      readSome: (_id: string, some: number[]) => {
        read.push(some);
        return Promise.resolve(0);
      },
    } as never,
  );
  const queued: StudioJobData[] = [];
  const recorded: string[] = [];
  const processor = new StudioProcessor(
    repo as StudioRepository,
    llm,
    {
      record: (row: { task: string }) => {
        recorded.push(row.task);
        return Promise.resolve();
      },
    },
    storage as never,
    {} as SceneProcessor,
    {} as never,
    {} as never,
    {
      enqueueStudio: (jobs: StudioJobData[]) => {
        queued.push(...jobs);
        return Promise.resolve();
      },
    } as never,
    undefined,
    material,
  );
  return { processor, episodes, calls, queued, recorded, read, kept };
}

const outlineJob: StudioJobData = {
  kind: 'outline',
  showId: 's1',
  episodeId: 'e1',
  userId: 'u1',
};
const once = { attemptsMade: 1, isFinalAttempt: true, jobId: 'j1' };

describe('an explainer outlined from pages of a document', () => {
  it('is outlined from a short choice as the pages are, each scene tied to its pages', async () => {
    const studio = worker({ pages: 6, chars: 1500 });
    await studio.processor.process(outlineJob, once);
    // Only the pages chosen were looked at for OCR, and no notes were read.
    expect(studio.read).toEqual([[1, 2, 3, 4, 5, 6]]);
    expect(studio.calls.notes).toEqual([]);
    const brief = studio.calls.outline[0];
    expect(brief).toContain('This episode teaches Pages (p. 1–6).');
    expect(brief).toContain('Those pages, as the document has them:');
    expect(brief).toContain('[page 6]\nPage 6. Osmosis');
    const outline = studio.episodes.get('e1')!.outline!;
    expect(outline.scenes.map((s) => s.pages)).toEqual([
      [1, 3],
      [4, 6],
    ]);
  });

  it("is outlined from a long choice's teacher's notes, read twenty pages at a time", async () => {
    const studio = worker({ pages: 40, chars: 2500 });
    await studio.processor.process(outlineJob, once);
    expect(studio.calls.notes).toEqual([
      { from: 1, to: 20 },
      { from: 21, to: 40 },
    ]);
    const brief = studio.calls.outline[0];
    expect(brief).toContain(
      "Teacher's notes on those pages, each page marked:",
    );
    expect(brief).toContain('[page 40]');
    // Not the pages' own text: that would be 100,000 characters.
    expect(brief.length).toBeLessThan(20_000);
    expect(brief).not.toContain('holds back the salt');
    // The notes' calls are the notes' in the ledger; kept, for next time.
    expect(studio.recorded.filter((t) => t === 'scene_notes')).toHaveLength(2);
    expect([...studio.kept.keys()][0]).toMatch(
      /^studio\/documents\/d1\/v1\/notes-/,
    );
    const outline = studio.episodes.get('e1')!.outline!;
    expect(outline.scenes.map((s) => s.pages)).toEqual([
      [1, 20],
      [21, 40],
    ]);
    // Asked again, the notes kept are used: no reading twice.
    studio.episodes.set('e1', {
      ...studio.episodes.get('e1')!,
      busy: 'outline',
    });
    await studio.processor.process(outlineJob, { ...once, jobId: 'j2' });
    expect(studio.calls.notes).toHaveLength(2);
  });

  it('gives each scene’s writer its own pages', async () => {
    const studio = worker({ pages: 6, chars: 1500 });
    await studio.processor.process(outlineJob, once);
    const rows: { id: string; position: number }[] = [
      { id: 'c1', position: 0 },
      { id: 'c2', position: 1 },
    ];
    const updated: string[] = [];
    Object.assign(
      (studio.processor as unknown as { studio: Record<string, unknown> })
        .studio,
      {
        replaceScenes: () =>
          Promise.resolve(
            rows.map((r) => ({
              ...r,
              episodeId: 'e1',
              sheet: null,
              status: 'writing',
            })),
          ),
        updateScene: (id: string) => {
          updated.push(id);
          return Promise.resolve();
        },
      },
    );
    studio.episodes.set('e1', {
      ...studio.episodes.get('e1')!,
      busy: 'script',
      phase: 'outline',
    });
    await studio.processor.process(
      { ...outlineJob, kind: 'script' },
      { ...once, jobId: 'j3' },
    );
    // Each scene's writer (and its one send-back) given its own pages, and no others.
    const first = studio.calls.scene.filter((m) => m.includes('(p. 1–3)'));
    const second = studio.calls.scene.filter((m) => m.includes('(p. 4–6)'));
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(first.length + second.length).toBe(studio.calls.scene.length);
    expect(first[0]).toContain(
      "The document's own pages for this scene (p. 1–3)",
    );
    expect(first[0]).toContain('[page 3]');
    expect(first[0]).not.toContain('[page 4]');
    expect(second[0]).toContain('[page 6]');
    expect(updated.sort()).toEqual(['c1', 'c2']);
  });

  it('outlines a series one episode after another', async () => {
    const studio = worker({ pages: 10, chars: 1000, series: true });
    await studio.processor.process(outlineJob, once);
    expect(studio.calls.outline[0]).toContain(
      'This episode teaches Chapter 1 (p. 1–5).',
    );
    expect(studio.queued).toEqual([
      { kind: 'outline', showId: 's1', episodeId: 'e2', userId: 'u1' },
    ]);
    expect(studio.episodes.get('e2')!.busy).toBe('outline');
    await studio.processor.process(
      { ...outlineJob, episodeId: 'e2' },
      { ...once, jobId: 'j2' },
    );
    expect(studio.calls.outline.at(-1)).toContain(
      'This episode teaches Chapter 2 (p. 6–10).',
    );
    expect(studio.episodes.get('e2')!.outline!.scenes[1].pages).toEqual([
      9, 10,
    ]);
    // The last of the series asks for no more.
    expect(studio.queued).toHaveLength(1);
  });
});
