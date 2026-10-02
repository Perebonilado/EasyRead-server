import type { EditorResearch, EditorWorld } from '../studio/studio-editor';
import { buildRegistry, promptList } from '../shots/shot-registry';
import { TELEVISION } from './__fixtures__/television';
import {
  countsOf,
  CREDITS_HEADING,
  creditsBlock,
  deskPass,
  entryOf,
  eventName,
  keyEvents,
  namesPerson,
  namesThing,
  passQuestions,
  picturesFor,
  placesNamed,
  titleWords,
  withPictureCredits,
} from './episode';
import type { PictureQuery, PictureRecord } from './types';

// "The Regional Turn", cut down: its research has no people of its own;
// its world names five, and the claims name them.
const RESEARCH = {
  claims: [
    {
      id: 'c20',
      text: 'The Central Bank of Nigeria says Balewa became Prime Minister in 1957 and remained in office at independence in 1960.',
      kind: 'claim',
      sources: [],
      confidence: 'high',
      visual: '',
      contested: false,
      who: null,
      status: null,
    },
    {
      id: 'c22',
      text: 'A 1957 conference photograph from the Nigerian National Library shows Obafemi Awolowo, Alan Lennox-Boyd, Ahmadu Bello, James Robertson, and Nnamdi Azikiwe together.',
      kind: 'event',
      sources: [],
      confidence: 'high',
      visual: '',
      contested: false,
      who: null,
      status: null,
    },
  ],
  timeline: [
    {
      date: '1951',
      event: 'A new constitution introduces regional legislatures',
      claims: [],
    },
    {
      date: '1957',
      event: 'East and West move into regional self-government',
      claims: [],
    },
    {
      date: '1 October 1960',
      event: 'Nigeria becomes independent',
      claims: [],
    },
  ],
  numbers: [],
  myths: [],
  perspectives: [],
  looks: [],
  pronunciations: [],
  open: [],
  searched: 0,
} as unknown as EditorResearch;

const WORLD = {
  region: 'Nigeria',
  people: [
    {
      name: 'Ahmadu Bello',
      role: 'Northern Region leader and strategist',
      claims: [],
    },
    {
      name: 'Sir Abubakar Tafawa Balewa',
      role: 'Prime minister and bridge to the independence settlement',
      claims: [],
    },
  ],
  places: [],
  palette: [],
  things: [],
} as unknown as EditorWorld;

const ROWS = [
  {
    say: 'In Lagos, the real question became which region could set the pace for everyone.',
    claims: ['c39'],
  },
  {
    say: 'Kaduna mattered because northern leaders could slow the timetable.',
    claims: ['c6'],
  },
  { say: 'Ahmadu Bello led the North into that bargain.', claims: ['c22'] },
];

const record = (over: Partial<PictureRecord>): PictureRecord => ({
  id: 'p1',
  qid: 'Q401032',
  source: 'commons',
  sourceId: 'File:Ahmadu Bello 1960.jpg',
  kind: 'person',
  subject: 'Ahmadu Bello',
  url: 'https://upload.wikimedia.org/x.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ahmadu_Bello_1960.jpg',
  licence: 'Public domain',
  credit:
    '“Ahmadu Bello 1960” by Ed Westcott, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Ahmadu_Bello_1960.jpg), Public domain.',
  chip: 'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
  width: 1280,
  height: 1601,
  focal: [427, 534, 427, 534],
  sha1: 'a'.repeat(40),
  mime: 'image/jpeg',
  storageKey: `pictures/${'a'.repeat(40)}.jpg`,
  depthKey: null,
  year: 1960,
  mono: true,
  dates: '1910–1966',
  role: 'Northern Region leader',
  ...over,
});

describe("an episode's desk pass", () => {
  it('asks for each person’s portrait with the years the claims naming them give, and each place the lines name from the research’s years', () => {
    const questions = passQuestions({
      rows: ROWS,
      research: RESEARCH,
      world: WORLD,
    });
    expect(questions.map((q) => [q.for, q.query.name])).toEqual([
      ['portrait', 'Ahmadu Bello'],
      ['portrait', 'Sir Abubakar Tafawa Balewa'],
      ['photo', 'Lagos'],
      ['photo', 'Kaduna'],
    ]);
    expect(questions[0].query).toMatchObject({
      kind: 'person',
      years: [1957],
      place: ['Nigeria'],
      role: 'Northern Region leader and strategist',
    });
    expect(questions[1].query.years).toEqual([1957, 1960]);
    expect(questions[2].query).toMatchObject({
      kind: 'place',
      years: [1951, 1957, 1960],
      place: ['Nigeria'],
    });
    expect(questions[2].query.geo?.lat).toBeCloseTo(6.45, 0);
  });

  it('reads a person named by their surname, never by a short word', () => {
    expect(
      namesPerson(
        'Balewa became Prime Minister in 1957',
        'Sir Abubakar Tafawa Balewa',
      ),
    ).toBe(true);
    expect(namesPerson('The Bello estate', 'Ahmadu Bello')).toBe(true);
    expect(namesPerson('An Li', 'Li Wei')).toBe(false);
  });

  it('finds the places a line names in the show’s country, never a person’s name or a country', () => {
    expect(
      placesNamed(
        [{ say: 'Bello flew from Lagos to Kaduna, far from London.' }],
        WORLD,
        ['Ahmadu Bello'],
      ).map((p) => p.name),
    ).toEqual(['Lagos', 'Kaduna']);
  });

  it('makes a portrait an entry on its person, and a photo an entry of its own', () => {
    const [portrait, , lagos] = passQuestions({
      rows: ROWS,
      research: RESEARCH,
      world: WORLD,
    });
    expect(entryOf(portrait, record({}))).toMatchObject({
      name: 'person:Ahmadu Bello',
      kind: 'person',
      qid: 'Q401032',
      picture: {
        asset: 'p1',
        credit: 'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
        url: 'api/v1/studio/pictures/p1',
        width: 1280,
        height: 1601,
        kind: 'portrait',
        dates: '1910–1966',
        role: 'Northern Region leader',
        source: 'US Department of Energy',
      },
    });
    expect(entryOf(portrait, record({})).picture?.fullCredit).toContain(
      'Ed Westcott',
    );
    const photo = entryOf(
      lagos,
      record({
        id: 'p2',
        kind: 'place',
        subject: 'Lagos',
        year: 1958,
        depthKey: 'pictures/x-depth.png',
        chip: 'Lagos, 1958 · USIA · Public domain',
      }),
    );
    expect(photo).toMatchObject({
      name: 'photo:Lagos 1958',
      kind: 'photo',
      about: 'a photo of Lagos, 1958 (USIA)',
      shows: { kind: 'place', name: 'place:Lagos' },
      picture: { kind: 'photo', depthUrl: 'api/v1/studio/pictures/p2/depth' },
    });
  });

  it('runs the pass once, each answer an entry, and offers a scene only what is about it', async () => {
    const asked: PictureQuery[] = [];
    const desk = {
      lookup: (query: PictureQuery) => {
        asked.push(query);
        if (query.name === 'Ahmadu Bello') return Promise.resolve(record({}));
        if (query.name === 'Lagos')
          return Promise.resolve(
            record({
              id: 'p2',
              kind: 'place',
              subject: 'Lagos',
              year: 1958,
              sha1: 'b'.repeat(40),
              sourceId: 'File:Lagos Marina, Nigeria, 1958.jpg',
            }),
          );
        return Promise.resolve(null);
      },
    };
    const pictures = await deskPass(desk, {
      rows: ROWS,
      research: RESEARCH,
      world: WORLD,
    });
    expect(asked).toHaveLength(4);
    expect(pictures.entries.map((e) => e.entry.name)).toEqual([
      'person:Ahmadu Bello',
      'photo:Lagos 1958',
    ]);

    // A scene that names Lagos is offered its photo; one that does not, not.
    expect(picturesFor([ROWS[0]], pictures).map((e) => e.name)).toEqual([
      'person:Ahmadu Bello',
      'photo:Lagos 1958',
    ]);
    expect(picturesFor([ROWS[1]], pictures).map((e) => e.name)).toEqual([
      'person:Ahmadu Bello',
    ]);

    // The registry puts a portrait only on a person the scene names.
    const naming = buildRegistry({
      rows: [ROWS[2]],
      research: RESEARCH,
      world: WORLD,
      pictures: picturesFor([ROWS[2]], pictures),
    });
    expect(naming.resolve('person:Ahmadu Bello')?.picture?.asset).toBe('p1');
    const silent = buildRegistry({
      rows: [ROWS[1]],
      research: RESEARCH,
      world: WORLD,
      pictures: picturesFor([ROWS[1]], pictures),
    });
    expect(silent.resolve('person:Ahmadu Bello')).toBeNull();
  });

  it('lists every picture’s credit once at the foot of the description, replacing an older list', () => {
    expect(creditsBlock(['A.', 'B.', 'A.'])).toBe(
      `${CREDITS_HEADING}\n- A.\n- B.`,
    );
    const once = withPictureCredits(
      'How did it happen?\n\nWhat we left out: x.',
      ['A.'],
    );
    expect(once).toBe(
      `How did it happen?\n\nWhat we left out: x.\n\n${CREDITS_HEADING}\n- A.`,
    );
    expect(withPictureCredits(once, ['B.'])).toBe(
      `How did it happen?\n\nWhat we left out: x.\n\n${CREDITS_HEADING}\n- B.`,
    );
    expect(withPictureCredits(once, [])).toBe(
      'How did it happen?\n\nWhat we left out: x.',
    );
  });

  describe('people, places, events and things (Richard, 2026-10-02)', () => {
    const questions = passQuestions(TELEVISION);
    const of = (kind: string) => questions.filter((q) => q.shows.kind === kind);

    it('asks for every person, every place the lines name, the key events they rest on and the things they name', () => {
      expect(of('person').map((q) => q.query.name)).toEqual([
        'John Logie Baird',
        'Philo Farnsworth',
        'Vladimir Zworykin',
        'David Sarnoff',
      ]);
      expect(of('person')[3].query.years).toEqual([1939]);
      expect(of('place').map((q) => q.query.name)).toEqual([
        'London',
        'San Francisco',
        'New York',
      ]);
      // The look is asked whether a place's photo shows the place itself.
      expect(of('place')[0].query.asked).toBe(
        'a place: London, United Kingdom, itself (its streets, buildings, skyline or landscape)',
      );
      expect(of('event').map((q) => [q.query.name, q.query.years])).toEqual([
        ['Baird demonstrates television', [1926]],
        ['Farnsworth transmits the first all-electronic television', [1927]],
        ['Zworykin announces the iconoscope camera tube', [1933]],
        ['The BBC Television Service opens', [1936]],
        ["The BBC drops Baird's mechanical system", [1937]],
        ['RCA introduces television', [1939]],
      ]);
      expect(of('event')[0].query).toMatchObject({
        kind: 'event',
        place: ['Frith Street, London'],
        words: [
          'Baird demonstrates television to members of the Royal Institution',
          'Frith Street, London',
        ],
        asked:
          'an event: Baird demonstrates television to members of the Royal Institution (26 January 1926, Frith Street, London)',
      });
      expect(of('event')[0].offer).toMatchObject({
        kind: 'event',
        claims: ['c1'],
        year: 1926,
      });
      // The Nipkow disc is the world's, but no line names it: not asked.
      expect(of('thing').map((q) => q.query.name)).toEqual([
        'televisor',
        'image dissector',
        'iconoscope',
        'cathode-ray tube',
      ]);
      expect(of('thing')[0].query).toMatchObject({
        kind: 'object',
        words: ['televisor'],
        asked:
          'a thing: televisor (a wooden cabinet with a small glowing window)',
      });
      // What each shows, as the registry names it.
      expect(of('person')[0].shows).toEqual({
        kind: 'person',
        name: 'person:John Logie Baird',
      });
      expect(of('place')[0].shows).toEqual({
        kind: 'place',
        name: 'place:London',
      });
    });

    it('asks at most eight events, the ones most lines rest on, in the timeline’s order', () => {
      const timeline = Array.from({ length: 12 }, (_, i) => ({
        date: String(1900 + i),
        event: `Event number ${i} happens`,
        claims: [`c${i}`],
      }));
      const rows = timeline.map((e, i) => ({
        say: `Line ${i}.`,
        // The later events are rested on twice.
        claims: i >= 4 ? [e.claims[0], e.claims[0]] : [e.claims[0]],
      }));
      rows.push(...rows.slice(4).map((r) => ({ ...r, say: 'Again.' })));
      const events = keyEvents(rows, { ...TELEVISION.research, timeline });
      expect(events.map((e) => e.year)).toEqual([
        1904, 1905, 1906, 1907, 1908, 1909, 1910, 1911,
      ]);
    });

    it('names an event shortly, cut where it turns', () => {
      expect(
        eventName(
          'Nigeria becomes independent by act and constitutional order',
        ),
      ).toBe('Nigeria becomes independent');
      expect(
        eventName(
          'Constitutional talks expose a split over the timing of self-government',
        ),
      ).toBe('Constitutional talks expose a split');
      expect(eventName('Lyttleton Constitution establishes federalism')).toBe(
        'Lyttleton Constitution establishes federalism',
      );
    });

    it('reads a thing’s name in whole words, a plural allowed', () => {
      expect(namesThing('a row of cathode-ray tubes', 'cathode-ray tube')).toBe(
        true,
      );
      expect(namesThing('his televisor glowed', 'televisor')).toBe(true);
      expect(namesThing('a television set', 'televisor')).toBe(false);
    });

    it('reads a file’s title without its catalogue codes', () => {
      expect(
        titleWords(
          'ASC Leiden - NSAG - Crebolder 2 - 40 - Independence ceremony. Robertson GG, Princess Alexandra, Abubakar Tafawa Balewa, President - Lagos, Nigeria - October 1, 1960',
        ),
      ).toBe(
        'Independence ceremony. Robertson GG, Princess Alexandra, Abubakar Tafawa Balewa, President',
      );
      expect(
        titleWords(
          'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519)',
        ),
      ).toBe(
        'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge',
      );
    });

    // A desk that answers each question with the pictures it would bring.
    const pictureOf = (id: string, over: Partial<PictureRecord>) =>
      record({
        id,
        sha1: id.padEnd(40, '0'),
        use: 'photo',
        ...over,
      });
    const answers: Record<string, PictureRecord[]> = {
      'John Logie Baird': [
        pictureOf('baird-portrait', {
          use: 'portrait',
          subject: 'John Logie Baird',
          year: 1917,
          chip: 'John Logie Baird, 1917 · Library of Congress · Public domain',
        }),
        pictureOf('baird-1926', {
          subject: 'John Logie Baird',
          year: 1926,
          title: 'John Logie Baird and television receiver',
          chip: 'John Logie Baird, 1926 · Wikimedia Commons · Public domain',
        }),
        pictureOf('baird-1926b', {
          subject: 'John Logie Baird',
          year: 1926,
          title: 'John Logie Baird and Stooky Bill',
          chip: 'John Logie Baird, 1926 · Wikimedia Commons · Public domain',
        }),
      ],
      'Philo Farnsworth': [
        // Farnsworth has photos of him at work but no portrait of him alone.
        pictureOf('farnsworth-1929', {
          subject: 'Philo Farnsworth',
          year: 1929,
          title: 'Philo Farnsworth with his image dissector',
          chip: 'Philo Farnsworth, 1929 · Wikimedia Commons · Public domain',
        }),
      ],
      London: [
        pictureOf('london-1926', {
          kind: 'place',
          subject: 'London',
          year: 1926,
          title: 'Piccadilly Circus, London, 1926',
          chip: 'London, 1926 · Wikimedia Commons · Public domain',
        }),
      ],
      'The BBC Television Service opens': [
        pictureOf('bbc-1936', {
          kind: 'event',
          subject: 'The BBC Television Service opens',
          year: 1936,
          title:
            "World's first high definition television transmission from Alexandra Palace, November 1936",
          chip: 'The BBC Television Service opens, 1936 · Wikimedia Commons · Public domain',
        }),
      ],
      iconoscope: [
        pictureOf('iconoscope', {
          kind: 'object',
          subject: 'iconoscope',
          year: 1936,
          title: 'Zworykin and iconoscope',
          chip: 'iconoscope, 1936 · Wikimedia Commons · Public domain',
        }),
        // The same picture another question brought: used once.
        pictureOf('farnsworth-1929', { subject: 'iconoscope' }),
      ],
    };
    const desk = {
      lookup: () => Promise.resolve(null),
      lookupAll: (query: PictureQuery) =>
        Promise.resolve(answers[query.name] ?? []),
    };

    it('makes a person’s portrait their entry and their other photos photo entries that show them, each picture once', async () => {
      const pictures = await deskPass(desk, TELEVISION);
      expect(
        pictures.entries.map(({ entry }) => [entry.name, entry.shows]),
      ).toEqual([
        ['person:John Logie Baird', undefined],
        [
          'photo:John Logie Baird 1926',
          { kind: 'person', name: 'person:John Logie Baird' },
        ],
        [
          'photo:John Logie Baird 1926 (2)',
          { kind: 'person', name: 'person:John Logie Baird' },
        ],
        [
          'photo:Philo Farnsworth 1929',
          { kind: 'person', name: 'person:Philo Farnsworth' },
        ],
        ['photo:London 1926', { kind: 'place', name: 'place:London' }],
        [
          'photo:The BBC Television Service opens 1936',
          {
            kind: 'event',
            name: 'The BBC Television Service opens at Alexandra Palace',
          },
        ],
        ['photo:iconoscope 1936', { kind: 'thing', name: 'iconoscope' }],
      ]);
      expect(countsOf(pictures)).toEqual({
        portraits: 1,
        person: 3,
        place: 1,
        event: 1,
        thing: 1,
      });
      const [portrait, photo] = pictures.entries.map((e) => e.entry);
      expect(portrait.picture?.kind).toBe('portrait');
      expect(photo).toMatchObject({
        kind: 'photo',
        about:
          'a photo of John Logie Baird, 1926 (Wikimedia Commons): “John Logie Baird and television receiver”',
        picture: { kind: 'photo' },
      });
      expect(photo.picture?.dates).toBeUndefined();
      const event = pictures.entries[5].entry;
      expect(event.about).toBe(
        "a photo of the event “The BBC Television Service opens at Alexandra Palace”, 1936 (Wikimedia Commons): “World's first high definition television transmission from Alexandra Palace, November 1936”",
      );
    });

    it('offers a scene the photos of what its lines name: a person by their surname, a place, the event they rest on, a thing', async () => {
      const pictures = await deskPass(desk, TELEVISION);
      const offered = (rows: { say: string; claims?: string[] }[]) =>
        picturesFor(rows, pictures)
          .filter((e) => e.kind === 'photo')
          .map((e) => e.name);
      // "Baird's system": his surname is enough.
      expect(
        offered([
          {
            say: "For a few months, Baird's system and the electronic one took turns on air.",
            claims: ['c8'],
          },
        ]),
      ).toEqual([
        'photo:John Logie Baird 1926',
        'photo:John Logie Baird 1926 (2)',
      ]);
      expect(offered([TELEVISION.rows[0]])).toEqual([
        'photo:John Logie Baird 1926',
        'photo:John Logie Baird 1926 (2)',
        'photo:London 1926',
      ]);
      // The line rests on the BBC's opening (c7); the photo of it is offered.
      expect(offered([TELEVISION.rows[6]])).toEqual([
        'photo:The BBC Television Service opens 1936',
      ]);
      // Said with its year and its words, though resting on no claim of it.
      expect(
        offered([
          { say: 'In 1936 the BBC television service opened.', claims: [] },
        ]),
      ).toEqual(['photo:The BBC Television Service opens 1936']);
      expect(offered([TELEVISION.rows[4]])).toEqual(['photo:iconoscope 1936']);
      // A line about none of them is offered none.
      expect(
        offered([{ say: 'Nobody watched at first.', claims: ['c99'] }]),
      ).toEqual([]);
    });

    it('lists each photo with what it shows, and a person’s photos with them, so a person with photos is on screen', async () => {
      const pictures = await deskPass(desk, TELEVISION);
      const rows = [TELEVISION.rows[2], TELEVISION.rows[3]];
      const registry = buildRegistry({
        rows,
        research: TELEVISION.research,
        world: TELEVISION.world,
        pictures: picturesFor(rows, pictures),
      });
      expect(registry.resolve('photo:Philo Farnsworth 1929')?.shows).toEqual({
        kind: 'person',
        name: 'person:Philo Farnsworth',
      });
      const list = promptList(registry);
      expect(list).toContain(
        '- person:Philo Farnsworth: American inventor of electronic television · no portrait · photos of them: photo:Philo Farnsworth 1929',
      );
      expect(list).toContain(
        '- photo:Philo Farnsworth 1929 (shows person:Philo Farnsworth): a photo of Philo Farnsworth, 1929 (Wikimedia Commons): “Philo Farnsworth with his image dissector”',
      );
      expect(list).not.toContain('no trace: never on screen');
    });
  });
});
