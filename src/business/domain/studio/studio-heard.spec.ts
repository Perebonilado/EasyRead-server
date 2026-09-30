import { briefOf } from './studio';
import {
  genreNamed,
  heardBrief,
  ideaFrom,
  leavesItToUs,
  toneNamed,
} from './studio-heard';

describe('the tone the maker names', () => {
  it.each([
    ['Dry and ironic', 'funny'],
    ['Deadpan', 'funny'],
    ['Chaotic', 'funny'],
    ['Calm and deadpan', 'funny'],
    ['Warm but silly', 'funny'],
    ['funny, not serious', 'funny'],
    ['Serious', 'serious'],
    ['Thrilling', 'exciting'],
    ['Warm and sweet', 'gentle'],
    ['Calm', 'calm'],
  ])('hears "%s" as %s', (words, tone) => {
    expect(toneNamed(words)).toBe(tone);
  });

  it('hears loose words only as an answer, never in a longer idea', () => {
    expect(
      toneNamed('A story about a dry desert town and its well'),
    ).toBeNull();
    expect(
      toneNamed('Two sisters open a café in a quiet village by the sea'),
    ).toBeNull();
    expect(toneNamed('Nothing too serious')).toBeNull();
    expect(toneNamed('A comedy about a cat who runs a bakery')).toBe('funny');
  });

  it('maps a tone the producer wrote in other words to the one it belongs to', () => {
    expect(briefOf({ tone: 'dry and ironic' }).tone).toBe('funny');
    expect(briefOf({ tone: 'deadpan' }).tone).toBe('funny');
    expect(briefOf({ tone: 'serious' }).tone).toBe('serious');
    expect(briefOf({ tone: 'nope' }).tone).toBeNull();
  });
});

describe('the genre the maker names', () => {
  it('hears a dark comedy before a comedy, and a genre written in words', () => {
    expect(genreNamed('A dark comedy for adults set in New York')).toBe(
      'dark-comedy',
    );
    expect(genreNamed('A comedy based in New York')).toBe('comedy');
    expect(genreNamed('a slice of life story')).toBe('slice-of-life');
    expect(genreNamed('A boy loses his dog')).toBeNull();
    expect(briefOf({ audience: 'adults', genre: 'dark comedy' }).genre).toBe(
      'dark-comedy',
    );
    // Never for children, however it is written.
    expect(briefOf({ audience: 'children', genre: 'dark comedy' }).genre).toBe(
      'comedy',
    );
  });
});

describe('an idea left to the Studio', () => {
  it('hears "you pick", "surprise me" and "up to you"', () => {
    for (const words of [
      'You pick the idea, keep it funny',
      'surprise me',
      "It's up to you",
      'your call',
      "I don't mind",
    ])
      expect(leavesItToUs(words)).toBe(true);
    expect(leavesItToUs('A girl picks apples')).toBe(false);
  });

  it('makes an idea of what is known', () => {
    expect(
      ideaFrom(
        briefOf({
          format: 'story',
          audience: 'adults',
          genre: 'dark-comedy',
          setting: 'New York',
        }),
      ),
    ).toBe('A dark comedy set in New York');
    expect(ideaFrom(briefOf({ format: 'story', tone: 'funny' }))).toBe(
      'A funny story',
    );
    expect(
      ideaFrom(briefOf({ genre: 'adventure', setting: 'in a castle' })),
    ).toBe('An adventure story set in a castle');
  });
});

describe('the brief held to the maker’s words', () => {
  const before = briefOf({
    format: 'story',
    audience: 'adults',
    minutes: 2,
    genre: 'dark-comedy',
  });

  it('never lets a comedy be serious unless the maker says so', () => {
    const said = briefOf({ tone: 'serious' }, before);
    expect(
      heardBrief({ said, before, words: 'Make it dark', gathering: true }).tone,
    ).toBe('funny');
    // Past the brief too: a comedy made serious by the producer alone.
    expect(
      heardBrief({
        said,
        before,
        words: 'make scene 2 darker',
        gathering: false,
      }).tone,
    ).toBe('funny');
    expect(
      heardBrief({ said, before, words: 'Serious, actually', gathering: true }),
    ).toEqual({});
  });

  it('keeps a dark comedy dark on a loose "comedy", and lightens it only when asked', () => {
    const said = briefOf({ genre: 'comedy' }, before);
    expect(
      heardBrief({
        said,
        before,
        words: 'A comedy based in New York',
        gathering: true,
      }).genre,
    ).toBe('dark-comedy');
    expect(
      heardBrief({
        said,
        before,
        words: 'Make it a regular comedy, not dark',
        gathering: true,
      }).genre,
    ).toBeUndefined();
  });

  it('gives a comedy with no tone a funny one', () => {
    expect(
      heardBrief({ said: before, before, words: 'For adults', gathering: true })
        .tone,
    ).toBe('funny');
  });

  it('leaves what the producer made of it when the words name nothing', () => {
    const plain = briefOf({ format: 'story' });
    const said = briefOf(
      { idea: 'A boy loses his dog', tone: 'gentle' },
      plain,
    );
    expect(
      heardBrief({
        said,
        before: plain,
        words: 'A boy loses his dog in the market',
        gathering: true,
      }),
    ).toEqual({});
  });
});
