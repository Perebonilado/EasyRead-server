/**
 * Story development put right by code where it can be (Richard,
 * 2026-09-30: "Cut the rewrites"): one obstacle, a short want, the hero's
 * id, a link where a beat or a scene had none, a resolution after the
 * climax, the setup's lines said by and to people in scene 1, and the
 * scenes' seconds scaled to the film; and only what breaks the story's
 * structure is worth an answer sent back.
 */
import { bibleOf } from './studio';
import {
  beatsHard,
  firstClause,
  fixBeats,
  fixPlan,
  fixPremise,
  planHard,
  premiseHard,
} from './studio-story-fix';
import {
  checkPremise,
  premiseOf,
  scenePlanOf,
  type BeatSheet,
} from './studio-story';

const bible = bibleOf({
  characters: [
    { name: 'Nadia', voice: 'woman', role: 'main', figure: {} },
    { name: 'Mama Rosa', voice: 'woman', role: 'main', figure: {} },
    { name: 'Raj', voice: 'man', role: 'supporting', figure: {} },
    { name: 'Eve', voice: 'woman', role: 'supporting', figure: {} },
  ],
  sets: [
    { name: 'Launderette', id: 'launderette' },
    { name: 'Bus Stop', id: 'bus-stop' },
  ],
});

describe('the premise, put right by code', () => {
  it('takes the first part of an obstacle that is more than one thing (from the worker log)', () => {
    expect(
      firstClause(
        'A self-locking door, and Sal one floor down with the only spare key, who never opens his door.',
      ),
    ).toBe('A self-locking door');
    expect(
      firstClause(
        'A locked washing machine mid-cycle, and Raj — who holds the only key and wants his last bus.',
      ),
    ).toBe('A locked washing machine mid-cycle');
    expect(
      firstClause(
        'The locked machine; Eve wants clean clothes; Raj wants to lock up.',
      ),
    ).toBe('The locked machine');
  });

  it('so the obstacle check passes, with no call; and names the hero by id', () => {
    const premise = premiseOf({
      hero: 'Mama',
      want: 'her shirt back',
      obstacle:
        'The locked machine; Eve wants clean clothes; Raj wants to lock up.',
    });
    const before = checkPremise(premise, bible);
    expect(before.some((p) => /is more than one thing/.test(p))).toBe(true);
    const { value, fixed } = fixPremise(premise, bible);
    expect(value.obstacle).toBe('The locked machine');
    expect(value.hero).toBe('mama-rosa');
    expect(fixed).toHaveLength(2);
    const after = checkPremise(value, bible);
    expect(after.some((p) => /is more than one thing/.test(p))).toBe(false);
    expect(after.some((p) => /^hero "/.test(p))).toBe(false);
  });

  it('sends back only for no hero, no want, or nothing in the way', () => {
    const empty = premiseOf({ hero: 'nobody-here' });
    const hard = premiseHard(checkPremise(empty, bible));
    expect(hard.map((p) => p.slice(0, 16))).toEqual([
      'hero "nobody-her',
      'Say the want: a ',
      'Say the obstacle',
    ]);
    // A missing hook, stock spine, a comedy with no running gag: noted only.
    expect(
      premiseHard([
        'Say the hook: what grabs us in the first ten seconds.',
        'A comedy has a running gag: say it.',
      ]),
    ).toEqual([]);
  });
});

describe('the beats, put right by code', () => {
  const beat = (role: string, link: string | null = 'therefore') => ({
    role,
    what: role,
    wants: '',
    stops: '',
    changes: '',
    intensity: 5,
    plants: [],
    pays: [],
    link,
  });
  it('links a beat with none, and makes the beat after the climax its resolution', () => {
    const sheet = {
      template: 'medium',
      beats: [
        beat('setup', null),
        beat('inciting', null),
        beat('attempt', 'but'),
        beat('turn'),
        beat('climax'),
        beat('button'),
      ],
    } as unknown as BeatSheet;
    const { value, fixed } = fixBeats(sheet);
    expect(value.beats[1].link).toBe('therefore');
    expect(value.beats[5].role).toBe('resolution');
    expect(fixed).toEqual([
      'beat 2 follows "therefore"',
      'beat 6, after the climax, is its resolution',
    ]);
  });

  it('sends back only for too few beats, or a missing problem, climax or ending', () => {
    const sheet = { template: 'medium', beats: [] } as unknown as BeatSheet;
    expect(
      beatsHard(sheet, [
        'A film this long has 6 to 9 beats (…); this has 0.',
        "Give it a climax, decided by the hero's own choice.",
        'The tension is flat (5 5 5): start lower.',
        'The running gag ("no refunds") shows in only one beat: bring it back.',
      ]),
    ).toEqual([
      'A film this long has 6 to 9 beats (…); this has 0.',
      "Give it a climax, decided by the hero's own choice.",
    ]);
  });
});

describe('the scene plan, put right by code', () => {
  const plan = scenePlanOf({
    scenes: [
      {
        title: 'Locked In',
        summary: 'Raj locks the machine.',
        set: 'launderette',
        cast: ['Nadia', 'Raj', 'Stranger'],
        seconds: 12,
        setup: [
          { part: 'want', how: 'line', by: '', to: '', what: 'My shirt!' },
          { part: 'clock', how: 'narration', what: 'The last bus is at 12.' },
        ],
      },
      {
        title: 'The Bus',
        summary: 'Nadia runs for the bus.',
        set: 'bus-stop',
        cast: ['nadia', 'raj'],
        seconds: 90,
      },
      {
        title: 'Home',
        summary: 'Nadia gets home.',
        set: 'launderette',
        cast: ['nadia', 'eve'],
        seconds: 90,
      },
    ],
  });

  it('keeps the show’s cast, links scenes, and gives the setup people in scene 1', () => {
    const { value, fixed } = fixPlan(plan, bible, {
      hero: 'nadia',
      minutes: 2,
    });
    const [first, second] = value.scenes;
    expect(first.cast).toEqual(['nadia', 'raj']);
    expect(second.link).toBe('therefore');
    expect(first.setup[0]).toMatchObject({
      how: 'line',
      by: 'nadia',
      to: 'raj',
    });
    expect(first.setup[1]).toMatchObject({ how: 'action', by: 'nadia' });
    expect(fixed.join(' ')).toMatch(/without Stranger/);
  });

  it("scales the scenes' seconds to the film's length, joins counted", () => {
    const { value } = fixPlan(plan, bible, { hero: 'nadia', minutes: 2 });
    const total = value.scenes.reduce((n, s) => n + s.seconds, 0);
    expect(total).toBeLessThan(130);
    expect(total).toBeGreaterThan(90);
    expect(value.scenes[0].seconds).toBeGreaterThanOrEqual(20);
  });

  it('sends back only for what breaks the structure', () => {
    expect(
      planHard([
        'Scene 2 is set in "moon", none of the show\'s places (launderette).',
        'Eve is in no scene: give them a part, or leave them out of the show.',
        'Scene 1: name the moment people will remember.',
        "Scene 1's oddity is a line: say who says it (by) and to whom (to), both in the scene.",
      ]),
    ).toEqual([
      'Scene 2 is set in "moon", none of the show\'s places (launderette).',
      'Eve is in no scene: give them a part, or leave them out of the show.',
    ]);
  });
});
