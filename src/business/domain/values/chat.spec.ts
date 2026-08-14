import { expandHighlight } from './chat';

describe('expandHighlight', () => {
  it('leaves a typed question exactly as the reader wrote it', () => {
    expect(expandHighlight(null, 'Why does ADH raise blood pressure?')).toBe(
      'Why does ADH raise blood pressure?',
    );
    expect(expandHighlight(undefined, '  trimmed  ')).toBe('trimmed');
  });

  it('asks each highlight action as its own question', () => {
    const explain = expandHighlight('explain', 'the countercurrent mechanism');
    const define = expandHighlight('define', 'the countercurrent mechanism');
    const simplify = expandHighlight('simplify', 'the countercurrent mechanism');

    expect(explain).not.toBe(define);
    expect(define).not.toBe(simplify);
    // Every one of them carries the passage, quoted.
    for (const question of [explain, define, simplify]) {
      expect(question).toContain('"the countercurrent mechanism"');
    }
  });

  it('keeps the answer inside the document rather than the world', () => {
    // The whole point of Define here is the document's sense of a term, not
    // the dictionary's — losing that wording loses the feature.
    expect(expandHighlight('define', 'induction')).toContain(
      'as my document uses it',
    );
    expect(expandHighlight('explain', 'induction')).toContain(
      'rather than as a standalone idea',
    );
  });

  it('tells simplify not to drop the terms the reader is examined on', () => {
    expect(expandHighlight('simplify', 'osmolality')).toContain(
      'keeping every fact and every technical term',
    );
  });
});
