import { mergedResearch, planOf, researchOf, worldOf } from './studio-editor';
import { rowsOf, type EditorialRow } from './studio-editorial';
import {
  abstractIn,
  concreteContext,
  concreteProblems,
  episodeCast,
  researchProblems,
} from './studio-editor-checks';
import { describeResearch } from './studio-editor-words';

const source = (k: number) => [
  `https://a.example.com/${k}`,
  `https://b.example.com/${k}`,
];

/** A log as a deep search gives it: dated events in their places, people, scenes, numbers. */
const deep = researchOf({
  claims: Array.from({ length: 12 }, (_, k) => ({
    id: `c${k + 1}`,
    text: `Fact ${k + 1}.`,
    kind: k < 3 ? 'number' : 'event',
    confidence: 'high',
    sources: source(k + 1),
  })),
  timeline: [
    ['1 October 1960', 'Lagos', 'Independence', 'c1'],
    ['31 March 1953', 'Lagos', 'The self-government motion', 'c4'],
    ['1 May 1953', 'Kano', 'The riots', 'c5'],
    ['12 December 1959', 'Nigeria', 'The federal election', 'c6'],
    ['15 March 1959', 'Kaduna', 'Northern self-government', 'c7'],
  ].map(([date, place, event, claim]) => ({
    date,
    place,
    event,
    claims: [claim],
  })),
  people: [
    {
      name: 'Ahmadu Bello',
      role: 'Premier of the North',
      wanted: 'time for the North',
      did: 'led the walkout',
      claims: ['c4'],
    },
    {
      name: 'Obafemi Awolowo',
      role: 'leader of the Action Group',
      wanted: 'self-government in 1956',
      did: 'backed the motion',
      claims: ['c4'],
    },
  ],
  moments: [
    ['31 March 1953', 'the House, Lagos', 'Northern members', 'They walk out'],
    ['1 May 1953', 'Kano', 'crowds', 'Riots in the old city'],
    ['1 October 1960', 'Lagos', 'crowds', 'The flag goes up at midnight'],
  ].map(([when, where, who, what]) => ({
    when,
    where,
    who,
    what,
    looked: 'crowds in the street',
    claims: ['c4'],
  })),
  numbers: [
    { label: 'NPC seats in 1959', value: '134 of 312', claims: ['c1'] },
    { label: 'Northern seats', value: '174 of 312', claims: ['c2'] },
    { label: 'Independence', value: '1 October 1960', claims: ['c3'] },
  ],
});

describe('a research log deep enough to show', () => {
  it('keeps the people, the turning points as scenes and where each event happened', () => {
    expect(deep.people?.map((p) => [p.name, p.did, p.claims])).toEqual([
      ['Ahmadu Bello', 'led the walkout', ['c4']],
      ['Obafemi Awolowo', 'backed the motion', ['c4']],
    ]);
    expect(deep.moments?.[0]).toMatchObject({
      when: '31 March 1953',
      where: 'the House, Lagos',
      what: 'They walk out',
    });
    expect(deep.timeline[2]).toMatchObject({
      date: '1 May 1953',
      place: 'Kano',
    });
    const told = describeResearch(deep);
    expect(told).toContain('- 1 May 1953, Kano: The riots (c5)');
    expect(told).toContain(
      '- Ahmadu Bello, Premier of the North; wanted: time for the North; did: led the walkout (c4)',
    );
    expect(told).toContain('Turning points, as scenes:');
    // A log kept before people were asked for reads back without them.
    expect(
      researchOf({ claims: [{ id: 'c1', text: 'A fact.' }] }).people,
    ).toEqual([]);
  });

  it('is deep enough as it is', () => {
    expect(researchProblems(deep)).toEqual([]);
  });

  it('goes back once when thin: years without places, no people, no scenes, no numbers', () => {
    const thin = researchOf({
      claims: [{ id: 'c1', text: 'A fact.', sources: source(1) }],
      timeline: ['1945', '1951', '1953'].map((date) => ({
        date,
        event: 'Something changed',
        claims: ['c1'],
      })),
      people: [{ name: 'Nnamdi Azikiwe', claims: [] }],
    });
    expect(researchProblems(thin)).toEqual([
      'The timeline has 3 dated events: find at least 5 key events, each with its exact date (day, month and year where sources give them) and its place.',
      'No numbers: find the ones that can be shown (seats, votes, populations, money, counts, distances), each checked against two sources.',
      'Nnamdi Azikiwe has no claim: find one concrete thing each did or said, with its source.',
      'No turning point is told as a scene: find at least 3, each with who was there, where, when, what happened and what it looked like.',
    ]);
    // Enough events, but years alone and no places.
    const years = researchOf({
      ...deep,
      timeline: ['1945', '1951', '1953', '1957', '1959'].map((date) => ({
        date,
        event: 'Something changed',
        claims: ['c1'],
      })),
    });
    expect(researchProblems(years)).toEqual([
      'Of the 5 key events, 0 have a day or a month and 0 a place: give each its exact date where sources give it, and its place (a city, a building, a region).',
    ]);
  });

  it('is added to by a deeper search: its people gain what was found, its own claims cited by id', () => {
    const more = researchOf(
      {
        claims: [
          {
            id: 'c13',
            text: 'Bello walked out on 31 March 1953.',
            sources: source(13),
          },
        ],
        people: [
          { name: 'Ahmadu Bello', claims: ['c13'] },
          {
            name: 'Nnamdi Azikiwe',
            did: 'moved the motion',
            claims: ['c13', 'c4'],
          },
        ],
        moments: [
          { when: '1953', where: 'Kano', what: 'Riots', claims: ['c13'] },
        ],
      },
      null,
      0,
      new Set(deep.claims.map((c) => c.id)),
    );
    const merged = mergedResearch(deep, more);
    expect(merged.claims.map((c) => c.id).at(-1)).toBe('c13');
    expect(merged.people?.map((p) => [p.name, p.claims])).toEqual([
      ['Ahmadu Bello', ['c4', 'c13']],
      ['Obafemi Awolowo', ['c4']],
      ['Nnamdi Azikiwe', ['c13', 'c4']],
    ]);
    expect(merged.moments).toHaveLength(4);
    // Read back as kept, a topped-up log keeps every claim.
    const many = researchOf({
      claims: Array.from({ length: 110 }, (_, k) => ({
        id: `c${k + 1}`,
        text: `Fact ${k + 1}.`,
      })),
    });
    expect(many.claims).toHaveLength(110);
  });
});

describe('a script told as a story of people, never a lecture', () => {
  const plan = planOf(
    {
      cast: [
        { name: 'Ahmadu Bello', recurring: true, claims: ['c4'] },
        { name: 'Obafemi Awolowo', recurring: true, claims: ['c9'] },
        { name: 'A clerk', recurring: false, claims: ['c4'] },
      ],
      items: [
        {
          item: 'The walkout',
          claims: ['c4'],
          moves: true,
          visual: true,
          episode: 1,
        },
      ],
      episodes: [{ title: 'One', question: 'Why?', covers: [0] }],
    },
    deep,
  );
  const world = worldOf({
    places: [{ name: 'Lagos, the House', kind: 'hall' }],
    people: [{ name: 'Nnamdi Azikiwe' }],
  });
  const ctx = concreteContext(deep, plan, 1, world);
  const rows = (lines: [string, number, EditorialRow['visual']?][]) =>
    rowsOf(
      lines.map(([say, act, visual]) => ({
        say,
        act,
        visual: visual ?? 'why',
        show: 'A picture',
      })),
      new Set(),
    );

  it('knows its episode’s people, its names, its places and its numbers (a date is no number)', () => {
    expect(episodeCast(plan, 1)).toEqual(['Ahmadu Bello']);
    expect(ctx.cast).toEqual(['Ahmadu Bello']);
    expect(ctx.people).toEqual(
      expect.arrayContaining([
        'Ahmadu Bello',
        'Obafemi Awolowo',
        'Nnamdi Azikiwe',
      ]),
    );
    expect(ctx.places).toEqual(
      expect.arrayContaining(['Lagos, the House', 'Kano', 'the House, Lagos']),
    );
    expect(ctx.numbers).toEqual([
      'NPC seats in 1959: 134 of 312',
      'Northern seats: 174 of 312',
    ]);
  });

  it('finds the lecture words a viewer cannot picture', () => {
    expect(
      abstractIn(
        'Regional party machines turned the constitutional order into bargaining power and leverage.',
      ),
    ).toEqual([
      'party machines',
      'constitutional order',
      'bargaining power',
      'leverage',
    ]);
    expect(abstractIn('On 31 March 1953, Bello led his members out.')).toEqual(
      [],
    );
  });

  it('sends back an act that lectures, an abstract line with nothing concrete before it, a person never named, an act with no moment or number', () => {
    const lecture = rows([
      [
        'Southern leaders wanted self-government sooner, because delay felt like lost leverage.',
        1,
      ],
      [
        'The North would not fix a date, because timing protected its bargaining power.',
        1,
      ],
      [
        'So constitutional bargaining became competition among regional party machines.',
        1,
      ],
      ['Each party used its home region as an arena.', 1],
    ]);
    const problems = concreteProblems(lecture, ctx);
    expect(problems[0]).toBe(
      'Act 1 lectures: 5 abstract words (row 1 "leverage", row 2 "bargaining power", row 3 "bargaining", row 3 "party machines", row 4 "arena"). Say what people did, where and when, and the numbers, instead.',
    );
    expect(problems).toContain(
      'Act 1 has no moment: give it one, a scene of people in a place, or a dated event with its place (who did what, where, when).',
    );
    expect(problems).toContain(
      'Act 1 shows no number: give it one the research has (NPC seats in 1959: 134 of 312; Northern seats: 174 of 312).',
    );
    expect(problems.filter((p) => /^Row \d+ is abstract/.test(p))).toHaveLength(
      4,
    );
    expect(problems.at(-1)).toBe(
      'Ahmadu Bello is never named: name them where they act ("Bello wanted…", "Bello did…"), at least once.',
    );
  });

  it('passes a script that tells a moment, then a number, then what they mean', () => {
    const story = rows([
      [
        'On 31 March 1953, in Lagos, Bello led the Northern members out of the House.',
        1,
      ],
      ['Crowds outside jeered them as they left.', 1, 'scene'],
      ['In 1959 the NPC won 134 of 312 seats.', 1, 'how-many'],
      ['That gave the North the bargaining power the South had feared.', 1],
    ]);
    expect(concreteProblems(story, ctx)).toEqual([]);
  });
});
