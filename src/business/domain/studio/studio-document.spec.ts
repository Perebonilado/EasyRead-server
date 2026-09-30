import type { ChapterNotes, PageNotes } from '../lesson-notes';
import {
  EPISODE_PAGES,
  audienceOfDocument,
  briefDocumentOf,
  clampRanges,
  firstPages,
  labelOf,
  minutesFor,
  notesBudget,
  notesForOutline,
  offersSeries,
  pagesIn,
  pickOf,
  pickPages,
  scenePages,
  seriesOf,
  type Chapter,
} from './studio-document';

const chapters: Chapter[] = [
  { id: 't0', title: 'Opening pages', from: 1, to: 4 },
  { id: 't1', title: 'Chapter 1: What a cell is', from: 5, to: 20 },
  {
    id: 't2',
    title: 'Chapter 2: Membranes',
    from: 21,
    to: 40,
    about: 'Lipid bilayers and channels.',
  },
  { id: 't3', title: 'Chapter 3: Osmosis and diffusion', from: 41, to: 58 },
  { id: 't4', title: 'Chapter 4: Cell division', from: 59, to: 130 },
];

describe('which pages the maker chooses, in words', () => {
  const pick = (words: string) => pickPages(words, chapters, 130);

  it('hears a chapter by its number, in the ways people say it', () => {
    for (const words of [
      'chapter 3',
      'Ch. 3 please',
      'do chap 3',
      'the third chapter',
      'chapter three',
    ])
      expect(pick(words)).toEqual({
        ranges: [[41, 58]],
        topicIds: ['t3'],
        how: 'chapters',
      });
  });

  it('hears two chapters, and a run of them', () => {
    expect(pick('chapters 1 and 3')).toMatchObject({
      ranges: [
        [5, 20],
        [41, 58],
      ],
      topicIds: ['t1', 't3'],
    });
    expect(pick('chapters 1-3')).toMatchObject({
      ranges: [[5, 58]],
      topicIds: ['t1', 't2', 't3'],
    });
    expect(pick('the last chapter')).toMatchObject({ topicIds: ['t4'] });
  });

  it('counts chapters by their titles, not by an opening that is not one', () => {
    const plain: Chapter[] = [
      { id: 'a', title: 'Opening pages', from: 1, to: 3 },
      { id: 'b', title: 'Cells', from: 4, to: 9 },
      { id: 'c', title: 'Membranes', from: 10, to: 20 },
    ];
    expect(pickPages('chapter 1', plain, 20)?.topicIds).toEqual(['b']);
  });

  it('hears pages, however they are written', () => {
    for (const words of [
      'pages 40-55',
      'pages 40–55',
      'p. 40 to 55',
      'pp 40-55',
      'from page 40 to page 55',
    ])
      expect(pick(words)).toEqual({
        ranges: [[40, 55]],
        topicIds: [],
        how: 'pages',
      });
    expect(pick('just page 12')).toEqual({
      ranges: [[12, 12]],
      topicIds: [],
      how: 'pages',
    });
    // Backwards, and past the end, kept within the document.
    expect(pick('pages 140 to 120')).toEqual({
      ranges: [[120, 130]],
      topicIds: [],
      how: 'pages',
    });
  });

  it('hears a subject by the chapter it names', () => {
    expect(pick('the part about osmosis')).toMatchObject({
      topicIds: ['t3'],
      how: 'subject',
    });
    expect(pick('the membranes bit')).toMatchObject({ topicIds: ['t2'] });
    expect(pick('can you explain channels')).toMatchObject({
      topicIds: ['t2'],
    });
    expect(pick('cell division')).toMatchObject({ topicIds: ['t4'] });
  });

  it('chooses nothing when the words choose nothing it has', () => {
    expect(pick('make it funny')).toBeNull();
    expect(pick('chapter 9')).toBeNull();
    expect(pick('the part about photosynthesis')).toBeNull();
    // "cell" is in two chapters' titles: not clearly either.
    expect(pick('the cell part')).toBeNull();
  });
});

describe('ranges kept sound', () => {
  it('clamps to the document, orders, and joins what touches', () => {
    expect(
      clampRanges([[50, 40], [0, 3], [4, 6], [120, 999], ['x', 2], [30]], 130),
    ).toEqual([
      [1, 6],
      [30, 30],
      [40, 50],
      [120, 130],
    ]);
    expect(clampRanges('pages', 10)).toEqual([]);
    expect(clampRanges([[1, 5]], 0)).toEqual([]);
  });

  it('cuts to an episode’s most pages, and counts them', () => {
    const cut = firstPages([
      [1, 50],
      [60, 80],
    ]);
    expect(cut).toEqual([
      [1, 50],
      [60, 69],
    ]);
    expect(pagesIn(cut)).toBe(EPISODE_PAGES);
  });

  it('makes an episode’s pages sound as kept', () => {
    expect(
      pickOf({ ranges: [[9, 3]], topicIds: ['t1', 5], label: '' }),
    ).toEqual({
      ranges: [[3, 9]],
      topicIds: ['t1'],
      label: 'Pages 3–9',
    });
    expect(pickOf({ ranges: [] })).toBeNull();
    expect(briefDocumentOf({ documentId: 'd', pageCount: 0 })).toBeUndefined();
    expect(
      briefDocumentOf({ documentId: 'd', title: 'Bio', pageCount: 10 }),
    ).toEqual({
      documentId: 'd',
      title: 'Bio',
      pageCount: 10,
      ranges: [],
      topicIds: [],
      label: '',
    });
  });

  it('says what was chosen', () => {
    expect(labelOf([[41, 58]], ['t3'], chapters)).toBe(
      'Chapter 3: Osmosis and diffusion',
    );
    expect(labelOf([[41, 58]], [], chapters)).toBe('Pages 41–58');
    expect(labelOf([[12, 12]], [], chapters)).toBe('Page 12');
  });

  it('reckons a film’s length from its pages', () => {
    expect(minutesFor(1)).toBe(1);
    expect(minutesFor(5)).toBe(2.5);
    expect(minutesFor(18)).toBe(4);
    expect(minutesFor(60)).toBe(5);
  });
});

describe('a series', () => {
  it('is one episode a chapter, of only the pages chosen', () => {
    const series = seriesOf([[10, 58]], chapters);
    expect(series.map((e) => [e.label, e.ranges, e.topicIds])).toEqual([
      ['Chapter 1: What a cell is', [[10, 20]], ['t1']],
      ['Chapter 2: Membranes', [[21, 40]], ['t2']],
      ['Chapter 3: Osmosis and diffusion', [[41, 58]], ['t3']],
    ]);
    expect(offersSeries([[10, 58]], chapters)).toBe(true);
    expect(offersSeries([[41, 58]], chapters)).toBe(false);
  });

  it('takes a chapter longer than an episode in parts', () => {
    const series = seriesOf([[59, 130]], chapters);
    expect(series.map((e) => e.label)).toEqual([
      'Chapter 4: Cell division (part 1)',
      'Chapter 4: Cell division (part 2)',
    ]);
    for (const e of series)
      expect(pagesIn(e.ranges)).toBeLessThanOrEqual(EPISODE_PAGES);
    expect(series.flatMap((e) => e.ranges)).toEqual([
      [59, 94],
      [95, 130],
    ]);
  });

  it('cuts pages in no chapter into films, and is at most twelve', () => {
    expect(seriesOf([[1, 70]], []).map((e) => e.ranges)).toEqual([
      [[1, 30]],
      [[31, 60]],
      [[61, 70]],
    ]);
    const many: Chapter[] = Array.from({ length: 20 }, (_, k) => ({
      id: `c${k}`,
      title: `Chapter ${k + 1}`,
      from: k * 5 + 1,
      to: k * 5 + 5,
    }));
    const series = seriesOf([[1, 100]], many);
    expect(series).toHaveLength(12);
    expect(series[0].topicIds).toEqual(['c0']);
  });
});

const notesPage = (page: number, ideas: number): PageNotes => ({
  page,
  relation: 'fresh',
  evidence: '',
  goal: `Say what page ${page} teaches about osmosis and water moving across membranes`,
  newHere: ['osmosis', 'solute'],
  callback: null,
  points: Array.from({ length: ideas }, (_, k) => ({
    say: `Idea ${k + 1} of page ${page}: water moves from where there is more of it to where there is less, through the membrane`,
    show: 'two tanks and a membrane',
    kind: 'explain' as const,
  })),
  lists: [],
  pitfall: 'thinking the solute moves',
  check: null,
  handoff: null,
  endsOn: [],
});

describe("teacher's notes held to what the outline can use", () => {
  const notes = (pages: number, ideas: number): ChapterNotes => ({
    version: 2,
    topicId: 'studio',
    from: 1,
    to: pages,
    thread: 'How does water cross a membrane?',
    example: 'a raisin in water',
    diagram: 'two tanks',
    pictures: [],
    pages: Array.from({ length: pages }, (_, k) => notesPage(k + 1, ideas)),
  });
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

  it('keeps every idea when there is room', () => {
    const text = notesForOutline(notes(3, 3), 2000);
    expect(text).toContain('[page 3]');
    expect(text).toContain('Idea 3 of page 3');
    expect(text).toContain('How does water cross a membrane?');
  });

  it('never runs past its budget, however long the pages', () => {
    for (const [pages, ideas, budget] of [
      [20, 10, 400],
      [60, 10, 1800],
      [60, 10, 400],
      [5, 2, 50],
    ])
      expect(
        words(notesForOutline(notes(pages, ideas), budget)),
      ).toBeLessThanOrEqual(budget);
    // Over the budget, each page keeps fewer ideas before any page is lost.
    const tight = notesForOutline(notes(20, 10), 1200);
    expect(tight).toContain('[page 20]');
    expect(tight).not.toContain('Idea 10 of page 1');
  });

  it('is about twice what the film can say', () => {
    expect(notesBudget(3)).toBe(1080);
    expect(notesBudget(0.5)).toBe(400);
  });

  it('leaves out pages with nothing to teach', () => {
    const some = notes(2, 1);
    some.pages[0] = { ...some.pages[0], relation: 'skip' };
    expect(notesForOutline(some, 1000)).not.toContain('[page 1]');
  });
});

describe('each scene tied to its pages', () => {
  it('keeps the writer’s pages within those chosen', () => {
    expect(
      scenePages(
        [
          { seconds: 30, pages: [41, 45] },
          { seconds: 30, pages: [44, 90] },
        ],
        [[41, 58]],
      ),
    ).toEqual([
      [41, 45],
      [44, 58],
    ]);
  });

  it('shares the pages out by length when the writer gave none', () => {
    expect(
      scenePages(
        [{ seconds: 20 }, { seconds: 40 }, { seconds: 30, pages: null }],
        [[1, 9]],
      ),
    ).toEqual([
      [1, 2],
      [3, 6],
      [7, 9],
    ]);
    // More scenes than pages: every scene still has a page.
    const tied = scenePages(
      [{ seconds: 30 }, { seconds: 30 }, { seconds: 30 }],
      [[5, 6]],
    );
    for (const [from, to] of tied) {
      expect(from).toBeGreaterThanOrEqual(5);
      expect(to).toBeLessThanOrEqual(6);
      expect(to).toBeGreaterThanOrEqual(from);
    }
  });
});

describe('whom a document is for, from its own words', () => {
  it('reads a level its title names', () => {
    expect(audienceOfDocument('Science for Grade 5', '')).toMatchObject({
      band: 'primary-upper',
    });
  });

  it('reads a level its pages name clearly', () => {
    const who = audienceOfDocument(
      'Cell Biology',
      'Lecture notes for first-year university students. Semester 1.',
    );
    expect(who?.band).toBe('university');
  });

  it('guesses nothing from a document that names no level', () => {
    expect(
      audienceOfDocument('Cells', 'Cells are small. Lagos is a city.'),
    ).toBeUndefined();
  });
});
