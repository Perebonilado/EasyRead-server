import {
  BELLO,
  commonsFile,
  FAKE_PIXELS,
  LAGOS,
  FakeDepth,
  FakeFocus,
  FakeSources,
  FILES,
  MemoryCache,
  MemoryStorage,
  ROBERTSON,
  ROBERTSON_NAMESAKE,
} from './__fixtures__/desk';
import {
  DESK_RULES,
  inCountry,
  lookupKey,
  MOST,
  PictureDesk,
  PICK_LEAST,
  searchWordsOf,
  titleKey,
  undatedScan,
} from './desk';
import type { LicenceMode } from './licence';
import { eventPhotoOf } from './rank';
import type { PictureQuery, SourceFile } from './types';

const NOW = new Date('2026-10-02T09:00:00Z');

/**
 * A desk on fakes. The licence screen is on unless a spec says off: most
 * of these specs are of the screen's rules (PICTURE_LICENCE=on); the
 * switch's own are at the end.
 */
function deskWith(
  over: {
    sources?: FakeSources;
    depth?: FakeDepth | null;
    now?: () => Date;
    focus?: FakeFocus;
    licence?: LicenceMode;
  } = {},
) {
  const sources = over.sources ?? new FakeSources();
  const cache = new MemoryCache();
  const storage = new MemoryStorage();
  const depth = over.depth === undefined ? new FakeDepth() : over.depth;
  const logs: string[] = [];
  const desk = new PictureDesk({
    sources,
    cache,
    storage,
    pixels: FAKE_PIXELS,
    depth,
    ...(over.focus ? { focus: over.focus.ask } : {}),
    licence: over.licence ?? 'on',
    now: over.now ?? (() => NOW),
    log: (m) => logs.push(m),
  });
  return { desk, sources, cache, storage, depth, logs };
}

const BELLO_Q: PictureQuery = {
  name: 'Ahmadu Bello',
  kind: 'person',
  years: [1957],
  place: ['Nigeria'],
  role: 'Northern Region leader and strategist',
};

describe('the picture desk', () => {
  it('finds a verified portrait: the right person, a licence it may use, of them alone', async () => {
    const { desk, cache } = deskWith();
    const { found, qid } = await desk.find(BELLO_Q);
    expect(qid).toBe('Q401032');
    expect(found.map((c) => c.file.sourceId)).toEqual([
      'File:Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519).jpg',
    ]);
    expect(found[0]).toMatchObject({
      kind: 'person',
      subject: 'Ahmadu Bello',
      year: 1960,
      chip: 'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
      licence: { code: 'PD-USGov', tier: 'A' },
      focal: { from: 'centre' },
    });
    // The Drum print and the portrait public domain only in Nigeria are refused, and kept as refused.
    const refused = [...cache.rows.values()].filter((r) => r.refusedReason);
    expect(refused.map((r) => r.sourceId)).toEqual([
      'File:Portrait of Ahmadu Bello.png',
      'File:Sir Ahmadu Bello (1959).jpg',
    ]);
    expect(refused[0].refusedReason).toMatch(/Drum/u);
    expect(refused[1].refusedReason).toMatch(/PD-Nigeria/u);
  });

  it('refuses every picture of a person when none clears (an AP frame on YouTube) and says so', async () => {
    const { desk } = deskWith();
    const { found, qid, reason } = await desk.find({
      name: 'Nnamdi Azikiwe',
      kind: 'person',
      years: [1957],
      place: ['Nigeria'],
    });
    // The right Azikiwe, though Wikidata holds a namesake with nothing known of him.
    expect(qid).toBe('Q181782');
    expect(found).toEqual([]);
    expect(reason).toMatch(/no picture of Nnamdi Azikiwe clears/u);
  });

  it('finds a person the name search does not reach by their name with a word of the research’s: Nigeria’s last governor-general', async () => {
    const sources = new FakeSources([BELLO, ROBERTSON_NAMESAKE, ROBERTSON]);
    const { desk } = deskWith({ sources, licence: 'off' });
    const { qid, found } = await desk.find({
      name: 'Sir James Robertson',
      kind: 'person',
      years: [1955, 1960],
      place: ['Nigeria'],
      role: 'Governor-General of Nigeria',
    });
    expect(qid).toBe('Q6145713');
    expect(found.map((c) => c.file.sourceId)).toEqual([
      'File:Sir James Robertson, Governor-General of Nigeria, 1958.jpg',
    ]);
    expect(sources.calls).toContain('search-text:james robertson Nigeria');
    // The name search alone gave only his namesake, and nobody.
    const named = new FakeSources([ROBERTSON_NAMESAKE]);
    const alone = await deskWith({ sources: named }).desk.find({
      name: 'Sir James Robertson',
      kind: 'person',
      years: [1955, 1960],
      place: ['Nigeria'],
      role: 'Governor-General of Nigeria',
    });
    expect(alone.reason).toBe(
      'Sir James Robertson matched by name only: no year, role or place agrees',
    );
  });

  it('gives no portrait for a person whose facts it cannot match', async () => {
    const { desk } = deskWith();
    const { found, reason } = await desk.find({
      name: 'Ahmadu Bello',
      kind: 'person',
      years: [1990],
    });
    expect(found).toEqual([]);
    expect(reason).toMatch(/another time/u);
  });

  it('finds a place’s photo only from the research’s years: the 1958 Marina, not the 2019 skyline', async () => {
    const { desk } = deskWith();
    const { found, qid } = await desk.find({
      name: 'Lagos',
      kind: 'place',
      years: [1957, 1960],
      place: ['Nigeria'],
      geo: { lng: 3.38, lat: 6.52 },
    });
    expect(qid).toBe('Q8673');
    expect(found.map((c) => c.file.sourceId)).toEqual([
      'File:Lagos Marina, Nigeria, 1958.jpg',
    ]);
    expect(found[0].chip).toBe(
      'Lagos, 1958 · US National Archives · Public domain',
    );
  });

  it('ranks the best first and picks only what scores enough', async () => {
    const { desk } = deskWith();
    const { found } = await desk.find(BELLO_Q);
    expect(desk.pick(found)?.file.sourceId).toBe(found[0].file.sourceId);
    expect(
      desk.pick(found.map((c) => ({ ...c, score: PICK_LEAST - 0.01 }))),
    ).toBeNull();
    expect(desk.pick([])).toBeNull();
  });

  it('takes a copy into storage by its sha1, with its size, its subject in pixels and its depth beside it', async () => {
    const { desk, storage, depth } = deskWith();
    const { found } = await desk.find(BELLO_Q);
    const record = await desk.take(found[0], { depth: true });
    expect(record).toMatchObject({
      source: 'commons',
      width: 1280,
      height: 1601,
      // The middle third a little above the middle, in the copy’s own pixels.
      focal: [427, 406, 427, 534],
      mime: 'image/jpeg',
      licence: 'Public domain',
      mono: true,
    });
    expect(record!.storageKey).toMatch(/^pictures\/[0-9a-f]{40}\.jpg$/u);
    expect(record!.depthKey).toMatch(/^pictures\/[0-9a-f]{40}-depth\.png$/u);
    expect(storage.files.size).toBe(2);
    expect(depth!.calls).toBe(1);
    // The copy is the source's sized one, not its 7541-pixel original.
    expect(record!.url).toContain('upload.wikimedia.org/');
  });

  it('answers the same question from the cache, asking the sources nothing', async () => {
    const { desk, sources } = deskWith();
    const first = await desk.lookup(BELLO_Q, { depth: true });
    expect(first?.chip).toBe(
      'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
    );
    expect(first?.dates).toBe('1910–1966');
    expect(first?.role).toBe('Northern Region leader');
    const asked = sources.calls.length;
    const again = await desk.lookup(BELLO_Q, { depth: true });
    expect(sources.calls.length).toBe(asked);
    expect(again).toEqual(first);
  });

  it('keeps a question with no answer, and why, so it is not asked again for a month', async () => {
    const { desk, sources, cache } = deskWith();
    expect(
      await desk.lookup({
        name: 'Nnamdi Azikiwe',
        kind: 'person',
        years: [1957],
        place: ['Nigeria'],
      }),
    ).toBeNull();
    const kept = await cache.bySource(
      'lookup',
      lookupKey({
        name: 'Nnamdi Azikiwe',
        kind: 'person',
        years: [1957],
        place: ['Nigeria'],
      }),
    );
    expect(kept?.refusedReason).toMatch(/no picture of Nnamdi Azikiwe clears/u);
    const asked = sources.calls.length;
    expect(
      await desk.lookup({
        name: 'Nnamdi Azikiwe',
        kind: 'person',
        years: [1957],
        place: ['Nigeria'],
      }),
    ).toBeNull();
    expect(sources.calls.length).toBe(asked);
  });

  it('asks again once the answer is a month old, and fetches again when our copy has gone', async () => {
    let now = NOW;
    const { desk, sources, storage } = deskWith({ now: () => now });
    await desk.lookup(BELLO_Q);
    now = new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000);
    const asked = sources.calls.length;
    await desk.lookup(BELLO_Q);
    expect(sources.calls.length).toBeGreaterThan(asked);
    // Storage lost the file (another tree's storage, a cleared disk): the cached row is not trusted.
    storage.files.clear();
    const fetched = sources.calls.filter((c) => c.startsWith('fetch:')).length;
    now = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    const again = await desk.lookup(BELLO_Q);
    expect(again?.storageKey).toBeTruthy();
    expect(sources.calls.filter((c) => c.startsWith('fetch:')).length).toBe(
      fetched + 1,
    );
    // The picture and its depth map, both made again.
    expect([...storage.files.keys()].sort()).toEqual([
      expect.stringMatching(/-depth\.png$/u) as unknown as string,
      expect.stringMatching(/[0-9a-f]\.jpg$/u) as unknown as string,
    ]);
  });

  it('stores two copies with the same bytes once', async () => {
    const { desk, storage } = deskWith({ depth: null });
    const { found } = await desk.find(BELLO_Q);
    await desk.take(found[0]);
    await desk.take({
      ...found[0],
      file: {
        ...found[0].file,
        sourceId: 'File:Another name for the same file.jpg',
      },
    });
    expect(storage.files.size).toBe(1);
  });

  it('keeps one plane when depth cannot be made, and never throws on a source that fails', async () => {
    const failing = new FakeSources();
    failing.people = () => Promise.reject(new Error('Wikidata is down'));
    const { desk, logs } = deskWith({ sources: failing });
    expect(await desk.lookup(BELLO_Q)).toBeNull();
    expect(logs.join('\n')).toMatch(/Wikidata is down/u);
    const broken = {
      depthOf: () => Promise.reject(new Error('no model')),
      calls: 0,
    } as unknown as FakeDepth;
    const second = deskWith({ depth: broken });
    const record = await second.desk.lookup(BELLO_Q, { depth: true });
    expect(record?.depthKey).toBeNull();
    expect(second.logs.join('\n')).toMatch(/no depth/u);
  });

  it('frames a picture on the faces a model that sees names, and records its call', async () => {
    const focus = new FakeFocus();
    const { desk } = deskWith({ focus });
    const usage: string[] = [];
    const record = await desk.lookup(BELLO_Q, {
      onUsage: (u) => usage.push(u.model),
    });
    // E2 grown for head and shoulders, in the copy's 1280 × 1601 pixels.
    expect(record?.focal).toEqual([747, 133, 427, 667]);
    expect(focus.calls).toHaveLength(1);
    expect(usage).toEqual(['fake:see']);
  });

  it('passes over a portrait the model sees is a photograph of a print with six people in it, for the next', async () => {
    const tractor = commonsFile({
      sourceId: 'File:Ahmadu Bello on a tractor 1962.jpg',
      description: 'Sir Ahmadu Bello on a tractor',
      date: '1962',
      categories: ['Ahmadu Bello', 'PD US Government'],
      depicts: [{ qid: 'Q401032' }],
      institutional: true,
      quality: 'featured',
    });
    const sources = new FakeSources(undefined, undefined, [tractor, ...FILES]);
    const focus = new FakeFocus();
    const { desk, logs } = deskWith({ sources, focus });
    const record = await desk.lookup(BELLO_Q);
    expect(record?.sourceId).toBe(
      'File:Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519).jpg',
    );
    expect(logs.join('\n')).toMatch(
      /on a tractor 1962\.jpg will not do: it is a photograph of a print/u,
    );
  });

  describe('with the licence screen off (PICTURE_LICENCE, the default)', () => {
    const AZIKIWE_Q: PictureQuery = {
      name: 'Nnamdi Azikiwe',
      kind: 'person',
      years: [1957],
      place: ['Nigeria'],
    };
    const IN_OFFICE = 'File:Nnamdi Azikiwe in Office, 1937.jpg';

    it('is off when nobody says', () => {
      const desk = new PictureDesk({
        sources: new FakeSources(),
        cache: new MemoryCache(),
        storage: new MemoryStorage(),
        pixels: FAKE_PIXELS,
      });
      expect(desk.licence).toBe('off');
    });

    it('clears a file the screen refuses, under the licence its source names, its credit and chip made as ever', async () => {
      const on = await deskWith().desk.find(AZIKIWE_Q);
      expect(on.found).toEqual([]);
      const { found } = await deskWith({ licence: 'off' }).desk.find(AZIKIWE_Q);
      expect(found.map((c) => c.file.sourceId)).toEqual([IN_OFFICE]);
      expect(found[0]).toMatchObject({
        chip: 'Nnamdi Azikiwe, 1937 · Northwestern University · Public domain',
        licence: { code: 'unchecked', short: 'Public domain' },
      });
      expect(found[0].credit).toContain('Public domain');
      expect(found[0].notes.join(' ')).toMatch(
        /licence not checked: public domain is claimed with no reason given/u,
      );
    });

    it('does not let a refusal kept while the licences were checked block the file: the question is asked again and the file taken', async () => {
      const { desk, cache } = deskWith({ licence: 'off' });
      const blank = {
        qid: null,
        kind: null,
        subject: null,
        url: null,
        sourceUrl: null,
        licence: null,
        credit: null,
        chip: null,
        width: null,
        height: null,
        focal: null,
        sha1: null,
        mime: null,
        storageKey: null,
        depthKey: null,
        checkedAt: NOW,
      };
      // The cache as the screen left it: the question answered with none,
      // under today's rules, and the file refused for its licence.
      await cache.save({
        ...blank,
        source: 'lookup',
        sourceId: lookupKey(AZIKIWE_Q),
        meta: { rules: DESK_RULES, picked: null },
        refusedReason: 'no picture of Nnamdi Azikiwe clears',
      });
      await cache.save({
        ...blank,
        source: 'commons',
        sourceId: IN_OFFICE,
        meta: null,
        refusedReason: 'public domain is claimed with no reason given',
      });
      const record = await desk.lookup(AZIKIWE_Q);
      expect(record?.sourceId).toBe(IN_OFFICE);
      expect(record?.licence).toBe('Public domain');
      // Kept now, and served: the refusal is gone from its row.
      const row = await desk.record(record!.id);
      expect(row?.refusedReason).toBeNull();
      expect(row?.meta).toMatchObject({
        code: 'unchecked',
        flags: [
          'licence not checked: public domain is claimed with no reason given',
        ],
      });
      // The answer is kept under the switch it was given under.
      expect(
        (await cache.bySource('lookup', lookupKey(AZIKIWE_Q)))?.meta,
      ).toMatchObject({ licence: 'off', picked: record!.id });
    });

    it('asks again with the screen on what was answered with it off, and the screen refuses the file once more', async () => {
      const { desk: off, cache } = deskWith({ licence: 'off' });
      expect((await off.lookup(AZIKIWE_Q))?.sourceId).toBe(IN_OFFICE);
      const on = new PictureDesk({
        sources: new FakeSources(),
        cache,
        storage: new MemoryStorage(),
        pixels: FAKE_PIXELS,
        licence: 'on',
        now: () => NOW,
      });
      expect(await on.lookup(AZIKIWE_Q)).toBeNull();
      expect(
        (await cache.bySource('lookup', lookupKey(AZIKIWE_Q)))?.meta,
      ).toMatchObject({ licence: 'on', picked: null });
    });

    it('still asks who a picture is of: with the right man ruled out by his years, his namesake is no one', async () => {
      const { desk } = deskWith({ licence: 'off' });
      const { found, reason } = await desk.find({
        ...AZIKIWE_Q,
        years: [1880],
      });
      expect(found).toEqual([]);
      expect(reason).toBe(
        'Nnamdi Azikiwe matched by name only: no year, role or place agrees',
      );
    });
  });

  describe('more pictures for every episode (Richard, 2026-10-02)', () => {
    const BELLO_FILES = [
      ...FILES,
      commonsFile({
        sourceId:
          'File:Ahmadu Bello with the Northern delegation at Oak Ridge, 1960.jpg',
        description: 'Sir Ahmadu Bello and members of his delegation',
        categories: ['Ahmadu Bello', 'PD US DOE'],
        depicts: [{ qid: 'Q401032' }],
        date: '1960',
      }),
      commonsFile({
        sourceId: 'File:Ahmadu Bello greets visitors in Kaduna, 1959.jpg',
        categories: ['Ahmadu Bello', 'PD US Government'],
        date: '1959',
      }),
      // Of him in bronze, and of a university named after him: never him.
      commonsFile({
        sourceId: 'File:Statue of Ahmadu Bello, Kaduna 1965.jpg',
        categories: ['Ahmadu Bello', 'PD US Government'],
        date: '1965',
      }),
      commonsFile({
        sourceId: 'File:Ahmadu Bello University gate 1963.jpg',
        categories: ['Ahmadu Bello', 'PD US Government'],
        date: '1963',
      }),
    ];

    it('brings a person’s portrait and two more photos of them, distinct files, never a likeness or a thing named after them', async () => {
      const sources = new FakeSources(undefined, undefined, BELLO_FILES);
      const { desk, cache } = deskWith({ sources, licence: 'off' });
      const all = await desk.lookupAll(BELLO_Q);
      expect(all.map((r) => [r.use, r.sourceId])).toEqual([
        [
          'portrait',
          'File:Ahmadu Bello Premier of the Northern Region of Nigeria 1960 Oak Ridge (24578438519).jpg',
        ],
        ['photo', 'File:Ahmadu Bello greets visitors in Kaduna, 1959.jpg'],
        [
          'photo',
          'File:Ahmadu Bello with the Northern delegation at Oak Ridge, 1960.jpg',
        ],
      ]);
      expect(all).toHaveLength(MOST.person);
      expect(new Set(all.map((r) => r.sha1)).size).toBe(3);
      expect(all[1].chip).toBe(
        'Ahmadu Bello, 1959 · US Department of Energy · Public domain',
      );
      // The answer is kept whole: asked again, the same three, from the cache.
      const kept = await cache.bySource('lookup', lookupKey(BELLO_Q));
      expect((kept?.meta as { taken: unknown[] }).taken).toHaveLength(3);
      const asked = sources.calls.length;
      expect((await desk.lookupAll(BELLO_Q)).map((r) => r.id)).toEqual(
        all.map((r) => r.id),
      );
      expect(sources.calls.length).toBe(asked);
      // lookup still answers with the portrait.
      expect((await desk.lookup(BELLO_Q))?.use).toBe('portrait');
    });

    it('brings a place’s photos from the research’s years first, else any good photo of it, its year on the chip', async () => {
      const { desk } = deskWith({ licence: 'off' });
      const lagos: PictureQuery = {
        name: 'Lagos',
        kind: 'place',
        years: [1900, 1905],
        place: ['Nigeria'],
        geo: { lng: 3.38, lat: 6.52 },
      };
      const { found } = await desk.find(lagos);
      // Ranked by the house weights (the 1958 Marina crops to both shapes).
      expect(found.map((c) => [c.file.sourceId, c.year]).sort()).toEqual([
        ['File:Lagos Marina, Nigeria, 1958.jpg', 1958],
        ['File:Lagos skyline 2019.jpg', 2019],
      ]);
      const skyline = found.find((c) => c.year === 2019)!;
      expect(skyline.chip).toMatch(/^Lagos, 2019 · /u);
      expect(skyline.file.chosen).toBe(true);
      expect(found.every((c) => c.notes.join(' ').includes('any year'))).toBe(
        true,
      );
      // From its years, when it has some: only those.
      const { found: era } = await desk.find({ ...lagos, years: [1957] });
      expect(era.map((c) => c.file.sourceId)).toEqual([
        'File:Lagos Marina, Nigeria, 1958.jpg',
      ]);
      expect(LAGOS.images).toEqual(['Lagos skyline 2019.jpg']);
    });

    // Nigeria's independence, as the research names it (The Regional Turn).
    const INDEPENDENCE: PictureQuery = {
      name: 'Nigeria becomes independent',
      kind: 'event',
      years: [1960],
      place: ['Nigeria'],
      words: ['Nigeria becomes independent by act and constitutional order'],
      asked:
        'an event: Nigeria becomes independent by act and constitutional order (1 October 1960)',
    };
    const EVENT_FILES = [
      commonsFile({
        sourceId:
          'File:The Prime Minister, Sir Abubakar Tafawa Balewa on Independence Day, October 1, 1960.jpg',
        description: 'Nigerian independence celebrations, Lagos',
        categories: ['1960 in Nigeria', 'PD US Government'],
        date: '1960-10-01',
      }),
      commonsFile({
        sourceId:
          'File:Crowd at the racecourse, Nigerian independence, 1960.jpg',
        categories: ['1960 in Nigeria', 'PD US Government'],
        date: '1960',
      }),
      // A plaque photographed later, a parade fifty years on, and a street that year.
      commonsFile({
        sourceId: 'File:Nigeria independence plaque 1960.jpg',
        categories: ['1960 in Nigeria'],
        date: '2012',
      }),
      commonsFile({
        sourceId: 'File:Nigeria independence anniversary parade 2010.jpg',
        categories: ['2010 in Nigeria'],
        date: '2010',
      }),
      commonsFile({
        sourceId: 'File:A street in Lagos, 1960.jpg',
        categories: ['1960 in Nigeria'],
        date: '1960',
      }),
    ];

    it('clears an event’s photo only from its year, carrying its words, never a commemoration of it', async () => {
      const sources = new FakeSources([], [], EVENT_FILES);
      const { desk } = deskWith({ sources, licence: 'off' });
      const { found } = await desk.find(INDEPENDENCE);
      expect(found.map((c) => c.file.sourceId).sort()).toEqual([
        'File:Crowd at the racecourse, Nigerian independence, 1960.jpg',
        'File:The Prime Minister, Sir Abubakar Tafawa Balewa on Independence Day, October 1, 1960.jpg',
      ]);
      expect(found[0].chip).toMatch(/^Nigeria becomes independent, 1960 · /u);
      // Searched by its own words and year, and the year's photos of its country.
      expect(sources.calls).toContain('search-files:Nigeria independent 1960');
      expect(sources.calls).toContain('category:1960 in Nigeria');
    });

    it('takes an event’s photo only when the look agrees it shows it, and none with no look to ask', async () => {
      const sources = new FakeSources([], [], EVENT_FILES);
      const focus = new FakeFocus(/racecourse/u);
      const { desk, logs } = deskWith({ sources, focus, licence: 'off' });
      const all = await desk.lookupAll(INDEPENDENCE);
      expect(all.map((r) => r.sourceId)).toEqual([
        'File:The Prime Minister, Sir Abubakar Tafawa Balewa on Independence Day, October 1, 1960.jpg',
      ]);
      expect(focus.asked).toContain(INDEPENDENCE.asked);
      expect(logs.join('\n')).toMatch(
        /racecourse.*will not do: the look does not see an event: Nigeria becomes independent/u,
      );
      const blind = deskWith({
        sources: new FakeSources([], [], EVENT_FILES),
        licence: 'off',
      });
      expect(await blind.desk.lookupAll(INDEPENDENCE)).toEqual([]);
      expect(blind.logs.join('\n')).toMatch(
        /no look has said it shows what was asked/u,
      );
    });

    it('clears a thing’s photo only when it names the thing in whole words, and the look agrees', async () => {
      const files = [
        commonsFile({
          sourceId: 'File:Farnsworth Image Dissector tube 1931.jpg',
          categories: ['Image dissectors', 'PD US Government'],
          date: '1931',
        }),
        commonsFile({
          sourceId: 'File:Image of a television tube.jpg',
          categories: ['PD US Government'],
          date: '1950',
        }),
      ];
      const sources = new FakeSources([], [], files);
      const focus = new FakeFocus();
      const { desk } = deskWith({ sources, focus, licence: 'off' });
      const query: PictureQuery = {
        name: 'image dissector',
        kind: 'object',
        years: [1926, 1939],
        words: ['image dissector'],
        asked: 'a thing: image dissector (a long glass camera tube)',
      };
      const all = await desk.lookupAll(query);
      expect(all.map((r) => [r.sourceId, r.year, r.use])).toEqual([
        ['File:Farnsworth Image Dissector tube 1931.jpg', 1931, 'photo'],
      ]);
      expect(all[0].chip).toMatch(/^image dissector, 1931 · /u);
      expect(focus.asked).toEqual([query.asked]);
    });

    it('searches an event by its own names, whole, and its other words, never the verbs that tell it', () => {
      expect(
        searchWordsOf(
          'Baird demonstrates television to members of the Royal Institution',
        ),
      ).toEqual({
        names: ['Baird', 'Royal Institution'],
        plain: ['television', 'members'],
      });
      expect(
        searchWordsOf("RCA introduces television at the New York World's Fair"),
      ).toEqual({
        names: ['RCA', "New York World's Fair"],
        plain: ['television'],
      });
      expect(
        searchWordsOf('The BBC Television Service opens at Alexandra Palace'),
      ).toEqual({
        names: ['BBC Television Service', 'Alexandra Palace'],
        plain: [],
      });
      expect(
        searchWordsOf(
          'Nigeria becomes independent by act and constitutional order',
        ),
      ).toEqual({
        names: ['Nigeria'],
        plain: ['independent', 'act', 'constitutional'],
      });
    });

    it('reads short names in capitals as an event’s words: the BBC’s photo of its own opening', () => {
      expect(
        eventPhotoOf(
          {
            title: 'BBC television, Alexandra Palace, November 1936',
            description: '',
            categories: [],
          },
          {
            name: 'The BBC Television Service opens',
            years: [1936],
            place: ['Alexandra Palace, London'],
            words: ['The BBC Television Service opens at Alexandra Palace'],
          },
          1936,
        ),
      ).toEqual({ ok: true });
    });
  });

  it('knows a file’s crop and its copy for the same picture, never two photos of a person', () => {
    expect(titleKey('File:Philo T Farnsworth (cropped).jpg')).toBe(
      titleKey('File:Philo T Farnsworth.jpg'),
    );
    expect(titleKey('Ahmadu Bello 1960 (2)')).toBe(
      titleKey('Ahmadu Bello 1960'),
    );
    expect(titleKey('Ahmadu Bello 1960 colorized')).toBe(
      titleKey('Ahmadu Bello 1960'),
    );
    expect(titleKey('Ahmadu Bello 1959')).not.toBe(
      titleKey('Ahmadu Bello 1960'),
    );
  });

  it('names a country as Commons’ year categories do', () => {
    expect(inCountry('United Kingdom')).toBe('the United Kingdom');
    expect(inCountry('Netherlands')).toBe('the Netherlands');
    expect(inCountry('Nigeria')).toBe('Nigeria');
  });

  describe('looked at: tone and likeness', () => {
    /**
     * Pixels made up by the file's name: "colour" a modern photograph in
     * colour, "twin" one photograph (a blot on a light ground), "other"
     * another; anything else grey.
     */
    const grid = (at: (x: number, y: number) => [number, number, number]) => {
      const data = new Uint8Array(32 * 32 * 4);
      for (let y = 0; y < 32; y += 1)
        for (let x = 0; x < 32; x += 1)
          data.set([...at(x, y), 255], (y * 32 + x) * 4);
      return { data, width: 32, height: 32 };
    };
    const pixels = {
      ...FAKE_PIXELS,
      pixels: (bytes: Buffer) => {
        const said = decodeURIComponent(bytes.toString());
        if (/colour/u.test(said))
          return Promise.resolve(
            grid((x) =>
              x % 3 === 0
                ? [90, 150, 230]
                : x % 3 === 1
                  ? [180, 90, 60]
                  : [70, 160, 70],
            ),
          );
        if (/twin/u.test(said))
          return Promise.resolve(
            grid((x, y) => {
              const v = Math.hypot(x - 16, y - 13) < 6 ? 60 : 210 - y * 3;
              return [v, v, v];
            }),
          );
        if (/other/u.test(said))
          return Promise.resolve(
            grid((x, y) => {
              const v = x < 10 ? 30 : y < 15 ? 230 : 120 + ((x * y) % 50);
              return [v, v, v];
            }),
          );
        return FAKE_PIXELS.pixels(bytes, 256);
      },
    };
    const deskOf = (files: SourceFile[], focus = new FakeFocus()) => {
      const logs: string[] = [];
      const desk = new PictureDesk({
        sources: new FakeSources([BELLO], [], files),
        cache: new MemoryCache(),
        storage: new MemoryStorage(),
        pixels,
        focus: focus.ask,
        licence: 'off',
        now: () => NOW,
        log: (m) => logs.push(m),
      });
      return { desk, logs };
    };

    it('refuses a photograph in colour said to be of an event before colour film: the place photographed since', async () => {
      const bbc: PictureQuery = {
        name: 'The BBC Television Service opens',
        kind: 'event',
        years: [1936],
        place: ['Alexandra Palace, London'],
        words: ['The BBC Television Service opens at Alexandra Palace'],
        names: ['BBC'],
        asked:
          'an event: The BBC Television Service opens at Alexandra Palace (2 November 1936)',
      };
      const { desk, logs } = deskOf([
        commonsFile({
          sourceId: 'File:BBC television at Alexandra Palace 1936 colour.jpg',
          categories: ['1936 in London'],
          date: '1936',
        }),
        commonsFile({
          sourceId: 'File:BBC television studio at Alexandra Palace 1936.jpg',
          categories: ['1936 in London'],
          date: '1936',
        }),
      ]);
      const all = await desk.lookupAll(bbc);
      expect(all.map((r) => r.sourceId)).toEqual([
        'File:BBC television studio at Alexandra Palace 1936.jpg',
      ]);
      expect(logs.join('\n')).toMatch(
        /1936 colour\.jpg will not do: a photograph in colour said to be of 1936/u,
      );
    });

    it('takes one photograph once, though two files hold it', async () => {
      const { desk, logs } = deskOf([
        ...FILES,
        commonsFile({
          sourceId: 'File:Ahmadu Bello at Kaduna twin, 1957.jpg',
          categories: ['Ahmadu Bello', 'PD US Government'],
          date: '1957',
        }),
        commonsFile({
          sourceId: 'File:Sir Ahmadu Bello, Premier, twin print 1957.jpg',
          categories: ['Ahmadu Bello', 'PD US Government'],
          date: '1957',
        }),
        commonsFile({
          sourceId: 'File:Ahmadu Bello other, Kano 1953.jpg',
          categories: ['Ahmadu Bello', 'PD US Government'],
          date: '1953',
        }),
      ]);
      const all = await desk.lookupAll(BELLO_Q);
      const photos = all
        .filter((r) => r.use === 'photo')
        .map((r) => r.sourceId);
      expect(photos.filter((f) => /twin/u.test(f))).toHaveLength(1);
      // Both twins rank first (1957, the research's year): the second is passed over.
      expect(photos).toContain('File:Ahmadu Bello other, Kano 1953.jpg');
      expect(logs.join('\n')).toMatch(/twin.* is .*twin.* again: one picture/u);
    });
  });

  it('takes a black-and-white print’s year off its chip when that is only when it was scanned', async () => {
    const tube = commonsFile({
      sourceId:
        'File:Cathode-ray tube, 330-ps-7978-usn-708689 16257864287 o.jpg',
      artist: 'US Navy',
      credit: 'US Navy',
      date: '2015-02-24',
      uploaded: '2020-05-01',
      categories: ['Cathode ray tubes', 'PD US Navy'],
      structured: null,
    });
    const sources = new FakeSources([], [], [tube]);
    const focus = new FakeFocus();
    const { desk } = deskWith({ sources, focus, licence: 'off' });
    const [record] = await desk.lookupAll({
      name: 'cathode-ray tube',
      kind: 'object',
      words: ['cathode-ray tube'],
      asked: 'a thing: cathode-ray tube',
    });
    expect(record.year).toBeUndefined();
    expect(record.chip).toBe('cathode-ray tube · US Navy · Public domain');
    // A print whose title gives the year keeps it; so does one in colour.
    const titled = { ...tube, title: 'Picture tube test 2015' };
    const candidate = {
      file: titled,
      year: 2015,
      chip: 'cathode-ray tube, 2015 · US Navy · Public domain',
      subject: 'cathode-ray tube',
      source: 'US Navy',
      notes: [],
    } as unknown as Parameters<typeof undatedScan>[0];
    expect(undatedScan(candidate, { monochrome: true }).year).toBe(2015);
    expect(
      undatedScan({ ...candidate, file: tube }, { monochrome: false }).year,
    ).toBe(2015);
  });
});
