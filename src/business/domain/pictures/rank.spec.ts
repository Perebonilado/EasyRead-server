import {
  eraOf,
  fitsCrop,
  photoOf,
  portraitOf,
  qualityOf,
  scoreOf,
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
