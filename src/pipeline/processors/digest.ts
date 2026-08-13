import type { PageText } from '../../business/repositories/document-page.repository';

/** Roughly a 12k-token budget — comfortably inside any current context window. */
const DIGEST_CHAR_BUDGET = 48_000;

/**
 * A whole-document sample that fits in one prompt.
 *
 * Long documents are sampled evenly rather than truncated at the front,
 * because the last chapter of a textbook matters as much as the first — a
 * head-truncated digest produces a summary that confidently describes only
 * chapter one (§4.4).
 */
export function buildDigest(
  pages: PageText[],
  budget = DIGEST_CHAR_BUDGET,
): string {
  const usable = pages.filter((page) => !page.isEmpty);
  if (!usable.length) return '';

  const perPage = Math.max(200, Math.floor(budget / usable.length));

  return usable
    .map(
      (page) => `[p.${page.pageNumber}] ${page.text.slice(0, perPage).trim()}`,
    )
    .join('\n\n');
}
