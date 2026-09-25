import { NOTES_RULE } from './reading-order';
import { pageEnd, storyText } from './story-text';

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

  it('joins a word broken over a line with a footnote’s mark between its halves', () => {
    // As Matthew 5:18 comes out of its PDF: the mark set on a line of its own.
    const page = [
      'until heaven and earth pass',
      'away not the smallest letter or stroke of a let-',
      '\u00040',
      'ter will pass from the law.',
    ].join('\n');
    expect(storyText(page)).toBe(
      'until heaven and earth pass away not the smallest letter or stroke of a letter will pass from the law.',
    );
  });

  it('drops a verse number set on a line of its own', () => {
    // Matthew 9:18, as its PDF sets it.
    const page = [
      '9:16 No one sews a patch of unshrunk cloth.',
      '9:17 And no one pours new wine into old wineskins.',
      'As he was saying these things, a ruler',
      '9:18',
      'came, bowed low before him.',
    ].join('\n');
    expect(storyText(page)).toBe(
      'No one sews a patch of unshrunk cloth. And no one pours new wine into old wineskins. As he was saying these things, a ruler came, bowed low before him.',
    );
  });

  it('drops a running head wherever it stands', () => {
    // Matthew 10:8, a page read before its head was read first.
    const page = [
      'cleanse lepers, cast out',
      '\u00185 mattheW 10:16',
      'demons. Freely you received, freely give.',
    ].join('\n');
    expect(storyText(page)).toBe(
      'cleanse lepers, cast out demons. Freely you received, freely give.',
    );
  });

  it('ends no paragraph at a line of nothing but footnote marks', () => {
    // Matthew 8:12, as its PDF sets it: the marks on a line of their own.
    const page = [
      'will be thrown out into the outer darkness, where',
      '\u0004\u0004',
      'there will be weeping and gnashing of teeth.”',
    ].join('\n');
    expect(storyText(page)).toBe(
      'will be thrown out into the outer darkness, where there will be weeping and gnashing of teeth.”',
    );
  });

  it('ends a page on its last whole sentences', () => {
    const page =
      'Sally was scared. “Don’t be frightened,” he said. “I’ll have you out of here in no time.” Then he saw something wrapped in old blankets.';
    expect(pageEnd(page, 90)).toBe(
      '“I’ll have you out of here in no time.” Then he saw something wrapped in old blankets.',
    );
    expect(pageEnd('Short.\nPage.')).toBe('Short. Page.');
  });

  it('leaves a clock’s time alone on a page that is not numbered by verse', () => {
    expect(storyText('The bell rang at 3:15 and everyone ran.')).toBe(
      'The bell rang at 3:15 and everyone ran.',
    );
  });
});
