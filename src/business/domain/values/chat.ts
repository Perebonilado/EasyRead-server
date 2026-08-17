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

/**
 * Words that carry no meaning on their own — the vocabulary of following on
 * rather than of asking. A turn made only of these cannot be searched for.
 */
const CONTINUATION =
  /^(yes|yeah|yep|yup|sure|ok|okay|please|go on|continue|carry on|more|tell me more|more please|and\??|why\??|how\??|how so|how come|really\??|explain|explain more|expand|elaborate|go deeper|say more|what about (it|that|this|them)|that one|the (first|second|third|last) one|both|it|that|this|no|nope)[\s.!?]*$/i;

/**
 * Does this turn depend on the one before it to mean anything?
 *
 * Retrieval embeds the reader's words and searches the document with them.
 * "yes" embeds to nothing in particular, so the search returns arbitrary
 * pages — and the model is then handed a wall of passages about the wrong
 * subject and asked to answer "yes". It sensibly replies that it doesn't
 * understand, which is how a perfectly good conversation falls over on its
 * easiest turn.
 *
 * Anything that matches here gets the previous turn's question folded into
 * the search text, and the previous answer's passages carried forward.
 */
export function isFollowUp(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (CONTINUATION.test(trimmed)) return true;

  // Short and anaphoric: "what about the second one?", "and the other two?".
  // Long questions carry their own subject and search perfectly well.
  if (trimmed.length > 80) return false;
  return /\b(it|that|this|these|those|them|they|the (other|same|second|third|last|rest))\b/i.test(
    trimmed,
  );
}
