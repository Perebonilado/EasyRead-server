import {
  FAKE_PIXELS,
  FakeDepth,
  FakeSources,
  MemoryCache,
  MemoryStorage,
} from './__fixtures__/desk';
import { lookupKey, PictureDesk, PICK_LEAST } from './desk';
import type { PictureQuery } from './types';

const NOW = new Date('2026-10-02T09:00:00Z');

function deskWith(
  over: {
    sources?: FakeSources;
    depth?: FakeDepth | null;
    now?: () => Date;
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
});
