import {
  chipOf,
  clipWords,
  creditOf,
  lifeOf,
  roleWords,
  sourceOf,
  yearOf,
} from './credit';
import type { LicenceVerdict, SourceFile } from './types';

const PD: Extract<LicenceVerdict, { ok: true }> = {
  ok: true,
  code: 'PD-USGov',
  short: 'Public domain',
  tier: 'A',
  attribution: false,
  flags: [],
};
const BY: Extract<LicenceVerdict, { ok: true }> = {
  ok: true,
  code: 'CC BY 4.0',
  short: 'CC BY 4.0',
  tier: 'B',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: true,
  flags: [],
};

const file = (over: Partial<SourceFile> = {}): SourceFile => ({
  source: 'commons',
  sourceId:
    'File:Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519).jpg',
  title:
    'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519)',
  url: 'https://upload.wikimedia.org/x.jpg',
  width: 7541,
  height: 9436,
  mime: 'image/jpeg',
  pageUrl: 'https://commons.wikimedia.org/wiki/File:Ahmadu_Bello.jpg',
  licenceName: 'Public domain',
  licenceCode: 'pd',
  artist: 'doe-oakridge',
  credit:
    'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge',
  description: '60-0730 DOE photo Ed Westcott 7-22-1960 Oak Ridge Tennessee',
  date: '2016-02-10 06:20',
  uploaded: '2016-02-10',
  categories: ['Ahmadu Bello', 'PD US DOE'],
  restrictions: [],
  ...over,
});

describe("a picture's words", () => {
  it('names its source by the archive its credit names, with the photographer when both fit', () => {
    expect(sourceOf(file())).toBe('US Department of Energy');
    expect(
      sourceOf(
        file({
          artist:
            'Abbie Rowe. White House Photographs. John F. Kennedy Presidential Library and Museum, Boston',
          credit:
            'https://www.jfklibrary.org/asset-viewer/archives/JFKWHP/1961',
          description: '',
          categories: ['PD US Government'],
        }),
      ),
    ).toBe('Abbie Rowe, JFK Library');
    expect(
      sourceOf(
        file({
          artist: 'Maarten van Dis',
          credit: 'Own work',
          description: '',
          categories: [],
        }),
      ),
    ).toBe('Maarten van Dis');
    expect(
      sourceOf(
        file({
          artist: 'some-user (talk)',
          credit: 'Own work',
          description: '',
          categories: [],
        }),
      ),
    ).toBe('Wikimedia Commons');
    expect(
      sourceOf(
        file({
          source: 'nasa',
          artist: '',
          credit: '',
          description: '',
          categories: [],
        }),
      ),
    ).toBe('NASA');
  });

  it('writes the chip as subject and year, source, licence', () => {
    expect(
      chipOf({
        subject: 'Ahmadu Bello',
        year: 1960,
        source: 'US Department of Energy',
        licence: PD,
      }),
    ).toBe('Ahmadu Bello, 1960 · US Department of Energy · Public domain');
    expect(
      chipOf({
        subject:
          'A very long subject that goes on and on past what a chip can hold',
        source: 'X',
        licence: BY,
      }),
    ).toBe('A very long subject that goes on and on · X · CC BY 4.0');
  });

  it('writes the full credit: title, author, where from, licence; a CC BY picture as cropped, its own credit line word for word', () => {
    expect(creditOf(file(), PD, 'US Department of Energy')).toBe(
      '“Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519)” by doe-oakridge, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Ahmadu_Bello.jpg), Public domain.',
    );
    expect(
      creditOf(
        file({
          artist: 'Jane Doe',
          attribution: 'Photo: Jane Doe / Example Archive',
        }),
        BY,
        'Jane Doe',
      ),
    ).toBe(
      '“Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519)” by Photo: Jane Doe / Example Archive, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Ahmadu_Bello.jpg), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), cropped.',
    );
  });

  it("reads a file's year from its title, not the day it went online", () => {
    expect(yearOf(file())).toBe(1960);
    expect(
      yearOf(
        file({
          title: 'Lagos street',
          date: '2016-02-10',
          uploaded: '2016-02-10',
          description: 'Taken in 1958 by the colonial office',
        }),
      ),
    ).toBe(1958);
    expect(
      yearOf(
        file({ title: 'Lagos street', date: '1961-07-25', description: '' }),
      ),
    ).toBe(1961);
    expect(
      yearOf(
        file({
          title: 'Lagos street',
          date: 'between 1960 and 1966',
          description: '',
        }),
      ),
    ).toBe(1960);
    expect(
      yearOf(file({ title: 'Lagos street', date: '', description: '' })),
    ).toBeUndefined();
  });

  it("writes a person's years and who they were in three words", () => {
    expect(lifeOf(1910, 1966)).toBe('1910–1966');
    expect(lifeOf(1993)).toBe('born 1993');
    expect(roleWords('Northern Region leader and strategist')).toBe(
      'Northern Region leader',
    );
    expect(
      roleWords('Prime minister and bridge to the independence settlement'),
    ).toBe('Prime minister');
    expect(roleWords('British colonial secretary managing the timetable')).toBe(
      'British colonial secretary',
    );
    expect(roleWords('leader of the West')).toBe('Leader');
    expect(roleWords('')).toBeUndefined();
  });

  it('clips words at a word’s end', () => {
    expect(clipWords('one two three four', 9)).toBe('one two');
    expect(clipWords('short', 9)).toBe('short');
  });
});
