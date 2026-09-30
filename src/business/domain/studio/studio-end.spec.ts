import { explainerSheetOf, outlineOf, type ExplainerSheet } from './studio';
import {
  RECAP_CARDS,
  nextQuestionsOf,
  recapCards,
  teachBackAsk,
  teachBackOf,
  teachBackPoints,
} from './studio-end';

/**
 * How an explainer ends (studio-explainer-plan, Ask 9, ideas 3 and 5):
 * the recap cards built by code, "What next?" held to two or three short
 * questions, and "Now you explain it" given only what it needs and
 * trusted only for points it was given.
 */
type Beat = ExplainerSheet['draft']['beats'][number];
const lesson = (
  title: string,
  beats: [string, Beat['delivery']][],
  keywords: string[] = [],
): { sheet: ExplainerSheet } => ({
  sheet: explainerSheetOf({
    kind: 'explainer',
    title,
    draft: {
      fit: 'good',
      fitReason: null,
      title,
      mood: 'curious',
      beats: beats.map(([say, delivery]) => ({
        say,
        delivery,
        pause: 'short',
      })),
      cast: keywords.map((name, i) => ({
        id: `k${i}`,
        kind: 'words',
        name,
        style: 'keyword',
      })),
      steps: [],
    },
  }),
});

const film = [
  lesson(
    'Where does the Sun go?',
    [
      ['Have you ever wondered where the Sun goes at night?', 'hook'],
      ['It is our Earth that spins.', 'key'],
    ],
    ['The Earth spins'],
  ),
  lesson(
    'The other side',
    [
      ['The side of the Earth facing the Sun has day.', 'key'],
      ['The side facing away from the Sun has night.', 'key'],
    ],
    ['Day side', 'Night side'],
  ),
  lesson(
    'Around the world',
    [
      ['Half of the Earth always has day, and half has night.', 'key'],
      [
        'So remember: the Earth spins, and that gives us day and night.',
        'recap',
      ],
    ],
    ['Half day, half night'],
  ),
];

describe('recapCards', () => {
  it("spreads three cards over the film's key sentences, each under the fullest term it names", () => {
    const cards = recapCards(film, ['Earth', 'Sun']);
    expect(cards).toHaveLength(RECAP_CARDS);
    expect(cards.map((c) => c.title)).toEqual([
      'The Earth spins',
      'Night side',
      'Half day, half night',
    ]);
    expect(cards[0].text).toBe('It is our Earth that spins.');
  });

  it('fills a film with few key sentences from the terms it taught, then its recap, never one term twice', () => {
    const cards = recapCards(
      [
        lesson(
          'Fever',
          [
            ['A thermometer measures how warm you are.', 'explain'],
            ['A fever is a temperature of 38 degrees or more.', 'key'],
            ['So rest, drink water, and tell a grown-up.', 'recap'],
          ],
          ['Thermometer', 'Fever'],
        ),
      ],
      [],
    );
    // The recap sentence names no term, and its scene's title is taken: two cards, not a third on "Fever".
    expect(cards.map((c) => c.title)).toEqual(['Fever', 'Thermometer']);
    expect(cards[1].text).toBe('A thermometer measures how warm you are.');
  });

  it('has none for a film with nothing said', () => {
    expect(recapCards([], [])).toEqual([]);
  });
});

describe('nextQuestionsOf', () => {
  it('keeps two or three short, distinct questions, each ending in a question mark', () => {
    expect(
      nextQuestionsOf(
        [
          '1. Why is it hot in summer',
          'Why is it hot in summer?',
          'Why does the Moon change shape?',
          'x'.repeat(120),
          'What if the Earth stopped spinning?',
          'One too many?',
        ],
        'Day and night',
      ),
    ).toEqual([
      'Why is it hot in summer?',
      'Why does the Moon change shape?',
      'What if the Earth stopped spinning?',
    ]);
  });

  it('keeps none for fewer than two, or none said', () => {
    expect(nextQuestionsOf(['Why?'])).toEqual([]);
    expect(nextQuestionsOf(undefined)).toEqual([]);
  });

  it('is read with the outline, and absent for a story', () => {
    expect(
      outlineOf({ title: 'A', scenes: [], next: ['Why a?', 'Why b?'] }).next,
    ).toEqual(['Why a?', 'Why b?']);
    expect(
      outlineOf({ title: 'A', scenes: [], next: [] }).next,
    ).toBeUndefined();
  });
});

describe('teach-back', () => {
  const outline = outlineOf({
    title: 'Day and night',
    scenes: [
      {
        title: 'One',
        summary: 'a',
        teach: 't',
        points: ['The Earth spins', 'The Sun stays put'],
      },
      {
        title: 'Clip',
        summary: 'b',
        kind: 'clip',
        seconds: 12,
        points: ['not a point'],
      },
      {
        title: 'Two',
        summary: 'c',
        teach: 't',
        points: ['The Earth spins', 'Half day, half night'],
      },
    ],
  });

  it("checks against the lesson scenes' points, each once", () => {
    expect(teachBackPoints(outline.scenes)).toEqual([
      'The Earth spins',
      'The Sun stays put',
      'Half day, half night',
    ]);
  });

  it('asks only for words of a sentence or so, cut to 800 characters, said for whom', () => {
    expect(teachBackAsk(outline, 'the earth', 'primary-upper')).toBeNull();
    expect(teachBackAsk(null, 'The Earth spins round', null)).toBeNull();
    const ask = teachBackAsk(
      outline,
      `The Earth spins round ${'a '.repeat(600)}`,
      'primary-upper',
    );
    expect(ask?.answer.length).toBeLessThanOrEqual(800);
    expect(ask?.who).toBe('Kids (8–11)');
    expect(ask?.points).toHaveLength(3);
  });

  it('trusts only the points it gave, by number, and says something kind when the reply is empty', () => {
    const points = [
      'The Earth spins',
      'The Sun stays put',
      'Half day, half night',
    ];
    expect(
      teachBackOf(
        {
          got: [1, 1, 9],
          missing: [1, 2, 'x'],
          reply: 'Nice! Can you add the Sun?',
        },
        points,
      ),
    ).toEqual({
      got: ['The Earth spins'],
      missing: ['The Sun stays put'],
      reply: 'Nice! Can you add the Sun?',
    });
    expect(teachBackOf({ got: [], missing: [3] }, points).reply).toMatch(
      /good start/i,
    );
  });
});
