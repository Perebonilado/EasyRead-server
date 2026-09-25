import { profileOf } from './scene-profile';
import type { SceneScript } from './scene-script';
import { PLAIN_FIGURE } from './scene-figure';
import {
  CAST_STYLE,
  SET_STYLE,
  bibleOf,
  castStory,
  charactersOn,
  describeStory,
  isGod,
  mergeStory,
  moodBefore,
  nameKey,
  outsideStory,
  setThing,
  titleCard,
  sheetThing,
  storyPieces,
  standsOnStage,
  whereaboutsOn,
  withVoices,
  type StoryBible,
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
    const crowd = Array.from({ length: 50 }, (_, i) =>
      person(
        `Walker ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 'x' : ''}`,
        {
          role: i === 49 ? 'main' : 'minor',
        },
      ),
    );
    const bible = mergeStory([
      { from: 1, to: 5, draft: draft({ characters: crowd }) },
    ]);
    // Forty: a gospel's speakers who are named once and never again.
    expect(bible.characters).toHaveLength(40);
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
    expect(mira).toMatchObject({
      state: 'sad',
      met: 0,
      intro: [],
      first: false,
    });
    expect(fox).toMatchObject({
      state: 'angry',
      met: 1,
      intro: ['sly', 'quick'],
      first: true,
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

  it("asks the artist for an animal in the people's style, its size beside them", () => {
    const fox = sheetThing(
      {
        id: 'ember',
        name: 'Ember',
        aliases: [],
        role: 'main',
        look: 'a fox the colour of rust',
        traits: [],
        firstPage: 1,
        met: 1,
        voice: 'creature',
        kind: 'animal',
        size: 'medium',
      },
      'The Lantern',
    );
    expect(fox.brief).toContain(CAST_STYLE);
    expect(fox.brief).toContain("grown-up's waist");
    // On all fours, it needs the room across.
    expect(fox.shape).toBe('square');
  });

  it("asks the set painter for a place in the people's style, open where they stand", () => {
    const quay = setThing(
      {
        id: 'quay',
        name: 'The quay',
        aliases: [],
        look: 'stone steps down to the water',
        firstPage: 1,
        sound: 'water',
      },
      'The Lantern',
    );
    expect(quay.brief).toContain('stone steps');
    expect(quay.brief).toContain(SET_STYLE);
  });

  it('keeps what each character is and how a person looks from where the book first meets them', () => {
    const first = {
      ...PLAIN_FIGURE,
      age: 'child' as const,
      hair: 'pigtails' as const,
    };
    const later = {
      ...PLAIN_FIGURE,
      age: 'adult' as const,
      hair: 'bob' as const,
    };
    const bible = mergeStory([
      {
        from: 1,
        to: 5,
        draft: draft({
          characters: [
            person('Mira', { kind: 'person', figure: first }),
            person('Ember', { kind: 'animal', size: 'medium', figure: first }),
            person('Tobi', {}),
          ],
        }),
      },
      {
        from: 6,
        to: 9,
        draft: draft({
          characters: [
            person('Mira', { kind: 'person', figure: later }),
            person('Tobi', { kind: 'person', figure: later }),
          ],
        }),
      },
    ]);
    const [mira, ember, tobi] = ['Mira', 'Ember', 'Tobi'].map((name) =>
      bible.characters.find((c) => c.name === name)!,
    );
    // A later stretch never restyles them; it fills in what was missing.
    expect(mira).toMatchObject({
      kind: 'person',
      figure: { age: 'child', hair: 'pigtails' },
    });
    expect(tobi).toMatchObject({
      kind: 'person',
      figure: { age: 'adult', hair: 'bob' },
    });
    // An animal has a size, and no figure: the artist draws it.
    expect(ember).toMatchObject({
      kind: 'animal',
      size: 'medium',
      figure: null,
    });
  });

  it('reads back a bible kept before characters had kinds, and one kept after', () => {
    const older = bibleOf({
      characters: [
        {
          id: 'mira',
          name: 'Mira',
          aliases: [],
          role: 'main',
          look: 'a girl',
          traits: [],
          firstPage: 1,
          met: 0,
          voice: 'girl',
        },
      ],
      places: [],
      pages: [],
    });
    expect(older.characters[0]).toMatchObject({
      kind: null,
      size: null,
      figure: null,
    });
    const newer = bibleOf({
      characters: [
        {
          id: 'mira',
          name: 'Mira',
          aliases: [],
          role: 'main',
          look: 'a girl',
          traits: [],
          firstPage: 1,
          met: 0,
          voice: 'girl',
          kind: 'person',
          size: null,
          figure: { ...PLAIN_FIGURE, age: 'child', hair: 'Pigtails' } as never,
        },
      ],
      places: [],
      pages: [],
    });
    expect(newer.characters[0].figure).toMatchObject({
      age: 'child',
      hair: 'pigtails',
    });
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

describe('who is seen, and who is only heard', () => {
  it('never draws God, whatever the reader said, by any of his names', () => {
    expect(isGod(['God'])).toBe(true);
    expect(isGod(['The Lord God'])).toBe(true);
    expect(isGod(['the Almighty'])).toBe(true);
    // A lord of the manor is not God.
    expect(isGod(['the Lord', 'Lord Ashby'])).toBe(false);
    const bible = mergeStory([
      {
        from: 1,
        to: 2,
        draft: draft({
          characters: [
            person('Jesus', { presence: 'seen', voice: 'man' }),
            person('God', { presence: 'seen', voice: 'divine' }),
            person('Mum', { presence: 'heard', voice: 'woman' }),
          ],
          pages: [],
        }),
      },
      {
        from: 3,
        to: 4,
        draft: draft({
          // Heard on the phone first, seen later: seen.
          characters: [person('Mum', { presence: 'seen', voice: 'woman' })],
          pages: [],
        }),
      },
    ]);
    const at = (name: string) => bible.characters.find((c) => c.name === name)!;
    expect(at('God').presence).toBe('above');
    expect(at('Jesus').presence).toBe('seen');
    expect(at('Mum').presence).toBe('seen');
    expect(standsOnStage(at('God'))).toBe(false);
    expect(standsOnStage(at('Jesus'))).toBe(true);
    expect(standsOnStage({ presence: 'light' })).toBe(true);
    expect(standsOnStage({ presence: 'seen', kind: 'group' })).toBe(false);
    // Kept as it was read.
    expect(
      bibleOf(JSON.parse(JSON.stringify(bible)) as StoryBible).characters,
    ).toEqual(bible.characters);
  });

  it('brings in a voice from heaven and a crowd the reader did not list, for the page', () => {
    const bible: StoryBible = {
      characters: [
        {
          id: 'jesus',
          name: 'Jesus',
          aliases: [],
          role: 'main',
          look: '',
          traits: [],
          firstPage: 1,
          met: 0,
          voice: 'man',
          presence: 'seen',
        },
      ],
      places: [],
      pages: [],
    };
    const page =
      'The crowds shouted, “Hosanna!” Behold, a voice out of the heavens said, “This is my beloved Son.”';
    const withThem = withVoices(bible, 3, page);
    const voice = withThem.characters.find((c) => c.presence === 'above');
    const crowd = withThem.characters.find((c) => c.kind === 'group');
    expect(voice?.voice).toBe('divine');
    expect(crowd?.voice).toBe('crowd');
    // The writer is still told of the story's own people on the page.
    expect(charactersOn(withThem, 3).map((c) => c.id)).toEqual([
      'jesus',
      voice!.id,
      crowd!.id,
    ]);
    expect(describeStory(withThem, 3)).toContain('a voice from above');
    // God already in the story: no second voice from above.
    const withGod = {
      ...bible,
      characters: [
        ...bible.characters,
        {
          ...bible.characters[0],
          id: 'god',
          name: 'God',
          presence: 'above' as const,
        },
      ],
    };
    expect(
      withVoices(withGod, 3, page).characters.filter(
        (c) => c.presence === 'above',
      ),
    ).toHaveLength(1);
    expect(withVoices(bible, 3, 'Jesus walked on.')).toBe(bible);
  });
});

describe('telling apart the people a story names', () => {
  const names = (bible: StoryBible) =>
    bible.characters.map((c) => [c.name, ...c.aliases].join(' / '));

  it('never makes one person of two whom a name relates: a mother, a husband, a father', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 40,
        draft: draft({
          characters: [
            person('Jesus', { aliases: ['Jesus Christ'] }),
            person('Mary', { aliases: ['Mother of Jesus'] }),
          ],
        }),
      },
      {
        from: 41,
        to: 80,
        draft: draft({
          characters: [
            person('Joseph', { aliases: ['Joseph, husband to Mary'] }),
            person("Mark's father", { aliases: ['Mark’s dad'] }),
            person('Mark'),
          ],
        }),
      },
    ]);
    expect(names(bible)).toEqual([
      'Jesus / Jesus Christ',
      'Mary / Mother of Jesus',
      'Joseph / Joseph, husband to Mary',
      "Mark's father / Mark’s dad",
      'Mark',
    ]);
  });

  it('keeps apart two a stretch lists apart, and a name another carries as an alias', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 20,
        draft: draft({
          characters: [
            person('John the Baptist', { aliases: ['John', 'Simon Peter'] }),
            person('Simon Peter', { aliases: ['Peter'] }),
            person('John, brother of James'),
          ],
        }),
      },
    ]);
    expect(names(bible)).toEqual([
      'John the Baptist / John',
      'Simon Peter / Peter',
      'John, brother of James',
    ]);
  });

  it('still knows a shorter or fuller name across stretches: Jack is Jack Merridew, Herod King Herod', () => {
    const bible = mergeStory([
      {
        from: 1,
        to: 20,
        draft: draft({
          characters: [person('Jack Merridew'), person('King Herod')],
        }),
      },
      {
        from: 21,
        to: 40,
        draft: draft({ characters: [person('Jack'), person('Herod')] }),
      },
    ]);
    expect(names(bible)).toEqual([
      'Jack Merridew / Jack',
      'King Herod / Herod',
    ]);
  });
});

describe('the pages around a story', () => {
  const bible = (title: string | null, author: string | null): StoryBible => ({
    ...bibleOf({}),
    pages: [4, 5, 6].map((page) => ({
      page,
      summary: '',
      present: [],
      place: null,
      placeInferred: false,
      time: null,
      weather: null,
      crowd: null,
    })),
    title,
    author,
  });

  it('knows the front and back matter: before the story’s first page, after its last', () => {
    expect(
      [1, 3, 4, 6, 7].map((page) => outsideStory(bible(null, null), page)),
    ).toEqual([true, true, false, false, true]);
    // A book whose pages the reader never listed is all story.
    expect(outsideStory(bibleOf({}), 1)).toBe(false);
  });

  it('knows the pages the reader said are not the story, and none it said are between', () => {
    // As Hide-and-Seek was read: a title page, a blurb and a publisher's
    // letter before; an advert and the back cover after, a place carried
    // onto them from the page before until pages were told apart.
    const read = mergeStory([
      {
        from: 1,
        to: 8,
        draft: draft({
          characters: [person('Sally')],
          places: [{ name: 'the park', aliases: [], look: '', sound: null }],
          pages: [1, 2, 3, 4, 5, 6, 7, 8].map((page) => ({
            page,
            story: page >= 4 && page <= 6 ? true : page === 5,
            summary: page === 7 ? 'An advert.' : '',
            present:
              page === 4 || page === 6
                ? [{ name: 'Sally', mood: 'happy' }]
                : [],
            place: page === 4 ? 'the park' : page === 7 ? 'the park' : null,
            time: page === 4 ? 'dusk' : null,
          })),
        }),
      },
    ]);
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8].map((page) => outsideStory(read, page)),
    ).toEqual([true, true, true, false, false, false, true, true]);
    const page = (n: number) => read.pages.find((p) => p.page === n);
    // The story's page with nothing said happens where, and when, the one
    // before it did; the advert, nowhere and at no time.
    expect([page(5)?.place, page(5)?.time]).toEqual(['park', 'dusk']);
    expect(page(7)).toMatchObject({
      story: false,
      present: [],
      place: null,
      time: null,
    });
    // Kept and read back the same.
    const back = bibleOf(JSON.parse(JSON.stringify(read)) as StoryBible);
    expect(back.pages[6].story).toBe(false);
    expect(back.pages[4].story).toBeUndefined();
  });

  it('makes the first a title card, said by the narrator with its author', () => {
    const card = titleCard(
      bible('Hide-and-Seek', 'T. Albert'),
      '001-HIDE-AND-SEEK.pdf',
    );
    expect(card.beats.map((b) => [b.kind, b.say])).toEqual([
      ['narration', 'Hide-and-Seek, by T. Albert.'],
    ]);
    expect(card.cast).toEqual([
      {
        id: 'book-title',
        kind: 'words',
        text: 'Hide-and-Seek',
        style: 'title',
      },
    ]);
    // With no title read, the file's name, made readable.
    expect(
      titleCard(bible(null, null), '001-HIDE-AND-SEEK-Free-Book.pdf').title,
    ).toBe('Hide And Seek Free Book');
  });
});

describe('someone apart from the rest', () => {
  // Hide-and-Seek: Sally falls into a cave under a tree; the boys look for
  // her in the woods, and call down to her from beside the tree.
  const read = mergeStory([
    {
      from: 1,
      to: 3,
      draft: draft({
        characters: [person('Sally'), person('James'), person('Mark')],
        places: [
          { name: 'the woods', aliases: [], look: '', sound: null },
          { name: 'the cave', aliases: [], look: '', sound: null },
        ],
        pages: [
          {
            page: 1,
            summary: 'They hide.',
            present: [
              { name: 'Sally', mood: 'happy', place: null },
              { name: 'James', mood: 'happy', place: null },
              { name: 'Mark', mood: 'happy', place: null },
            ],
            place: 'the woods',
          },
          {
            page: 2,
            summary: 'The boys find her under the tree.',
            present: [
              { name: 'James', mood: 'surprised', place: 'the woods' },
              { name: 'Mark', mood: 'surprised', place: null },
              { name: 'Sally', mood: 'afraid', place: 'the cave' },
            ],
            place: 'the woods',
          },
          {
            page: 3,
            summary: 'James stays with her.',
            present: [
              { name: 'James', mood: 'neutral', place: null },
              { name: 'Sally', mood: 'afraid', place: 'a hole nobody named' },
            ],
            place: 'the woods',
          },
        ],
      }),
    },
  ]);

  it('keeps where one is apart, and no place for those where the page happens', () => {
    expect(read.pages[1].present).toEqual([
      { id: 'james', mood: 'surprised' },
      { id: 'mark', mood: 'surprised' },
      { id: 'sally', mood: 'afraid', at: 'cave' },
    ]);
    // A place the story never listed is none.
    expect(read.pages[2].present[1]).toEqual({ id: 'sally', mood: 'afraid' });
    expect(
      bibleOf(JSON.parse(JSON.stringify(read)) as StoryBible).pages[1],
    ).toEqual(read.pages[1]);
  });

  it('keeps one the reader gave no place where they last were, when the page follows another down', () => {
    const merged = mergeStory([
      {
        from: 1,
        to: 3,
        draft: draft({
          characters: [person('Sally'), person('James'), person('Dad')],
          places: [
            { name: 'the woods', aliases: [], look: '', sound: null },
            { name: 'the cave', aliases: [], look: '', sound: null },
          ],
          pages: [
            {
              page: 1,
              summary: '',
              present: [
                { name: 'James', mood: 'happy', place: 'the woods' },
                { name: 'Sally', mood: 'afraid', place: 'the cave' },
              ],
              place: 'the woods',
            },
            // Dad down in the cave with her, James left unplaced: above.
            {
              page: 2,
              summary: '',
              present: [
                { name: 'Dad', mood: 'happy', place: 'the cave' },
                { name: 'Sally', mood: 'afraid', place: 'the cave' },
                { name: 'James', mood: 'happy', place: null },
              ],
              place: 'the cave',
            },
            // All home, none placed: together, where the page is.
            {
              page: 3,
              summary: '',
              present: [
                { name: 'James', mood: 'happy', place: null },
                { name: 'Sally', mood: 'happy', place: null },
              ],
              place: 'the cave',
            },
          ],
        }),
      },
    ]);
    expect(merged.pages[1].present).toEqual([
      { id: 'dad', mood: 'happy' },
      { id: 'sally', mood: 'afraid' },
      { id: 'james', mood: 'happy', at: 'woods' },
    ]);
    expect(merged.pages[2].present).toEqual([
      { id: 'james', mood: 'happy' },
      { id: 'sally', mood: 'happy' },
    ]);
  });

  it('says where each is on a page where some are apart, and nothing where they are together', () => {
    expect(whereaboutsOn(read, 2)).toEqual({
      place: 'woods',
      people: { james: 'woods', mark: 'woods', sally: 'cave' },
    });
    expect(whereaboutsOn(read, 1)).toBeNull();
    expect(whereaboutsOn(read, 3)).toBeNull();
    // A crowd apart splits no page: it is never on the stage.
    const crowd = mergeStory([
      {
        from: 1,
        to: 1,
        draft: draft({
          characters: [person('Jesus'), person('Crowds', { kind: 'group' })],
          places: [
            { name: 'a boat', aliases: [], look: '', sound: null },
            { name: 'Capernaum', aliases: [], look: '', sound: null },
          ],
          pages: [
            {
              page: 1,
              summary: '',
              present: [
                { name: 'Jesus', mood: 'neutral', place: null },
                { name: 'Crowds', mood: 'neutral', place: 'Capernaum' },
              ],
              place: 'a boat',
            },
          ],
        }),
      },
    ]);
    expect(crowd.pages[0].present[1].at).toBe('capernaum');
    expect(whereaboutsOn(crowd, 1)).toBeNull();
  });

  it('tells the writer who is apart, and where', () => {
    const told = describeStory(read, 2);
    expect(told).toContain(
      '- sally: Sally. Starts the page happy; on it mostly afraid. On this page they are apart from the rest, in the cave (cave).',
    );
    expect(told).toContain(
      '- cave: the cave, where some are apart on this page: the place of each line said there.',
    );
  });

  it('brings back only those who were where the page before happened', () => {
    const script = {
      fit: 'good',
      fitReason: null,
      title: 't',
      mood: 'calm',
      beats: [],
      steps: [],
      cast: ['sally', 'james', 'mark'].map((id) => ({
        id,
        kind: 'character',
        ref: id,
        name: id,
        state: null,
        met: 0,
        intro: [],
      })),
    } as unknown as SceneScript;
    // Not Sally, who was in the cave.
    expect(castStory(script, read, 3).opening?.show).toEqual(['james', 'mark']);
  });
});

describe('a page that goes to several places', () => {
  it('keeps where else it goes, in order, and tells the writer', () => {
    // Matthew 8:28–9:1: the tombs across the lake, then home to Capernaum.
    const read = mergeStory([
      {
        from: 1,
        to: 1,
        draft: draft({
          characters: [person('Jesus')],
          places: [
            { name: 'Capernaum', aliases: [], look: '', sound: null },
            { name: 'the tombs of Gadara', aliases: [], look: '', sound: null },
            { name: 'a boat', aliases: [], look: '', sound: null },
          ],
          pages: [
            {
              page: 1,
              summary: 'Jesus frees two men at the tombs, and sails home.',
              present: [{ name: 'Jesus', mood: 'neutral' }],
              place: 'Capernaum',
              also: ['the tombs of Gadara', 'a boat', 'Capernaum', 'Rome'],
            },
          ],
        }),
      },
    ]);
    // Neither the page's own place nor one the story never listed.
    expect(read.pages[0].also).toEqual(['tombs-of-gadara', 'a-boat']);
    expect(
      bibleOf(JSON.parse(JSON.stringify(read)) as StoryBible).pages[0].also,
    ).toEqual(['tombs-of-gadara', 'a-boat']);
    expect(describeStory(read, 1)).toContain(
      '- tombs-of-gadara: the tombs of Gadara, where this page also goes: the place of the scene there.',
    );
  });
});

describe('a group named with its people', () => {
  it('never joins one person through a name of theirs', () => {
    // A stretch of Matthew listed the disciples with Peter, James and John
    // among their names, and the merge made them John the Baptist.
    const bible = mergeStory([
      {
        from: 1,
        to: 4,
        draft: draft({
          characters: [
            person('John the Baptist', { aliases: ['John'] }),
            person('Disciples', { kind: 'group', aliases: ['the twelve'] }),
          ],
        }),
      },
      {
        from: 5,
        to: 9,
        draft: draft({
          characters: [
            person('The disciples', {
              kind: 'group',
              aliases: ['Disciples', 'Peter', 'James', 'John'],
            }),
          ],
        }),
      },
    ]);
    const john = bible.characters.find((c) => c.id === 'john-the-baptist');
    expect(john?.aliases).toEqual(['John']);
    expect(bible.characters.map((c) => c.id)).toEqual([
      'john-the-baptist',
      'disciples',
    ]);
  });
});
