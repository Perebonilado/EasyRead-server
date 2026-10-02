import { licenceOf } from '../../../business/domain/pictures/licence';
import { MetAdapter } from './met.adapter';
import { NasaImagesAdapter } from './nasa-images.adapter';
import type { PoliteHttp } from './polite-http';

/** A client answering from a table of addresses, as the sources would. */
function http(
  answers: Record<string, unknown>,
  files: Record<string, Buffer> = {},
): PoliteHttp {
  return {
    json: (url: string) => {
      const key = Object.keys(answers).find((k) => url.startsWith(k));
      return key
        ? Promise.resolve(answers[key])
        : Promise.reject(new Error(`404 ${url}`));
    },
    bytes: (url: string) =>
      files[url]
        ? Promise.resolve({ bytes: files[url], mime: 'image/jpeg' })
        : Promise.reject(new Error(`404 ${url}`)),
  } as unknown as PoliteHttp;
}

/** A JPEG's first bytes: its frame header says 1200 × 900. */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x84, 0x04, 0xb0, 0x03, 0, 0,
  0, 0,
]);

describe("NASA's library and the Met", () => {
  it("takes NASA's own picture as a US government work, and leaves one credited to anyone else with no licence", async () => {
    const nasa = new NasaImagesAdapter(
      http({
        'https://images-api.nasa.gov/search': {
          collection: {
            items: [
              {
                data: [
                  {
                    nasa_id: 'own',
                    title: 'Apollo 11 launch',
                    media_type: 'image',
                    center: 'KSC',
                    photographer: 'NASA',
                    date_created: '1969-07-16',
                  },
                ],
              },
              {
                data: [
                  {
                    nasa_id: 'esa',
                    title: 'A comet',
                    media_type: 'image',
                    secondary_creator: 'ESA/Rosetta',
                    date_created: '2015-01-01',
                  },
                ],
              },
            ],
          },
        },
        'https://images-api.nasa.gov/asset/own': {
          collection: {
            items: [
              { href: 'http://images-assets.nasa.gov/image/own/own~orig.jpg' },
              { href: 'http://images-assets.nasa.gov/image/own/metadata.json' },
            ],
          },
        },
        'https://images-api.nasa.gov/asset/esa': {
          collection: {
            items: [
              { href: 'http://images-assets.nasa.gov/image/esa/esa~orig.jpg' },
              { href: 'http://images-assets.nasa.gov/image/esa/metadata.json' },
            ],
          },
        },
        'https://images-assets.nasa.gov/image/own/metadata.json': {
          'File:ImageWidth': 3000,
          'File:ImageHeight': 2000,
        },
        'https://images-assets.nasa.gov/image/esa/metadata.json': {
          'File:ImageWidth': 3000,
          'File:ImageHeight': 2000,
        },
      }),
    );
    const [own, esa] = await nasa.search('launch', { limit: 5 });
    expect(own).toMatchObject({
      source: 'nasa',
      sourceId: 'own',
      width: 3000,
      height: 2000,
      url: 'https://images-assets.nasa.gov/image/own/own~orig.jpg',
      credit: 'NASA/KSC',
    });
    expect(licenceOf({ ...own, year: 1969 })).toMatchObject({
      ok: true,
      code: 'PD-USGov',
    });
    expect(licenceOf({ ...esa, year: 2015 }).ok).toBe(false);
  });

  it("takes only the Met's open-access objects, as CC0, measured from their small copy", async () => {
    const met = new MetAdapter(
      http(
        {
          'https://collectionapi.metmuseum.org/public/collection/v1/search': {
            objectIDs: [1, 2],
          },
          'https://collectionapi.metmuseum.org/public/collection/v1/objects/1':
            {
              objectID: 1,
              isPublicDomain: true,
              primaryImage: 'https://images.metmuseum.org/1-original.jpg',
              primaryImageSmall: 'https://images.metmuseum.org/1-small.jpg',
              title: 'A bronze head',
              creditLine: 'Gift of a donor, 1991',
              objectDate: '16th century',
            },
          'https://collectionapi.metmuseum.org/public/collection/v1/objects/2':
            { objectID: 2, isPublicDomain: false, primaryImage: 'x' },
        },
        { 'https://images.metmuseum.org/1-small.jpg': JPEG },
      ),
    );
    const found = await met.search('bronze head', 3);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      source: 'met',
      sourceId: '1',
      width: 1200,
      height: 900,
      licenceName: 'CC0',
      credit: 'The Metropolitan Museum of Art, Gift of a donor, 1991',
    });
    expect(licenceOf(found[0])).toMatchObject({ ok: true, code: 'CC0' });
  });
});
