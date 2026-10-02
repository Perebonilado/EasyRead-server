import {
  factsOf,
  fitOf,
  kmBetween,
  matchPerson,
  matchPlace,
  nameWords,
  sameName,
} from './match';
import type { WikiItem, WikiPerson } from './types';

const person = (over: Partial<WikiPerson>): WikiPerson => ({
  qid: 'Q1',
  label: 'Someone',
  aliases: [],
  description: '',
  human: true,
  roles: [],
  places: [],
  images: [],
  ...over,
});

// As Wikidata has them (2026-10-02), cut to what the match reads.
const BELLO = person({
  qid: 'Q401032',
  label: 'Ahmadu Bello',
  description: 'Nigerian politician (1910–1966)',
  born: 1910,
  died: 1966,
  roles: ['politician', 'Premier of Northern Nigeria'],
  places: ['Nigeria', 'Rabah', 'Kaduna'],
});
const BALEWA = person({
  qid: 'Q335684',
  label: 'Abubakar Tafawa Balewa',
  description: 'Nigerian politician (1912-1966)',
  born: 1912,
  died: 1966,
  roles: ['politician', 'teacher', 'Prime Minister of Nigeria'],
  places: ['Nigeria', 'Bauchi'],
});
const LENNOX_BOYD = person({
  qid: 'Q4707145',
  label: 'Alan Lennox-Boyd, 1st Viscount Boyd of Merton',
  aliases: ['Alan Lennox-Boyd'],
  description: 'British politician (1904-1983)',
  born: 1904,
  died: 1983,
  roles: ['politician', 'Secretary of State for the Colonies'],
  places: ['United Kingdom'],
});
const NAMESAKE = person({
  qid: 'Q75447303',
  label: 'Alan George Simon Lennox-Boyd',
  description: '(born 1993)',
  born: 1993,
});

describe('who a picture is of', () => {
  it('reads a name without its titles, accents, ordinals or peerage', () => {
    expect(nameWords('Sir Abubakar Tafawa Balewa')).toEqual([
      'abubakar',
      'tafawa',
      'balewa',
    ]);
    expect(nameWords('Alan Lennox-Boyd, 1st Viscount Boyd of Merton')).toEqual([
      'alan',
      'lennox',
      'boyd',
    ]);
    expect(nameWords('Alhaji Sir Ahmadu Bello')).toEqual(['ahmadu', 'bello']);
    expect(nameWords('Léopold Sédar Senghor')).toEqual([
      'leopold',
      'sedar',
      'senghor',
    ]);
  });

  it('takes a name with a middle name left out or a title added, never a surname alone', () => {
    expect(
      sameName('Sir Abubakar Tafawa Balewa', 'Abubakar Tafawa Balewa'),
    ).toBe(true);
    expect(sameName('Abubakar Balewa', 'Abubakar Tafawa Balewa')).toBe(true);
    expect(sameName('Balewa', 'Abubakar Tafawa Balewa')).toBe(false);
    expect(sameName('Ahmadu Bello', 'Ahmadu Bello University')).toBe(false);
    expect(sameName('Tafawa Abubakar', 'Abubakar Tafawa Balewa')).toBe(false);
  });

  it('passes the right person: the name and a fact of the research agree', () => {
    const match = matchPerson(
      {
        name: 'Ahmadu Bello',
        years: [1957],
        place: ['Nigeria'],
        role: 'Northern Region leader and strategist',
      },
      [
        BELLO,
        person({
          qid: 'Q401034',
          label: 'Ahmadu Bello University',
          human: false,
        }),
      ],
    );
    expect(match).toMatchObject({ qid: 'Q401032' });
    expect(match.qid && match.facts).toEqual(['years', 'role', 'place']);
  });

  it('passes a person known by a title and a longer name, by their role and years', () => {
    expect(
      matchPerson(
        {
          name: 'Sir Abubakar Tafawa Balewa',
          years: [1957, 1960],
          role: 'Prime minister and bridge to the independence settlement',
        },
        [BALEWA],
      ),
    ).toMatchObject({ qid: 'Q335684', facts: ['years', 'role'] });
  });

  it('fails a name match with the wrong dates: a namesake born after the research’s years', () => {
    expect(
      matchPerson({ name: 'Alan Lennox-Boyd', years: [1957] }, [NAMESAKE]),
    ).toEqual({
      qid: null,
      reason: 'everyone called Alan Lennox-Boyd lived at another time',
    });
    // With the right one beside him, the right one.
    expect(
      matchPerson(
        {
          name: 'Alan Lennox-Boyd',
          years: [1957],
          role: 'British colonial secretary',
        },
        [NAMESAKE, LENNOX_BOYD],
      ),
    ).toMatchObject({ qid: 'Q4707145' });
  });

  it('fails an ambiguous name: two people the research’s facts cannot tell apart', () => {
    const a = person({
      qid: 'Q10',
      label: 'John Smith',
      born: 1900,
      died: 1970,
      places: ['United Kingdom'],
    });
    const b = person({
      qid: 'Q11',
      label: 'John Smith',
      born: 1905,
      died: 1980,
      places: ['United Kingdom'],
    });
    const match = matchPerson(
      { name: 'John Smith', years: [1950], place: ['United Kingdom'] },
      [a, b],
    );
    expect(match.qid).toBeNull();
    expect(match.qid === null && match.reason).toMatch(
      /2 people called John Smith/u,
    );
  });

  it('fails a match by name alone, with no fact to agree', () => {
    const alone = matchPerson({ name: 'Ahmadu Bello' }, [BELLO]);
    expect(alone.qid === null && alone.reason).toMatch(/name only/u);
    expect(
      matchPerson({ name: 'Nobody Here', years: [1950] }, [BELLO]).qid,
    ).toBeNull();
  });

  it('holds a given id to the name and the years', () => {
    expect(
      matchPerson({ name: 'Ahmadu Bello', qid: 'Q401032', years: [1957] }, [
        BELLO,
      ]),
    ).toMatchObject({ qid: 'Q401032' });
    expect(
      matchPerson({ name: 'Obafemi Awolowo', qid: 'Q401032' }, [BELLO]).qid,
    ).toBeNull();
    expect(
      matchPerson({ name: 'Ahmadu Bello', qid: 'Q401032', years: [1980] }, [
        BELLO,
      ]).qid,
    ).toBeNull();
  });

  it('reads a year after their death, or before they were grown, as outside their life', () => {
    expect(factsOf({ years: [1975] }, BELLO).ruledOut).toMatch(/outside/u);
    expect(factsOf({ years: [1915] }, BELLO).ruledOut).toMatch(/outside/u);
    expect(factsOf({ years: [1966] }, BELLO)).toEqual({
      matched: ['years'],
      life: 'alive',
    });
    // A year just after their death rules nobody out, and is no fact for them.
    expect(factsOf({ years: [1967] }, BELLO)).toEqual({
      matched: [],
      life: 'after',
    });
  });
});

describe('two people of one name, told apart by the research (production, 2026-10-02)', () => {
  // As Wikidata has them on 2026-10-02, cut to what the match reads.
  const DUCHESS_OF_FIFE = person({
    qid: 'Q255953',
    label: 'Princess Alexandra, 2nd Duchess of Fife',
    aliases: ['Princess Alexandra', 'Princess Alexandra, Duchess of Fife'],
    description:
      'British princess; elder daughter of Louise, Princess Royal, and Alexander Duff, 1st Duke of Fife (1891-1959)',
    born: 1891,
    died: 1959,
    roles: [
      'aristocrat',
      'nurse',
      'Counsellor of State',
      'heir presumptive',
      'Colonel-in-Chief',
    ],
    places: ['United Kingdom', 'London', 'Mar Lodge'],
  });
  const ALEXANDRA_OF_KENT = person({
    qid: 'Q170191',
    label: 'Princess Alexandra, Lady Ogilvy',
    aliases: ['HRH Princess Alexandra of Kent', 'Alexandra Windsor'],
    description: 'member of the British royal family',
    born: 1936,
    roles: ['aristocrat', 'patron of the arts', 'sponsor'],
    places: ['United Kingdom', 'Belgrave Square', "St James's Palace"],
  });
  const SARNOFF = person({
    qid: 'Q360106',
    label: 'David Sarnoff',
    description: 'Russian-born American businessman (1891–1971)',
    born: 1891,
    died: 1971,
    roles: ['entrepreneur', 'engineer', 'president'],
    places: ['Russian Empire', 'United States', 'Manhattan'],
  });
  const COACH = person({
    qid: 'Q139662850',
    label: 'David B. Sarnoff',
    aliases: ['David Sarnoff'],
    description:
      'ICF Certified Executive Coach, leadership trainer, and keynote speaker.',
  });

  it('takes the princess alive at Nigeria’s independence in 1960, not the one who died in 1959', () => {
    // Both are "Princess Alexandra"; both are British princesses. The old
    // match let a year just after a death count, and could not choose.
    const match = matchPerson(
      {
        name: 'Princess Alexandra',
        years: [1960],
        role: 'British princess who represented the Queen',
        place: ['Nigeria', 'Lagos'],
      },
      [DUCHESS_OF_FIFE, ALEXANDRA_OF_KENT],
    );
    expect(match).toMatchObject({ qid: 'Q170191' });
    expect(match.qid && match.facts).toEqual(['years', 'role']);
  });

  it('takes RCA’s David Sarnoff, alive in the research’s years, over a coach of that name nobody dates', () => {
    const match = matchPerson(
      {
        name: 'David Sarnoff',
        years: [1939],
        role: 'RCA executive who pushed television into homes',
      },
      [COACH, SARNOFF],
    );
    expect(match).toMatchObject({ qid: 'Q360106', facts: ['years'] });
  });

  it('takes the colonial governor among the James Robertsons by his years, his post and Nigeria', () => {
    const governor = person({
      qid: 'Q6145713',
      label: 'James Wilson Robertson',
      aliases: ['Sir James Wilson Robertson'],
      description: 'British colonial governor (1899-1983)',
      born: 1899,
      died: 1983,
      roles: ['politician', 'colonial governor', 'Governor-General of Nigeria'],
      places: ['Nigeria', 'Broughty Ferry'],
    });
    const officer = person({
      qid: 'Q108162573',
      label: 'James Robertson',
      description: 'British Royal Navy officer, lieutenant in 1815',
      roles: ['naval officer'],
      places: ['United Kingdom of Great Britain and Ireland'],
    });
    const engraver = person({
      qid: 'Q1348650',
      label: 'James Robertson',
      description: 'English photographer and gem and coin engraver (1813-1888)',
      born: 1813,
      died: 1888,
      roles: ['photographer', 'engraver'],
      places: ['United Kingdom', 'Yokohama'],
    });
    const query = {
      name: 'Sir James Robertson',
      years: [1955, 1960],
      role: 'Governor-General of Nigeria',
      place: ['Nigeria'],
    };
    // Without him among those found, nobody: the others share no fact.
    expect(matchPerson(query, [officer, engraver])).toEqual({
      qid: null,
      reason:
        'Sir James Robertson matched by name only: no year, role or place agrees',
    });
    expect(matchPerson(query, [officer, engraver, governor])).toMatchObject({
      qid: 'Q6145713',
      facts: ['years', 'role', 'place'],
    });
  });

  it('still refuses true namesakes: both alive then, both fitting the research alike', () => {
    const a = person({
      qid: 'Q20',
      label: 'Mary Okafor',
      description: 'Nigerian politician',
      born: 1920,
      died: 1990,
      places: ['Nigeria'],
    });
    const b = person({
      qid: 'Q21',
      label: 'Mary Okafor',
      description: 'Nigerian politician',
      born: 1925,
      died: 2001,
      places: ['Nigeria'],
    });
    const match = matchPerson(
      {
        name: 'Mary Okafor',
        years: [1959],
        role: 'politician',
        place: ['Nigeria'],
      },
      [a, b],
    );
    expect(match).toEqual({
      qid: null,
      reason: '2 people called Mary Okafor fit the research equally (Q20, Q21)',
    });
  });

  it('weighs a closer description when the facts are even', () => {
    expect(
      fitOf(
        {
          role: 'RCA executive and broadcasting pioneer',
          place: ['United States'],
        },
        SARNOFF,
      ),
    ).toBe(2);
    expect(fitOf({ role: 'RCA executive' }, COACH)).toBe(1);
  });
});

describe('where a picture is of', () => {
  const lagosNG: WikiItem = {
    qid: 'Q8673',
    label: 'Lagos',
    aliases: [],
    description: 'largest city in Nigeria',
    types: ['Q515'],
    geo: { lng: 3.3958, lat: 6.4531 },
    images: [],
  };
  const lagosPT: WikiItem = {
    qid: 'Q209014',
    label: 'Lagos',
    aliases: [],
    description: 'city and municipality in Portugal',
    types: ['Q515'],
    geo: { lng: -8.674, lat: 37.102 },
    images: [],
  };

  it('takes the place at the map’s point, not its namesake across the world', () => {
    expect(
      matchPlace({ name: 'Lagos', geo: { lng: 3.38, lat: 6.52 } }, [
        lagosPT,
        lagosNG,
      ]),
    ).toMatchObject({ qid: 'Q8673' });
    expect(
      matchPlace({ name: 'Lagos', geo: { lng: 3.38, lat: 6.52 } }, [lagosPT])
        .qid,
    ).toBeNull();
  });

  it('without a point, takes only the one in the research’s country', () => {
    expect(
      matchPlace({ name: 'Lagos', place: ['Nigeria'] }, [lagosPT, lagosNG]),
    ).toMatchObject({ qid: 'Q8673' });
    expect(matchPlace({ name: 'Lagos' }, [lagosPT, lagosNG]).qid).toBeNull();
  });

  it('measures kilometres on the earth', () => {
    expect(
      Math.round(
        kmBetween({ lng: 3.3958, lat: 6.4531 }, { lng: 7.4383, lat: 10.5222 }),
      ),
    ).toBeGreaterThan(600);
  });
});
