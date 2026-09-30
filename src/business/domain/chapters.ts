/**
 * A document's chapters as the document itself says them, before any
 * model is asked (studio-explainer-plan, Ask 7 §4): first its own
 * bookmarks (the PDF's outline, which most books and long reports carry),
 * then its headings (a line set large at the top of a page that reads
 * like a chapter's: "Chapter 4", "Unit 3: Forces", "4 Cell membranes").
 * Only when neither says enough is a model asked to read the chapters
 * from a digest, as before. Ground truth beats inference, and costs
 * nothing.
 *
 * Every chapter list here covers the document whole, in order, as the
 * reader's topics always have: each chapter runs to the page before the
 * next one starts, and the last to the end.
 */

/** One entry of a PDF's outline: its title, the page it opens (from 1), and how deep it sits. */
export interface Bookmark {
  title: string;
  /** Null when its destination could not be resolved to a page. */
  page: number | null;
  /** 0 for the outline's top level. */
  depth: number;
}

/** The lines set large on one page, top to bottom, with how large, beside the page's body text. */
export interface PageHeading {
  page: number;
  lines: { text: string; size: number }[];
  /** The size of the page's ordinary text. */
  body: number;
}

/** A chapter as the topics table keeps it. */
export interface ChapterDraft {
  title: string;
  shortDescription: string | null;
  startPage: number;
  endPage: number;
}

/** Where a document's chapters came from. */
export type ChapterSource = 'bookmarks' | 'headings';

/** The most chapters a document is cut into from its own outline: more, and they are sections, not chapters. */
export const CHAPTERS_MOST = 80;
/** A line this much larger than the body is a heading. */
export const HEADING_SCALE = 1.3;
/** Pages before the first chapter, more than this, are kept as a chapter of their own. */
const FRONT_PAGES = 2;

const clean = (text: string): string =>
  text
    // eslint-disable-next-line no-control-regex -- control characters are what it takes out
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Chapters from a list of starts: sorted, one a page (the first named
 * keeps it), each running to the page before the next. Pages before the
 * first start join it when they are a page or two (a title page), and are
 * their own "Opening pages" when there are more.
 */
export function coveredChapters(
  starts: { title: string; page: number }[],
  pageCount: number,
): ChapterDraft[] {
  if (pageCount < 1) return [];
  const sorted = starts
    .map((one) => ({
      title: clean(one.title).slice(0, 500),
      page: Math.min(pageCount, Math.max(1, Math.floor(one.page))),
    }))
    .filter((one) => one.title && Number.isFinite(one.page))
    .sort((a, b) => a.page - b.page);
  const distinct = sorted.filter(
    (one, k) => k === 0 || one.page > sorted[k - 1].page,
  );
  if (!distinct.length) return [];
  if (distinct[0].page - 1 > FRONT_PAGES)
    distinct.unshift({ title: 'Opening pages', page: 1 });
  else distinct[0].page = 1;
  return distinct.map((one, k) => ({
    title: one.title,
    shortDescription: null,
    startPage: one.page,
    endPage: k + 1 < distinct.length ? distinct[k + 1].page - 1 : pageCount,
  }));
}

/**
 * Chapters from a PDF's bookmarks. The top level, unless it is one entry
 * (the book's own title) or a few parts with the chapters beneath them:
 * then the level below, where the chapters are. Null when the outline
 * says too little (fewer than two chapters) or too much (more than
 * CHAPTERS_MOST at the level chosen: sections, not chapters).
 */
export function chaptersFromBookmarks(
  marks: readonly Bookmark[],
  pageCount: number,
): ChapterDraft[] | null {
  const placed = marks.filter(
    (one) => one.page !== null && one.page >= 1 && clean(one.title),
  );
  const at = (depth: number) => placed.filter((one) => one.depth === depth);
  const top = at(0);
  const below = at(1);
  const level =
    top.length < 3 && below.length >= Math.max(2, top.length + 1) ? below : top;
  if (level.length < 2 || level.length > CHAPTERS_MOST) return null;
  const chapters = coveredChapters(
    level.map((one) => ({ title: one.title, page: one.page! })),
    pageCount,
  );
  return chapters.length >= 2 ? chapters : null;
}

/** Words a chapter's heading opens with. */
const CHAPTER_WORD =
  /^(?:chapter|unit|part|module|lesson|topic|section|week|lecture|session|book)\s+(?:\d{1,3}|[ivxlc]{1,7}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/iu;
/** A numbered heading: "4 Cell membranes", "4. Forces", "12: Trade"; never "4.1 A section". */
const NUMBERED = /^\d{1,2}(?:[.:)]|\s)\s*\p{L}/u;
const SUB_NUMBERED = /^\d{1,2}\.\d/u;

/** Whether a line reads like a chapter's heading. */
export function isChapterHeading(text: string): boolean {
  const line = clean(text);
  if (line.length < 2 || line.length > 140) return false;
  if (CHAPTER_WORD.test(line)) return true;
  return NUMBERED.test(line) && !SUB_NUMBERED.test(line);
}

/** A heading that is only its number ("Chapter 4", "4"): its title is the line below. */
const BARE =
  /^(?:(?:chapter|unit|part|module|lesson|topic|section|week|lecture|session|book)\s+)?(?:\d{1,3}|[ivxlc]{1,7}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[.:]?$/iu;

/** The chapter heading a page opens with, if it has one: the first large line that reads like one, with its title when it stands on the line below. */
export function headingOf(page: PageHeading): string | null {
  const large = page.lines
    .map((line) => ({ text: clean(line.text), size: line.size }))
    .filter(
      (line) => line.text && line.size >= page.body * HEADING_SCALE - 0.01,
    );
  const k = large.findIndex(
    (line) => isChapterHeading(line.text) || BARE.test(line.text),
  );
  if (k < 0) return null;
  const line = large[k].text;
  if (BARE.test(line)) {
    const next = large[k + 1]?.text;
    if (!next || isChapterHeading(next))
      return CHAPTER_WORD.test(line) ? line : null;
    return `${line}${/[.:]$/.test(line) ? '' : ':'} ${next}`;
  }
  return line;
}

/**
 * Chapters from the headings set large on the pages. Null when fewer
 * than two pages open a chapter, or more than CHAPTERS_MOST do.
 */
export function chaptersFromHeadings(
  pages: readonly PageHeading[],
  pageCount: number,
): ChapterDraft[] | null {
  const starts = pages.flatMap((page) => {
    const title = headingOf(page);
    return title ? [{ title, page: page.page }] : [];
  });
  if (starts.length < 2 || starts.length > CHAPTERS_MOST) return null;
  const chapters = coveredChapters(starts, pageCount);
  return chapters.length >= 2 ? chapters : null;
}
