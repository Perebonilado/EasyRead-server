/**
 * A film's score as its story gives it (S10): the genre and tone, each
 * scene's beats and their tension, the hero and a foil, and the lines
 * whose aim lands a moment.
 */
import { scoreOf } from './studio-score';
import type { SceneSheet, SheetBeat } from './studio';
import type { StudioStory } from './studio-story';

const line = (
  who: string,
  to: string,
  say: string,
  aim?: SheetBeat['aim'],
): SheetBeat => ({
  kind: 'line',
  who,
  to,
  say,
  feeling: null,
  sign: null,
  do: null,
  prop: null,
  spot: null,
  from: 'here',
  pace: null,
  seconds: null,
  ...(aim ? { aim } : {}),
});

const sheet = (beats: SheetBeat[]): SceneSheet =>
  ({ kind: 'story', title: 'A scene', beats }) as unknown as SceneSheet;

const beat = (role: string, intensity: number) => ({
  role,
  what: '',
  wants: '',
  stops: '',
  changes: '',
  intensity,
  plants: [],
  pays: [],
  link: null,
});

const story = {
  premise: { genre: 'comedy', hero: 'ria' },
  beats: {
    template: 'medium',
    beats: [
      beat('setup', 2),
      beat('inciting', 4),
      beat('attempt', 6),
      beat('low', 3),
      beat('climax', 9),
      beat('button', 2),
    ],
  },
  plan: {
    scenes: [{ beats: [0, 1] }, { beats: [2, 3] }, { beats: [4, 5] }],
  },
} as unknown as StudioStory;

const cast = [
  { id: 'ria', role: 'main' },
  { id: 'leo', role: 'main' },
  { id: 'rose', role: 'supporting' },
];

describe('the score a film is played from', () => {
  const scenes = [
    { position: 0, sheet: sheet([line('ria', 'leo', 'Watch this.', 'asks')]) },
    {
      position: 1,
      sheet: sheet([
        line('leo', 'ria', 'You broke it again!', 'accuses'),
        line('leo', 'ria', 'Bet you cannot fix it.', 'teases'),
        line('rose', 'ria', 'Tea is ready.', 'asks'),
      ]),
    },
    {
      position: 2,
      sheet: sheet([
        line('rose', 'leo', 'Knock knock. A soggy scientist!', 'jokes'),
      ]),
    },
  ];
  const score = scoreOf({
    brief: { genre: undefined, tone: 'funny', audience: 'children' },
    story,
    cast,
    scenes,
  });

  it("takes the story's genre, the tone, and who it is for", () => {
    expect(score.genre).toBe('comedy');
    expect(score.tone).toBe('funny');
    expect(score.young).toBe(true);
  });

  it("gives each scene its beats' roles and planned tension, in order", () => {
    expect(score.scenes.map((s) => s.beats)).toEqual([
      [
        { role: 'setup', intensity: 2 },
        { role: 'inciting', intensity: 4 },
      ],
      [
        { role: 'attempt', intensity: 6 },
        { role: 'low', intensity: 3 },
      ],
      [
        { role: 'climax', intensity: 9 },
        { role: 'button', intensity: 2 },
      ],
    ]);
  });

  it('names the hero, and as the foil whoever speaks against them most', () => {
    expect(score.hero).toBe('ria');
    expect(score.foil).toBe('leo');
  });

  it('keeps the lines that land a moment, by their aim', () => {
    expect(score.scenes.map((s) => s.lines.map((l) => l.aim))).toEqual([
      [],
      ['accuses', 'teases'],
      ['jokes'],
    ]);
  });

  it("is the same every time, and follows the film's own scenes", () => {
    expect(
      scoreOf({
        brief: { genre: undefined, tone: 'funny', audience: 'children' },
        story,
        cast,
        scenes,
      }),
    ).toEqual(score);
    // A scene left out of the film (not yet made) leaves no gap.
    const two = scoreOf({
      brief: { genre: 'drama', tone: null, audience: 'adults' },
      story: null,
      cast,
      scenes: [scenes[0], scenes[2]],
    });
    expect(two.genre).toBe('drama');
    expect(two.young).toBe(false);
    expect(two.hero).toBe('ria');
    expect(two.scenes).toHaveLength(2);
    expect(two.scenes[1].lines[0].aim).toBe('jokes');
  });
});
