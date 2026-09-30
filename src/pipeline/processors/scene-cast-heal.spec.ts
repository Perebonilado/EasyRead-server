import { Logger } from '@nestjs/common';
import { NotFoundError } from '../../business/domain/errors/errors';
import { animalOf } from '../../business/domain/scene-animal';
import { castOf } from '../../business/domain/scene-sheet';
import type { SceneScript } from '../../business/domain/scene-script';
import type { StoryCharacter } from '../../business/domain/scene-story';
import type { StoragePort } from '../../business/ports/storage.port';
import { SceneProcessor, type PageStory } from './scene.processor';

/**
 * A show whose cast never kept the animal the kit draws (a pigeon from
 * the animal kit): each scene made again from the cast failed with "Not
 * drawn for the show yet". Code can draw them, so they are drawn and
 * kept, and the scene goes on.
 */

const pigeon = animalOf({
  species: 'pigeon',
  build: 'stout',
  size: 'small',
  coat: 'grey',
  second: 'white',
  pattern: 'belly',
  tail: 'short',
  wear: { neck: 'collar' },
  wearColour: 'red',
})!;

const person = (id: string, name: string): StoryCharacter => ({
  id,
  name,
  aliases: [],
  role: 'main',
  look: '',
  traits: [],
  firstPage: 1,
  met: 0,
  voice: 'woman',
  kind: 'person',
  figure: null,
});
const arnie: StoryCharacter = {
  ...person('arnie', 'Arnie'),
  role: 'supporting',
  met: 1,
  voice: 'creature',
  kind: 'animal',
  animal: pigeon,
  look: 'a stout grey pigeon with a white belly and a tiny red collar',
};

/** Storage in memory, the show's cast as Richard's is: the people kept, the pigeon not. */
function memory(files: Record<string, string>) {
  const kept = new Map(Object.entries(files));
  const storage: Partial<StoragePort> = {
    get: (key: string) => {
      const found = kept.get(key);
      return found === undefined
        ? Promise.reject(new NotFoundError(`no ${key}`))
        : Promise.resolve(Buffer.from(found));
    },
    put: ({ key, body }) => {
      kept.set(key, (body as Buffer).toString('utf8'));
      return Promise.resolve({ key } as never);
    },
  };
  return { kept, storage: storage as StoragePort };
}

const castKey = 'studio/show-1/cast.json';

function pipeline(storage: StoragePort): SceneProcessor {
  const config = { get: () => undefined };
  return new SceneProcessor(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    config as never,
    storage,
    {} as never,
  );
}

const story = (characters: StoryCharacter[]): PageStory => ({
  bible: { characters, places: [], pages: [], world: null },
  page: 1,
  castKey,
  setsKey: 'studio/show-1/sets.json',
  bookTitle: 'Never Closes Early',
});

describe("a cast member the kit draws, missing from the show's cast", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('is kept in the cast once drawn for a film, as a person is', async () => {
    const { kept, storage } = memory({ [castKey]: '{}' });
    await pipeline(storage).prepareStory(story([arnie]), null, 'test');
    const cast = castOf(JSON.parse(kept.get(castKey)!));
    expect(cast.arnie?.animal?.species).toBe('pigeon');
    expect(cast.arnie?.drawing.svg).toContain('<svg');
  });

  it('never writes over one kept meanwhile', async () => {
    const mine = {
      version: 2,
      drawing: { svg: '<svg id="mine"/>' },
      anchors: {},
    };
    const { kept, storage } = memory({
      [castKey]: JSON.stringify({ arnie: { ...mine, animal: pigeon } }),
    });
    await pipeline(storage).prepareStory(story([arnie]), null, 'test');
    const cast = JSON.parse(kept.get(castKey)!) as Record<
      string,
      { drawing: { svg: string } }
    >;
    expect(cast.arnie.drawing.svg).toBe('<svg id="mine"/>');
  });

  it('is drawn and kept when a scene is composed again, rather than the scene failing for them', async () => {
    const { kept, storage } = memory({ [castKey]: '{}' });
    const scenes = pipeline(storage);
    // What comes after the cast is not this test's: stop there.
    const drawAll = jest
      .spyOn(scenes as unknown as { drawAll: () => Promise<never> }, 'drawAll')
      .mockRejectedValue(new Error('drawn: on to the stage'));
    const script = {
      title: 'The stoop',
      cast: [{ id: 'arnie', kind: 'character', ref: 'arnie', name: 'Arnie' }],
      ownThings: [],
      features: [],
    } as unknown as SceneScript;
    await expect(
      scenes.recompose({
        script,
        kept: new Map(),
        beats: [],
        durationMs: 1000,
        timing: {} as never,
        profile: {} as never,
        story: story([arnie]),
        base: 'studio/show-1/e1/s2',
        who: 'test',
      }),
    ).rejects.toThrow('drawn: on to the stage');
    expect(drawAll).toHaveBeenCalled();
    expect(castOf(JSON.parse(kept.get(castKey)!)).arnie?.animal?.species).toBe(
      'pigeon',
    );
  });

  it('still fails for one only the artist can draw', async () => {
    const { storage } = memory({ [castKey]: '{}' });
    const scenes = pipeline(storage);
    const mermaid: StoryCharacter = {
      ...person('mira', 'Mira'),
      kind: 'creature',
      look: 'a mermaid with a green tail',
    };
    const script = {
      title: 'The pier',
      cast: [{ id: 'mira', kind: 'character', ref: 'mira', name: 'Mira' }],
      ownThings: [],
      features: [],
    } as unknown as SceneScript;
    await expect(
      scenes.recompose({
        script,
        kept: new Map(),
        beats: [],
        durationMs: 1000,
        timing: {} as never,
        profile: {} as never,
        story: story([mermaid]),
        base: 'studio/show-1/e1/s3',
        who: 'test',
      }),
    ).rejects.toThrow('Not drawn for the show yet, so not composed: Mira');
  });
});
