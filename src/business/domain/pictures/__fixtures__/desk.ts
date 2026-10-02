/**
 * Fakes for the picture desk's specs: sources holding what Wikidata and
 * Commons said of a few people of "The Regional Turn" on 2026-10-02 (cut
 * to the fields the desk reads), an in-memory cache and storage, and
 * pixels and depth made up in code. Every source call is counted, so a
 * spec can say the cache spared one.
 */
import type {
  DepthPort,
  PicturePixelsPort,
  PictureSourcesPort,
} from '../../../ports/pictures.port';
import type { StoredFile } from '../../../ports/storage.port';
import type {
  PictureCacheInput,
  PictureCacheRepository,
  PictureCacheRow,
} from '../../../repositories/picture-cache.repository';
import type { SourceFile, WikiItem, WikiPerson } from '../types';

export const BELLO: WikiPerson = {
  qid: 'Q401032',
  label: 'Ahmadu Bello',
  aliases: ['Sir Ahmadu Bello', 'Sardauna of Sokoto'],
  description: 'Nigerian politician (1910–1966)',
  human: true,
  born: 1910,
  died: 1966,
  roles: ['politician', 'Premier of Northern Nigeria'],
  places: ['Nigeria', 'Rabah'],
  images: [
    'Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519).jpg',
  ],
  category: 'Ahmadu Bello',
};

export const AZIKIWE: WikiPerson = {
  qid: 'Q181782',
  label: 'Nnamdi Azikiwe',
  aliases: ['Zik'],
  description: 'first President of Nigeria (1904-1996)',
  human: true,
  born: 1904,
  died: 1996,
  roles: ['politician', 'journalist', 'President of Nigeria'],
  places: ['Nigeria', 'Zungeru'],
  images: ['Nnamdi Azikiwe 1.jpg'],
  category: 'Nnamdi Azikiwe',
};

/** A second human of the same name Wikidata holds, with nothing known of him. */
export const AZIKIWE_NAMESAKE: WikiPerson = {
  qid: 'Q108751318',
  label: 'Nnamdi Azikiwe',
  aliases: [],
  description: '',
  human: true,
  roles: [],
  places: [],
  images: [],
};

export const LAGOS: WikiItem = {
  qid: 'Q8673',
  label: 'Lagos',
  aliases: [],
  description: 'largest city in Nigeria',
  types: ['Q515'],
  geo: { lng: 3.3958, lat: 6.4531 },
  images: ['Lagos skyline 2019.jpg'],
  category: 'Lagos',
};

/** A Commons file as the adapter hands it over. */
export function commonsFile(
  over: Partial<SourceFile> & Pick<SourceFile, 'sourceId'>,
): SourceFile {
  const title = over.sourceId.replace(/^File:/u, '').replace(/\.[a-z]+$/iu, '');
  return {
    source: 'commons',
    title,
    url: `https://upload.wikimedia.org/${encodeURIComponent(title)}.jpg`,
    thumb: {
      url: `https://upload.wikimedia.org/thumb/${encodeURIComponent(title)}.jpg`,
      width: 1280,
      height: 1601,
    },
    width: 7541,
    height: 9436,
    mime: 'image/jpeg',
    pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(over.sourceId)}`,
    licenceName: 'Public domain',
    licenceCode: 'pd',
    artist: 'doe-oakridge',
    credit: title,
    description: '',
    date: '2016-02-10 06:20',
    uploaded: '2016-02-10',
    categories: [],
    restrictions: [],
    structured: { status: ['Q19652'], licences: [] },
    ...over,
  };
}

export const FILES: readonly SourceFile[] = [
  commonsFile({
    sourceId:
      'File:Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519).jpg',
    description: '60-0730 DOE photo Ed Westcott 7-22-1960 Oak Ridge Tennessee',
    categories: [
      'Ahmadu Bello',
      'PD US DOE',
      'Oak Ridge, Tennessee in the 1960s',
    ],
    depicts: [{ qid: 'Q401032' }],
    institutional: true,
  }),
  commonsFile({
    sourceId:
      'File:Premier of Nigeria Sir Ahmadu Bello far right leaving the Atomic Museum Oak Ridge (7178285418).jpg',
    width: 6051,
    height: 7583,
    description:
      'Premier of Nigeria Sir Ahmadu Bello far right leaving the Atomic Museum',
    categories: ['Ahmadu Bello', 'PD US DOE'],
  }),
  commonsFile({
    sourceId: 'File:Portrait of Ahmadu Bello.png',
    mime: 'image/png',
    width: 1092,
    height: 1454,
    artist: 'Drum Magazine photographer',
    credit: 'UCLA BAHA Drum Magazine Archive',
    categories: ['Ahmadu Bello', 'PD-Nigeria'],
  }),
  commonsFile({
    sourceId: 'File:Sir Ahmadu Bello (1959).jpg',
    width: 684,
    height: 1000,
    artist: 'Eliot Elisofon',
    credit: 'National Museum of African Art',
    categories: [
      'Ahmadu Bello',
      'PD-Nigeria',
      'PD Nigeria - Public Figure Portraits',
    ],
  }),
  commonsFile({
    sourceId: 'File:Nnamdi Azikiwe 1.jpg',
    width: 407,
    height: 348,
    licenceName: 'CC BY-SA 4.0',
    licenceCode: 'cc-by-sa-4.0',
    artist: 'Kambai Akau',
    credit: 'Own work',
    description:
      'Nnamdi Azikiwe during an interview on 4 April 1967. Archive footage screenshot from YouTube video by AP Archive.',
    categories: ['Nnamdi Azikiwe', 'Self-published work'],
    structured: { status: ['Q50423863'], licences: ['Q18199165'] },
  }),
  commonsFile({
    sourceId: 'File:Lagos skyline 2019.jpg',
    width: 4000,
    height: 2250,
    licenceName: 'CC BY 4.0',
    licenceCode: 'cc-by-4.0',
    artist: 'A. Photographer',
    credit: 'Own work',
    date: '2019-03-01',
    uploaded: '2019-03-02',
    categories: ['Lagos', 'CC-BY-4.0'],
    structured: { status: ['Q50423863'], licences: ['Q20007257'] },
  }),
  commonsFile({
    sourceId: 'File:Lagos Marina, Nigeria, 1958.jpg',
    width: 3000,
    height: 2000,
    artist: 'US Information Agency',
    credit: 'US National Archives',
    description: 'The Marina, Lagos, Nigeria',
    date: '1958',
    categories: ['1958 in Nigeria', 'PD US Government'],
    institutional: true,
  }),
];

/** Sources answering from the files above, every call counted. */
export class FakeSources implements PictureSourcesPort {
  calls: string[] = [];
  constructor(
    private readonly people_: readonly WikiPerson[] = [
      BELLO,
      AZIKIWE,
      AZIKIWE_NAMESAKE,
    ],
    private readonly items_: readonly WikiItem[] = [LAGOS],
    private readonly files: readonly SourceFile[] = FILES,
  ) {}

  searchEntities(name: string) {
    this.calls.push(`search:${name}`);
    const key = name.toLowerCase();
    return Promise.resolve(
      [...this.people_, ...this.items_]
        .filter(
          (e) =>
            key.includes(e.label.toLowerCase().split(',')[0]) ||
            e.label.toLowerCase().includes(key),
        )
        .map((e) => ({
          qid: e.qid,
          label: e.label,
          description: e.description,
        })),
    );
  }
  people(qids: readonly string[]) {
    this.calls.push(`people:${qids.join(',')}`);
    return Promise.resolve(this.people_.filter((p) => qids.includes(p.qid)));
  }
  items(qids: readonly string[]) {
    this.calls.push(`items:${qids.join(',')}`);
    return Promise.resolve(this.items_.filter((p) => qids.includes(p.qid)));
  }
  commonsFiles(titles: readonly string[]) {
    this.calls.push(`files:${titles.length}`);
    return Promise.resolve(
      this.files.filter((f) => titles.includes(f.sourceId)),
    );
  }
  commonsDepicting(qid: string) {
    this.calls.push(`depicting:${qid}`);
    return Promise.resolve(
      this.files.filter((f) => f.depicts?.some((d) => d.qid === qid)),
    );
  }
  commonsCategory(category: string) {
    this.calls.push(`category:${category}`);
    return Promise.resolve(
      this.files.filter((f) => f.categories.includes(category)),
    );
  }
  commonsSearch(words: string) {
    this.calls.push(`search-files:${words}`);
    const first = words.split(' ')[0].toLowerCase();
    return Promise.resolve(
      this.files.filter((f) => f.title.toLowerCase().includes(first)),
    );
  }
  nasaSearch() {
    this.calls.push('nasa');
    return Promise.resolve([]);
  }
  metSearch() {
    this.calls.push('met');
    return Promise.resolve([]);
  }
  fetch(url: string) {
    this.calls.push(`fetch:${url}`);
    // A tiny JPEG's header is enough for the fake pixels to measure.
    return Promise.resolve({
      bytes: Buffer.from(`jpeg:${url}`),
      mime: 'image/jpeg',
    });
  }
}

/** The cache in memory. */
export class MemoryCache implements PictureCacheRepository {
  rows = new Map<string, PictureCacheRow>();
  private next = 1;
  find(id: string) {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
  bySource(source: string, sourceId: string) {
    return Promise.resolve(
      [...this.rows.values()].find(
        (r) => r.source === source && r.sourceId === sourceId,
      ) ?? null,
    );
  }
  bySha1(sha1: string) {
    return Promise.resolve(
      [...this.rows.values()].find((r) => r.sha1 === sha1 && r.storageKey) ??
        null,
    );
  }
  save(row: PictureCacheInput) {
    const had = [...this.rows.values()].find(
      (r) => r.source === row.source && r.sourceId === row.sourceId,
    );
    const id = row.id ?? had?.id ?? `p${this.next++}`;
    const saved: PictureCacheRow = { ...row, id };
    this.rows.set(id, saved);
    return Promise.resolve(saved);
  }
}

/** Storage in memory. */
export class MemoryStorage {
  files = new Map<string, Buffer>();
  put(input: {
    key: string;
    body: Buffer | NodeJS.ReadableStream;
    mimeType: string;
  }): Promise<StoredFile> {
    const body = input.body as Buffer;
    this.files.set(input.key, body);
    return Promise.resolve({
      ref: input.key,
      sizeBytes: body.length,
      mimeType: input.mimeType,
    });
  }
  size(ref: string) {
    const file = this.files.get(ref);
    return file
      ? Promise.resolve(file.length)
      : Promise.reject(new Error('gone'));
  }
  get(ref: string) {
    const file = this.files.get(ref);
    return file ? Promise.resolve(file) : Promise.reject(new Error('gone'));
  }
}

/** Pixels made up: every fetched copy 1280 × 1601, grey (a black-and-white print). */
export const FAKE_PIXELS: PicturePixelsPort = {
  measure: (bytes) =>
    bytes.toString().startsWith('jpeg:')
      ? { width: 1280, height: 1601, mime: 'image/jpeg' }
      : null,
  pixels: () => {
    const data = new Uint8Array(4 * 4 * 4).fill(128);
    return Promise.resolve({ data, width: 4, height: 4 });
  },
};

/** A depth model that answers with a small grey PNG, its calls counted. */
export class FakeDepth implements DepthPort {
  calls = 0;
  depthOf() {
    this.calls += 1;
    return Promise.resolve({
      png: Buffer.from('png:depth'),
      width: 518,
      height: 648,
    });
  }
}
