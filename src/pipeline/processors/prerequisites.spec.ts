import { isOwnSubject } from './topics.processor';

/**
 * A chapter's own subject offered as its prerequisite is the one model
 * failure the prompt could not train away, so it is enforced here. The
 * dangerous direction is over-blocking: dropping a real outside concept
 * because it shares a word with the title.
 */
describe('isOwnSubject', () => {
  it('catches the observed failures', () => {
    expect(
      isOwnSubject('thyroid hormone synthesis', 'Thyroid Hormone Biosynthesis'),
    ).toBe(true);
    expect(
      isOwnSubject(
        'how thyroid hormones affect metabolism',
        'Metabolism of Thyroid Hormones',
      ),
    ).toBe(true);
    expect(
      isOwnSubject(
        'the process of tokenization',
        'Lexical Analysis and Tokenization',
      ),
    ).toBe(true);
  });

  it('keeps genuine prerequisites that share vocabulary lightly', () => {
    expect(
      isOwnSubject('the role of ADH in fluid balance', 'Diabetes Insipidus'),
    ).toBe(false);
    expect(isOwnSubject('context-free grammars', 'Syntax Analysis')).toBe(
      false,
    );
    expect(
      isOwnSubject(
        'data structures used in compiler design',
        'The Structure of a Compiler',
      ),
    ).toBe(false);
    expect(
      isOwnSubject(
        'weak acid-base chemistry',
        'Buffers: The First Line of Defense',
      ),
    ).toBe(false);
  });
});
