/**
 * Only what is needed, and a little ahead.
 *
 * What to prepare from where the learner is: the chapter they are on,
 * from their page to its end, and the next chapter only when the pages
 * left in this one are within the runway, so the tape never runs dry
 * between two short chapters and a long chapter is never company for
 * three more. Nothing behind is prepared unless the learner goes there.
 * A small book is prepared whole from the first press, ahead in order
 * first. Chapters already written or being written are left alone.
 */

/** A book this long or shorter is prepared whole from the first press. */
export const WHOLE_BOOK_MAX_PAGES = 40;
/** With this many pages or fewer left in the chapter, the next one is prepared too. */
export const RUNWAY_PAGES = 10;

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
  if (wholeBook) {
    for (let step = 1; here + step < ordered.length; step += 1) {
      sequence.push({ index: here + step });
    }
    for (let step = 1; here - step >= 0; step += 1) {
      sequence.push({ index: here - step });
    }
  } else {
    // The pages left in this chapter, from the learner's page; a chapter
    // not yet entered counts whole.
    const current = ordered[here];
    const left = inChapter
      ? current.endPage - input.page + 1
      : current.endPage - current.startPage + 1;
    if (left <= RUNWAY_PAGES && here + 1 < ordered.length) {
      sequence.push({ index: here + 1 });
    }
  }
  return sequence
    .filter(({ index }) => !input.written.has(ordered[index].id))
    .map(({ index, startAtPage }, position) => ({
      topicId: ordered[index].id,
      priority: position + 1,
      ...(startAtPage ? { startAtPage } : {}),
    }));
}

/**
 * Whether the tape, on this page, is within the runway of its chapter's
 * end: the moment the next chapter is worth preparing.
 */
export function runwayDue(
  chapter: { startPage: number; endPage: number },
  page: number,
): boolean {
  return chapter.endPage - page + 1 <= RUNWAY_PAGES;
}
