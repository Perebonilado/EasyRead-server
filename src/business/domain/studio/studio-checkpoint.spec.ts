import { explainerSheetOf, type ExplainerSheet } from './studio';
import {
  COLD_OPEN_MS,
  coldOpen,
  keepCheckpoint,
  pausesFor,
} from './studio-checkpoint';
import { AUDIENCE_BANDS, checksAt, recipeFor } from './studio-audience';

/**
 * Pause-and-think checkpoints and the cold open (studio-explainer-plan,
 * Ask 9, ideas 1 and 13), held to by code: how often the film stops is
 * the audience's, never the writer's, and what is missing only rides
 * along on a send-back.
 */
const sheet = (beats: ExplainerSheet['draft']['beats']): ExplainerSheet =>
  explainerSheetOf({
    kind: 'explainer',
    title: 'Day and night',
    draft: {
      fit: 'good',
      fitReason: null,
      title: 'Day and night',
      mood: 'curious',
      beats,
      cast: [],
      steps: [],
    },
  });

const choices = [
  { text: 'Night', right: true },
  { text: 'Day as well', right: false },
];
const asking = sheet([
  { say: 'The Earth spins.', pause: 'short', delivery: 'key' },
  {
    say: 'What is it on the other side?',
    pause: 'long',
    delivery: 'question',
    choices,
  },
  { say: 'It is night there.', pause: 'long', delivery: 'explain' },
  {
    say: 'And which way does it spin?',
    pause: 'long',
    delivery: 'question',
    choices: [
      { text: 'East', right: true },
      { text: 'West', right: false },
    ],
  },
  { say: 'It spins to the east.', pause: 'long', delivery: 'explain' },
]);

describe('pausesFor', () => {
  it('pauses for children up to about fourteen, and not for grown-ups', () => {
    expect(AUDIENCE_BANDS.filter((band) => pausesFor(band))).toEqual([
      'early-years',
      'primary-lower',
      'primary-upper',
      'secondary-lower',
    ]);
    expect(pausesFor(null)).toBe(false);
  });
});

describe('keepCheckpoint', () => {
  it("keeps a check scene's first answerable question's answers, and no other's", () => {
    const kept = keepCheckpoint(asking, true);
    expect(kept.kept).toBe(1);
    expect(kept.problem).toBeNull();
    expect(kept.sheet.draft.beats.map((b) => Boolean(b.choices))).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('keeps none on a scene that is no check: its questions are said and answered as they are', () => {
    const kept = keepCheckpoint(asking, false);
    expect(kept.kept).toBeNull();
    expect(kept.problem).toBeNull();
    expect(kept.sheet.draft.beats.some((b) => b.choices)).toBe(false);
  });

  it('asks for answers on the send-back of a check scene without any, and leaves a sheet with nothing to change as it is', () => {
    const plain = sheet([
      { say: 'The Earth spins.', pause: 'short', delivery: 'key' },
      {
        say: 'What is it on the other side?',
        pause: 'long',
        delivery: 'question',
      },
      { say: 'It is night there.', pause: 'long', delivery: 'explain' },
    ]);
    const kept = keepCheckpoint(plain, true);
    expect(kept.sheet).toBe(plain);
    expect(kept.problem).toMatchObject({
      rule: 'checkpoint',
      level: 'warning',
    });
  });

  it('is as often as the recipe spaces checks: a check about every minute for young children, none in a short film for grown-ups', () => {
    const scenes = [30, 30, 30, 30].map((seconds) => ({ seconds }));
    expect(checksAt(scenes, recipeFor({ band: 'early-years' }))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(checksAt(scenes, recipeFor({ band: 'university' }))).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });
});

describe('coldOpen', () => {
  const beat = (
    say: string,
    delivery: 'hook' | 'explain' | 'question' = 'explain',
  ) => ({ say, delivery });

  it('takes a question, a surprise or a situation in the opening seconds', () => {
    expect(
      coldOpen([beat('Where does the Sun go at night?', 'hook')], 150),
    ).toBeNull();
    expect(
      coldOpen(
        [beat('Your heart beats about a hundred thousand times every day!')],
        150,
      ),
    ).toBeNull();
    expect(
      coldOpen([beat('Imagine you drop a ball from a tall tower.')], 150),
    ).toBeNull();
    expect(
      coldOpen([beat('You wake up feeling hot and shivery.')], 150),
    ).toBeNull();
  });

  it('sends a definition that opens the film back to open on a hook, riding along', () => {
    const problem = coldOpen(
      [
        beat('Photosynthesis is the process by which green plants make food.'),
        beat('It takes place in the chloroplasts of the leaf cells.'),
        beat('It needs light, water and carbon dioxide from the air.'),
      ],
      150,
    );
    expect(problem).toMatchObject({
      rule: 'cold-open',
      level: 'warning',
      beat: 0,
    });
  });

  it(`looks only at what starts within ${COLD_OPEN_MS / 1000} seconds`, () => {
    const long =
      'Plants make food from light and water and air in their green leaves every single day of the year';
    // Two long sentences at a slow pace take the question past eight seconds.
    expect(
      coldOpen([beat(long), beat(long), beat('Can you guess how?')], 110),
    ).not.toBeNull();
    expect(
      coldOpen([beat('Plants make food.'), beat('Can you guess how?')], 110),
    ).toBeNull();
  });
});
