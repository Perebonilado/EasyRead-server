import {
  RUNWAY_PAGES,
  WHOLE_BOOK_MAX_PAGES,
  chaptersAhead,
  runwayDue,
} from './lecture-ahead';

// The System Design book, as its chapters run.
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
  { id: 's1', startPage: 1, endPage: 6 },
  { id: 's2', startPage: 7, endPage: 14 },
  { id: 's3', startPage: 15, endPage: 22 },
  { id: 's4', startPage: 23, endPage: 30 },
];

const ids = (rows: { topicId: string }[]) => rows.map((row) => row.topicId);

describe('only what is needed, and a little ahead', () => {
  it('a long chapter stands alone: from your page to its end, nothing else', () => {
    const ahead = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 55,
      written: new Set(),
    });
    expect(ahead).toEqual([{ topicId: 'c5', priority: 1, startAtPage: 55 }]);
  });

  it('within the runway of the end, the next chapter comes too, and only the next', () => {
    const edge = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 70 - RUNWAY_PAGES + 1,
      written: new Set(),
    });
    expect(ids(edge)).toEqual(['c5', 'c6']);
    expect(edge[1].startAtPage).toBeUndefined();
    const before = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 70 - RUNWAY_PAGES,
      written: new Set(),
    });
    expect(ids(before)).toEqual(['c5']);
  });

  it('a short chapter is prepared with the next, so the tape never runs dry', () => {
    const ahead = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 36,
      written: new Set(),
    });
    expect(ids(ahead)).toEqual(['c3', 'c4']);
    expect(ahead[0].startAtPage).toBe(36);
  });

  it('nothing behind is prepared', () => {
    const ahead = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 73,
      written: new Set(),
    });
    expect(ids(ahead)).not.toContain('c5');
  });

  it('on a small book: everything, ahead in order first, then the earlier chapters from the nearest back', () => {
    const ahead = chaptersAhead({
      topics: small,
      pageCount: WHOLE_BOOK_MAX_PAGES,
      page: 10,
      written: new Set(),
    });
    expect(ids(ahead)).toEqual(['s2', 's3', 's4', 's1']);
    expect(ahead[0].startAtPage).toBe(10);
    // A page over the line is a large book.
    expect(
      ids(
        chaptersAhead({
          topics: small,
          pageCount: WHOLE_BOOK_MAX_PAGES + 1,
          page: 10,
          written: new Set(),
        }),
      ),
    ).toEqual(['s2', 's3']);
  });

  it('leaves out what is written or on its way, and queues nothing when all is', () => {
    expect(
      ids(
        chaptersAhead({
          topics: big,
          pageCount: 269,
          page: 65,
          written: new Set(['c5']),
        }),
      ),
    ).toEqual(['c6']);
    expect(
      chaptersAhead({
        topics: big,
        pageCount: 269,
        page: 65,
        written: new Set(['c5', 'c6']),
      }),
    ).toEqual([]);
  });

  it('tops up as the lesson nears the end of a chapter, not as it enters one', () => {
    const entering = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 87,
      written: new Set(['c5', 'c6', 'c7']),
    });
    expect(entering).toEqual([]);
    const nearing = chaptersAhead({
      topics: big,
      pageCount: 269,
      page: 100,
      written: new Set(['c5', 'c6', 'c7']),
    });
    expect(ids(nearing)).toEqual(['c8']);
    expect(runwayDue(big[6], 87)).toBe(false);
    expect(runwayDue(big[6], 100)).toBe(true);
    expect(runwayDue(big[6], 109)).toBe(true);
  });

  it('front matter starts at the first chapter ahead, from its beginning, alone when it is long', () => {
    const ahead = chaptersAhead({
      topics: big.slice(1),
      pageCount: 269,
      page: 2,
      written: new Set(),
    });
    expect(ids(ahead)).toEqual(['c2']);
    expect(ahead[0].startAtPage).toBeUndefined();
    expect(
      chaptersAhead({ topics: [], pageCount: 10, page: 1, written: new Set() }),
    ).toEqual([]);
  });
});
