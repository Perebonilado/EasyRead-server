import type { EditorResearch, EditorWorld } from '../studio/studio-editor';
import { buildRegistry } from '../shots/shot-registry';
import {
  CREDITS_HEADING,
  creditsBlock,
  deskPass,
  entryOf,
  namesPerson,
  passQuestions,
  picturesFor,
  placesNamed,
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
        url: 'studio/pictures/p1',
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
      about: 'an archive photo of Lagos, 1958 (USIA)',
      picture: { kind: 'photo', depthUrl: 'studio/pictures/p2/depth' },
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
            record({ id: 'p2', kind: 'place', subject: 'Lagos', year: 1958 }),
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
});
