import { ValidationError } from '../errors/errors';

/** A note is a paragraph or two, not an essay — but never truncate it. */
export const MAX_NOTE_BODY = 5000;

/**
 * The quoted passage is context, not content: a reader can select half a
 * page, and refusing the save because of it would lose the note. Long
 * selections are trimmed to the part that identifies the passage.
 */
export const MAX_NOTE_QUOTE = 600;

/**
 * The reader's own words, tidied but not rewritten.
 *
 * Trailing whitespace goes (an empty line at the end of a textarea is not
 * something anyone meant to type) and blank runs collapse to one, so a note
 * pasted out of a chat reply doesn't arrive with gaps. Everything else — line
 * breaks, spelling, capitals — is left exactly as written.
 */
export function noteBody(input: string): string {
  const body = input
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!body) throw new ValidationError('A note needs something in it');
  if (body.length > MAX_NOTE_BODY) {
    throw new ValidationError(
      `A note can be up to ${MAX_NOTE_BODY} characters`,
    );
  }
  return body;
}

/** The passage a note was written against, collapsed to a single line. */
export function noteQuote(input: string | null | undefined): string | null {
  if (!input) return null;
  const quote = input.replace(/\s+/g, ' ').trim();
  if (!quote) return null;
  return quote.length > MAX_NOTE_QUOTE
    ? `${quote.slice(0, MAX_NOTE_QUOTE).trimEnd()}…`
    : quote;
}

/**
 * The page a note belongs to, or null.
 *
 * Null is a real answer here — a note taken in a lesson, or about the
 * document as a whole, has no page — so anything that isn't a usable page
 * number becomes null rather than an error. `pageCount` is checked when the
 * caller knows it: a note can't point at a page the document doesn't have.
 */
export function notePage(
  input: number | null | undefined,
  pageCount?: number,
): number | null {
  if (input === null || input === undefined) return null;
  if (!Number.isInteger(input) || input < 1) return null;
  if (pageCount !== undefined && input > pageCount) return null;
  return input;
}
