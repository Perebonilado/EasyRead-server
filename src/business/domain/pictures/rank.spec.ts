import {
  contemptOf,
  eraOf,
  eventPhotoOf,
  fitsCrop,
  personPhotoOf,
  photoOf,
  portraitOf,
  qualityOf,
  scoreOf,
  thingPhotoOf,
} from './rank';

const centre: [number, number, number, number] = [1 / 3, 1 / 3, 1 / 3, 1 / 3];
/** A subject narrow enough for a tall crop of a wide picture. */
const narrow: [number, number, number, number] = [0.4, 0.3, 0.2, 0.4];

describe('how well a picture serves', () => {
  it('scores by the house weights: resolution, crop, quality, face, era, tier, source', () => {
    const big = scoreOf({
      file: {
        width: 3840,
        height: 2160,
        categories: ['Featured pictures on Wikimedia Commons'],
        institutional: true,
      },
      use: 'photo',
      tier: 'A',
      focal: { box: narrow, from: 'centre' },
      year: 1960,
      years: [1960],
    });
    expect(big.terms).toMatchObject({
      res: 1,
      crop: 1,
      quality: 1,
      face: 0,
      era: 1,
      tier: 1,
      sourceRank: 1,
    });
    expect(big.score).toBeCloseTo(0.25 + 0.2 + 0.15 + 0.1 + 0.1 + 0.05, 5);
    const small = scoreOf({
      file: { width: 960, height: 540, categories: [] },
      use: 'photo',
      tier: 'B',
      focal: { box: centre, from: 'centre' },
      year: 1965,
      years: [1960],
    });
    // The centre third of a wide picture is wider than a tall crop of it.
    expect(small.terms).toMatchObject({
      res: 0.5,
      crop: 0.5,
      quality: 0.3,
      era: 0,
      tier: 0.8,
      sourceRank: 0.6,
    });
    expect(small.score).toBeLessThan(big.score);
  });

  it('gives a portrait its face’s share, and its person’s own Wikidata picture a little more', () => {
    const face = {
      box: [0.3, 0.1, 0.3, 0.3] as [number, number, number, number],
      from: 'depicts' as const,
    };
    const a = scoreOf({
      file: { width: 1000, height: 1200, categories: [] },
      use: 'portrait',
      tier: 'A',
      focal: face,
    });
    const b = scoreOf({
      file: { width: 1000, height: 1200, categories: [], chosen: true },
      use: 'portrait',
      tier: 'A',
      focal: face,
    });
    expect(a.terms.face).toBe(1);
    expect(b.score - a.score).toBeCloseTo(0.1, 5);
  });

  it('ranks a sharper, nominated, era-true archive photo over a small modern one', () => {
    const archive = scoreOf({
      file: {
        width: 2560,
        height: 1700,
        categories: ['Quality images'],
        institutional: true,
      },
      use: 'photo',
      tier: 'A',
      focal: { box: centre, from: 'centre' },
      year: 1958,
      years: [1957, 1958],
    });
    const modern = scoreOf({
      file: { width: 1200, height: 900, categories: [] },
      use: 'photo',
      tier: 'B',
      focal: { box: centre, from: 'centre' },
      year: 2015,
      years: [1957, 1958],
    });
    expect(archive.score).toBeGreaterThan(modern.score);
  });

  it('fits a focal box into crops of either shape', () => {
    // A subject at the side of a wide picture fits a wide crop, not a tall one wider than the crop.
    expect(
      fitsCrop([0.05, 0.2, 0.5, 0.5], { width: 1600, height: 900 }, 16 / 9),
    ).toBe(true);
    expect(
      fitsCrop([0.05, 0.2, 0.5, 0.5], { width: 1600, height: 900 }, 9 / 16),
    ).toBe(false);
    expect(fitsCrop(centre, { width: 1600, height: 900 }, 9 / 16)).toBe(false);
    expect(fitsCrop(narrow, { width: 1600, height: 900 }, 9 / 16)).toBe(true);
  });

  it('reads Commons’ nominations and an era', () => {
    expect(qualityOf(['Valued images of Nigeria'])).toBe('valued');
    expect(qualityOf(['Lagos'])).toBeNull();
    expect(eraOf(1960, [1957, 1962])).toBeCloseTo(0.6, 5);
    expect(eraOf(undefined, [1960])).toBe(0);
    expect(eraOf(1960, [])).toBe(0.5);
  });
});

describe('whether a picture can serve', () => {
  const bello = { qid: 'Q401032', name: 'Ahmadu Bello' };

  it('takes a portrait of the person alone (their own Wikidata picture)', () => {
    expect(
      portraitOf(
        {
          title:
            'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519)',
          description:
            '60-0730 DOE photo Ed Westcott 7-22-1960 Oak Ridge Tennessee',
          depicts: [{ qid: 'Q401032' }],
          chosen: true,
        },
        bello,
      ),
    ).toEqual({ ok: true });
  });

  it('refuses a group: names joined, people placed left to right, another person depicted', () => {
    expect(
      portraitOf(
        { title: 'Ahmadu Bello with Nnamdi Azikiwe', description: '' },
        bello,
      ).ok,
    ).toBe(false);
    expect(
      portraitOf(
        {
          title:
            'Premier of Nigeria Sir Ahmadu Bello far right leaving the Atomic Museum Oak Ridge',
          description:
            'Premier of Nigeria Sir Ahmadu Bello far right leaving the Atomic Museum',
        },
        bello,
      ).ok,
    ).toBe(false);
    expect(
      portraitOf(
        {
          title: 'Ahmadu Bello, 1960',
          description: 'Bello',
          depicts: [{ qid: 'Q401032' }, { qid: 'Q181782' }],
        },
        bello,
      ),
    ).toEqual({ ok: false, reason: 'it depicts someone else too' });
    expect(
      portraitOf(
        {
          title: 'Luncheon in honor of Prime Minister Ahmadu Bello',
          description:
            '(L – R): Military Aide to the President; Premier Bello; unidentified man.',
        },
        bello,
      ).ok,
    ).toBe(false);
  });

  it('refuses a thing of theirs, a picture made after they died, and an undated one nobody chose', () => {
    const balewa = {
      qid: 'Q335684',
      name: 'Abubakar Tafawa Balewa',
      died: 1966,
    };
    // A phone's photograph of a framed print on a museum wall, called "own work", 2024.
    expect(
      portraitOf(
        {
          title: 'Abubakar Tafawa Balewa 1',
          description:
            'Sir Abubakar Tafawa Balewa (first prime minister of Nigeria) commissioning first tractor',
        },
        balewa,
        2024,
      ),
    ).toEqual({ ok: false, reason: 'made in 2024, after they died in 1966' });
    expect(
      portraitOf(
        { title: "Nnamdi Azikiwe's birthplace, Zungeru", description: '' },
        { qid: 'Q181782', name: 'Nnamdi Azikiwe', died: 1996 },
        2010,
      ).ok,
    ).toBe(false);
    expect(
      portraitOf(
        { title: 'Statue of Ahmadu Bello, Kaduna', description: '' },
        bello,
        2012,
      ).ok,
    ).toBe(false);
    expect(
      portraitOf({ title: 'Ahmadu Bello portrait', description: '' }, bello),
    ).toEqual({
      ok: false,
      reason: 'it has no date, and nobody chose it as theirs',
    });
    // A dated photograph of him alone at his desk, in his life.
    expect(
      portraitOf(
        {
          title: 'Nnamdi Azikiwe in Office, 1937',
          description: 'Nnamdi Azikiwe in Office, 1937',
        },
        { qid: 'Q181782', name: 'Nnamdi Azikiwe', died: 1996 },
        1937,
      ),
    ).toEqual({ ok: true });
  });

  it('refuses a file that does not say it is of them', () => {
    expect(
      portraitOf({ title: 'Kaduna regional chamber', description: '' }, bello),
    ).toEqual({ ok: false, reason: 'it does not say it is of them' });
  });

  it('takes a photo that names its place, in the place’s country, from the research’s years', () => {
    const file = {
      title: 'Lagos harbour 1958',
      description: 'The port of Lagos, Nigeria',
      categories: ['1958 in Nigeria'],
    };
    const query = {
      name: 'Lagos',
      kind: 'place' as const,
      years: [1957, 1960],
      place: ['Nigeria'],
    };
    expect(photoOf(file, query, 'Q8673', 1958)).toEqual({ ok: true });
  });

  it('refuses a photo of another time, of another Lagos, with no date, or not naming the place', () => {
    const query = {
      name: 'Lagos',
      kind: 'place' as const,
      years: [1957, 1960],
      place: ['Nigeria'],
    };
    const why = (
      title: string,
      description: string,
      year: number | undefined,
    ): string => {
      const verdict = photoOf(
        { title, description, categories: [] },
        query,
        undefined,
        year,
      );
      return verdict.ok ? '' : verdict.reason;
    };
    expect(why('Lagos skyline', 'Lagos, Nigeria', 2015)).toMatch(/2015/u);
    expect(why('Lagos beach', 'Algarve, Portugal', 1958)).toMatch(/Nigeria/u);
    expect(why('Lagos street', 'Nigeria', undefined)).toMatch(/no date/u);
    expect(why('Ibadan market', 'Nigeria 1958', 1958)).toMatch(
      /does not name/u,
    );
  });

  it('holds an event to its year, give or take one', () => {
    const event = {
      name: 'Lagos',
      kind: 'event' as const,
      years: [1960],
      place: ['Nigeria'],
    };
    const file = {
      title: 'Independence day in Lagos',
      description: 'Lagos, Nigeria',
      categories: [],
    };
    expect(photoOf(file, event, undefined, 1961).ok).toBe(true);
    expect(photoOf(file, event, undefined, 1963).ok).toBe(false);
  });
});

describe('whether a picture can be one more photo of a person, of an event or of a thing', () => {
  const bello = {
    qid: 'Q401032',
    name: 'Ahmadu Bello',
    died: 1966,
    category: 'Ahmadu Bello',
  };
  const file = (title: string, over: object = {}) => ({
    title,
    description: '',
    categories: [] as string[],
    ...over,
  });

  it('takes a photo of a person among others, as a portrait never would be', () => {
    const group = file(
      'Premier of Nigeria Sir Ahmadu Bello far right leaving the Atomic Museum',
    );
    expect(portraitOf(group, bello, 1960).ok).toBe(false);
    expect(personPhotoOf(group, bello, 1960)).toEqual({ ok: true });
    // Named in the description in full, or by surname in a file of their own category.
    expect(
      personPhotoOf(
        file('Independence ceremony, Lagos', {
          description: 'Sir Ahmadu Bello and the Governor-General',
        }),
        bello,
        1960,
      ).ok,
    ).toBe(true);
    expect(
      personPhotoOf(
        file('Bello at Kaduna airport arrival', {
          categories: ['Ahmadu Bello'],
        }),
        bello,
        1961,
      ).ok,
    ).toBe(true);
    expect(personPhotoOf(file('Bello at Kaduna'), bello, 1961).ok).toBe(false);
  });

  it('never takes a likeness, a thing named after them, a photo after their death, or an undated one', () => {
    const no = (title: string, year?: number, over: object = {}) => {
      const fit = personPhotoOf(file(title, over), bello, year);
      return fit.ok ? 'ok' : fit.reason;
    };
    expect(no('Statue of Ahmadu Bello in Kaduna', 1970)).toMatch(/likeness/u);
    expect(no('Ahmadu Bello on a Nigerian stamp', 1966)).toMatch(/likeness/u);
    expect(no('Ahmadu Bello University main gate', 1964)).toMatch(
      /named after/u,
    );
    expect(no('Ahmadu Bello Way, Kaduna', 1964)).toMatch(/named after/u);
    expect(
      no('Ahmadu Bello at the opening of Kaduna Polytechnic', 1975),
    ).toMatch(/after they died/u);
    expect(no('Ahmadu Bello at a rally')).toMatch(/no date/u);
    expect(
      no('Ahmadu Bello at a rally', undefined, {
        depicts: [{ qid: 'Q401032' }],
      }),
    ).toBe('ok');
  });

  const independence = {
    name: 'Nigeria becomes independent',
    years: [1960],
    place: ['Nigeria'],
    words: ['Nigeria becomes independent by act and constitutional order'],
  };

  it('takes an event’s photo of its year carrying its words: two of them, or one with its place', () => {
    expect(
      eventPhotoOf(
        file(
          'The Prime Minister, Sir Abubakar Tafawa Balewa on Independence Day, October 1, 1960',
          {
            categories: ['1960 in Nigeria'],
          },
        ),
        independence,
        1960,
      ),
    ).toEqual({ ok: true });
    expect(
      eventPhotoOf(
        file('Independence constitutional order signed'),
        independence,
        1961,
      ).ok,
    ).toBe(true);
  });

  it('refuses an event’s photo of another year, with no date, without its words, or commemorating it', () => {
    const why = (
      title: string,
      year: number | undefined,
      over: object = {},
    ) => {
      const fit = eventPhotoOf(file(title, over), independence, year);
      return fit.ok ? 'ok' : fit.reason;
    };
    expect(why('Nigerian independence parade', 1965)).toMatch(
      /not in the event’s year/u,
    );
    // The year before an event is never of it: the 1957 conference's
    // opening for the conference resumed in 1958.
    expect(
      eventPhotoOf(
        file('The 1957 Nigerian Constitutional Conference'),
        {
          name: 'Resumed constitutional conference',
          years: [1958],
          place: ['Nigeria'],
          words: [
            'Resumed constitutional conference sets out the path to independence',
          ],
        },
        1957,
      ),
    ).toEqual({ ok: false, reason: 'taken in 1957, not in the event’s year' });
    expect(why('Nigerian independence parade', undefined)).toMatch(/no date/u);
    expect(
      why('A street in Lagos', 1960, { categories: ['1960 in Nigeria'] }),
    ).toMatch(/does not carry the event’s words/u);
    expect(why('Nigerian independence memorial plaque', 1960)).toMatch(
      /commemorates/u,
    );
    expect(
      eventPhotoOf(
        file('Independence Day, Lagos'),
        { ...independence, years: [] },
        1960,
      ).ok,
    ).toBe(false);
  });

  it('takes a thing’s photo only when it names the thing in whole words, or depicts it', () => {
    const iconoscope = { name: 'iconoscope', words: ['iconoscope'] };
    expect(
      thingPhotoOf(file('Zworykin and iconoscope'), iconoscope, undefined).ok,
    ).toBe(true);
    expect(thingPhotoOf(file('Iconoscopes'), iconoscope, undefined).ok).toBe(
      true,
    );
    expect(
      thingPhotoOf(file('An early camera tube'), iconoscope, undefined).ok,
    ).toBe(false);
    expect(
      thingPhotoOf(
        file('An early camera tube', { depicts: [{ qid: 'Q1570706' }] }),
        iconoscope,
        'Q1570706',
      ).ok,
    ).toBe(true);
    // A televisor is not any television.
    expect(
      thingPhotoOf(
        file('Mechanical television receiver 1927'),
        { name: 'televisor' },
        undefined,
      ).ok,
    ).toBe(false);
  });
});

describe('what is never a picture of anyone or anything', () => {
  // A 1940 Polish montage, "Who rules the USA?", that names David Sarnoff
  // among the men it hates: the desk once took it as a photo of him.
  const montage = {
    title:
      'Kto rządzi USA? Henry Morgenthau, Walter Lippmann, Felix Frankfurter, Bernhard M. Baruch, David Sarnott, Sol Bloom',
    description: 'Antisemitic propaganda leaflet, 1940',
    categories: ['Antisemitic propaganda', 'David Sarnoff'],
    depicts: [{ qid: 'Q360106' }],
  };
  const sarnoff = { qid: 'Q360106', name: 'David Sarnoff', died: 1971 };

  it('refuses hate’s and mockery’s work for every use', () => {
    expect(personPhotoOf(montage, sarnoff, 1940)).toEqual({
      ok: false,
      reason: 'it is propaganda or caricature, made to mock or to hate',
    });
    expect(portraitOf({ ...montage, chosen: true }, sarnoff, 1940).ok).toBe(
      false,
    );
    expect(
      thingPhotoOf(
        { ...montage, title: 'A television set in a propaganda poster' },
        { name: 'television set' },
        undefined,
      ).ok,
    ).toBe(false);
  });

  it('refuses a poster, a cartoon or a collage as a photo of a person, a place or an event; a thing may be shown by its advertisement', () => {
    const poster = {
      title: '1939 RCA Television Advertisement',
      description: 'An RCA poster for its television sets',
      categories: ['Advertisements in the United States'],
    };
    expect(contemptOf(poster)).toBe(
      'it is a poster, a cartoon or a collage, not a photograph',
    );
    expect(contemptOf(poster, false)).toBeNull();
    expect(
      eventPhotoOf(
        { ...poster, title: 'RCA television World’s Fair 1939 poster' },
        {
          name: 'RCA introduces television',
          years: [1939],
          words: ['RCA introduces television at the New York World’s Fair'],
        },
        1939,
      ),
    ).toEqual({
      ok: false,
      reason: 'it is a poster, a cartoon or a collage, not a photograph',
    });
  });
});

describe('an event is of its own people, bodies and things, not of its verbs', () => {
  const baird = {
    name: 'Baird demonstrates television',
    years: [1926],
    place: ['Frith Street, London'],
    words: [
      'Baird demonstrates television to members of the Royal Institution',
      'Frith Street, London',
    ],
    names: ['baird', 'Royal Institution'],
  };

  it('refuses a Dutch 1926 demonstration of aircraft for Baird’s of television', () => {
    expect(
      eventPhotoOf(
        {
          title:
            "Demonstratie van twee experimentele vliegtuigen het staartloze vliegtuig en de 'windmolen'",
          description: 'Londen, 1926',
          categories: ['1926 in London'],
        },
        baird,
        1926,
      ),
    ).toEqual({
      ok: false,
      reason: 'it names none of the event’s own (baird, royal, instit)',
    });
  });

  it('takes a photo naming Baird and his television that year', () => {
    expect(
      eventPhotoOf(
        {
          title: 'John Logie Baird and his television apparatus, 1926',
          description: '',
          categories: [],
        },
        baird,
        1926,
      ),
    ).toEqual({ ok: true });
  });
});

describe('an event is where it happened', () => {
  const fair = {
    name: 'RCA introduces television',
    years: [1939],
    place: ['New York'],
    words: [
      "RCA introduces television at the New York World's Fair",
      'New York',
    ],
    names: ['RCA', "New York World's Fair"],
  };

  it('refuses a photo its words place in another city far off', () => {
    expect(
      eventPhotoOf(
        {
          title:
            'FCC Chairman faces lens of television camera. Washington, D.C., Chairman Frank R. McNinch',
          description: 'RCA television demonstration, 1939',
          categories: [],
        },
        fair,
        1939,
      ),
    ).toEqual({
      ok: false,
      reason: 'its words place it in Washington, D.C., not New York',
    });
  });

  it('takes one placed there, or placed nowhere', () => {
    expect(
      eventPhotoOf(
        {
          title: "RCA television at the 1939 New York World's Fair",
          description: '',
          categories: [],
        },
        fair,
        1939,
      ).ok,
    ).toBe(true);
    expect(
      eventPhotoOf(
        {
          title: "RCA television pavilion, World's Fair",
          description: '',
          categories: [],
        },
        fair,
        1939,
      ).ok,
    ).toBe(true);
  });
});
