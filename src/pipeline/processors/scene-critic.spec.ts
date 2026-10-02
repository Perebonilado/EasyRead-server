import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SceneDto } from '../../contracts';
import {
  WALL_RESEARCH,
  WALL_ROWS,
  WALL_WORLD,
} from '../../business/domain/shots/__fixtures__/wall';
import { mendPlan, WHOLE_SET } from '../../business/domain/shots/shot-check';
import type { ShotsInput } from '../../business/domain/shots/shot-compose';
import { sceneNarration } from '../../business/domain/shots/shot-phrases';
import { buildRegistry } from '../../business/domain/shots/shot-registry';
import type { ShotPlan } from '../../business/domain/shots/types';
import type { SceneScript } from '../../business/domain/scene-script';
import type { ExplainerSheet } from '../../business/domain/studio/studio';
import type {
  StudioEpisodeRecord,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import type { SceneEyesPort } from '../export/scene-eyes';
import { encodePng } from '../export/frame-images';
import { SceneCritic, type SceneCriticDeps } from './scene-critic';

const registry = buildRegistry({
  rows: WALL_ROWS,
  research: WALL_RESEARCH,
  world: WALL_WORLD,
});
const plan: ShotPlan = mendPlan(
  {
    shots: [
      {
        on: 'In 1961',
        set: { kind: 'map', tilt: 'flat' },
        info: [{ recipe: 'pin', target: 'place:Berlin', on: 'Berlin' }],
        camera: [],
        actors: [],
        life: [],
        join: 'cut',
        focal: 'place:Berlin',
      },
      {
        on: 'The inner border',
        set: {
          kind: 'chart',
          chart: {
            kind: 'counter',
            spec: { value: 1393, unit: 'km', label: 'inner border' },
          },
        },
        info: [],
        camera: [],
        actors: [],
        life: [],
        join: 'cut',
        focal: WHOLE_SET,
      },
    ],
  },
  sceneNarration(WALL_ROWS),
  registry,
  { map: true },
);

/** The scene as voiced: one beat a line, its words timed. */
const made: SceneDto = {
  id: 'scene',
  title: 'The Wall',
  durationMs: 24_000,
  timing: 'voice',
  things: [],
  steps: [],
  effects: [],
  beats: WALL_ROWS.map((row, k) => ({
    text: row.say,
    startMs: k * 4000,
    endMs: k * 4000 + 3500,
    words: row.say
      .split(' ')
      .map((w, i, all) => [
        all.slice(0, i).join(' ').length + (i ? 1 : 0),
        all.slice(0, i + 1).join(' ').length,
        k * 4000 + i * 300,
        k * 4000 + i * 300 + 250,
      ]),
  })),
  shots: {
    version: 1,
    look: {
      palette: {
        paper: '#fff',
        ink: '#000',
        muted: '#555',
        accent: '#d00',
        sides: {},
      },
      fonts: { display: 'serif', text: 'sans-serif' },
      grain: 0,
      motion: 'springy',
    },
    assets: {},
    shots: ['s1', 's2'].map((id, k) => ({
      id,
      startMs: k * 4000,
      endMs: k ? 24_000 : 4000,
      set: { kind: 'plain' as const },
      actors: [],
      info: [],
      life: [],
      camera: [],
      join: 'cut' as const,
      joinMs: 0,
    })),
    sounds: [],
  },
} as unknown as SceneDto;

const script = {
  fit: 'good',
  fitReason: null,
  title: 'The Wall',
  mood: 'calm',
  beats: WALL_ROWS.map((row) => ({ say: row.say })),
  cast: [],
  steps: [],
} as unknown as SceneScript;

const sheet: ExplainerSheet = {
  kind: 'explainer',
  title: 'The Wall',
  transition: 'cut',
  draft: { title: 'The Wall', beats: [], cast: [], steps: [] } as never,
  engine: 'shots',
  shots: plan,
  registry: registry.entries(),
  rowClaims: WALL_ROWS.map((r) => r.claims),
};

const show = {
  id: 'show',
  brief: { audience: 'adults', format: 'explainer' },
  bible: { subject: 'history', maths: false },
  editor: { world: WALL_WORLD, research: WALL_RESEARCH },
} as unknown as StudioShowRecord;
const episode = {
  id: 'episode',
  title: 'Berlin',
  outline: {
    title: 'Berlin',
    scenes: [{ title: 'The Wall', rows: [0, WALL_ROWS.length - 1] }],
  },
  editorial: { rows: WALL_ROWS },
} as unknown as StudioEpisodeRecord;
const row = (more: Partial<StudioSceneRecord> = {}) =>
  ({
    id: 'row',
    episodeId: 'episode',
    position: 0,
    sheet,
    frames: null,
    ...more,
  }) as unknown as StudioSceneRecord;
const shots: ShotsInput = {
  plan,
  registry: registry.entries(),
  rowClaims: sheet.rowClaims!,
  world: null,
  first: true,
  seed: 'row',
};

/** Everything the critic is made with, faked, and what each was asked. */
function deps(
  scores: number[],
  more: Partial<SceneCriticDeps> = {},
  others: Partial<StudioSceneRecord>[] = [],
) {
  const said = {
    updates: [] as Record<string, unknown>[],
    put: [] as string[],
    deleted: [] as string[],
    critics: 0,
    recomposed: [] as ShotPlan[],
  };
  const eyes: SceneEyesPort = {
    stills: (input) => {
      mkdirSync(input.outDir, { recursive: true });
      return Promise.resolve(
        input.moments.slice(0, 3).map((moment, k) => {
          const file = join(input.outDir, `still-${k}.png`);
          writeFileSync(
            file,
            encodePng({
              width: 16,
              height: 9,
              data: new Uint8Array(16 * 9 * 4).fill(200),
            }),
          );
          return {
            moment,
            file,
            inspect: {
              ms: moment.ms,
              shape: 'wide' as const,
              width: 1920,
              height: 1080,
              items: [],
            },
            join: false,
          };
        }),
      );
    },
  };
  const d: SceneCriticDeps = {
    studio: {
      listScenes: () => Promise.resolve([row(), ...others.map((o) => row(o))]),
      updateScene: (_id: string, patch: Record<string, unknown>) => {
        said.updates.push(patch);
        return Promise.resolve();
      },
    } as never,
    llm: {
      shotsCritic: () => {
        const score = scores[Math.min(scores.length - 1, said.critics)];
        said.critics += 1;
        return Promise.resolve({
          value: {
            scores: [
              'clarity',
              'readability',
              'composition',
              'motion',
              'depth',
              'truth',
              'polish',
              'hook',
            ].map((axis) => ({
              axis,
              score: axis === 'motion' ? score : 9,
              why: 'seen',
            })),
            fixes: [
              {
                kind: 'add-camera',
                shot: 2,
                to: 'push',
                note: 'nothing moves',
              },
            ],
            verdict: 'ok',
          },
          usage: {
            model: 'openai:gpt-5.4-mini',
            tokensIn: 4000,
            tokensOut: 400,
            latencyMs: 1,
          },
        });
      },
      shotsBoard: () => Promise.reject(new Error('not asked')),
    },
    calls: { record: () => Promise.resolve() },
    storage: {
      put: (input: { key: string }) => {
        said.put.push(input.key);
        return Promise.resolve({ key: input.key });
      },
      delete: (key: string) => {
        said.deleted.push(key);
        return Promise.resolve();
      },
    } as never,
    scenes: {
      recompose: (input: { base: string; shots?: ShotsInput }) => {
        said.recomposed.push(input.shots!.plan);
        return Promise.resolve({
          scene: { ...made, id: 'again' },
          sceneKey: `${input.base}-scene.json`,
          thumbKey: `${input.base}-thumb.png`,
          script,
        });
      },
    },
    eyes,
    setting: () => undefined,
    logger: { log: () => undefined, warn: () => undefined },
    ...more,
  };
  return { d, said };
}

const input = (r = row()) => ({
  show,
  episode,
  row: r,
  make: { script, profile: {} as never, shots },
  made: {
    scene: made,
    sceneKey: 'studio/k1-scene.json',
    thumbKey: 'studio/k1-thumb.png',
    audioKey: 'studio/k1.mp3',
    durationMs: 24_000,
  },
  shape: 'wide' as const,
  who: 'test',
});

describe('the critic as the make runs it', () => {
  it('looks, fixes, builds again on the same voice, and keeps the sheet and the version it ends on', async () => {
    const { d, said } = deps([6, 8.5]);
    const out = await new SceneCritic(d).loop(input());
    expect(out.frames?.error).toBeUndefined();
    expect(said.critics).toBe(2);
    expect(out.frames?.ended).toBe('passed');
    // Built again once, from the plan with the critic's camera move on shot 2.
    expect(said.recomposed).toHaveLength(1);
    expect(said.recomposed[0].shots[1].camera).toContainEqual(
      expect.objectContaining({ move: 'push' }),
    );
    expect(out.sceneKey).toMatch(
      /^studio\/show\/episode\/row-.+-scene\.json$/u,
    );
    expect(out.sheet?.shots).toEqual(said.recomposed[0]);
    // The row pointed at the scene as made, then at the new version with its sheet.
    expect(said.updates[0]).toEqual(
      expect.objectContaining({
        sceneKey: 'studio/k1-scene.json',
        frames: null,
      }),
    );
    expect(said.updates).toContainEqual(
      expect.objectContaining({ sceneKey: out.sceneKey, sheet: out.sheet }),
    );
    expect(
      (said.updates.at(-1) as { frames?: { ended: string } }).frames?.ended,
    ).toBe('passed');
    // Each round's sheet kept; the version left behind deleted.
    expect(said.put).toEqual([
      'studio/k1-critic-1.png',
      `${out.sceneKey.replace(/-scene\.json$/u, '')}-critic-2.png`,
    ]);
    expect(said.deleted).toEqual([
      'studio/k1-scene.json',
      'studio/k1-thumb.png',
      'studio/k1-parts.json',
    ]);
  });

  it('does nothing with the switch off, or with no eyes', async () => {
    const off = deps([6], {
      setting: (name) => (name === 'EXPLAINER_CRITIC' ? 'off' : undefined),
    });
    const out = await new SceneCritic(off.d).loop(input());
    expect(out).toEqual(
      expect.objectContaining({
        sceneKey: 'studio/k1-scene.json',
        sheet: null,
        frames: null,
      }),
    );
    expect(off.said.critics).toBe(0);
    const blind = deps([6], { eyes: null });
    expect(new SceneCritic(blind.d).on()).toBe(false);
  });

  it('spends no more than the episode’s budget, less what its other scenes spent', async () => {
    const { d, said } = deps([6], {}, [
      { id: 'other', frames: { costUsd: 0.6, rounds: [] } as never },
    ]);
    const out = await new SceneCritic(d).loop(input());
    expect(out.frames?.ended).toBe('budget');
    expect(said.critics).toBe(0);
    expect(out.sceneKey).toBe('studio/k1-scene.json');
  });

  it('deletes an earlier make’s sheets before it looks again', async () => {
    const { d, said } = deps([9]);
    await new SceneCritic(d).loop(
      input(
        row({
          frames: {
            rounds: [{ sheetKey: 'studio/old-critic-1.png' }],
          } as never,
        }),
      ),
    );
    expect(said.deleted).toContain('studio/old-critic-1.png');
  });
});
