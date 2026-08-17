import { isFollowUp } from './chat';

/**
 * The cost of getting this wrong runs both ways: a missed follow-up searches
 * the document for "yes" and answers from arbitrary pages, while a false
 * positive drags an unrelated previous question into a fresh search.
 */
describe('isFollowUp', () => {
  it('catches bare acceptances — the turn that used to break the chat', () => {
    for (const text of [
      'yes',
      'Yes.',
      'yeah',
      'sure',
      'ok',
      'please',
      'yes!',
    ]) {
      expect(isFollowUp(text)).toBe(true);
    }
  });

  it('catches continuations and bare interrogatives', () => {
    for (const text of [
      'go on',
      'continue',
      'tell me more',
      'more',
      'why?',
      'how so',
      'elaborate',
      'explain more',
    ]) {
      expect(isFollowUp(text)).toBe(true);
    }
  });

  it('catches short anaphoric questions', () => {
    for (const text of [
      'what about the second one?',
      'why does it matter?',
      'how do they differ?',
      'is that the same as before?',
    ]) {
      expect(isFollowUp(text)).toBe(true);
    }
  });

  it('leaves questions that can stand on their own alone', () => {
    for (const text of [
      'What are the two hormones of the posterior pituitary?',
      'Explain iodide trapping',
      'What is ADH',
      'Summarise chapter three',
    ]) {
      expect(isFollowUp(text)).toBe(false);
    }
  });

  it('does not treat a long question as a follow-up just for saying "it"', () => {
    const long =
      'The document says thyroid peroxidase catalyses the coupling reaction — ' +
      'can you walk me through how it does that step by step, and what happens ' +
      'if the enzyme is missing?';
    expect(isFollowUp(long)).toBe(false);
  });

  it('ignores empty and whitespace-only input', () => {
    expect(isFollowUp('')).toBe(false);
    expect(isFollowUp('   ')).toBe(false);
  });
});
