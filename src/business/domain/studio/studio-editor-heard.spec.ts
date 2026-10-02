import { planOf, researchOf } from './studio-editor';
import { angleHeard, makeHeard, plannedHeard } from './studio-editor-heard';

const angles = [
  { question: 'How did ten days vanish from the calendar overnight?' },
  { question: 'Why do some years skip their leap day?' },
  { question: 'What would happen without leap years?' },
  { question: 'Who first counted the year?' },
];

describe('the angle the maker picks, in their words', () => {
  it.each([
    ['The second one', 1],
    ['first', 0],
    ['Number three please', 2],
    ['3', 2],
    ['option 2', 1],
    ['Why do some years skip their leap day', 1],
    ['the one about ten days vanishing overnight', 0],
  ])('hears "%s" as %s', (words, k) => {
    expect(angleHeard(words, angles)).toBe(k);
  });

  it.each(['You choose', 'up to you', 'Surprise me', 'either is fine'])(
    'hears "%s" as left to the Studio',
    (words) => {
      expect(angleHeard(words, angles)).toBeNull();
    },
  );

  it.each(['the fourth', 'Who first counted the year?', 'make it funnier', ''])(
    'hears nothing of the angles in "%s"',
    (words) => {
      expect(angleHeard(words, angles)).toBeUndefined();
    },
  );
});

describe("a planned episode, in the maker's words", () => {
  const plan = planOf(
    {
      episodes: [
        {
          title: 'The lost days',
          question: 'Where did ten days go?',
          episodeId: 'e1',
        },
        {
          title: 'The rule of 400',
          question: 'Why skip a leap year every century?',
        },
        {
          title: 'Calendars elsewhere',
          question: 'How do other calendars cope?',
        },
      ],
    },
    researchOf({}),
  );

  it.each([
    ['The rule of 400', 'The rule of 400'],
    ['Episode 3: How do other calendars cope?', 'Calendars elsewhere'],
    ['why skip a leap year every century', 'The rule of 400'],
    ['Make the next one', 'The rule of 400'],
    ['next episode', 'The rule of 400'],
  ])('hears "%s" as "%s"', (words, title) => {
    expect(plannedHeard(words, plan)?.title).toBe(title);
  });

  it('never names an episode begun already, nor something else', () => {
    expect(plannedHeard('The lost days', plan)).toBeNull();
    expect(plannedHeard('Something else', plan)).toBeNull();
    expect(plannedHeard('do one on moon calendars', plan)).toBeNull();
  });
});

describe('"Make it"', () => {
  it.each([
    'Make it',
    'make it now',
    'Yes, make it!',
    'Go ahead',
    "let's make it",
    'Make the film please',
  ])('is heard in "%s"', (words) => {
    expect(makeHeard(words)).toBe(true);
  });

  it.each(['make it shorter', 'Read the script', 'can you make it funnier?'])(
    'is not heard in "%s"',
    (words) => {
      expect(makeHeard(words)).toBe(false);
    },
  );
});
