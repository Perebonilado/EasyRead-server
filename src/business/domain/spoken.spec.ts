import { cardinal, remapAligned, spokenForm, year } from './spoken';

describe('numbers as words', () => {
  it('says whole numbers, decimals and years the way a lecturer does', () => {
    expect(cardinal(45000)).toBe('forty-five thousand');
    expect(cardinal(1234567)).toBe(
      'one million two hundred and thirty-four thousand five hundred and sixty-seven',
    );
    expect(cardinal(101)).toBe('one hundred and one');
    expect(year(1998)).toBe('nineteen ninety-eight');
    expect(year(2005)).toBe('two thousand and five');
    expect(year(2010)).toBe('twenty ten');
    expect(year(1900)).toBe('nineteen hundred');
    expect(year(1905)).toBe('nineteen oh five');
    expect(spokenForm('the 1970s and 2000s').text).toBe(
      'the nineteen seventies and two thousands',
    );
  });
});

describe('spokenForm', () => {
  it('spells abbreviations, reads years, ranges, figures and units, and leaves ordinary words alone', () => {
    const { text } = spokenForm(
      'In 1998–99, some 45,000 new cases a year, a 10-fold rise; the CNS is affected in T.b. gambiense, and 5 mg is given, 37.5°C on the 3rd day (e.g. in the DRC).',
    );
    expect(text).toBe(
      'In nineteen ninety-eight to ninety-nine, some forty-five thousand new cases a year, a tenfold rise; the C N S is affected in T B gambiense, and five milligrams is given, thirty-seven point five degrees Celsius on the third day (for example in the D R C).',
    );
  });

  it('says an acronym people say as a word, and a species by the list', () => {
    const list = new Map([
      ['trypanosoma', 'trip-an-oh-SO-ma'],
      ['brucei', 'BROO-see-eye'],
    ]);
    const { text, spans } = spokenForm(
      'AIDS and Trypanosoma brucei, of course.',
      list,
    );
    expect(text).toBe('AIDS and trip-an-oh-SO-ma BROO-see-eye, of course.');
    expect(spans).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ]);
  });

  it('records which spoken words each written word became', () => {
    const { text, spans } = spokenForm('CNS 1998–99 done');
    expect(text).toBe('C N S nineteen ninety-eight to ninety-nine done');
    expect(spans).toEqual([
      [0, 3],
      [3, 7],
      [7, 8],
    ]);
  });
});

describe('the forms a page writes and nobody says', () => {
  const said = (text: string) => spokenForm(text).text;

  it('reads one number over another as a clinician does', () => {
    expect(said('The reading was 120/80 mmHg today.')).toBe(
      'The reading was one hundred and twenty over eighty millimetres of mercury today.',
    );
  });

  it('reads a range that carries its unit', () => {
    expect(said('About 5-10% of cases.')).toBe(
      'About five to ten percent of cases.',
    );
    expect(said('Give 250-500mg twice a day.')).toBe(
      'Give two hundred and fifty to five hundred milligrams twice a day.',
    );
  });

  it('reads the short forms that name a part of a document', () => {
    expect(said('See Fig. 3 for this.')).toBe('See figure three for this.');
    expect(said('Turn to p. 81 and pp. 90-92.')).toBe(
      'Turn to page eighty-one and pages ninety to ninety-two.',
    );
  });

  it('reads a formula letter by letter with its counts as numbers', () => {
    expect(said('It is H2O and CO2.')).toBe('It is H two O and C O two.');
    expect(said('We add NaCl to it.')).toBe('We add NaCl to it.');
  });

  it('reads a compound unit as one per the other', () => {
    expect(said('Use 1 mg/dL as the cut-off.')).toBe(
      'Use one milligrams per decilitre as the cut-off.',
    );
    expect(said('A rate of 90 mL/min is normal.')).toBe(
      'A rate of ninety millilitres per minute is normal.',
    );
    expect(said('It runs at 5mg/kg here.')).toBe(
      'It runs at five milligrams per kilogram here.',
    );
  });

  it('reads a simple ratio, and leaves a clock time alone', () => {
    expect(said('The ratio is 3:1 here.')).toBe(
      'The ratio is three to one here.',
    );
    expect(said('At 10:30 we start.')).toBe('At 10:30 we start.');
  });
});

describe('remapAligned', () => {
  it('gives a written word the span of the spoken words it became', () => {
    const written = 'CNS 1998–99 done';
    const spoken = spokenForm(written);
    // Timings as the aligner reports them on the spoken text, one per spoken word.
    const spokenWords = spoken.text.match(/\S+/g)!;
    let offset = 0;
    const aligned = spokenWords.map((word, index) => {
      const charStart = spoken.text.indexOf(word, offset);
      offset = charStart + word.length;
      return {
        text: word,
        startMs: index * 100,
        endMs: index * 100 + 90,
        charStart,
        charEnd: charStart + word.length,
      };
    });
    const mapped = remapAligned(aligned, spoken, written);
    expect(mapped).toEqual([
      { text: 'CNS', startMs: 0, endMs: 290, charStart: 0, charEnd: 3 },
      { text: '1998–99', startMs: 300, endMs: 690, charStart: 4, charEnd: 11 },
      { text: 'done', startMs: 700, endMs: 790, charStart: 12, charEnd: 16 },
    ]);
  });
});
