import {
  chaptersFromBookmarks,
  chaptersFromHeadings,
  coveredChapters,
  headingOf,
  isChapterHeading,
  type Bookmark,
  type PageHeading,
} from './chapters';

const mark = (title: string, page: number | null, depth = 0): Bookmark => ({
  title,
  page,
  depth,
});
const spans = (
  chapters: { title: string; startPage: number; endPage: number }[] | null,
) => chapters?.map((c) => `${c.title} ${c.startPage}-${c.endPage}`) ?? null;

describe("a document's chapters from its bookmarks", () => {
  it('takes the top level, each chapter running to the next', () => {
    expect(
      spans(
        chaptersFromBookmarks(
          [mark('Cells', 1), mark('Membranes', 12), mark('Osmosis', 30)],
          40,
        ),
      ),
    ).toEqual(['Cells 1-11', 'Membranes 12-29', 'Osmosis 30-40']);
  });

  it('goes down a level when the top is only the book or a few parts', () => {
    const marks = [
      mark('Biology for Everyone', 1),
      mark('1 Cells', 3, 1),
      mark('2 Membranes', 15, 1),
      mark('3 Osmosis', 28, 1),
    ];
    expect(spans(chaptersFromBookmarks(marks, 40))).toEqual([
      '1 Cells 1-14',
      '2 Membranes 15-27',
      '3 Osmosis 28-40',
    ]);
    const parts = [
      mark('Part I', 1),
      mark('Chapter 1', 1, 1),
      mark('Chapter 2', 9, 1),
      mark('Part II', 20),
      mark('Chapter 3', 20, 1),
      mark('Chapter 4', 31, 1),
    ];
    expect(chaptersFromBookmarks(parts, 40)?.map((c) => c.title)).toEqual([
      'Chapter 1',
      'Chapter 2',
      'Chapter 3',
      'Chapter 4',
    ]);
  });

  it('keeps many front pages as their own chapter, and folds in a title page', () => {
    expect(
      spans(chaptersFromBookmarks([mark('One', 9), mark('Two', 20)], 30)),
    ).toEqual(['Opening pages 1-8', 'One 9-19', 'Two 20-30']);
    expect(
      spans(chaptersFromBookmarks([mark('One', 2), mark('Two', 20)], 30)),
    ).toEqual(['One 1-19', 'Two 20-30']);
  });

  it('leaves out entries that lead nowhere, and says nothing with too little or too much', () => {
    expect(
      spans(
        chaptersFromBookmarks(
          [mark('One', 1), mark('Lost', null), mark('Two', 5)],
          10,
        ),
      ),
    ).toEqual(['One 1-4', 'Two 5-10']);
    expect(chaptersFromBookmarks([mark('Only', 1)], 10)).toBeNull();
    expect(chaptersFromBookmarks([], 10)).toBeNull();
    const many = Array.from({ length: 90 }, (_, k) => mark(`S${k}`, k + 1));
    expect(chaptersFromBookmarks(many, 100)).toBeNull();
  });

  it('keeps pages in range and one chapter a start page', () => {
    expect(
      spans(
        coveredChapters(
          [
            { title: 'A', page: 1 },
            { title: 'B', page: 1 },
            { title: 'C', page: 99 },
          ],
          10,
        ),
      ),
    ).toEqual(['A 1-9', 'C 10-10']);
  });
});

const page = (
  n: number,
  lines: [string, number][],
  body = 11,
): PageHeading => ({
  page: n,
  body,
  lines: lines.map(([text, size]) => ({ text, size })),
});

describe("a document's chapters from its headings", () => {
  it('knows a chapter heading from a section heading', () => {
    for (const yes of [
      'Chapter 4',
      'CHAPTER FOUR',
      'Unit 3: Forces',
      'Part II',
      '4 Cell membranes',
      '4. Forces',
      'Lesson 12',
    ])
      expect(isChapterHeading(yes)).toBe(true);
    for (const no of ['4.1 Channels', 'Introduction', 'Figure 3', ''])
      expect(isChapterHeading(no)).toBe(false);
  });

  it('joins a bare "Chapter 4" to its title below, and ignores lines set at body size', () => {
    expect(
      headingOf(
        page(3, [
          ['Chapter 4', 24],
          ['Cell membranes', 20],
        ]),
      ),
    ).toBe('Chapter 4: Cell membranes');
    expect(headingOf(page(3, [['Chapter 4', 11]]))).toBeNull();
    expect(headingOf(page(3, [['4', 30]]))).toBeNull();
  });

  it('cuts the document where chapters open, and says nothing with fewer than two', () => {
    const pages = [
      page(1, [['A Book', 26]]),
      page(2, [
        ['Chapter 1', 22],
        ['Cells', 18],
      ]),
      page(9, [
        ['Chapter 2', 22],
        ['Membranes', 18],
      ]),
      page(14, [['2.1 Channels', 16]]),
    ];
    expect(spans(chaptersFromHeadings(pages, 20))).toEqual([
      'Chapter 1: Cells 1-8',
      'Chapter 2: Membranes 9-20',
    ]);
    expect(chaptersFromHeadings(pages.slice(0, 2), 20)).toBeNull();
  });
});
