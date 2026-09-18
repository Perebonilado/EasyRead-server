import { pagesWanted } from './visual-ahead';

const topics = [
  { id: 'a', startPage: 1, endPage: 12 },
  { id: 'b', startPage: 13, endPage: 30 },
  { id: 'c', startPage: 31, endPage: 60 },
];

describe('which pages a visuals request makes', () => {
  it('on a press, makes the chapter from the page and leaves out what is made', () => {
    const wanted = pagesWanted({
      mode: 'page',
      fromPage: 15,
      topics,
      pageCount: 60,
      have: new Set([15, 16]),
    });
    expect(wanted.map((w) => w.page).slice(0, 3)).toEqual([17, 18, 19]);
    expect(wanted.map((w) => w.page)).not.toContain(31);
    expect(wanted[wanted.length - 1].page).toBe(30);
  });

  it('on a press near the end of a chapter, the next chapter comes too', () => {
    const pages = pagesWanted({
      mode: 'page',
      fromPage: 25,
      topics,
      pageCount: 60,
      have: new Set(),
    }).map((w) => w.page);
    expect(pages.slice(0, 6)).toEqual([25, 26, 27, 28, 29, 30]);
    expect(pages).toContain(31);
    expect(pages[pages.length - 1]).toBe(60);
  });

  it('tops the runway up with the next chapter only, and only when due', () => {
    expect(
      pagesWanted({
        mode: 'ahead',
        fromPage: 15,
        topics,
        pageCount: 60,
        have: new Set(),
      }),
    ).toEqual([]);
    const pages = pagesWanted({
      mode: 'ahead',
      fromPage: 24,
      topics,
      pageCount: 60,
      have: new Set([31]),
    }).map((w) => w.page);
    expect(pages[0]).toBe(32);
    expect(pages[pages.length - 1]).toBe(60);
    expect(pages).not.toContain(24);
  });

  it('makes a whole book in order, and named pages as named', () => {
    const whole = pagesWanted({
      mode: 'whole',
      fromPage: 1,
      topics,
      pageCount: 60,
      have: new Set([1]),
    }).map((w) => w.page);
    expect(whole[0]).toBe(2);
    expect(whole).toHaveLength(59);
    expect(
      pagesWanted({
        mode: 'page',
        fromPage: 1,
        pages: [40, 3, 40, 99],
        topics,
        pageCount: 60,
        have: new Set(),
      }).map((w) => w.page),
    ).toEqual([40, 3]);
  });
});
