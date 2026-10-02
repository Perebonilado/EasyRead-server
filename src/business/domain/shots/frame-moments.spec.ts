import type { SceneDto, ShotDto } from '../../../contracts';
import {
  CLOSE_OUT_MS,
  GRID_MS,
  clipAt,
  inFade,
  momentsOf,
  videoMsOf,
  type FilmTimeline,
} from './frame-moments';

/** A scene with a voice of the given sentences, [start, end] each. */
const scene = (
  beats: [number, number][],
  shots?: [number, number][],
): SceneDto =>
  ({
    beats: beats.map(([startMs, endMs]) => ({
      text: 'words',
      startMs,
      endMs,
      words: [],
    })),
    durationMs: beats[beats.length - 1][1],
    ...(shots
      ? {
          engine: 'shots',
          shots: {
            version: 1,
            shots: shots.map(
              ([startMs, endMs], k) =>
                ({ id: `s${k}`, startMs, endMs }) as ShotDto,
            ),
          },
        }
      : {}),
  }) as unknown as SceneDto;

/**
 * Two scenes: the first from the video's 1.5 s (after the title), its
 * in point 1.4 s before its voice; the second dissolving in over 0.9 s
 * before the first has gone.
 */
const TIMELINE: FilmTimeline = {
  titleMs: 1500,
  filmMs: 23_000,
  endMs: 3900,
  durationMs: 28_400,
  clips: [
    {
      sceneId: 'a',
      title: 'The intake',
      startsAtMs: 1500,
      inMs: -1400,
      outMs: 10_000,
      durationMs: 9000,
      join: 'cut',
    },
    {
      sceneId: 'b',
      title: 'The fan',
      startsAtMs: 12_000,
      inMs: -1300,
      outMs: 11_200,
      durationMs: 10_000,
      join: 'dissolve',
    },
  ],
};
const SCENES = [
  scene([
    [0, 4000],
    [4200, 9000],
  ]),
  scene(
    [
      [0, 5000],
      [5200, 10_000],
    ],
    [
      [0, 6000],
      [6000, 10_000],
    ],
  ),
];

describe('a scene on the video’s clock', () => {
  it('finds a moment of a scene in the video, and the video’s moment back in its scene', () => {
    const at = videoMsOf(TIMELINE.clips[0], 2000);
    expect(at).toBe(1500 + 1400 + 2000);
    expect(clipAt(TIMELINE, at, SCENES)).toEqual({
      clip: 0,
      sceneMs: 2000,
      join: false,
    });
    expect(
      clipAt(TIMELINE, videoMsOf(TIMELINE.clips[1], 3000), SCENES),
    ).toEqual({ clip: 1, sceneMs: 3000, join: false });
  });

  it('gives a moment where two scenes share the frame to the one whose voice speaks', () => {
    // The first's tail (its voice done at 9 s) under the second's head.
    const shared = videoMsOf(TIMELINE.clips[1], -500);
    const found = clipAt(TIMELINE, shared, SCENES);
    expect(found?.join).toBe(true);
    // Neither speaks there: the nearer to its own middle.
    expect(found?.clip).toBe(1);
    expect(
      clipAt(TIMELINE, videoMsOf(TIMELINE.clips[0], 8900), SCENES),
    ).toEqual({ clip: 0, sceneMs: 8900, join: false });
  });

  it('has no scene on the title or the end card', () => {
    expect(clipAt(TIMELINE, 1000, SCENES)).toBeNull();
    expect(clipAt(TIMELINE, 27_000, SCENES)).toBeNull();
  });
});

describe('the moments a film’s stills are taken at', () => {
  it('takes every beat’s middle, every shot’s start, middle and end, and the grid, in the order they play', () => {
    const moments = momentsOf(TIMELINE, SCENES);
    const beats = moments.filter((m) => m.why === 'beat');
    expect(beats.map((m) => [m.clip, m.sceneMs])).toEqual([
      [0, 2000],
      [0, 6600],
      [1, 2500],
      [1, 7600],
    ]);
    const shots = moments.filter((m) => m.why === 'shot');
    expect(shots.map((m) => m.sceneMs)).toEqual([0, 3000, 5999, 8000, 9999]);
    expect(moments.filter((m) => m.why === 'grid').length).toBeGreaterThan(5);
    for (let k = 1; k < moments.length; k += 1) {
      expect(moments[k].videoMs).toBeGreaterThan(moments[k - 1].videoMs);
      expect(
        moments[k].videoMs - moments[k - 1].videoMs,
      ).toBeGreaterThanOrEqual(120);
    }
  });

  it('keeps a beat’s moment over a shot’s or the grid’s at the same time', () => {
    // The beat's middle (2.6 s) plays at 5.5 s: on the grid.
    const moments = momentsOf(TIMELINE, [scene([[0, 5200]])], 'all', GRID_MS);
    const mid = videoMsOf(TIMELINE.clips[0], 2600);
    expect((mid - TIMELINE.titleMs) % GRID_MS).toBe(0);
    const near = moments.filter((m) => Math.abs(m.videoMs - mid) < 120);
    expect(near).toHaveLength(1);
    expect(near[0].why).toBe('beat');
  });

  it('takes only what is asked for', () => {
    expect(
      momentsOf(TIMELINE, SCENES, 'beat').every((m) => m.why === 'beat'),
    ).toBe(true);
    expect(momentsOf(TIMELINE, SCENES, 'shot').map((m) => m.clip)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    const grid = momentsOf(TIMELINE, SCENES, '2s');
    expect(
      grid.every(
        (m) =>
          m.why === 'grid' && (m.videoMs - TIMELINE.titleMs) % GRID_MS === 0,
      ),
    ).toBe(true);
    // None while the title is still going: the first is the grid's second.
    expect(grid[0].videoMs).toBe(TIMELINE.titleMs + GRID_MS);
    // Nothing on the title, nor past the film.
    expect(
      grid.every(
        (m) =>
          m.videoMs >= TIMELINE.titleMs &&
          m.videoMs < TIMELINE.titleMs + TIMELINE.filmMs,
      ),
    ).toBe(true);
  });

  it('takes nothing while the film goes down to black at its end or through a dip', () => {
    const end = TIMELINE.titleMs + TIMELINE.filmMs;
    expect(inFade(TIMELINE, end - 600)).toBe(true);
    expect(inFade(TIMELINE, end - CLOSE_OUT_MS - 10)).toBe(false);
    expect(
      momentsOf(TIMELINE, SCENES).every((m) => !inFade(TIMELINE, m.videoMs)),
    ).toBe(true);
    // The first scene ends at 12.9 s: down over its last 0.7 s, black, up over the next's first 0.8 s.
    const dipped: FilmTimeline = {
      ...TIMELINE,
      clips: [
        TIMELINE.clips[0],
        { ...TIMELINE.clips[1], join: 'dip', startsAtMs: 13_250 },
      ],
    };
    expect(
      [12_000, 12_500, 13_100, 13_900, 14_200].map((ms) => inFade(dipped, ms)),
    ).toEqual([false, true, true, true, false]);
  });

  it('is the same however often it is asked', () => {
    expect(momentsOf(TIMELINE, SCENES)).toEqual(momentsOf(TIMELINE, SCENES));
  });
});
