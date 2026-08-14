import type { ChatOrigin } from '../../../contracts';

/**
 * Turns a highlight press into the question the reader would have typed.
 *
 * Pressing "Explain" on a passage is a question with the words left out; this
 * puts them back, so the model sees a real question and the thread reads like
 * a conversation rather than a log of button presses. The reader's own
 * message keeps the raw passage — this expansion is for the model only.
 */
export function expandHighlight(
  action: ChatOrigin | undefined | null,
  selection: string,
): string {
  const passage = selection.trim();
  if (!action) return passage;

  const ask = {
    explain: [
      'Explain this passage from my document, in the sense the document uses',
      'it rather than as a standalone idea:',
    ].join(' '),
    simplify: [
      'Put this passage in simpler words, keeping every fact and every',
      'technical term:',
    ].join(' '),
    define: [
      'Define this term as my document uses it, then say in one sentence why',
      'it matters here:',
    ].join(' '),
    prerequisite: [
      'A chapter of my document assumes I already understand this, and I',
      "don't. Teach it to me from scratch, in plain language, assuming no",
      'background — and connect it to how my document uses it, so I can go',
      'back to the chapter and follow:',
    ].join(' '),
  }[action];

  return `${ask}\n\n"${passage}"`;
}
