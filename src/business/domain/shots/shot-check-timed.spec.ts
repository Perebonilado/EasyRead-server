import type { ShotDto, ShotInfoDto } from '../../../contracts';
import { PACE, dwellMs } from '../studio/explainer-rules';
import {
  MEND_DELAY_MS,
  checkTimed,
  mendTimed,
  wordsShown,
} from './shot-check-timed';

const part = (name: string) => ({
  kind: 'asset' as const,
  asset: 'map',
  part: name,
});

const info = (
  id: string,
  more: Partial<ShotInfoDto> & Pick<ShotInfoDto, 'recipe' | 'atMs'>,
): ShotInfoDto => ({
  id,
  durMs: 400,
  target: part(id),
  ...more,
});

const shot = (
  id: string,
  startMs: number,
  endMs: number,
  more: Partial<ShotDto> = {},
): ShotDto => ({
  id,
  startMs,
  endMs,
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

const codes = (shots: ShotDto[], durationMs: number, first = false) =>
  checkTimed(shots, durationMs, { first }).map((p) => p.code);

/** A scene that changes every two seconds, so only what a test adds is wrong. */
const steady = (endMs: number) =>
  Array.from({ length: Math.floor(endMs / 2000) }, (_, k) =>
    info(`beat-${k}`, {
      recipe: 'mark',
      atMs: k * 2000 + 100,
      durMs: 300,
      untilMs: k * 2000 + 600,
    }),
  );

describe('the timed checks', () => {
  it('passes a scene with events well apart, a change every few seconds', () => {
    expect(codes([shot('s1', 0, 8000, { info: steady(8000) })], 8000)).toEqual(
      [],
    );
  });

  it('finds two facts that land too close together, but not a part of one event', () => {
    const crowded = shot('s1', 0, 6000, {
      info: [
        info('a', { recipe: 'pin', atMs: 1000 }),
        info('b', { recipe: 'fill', atMs: 1500 }),
        ...steady(6000).slice(2),
      ],
    });
    expect(codes([crowded], 6000)).toContain('crowded');
    // A pin's label just after it, on the same place, is the same event.
    const labelled = shot('s1', 0, 6000, {
      info: [
        info('a', { recipe: 'pin', atMs: 1000 }),
        info('a', { recipe: 'label', atMs: 1300, durMs: 250, text: 'Kano' }),
        ...steady(6000).slice(2),
      ],
    });
    expect(codes([labelled], 6000)).not.toContain('crowded');
  });

  it('takes the first fact on a set just cut to as part of the cut', () => {
    const shots = [
      shot('s1', 0, 3000, { info: [info('a', { recipe: 'pin', atMs: 500 })] }),
      shot('s2', 3000, 6000, {
        set: { kind: 'chart', asset: 'chart-1' },
        info: [
          info('b', { recipe: 'count', atMs: 3000, durMs: 400, value: 3 }),
        ],
      }),
    ];
    expect(codes(shots, 6000)).not.toContain('crowded');
  });

  it('finds a stillness over six seconds, but not inside a hold or the quiet after a question', () => {
    const still = [
      shot('s1', 0, 9000, { info: [info('a', { recipe: 'pin', atMs: 500 })] }),
    ];
    expect(codes(still, 9000)).toContain('quiet');
    expect(
      checkTimed(still, 9000, { holds: [[900, 9000]] }).map((p) => p.code),
    ).not.toContain('quiet');
    const held = [
      shot('s1', 0, 9000, {
        info: [info('a', { recipe: 'pin', atMs: 500 })],
        camera: [{ move: 'hold', atMs: 1000, durMs: 8000 }],
      }),
    ];
    expect(codes(held, 9000)).not.toContain('quiet');
  });

  it('finds two attention cues at once, and three things moving at once', () => {
    const cues = shot('s1', 0, 6000, {
      info: [
        info('a', { recipe: 'spotlight', atMs: 1000 }),
        info('b', { recipe: 'mark', atMs: 3000 }),
        ...steady(6000).filter((i) => i.atMs > 3500),
      ],
    });
    expect(codes([cues], 6000)).toContain('cues');
    const busy = shot('s1', 0, 6000, {
      info: [
        info('a', { recipe: 'draw', atMs: 1000, durMs: 1000 }),
        info('b', { recipe: 'grow', atMs: 1100, durMs: 1000 }),
        info('c', { recipe: 'flow', atMs: 1200, durMs: 1000 }),
      ],
    });
    expect(codes([busy], 6000)).toContain('moving');
  });

  it('finds text taken down before it can be read', () => {
    const quick = shot('s1', 0, 6000, {
      info: [
        info('a', {
          recipe: 'label',
          atMs: 1000,
          durMs: 250,
          text: 'the federal balance',
          untilMs: 1800,
        }),
        ...steady(6000).slice(1),
      ],
    });
    expect(codes([quick], 6000)).toContain('dwell');
    expect(
      wordsShown({
        id: 'n',
        recipe: 'count',
        atMs: 0,
        durMs: 0,
        value: 3,
        unit: 'deadlines',
      }),
    ).toBe(2);
  });

  it('finds an opening that does not move by a second and a half', () => {
    const late = [
      shot('s1', 0, 6000, { info: [info('a', { recipe: 'pin', atMs: 2400 })] }),
    ];
    expect(codes(late, 6000, true)).toContain('first-change');
    expect(codes(late, 6000, false)).not.toContain('first-change');
  });
});

describe('the timing put right', () => {
  it('spaces crowded events, the later a little later, the earlier a little earlier', () => {
    const shots = [
      shot('s1', 0, 8000, {
        info: [
          info('a', { recipe: 'pin', atMs: 1600 }),
          info('b', { recipe: 'fill', atMs: 2000 }),
        ],
      }),
    ];
    const { shots: mended, mended: notes } = mendTimed(shots, 8000);
    const [a, b] = mended[0].info;
    expect(b.atMs + b.durMs - (a.atMs + a.durMs)).toBeGreaterThanOrEqual(
      PACE.minGapMs,
    );
    expect(b.atMs - 2000).toBeLessThanOrEqual(MEND_DELAY_MS);
    expect(notes.join(' ')).toContain('spaced');
    expect(checkTimed(mended, 8000).map((p) => p.code)).not.toContain(
      'crowded',
    );
  });

  it('fills a still stretch with slow camera moves on the subject, never with words', () => {
    const shots = [
      shot('s1', 0, 16000, {
        focal: part('group-north-region'),
        info: [info('a', { recipe: 'pin', atMs: 500 })],
      }),
    ];
    const { shots: mended } = mendTimed(shots, 16000);
    expect(mended[0].info).toHaveLength(1);
    expect(mended[0].camera.length).toBeGreaterThanOrEqual(2);
    for (const move of mended[0].camera) {
      expect(['push', 'pull']).toContain(move.move);
      expect(move.target).toEqual(part('group-north-region'));
    }
    expect(checkTimed(mended, 16000).map((p) => p.code)).not.toContain('quiet');
  });

  it('lets one cue go as the next comes, and holds back a third mover', () => {
    const shots = [
      shot('s1', 0, 6000, {
        info: [
          info('a', { recipe: 'spotlight', atMs: 1000, durMs: 500 }),
          info('b', { recipe: 'mark', atMs: 3000 }),
          info('c', { recipe: 'draw', atMs: 3600, durMs: 600 }),
          info('d', { recipe: 'grow', atMs: 3700, durMs: 1000 }),
          info('e', { recipe: 'flow', atMs: 3800, durMs: 1000 }),
        ],
      }),
    ];
    const { shots: mended } = mendTimed(shots, 6000);
    const byId = Object.fromEntries(mended[0].info.map((i) => [i.id, i]));
    expect(byId.a.untilMs).toBe(3000);
    const after = checkTimed(mended, 6000).map((p) => p.code);
    expect(after).not.toContain('cues');
    expect(after).not.toContain('moving');
  });

  it('keeps text up long enough to read', () => {
    const shots = [
      shot('s1', 0, 6000, {
        info: [
          info('a', {
            recipe: 'label',
            atMs: 1000,
            durMs: 250,
            text: 'the federal balance',
            untilMs: 1800,
          }),
        ],
      }),
    ];
    const { shots: mended } = mendTimed(shots, 6000);
    const label = mended[0].info[0];
    expect(label.untilMs! - (label.atMs + label.durMs)).toBeGreaterThanOrEqual(
      dwellMs(3),
    );
  });

  it('opens the episode on an establishing move from its first frame', () => {
    const shots = [
      shot('s1', 0, 6000, { info: [info('a', { recipe: 'pin', atMs: 2400 })] }),
    ];
    const { shots: mended } = mendTimed(shots, 6000, { first: true });
    expect(mended[0].camera[0]).toMatchObject({ move: 'establish', atMs: 0 });
    expect(
      checkTimed(mended, 6000, { first: true }).map((p) => p.code),
    ).not.toContain('first-change');
  });

  it('is the same every time and leaves the shots it was given as they were', () => {
    const shots = [
      shot('s1', 0, 16000, {
        info: [
          info('a', { recipe: 'pin', atMs: 1600 }),
          info('b', { recipe: 'fill', atMs: 2000 }),
        ],
      }),
    ];
    const before = JSON.stringify(shots);
    const once = mendTimed(shots, 16000, { first: true });
    expect(mendTimed(shots, 16000, { first: true })).toEqual(once);
    expect(JSON.stringify(shots)).toBe(before);
  });
});
