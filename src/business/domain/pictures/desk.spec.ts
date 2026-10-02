import {
  BELLO,
  commonsFile,
  FAKE_PIXELS,
  FakeDepth,
  FakeFocus,
  FakeSources,
  FILES,
  MemoryCache,
  MemoryStorage,
  ROBERTSON,
  ROBERTSON_NAMESAKE,
} from './__fixtures__/desk';
import { DESK_RULES, lookupKey, PictureDesk, PICK_LEAST } from './desk';
import type { LicenceMode } from './licence';
import type { PictureQuery } from './types';

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
});
