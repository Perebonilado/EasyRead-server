/**
 * Always a chapter ahead.
 *
 * What to prepare from where the learner is, so the page after the one
 * they are hearing is always ready. The chapter they are on comes first,
 * from their page; then the chapters ahead; then, on a small book, the
 * rest of it, and on a large one only the chapter behind. Chapters
 * already written or being written are left alone.
 */

/** A book this long or shorter is prepared whole from the first press. */
export const WHOLE_BOOK_MAX_PAGES = 100;
/** On a large book, how many chapters past the current one are kept ready. */
export const CHAPTERS_AHEAD = 2;

export interface AheadTopic {
  id: string;
  startPage: number;
  endPage: number;
}

export interface AheadChapter {
  topicId: string;
  /** Lower is sooner; the chapter the learner is in is 1. */
  priority: number;
  /** The current chapter starts writing at the learner's page. */
  startAtPage?: number;
}

export function chaptersAhead(input: {
  topics: AheadTopic[];
  pageCount: number;
  page: number;
  /** Chapters with a lecture already, written or on its way. */
  written: Set<string>;
}): AheadChapter[] {
  const ordered = [...input.topics].sort((a, b) => a.startPage - b.startPage);
  if (!ordered.length) return [];
  let here = ordered.findIndex(
    (topic) => input.page >= topic.startPage && input.page <= topic.endPage,
  );
  // Front matter or a gap: the nearest chapter ahead stands in, from its start.
  const inChapter = here >= 0;
  if (!inChapter) {
    here = ordered.findIndex((topic) => topic.startPage > input.page);
    if (here < 0) here = 0;
  }
  const wholeBook = input.pageCount <= WHOLE_BOOK_MAX_PAGES;
  const sequence: { index: number; startAtPage?: number }[] = [];
  sequence.push({
    index: here,
    startAtPage: inChapter ? input.page : undefined,
  });
  const aheadCount = wholeBook ? ordered.length : CHAPTERS_AHEAD;
  for (
    let step = 1;
    step <= aheadCount && here + step < ordered.length;
    step += 1
  ) {
    sequence.push({ index: here + step });
  }
  const behindCount = wholeBook ? ordered.length : 1;
  for (let step = 1; step <= behindCount && here - step >= 0; step += 1) {
    sequence.push({ index: here - step });
  }
  return sequence
    .filter(({ index }) => !input.written.has(ordered[index].id))
    .map(({ index, startAtPage }, position) => ({
      topicId: ordered[index].id,
      priority: position + 1,
      ...(startAtPage ? { startAtPage } : {}),
    }));
}
