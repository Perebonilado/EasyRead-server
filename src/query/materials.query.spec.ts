/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for models whose interface is Promise-shaped. */
import { MaterialsQuery, planFailedFor } from './materials.query';

/**
 * A chapter whose plan failed on its last attempt leaves its pages pending
 * with nothing coming. The card must call those pages failed, with the
 * plan's reason, or the document reads "writing" for ever at 98%.
 */
const NOW = new Date('2026-09-14T10:00:00Z');
const segment = (over: Record<string, unknown>) => {
  const values: Record<string, unknown> = {
    documentId: 'doc',
    topicId: 't1',
    contentVersion: 1,
    pageNumber: 1,
    kind: 'page',
    style: 'steady',
    status: 'pending',
    error: null,
    untaught: null,
    scriptText: null,
    updatedAt: NOW,
    ...over,
  };
  return { ...values, get: (key: string) => values[key] } as never;
};

function build(planRows: unknown[], segmentRows: unknown[]) {
  return new MaterialsQuery(
    { findOne: async () => ({ get: () => 1 }) } as never,
    { findAll: async () => [] } as never,
    { findAll: async () => [] } as never,
    { findAll: async () => segmentRows } as never,
    { findAll: async () => [] } as never,
    { findAll: async () => planRows } as never,
  );
}

describe('a chapter that could not be planned', () => {
  const plans = [
    {
      documentId: 'doc',
      topicId: 't1',
      contentVersion: 1,
      error: 'No object generated',
    },
  ];

  it('shows its pending pages as failed, with the reason', async () => {
    const query = build(plans, [
      segment({ pageNumber: 1 }),
      segment({ pageNumber: 2, topicId: 't2' }),
      segment({ pageNumber: 3, status: 'done', scriptText: 'said' }),
    ]);
    const pages = await query.pages('ur', 'doc');
    expect(
      pages.map((page) => [page.pageNumber, page.status, page.error]),
    ).toEqual([
      [1, 'failed', 'Chapter not planned: No object generated'],
      [2, 'pending', null],
      [3, 'done', null],
    ]);
  });

  it('is only ever about pending rows of that chapter', () => {
    const failed = new Map([['doc', new Map([['t1:1', 'why']])]]);
    const row = { documentId: 'doc', topicId: 't1', contentVersion: 1 };
    expect(planFailedFor(failed, { ...row, status: 'pending' })).toBe('why');
    expect(planFailedFor(failed, { ...row, status: 'done' })).toBeNull();
    expect(
      planFailedFor(failed, { ...row, contentVersion: 2, status: 'pending' }),
    ).toBeNull();
    expect(
      planFailedFor(failed, { ...row, topicId: 't2', status: 'pending' }),
    ).toBeNull();
    expect(
      planFailedFor(failed, { ...row, topicId: null, status: 'pending' }),
    ).toBeNull();
  });
});
