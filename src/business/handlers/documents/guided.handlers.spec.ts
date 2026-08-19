import type { TopicPreviewBody } from '../../../contracts';
import { FakeLlmAdapter } from '../../../web/adapters/fake-llm.adapter';
import type { TopicPreviewRepository } from '../../repositories/preview.repository';
import {
  CheckQuestionAnswerHandler,
  GetTopicPreviewHandler,
  GradeRecallHandler,
} from './guided.handlers';
import type { DocumentAccessService } from './document-access.service';

/**
 * The preview cache is the economics of the feature — one model call per
 * chapter ever — so the caching behaviour is what gets pinned: a cold call
 * generates, stores and logs; a warm call serves the row and spends nothing.
 */

const TOPIC = {
  id: 'topic-1',
  title: 'Osmosis',
  shortDescription: null,
  startPage: 1,
  endPage: 2,
  orderIndex: 0,
  isRead: false,
};

function fakes() {
  const stored = new Map<string, TopicPreviewBody>();
  const logged: string[] = [];
  // Wrapped rather than bound: the counter is the only difference from the
  // stock fake, and `bind` loses the method's type under the lint's eyes.
  const inner = new FakeLlmAdapter();
  const llm = new FakeLlmAdapter();
  let llmCalls = 0;
  llm.generateTopicPreview = (input) => {
    llmCalls += 1;
    return inner.generateTopicPreview(input);
  };

  const previews: TopicPreviewRepository = {
    find: (topicId) => Promise.resolve(stored.get(topicId) ?? null),
    save: (input) => {
      stored.set(input.topicId, input.body);
      return Promise.resolve();
    },
  };

  const handler = new GetTopicPreviewHandler(
    llm,
    { listWithReadState: () => Promise.resolve([TOPIC]) } as never,
    previews,
    {
      findRange: () =>
        Promise.resolve([
          {
            pageNumber: 1,
            status: 'done',
            blocks: [{ type: 'paragraph', text: 'Water crosses membranes.' }],
          },
        ]),
    } as never,
    { find: () => Promise.resolve(null) } as never,
    {
      record: (input: { task: string }) => {
        logged.push(input.task);
        return Promise.resolve();
      },
    },
    {
      require: () => Promise.resolve(undefined),
    } as unknown as DocumentAccessService,
  );

  return { handler, stored, logged, llmCalls: () => llmCalls };
}

describe('GetTopicPreviewHandler', () => {
  const request = { userId: 'u1', documentId: 'd1', topicId: 'topic-1' };

  it('generates, stores and logs on a cold cache', async () => {
    const f = fakes();
    const result = await f.handler.handle(request);

    expect(result.data.cached).toBe(false);
    expect(result.data.body.outline.length).toBeGreaterThanOrEqual(2);
    expect(f.stored.has('topic-1')).toBe(true);
    expect(f.logged).toEqual(['preview']);
    expect(f.llmCalls()).toBe(1);
  });

  it('serves the cache without a model call or a ledger row', async () => {
    const f = fakes();
    await f.handler.handle(request);
    const warm = await f.handler.handle(request);

    expect(warm.data.cached).toBe(true);
    expect(f.llmCalls()).toBe(1);
    expect(f.logged).toEqual(['preview']);
  });
});

describe('CheckQuestionAnswerHandler', () => {
  it("maps the schema's page 0 to the contract's null", async () => {
    const llm = new FakeLlmAdapter();
    const handler = new CheckQuestionAnswerHandler(
      llm,
      { query: () => Promise.resolve([]) } as never,
      { find: () => Promise.resolve(null) } as never,
      { record: () => Promise.resolve() },
      {
        require: () => Promise.resolve(undefined),
      } as unknown as DocumentAccessService,
    );

    const result = await handler.handle({
      userId: 'u1',
      documentId: 'd1',
      question: 'Why does water move?',
      answer: 'Because of concentration differences.',
    });

    // The fake always answers page 0 — the unplaceable case.
    expect(result.data.page).toBeNull();
    expect(['correct', 'partial', 'incorrect']).toContain(result.data.verdict);
  });
});

describe('GradeRecallHandler', () => {
  /**
   * Graders sometimes report an idea as covered *and* still missed in the
   * same grade, despite the prompt forbidding it. Missed has to win, or an
   * idea the grader just called absent would close itself in the report.
   */
  it('never resolves an idea the same grade still lists as missed', async () => {
    const llm = {
      gradeRecall: () =>
        Promise.resolve({
          value: {
            score: 0.5,
            nailed: [],
            missed: ['Still absent'],
            focus: [],
            nowCovered: [0, 1],
          },
          usage: { model: 'fake', tokensIn: 0, tokensOut: 0, latencyMs: 1 },
        }),
    };
    const history = [
      {
        topicId: 'topic-1',
        kind: 'verbal' as const,
        score: 0,
        payload: { missed: ['Still absent', 'Genuinely covered'] },
        createdAt: new Date('2026-08-01T09:00:00Z'),
      },
    ];

    const handler = new GradeRecallHandler(
      llm as never,
      { listWithReadState: () => Promise.resolve([TOPIC]) } as never,
      {
        findRange: () =>
          Promise.resolve([
            {
              pageNumber: 1,
              status: 'done',
              blocks: [{ type: 'paragraph', text: 'Text.' }],
            },
          ]),
      } as never,
      { record: () => Promise.resolve() },
      { recent: () => Promise.resolve(history) } as never,
      {
        require: () => Promise.resolve(undefined),
      } as unknown as DocumentAccessService,
    );

    const { data } = await handler.handle({
      userId: 'u1',
      documentId: 'd1',
      topicId: 'topic-1',
      recall: 'something',
    });

    expect(data.resolved).toEqual(['Genuinely covered']);
  });
});
