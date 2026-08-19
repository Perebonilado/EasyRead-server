import type { AssessmentEventRecord } from '../../repositories/learning.repository';
import { GetDocumentReportHandler } from './report.handlers';
import type { DocumentAccessService } from './document-access.service';

/**
 * The composition rules, pinned: ordering of the revisit queue, the evidence
 * floor under "strengths", and the fact that a chapter read without checks
 * is reported as unverified rather than guessed at in either direction.
 */
describe('GetDocumentReportHandler', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const base = new Date('2026-08-01T09:00:00Z');
  const at = (offset: number) => new Date(base.getTime() + offset);

  const TOPICS = [
    {
      id: 'weak',
      title: 'Weak chapter',
      shortDescription: null,
      startPage: 1,
      endPage: 2,
      orderIndex: 0,
      isRead: true,
    },
    {
      id: 'weaker',
      title: 'Weaker chapter',
      shortDescription: null,
      startPage: 3,
      endPage: 4,
      orderIndex: 1,
      isRead: true,
    },
    {
      id: 'strong',
      title: 'Strong chapter',
      shortDescription: null,
      startPage: 5,
      endPage: 6,
      orderIndex: 2,
      isRead: true,
    },
    {
      id: 'read-only',
      title: 'Read but never checked',
      shortDescription: null,
      startPage: 7,
      endPage: 8,
      orderIndex: 3,
      isRead: true,
    },
  ];

  const event = (
    topicId: string,
    offset: number,
    score: number,
    payload: Record<string, unknown> | null = null,
  ): AssessmentEventRecord => ({
    topicId,
    kind: 'mcq',
    score,
    payload,
    createdAt: at(offset),
  });

  const EVENTS: AssessmentEventRecord[] = [
    // weak: 40-ish, one pass
    event('weak', 0, 0, { missed: ['Aggregate demand'] }),
    event('weak', 1000, 1),
    event('weak', 2000, 0),
    // weaker: 0, one pass, older evidence than weak
    event('weaker', -DAY, 0),
    event('weaker', -DAY + 1000, 0),
    // strong: four events, all right
    event('strong', 0, 1),
    event('strong', 1000, 1),
    event('strong', 2000, 1),
    event('strong', 3000, 1, { confidence: 1 }),
  ];

  const build = () =>
    new GetDocumentReportHandler(
      { recent: () => Promise.resolve(EVENTS) } as never,
      { listWithReadState: () => Promise.resolve(TOPICS) } as never,
      { now: () => at(2 * DAY) },
      {
        require: () => Promise.resolve(undefined),
      } as unknown as DocumentAccessService,
    );

  const run = () => build().handle({ userId: 'u1', documentId: 'd1' });

  it('queues revisits weakest first', async () => {
    const { data } = await run();
    expect(data.revisitQueue).toEqual(['weaker', 'weak']);
  });

  it('names a strength only with enough evidence behind it', async () => {
    const { data } = await run();
    expect(data.strengths).toEqual(['strong']);
  });

  it('reports a read chapter with no checks as unverified, not as a score', async () => {
    const { data } = await run();
    expect(data.unverified).toEqual(['read-only']);
    const readOnly = data.topics.find((t) => t.topicId === 'read-only');
    expect(readOnly?.score).toBeNull();
    expect(readOnly?.needsRevisit).toBe(false);
  });

  it('carries missed ideas through to the chapter', async () => {
    const { data } = await run();
    const weak = data.topics.find((t) => t.topicId === 'weak');
    expect(weak?.missedIdeas[0]).toMatchObject({
      text: 'Aggregate demand',
      timesMissed: 1,
      resolvedAt: null,
    });
  });

  it('lists every check newest first, tagged with its pass', async () => {
    const { data } = await run();
    const weak = data.topics.find((t) => t.topicId === 'weak');
    expect(weak?.checks).toHaveLength(3);
    // Newest first.
    expect((weak?.checks[0].at ?? '') > (weak?.checks[1].at ?? '')).toBe(true);
    // All three sit inside one pass here.
    expect(weak?.checks.every((check) => check.pass === 1)).toBe(true);
  });

  it('numbers checks by the same passes the score uses', async () => {
    const handler = new GetDocumentReportHandler(
      {
        recent: () =>
          Promise.resolve([
            event('weak', 0, 0),
            event('weak', 1000, 0),
            // Two days later: a second pass.
            event('weak', 2 * DAY, 1),
            event('weak', 2 * DAY + 1000, 1),
          ]),
      } as never,
      { listWithReadState: () => Promise.resolve(TOPICS) } as never,
      { now: () => at(3 * DAY) },
      {
        require: () => Promise.resolve(undefined),
      } as unknown as DocumentAccessService,
    );
    const { data } = await handler.handle({ userId: 'u1', documentId: 'd1' });
    const weak = data.topics.find((t) => t.topicId === 'weak');
    expect(weak?.passes).toBe(2);
    // Newest first, so the second pass leads.
    expect(weak?.checks.map((c) => c.pass)).toEqual([2, 2, 1, 1]);
  });

  it('carries a recall grade and its source into the drill-in', async () => {
    const handler = new GetDocumentReportHandler(
      {
        recent: () =>
          Promise.resolve([
            {
              topicId: 'weak',
              kind: 'verbal' as const,
              score: 0.75,
              payload: {
                guided: true,
                recall: true,
                confidence: 0.6,
                nailed: ['Held'],
                missed: ['Gone'],
                focus: ['Reread this'],
                resolved: ['Came back'],
              },
              createdAt: at(0),
            },
            {
              topicId: 'weak',
              kind: 'mcq' as const,
              score: 1,
              payload: { tutor: true, question: 'Why?', confidence: 1 },
              createdAt: at(1000),
            },
          ]),
      } as never,
      { listWithReadState: () => Promise.resolve(TOPICS) } as never,
      { now: () => at(DAY) },
      {
        require: () => Promise.resolve(undefined),
      } as unknown as DocumentAccessService,
    );
    const { data } = await handler.handle({ userId: 'u1', documentId: 'd1' });
    const checks = data.topics.find((t) => t.topicId === 'weak')?.checks ?? [];

    const tutorCheck = checks.find((c) => c.source === 'tutor');
    expect(tutorCheck).toMatchObject({ prompt: 'Why?', confidence: 1 });
    expect(tutorCheck?.recall).toBeNull();

    const recallCheck = checks.find((c) => c.source === 'guided');
    expect(recallCheck?.confidence).toBe(0.6);
    expect(recallCheck?.recall).toEqual({
      nailed: ['Held'],
      missed: ['Gone'],
      focus: ['Reread this'],
      resolved: ['Came back'],
    });
  });

  it('bands chapters and points the next step at open ideas', async () => {
    const { data } = await run();
    const weak = data.topics.find((t) => t.topicId === 'weak');
    const strong = data.topics.find((t) => t.topicId === 'strong');
    const readOnly = data.topics.find((t) => t.topicId === 'read-only');

    expect(weak?.band).toBe('revisit');
    expect(strong?.band).toBe('solid');
    expect(readOnly?.band).toBe('unverified');
    // The open missed idea leads the reread pointers.
    expect(weak?.nextStepPointers).toEqual(['Aggregate demand']);
    // Nothing open, nothing to point at.
    expect(strong?.nextStepPointers).toEqual([]);
  });

  it('totals only what the evidence supports', async () => {
    const { data } = await run();
    expect(data.totals).toEqual({
      checks: EVENTS.length,
      chaptersWithEvidence: 3,
      reread: 0,
    });
  });
});
