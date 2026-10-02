import { fileOf, regionOf, structuredOf } from './commons.adapter';
import { measureImage } from './measure';
import { PoliteHttp, userAgentOf } from './polite-http';
import {
  itemOf,
  personOf,
  WikidataAdapter,
  type WikiEntity,
} from './wikidata.adapter';

// What Commons said of the Oak Ridge photograph of Ahmadu Bello (2026-10-02), cut to the fields read.
const PAGE = {
  pageid: 65676842,
  title:
    'File:Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519).jpg',
  imageinfo: [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Ahmadu_Bello.jpg',
      descriptionurl:
        'https://commons.wikimedia.org/wiki/File:Ahmadu_Bello.jpg',
      thumburl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Ahmadu_Bello.jpg/1280px-Ahmadu_Bello.jpg',
      thumbwidth: 1280,
      thumbheight: 1602,
      width: 7541,
      height: 9436,
      mime: 'image/jpeg',
      timestamp: '2016-02-10T06:20:00Z',
      extmetadata: {
        LicenseShortName: { value: 'Public domain' },
        License: { value: 'pd' },
        Artist: {
          value:
            '<a rel="nofollow" class="external text" href="https://www.flickr.com/people/78004229@N05">doe-oakridge</a>',
        },
        Credit: {
          value:
            '<a href="https://www.flickr.com/photos/doe-oakridge/24578438519/">Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge</a>',
        },
        ImageDescription: {
          value: '60-0730 DOE photo Ed Westcott 7-22-1960 Oak Ridge Tennessee',
        },
        DateTimeOriginal: { value: '2016-02-10 06:20' },
        Categories: {
          value:
            'Ahmadu Bello|PD US DOE|Flickr images reviewed by FlickreviewR 2',
        },
        Restrictions: { value: '' },
        AttributionRequired: { value: 'false' },
      },
    },
  ],
};
const MEDIA = {
  id: 'M65676842',
  statements: {
    P180: [
      {
        mainsnak: { datavalue: { value: { id: 'Q401032' } } },
        qualifiers: { P2677: [{ datavalue: { value: 'pct:70,15,22,20' } }] },
      },
    ],
    P6216: [{ mainsnak: { datavalue: { value: { id: 'Q19652' } } } }],
  },
};

describe("the picture desk's adapters", () => {
  it('reads a Commons page and its structured data into a file, every field plain text', () => {
    const file = fileOf(PAGE, MEDIA)!;
    expect(file).toMatchObject({
      source: 'commons',
      sourceId: PAGE.title,
      title:
        'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519)',
      width: 7541,
      height: 9436,
      thumb: { width: 1280, height: 1602 },
      licenceName: 'Public domain',
      licenceCode: 'pd',
      artist: 'doe-oakridge',
      credit:
        'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge',
      uploaded: '2016-02-10',
      categories: [
        'Ahmadu Bello',
        'PD US DOE',
        'Flickr images reviewed by FlickreviewR 2',
      ],
      restrictions: [],
      structured: { status: ['Q19652'], licences: [] },
      depicts: [{ qid: 'Q401032', box: [0.7, 0.15, 0.22, 0.2] }],
      quality: null,
      pageId: 65676842,
    });
    expect(file.attribution).toBeUndefined();
    expect(fileOf({ title: 'File:Gone.jpg', missing: '' })).toBeNull();
  });

  it('reads IIIF regions and files with no structured data', () => {
    expect(regionOf('pct:10,20,30,40')).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(regionOf('pct:10,20,300,40')).toBeUndefined();
    expect(regionOf(42)).toBeUndefined();
    expect(structuredOf(undefined)).toEqual({ structured: null });
    expect(structuredOf({ id: 'M1', statements: [] })).toEqual({
      structured: null,
    });
  });

  it("reads Wikidata's people, their preferred years, and a place's point", () => {
    const entity: WikiEntity = {
      id: 'Q401032',
      labels: { en: { value: 'Ahmadu Bello' } },
      descriptions: { en: { value: 'Nigerian politician (1910–1966)' } },
      aliases: { en: [{ value: 'Sardauna of Sokoto' }] },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
        P569: [
          {
            rank: 'normal',
            mainsnak: {
              datavalue: { value: { time: '+1909-01-01T00:00:00Z' } },
            },
          },
          {
            rank: 'preferred',
            mainsnak: {
              datavalue: { value: { time: '+1910-06-12T00:00:00Z' } },
            },
          },
        ],
        P570: [
          {
            mainsnak: {
              datavalue: { value: { time: '+1966-01-15T00:00:00Z' } },
            },
          },
        ],
        P39: [{ mainsnak: { datavalue: { value: { id: 'Q7058650' } } } }],
        P27: [{ mainsnak: { datavalue: { value: { id: 'Q1033' } } } }],
        P18: [{ mainsnak: { datavalue: { value: 'Ahmadu Bello 1960.jpg' } } }],
        P373: [{ mainsnak: { datavalue: { value: 'Ahmadu Bello' } } }],
      },
    };
    expect(
      personOf(
        entity,
        new Map([
          ['Q7058650', 'Premier of Northern Nigeria'],
          ['Q1033', 'Nigeria'],
        ]),
      ),
    ).toEqual({
      qid: 'Q401032',
      label: 'Ahmadu Bello',
      aliases: ['Sardauna of Sokoto'],
      description: 'Nigerian politician (1910–1966)',
      human: true,
      born: 1910,
      died: 1966,
      roles: ['Premier of Northern Nigeria'],
      places: ['Nigeria'],
      images: ['Ahmadu Bello 1960.jpg'],
      category: 'Ahmadu Bello',
    });
    const lagos = itemOf({
      id: 'Q8673',
      labels: { en: { value: 'Lagos' } },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q515' } } } }],
        P625: [
          {
            mainsnak: {
              datavalue: { value: { latitude: 6.45, longitude: 3.39 } },
            },
          },
        ],
      },
    });
    expect(lagos).toMatchObject({
      qid: 'Q8673',
      types: ['Q515'],
      geo: { lng: 3.39, lat: 6.45 },
      images: [],
    });
  });

  it('measures a JPEG or a PNG from its header, and nothing else', () => {
    const png = Buffer.alloc(32);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(0x0d0a1a0a, 4);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(measureImage(png)).toEqual({
      width: 640,
      height: 480,
      mime: 'image/png',
    });
    // SOI, an APP0 of 16 bytes, then SOF0 with height 1602 and width 1280.
    const jpeg = Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x10,
      ...Array<number>(14).fill(0),
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x06,
      0x42,
      0x05,
      0x00,
      0x03,
      0,
      0,
      0,
      0,
    ]);
    expect(measureImage(jpeg)).toEqual({
      width: 1280,
      height: 1602,
      mime: 'image/jpeg',
    });
    expect(measureImage(Buffer.from('GIF89a......'))).toBeNull();
  });

  it("asks Wikidata's full-text search for people by their words, and reads its ids", async () => {
    const asked: string[] = [];
    const http = new PoliteHttp({
      userAgent: userAgentOf('https://easiread.com'),
      minGapMs: 0,
      fetch: (url: string) => {
        asked.push(url);
        // What it answered for "James Robertson Nigeria" on 2026-10-02.
        return Promise.resolve(
          new Response(
            JSON.stringify({
              query: { search: [{ title: 'Q6145713' }, { title: 'Talk:x' }] },
            }),
            { status: 200 },
          ),
        );
      },
    });
    const hits = await new WikidataAdapter(http).searchText(
      'James Robertson Nigeria',
      { limit: 5, humans: true },
    );
    expect(hits).toEqual([{ qid: 'Q6145713' }]);
    const url = new URL(asked[0]);
    expect(url.searchParams.get('list')).toBe('search');
    expect(url.searchParams.get('srsearch')).toBe(
      'James Robertson Nigeria haswbstatement:P31=Q5',
    );
    expect(url.searchParams.get('srlimit')).toBe('5');
  });

  it('asks one request at a time, spaced, naming the app, and waits out a 429 as told', async () => {
    let clock = 0;
    const slept: number[] = [];
    const seen: { url: string; agent: string; at: number }[] = [];
    let first = true;
    const http = new PoliteHttp({
      userAgent: userAgentOf('https://easiread.com'),
      minGapMs: 250,
      now: () => clock,
      sleep: (ms) => {
        slept.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      fetch: (url: string, init: { headers: Record<string, string> }) => {
        seen.push({ url, agent: init.headers['User-Agent'], at: clock });
        if (url.endsWith('/busy') && first) {
          first = false;
          return Promise.resolve(
            new Response('', { status: 429, headers: { 'retry-after': '3' } }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: url }), { status: 200 }),
        );
      },
    });
    const answers = await Promise.all([
      http.json('https://a.test/1'),
      http.json('https://a.test/busy'),
      http.json('https://a.test/3'),
    ]);
    expect(answers).toEqual([
      { ok: 'https://a.test/1' },
      { ok: 'https://a.test/busy' },
      { ok: 'https://a.test/3' },
    ]);
    expect(seen.map((s) => s.url)).toEqual([
      'https://a.test/1',
      'https://a.test/busy',
      'https://a.test/busy',
      'https://a.test/3',
    ]);
    expect(
      seen.every(
        (s) =>
          s.agent ===
          'EasyReadStudio-PictureDesk/1.0 (https://easiread.com) node-fetch',
      ),
    ).toBe(true);
    // Each start at least 250 ms after the one before; the 429's three seconds waited.
    for (let i = 1; i < seen.length; i += 1)
      expect(seen[i].at - seen[i - 1].at).toBeGreaterThanOrEqual(250);
    expect(slept).toContain(3000);
    await expect(
      new PoliteHttp({
        userAgent: 'x',
        fetch: () => Promise.resolve(new Response('', { status: 404 })),
      }).json('https://a.test/x'),
    ).rejects.toThrow('404 from a.test');
  });
});
