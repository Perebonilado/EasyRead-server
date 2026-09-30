import {
  WATER_OUTLINE,
  WATER_PICTURES,
  WATER_SHEETS,
} from '../../business/domain/__fixtures__/water-cycle-build';
import { briefOf } from '../../business/domain/studio/studio';
import type { StudioBible } from '../../business/domain/studio/studio';
import { sharedDrawings } from '../../business/domain/studio/studio-build';
import type { GatedDrawing } from '../../business/domain/scene-svg';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { SceneProcessor } from './scene.processor';
import {
  StudioProcessor,
  explainerScripts,
  studioBoardKey,
  studioMakeOf,
} from './studio.processor';

/**
 * A continuous build as the Studio makes it (studio-explainer-plan, part
 * C): the water cycle in three scenes, from fixtures. No model is asked.
 */
const at = new Date('2026-09-30T10:00:00Z');
const bible = {
  characters: [],
  sets: [],
  world: null,
  subject: 'science: the water cycle',
  maths: false,
  pictures: WATER_PICTURES,
} as unknown as StudioBible;
const show: StudioShowRecord = {
  id: 'w1',
  userId: 'u1',
  title: 'The Water Cycle',
  format: 'explainer',
  brief: briefOf({
    format: 'explainer',
    idea: 'the water cycle',
    audience: 'children',
    minutes: 1,
  }),
  bible,
  createdAt: at,
  updatedAt: at,
};
const episode = {
  id: 'we1',
  showId: 'w1',
  userId: 'u1',
  number: 1,
  title: 'The water cycle',
  logline: null,
  phase: 'script',
  busy: null,
  error: null,
  outline: { title: 'The water cycle', logline: '', scenes: WATER_OUTLINE },
  shareToken: null,
  durationMs: null,
  thumbKey: null,
  createdAt: at,
  updatedAt: at,
} as StudioEpisodeRecord;
const rows = WATER_SHEETS.map(
  (sheet, position) =>
    ({
      id: `ws${position}`,
      episodeId: 'we1',
      position,
      sheet,
      status: 'ready',
    }) as StudioSceneRecord,
);

const drawingOf = (id: string): GatedDrawing => ({
  svg: `<svg viewBox="0 0 10 10"><rect id="${id}" width="10" height="10"/></svg>`,
  viewBox: [0, 0, 10, 10],
  aspect: 1,
  parts: {},
  labels: {},
  states: {},
  moves: false,
  callouts: [],
  field: null,
});

describe('a continuous build as the Studio makes it', () => {
  it('lays each scene on the board the scenes before it left, its things kept under their ids', () => {
    const second = studioMakeOf(show, episode, rows[1], rows, bible).script!;
    // The writer's "wisps" is the vapour the first scene drew.
    expect(second.cast.some((t) => t.id === 'wisps')).toBe(false);
    expect(second.board?.carried).toEqual(['sun', 'sea', 'vapour']);
    const third = studioMakeOf(show, episode, rows[2], rows, bible).script!;
    expect(third.board?.carried).toEqual([
      'sun',
      'sea',
      'vapour',
      'drops',
      'cloud',
    ]);
    // Its own "sea" is the first scene's, and the section ends on the whole board.
    expect(third.cast.filter((t) => t.id === 'sea')).toHaveLength(1);
    const stages = third.steps.flatMap((s) => (s.stage ? [s.stage] : []));
    expect(stages[stages.length - 1].board?.frame).toBe('whole');
  });

  it('finds the drawings the build shares: each on the board in more than one scene', () => {
    const shared = sharedDrawings(
      WATER_OUTLINE,
      explainerScripts(show, episode, rows, bible),
    ).map((t) => t.id);
    expect(shared.sort()).toEqual(['cloud', 'drops', 'sea', 'sun', 'vapour']);
  });

  it('draws the shared drawings once, before its scenes are made, and never again', async () => {
    const store = new Map<string, Buffer>();
    const drawn: string[][] = [];
    const made: { drawn?: ReadonlyMap<string, GatedDrawing> }[] = [];
    const storage = {
      get: (key: string) =>
        store.has(key)
          ? Promise.resolve(store.get(key)!)
          : Promise.reject(new Error('none')),
      put: ({ key, body }: { key: string; body: Buffer }) => {
        store.set(key, body);
        return Promise.resolve({ key });
      },
      delete: () => Promise.resolve(),
    };
    const scenes = {
      drawThings: (things: { id: string }[]) => {
        drawn.push(things.map((t) => t.id));
        return Promise.resolve(
          new Map(things.map((t) => [t.id, drawingOf(t.id)])),
        );
      },
      make: (input: { drawn?: ReadonlyMap<string, GatedDrawing> }) => {
        made.push(input);
        return Promise.resolve({
          fit: 'good',
          scene: { title: 'x', steps: [], effects: [] },
          sceneKey: 'k',
          thumbKey: 't',
          voice: { audioKey: 'a', durationMs: 20_000 },
          drawings: new Map(),
        });
      },
    } as unknown as SceneProcessor;
    const processor = new StudioProcessor(
      {
        findShow: () => Promise.resolve(show),
        findEpisode: () => Promise.resolve(episode),
        listScenes: () => Promise.resolve(rows),
        findScene: (id: string) =>
          Promise.resolve(rows.find((r) => r.id === id) ?? null),
        updateScene: () => Promise.resolve(),
      } as unknown as StudioRepository,
      {} as LlmGatewayPort,
      { record: () => Promise.resolve() },
      storage as never,
      scenes,
      { recordStudioSeconds: () => Promise.resolve() } as never,
      { cast: () => Promise.reject(new Error('none')) } as never,
      { enqueueStudio: () => Promise.resolve() } as never,
    );
    const prepare = () =>
      processor.process(
        {
          kind: 'prepare',
          showId: 'w1',
          episodeId: 'we1',
          userId: 'u1',
          sceneIds: rows.map((r) => r.id),
        },
        { attemptsMade: 1, isFinalAttempt: true },
      );
    await prepare();
    expect(drawn).toHaveLength(1);
    expect(drawn[0].sort()).toEqual(['cloud', 'drops', 'sea', 'sun', 'vapour']);
    const sea = explainerScripts(
      show,
      episode,
      rows,
      bible,
    )(0)!.cast.find((t) => t.id === 'sea')!;
    expect(store.has(studioBoardKey('w1', sea as never))).toBe(true);
    // Made again: kept, not drawn again.
    await prepare();
    expect(drawn).toHaveLength(1);
    // Each scene is made on them: the third's sea, sun and cloud as drawn once.
    await processor
      .process(
        {
          kind: 'make',
          showId: 'w1',
          episodeId: 'we1',
          userId: 'u1',
          sceneId: 'ws2',
        },
        { attemptsMade: 1, isFinalAttempt: true },
      )
      .catch(() => undefined);
    expect(made).toHaveLength(1);
    expect([...(made[0].drawn?.keys() ?? [])].sort()).toEqual([
      'cloud',
      'drops',
      'sea',
      'sun',
      'vapour',
    ]);
  });
});
