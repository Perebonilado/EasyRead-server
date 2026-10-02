import type { ShotDto } from '../../../contracts';
import { SNAP_WITHIN_MS, snapToBeat, soundsOf } from './shot-sound';

const box = {
  kind: 'box' as const,
  box: [0, 0, 10, 10] as [number, number, number, number],
};

const shot = (more: Partial<ShotDto>): ShotDto => ({
  id: 's1',
  startMs: 0,
  endMs: 10000,
  set: {
    kind: 'map',
    asset: 'map',
    style: 'atlas',
    tilt: 0,
    bearing: 0,
    terrain: false,
  },
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  joinMs: 0,
  ...more,
});

describe('a beat for a cue', () => {
  it('lands on the nearest beat within reach, and stays put otherwise', () => {
    expect(snapToBeat(1000, [940, 1100, 2000])).toBe(940);
    expect(snapToBeat(1000, [1090, 1200])).toBe(1090);
    expect(snapToBeat(1000, [1000 + SNAP_WITHIN_MS + 1])).toBe(1000);
    expect(snapToBeat(1000, [])).toBe(1000);
    expect(snapToBeat(1000, [880], 200)).toBe(880);
  });
});

describe('the sounds of a scene’s motion', () => {
  const shots: ShotDto[] = [
    shot({
      info: [
        { id: 'pin', recipe: 'pin', target: box, atMs: 1000, durMs: 350 },
        {
          id: 'label',
          recipe: 'label',
          target: box,
          atMs: 1400,
          durMs: 250,
          text: 'Kano',
        },
        { id: 'stamp', recipe: 'stamp', target: box, atMs: 3000, durMs: 400 },
        { id: 'draw', recipe: 'draw', target: box, atMs: 4000, durMs: 600 },
        {
          id: 'count',
          recipe: 'count',
          target: box,
          atMs: 5000,
          durMs: 1500,
          value: 3,
        },
        { id: 'morph', recipe: 'morph', target: box, atMs: 7000, durMs: 1000 },
        { id: 'flow', recipe: 'flow', target: box, atMs: 8200, durMs: 2500 },
        { id: 'ask', recipe: 'ask', atMs: 9300, durMs: 600 },
      ],
      camera: [
        { move: 'establish', atMs: 0, durMs: 1200 },
        { move: 'travel', atMs: 2000, durMs: 900, target: box },
        { move: 'push', atMs: 6000, durMs: 2500, amount: 0.05 },
        { move: 'push', atMs: 6600, durMs: 800, amount: 0.12, target: box },
      ],
    }),
    shot({
      id: 's2',
      startMs: 10000,
      endMs: 14000,
      set: { kind: 'document', asset: 'picture-1' },
      camera: [{ move: 'zoom-through', atMs: 12000, durMs: 1200, target: box }],
    }),
  ];
  const sounds = soundsOf(shots);

  it('gives each heard event its one sound: a tick as a pin lands, a thump as a stamp does, the rest as they start', () => {
    expect(sounds.map((s) => [s.atMs, s.sound])).toEqual([
      [1350, 'tick'],
      [2000, 'air'],
      [3400, 'thump'],
      [4000, 'pencil'],
      [5000, 'ticks'],
      [6600, 'air'],
      [7000, 'whoosh'],
      [8200, 'swell'],
      [9300, 'rise'],
      [10000, 'paper'],
      [12000, 'air'],
    ]);
  });

  it('keeps every gain between 0.3 and 0.8, and is silent for a label, an establish and a drift', () => {
    for (const s of sounds) {
      expect(s.gain).toBeGreaterThanOrEqual(0.3);
      expect(s.gain).toBeLessThanOrEqual(0.8);
    }
    expect(sounds.find((s) => s.atMs === 1400)).toBeUndefined();
    expect(sounds.find((s) => s.atMs === 6000)).toBeUndefined();
  });

  it('lands cues on the score’s beats where one is near, and hears one sound once at a moment', () => {
    const snapped = soundsOf(shots, [1300, 5050]);
    expect(snapped[0]).toMatchObject({ atMs: 1300, sound: 'tick' });
    expect(snapped.find((s) => s.sound === 'ticks')?.atMs).toBe(5050);
    const twice = soundsOf([
      shot({
        info: [
          { id: 'a', recipe: 'pin', target: box, atMs: 1000, durMs: 350 },
          { id: 'b', recipe: 'pin', target: box, atMs: 1040, durMs: 350 },
        ],
      }),
    ]);
    expect(twice).toHaveLength(1);
  });

  it('opens a document with paper only when it is a new set, not one carried on', () => {
    const carried = soundsOf([
      shot({ set: { kind: 'document', asset: 'p' } }),
      shot({ id: 's2', startMs: 10000, set: { kind: 'document', asset: 'p' } }),
    ]);
    expect(carried.filter((s) => s.sound === 'paper')).toHaveLength(1);
  });
});
