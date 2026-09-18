/**
 * Which pages to make for a visuals request. Three ways in: the one
 * press on a page, the runway topping itself up, and a whole book. The
 * lecture's rule for chapters ahead is reused; what is already made or
 * being made is never asked for again.
 */
import { chaptersAhead, runwayDue, type AheadTopic } from './lecture-ahead';

export type VisualsMode = 'page' | 'ahead' | 'whole';

export interface WantedPage {
  page: number;
  priority: number;
}

/**
 * The pages a request wants, in the order they should be made.
 *
 * - `page`: the learner's chapter from their page, and the next chapter
 *   when the runway is short; a small book whole. Teach me's first press.
 * - `ahead`: only what lies beyond the chapter the learner is in, when
 *   they are within the runway of its end. The tape's top-up.
 * - `whole`: every page, in order.
 * - `pages`: the pages named, in that order.
 *
 * Pages already made, or being made, are left out; chapters with any
 * page made are told to the lecture's rule as written, so it moves on.
 */
export function pagesWanted(input: {
  mode: VisualsMode;
  fromPage: number;
  pages?: number[];
  topics: AheadTopic[];
  pageCount: number;
  /** Pages with a row already, done or on its way. */
  have: Set<number>;
}): WantedPage[] {
  const { topics, pageCount } = input;
  const ordered = [...topics].sort((a, b) => a.startPage - b.startPage);
  const from = Math.max(1, Math.min(pageCount, input.fromPage));
  const wanted: WantedPage[] = [];
  const push = (page: number) => {
    if (page < 1 || page > pageCount || input.have.has(page)) return;
    if (wanted.some((w) => w.page === page)) return;
    wanted.push({ page, priority: wanted.length + 1 });
  };
  if (input.pages?.length) {
    for (const page of input.pages) push(page);
    return wanted;
  }
  if (input.mode === 'whole') {
    for (const topic of ordered)
      for (let page = topic.startPage; page <= topic.endPage; page += 1)
        push(page);
    return wanted;
  }
  const here = ordered.find((t) => from >= t.startPage && from <= t.endPage);
  if (input.mode === 'ahead') {
    if (!here || !runwayDue(here, from)) return wanted;
    const next = ordered.find((t) => t.startPage > here.endPage);
    if (!next) return wanted;
    for (let page = next.startPage; page <= next.endPage; page += 1) push(page);
    return wanted;
  }
  const written = new Set(
    ordered
      .filter((t) => {
        for (let page = t.startPage; page <= t.endPage; page += 1)
          if (input.have.has(page)) return true;
        return false;
      })
      .map((t) => t.id),
  );
  // The chapter the learner is in is always asked from their page, even
  // when earlier pages of it were made before.
  const ahead = chaptersAhead({
    topics: ordered,
    pageCount,
    page: from,
    written: new Set([...written].filter((id) => id !== here?.id)),
  });
  for (const chapter of ahead) {
    const topic = ordered.find((t) => t.id === chapter.topicId);
    if (!topic) continue;
    const start = chapter.startAtPage ?? topic.startPage;
    for (let page = start; page <= topic.endPage; page += 1) push(page);
  }
  return wanted;
}
