import { NOTES_RULE } from './reading-order';
import { storyText } from './story-text';

describe("a story page's own words", () => {
  it('drops a Bible page’s running head, verse numbers, footnote marks and notes', () => {
    const page = [
      'mattheW 8:3 18',
      'approached, and bowed low before him, saying, “Lord, if you are willing, you can make me',
      'clean.” 8:3 He stretched out his hand and touched',
      'him saying, “I am willing. Be clean!” Immediately',
      'Healing the Centurion’s Servant',
      '8:5 When he entered Capernaum, a centurion came to him asking for help:0 8:6 “Lord,',
      'my servant is lying at home.” He said, “I tell you the truth,0 I have not',
      'found such faith. Many will share the banquet, 8:1 but the sons of the kingdom',
      'will be thrown out.” And the birds in the sky0 have nests.',
      '0',
      '',
      NOTES_RULE,
      ' tn Grk “a leper approaching, bowed low before him, saying.”',
    ].join('\n');
    expect(storyText(page)).toBe(
      [
        'approached, and bowed low before him, saying, “Lord, if you are willing, you can make me clean.” He stretched out his hand and touched him saying, “I am willing. Be clean!” Immediately',
        'Healing the Centurion’s Servant',
        'When he entered Capernaum, a centurion came to him asking for help: “Lord, my servant is lying at home.” He said, “I tell you the truth, I have not found such faith. Many will share the banquet, but the sons of the kingdom will be thrown out.” And the birds in the sky have nests.',
      ].join('\n'),
    );
  });

  it('runs a children’s book’s short lines together, its quotes whole', () => {
    const page = [
      '“Did you hear that, James?”',
      'Mark said excitedly.',
      '“Sally just yelled for help.”',
      '“Keep yelling Sally,” James screamed.',
      'Sally heard her brother and',
      'kept screaming.',
    ].join('\n');
    // A line that opens a quote after one that closed a quote is a new
    // speaker's, as the book sets it.
    expect(storyText(page).split('\n')).toEqual([
      '“Did you hear that, James?” Mark said excitedly. “Sally just yelled for help.”',
      '“Keep yelling Sally,” James screamed. Sally heard her brother and kept screaming.',
    ]);
  });

  it('leaves a clock’s time alone on a page that is not numbered by verse', () => {
    expect(storyText('The bell rang at 3:15 and everyone ran.')).toBe(
      'The bell rang at 3:15 and everyone ran.',
    );
  });
});
