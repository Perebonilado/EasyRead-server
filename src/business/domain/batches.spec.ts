import type { MaterialDto, MaterialState } from '../../contracts';
import { batchShown, batchState, batchesOf } from './batches';

const material = (
  id: string,
  batchId: string | null,
  state: MaterialState,
  extra: Partial<MaterialDto> = {},
): MaterialDto =>
  ({
    document: {
      id,
      status: state === 'preparing' ? 'processing' : 'ready',
      createdAt: `2026-09-16T10:0${id.length}:00.000Z`,
    },
    batchId,
    publishedAt: null,
    lecture: {
      gentle: { total: 4, scripted: 4, voicing: 0, ready: 0, failed: 0 },
      steady: { total: 4, scripted: 4, voicing: 0, ready: 0, failed: 0 },
      brisk: { total: 4, scripted: 4, voicing: 0, ready: 0, failed: 0 },
    },
    progress: { state, failed: 0, untaught: 0 },
    costUsd: 0.5,
    ...extra,
  }) as unknown as MaterialDto;

describe('the admin batches', () => {
  it('groups files by their drop, newest drop first, and leaves out files from before batches', () => {
    const batches = batchesOf([
      material('a', 'b1', 'written'),
      material('bb', 'b1', 'written', { publishedAt: '2026-09-16' }),
      material('ccc', 'b2', 'written'),
      material('dddd', null, 'ready'),
    ]);
    expect(batches.map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(batches[1].files).toBe(2);
    expect(batches[1].published).toBe(1);
    expect(batches[1].scripts).toEqual({ done: 24, total: 24 });
    expect(batches[1].audio).toEqual({ done: 0, total: 24 });
    expect(batches[1].costUsd).toBe(1);
    expect(batches[1].documentIds).toEqual(['a', 'bb']);
  });

  it('holds the batch at the earliest stage any file is at', () => {
    expect(batchState(['written', 'preparing'])).toBe('preparing');
    expect(batchState(['written', 'writing'])).toBe('writing');
    expect(batchState(['written', 'attention'])).toBe('attention');
    expect(batchState(['ready', 'voicing'])).toBe('voicing');
    expect(batchState(['ready', 'ready'])).toBe('voiced');
    expect(batchState(['written', 'ready'])).toBe('written');
  });

  it('keeps a finished batch on the page for a week, an unfinished one always', () => {
    const [done] = batchesOf([
      material('a', 'b1', 'ready', { publishedAt: '2026-09-16' }),
    ]);
    expect(batchShown(done, new Date('2026-09-20'))).toBe(true);
    expect(batchShown(done, new Date('2026-10-01'))).toBe(false);
    const [open] = batchesOf([material('a', 'b1', 'written')]);
    expect(batchShown(open, new Date('2027-01-01'))).toBe(true);
  });
});
