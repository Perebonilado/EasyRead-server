import type { SceneDto, ShotDto } from '../../../contracts';
import { LOOP } from '../studio/explainer-rules';
import {
  CRITIC_SHEET,
  axesFor,
  criticMoments,
  criticParts,
  critiqueOf,
  failingAxes,
  framesOnlyParts,
  judged,
  momentLabel,
  passes,
  shotAt,
  shotNumbers,
  spokenBetween,
  type Critique,
} from './shot-critic';
import type { ShotPlan } from './types';

/** A made shot, its times given. */
const made = (
  id: string,
  startMs: number,
  endMs: number,
  joinMs = 0,
): ShotDto => ({
  id,
  startMs,
  endMs,
  set: { kind: 'plain' },
  actors: [],
  info: [],
  life: [],
  camera: [],
  join: 'cut',
  joinMs,
});

/** A sentence's words as the voice times them, one every `step` ms from `at`. */
const beat = (text: string, at: number, step = 400) => {
  let char = 0;
  const words = text.split(' ').map((word, k) => {
    const start = text.indexOf(word, char);
    char = start + word.length;
    return [start, char, at + k * step, at + (k + 1) * step - 50];
  });
  return {
    text,
    startMs: at,
    endMs: at + words.length * step,
    words,
  };
};

const scene = (): Pick<SceneDto, 'durationMs' | 'beats' | 'shots'> => ({
  durationMs: 20_000,
  beats: [
    beat('In 1961, Berlin was cut in two overnight.', 0),
    beat('The inner border ran for 1,393 kilometres.', 6_000),
    beat('In 1987, Reagan spoke at the Brandenburg Gate.', 12_000),
  ],
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
    shots: [
      made('s1', 0, 6_000, 300),
      made('s2', 6_000, 12_000),
      made('s4', 12_000, 20_000),
    ],
    sounds: [],
  },
});

const plan: ShotPlan = {
  shots: [
    {
      on: 'In 1961',
      set: { kind: 'map', tilt: 'flat' },
      info: [{ recipe: 'pin', target: 'place:Berlin', on: 'Berlin' }],
      camera: [
        { move: 'push', target: 'place:Berlin', on: 'Berlin', amount: 'small' },
      ],
      actors: [],
      life: ['cloud-shadows'],
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
      info: [
        {
          recipe: 'count',
          target: 'number:Length of the inner border',
          on: '1,393 kilometres',
        },
      ],
      camera: [],
      actors: [],
      life: [],
      join: 'cut',
      focal: 'set',
    },
    {
      on: 'In 1987',
      set: { kind: 'plain' },
      info: [],
      camera: [],
      actors: [],
      life: [],
      join: 'cut',
    },
    {
      on: 'Reagan spoke',
      set: {
        kind: 'chart',
        chart: { kind: 'quote', spec: { text: 'Tear down this wall' } },
      },
      info: [],
      camera: [],
      actors: [],
      life: [],
      join: 'cut',
      focal: 'set',
    },
  ],
};

describe("the critic's answer made sound (critiqueOf)", () => {
  const shots = { shots: [1, 2, 4], opening: false };

  it('reads each score on its axis, 1 to 10, and drops the hook but on the opening scene', () => {
    const out = critiqueOf(
      {
        scores: [
          {
            axis: 'clarity',
            score: 6,
            why: 'the counter shows a number nobody says',
          },
          { axis: 'Readability', score: '9.24', why: 'big words' },
          { axis: 'framing', score: 14, why: 'too generous' },
          { axis: 'motion', score: -3, why: 'nothing moves' },
          { axis: 'hook', score: 7, why: 'slow start' },
          { axis: 'sparkle', score: 9, why: 'not an axis' },
          { axis: 'clarity', score: 2, why: 'said twice: the first is kept' },
        ],
        fixes: [],
        verdict: 'A slideshow with a map.',
      },
      shots,
    );
    expect(out.scores).toEqual({
      clarity: { score: 6, why: 'the counter shows a number nobody says' },
      readability: { score: 9.2, why: 'big words' },
      composition: { score: 10, why: 'too generous' },
      motion: { score: 1, why: 'nothing moves' },
    });
    expect(out.verdict).toBe('A slideshow with a map.');
    const opening = critiqueOf(
      { scores: [{ axis: 'hook', score: 7, why: 'slow' }] },
      { ...shots, opening: true },
    );
    expect(opening.scores.hook).toEqual({ score: 7, why: 'slow' });
  });

  it('reads scores given one field an axis', () => {
    const out = critiqueOf(
      { scores: { clarity: { score: 8, why: 'clear' }, depth: 5 } },
      shots,
    );
    expect(out.scores.clarity?.score).toBe(8);
    expect(out.scores.depth).toEqual({ score: 5, why: '' });
  });

  it('keeps fixes from the closed list, on shots the scene has, one a kind a shot, at most three, worst first', () => {
    const out = critiqueOf(
      {
        fixes: [
          {
            kind: 'change set',
            shot: 2,
            to: 'split chart',
            note: 'show the two sides',
          },
          { kind: 'sparkles', shot: 1, note: 'not a fix' },
          {
            kind: 'zoom',
            shot: 's1',
            target: 'place:Berlin',
            note: 'Berlin is tiny',
          },
          { kind: 'change-set', shot: 2, note: 'the same again' },
          { kind: 'enlarge', shot: 3, note: 'no shot 3 was made' },
          { kind: 'hold', shot: 4, note: '' },
          { kind: 'merge', shot: 1, note: 'one too many' },
        ],
      },
      shots,
    );
    expect(out.fixes).toEqual([
      {
        kind: 'change-set',
        shot: 2,
        to: 'split chart',
        note: 'show the two sides',
      },
      {
        kind: 'enlarge',
        shot: 1,
        target: 'place:Berlin',
        note: 'Berlin is tiny',
      },
      { kind: 'lengthen-hold', shot: 4, note: '' },
    ]);
    expect(out.fixes.length).toBeLessThanOrEqual(LOOP.worst);
  });

  it('makes anything else nothing', () => {
    expect(critiqueOf(null, shots)).toEqual({
      scores: {},
      fixes: [],
      verdict: '',
    });
    expect(critiqueOf({ scores: 'great', fixes: 'none' }, shots)).toEqual({
      scores: {},
      fixes: [],
      verdict: '',
    });
  });
});

describe('whether a scene passes', () => {
  const all = (score: number, opening = false): Critique => ({
    scores: Object.fromEntries(
      axesFor(opening).map((axis) => [axis, { score, why: '' }]),
    ),
    fixes: [],
    verdict: '',
  });

  it('passes when every axis it is scored on is at the pass score or over', () => {
    expect(passes(all(LOOP.passScore), false)).toBe(true);
    expect(passes(all(LOOP.passScore - 0.1), false)).toBe(false);
    expect(failingAxes(all(7.9))).toHaveLength(axesFor(false).length);
  });

  it('is not judged without a score on every axis (the hook only on the opening scene)', () => {
    expect(judged(all(9), false)).toBe(true);
    expect(judged(all(9), true)).toBe(false);
    expect(passes(all(9), true)).toBe(false);
    expect(passes(all(9, true), true)).toBe(true);
    expect(passes({ scores: {}, fixes: [], verdict: '' }, false)).toBe(false);
  });
});

describe('the moments a sheet is taken at', () => {
  it("takes each shot's start (once its join is over), middle and end, and each beat's middle", () => {
    const moments = criticMoments(scene());
    // s1 0–6 s; s2 from 6.3 s (s1's join of 300 ms over); s4 12–20 s.
    expect(moments.filter((m) => m.why === 'start').map((m) => m.ms)).toEqual([
      0, 6300, 12000,
    ]);
    expect(
      moments.every(
        (m, k) => k === 0 || m.ms - moments[k - 1].ms >= CRITIC_SHEET.apartMs,
      ),
    ).toBe(true);
    expect(moments.map((m) => m.shot)).toEqual(
      moments.map((m) => shotAt(scene().shots!.shots, m.ms)),
    );
  });

  it('is the same however often it is asked, and thins a crowded scene to the most a sheet shows', () => {
    expect(criticMoments(scene())).toEqual(criticMoments(scene()));
    const few = criticMoments(scene(), 4);
    expect(few).toHaveLength(4);
    // A shot's start is the last thing to go.
    expect(few.filter((m) => m.why === 'start')).toHaveLength(3);
  });

  it('labels a still with its shot and moment', () => {
    expect(momentLabel({ ms: 12_345, shot: 's3' })).toBe('s3 · 12.3s');
    expect(momentLabel({ ms: 500, shot: null })).toBe('0.5s');
  });
});

describe('what the critic is told', () => {
  it('hears the words the voice says over a stretch', () => {
    expect(spokenBetween(scene(), 6_000, 12_000)).toBe(
      'The inner border ran for 1,393 kilometres.',
    );
    expect(spokenBetween(scene(), 0, 1_000)).toBe('In 1961, Berlin');
  });

  it('names the shots by the numbers the sheet shows', () => {
    expect(shotNumbers(scene())).toEqual([1, 2, 4]);
  });

  it('is given the lines, each made shot with its words and plan, and what code measured', () => {
    const parts = criticParts({
      title: 'The Wall',
      index: 0,
      of: 4,
      episode: 'Berlin',
      rows: [
        {
          say: 'In 1961, Berlin was cut in two overnight.',
          show: 'the city split',
        },
        { say: 'The inner border ran for 1,393 kilometres.', show: '' },
      ],
      scene: scene(),
      plan,
      checks: {
        scores: {
          readability: 9,
          composition: 10,
          pace: 6.1,
          truth: 10,
          overall: 8.8,
          pass: false,
          cardShare: 0,
          personShare: 0,
          focalShare: 0.3,
          focalHeight: 0.6,
          stills: 12,
        },
        problems: [
          {
            code: 'gap-long',
            axis: 'pace',
            ms: 13_000,
            message: '7 s with nothing new',
          },
          {
            code: 'gap-long',
            axis: 'pace',
            ms: 15_000,
            message: '9 s with nothing new',
            severity: 1,
          },
        ],
      },
      look: 'editorial',
      audience: 'adults',
      stills: 12,
    });
    const text = parts.join('\n');
    expect(text).toContain('scene 1 of 4 of "Berlin"');
    expect(text).toContain('It opens the episode: score its hook');
    expect(text).toContain(
      '1. say: In 1961, Berlin was cut in two overnight.\n   show: the city split',
    );
    expect(text).toContain('s2 · 6.0–12.0 s');
    expect(text).toContain(
      'the voice says: "The inner border ran for 1,393 kilometres."',
    );
    expect(text).toContain('set: a counter chart: "km", "inner border"');
    // s4 is the plan's fourth shot (the third was left out when it was made).
    expect(text).toContain('s4 · 12.0–20.0 s');
    expect(text).toContain('set: a quote chart');
    expect(text).toContain('pace 6.1');
    expect(text).toContain('gap-long ×2 (at 13.0, 15.0 s)');
    expect(text).toContain('12 stills');
  });

  it('is told a reference sheet is frames alone, with no fixes to give', () => {
    const text = framesOnlyParts({ stills: 10 }).join('\n');
    expect(text).toContain('10 stills from about 27 seconds');
    expect(text).toContain('Name no fixes');
  });
});
