import { BEATS, DURATION_MS, MAP, PALETTE, REGISTRY, wordAt } from './__fixtures__/regional-turn';
import { buildShots, type BuildContext } from './shot-build';
import { checkPlan, mendPlan, planOf, sameSet } from './shot-check';
import { registryOf } from './shot-registry';
import { SETTLE_LEAD_MS, timeShots } from './shot-time';
import type { PlanShot, ShotPlan } from './types';

const ctx: BuildContext = {
  shape: 'wide',
  palette: PALETTE,
  held: 'chart5',
  theme: 'paper',
  map: MAP,
  seed: 'scene-1',
};
const registry = registryOf(REGISTRY);

const shot = (on: string, more: Partial<PlanShot>): PlanShot => ({
  on,
  set: { kind: 'set', set: { land: 'plain', time: 'dusk', town: 'town', place: 'industry', era: '1900-1945' } },
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'continue',
  ...more,
});

describe('a drawn set built from the plan', () => {
  const plan: ShotPlan = {
    shots: [
      shot('After the 1945 strikes,', {}),
      shot('Then the fight changed:', {
        set: {
          kind: 'set',
          set: {
            land: 'plain',
            time: 'dusk',
            town: 'town',
            place: 'industry',
            era: '1900-1945',
            becomes: { state: 'lights-on', on: 'no longer one deadline' },
          },
        },
        camera: [{ move: 'push', on: 'no longer one deadline', amount: 'small' }],
      }),
      shot('Why did self-government', {
        set: { kind: 'set', set: { land: 'coast', time: 'day', town: 'town', place: 'port', illustration: true } },
        join: 'cut',
      }),
    ],
  };
  const built = buildShots(plan, registry, ctx);

  it('draws a place once for every shot that shows it, the shots after carrying it on', () => {
    expect(built.shots[0].set).toEqual({ kind: 'set', asset: 'set-1' });
    expect(built.shots[1].set).toEqual({ kind: 'set', asset: 'set-1' });
    expect(built.shots[2].set).toEqual({ kind: 'set', asset: 'set-2' });
    expect(built.shots[0].join).toBe('continue');
    expect(built.shots[1].join).toBe('cut');
    const set = built.assets['set-1'];
    expect(set.kind === 'svg' && set.scenery?.state).toBe('dusk');
    expect(built.notes.join('\n')).toContain('drawn set plain, dusk, clear, town, industry, 1900-1945');
  });

  it('tags only a set standing for a real event as an illustration', () => {
    expect(built.shots[0].illustration).toBeUndefined();
    expect(built.shots[2].illustration).toBe(true);
  });

  it('changes the light on its words, from its word for its own length', () => {
    expect(built.shots[1].changes).toEqual([{ state: 'lights-on', on: 'no longer one deadline', durMs: 2600 }]);
    expect(built.shots[0].changes).toBeUndefined();
    const timed = timeShots(built.shots, BEATS, DURATION_MS);
    const second = timed[1];
    expect(second.set.kind === 'set' && second.set.changes).toEqual([
      { state: 'lights-on', atMs: wordAt(1, 6) - SETTLE_LEAD_MS, durMs: 2600 },
    ]);
    expect(timed[0].set.kind === 'set' && timed[0].set.changes).toBeFalsy();
  });

  it('stands an actor on the set’s ground at the set’s own scale, fading into its air', () => {
    const withCrowd = buildShots(
      {
        shots: [
          shot('After the 1945 strikes,', {
            actors: [{ id: 'workers', kit: 'people.group', params: { count: 5 }, place: 'centre' }],
          }),
        ],
      },
      registry,
      ctx,
    );
    const [workers] = withCrowd.shots[0].actors;
    expect(workers).toBeDefined();
    const set = withCrowd.assets['set-1'];
    const groundLine = set.kind === 'svg' ? set.parts['ground-line'] : undefined;
    expect('y' in workers.at && workers.at.y).toBeCloseTo(groundLine!.box[1], 0);
    // A person about a third of the set's height: its scale, not the subject's.
    expect(workers.size / 1000).toBeGreaterThan(0.25);
    expect(workers.size / 1000).toBeLessThan(0.45);
  });
});

describe('a machine shown on a display', () => {
  const plan: ShotPlan = {
    shots: [
      {
        on: 'After the 1945 strikes,',
        set: { kind: 'set', set: { land: 'plain', time: 'day', place: 'display' } },
        actors: [{ id: 'engine', kit: 'machine.turbofan', place: 'centre' }],
        info: [
          { recipe: 'run', target: 'actor:engine', on: 'After the 1945' },
          { recipe: 'flow', target: 'actor:engine.core-flow', text: 'compress', on: 'colonial Nigeria began' },
          { recipe: 'label', target: 'actor:engine.combustor', on: 'shifting power' },
          { recipe: 'label', target: 'actor:engine.HP compressor', text: 'Compressor', on: 'regional legislatures' },
          { recipe: 'spotlight', target: 'actor:engine.no-such-part', on: 'regional legislatures' },
        ],
        life: [],
        camera: [{ move: 'push', target: 'actor:engine.combustor', on: 'shifting power', amount: 'medium' }],
        join: 'cut',
        focal: 'actor:engine',
      },
    ],
  };
  const built = buildShots(plan, registry, ctx);
  const [one] = built.shots;

  it('stands the machine big as the shot’s subject, sized by its own kind on a set with no scale', () => {
    const [engine] = one.actors;
    const set = built.assets[one.set.kind === 'set' ? one.set.asset : ''];
    expect(set.kind === 'svg' && set.box).toEqual([0, 0, 2000, 1000]);
    const asset = built.assets[engine.asset];
    const width = asset.kind === 'svg' ? (engine.size / asset.box[3]) * asset.box[2] : 0;
    expect(width / 2000).toBeGreaterThan(0.45);
    expect(one.focal).toEqual({ kind: 'actor', actor: 'engine' });
  });

  it('points at the machine’s parts: its flow’s path, a label on its combustor named by the part, a push to it', () => {
    const [run, flow, label, named] = one.info;
    expect(run).toMatchObject({ recipe: 'run', target: { kind: 'actor', actor: 'engine' } });
    expect(flow).toMatchObject({ recipe: 'flow', target: { kind: 'actor', actor: 'engine', part: 'core-flow' }, text: 'compress' });
    expect(label).toMatchObject({ recipe: 'label', target: { kind: 'actor', actor: 'engine', part: 'combustor' } });
    expect(named).toMatchObject({ target: { kind: 'actor', actor: 'engine', part: 'hp-compressor' }, text: 'Compressor' });
    expect(one.info).toHaveLength(4);
    expect(built.notes.join('\n')).toContain('spotlight on "actor:engine.no-such-part" dropped');
    expect(one.camera[0].target).toMatchObject({ kind: 'actor', actor: 'engine', part: 'combustor' });
  });
});

describe('the board’s drawn sets, made sound', () => {
  it('reads a place, a climate, a change of light on its words and a tag; a change to the light it opens in is none', () => {
    const raw = {
      shots: [
        {
          on: 'After the 1945 strikes,',
          set: { kind: 'set', land: 'coast', time: 'dusk', place: 'harbour', climate: 'humid', becomes: 'nightfall', becomesOn: 'colonial Nigeria', illustration: true },
          info: [],
          camera: [],
          life: [],
          join: 'cut',
        },
        {
          on: 'Then the fight changed:',
          set: { kind: 'set', land: 'plain', time: 'night', becomes: 'night', becomesOn: 'no longer' },
          info: [],
          camera: [],
          life: [],
          join: 'cut',
        },
      ],
    };
    const plan = planOf(raw);
    expect(plan.shots[0].set).toEqual({
      kind: 'set',
      set: {
        land: 'coast',
        time: 'dusk',
        place: 'port',
        climate: 'tropical',
        becomes: { state: 'night', on: 'colonial Nigeria' },
        illustration: true,
      },
    });
    expect(plan.shots[1].set.kind === 'set' && plan.shots[1].set.set.becomes).toBeUndefined();
  });

  it('counts two shots of one place as one set, whatever their light does, and keeps both changes apart', () => {
    const a = { kind: 'set' as const, set: { land: 'plain' as const, time: 'dusk' as const, place: 'industry' as const } };
    const b = { kind: 'set' as const, set: { ...a.set, becomes: { state: 'night' as const, on: 'x' } } };
    expect(sameSet(a, b)).toBe(true);
    expect(sameSet(a, { kind: 'set', set: { ...a.set, place: 'port' } })).toBe(false);
  });

  it('lets a shot name its actor’s parts, and keeps a change of light on words inside its shot', () => {
    const narration = BEATS.map((b) => b.text).join(' ');
    const plan: ShotPlan = {
      shots: [
        {
          on: 'After the 1945 strikes,',
          set: { kind: 'set', set: { land: 'plain', time: 'dusk', place: 'display', becomes: { state: 'night', on: 'colonial Nigeria begun' } } },
          actors: [{ id: 'engine', kit: 'machine.turbofan', place: 'centre' }],
          info: [{ recipe: 'label', target: 'actor:engine.combustor', on: 'colonial Nigeria' }],
          life: [],
          camera: [],
          join: 'cut',
          focal: 'actor:engine',
        },
      ],
    };
    const labelled: ShotPlan = { shots: [{ ...plan.shots[0], info: [{ ...plan.shots[0].info[0], text: 'Combustor' }] }] };
    const problems = checkPlan(labelled, narration, registry, { kit: ['machine.turbofan'] });
    expect(problems.filter((p) => p.code === 'unknown-target' || p.code === 'wrong-target')).toEqual([]);
    const mended = mendPlan(plan, narration, registry, { kit: ['machine.turbofan'] });
    const set = mended.shots[0].set;
    expect(set.kind === 'set' && set.set.becomes?.on).toBe('colonial Nigeria');
    expect(mended.shots[0].info[0]).toMatchObject({ target: 'actor:engine.combustor', text: 'Combustor' });
  });
});
