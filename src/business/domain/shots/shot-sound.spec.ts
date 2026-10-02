import type { ShotDto, ShotInfoDto } from '../../../contracts';
import {
  DENSITY,
  LABEL_APART_MS,
  REVEAL_MS,
  SHOT_SOUNDS,
  SNAP_MS,
  SWELL_CREST,
  joinsOf,
  soundsOf,
} from './shot-sound';

const box = {
  kind: 'box' as const,
  box: [0, 0, 10, 10] as [number, number, number, number],
};

const map = {
  kind: 'map' as const,
  asset: 'map',
  style: 'atlas' as const,
  tilt: 0,
  bearing: 0,
  terrain: false,
};

const shot = (more: Partial<ShotDto>): ShotDto => ({
  id: 's1',
  startMs: 0,
  endMs: 20000,
  set: map,
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  joinMs: 0,
  ...more,
});

const item = (
  id: string,
  recipe: ShotInfoDto['recipe'],
  atMs: number,
  durMs: number,
  more: Partial<ShotInfoDto> = {},
): ShotInfoDto => ({ id, recipe, target: box, atMs, durMs, ...more });

describe('the sounds of a scene’s motion', () => {
  const shots: ShotDto[] = [
    shot({
      info: [
        item('pin', 'pin', 1000, 350),
        item('stamp', 'stamp', 3000, 400),
        item('draw', 'draw', 4500, 600),
        item('count', 'count', 6000, 1500, { value: 3 }),
        item('morph', 'morph', 8500, 1000),
        item('flow', 'flow', 10500, 2500),
        item('fill', 'fill', 14000, 600),
        item('ask', 'ask', 15500, 600),
        item('label', 'label', 17600, 250, { text: 'Kano' }),
      ],
      camera: [
        { move: 'establish', atMs: 0, durMs: 1200 },
        { move: 'travel', atMs: 2000, durMs: 700, target: box },
        { move: 'push', atMs: 12000, durMs: 2500, amount: 0.05 },
        { move: 'pull', atMs: 19000, durMs: 800, amount: 0.12 },
      ],
    }),
    shot({
      id: 's2',
      startMs: 20000,
      endMs: 26000,
      set: { kind: 'document', asset: 'picture-1' },
      camera: [{ move: 'zoom-through', atMs: 23000, durMs: 1200, target: box }],
    }),
  ];
  const sounds = soundsOf(shots);

  it('gives each heard event its one sound: a pop as a pin lands, a thump as a stamp does, the lasting ones over their motion', () => {
    expect(sounds.map((s) => [s.atMs, s.sound, s.durMs ?? null])).toEqual([
      [1350, 'pop', null],
      [2000, 'air', 700],
      [3400, 'thump', null],
      [4500, 'pencil', 600],
      [6000, 'ticks', 1500],
      [8500, 'whoosh', 1000],
      [10500, 'swell', 2500],
      [15500, 'rise', null],
      [17850, 'tick', null],
      [19000, 'air', 800],
      [20000, 'paper', null],
      [23000, 'whoosh', 1200],
    ]);
  });

  it('is silent for a fill, an establish and a slow drift, and says what makes each sound', () => {
    expect(sounds.find((s) => s.of === 'fill')).toBeUndefined();
    expect(sounds.find((s) => s.of === 's1:camera:0')).toBeUndefined();
    expect(sounds.find((s) => s.of === 's1:camera:2')).toBeUndefined();
    expect(sounds.find((s) => s.sound === 'ticks')?.of).toBe('count');
    expect(sounds.find((s) => s.sound === 'paper')?.of).toBe('s2:set');
  });

  it('keeps every gain between a quarter and the library’s level, and every sound one the library makes', () => {
    for (const s of sounds) {
      expect(s.gain).toBeGreaterThanOrEqual(0.25);
      expect(s.gain).toBeLessThanOrEqual(1);
      expect(SHOT_SOUNDS).toContain(s.sound);
    }
  });

  it('lets a landing move only a little onto the beat, a soft sound further, and nothing move that is pinned to a cut', () => {
    const of = (sound: string) => sounds.find((s) => s.sound === sound)!;
    expect(of('pop').snapMs).toBe(SNAP_MS.landing);
    expect(of('thump').snapMs).toBe(SNAP_MS.landing);
    expect(of('ticks').snapMs).toBe(SNAP_MS.landing);
    expect(of('pencil').snapMs).toBe(SNAP_MS.soft);
    expect(of('swell').snapMs).toBe(SNAP_MS.soft);
    expect(of('air').snapMs).toBe(SNAP_MS.soft);
    expect(sounds.some((s) => s.downbeat)).toBe(false);
  });

  it('is the same for the same shots', () => {
    expect(soundsOf(shots)).toEqual(sounds);
  });

  it('hears one sound once at a moment', () => {
    const twice = soundsOf([
      shot({
        info: [item('a', 'pin', 1000, 350), item('b', 'pin', 1040, 350)],
      }),
    ]);
    expect(twice).toHaveLength(1);
  });

  it('ticks a label only when it is the first in a while', () => {
    const labels = soundsOf([
      shot({
        info: [
          item('l1', 'label', 1000, 250),
          item('l2', 'label', 2000, 250),
          item('l3', 'label', 3000, 250),
          item('l4', 'label', 1000 + LABEL_APART_MS + 100, 250),
        ],
      }),
    ]);
    expect(labels.map((s) => s.of)).toEqual(['l1', 'l4']);
  });

  it('starts no more than two cues in any second, keeping the most important', () => {
    const crowded = soundsOf([
      shot({
        info: [
          item('seam', 'seam', 1000, 900),
          item('label', 'label', 1100, 250),
          item('stamp', 'stamp', 1000, 400),
          item('enter', 'enter', 1200, 500),
          item('count', 'count', 1500, 1500, { value: 9 }),
        ],
      }),
    ]);
    expect(crowded.map((s) => s.of)).toEqual(['stamp', 'count']);
    for (const s of crowded)
      expect(
        crowded.filter(
          (t) => t.atMs >= s.atMs && t.atMs < s.atMs + DENSITY.windowMs,
        ).length,
      ).toBeLessThanOrEqual(DENSITY.count);
  });

  it('leaves a question’s quiet quiet: only its rise is heard in it', () => {
    const asked = soundsOf([
      shot({
        info: [
          item('ask', 'ask', 2000, 1500),
          item('pin', 'pin', 2400, 350),
          item('later', 'pin', 4000, 350),
        ],
      }),
    ]);
    expect(asked.map((s) => s.of)).toEqual(['ask', 'later']);
  });

  it('opens a document with paper only when it is a new set, not one carried on', () => {
    const carried = soundsOf([
      shot({ set: { kind: 'document', asset: 'p' } }),
      shot({
        id: 's2',
        startMs: 20000,
        endMs: 30000,
        set: { kind: 'document', asset: 'p' },
      }),
    ]);
    expect(carried.filter((s) => s.sound === 'paper')).toHaveLength(1);
  });

  it('swells into the payoff, the first use of the held colour, cresting on it and rather on a bar’s first beat', () => {
    const payoff = soundsOf([
      shot({
        info: [
          item('first', 'fill', 4000, 600, { colour: 'held' }),
          item('again', 'fill', 9000, 600, { colour: 'held' }),
        ],
      }),
    ]);
    expect(payoff).toHaveLength(1);
    const [swell] = payoff;
    expect(swell).toMatchObject({
      sound: 'swell',
      of: 'first:reveal',
      durMs: REVEAL_MS,
      snapMs: SNAP_MS.reveal,
      downbeat: true,
    });
    expect(swell.atMs + SWELL_CREST * REVEAL_MS).toBeCloseTo(4600, -1);
  });

  it('whooshes a dive through and a push between shots, loudest on the cut, and keeps it pinned there', () => {
    const joined = soundsOf([
      shot({ endMs: 6000, join: 'zoom-through', joinMs: 1200 }),
      shot({
        id: 's2',
        startMs: 6000,
        endMs: 12000,
        set: { kind: 'chart', asset: 'c1' },
        join: 'push',
        joinMs: 500,
      }),
      shot({
        id: 's3',
        startMs: 12000,
        endMs: 18000,
        set: { kind: 'chart', asset: 'c2' },
        join: 'dissolve',
        joinMs: 600,
      }),
      shot({
        id: 's4',
        startMs: 18000,
        endMs: 24000,
        set: { kind: 'chart', asset: 'c3' },
      }),
    ]);
    expect(joined.map((s) => [s.of, s.atMs, s.durMs, s.snapMs])).toEqual([
      ['s1:join', 5400, 1200, undefined],
      ['s2:join', 11750, 500, undefined],
    ]);
  });
});

describe('the hand-overs between shots, as the stage makes them', () => {
  it('runs shots carried on over one set together, cuts at each next run, and gives no join more than either run has', () => {
    const joins = joinsOf([
      shot({ endMs: 4000, join: 'continue' }),
      shot({
        id: 's2',
        startMs: 4000,
        endMs: 5000,
        join: 'zoom-through',
        joinMs: 1200,
      }),
      shot({
        id: 's3',
        startMs: 5000,
        endMs: 5600,
        set: { kind: 'chart', asset: 'c' },
        join: 'continue',
      }),
      shot({ id: 's4', startMs: 5600, endMs: 9000, set: { kind: 'plain' } }),
    ]);
    expect(joins.map((j) => [j.shot.id, j.kind, j.cutMs, j.halfMs])).toEqual([
      // s1 and s2 are one run on the map; the dive takes no more than the 600 ms run after it.
      ['s2', 'zoom-through', 5000, 300],
      // A continue onto another set is a cut.
      ['s3', 'cut', 5600, 0],
    ]);
  });
});
