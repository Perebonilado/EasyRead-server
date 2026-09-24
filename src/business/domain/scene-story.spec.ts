import { profileOf } from './scene-profile';
import type { SceneScript } from './scene-script';
import {
  castStory,
  charactersOn,
  describeStory,
  mergeStory,
  moodBefore,
  nameKey,
  sheetThing,
  storyPieces,
  type StoryDraft,
} from './scene-story';

const draft = (over: Partial<StoryDraft>): StoryDraft => ({
  characters: [],
  places: [],
  pages: [],
  ...over,
});

const person = (
  name: string,
  over: Partial<StoryDraft['characters'][number]> = {},
): StoryDraft['characters'][number] => ({
  name,
  aliases: [],
  role: 'main',
  look: '',
  traits: [],
  voice: null,
  ...over,
});

describe("a story's continuity", () => {
  it('knows a name by its words, not its case, accents or title', () => {
    expect(nameKey('Mr. Tobi Arden')).toBe('tobi arden');
    expect(nameKey('Zoë')).toBe('zoe');
    expect(nameKey('The Fox')).toBe('fox');
    // A title alone is still a name.
    expect(nameKey('Miss')).toBe('miss');
  });

  it('merges what each stretch says into one cast: by name, alias, or the one fuller name', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 10,
        draft: draft({
          characters: [
            person('Mira', {
              look: 'a girl in a yellow raincoat',
              traits: ['brave'],
            }),
            person('Grandpa Tobi', { aliases: ['Tobi'], role: 'supporting' }),
          ],
          pages: [
            {
              page: 2,
              summary: 'Mira waits.',
              present: [{ name: 'Mira', mood: 'happy' }],
              place: null,
            },
            {
              page: 4,
              summary: 'The storm.',
              present: [
                { name: 'Mira', mood: 'afraid' },
                { name: 'Tobi', mood: 'thinking' },
              ],
              place: null,
            },
          ],
        }),
      },
      {
        from: 11,
        to: 20,
        draft: draft({
          characters: [
            // The same girl, said more of; the same grandfather by his alias.
            person('Mira Arden', {
              look: 'a girl of nine in a yellow raincoat and red boots',
              traits: ['brave', 'stubborn'],
            }),
            person('Tobi', { role: 'main' }),
            person('Ember', { role: 'supporting', traits: ['sly'] }),
          ],
          pages: [
            {
              page: 12,
              summary: 'A fox.',
              present: [
                { name: 'Ember', mood: 'surprised' },
                { name: 'Mira Arden', mood: 'surprised' },
              ],
              place: null,
            },
          ],
        }),
      },
    ]);
    expect(bible.characters.map((c) => c.id)).toEqual([
      'mira',
      'grandpa-tobi',
      'ember',
    ]);
    const [mira, tobi, ember] = bible.characters;
    expect(mira.aliases).toContain('Mira Arden');
    expect(mira.look).toBe('a girl of nine in a yellow raincoat and red boots');
    expect(mira.traits).toEqual(['brave', 'stubborn']);
    // Where the book first has them on a page, not where they were first named.
    expect(mira.firstPage).toBe(2);
    expect(tobi.firstPage).toBe(4);
    expect(tobi.role).toBe('main');
    expect(ember.firstPage).toBe(12);
    // Each has their place in the order the book meets them.
    expect(bible.characters.map((c) => c.met)).toEqual([0, 1, 2]);
    expect(
      bible.pages.find((p) => p.page === 12)!.present.map((p) => p.id),
    ).toEqual(['ember', 'mira']);
  });

  it('keeps the characters a book cannot do without when there are too many', () => {
    const crowd = Array.from({ length: 30 }, (_, i) =>
      person(`Walker ${String.fromCharCode(65 + i)}`, {
        role: i === 29 ? 'main' : 'minor',
      }),
    );
    const bible = mergeStory([
      { from: 1, to: 5, draft: draft({ characters: crowd }) },
    ]);
    expect(bible.characters).toHaveLength(24);
    expect(bible.characters.some((c) => c.role === 'main')).toBe(true);
  });

  it('tells the writer who is on the page, how they start it, and who the book meets there', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 3,
        draft: draft({
          characters: [
            person('Mira', { traits: ['brave'] }),
            person('Ember', { traits: ['sly'] }),
          ],
          places: [
            {
              name: 'the harbour',
              aliases: [],
              look: 'grey stone quay at dusk',
              sound: 'water',
            },
          ],
          pages: [
            {
              page: 1,
              summary: 'Mira waits.',
              present: [{ name: 'Mira', mood: 'sad' }],
              place: 'harbour',
            },
            {
              page: 2,
              summary: 'Ember appears.',
              present: [
                { name: 'Mira', mood: 'surprised' },
                { name: 'Ember', mood: 'neutral' },
              ],
              place: 'The Harbour',
            },
          ],
        }),
      },
    ]);
    expect(moodBefore(bible, 'mira', 2)).toBe('sad');
    expect(moodBefore(bible, 'mira', 1)).toBe('neutral');
    const told = describeStory(bible, 2);
    expect(told).toContain(
      '- mira: Mira, brave. Starts the page sad; on it mostly surprised.',
    );
    expect(told).toContain(
      '- ember: Ember, sly. Starts the page neutral; on it mostly neutral. The book meets them for the first time here.',
    );
    expect(told).toContain(
      '- harbour: the harbour, where this page happens: behind the stage from the start.',
    );
    // A page nothing is known of: the main characters met so far.
    expect(charactersOn(bible, 9).map((c) => c.id)).toEqual(['mira', 'ember']);
  });

  it('fills in each character on a page: their order, their face, and on their first page what they are like', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 3,
        draft: draft({
          characters: [
            person('Mira', { traits: ['brave'] }),
            person('Ember', { traits: ['sly', 'quick'] }),
          ],
          pages: [
            {
              page: 1,
              summary: '',
              present: [{ name: 'Mira', mood: 'sad' }],
              place: null,
            },
            {
              page: 2,
              summary: '',
              present: [
                { name: 'Ember', mood: 'happy' },
                { name: 'Mira', mood: 'happy' },
              ],
              place: null,
            },
          ],
        }),
      },
    ]);
    const script = {
      fit: 'good',
      fitReason: null,
      title: 't',
      mood: 'calm',
      beats: [],
      steps: [],
      cast: [
        {
          id: 'mira',
          kind: 'character',
          ref: 'mira',
          name: 'Mira',
          state: null,
          met: 0,
          intro: [],
        },
        {
          id: 'fox',
          kind: 'character',
          ref: 'ember',
          name: 'Ember',
          state: 'angry',
          met: 0,
          intro: [],
        },
      ],
    } as SceneScript;
    const [mira, fox] = castStory(script, bible, 2).cast;
    expect(mira).toMatchObject({ state: 'sad', met: 0, intro: [] });
    expect(fox).toMatchObject({
      state: 'angry',
      met: 1,
      intro: ['sly', 'quick'],
    });
  });

  it('reads a book in stretches of whole pages, each marked', () => {
    const pages = [3, 1, 2].map((page) => ({ page, text: 'x'.repeat(60) }));
    const pieces = storyPieces(pages, 160);
    expect(pieces.map((p) => [p.from, p.to])).toEqual([
      [1, 2],
      [3, 3],
    ]);
    expect(pieces[0].text.startsWith('[page 1]\n')).toBe(true);
    expect(pieces[0].text).toContain('[page 2]');
  });

  it('asks the artist for a figure with a blank face and every face over it', () => {
    const thing = sheetThing(
      {
        id: 'mira',
        name: 'Mira',
        aliases: [],
        role: 'main',
        look: 'a girl in a yellow raincoat',
        traits: [],
        firstPage: 1,
        met: 0,
        voice: null,
      },
      'The Lantern',
    );
    expect(thing.brief).toContain('yellow raincoat');
    expect(thing.brief).toContain('no eyes, brows or mouth');
    expect(thing.parts.map((p) => p.name)).toEqual([
      'head',
      'body',
      'arms',
      'legs',
    ]);
    expect(thing.states.map((s) => s.name)).toContain('neutral');
    expect(thing.shape).toBe('tall');
  });

  it('counts a novel or a play as a story when an older profile never said', () => {
    expect(
      profileOf({ subject: 'x', kind: 'fiction', tone: 'neutral', formats: [] })
        .story,
    ).toBe(true);
    expect(
      profileOf({
        subject: 'x',
        kind: 'textbook',
        tone: 'neutral',
        formats: [],
      }).story,
    ).toBe(false);
    expect(
      profileOf({
        subject: 'x',
        kind: 'poetry',
        tone: 'neutral',
        formats: [],
        story: true,
      }).story,
    ).toBe(true);
  });
});

describe("a story page's own place", () => {
  it('stands behind the stage from the start, added to the cast when the writer left it out', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 2,
        draft: draft({
          characters: [person('Mira')],
          places: [
            { name: 'the quay', aliases: [], look: 'stone', sound: 'water' },
          ],
          pages: [
            {
              page: 1,
              summary: '',
              present: [{ name: 'Mira', mood: 'happy' }],
              place: 'the quay',
            },
          ],
        }),
      },
    ]);
    const script = {
      fit: 'good',
      fitReason: null,
      title: 't',
      mood: 'calm',
      beats: [],
      steps: [],
      cast: [{ id: 'quay', kind: 'words', text: 'quay', style: 'keyword' }],
    } as SceneScript;
    const cast = castStory(script, bible, 1);
    // Its id taken by something else on the page, the place takes another.
    expect(cast.backdrop).toBe('place-quay');
    expect(cast.cast[1]).toEqual({
      id: 'place-quay',
      kind: 'place',
      ref: 'quay',
      name: 'the quay',
      sound: 'water',
    });
    expect(castStory({ ...script, cast: [] }, bible, 2).backdrop).toBeNull();
  });
});

describe('a "previously" opening', () => {
  it('brings back who was on the page before, in the place they were, with the face they left with', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 3,
        draft: draft({
          characters: [person('Mira'), person('Ember'), person('Tobi')],
          places: [
            { name: 'the quay', aliases: [], look: '', sound: null },
            { name: 'the house', aliases: [], look: '', sound: null },
          ],
          pages: [
            {
              page: 1,
              summary: '',
              present: [
                { name: 'Ember', mood: 'happy' },
                { name: 'Mira', mood: 'afraid' },
              ],
              place: 'the quay',
            },
            {
              page: 2,
              summary: '',
              present: [{ name: 'Mira', mood: 'neutral' }],
              place: 'the house',
            },
          ],
        }),
      },
    ]);
    const script = {
      fit: 'good',
      fitReason: null,
      title: 't',
      mood: 'calm',
      beats: [],
      steps: [],
      cast: [
        {
          id: 'fox',
          kind: 'character',
          ref: 'ember',
          name: 'Ember',
          state: null,
          met: 0,
          intro: [],
        },
        {
          id: 'mira',
          kind: 'character',
          ref: 'mira',
          name: 'Mira',
          state: 'happy',
          met: 0,
          intro: [],
        },
      ],
    } as SceneScript;
    const cast = castStory(script, bible, 2);
    // Mira and Ember were on page 1: back in the order met, on the quay.
    expect(cast.opening).toEqual({ show: ['mira', 'fox'], backdrop: 'quay' });
    expect(cast.backdrop).toBe('house');
    const mira = cast.cast.find((t) => t.id === 'mira');
    expect(mira).toMatchObject({ before: 'afraid', state: 'happy' });
    // Nobody from the page before: no opening.
    expect(castStory({ ...script, cast: [] }, bible, 2).opening).toBeNull();
    expect(castStory(script, bible, 1).opening).toBeNull();
  });
});
