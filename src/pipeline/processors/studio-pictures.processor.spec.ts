import { EMPTY_BIBLE } from '../../business/domain/studio/studio';
import type {
  PictureQuery,
  PictureRecord,
} from '../../business/domain/pictures/types';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import { FakeLlmAdapter } from '../../web/adapters/fake-llm.adapter';
import { StudioEditorProcessor } from './studio-editor.processor';

// A shots episode of two scenes: the first names Ahmadu Bello and Lagos,
// the second neither.
const ROWS = [
  {
    say: 'In Lagos, Ahmadu Bello pressed for a slower timetable.',
    claims: [],
    show: '',
    visual: 'why',
  },
  {
    say: 'The North would not fix a date too soon.',
    claims: [],
    show: '',
    visual: 'why',
  },
];

const show = {
  id: 's1',
  brief: { audience: 'adults' },
  editor: {
    research: {
      claims: [],
      timeline: [{ date: '1957', event: 'Talks', claims: [] }],
      numbers: [],
      myths: [],
      perspectives: [],
      looks: [],
      pronunciations: [],
      open: [],
      searched: 0,
    },
    world: {
      region: 'Nigeria',
      people: [
        { name: 'Ahmadu Bello', role: 'Northern Region leader', claims: [] },
      ],
      places: [],
      palette: [],
      things: [],
      base: null,
    },
  },
} as unknown as StudioShowRecord;

const episode = {
  id: 'e1',
  showId: 's1',
  outline: {
    title: 'The Regional Turn',
    scenes: [
      { title: 'One', seconds: 6, rows: [0, 0] },
      { title: 'Two', seconds: 6, rows: [1, 1] },
    ],
  },
  editorial: {
    rows: ROWS,
    package: {
      title: 't',
      titles: [],
      thumbnail: { words: '', row: null },
      description: 'How did it happen?',
      pinned: '',
      hashtags: [],
      leftOut: '',
    },
  },
} as unknown as StudioEpisodeRecord;

const record = (over: Partial<PictureRecord>): PictureRecord => ({
  id: 'p1',
  qid: 'Q401032',
  source: 'commons',
  sourceId: 'File:Ahmadu Bello 1960.jpg',
  kind: 'person',
  subject: 'Ahmadu Bello',
  url: 'https://upload.wikimedia.org/x.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg',
  licence: 'Public domain',
  credit:
    '“Ahmadu Bello 1960” by US Department of Energy, via Wikimedia Commons, Public domain.',
  chip: 'Ahmadu Bello, 1960 · US Department of Energy · Public domain',
  width: 1280,
  height: 1602,
  focal: [427, 534, 427, 534],
  sha1: 'a'.repeat(40),
  mime: 'image/jpeg',
  storageKey: 'pictures/a.jpg',
  depthKey: null,
  dates: '1910–1966',
  role: 'Northern Region leader',
  ...over,
});

function processorWith(
  pictures: { lookup(q: PictureQuery): Promise<PictureRecord | null> } | null,
  settings: Record<string, string> = {},
) {
  const scenes = new Map<string, Partial<StudioSceneRecord>>();
  const repo: Partial<StudioRepository> = {
    findEpisode: () => Promise.resolve(structuredClone(episode)),
    updateScene: (id, patch) => {
      scenes.set(id, { ...scenes.get(id), ...structuredClone(patch) });
      return Promise.resolve();
    },
    updateEpisode: () => Promise.resolve(),
  };
  const processor = new StudioEditorProcessor({
    studio: repo as StudioRepository,
    llm: new FakeLlmAdapter(),
    calls: { record: () => Promise.resolve() },
    queue: { enqueueStudio: () => Promise.resolve() },
    setting: (name) => settings[name],
    pictures,
    logger: { log: () => undefined, warn: () => undefined },
  });
  return { processor, scenes };
}

describe('the picture desk in the editor’s boards', () => {
  it('asks the desk once for the episode, and offers each scene only what is about it', async () => {
    const asked: PictureQuery[] = [];
    const desk = {
      lookup: (query: PictureQuery) => {
        asked.push(query);
        return Promise.resolve(
          query.kind === 'person'
            ? record({})
            : record({
                id: 'p2',
                kind: 'place',
                subject: 'Lagos',
                year: 1958,
                chip: 'Lagos, 1958 · USIA · Public domain',
              }),
        );
      },
    };
    const { processor, scenes } = processorWith(desk);
    const pictures = await processor.pictureDesk(show, episode);
    expect(asked.map((q) => `${q.kind}:${q.name}`)).toEqual([
      'person:Ahmadu Bello',
      'place:Lagos',
    ]);
    expect(pictures?.entries.map((e) => e.entry.name)).toEqual([
      'person:Ahmadu Bello',
      'photo:Lagos 1958',
    ]);

    const row = (k: number) =>
      ({ id: `c${k}` }) as unknown as StudioSceneRecord;
    const first = await processor.shotsBoard(
      show,
      episode,
      EMPTY_BIBLE,
      row(0),
      0,
      pictures,
    );
    const second = await processor.shotsBoard(
      show,
      episode,
      EMPTY_BIBLE,
      row(1),
      1,
      pictures,
    );
    const named = (sheet: typeof first, name: string) =>
      sheet.registry?.find((e) => e.name === name);
    // The scene that names him has his portrait; the photo of Lagos where Lagos is named.
    expect(named(first, 'person:Ahmadu Bello')?.picture?.asset).toBe('p1');
    expect(named(first, 'photo:Lagos 1958')?.picture?.asset).toBe('p2');
    // The other scene is offered neither, and never has him brought in.
    expect(named(second, 'person:Ahmadu Bello')).toBeUndefined();
    expect(named(second, 'photo:Lagos 1958')).toBeUndefined();
    expect(scenes.get('c0')?.status).toBe('ready');
  });

  it('asks nothing with the desk switched off, or with no desk; a desk that fails holds nothing up', async () => {
    let asked = 0;
    const desk = {
      lookup: () => {
        asked += 1;
        return Promise.resolve(null);
      },
    };
    expect(
      await processorWith(desk, { PICTURE_DESK: 'off' }).processor.pictureDesk(
        show,
        episode,
      ),
    ).toBeNull();
    expect(asked).toBe(0);
    expect(
      await processorWith(null).processor.pictureDesk(show, episode),
    ).toBeNull();
    const failing = { lookup: () => Promise.reject(new Error('down')) };
    expect(
      (await processorWith(failing).processor.pictureDesk(show, episode))
        ?.entries,
    ).toEqual([]);
  });
});
