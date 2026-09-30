import { PdfjsToolkitAdapter } from './pdfjs-toolkit.adapter';
import { testPdf, type TestPage } from './test-pdf';
import {
  chaptersFromBookmarks,
  chaptersFromHeadings,
} from '../../business/domain/chapters';

/**
 * A document's own chapters, read by pdf.js from a PDF written for the
 * test: its bookmarks where it has them, and the headings set large on
 * its pages where it does not.
 */
const body = (n: number): TestPage => ({
  lines: [
    `This is page ${n}. Cells are the smallest units of life, and every living thing is made of one or more of them.`,
  ],
});
const book = (): TestPage[] => [
  { heading: 'Biology Basics', lines: ['A short book about cells.'] },
  { heading: 'Chapter 1', lines: ['What a cell is.'] },
  body(3),
  {
    heading: 'Chapter 2: Membranes',
    lines: ['The membrane lets some things in.'],
  },
  body(5),
  body(6),
  {
    heading: 'Chapter 3: Osmosis',
    lines: ['Water moves across the membrane.'],
  },
  body(8),
];

describe('a PDF read for its own chapters', () => {
  const pdf = new PdfjsToolkitAdapter();

  it('reads its bookmarks with the pages they open', async () => {
    const bytes = testPdf(book(), [
      { title: 'Cover', page: 1 },
      { title: 'Chapter 1: Cells', page: 2 },
      {
        title: 'Chapter 2: Membranes',
        page: 4,
        children: [{ title: '2.1 Channels', page: 5 }],
      },
      { title: 'Chapter 3: Osmosis', page: 7 },
    ]);
    const marks = await pdf.bookmarks(bytes);
    expect(marks).toEqual([
      { title: 'Cover', page: 1, depth: 0 },
      { title: 'Chapter 1: Cells', page: 2, depth: 0 },
      { title: 'Chapter 2: Membranes', page: 4, depth: 0 },
      { title: '2.1 Channels', page: 5, depth: 1 },
      { title: 'Chapter 3: Osmosis', page: 7, depth: 0 },
    ]);
    expect(chaptersFromBookmarks(marks, 8)).toEqual([
      expect.objectContaining({ title: 'Cover', startPage: 1, endPage: 1 }),
      expect.objectContaining({
        title: 'Chapter 1: Cells',
        startPage: 2,
        endPage: 3,
      }),
      expect.objectContaining({
        title: 'Chapter 2: Membranes',
        startPage: 4,
        endPage: 6,
      }),
      expect.objectContaining({
        title: 'Chapter 3: Osmosis',
        startPage: 7,
        endPage: 8,
      }),
    ]);
  });

  it('finds no bookmarks in a PDF without them, and reads its headings instead', async () => {
    const bytes = testPdf(book());
    expect(await pdf.bookmarks(bytes)).toEqual([]);
    const headings = await pdf.headings(bytes);
    expect(headings.map((h) => h.page)).toEqual([1, 2, 4, 7]);
    expect(headings[1].lines[0]).toMatchObject({ text: 'Chapter 1' });
    expect(headings[1].lines[0].size).toBeGreaterThan(headings[1].body * 1.3);
    const chapters = chaptersFromHeadings(headings, 8);
    expect(chapters?.map((c) => [c.title, c.startPage, c.endPage])).toEqual([
      // A bare "Chapter 1" takes nothing below it that is not large.
      ['Chapter 1', 1, 3],
      ['Chapter 2: Membranes', 4, 6],
      ['Chapter 3: Osmosis', 7, 8],
    ]);
  });

  it('never throws on bytes that are not a PDF', async () => {
    const junk = Buffer.from('not a pdf at all');
    await expect(pdf.bookmarks(junk)).resolves.toEqual([]);
    await expect(pdf.headings(junk)).resolves.toEqual([]);
  });

  it('reads the text of the pages it wrote', async () => {
    const pages = await pdf.extractPages(testPdf(book()));
    expect(pages).toHaveLength(8);
    expect(pages[2].text).toContain('This is page 3.');
  });
});
