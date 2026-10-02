import type { ShotAssetDto, ShotSetDto } from '../../../contracts';
import { drawSet, setSettingsOf } from '../kit/sets';
import { PALETTE, MAP, REGISTRY } from './__fixtures__/regional-turn';
import { buildShots, shotLook, type BuildContext } from './shot-build';
import { registryOf } from './shot-registry';
import {
  LIFE_AMOUNT,
  LIFE_MOST,
  lifeDefaults,
  lottieAssets,
  shotLife,
  type LifeInput,
} from './shot-life';
import type { PlanSetScene, PlanShot, ShotPlan } from './types';

const look = shotLook({ palette: PALETTE, held: 'chart5', theme: 'paper' });

/** A drawn set as kit/sets draws it, with the shot that shows it. */
function setInput(
  scene: PlanSetScene,
  more: Partial<LifeInput> = {},
): LifeInput {
  const made = drawSet(setSettingsOf(scene, null), look, {
    shape: 'wide',
    seed: 7,
  });
  const set: ShotSetDto = { kind: 'set', asset: 'set-1' };
  return {
    planned: [],
    set,
    plan: { kind: 'set', set: scene },
    asset: made.asset,
    actors: [],
    assets: { 'set-1': made.asset },
    look,
    seed: 'scene-1',
    ...more,
  };
}

describe('the life a set has by itself', () => {
  it('a works town at night: its stacks smoke and its lit windows waver', () => {
    const life = lifeDefaults(
      setInput({
        land: 'plain',
        time: 'night',
        town: 'town',
        place: 'industry',
      }),
    );
    expect(life).toEqual(expect.arrayContaining(['smoke', 'flicker', 'grain']));
    expect(life).not.toContain('shimmer');
  });

  it('a town by day has no wavering lights, until the shot turns it to dusk', () => {
    const scene: PlanSetScene = {
      land: 'plain',
      time: 'day',
      town: 'town',
      place: 'city',
    };
    expect(lifeDefaults(setInput(scene))).not.toContain('flicker');
    expect(lifeDefaults(setInput(scene, { becomes: 'lights-on' }))).toContain(
      'flicker',
    );
  });

  it('a coast in the rain: rain falls nearer than the set’s own, and light plays on the water', () => {
    const life = lifeDefaults(
      setInput({
        land: 'coast',
        time: 'day',
        weather: 'rain',
        town: 'village',
        place: 'port',
      }),
    );
    expect(life).toEqual(expect.arrayContaining(['rain', 'shimmer', 'grain']));
  });

  it('snow, and wind only in a storm', () => {
    expect(
      lifeDefaults(setInput({ land: 'hills', time: 'day', weather: 'snow' })),
    ).toContain('snow');
    expect(
      lifeDefaults(setInput({ land: 'hills', time: 'day', weather: 'clear' })),
    ).not.toContain('wind');
    expect(
      lifeDefaults(
        setInput({
          land: 'coast',
          time: 'dusk',
          weather: 'storm',
          place: 'port',
        }),
      ),
    ).toEqual(expect.arrayContaining(['rain', 'wind']));
  });

  it('a ceremony ground flies a flag', () => {
    expect(
      lifeDefaults(
        setInput({ land: 'plain', time: 'day', place: 'ceremony-ground' }),
      ),
    ).toContain('flags');
  });

  it('the map’s clouds pass; a chart, a portrait or plain paper has only its grain', () => {
    const base = setInput({ land: 'plain', time: 'day' });
    expect(
      lifeDefaults({
        ...base,
        set: {
          kind: 'map',
          asset: 'map',
          style: 'atlas',
          tilt: 50,
          bearing: 0,
          terrain: true,
        },
        asset: null,
        plan: { kind: 'map' },
      }),
    ).toEqual(['cloud-shadows', 'grain']);
    expect(
      lifeDefaults({
        ...base,
        set: { kind: 'chart', asset: 'chart-1' },
        asset: null,
        plan: undefined,
      }),
    ).toEqual(['grain']);
    expect(
      lifeDefaults({
        ...base,
        set: { kind: 'plain' },
        asset: null,
        plan: undefined,
      }),
    ).toEqual(['grain']);
  });

  it('no grain where the look has none', () => {
    expect(
      lifeDefaults({
        ...setInput({ land: 'plain', time: 'day' }),
        look: { ...look, grain: 0 },
      }),
    ).not.toContain('grain');
  });

  it('a piece’s own chimney smokes, on any set', () => {
    const train: ShotAssetDto = {
      kind: 'svg',
      svg: '<svg/>',
      box: [0, 0, 100, 40],
      parts: { body: { box: [0, 0, 100, 40] }, smoke: { box: [80, -2, 2, 2] } },
    };
    const input = {
      ...setInput({ land: 'plain', time: 'day' }),
      actors: [{ id: 'train', asset: 'actor-1' }],
    };
    input.assets = { ...input.assets, 'actor-1': train };
    expect(lifeDefaults(input)).toContain('smoke');
  });
});

describe('a shot’s life', () => {
  it('puts what the board named first, then the set’s own, once each, never more than the most', () => {
    const input = setInput(
      {
        land: 'coast',
        time: 'night',
        weather: 'storm',
        town: 'town',
        place: 'port',
      },
      { planned: ['dust', 'rain'] },
    );
    const life = shotLife(input);
    expect(life[0].effect).toBe('dust');
    expect(life[1].effect).toBe('rain');
    expect(new Set(life.map((l) => l.effect)).size).toBe(life.length);
    expect(life.length).toBeLessThanOrEqual(LIFE_MOST);
    for (const one of life)
      expect(one.amount).toBe(
        one.effect === 'grain' ? look.grain : LIFE_AMOUNT,
      );
  });

  it('seeds each effect by its set, so it runs on unbroken through the set’s shots, and differently on another set', () => {
    const a = shotLife(
      setInput({
        land: 'plain',
        time: 'night',
        town: 'town',
        place: 'industry',
      }),
    );
    const again = shotLife(
      setInput({
        land: 'plain',
        time: 'night',
        town: 'town',
        place: 'industry',
      }),
    );
    expect(again).toEqual(a);
    const other = shotLife({
      ...setInput({
        land: 'plain',
        time: 'night',
        town: 'town',
        place: 'industry',
      }),
      set: { kind: 'set', asset: 'set-2' },
    });
    expect(other.find((l) => l.effect === 'smoke')!.seed).not.toBe(
      a.find((l) => l.effect === 'smoke')!.seed,
    );
  });

  it('leaves a fire, sparks or a splash out with a note while the effects have no file for it, never a stand-in', () => {
    const notes: string[] = [];
    const life = shotLife(
      setInput(
        { land: 'plain', time: 'night' },
        { planned: ['fire'], focal: { kind: 'box', box: [0, 0, 10, 10] } },
      ),
      notes,
      'shot 2',
    );
    expect(life.map((l) => l.effect)).not.toContain('fire');
    expect(notes.join('\n')).toContain('shot 2: no fire effect to draw yet');
    expect(lottieAssets(life)).toEqual({});
  });

  it('never carries the map’s eyes, which the build adds itself', () => {
    expect(
      shotLife(
        setInput({ land: 'plain', time: 'day' }, { planned: ['eyes'] }),
      ).map((l) => l.effect),
    ).not.toContain('eyes');
  });
});

describe('the build gives every shot its set’s life', () => {
  const ctx: BuildContext = {
    shape: 'wide',
    palette: PALETTE,
    held: 'chart5',
    theme: 'paper',
    map: MAP,
    seed: 'scene-1',
  };
  const shot = (on: string, more: Partial<PlanShot>): PlanShot => ({
    on,
    set: { kind: 'plain' },
    actors: [],
    info: [],
    life: [],
    camera: [],
    join: 'continue',
    ...more,
  });
  const plan: ShotPlan = {
    shots: [
      shot('After the 1945 strikes,', {
        set: {
          kind: 'set',
          set: {
            land: 'plain',
            time: 'dusk',
            town: 'town',
            place: 'industry',
            era: '1900-1945',
          },
        },
      }),
      shot('Then the fight changed:', {
        set: {
          kind: 'set',
          set: {
            land: 'plain',
            time: 'dusk',
            town: 'town',
            place: 'industry',
            era: '1900-1945',
          },
        },
      }),
      shot('Why did self-government', { set: { kind: 'map' }, join: 'cut' }),
    ],
  };
  const built = buildShots(plan, registryOf(REGISTRY), ctx);

  it('a works town at dusk smokes and its windows waver; the map’s clouds pass', () => {
    expect(built.shots[0].life.map((l) => l.effect)).toEqual(
      expect.arrayContaining(['smoke', 'flicker', 'grain']),
    );
    expect(built.shots[2].life.map((l) => l.effect)).toEqual(
      expect.arrayContaining(['cloud-shadows', 'grain']),
    );
  });

  it('one set’s shots share their life’s seeds', () => {
    const seeds = (i: number) =>
      Object.fromEntries(built.shots[i].life.map((l) => [l.effect, l.seed]));
    expect(seeds(1)).toEqual(seeds(0));
  });
});
