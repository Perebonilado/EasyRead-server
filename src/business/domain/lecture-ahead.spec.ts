import { chaptersAhead } from './lecture-ahead';

const big = [
  { id: 'c1', startPage: 1, endPage: 4 },
  { id: 'c2', startPage: 5, endPage: 33 },
  { id: 'c3', startPage: 34, endPage: 41 },
  { id: 'c4', startPage: 42, endPage: 50 },
  { id: 'c5', startPage: 51, endPage: 70 },
  { id: 'c6', startPage: 71, endPage: 86 },
  { id: 'c7', startPage: 87, endPage: 109 },
  { id: 'c8', startPage: 110, endPage: 118 },
  { id: 'c9', startPage: 119, endPage: 269 },
];

const small = [
  { id: 's1', startPage: 1, endPage: 10 },
  { id: 's2', startPage: 11, endPage: 25 },
  { id: 's3', startPage: 26, endPage: 40 },
  { id: 's4', startPage: 41, endPage: 55 },
  { id: 's5', startPage: 56, endPage: 70 },
  { id: 's6', startPage: 71, endPage: 80 },
];

const ids = (rows: { topicId: string }[]) => rows.map((row) => row.topicId);

describe('always a chapter ahead', () => {
  it('on a large book: the chapter you are on from your page, the next two, then the one behind', () => {
    const ahead = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 73,
      written: new Set(),
    });
    expect(ids(ahead)).toEqual(['c6', 'c7', 'c8', 'c5']);
    expect(ahead[0]).toEqual({ topicId: 'c6', priority: 1, startAtPage: 73 });
    expect(ahead.map((row) => row.priority)).toEqual([1, 2, 3, 4]);
    expect(ahead[1].startAtPage).toBeUndefined();
  });

  it('on a small book: everything, ahead in order first, then the earlier chapters from the nearest back', () => {
    const ahead = chaptersAhead({
      topics: small,
      pageCount: 80,
      page: 20,
      written: new Set(),
    });
    expect(ids(ahead)).toEqual(['s2', 's3', 's4', 's5', 's6', 's1']);
    expect(ahead[0].startAtPage).toBe(20);
  });

  it('leaves out what is written or on its way, and queues nothing when all is', () => {
    expect(
      ids(
        chaptersAhead({
          topics: big,
          pageCount: 269,
          page: 73,
          written: new Set(['c6', 'c7']),
        }),
      ),
    ).toEqual(['c8', 'c5']);
    expect(
      chaptersAhead({
        topics: big,
        pageCount: 269,
        page: 73,
        written: new Set(big.map((topic) => topic.id)),
      }),
    ).toEqual([]);
  });

  it('tops up as the lesson enters a chapter', () => {
    const entering = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 87,
      written: new Set(['c5', 'c6', 'c7', 'c8']),
    });
    expect(ids(entering)).toEqual(['c9']);
  });

  it('front matter starts at the first chapter ahead, from its beginning', () => {
    const ahead = chaptersAhead({
      topics: big.slice(1),
      pageCount: 269,
      page: 2,
      written: new Set(),
    });
    expect(ids(ahead).slice(0, 3)).toEqual(['c2', 'c3', 'c4']);
    expect(ahead[0].startAtPage).toBeUndefined();
    expect(
      chaptersAhead({ topics: [], pageCount: 10, page: 1, written: new Set() }),
    ).toEqual([]);
  });
});
