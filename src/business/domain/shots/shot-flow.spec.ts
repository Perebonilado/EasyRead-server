import type { SceneDto, ShotTargetDto } from '../../../contracts';
import { FakeLlmAdapter } from '../../../web/adapters/fake-llm.adapter';
import { explainerSheetOf } from '../studio/studio';
import { timedBeats } from './__fixtures__/regional-turn';
import { WALL_RESEARCH, WALL_ROWS, WALL_WORLD } from './__fixtures__/wall';
import { buildShots, shotLook } from './shot-build';
import { boardShots } from './shot-board';
import { checkTimed } from './shot-check-timed';
import { composeShotScene, shotsInputOf, shotsScriptOf } from './shot-compose';
import { mapSetAsset } from './shot-map';
import { registryOf } from './shot-registry';
import type { ShotPlan } from './types';

/**
 * A scene of shots from the board to the stage, nothing stood in for: the
 * board's own fake model plans the Berlin Wall scene, and the real map, the
 * real charts, the build, the timing, the checks and the sounds make it.
 */

const look = shotLook({
  palette: WALL_WORLD.palette,
  held: 'accent',
  theme: 'paper',
});

/** Whether a target names something the scene really has. */
function exists(scene: SceneDto, target: ShotTargetDto | undefined): boolean {
  if (!target) return false;
  const assets = scene.shots!.assets;
  if (target.kind === 'asset') {
    const asset = assets[target.asset];
    return (
      asset?.kind === 'svg' && (!target.part || !!asset.parts[target.part])
    );
  }
  if (target.kind === 'box') return target.box[2] > 0 && target.box[3] > 0;
  return true;
}

describe('a scene of shots from the board to the stage', () => {
  let scene: SceneDto;
  let plan: ShotPlan;
  let problems: ReturnType<typeof checkTimed>;

  beforeAll(async () => {
    const board = await boardShots(
      {
        rows: WALL_ROWS,
        research: WALL_RESEARCH,
        world: WALL_WORLD,
        scene: {
          index: 0,
          of: 4,
          title: 'The Wall',
          seconds: 18,
          episode: 'Two Germanys',
        },
        audience: 'adults',
      },
      new FakeLlmAdapter(),
    );
    plan = board.plan;
    const sheet = explainerSheetOf({
      kind: 'explainer',
      title: 'The Wall',
      transition: 'cut',
      draft: {
        fit: 'good',
        fitReason: null,
        title: 'The Wall',
        mood: 'serious',
        pace: 'infographic',
        beats: WALL_ROWS.map((r) => ({
          say: r.say,
          pause: 'short',
          delivery: 'explain',
          speaker: null,
          music: null,
          energy: null,
        })),
        cast: [],
        steps: [],
      },
      engine: 'shots',
      shots: board.plan,
      registry: board.registry.entries(),
      rowClaims: WALL_ROWS.map((r) => r.claims),
    });
    const beats = timedBeats(WALL_ROWS.map((r) => r.say));
    const durationMs = beats[beats.length - 1].endMs + 600;
    const made = composeShotScene(
      shotsInputOf(sheet, WALL_WORLD, true, 'wall-1')!,
      {
        script: shotsScriptOf(sheet, { stage: null, maths: false }),
        beats,
        durationMs,
        timing: 'voice',
        shape: 'wide',
        theme: 'paper',
        generator: 'scene-2',
        profile: {
          kind: 'textbook',
          tone: 'neutral',
          story: false,
          stage: null,
          film: true,
        },
        map: await mapSetAsset(WALL_WORLD.base, look, 'wide'),
      },
    );
    scene = made.scene;
    problems = made.problems;
  }, 60_000);

  it('makes every shot the board planned, each on a set the scene has', () => {
    const shots = scene.shots!.shots;
    expect(shots).toHaveLength(plan.shots.length);
    expect(shots.map((s) => s.set.kind)).toEqual(
      plan.shots.map((s) => s.set.kind),
    );
    for (const shot of shots)
      if ('asset' in shot.set)
        expect(scene.shots!.assets[shot.set.asset]).toBeDefined();
  });

  it('points every piece of information at something the scene has, never at words alone', () => {
    for (const shot of scene.shots!.shots)
      for (const item of shot.info)
        if (item.recipe !== 'ask')
          expect(exists(scene, item.target)).toBe(true);
  });

  it('pins Berlin where it is on the map, inside the East', () => {
    const [mapShot] = scene.shots!.shots;
    const pin = mapShot.info.find((i) => i.recipe === 'pin')!;
    const asset = scene.shots!.assets[(mapShot.set as { asset: string }).asset];
    expect(pin.target?.kind).toBe('box');
    const [x, y, w, h] = (pin.target as { box: number[] }).box;
    const east =
      asset.kind === 'svg'
        ? asset.parts['group-east-germany'].box
        : [0, 0, 0, 0];
    expect(x + w / 2).toBeGreaterThan(east[0]);
    expect(x + w / 2).toBeLessThan(east[0] + east[2]);
    expect(y + h / 2).toBeGreaterThan(east[1]);
    expect(y + h / 2).toBeLessThan(east[1] + east[3]);
  });

  it('counts the border’s length on the counter’s own number, and frames a quotation whole', () => {
    const [, counter, quote] = scene.shots!.shots;
    const count = counter.info.find((i) => i.recipe === 'count')!;
    expect(count).toMatchObject({ value: 1393, target: { part: 'number' } });
    expect(quote.focal).toEqual({
      kind: 'asset',
      asset: (quote.set as { asset: string }).asset,
    });
  });

  it('times everything inside its shot, lets words go with their shot, and gives the pin its tick', () => {
    for (const shot of scene.shots!.shots)
      for (const item of shot.info) {
        expect(item.atMs).toBeGreaterThanOrEqual(shot.startMs);
        expect(item.atMs + item.durMs).toBeLessThanOrEqual(shot.endMs);
        if (item.recipe === 'label' || item.recipe === 'mark')
          expect(item.untilMs).toBeLessThanOrEqual(shot.endMs);
      }
    expect(scene.shots!.sounds.some((s) => s.sound === 'tick')).toBe(true);
    expect(problems.map((p) => p.code)).not.toContain('first-change');
  });
});

describe('the board’s charts on the charts as drawn', () => {
  const registry = registryOf([]);
  const plan: ShotPlan = {
    shots: [
      {
        on: 'In 1961, Berlin',
        set: {
          kind: 'chart',
          chart: {
            kind: 'timeline',
            spec: {
              events: [
                { when: '1945', name: 'strikes' },
                { when: '1951', name: 'regional legislatures' },
              ],
            },
          },
        },
        actors: [],
        info: [
          { recipe: 'mark', target: 'part:strikes', on: 'Berlin' },
          {
            recipe: 'label',
            target: 'part:1951',
            text: '1951',
            on: 'cut in two',
          },
        ],
        life: [],
        camera: [],
        join: 'cut',
        focal: 'set',
      },
      {
        on: 'The inner border',
        set: {
          kind: 'chart',
          chart: {
            kind: 'calendar',
            spec: {
              calendars: [
                { label: 'deadline one', dates: ['1957'] },
                { label: 'deadline two', dates: ['1958'] },
              ],
            },
          },
        },
        actors: [],
        info: [{ recipe: 'mark', target: 'part:1958', on: '1,393 kilometres' }],
        life: [],
        camera: [],
        join: 'cut',
        focal: 'set',
      },
      {
        on: 'Tear down this',
        set: {
          kind: 'chart',
          chart: {
            kind: 'quote',
            spec: {
              text: 'Tear down this wall',
              speaker: 'Ronald Reagan',
              when: '1987',
              claim: 'c3',
            },
          },
        },
        actors: [],
        info: [{ recipe: 'mark', target: 'part:Ronald Reagan', on: 'he said' }],
        life: [],
        camera: [],
        join: 'cut',
        focal: 'set',
      },
    ],
  };
  const built = buildShots(plan, registry, {
    shape: 'wide',
    palette: [],
    held: null,
    theme: 'paper',
    map: null,
    seed: 'charts',
  });
  const [timeline, calendar, quote] = built.shots;

  it('draws a timeline event named by its own date with that date once', () => {
    const once = buildShots(
      {
        shots: [
          {
            ...plan.shots[0],
            set: {
              kind: 'chart',
              chart: {
                kind: 'timeline',
                spec: {
                  events: [
                    { when: '1945', name: '1945' },
                    { when: '1951', name: '1951' },
                  ],
                },
              },
            },
            info: [],
          },
        ],
      },
      registry,
      {
        shape: 'wide',
        palette: [],
        held: null,
        theme: 'paper',
        map: null,
        seed: 'charts',
      },
    );
    const svg = (once.assets['chart-1'] as { svg: string }).svg;
    expect(svg.match(/>1945</g)).toHaveLength(1);
  });

  it('draws a calendar named by its one date with that date once', () => {
    const once = buildShots(
      {
        shots: [
          {
            ...plan.shots[1],
            set: {
              kind: 'chart',
              chart: {
                kind: 'calendar',
                spec: {
                  calendars: [
                    { label: '1957', dates: ['1957'] },
                    { label: '1958', dates: ['1958'] },
                  ],
                },
              },
            },
            info: [],
          },
        ],
      },
      registry,
      {
        shape: 'wide',
        palette: [],
        held: null,
        theme: 'paper',
        map: null,
        seed: 'charts',
      },
    );
    const svg = (once.assets['chart-1'] as { svg: string }).svg;
    expect(svg.match(/>1957</g)).toHaveLength(1);
  });

  it('draws a timeline, a calendar and a quotation from the shapes the board writes', () => {
    expect(built.shots.map((s) => s.set.kind)).toEqual([
      'chart',
      'chart',
      'chart',
    ]);
    expect(built.notes.filter((n) => n.includes('could be drawn'))).toEqual([]);
  });

  it('finds an event by its name or its year, the event before its date or its dot', () => {
    expect(
      timeline.info.map((i) => (i.target as { part?: string }).part),
    ).toEqual(['event-strikes', 'event-regional-legislatures']);
  });

  it('finds a calendar’s sheet by its date, and a quotation’s speaker by name', () => {
    expect((calendar.info[0].target as { part?: string }).part).toBe('date-2');
    expect((quote.info[0].target as { part?: string }).part).toBe('speaker');
  });
});
