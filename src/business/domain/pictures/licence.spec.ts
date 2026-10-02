import {
  licenceModeOf,
  licenceOf,
  licenceUnder,
  licenceWordsOf,
  plainText,
  redFlagOf,
  structuredAgrees,
  type LicenceInput,
} from './licence';

/** A Commons file as the adapter hands it over, with what a case changes. */
const file = (over: Partial<LicenceInput> = {}): LicenceInput => ({
  source: 'commons',
  licenceName: 'Public domain',
  licenceCode: 'pd',
  artist: 'Ed Westcott',
  credit: 'US Department of Energy',
  description: 'A visitor at a laboratory',
  title: 'A visitor at Oak Ridge 1960',
  categories: ['PD US DOE'],
  restrictions: [],
  structured: { status: ['Q19652'], licences: [] },
  year: 1960,
  ...over,
});

const refusedFor = (over: Partial<LicenceInput>) => {
  const verdict = licenceOf(file(over));
  if (verdict.ok) throw new Error(`expected a refusal, got ${verdict.code}`);
  return verdict.reason;
};

describe('the licence screen', () => {
  describe('what it allows', () => {
    it('takes a US government work as public domain, tier A, with no credit owed', () => {
      expect(licenceOf(file())).toMatchObject({
        ok: true,
        code: 'PD-USGov',
        short: 'Public domain',
        tier: 'A',
        attribution: false,
      });
    });

    it('takes a White House photograph tagged PD US Government (a JFK Library file)', () => {
      expect(
        licenceOf(
          file({
            artist:
              'Abbie Rowe. White House Photographs. John F. Kennedy Presidential Library and Museum, Boston',
            credit:
              'https://www.jfklibrary.org/asset-viewer/archives/JFKWHP/1961',
            categories: [
              'PD US Government',
              'CC-PD-Mark',
              'White House in July 1961',
            ],
            year: 1961,
          }),
        ),
      ).toMatchObject({ ok: true, code: 'PD-USGov' });
    });

    it('takes public domain by age only with a US reason, or when it is older than US copyright', () => {
      expect(
        licenceOf(file({ categories: ['PD-old-70-expired'], year: 1950 })),
      ).toMatchObject({ ok: true, code: 'PD-old' });
      expect(
        licenceOf(
          file({
            categories: ['PD-US-no notice'],
            artist: 'Unknown author',
            year: 1955,
          }),
        ),
      ).toMatchObject({ ok: true, code: 'PD' });
      expect(
        licenceOf(file({ categories: ['PD-old-100'], year: 1890 })),
      ).toMatchObject({ ok: true, code: 'PD-old' });
      expect(
        licenceOf(file({ categories: ['PD-Art (PD-old-100)'], year: 1820 })),
      ).toMatchObject({ ok: true, code: 'PD-art' });
      expect(refusedFor({ categories: ['PD-old-70'], year: 1950 })).toMatch(
        /no reason it is in the US/u,
      );
    });

    it('takes CC0 and CC BY 4.0 from a named author, the latter tier B with credit owed', () => {
      expect(
        licenceOf(
          file({
            licenceName: 'CC0',
            licenceCode: 'cc0',
            artist: 'Gwanki',
            credit: 'Own work',
            categories: ['CC-Zero', 'Self-published work'],
            structured: { status: ['Q88088423'], licences: ['Q6938433'] },
            year: 2024,
          }),
        ),
      ).toMatchObject({ ok: true, code: 'CC0', tier: 'A' });
      const by = licenceOf(
        file({
          licenceName: 'CC BY 4.0',
          licenceCode: 'cc-by-4.0',
          artist: 'A. Photographer',
          credit: 'Own work',
          categories: ['CC-BY-4.0'],
          structured: { status: ['Q50423863'], licences: ['Q20007257'] },
          year: 2019,
        }),
      );
      expect(by).toMatchObject({
        ok: true,
        code: 'CC BY 4.0',
        short: 'CC BY 4.0',
        tier: 'B',
        attribution: true,
        url: 'https://creativecommons.org/licenses/by/4.0/',
      });
    });

    it('takes a file offered under CC BY as well as ShareAlike, under CC BY', () => {
      expect(
        licenceOf(
          file({
            licenceName: 'CC BY-SA 4.0',
            licenceCode: 'cc-by-sa-4.0',
            artist: 'A. Photographer',
            categories: ['CC-BY-SA-4.0', 'CC-BY-4.0'],
            structured: {
              status: ['Q50423863'],
              licences: ['Q18199165', 'Q20007257'],
            },
            year: 2019,
          }),
        ),
      ).toMatchObject({ ok: true, code: 'CC BY 4.0' });
    });

    it("takes a museum's own CC0 and NASA's own work without asking who the author was", () => {
      expect(
        licenceOf(
          file({
            source: 'met',
            licenceName: 'CC0',
            licenceCode: 'cc0',
            artist: '',
            categories: [],
            structured: null,
            year: 1700,
          }),
        ),
      ).toMatchObject({ ok: true, code: 'CC0' });
      expect(
        licenceOf(
          file({
            source: 'nasa',
            artist: 'NASA/Bill Ingalls',
            credit: 'NASA',
            categories: ['PD-USGov-NASA'],
            structured: null,
          }),
        ),
      ).toMatchObject({ ok: true, code: 'PD-USGov' });
    });

    it('notes, but does not refuse, a personality right and a file with no structured licence', () => {
      const verdict = licenceOf(
        file({ restrictions: ['personality'], structured: null }),
      );
      expect(verdict.ok && verdict.flags).toEqual([
        'restriction: personality',
        'no structured licence on Commons',
      ]);
    });
  });

  describe('what it refuses', () => {
    it('refuses ShareAlike, GFDL, non-commercial, no-derivatives and anything unclear', () => {
      expect(
        refusedFor({
          licenceName: 'CC BY-SA 3.0',
          licenceCode: 'cc-by-sa-3.0',
          categories: ['GFDL'],
        }),
      ).toMatch(/ShareAlike/u);
      expect(
        refusedFor({
          licenceName: 'GFDL',
          licenceCode: 'gfdl',
          categories: [],
        }),
      ).toBe('GFDL only');
      expect(
        refusedFor({
          licenceName: 'CC BY-NC 4.0',
          licenceCode: 'cc-by-nc-4.0',
          categories: [],
        }),
      ).toMatch(/commercial/u);
      expect(
        refusedFor({
          licenceName: 'CC BY-ND 2.0',
          licenceCode: 'cc-by-nd-2.0',
          categories: [],
        }),
      ).toMatch(/commercial use or changes/u);
      expect(
        refusedFor({
          licenceName: 'No restrictions',
          licenceCode: '',
          categories: [],
        }),
      ).toMatch(/unclear/u);
      expect(
        refusedFor({ licenceName: '', licenceCode: '', categories: [] }),
      ).toMatch(/unclear/u);
    });

    it('refuses public domain with only a country’s reason (a Library of Congress portrait tagged PD-Nigeria)', () => {
      expect(
        refusedFor({
          artist: 'Unknown author',
          credit: 'Library of Congress https://lccn.loc.gov/2020761071',
          categories: [
            'Abubakar Tafawa Balewa',
            'PD-Nigeria',
            'PD Nigeria - Public Figure Portraits',
          ],
          year: 1960,
        }),
      ).toMatch(/PD-Nigeria.*no reason it is in the US/u);
    });

    it('refuses a work its categories say is under copyright in the US (a 1936 studio portrait tagged PD-UK)', () => {
      expect(
        refusedFor({
          artist: 'Bassano Ltd (active 1901-1962)',
          credit: 'http://www.npg.org.uk/collections/search/portrait/mw131490',
          categories: [
            'Alan Lennox-Boyd',
            'PD-UK',
            'Works copyrighted in the U.S.',
          ],
          year: 1936,
        }),
      ).toMatch(/copyright in the US/u);
    });

    it("refuses Commons' bare PD-US tag on a work made after 1930 (a 1937 photograph), and takes it on an older one", () => {
      expect(
        refusedFor({
          artist: 'Duckworth, E.H',
          credit: 'https://dc.library.northwestern.edu/items/d2fa1a6b',
          categories: [
            'Nigeria',
            'PD US',
            'PD-US missing SDC copyright status',
          ],
          structured: null,
          year: 1937,
        }),
      ).toMatch(/no reason given/u);
      expect(
        licenceOf(
          file({ categories: ['PD US'], structured: null, year: 1921 }),
        ),
      ).toMatchObject({ ok: true, code: 'PD' });
    });

    it('refuses public domain claimed with no reason at all', () => {
      expect(refusedFor({ categories: ['Lagos'] })).toMatch(/no reason given/u);
    });

    it.each([
      [
        'an AP Archive frame on YouTube (an "own work" screenshot)',
        {
          licenceName: 'CC BY-SA 4.0',
          licenceCode: 'cc-by-sa-4.0',
          artist: 'Kambai Akau',
          credit: 'Own work',
          description:
            'An interview on 4 April 1967. Archive footage screenshot from YouTube video by AP Archive.',
        },
        /Associated Press|screenshot|YouTube/u,
      ],
      ['an AP credit', { credit: 'AP' }, /Associated Press/u],
      ['Reuters', { credit: 'REUTERS/Staff' }, /Reuters/u],
      ['Getty Images', { credit: 'Getty Images' }, /Getty/u],
      ['AFP', { artist: 'AFP' }, /AFP/u],
      [
        'Agence France-Presse in a description',
        { description: 'Photo by Agence France-Presse' },
        /AFP/u,
      ],
      [
        'Drum magazine (a book "from the pages of Drum magazine")',
        {
          artist: 'Sally Dyson and Alhaji L. A. K. Abibi.',
          credit:
            "Nigeria : The Birth of Africa's Greatest Country : from the pages of Drum magazine.",
          categories: ['CC-Zero', 'PD-Nigeria'],
        },
        /Drum/u,
      ],
      [
        "Drum's archive (BAHA) in a description",
        {
          artist: 'Unknown',
          credit: 'UCLA',
          description: 'From the BAHA Drum Magazine Social History Photographs',
        },
        /Drum/u,
      ],
      ['Magnum', { credit: 'Magnum Photos' }, /Magnum/u],
      [
        'a screen grab',
        { description: 'Screen grab of the evening news' },
        /screenshot/u,
      ],
      [
        'a frame of a broadcast called "own work"',
        {
          credit: 'Own work',
          description: 'Still of the television interview',
        },
        /screenshot|broadcast/u,
      ],
    ])('refuses %s', (_what, over, why) => {
      expect(refusedFor(over as Partial<LicenceInput>)).toMatch(why);
    });

    it('does not take the J. Paul Getty Museum, a drum or a magnum in a description for an agency', () => {
      expect(
        redFlagOf(file({ credit: 'J. Paul Getty Museum open content' })),
      ).toBeNull();
      expect(
        redFlagOf(file({ description: 'A man plays a drum at the festival' })),
      ).toBeNull();
    });

    it('refuses CC0 from an unknown author (a 1960 banquet uploaded in 2024 as CC0)', () => {
      expect(
        refusedFor({
          licenceName: 'CC0',
          licenceCode: 'cc0',
          artist: 'Unknown author',
          credit: 'Own work',
          categories: ['CC-Zero'],
          structured: { status: ['Q88088423'], licences: ['Q6938433'] },
          year: 1960,
        }),
      ).toMatch(/author is unknown/u);
    });

    it('refuses an "own work" older than 1970 under a free licence', () => {
      expect(
        refusedFor({
          licenceName: 'CC BY 4.0',
          licenceCode: 'cc-by-4.0',
          artist: 'Grandchild',
          credit: 'Own work',
          categories: ['CC-BY-4.0', 'Self-published work'],
          structured: { status: ['Q50423863'], licences: ['Q20007257'] },
          year: 1958,
        }),
      ).toMatch(/own work.*1958/u);
    });

    it('refuses CC BY before 4.0 without a named author', () => {
      expect(
        refusedFor({
          licenceName: 'CC BY 2.0',
          licenceCode: 'cc-by-2.0',
          artist: '',
          categories: ['CC-BY-2.0'],
          structured: { status: [], licences: ['Q19125117'] },
          year: 2012,
        }),
      ).toMatch(/needs its author|without a named author/u);
    });

    it('refuses a file whose licence Commons doubts, a watermark, and a picture a machine made', () => {
      expect(
        refusedFor({
          categories: ['PD US DOE', 'Deletion requests March 2026'],
        }),
      ).toMatch(/in doubt/u);
      expect(
        refusedFor({ categories: ['PD US DOE', 'License review needed'] }),
      ).toMatch(/in doubt/u);
      expect(
        refusedFor({ categories: ['PD US DOE', 'Images with watermarks'] }),
      ).toMatch(/watermark/u);
      expect(
        refusedFor({ categories: ['PD US DOE', 'AI-generated images'] }),
      ).toMatch(/machine/u);
    });

    it('refuses a file whose structured data gives another licence than its page', () => {
      expect(
        refusedFor({
          structured: { status: ['Q50423863'], licences: ['Q18199165'] },
        }),
      ).toMatch(/structured data/u);
    });
  });

  it('reads structured data: public domain, CC0, the same CC BY, or nothing said', () => {
    expect(
      structuredAgrees('PD-USGov', { status: ['Q19652'], licences: [] }),
    ).toBe(true);
    expect(structuredAgrees('PD', { status: [], licences: ['Q7257361'] })).toBe(
      true,
    );
    expect(
      structuredAgrees('CC0', { status: ['Q88088423'], licences: [] }),
    ).toBe(true);
    expect(
      structuredAgrees('CC BY 3.0', {
        status: ['Q50423863'],
        licences: ['Q20007257'],
      }),
    ).toBe(false);
    expect(structuredAgrees('CC BY 4.0', null)).toBeNull();
    expect(
      structuredAgrees('CC BY 4.0', { status: [], licences: [] }),
    ).toBeNull();
  });

  it("reads a source's HTML as words", () => {
    expect(
      plainText(
        '<a href="//commons.wikimedia.org/wiki/User:X" title="User:X">Kambai&nbsp;Akau</a> &amp; <b>co</b>',
      ),
    ).toBe('Kambai Akau & co');
  });

  describe('the switch (PICTURE_LICENCE)', () => {
    // Files the screen refused for the Nigerian films, as the picture
    // cache kept them on 2026-10-02.
    const leiden = file({
      licenceName: 'CC BY-SA 4.0',
      licenceCode: 'cc-by-sa-4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      artist: 'H.F.J.M. Crebolder',
      credit: 'NSAG Crebolder Collection',
      title:
        'ASC Leiden - NSAG - Crebolder 2 - 40 - Independence ceremony. Robertson GG, Princess Alexandra, Abubakar Tafawa Balewa, President - Lagos, Nigeria - October 1, 1960',
      description:
        'A postcard? "Princess, Governor and Balewa". Royal Pavilion, Racecourse, Lagos, October 1, 1960, First Day Ceremony of the Nigerian Independence.',
      categories: [
        'Postcards of Nigeria',
        'Images from the African Studies Centre (Leiden)',
        'Abubakar Tafawa Balewa',
        'Self-published work',
        'Princess Alexandra of Kent in 1960',
      ],
      structured: { status: ['Q50423863'], licences: ['Q18199165'] },
    });
    const swearing = file({
      artist: 'Private Photo Library Eko Adele; Emi Ni Afrika',
      credit: 'https://www.facebook.com/share/s1s4Fzdu7ZmbPvLv/',
      title: 'Azikiwe swearing Balewa as prime minister, 1960',
      description: 'Azikiwe swearing Balewa as prime minister, 1960',
      categories: ['1960 in Nigeria', 'PD-Nigeria', 'PD Nigeria - Images'],
      structured: null,
    });
    const drum = file({
      artist: 'Drum Magazine photographer',
      credit: 'UCLA BAHA Drum Magazine Archive',
      title: 'Portrait of Ahmadu Bello',
      description: '',
      categories: ['Ahmadu Bello', 'PD-Nigeria'],
      year: undefined,
    });
    const apFrame = file({
      licenceName: 'CC BY-SA 4.0',
      licenceCode: 'cc-by-sa-4.0',
      artist: 'Kambai Akau',
      credit: 'Own work',
      title: 'Nnamdi Azikiwe 1',
      description:
        'Nnamdi Azikiwe during an interview on 4 April 1967. Archive footage screenshot from YouTube video by AP Archive.',
      categories: ['Nnamdi Azikiwe', 'Self-published work'],
      year: 1967,
    });
    const noReason = file({
      artist: 'Duckwood, E.H',
      credit: 'https://dc.library.northwestern.edu/items/937d7fbf',
      title:
        'Dr. John A. Hannah, Dr. Nnamdi Azikiwe and Dr. George Johnson on the campus of the University of Nigeria, Nsukka',
      description: 'Azikiwe in UNN',
      categories: ['Nnamdi Azikiwe', '1960 in Nigeria'],
      structured: null,
    });

    it('is off unless the settings say on', () => {
      expect(licenceModeOf(undefined)).toBe('off');
      expect(licenceModeOf('')).toBe('off');
      expect(licenceModeOf('off')).toBe('off');
      expect(licenceModeOf(' ON ')).toBe('on');
      expect(licenceModeOf('true')).toBe('on');
    });

    it('off: takes share-alike, public domain in its own country, and agency- and magazine-credited files, under the licence their source names', () => {
      expect(licenceUnder(leiden, 'off')).toMatchObject({
        ok: true,
        code: 'unchecked',
        short: 'CC BY-SA 4.0',
        tier: 'B',
        url: 'https://creativecommons.org/licenses/by-sa/4.0',
        attribution: true,
        flags: [
          'licence not checked: ShareAlike (CC BY-SA) is not used until its legal read',
        ],
      });
      expect(licenceUnder(swearing, 'off')).toMatchObject({
        ok: true,
        code: 'unchecked',
        short: 'Public domain',
        tier: 'A',
        attribution: false,
        flags: [
          'licence not checked: public domain in its own country (PD-Nigeria), with no reason it is in the US',
        ],
      });
      expect(licenceUnder(drum, 'off')).toMatchObject({
        ok: true,
        short: 'Public domain',
        flags: [
          'licence not checked: its credit or description names Drum magazine',
        ],
      });
      expect(licenceUnder(apFrame, 'off')).toMatchObject({
        ok: true,
        short: 'CC BY-SA 4.0',
        flags: [
          'licence not checked: its credit or description names the Associated Press',
        ],
      });
      expect(licenceUnder(noReason, 'off')).toMatchObject({
        ok: true,
        short: 'Public domain',
      });
    });

    it('off: a file the screen clears keeps the screen’s own verdict', () => {
      expect(licenceUnder(file(), 'off')).toEqual(licenceOf(file()));
    });

    it('on: keeps today’s verdicts exactly', () => {
      for (const one of [leiden, swearing, drum, apFrame, noReason, file()])
        expect(licenceUnder(one, 'on')).toEqual(licenceOf(one));
      expect(licenceUnder(leiden, 'on')).toMatchObject({ ok: false });
      expect(licenceUnder(swearing, 'on')).toEqual({
        ok: false,
        reason:
          'public domain in its own country (PD-Nigeria), with no reason it is in the US',
      });
      expect(licenceUnder(drum, 'on')).toMatchObject({
        ok: false,
        reason: 'its credit or description names Drum magazine',
      });
      expect(licenceUnder(noReason, 'on')).toMatchObject({
        ok: false,
        reason: 'public domain is claimed with no reason given',
      });
    });

    it('off still refuses a picture a machine made and a watermark: they are no licence’s', () => {
      expect(
        licenceUnder(
          file({
            licenceName: 'CC BY-SA 4.0',
            licenceCode: 'cc-by-sa-4.0',
            categories: ['AI-generated images'],
          }),
          'off',
        ),
      ).toEqual({
        ok: false,
        reason: 'it was made by a machine, not taken of the thing',
      });
      expect(
        licenceUnder(
          file({
            licenceName: 'CC BY-SA 4.0',
            licenceCode: 'cc-by-sa-4.0',
            categories: ['Images with watermarks'],
          }),
          'off',
        ),
      ).toEqual({ ok: false, reason: 'it carries a watermark' });
    });

    it('names a licence shortly for the chip', () => {
      expect(
        licenceWordsOf({ licenceName: 'CC BY-SA 3.0', licenceCode: '' }),
      ).toBe('CC BY-SA 3.0');
      expect(licenceWordsOf({ licenceName: 'PD', licenceCode: 'pd' })).toBe(
        'Public domain',
      );
      expect(
        licenceWordsOf({ licenceName: 'No restrictions', licenceCode: '' }),
      ).toBe('No known restrictions');
      expect(licenceWordsOf({ licenceName: '', licenceCode: '' })).toBe('');
    });
  });
});
