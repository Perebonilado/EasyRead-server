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
