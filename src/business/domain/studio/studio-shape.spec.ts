/**
 * The film's shape on the brief (studio-vertical-plan §1.1): chosen on the
 * brief's Shape row, or heard by code in the maker's own words (the
 * producer's field second). Wide unless they say otherwise; never asked.
 */
import { briefOf, EMPTY_BRIEF } from './studio';
import { heardBrief, shapeNamed } from './studio-heard';

describe('the shape the maker’s words ask for', () => {
  it.each([
    ['Make it for TikTok', 'tall'],
    ['it’s for YouTube Shorts', 'tall'],
    ['Instagram Reels please', 'tall'],
    ['make it vertical', 'tall'],
    ['a vertical video about volcanoes', 'tall'],
    ['in portrait mode', 'tall'],
    ['so it fits my phone', 'tall'],
    ['9:16', 'tall'],
    ['Vertical', 'tall'],
    ['for YouTube', 'wide'],
    ['widescreen please', 'wide'],
    ['landscape format', 'wide'],
    ['Wide', 'wide'],
    ['for YouTube and TikTok', 'both'],
    ['wide and vertical', 'both'],
    ['both formats please', 'both'],
  ])('hears “%s” as %s', (words, shape) => {
    expect(shapeNamed(words)).toBe(shape);
  });

  it.each([
    'A painter who paints a portrait of her grandmother',
    'a boy in shorts and a t-shirt at the beach',
    'a snowy landscape at dawn',
    'a story about a phone call from far away',
    'a YouTuber who loses her channel',
    'a vertical cliff the goats climb',
    'Both',
    'not vertical',
  ])('hears no shape in “%s”', (words) => {
    expect(shapeNamed(words)).toBeNull();
  });

  it('holds the brief to the maker’s words over the producer’s, at any step', () => {
    const before = briefOf({ format: 'explainer', idea: 'volcanoes' });
    expect(
      heardBrief({
        said: { ...before, shape: 'wide' },
        before,
        words: 'can you make it for TikTok?',
        gathering: false,
      }).shape,
    ).toBe('tall');
    // Their words silent: the producer's field stands.
    expect(
      heardBrief({
        said: { ...before, shape: 'both' },
        before,
        words: 'sounds good',
        gathering: false,
      }).shape,
    ).toBeUndefined();
  });
});

describe('the brief’s shape', () => {
  it('is wide unless chosen, and says nothing of wide', () => {
    expect(briefOf({}).shape).toBeUndefined();
    expect(briefOf({ shape: 'wide' }).shape).toBeUndefined();
    expect(briefOf({ shape: 'tall' }).shape).toBe('tall');
    expect(briefOf({ shape: 'both' }).shape).toBe('both');
    // A stray word is nothing: the shape it had stands.
    expect(
      briefOf({ shape: 'square' }, { ...EMPTY_BRIEF, shape: 'tall' }).shape,
    ).toBe('tall');
    // Back to wide from tall.
    expect(
      briefOf({ shape: 'wide' }, { ...EMPTY_BRIEF, shape: 'tall' }).shape,
    ).toBeUndefined();
  });
});
