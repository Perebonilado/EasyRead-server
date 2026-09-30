/**
 * The craft notes code puts right itself, so a scene is not sent back for
 * them (Richard, 2026-09-30: "Cut the rewrites"): the hero named in scene
 * 1, a line said to someone, an aim from its words, a scene that runs
 * long trimmed; and what still sends a scene back, at most once.
 */
import {
  bibleOf,
  outlineOf,
  secondsOf,
  storySheetOf,
  type StorySheet,
} from './studio';
import type { SheetProblem } from './studio-check';
import {
  craftChecklist,
  fixCraft,
  hardFailures,
  linesToSomeone,
  missingCast,
  nameTheHero,
  plannedHandOff,
  trimToLength,
  withName,
} from './studio-craft-fix';
import type { StudioStory } from './studio-story';

const bible = bibleOf({
  characters: [
    { name: 'Nadia', voice: 'woman', role: 'main', figure: { age: 'adult' } },
    { name: 'Raj', voice: 'man', role: 'supporting', figure: { age: 'adult' } },
    { name: 'Eve', voice: 'woman', role: 'supporting', figure: {} },
    { name: 'Cat', voice: 'girl', role: 'minor', figure: {} },
  ],
  sets: [
    { name: 'Launderette', id: 'launderette' },
    { name: 'Bus Stop', id: 'bus-stop' },
  ],
});
const story = {
  premise: { hero: 'nadia', want: 'her shirt back', obstacle: 'a lock' },
  plan: {
    scenes: [
      {
        title: 'Locked In',
        setup: [
          {
            part: 'want',
            how: 'line',
            by: 'raj',
            to: 'nadia',
            what: 'Your shirt stays in till morning.',
          },
        ],
        turn: 'Raj pockets the key and heads for his bus.',
        link: null,
      },
      {
        title: 'The Bus',
        setup: [],
        turn: 'Nadia makes the bus wait.',
        link: 'but',
      },
    ],
  },
} as unknown as StudioStory;
const outline = {
  ...outlineOf({
    title: 'The Last Pound',
    logline: 'Nadia must get her shirt back before the last bus.',
    scenes: [
      {
        title: 'Locked In',
        summary: 'Raj locks the machine with her shirt in it.',
        set: 'launderette',
        cast: ['nadia', 'raj'],
        seconds: 20,
      },
      {
        title: 'The Bus',
        summary: 'Nadia chases Raj to the bus stop.',
        set: 'bus-stop',
        cast: ['nadia', 'raj', 'eve'],
        seconds: 20,
      },
    ],
  }),
  story,
};

const line = (who: string, to: string | null, say: string, aim?: string) => ({
  kind: 'line',
  who,
  to,
  say,
  feeling: 'neutral',
  from: 'here',
  ...(aim ? { aim } : {}),
});
const act = (who: string, what: string, say: string) => ({
  kind: 'action',
  who,
  do: what,
  say,
});
const sheetOf = (beats: unknown[], cast = ['nadia', 'raj']): StorySheet =>
  storySheetOf({
    title: 'Locked In',
    set: 'launderette',
    onStage: cast.map((who, k) => ({
      who,
      spot: k ? 'right' : 'left',
      pose: 'standing',
    })),
    props: [],
    beats,
    camera: [],
  });

describe('the hero named in scene 1, by code', () => {
  it('says their name in the first line said to them, after its first words', () => {
    const sheet = sheetOf([
      act('raj', 'look', 'Raj looks at the clock.'),
      line('raj', 'nadia', 'Closing time. Out you go!', 'orders'),
      line('nadia', 'raj', 'My shirt is in there!', 'pleads'),
    ]);
    const { sheet: named, fixed } = nameTheHero(sheet, story, bible);
    expect(named.beats[1].say).toBe('Closing time, Nadia. Out you go!');
    expect(fixed[0]).toMatch(/^beat 2: Nadia called by name/);
    // Nothing else is touched.
    expect(named.beats[2]).toEqual(sheet.beats[2]);
  });

  it('leaves a scene alone where someone already says it', () => {
    const sheet = sheetOf([
      line('raj', 'nadia', 'Nadia, we are closed.', 'orders'),
    ]);
    expect(nameTheHero(sheet, story, bible).sheet).toBe(sheet);
  });

  it('takes a line said to no one while the hero is there, and says it to them', () => {
    const sheet = sheetOf([
      line('nadia', 'raj', 'Please open it.', 'pleads'),
      line('raj', null, 'Rules are rules', 'refuses'),
    ]);
    const named = nameTheHero(sheet, story, bible).sheet;
    expect(named.beats[1].say).toBe('Rules are rules, Nadia');
    expect(named.beats[1].to).toBe('nadia');
  });

  it('puts a name before a line cut off mid-word', () => {
    expect(withName('I only wanted to—', 'Nadia')).toBe(
      'Nadia, I only wanted to—',
    );
    expect(withName('Stop! Give it back.', 'Nadia')).toBe(
      'Stop, Nadia! Give it back.',
    );
  });
});

describe('lines said to someone, and their aims, by code', () => {
  it('says a line to the only other one there, or to whoever spoke last', () => {
    const sheet = sheetOf(
      [
        line('raj', 'nadia', 'We are shut.', 'refuses'),
        line('nadia', null, 'Not yet you are not.'),
        act('eve', 'enter', 'Eve comes in.'),
        line('eve', null, 'What did I miss?'),
      ],
      ['nadia', 'raj'],
    );
    const { sheet: out } = linesToSomeone(sheet);
    expect(out.beats[1].to).toBe('raj');
    // Two others there: whoever spoke last of them.
    expect(out.beats[3].to).toBe('nadia');
  });

  it('gives a line with no aim the one its words carry, and leaves one they carry none of', () => {
    const sheet = sheetOf([
      line('raj', 'nadia', 'Where is the key?'),
      line('nadia', 'raj', 'The key stays with me.'),
    ]);
    const { sheet: out, fixed } = fixCraft(sheet, bible, outline, 1);
    expect(out.beats[0].aim).toBe('asks');
    expect(fixed.some((f) => /beat 1: aim "asks"/.test(f))).toBe(true);
  });
});

describe('a scene that runs long, trimmed by code', () => {
  const long = sheetOf([
    line('raj', 'nadia', 'Closing time, Nadia.', 'orders'),
    act('raj', 'look', 'Raj looks at the clock.'),
    act('raj', 'point', 'Raj points at the door.'),
    act('nadia', 'shrug', 'Nadia shrugs.'),
    act('nadia', 'walk', 'Nadia walks to the machine.'),
    act('nadia', 'look', 'Nadia looks at the machine.'),
    act('raj', 'nod', 'Raj nods.'),
    line('nadia', 'raj', 'Okay!', 'teases'),
    line('nadia', 'raj', 'My shirt is in there, and my interview is at nine.'),
    { kind: 'pause', seconds: 3 },
    line('raj', 'nadia', 'Then you had better be up early.', 'teases'),
  ]);

  it('cuts the small moves first, keeping every going and every line it can', () => {
    const planned = 10;
    expect(secondsOf(long)).toBeGreaterThan(planned * 1.15);
    const { sheet, fixed } = trimToLength(long, planned);
    expect(secondsOf(sheet)).toBeLessThan(secondsOf(long));
    // The walk changes where she is: it stays.
    expect(sheet.beats.some((b) => b.do === 'walk')).toBe(true);
    expect(sheet.beats.some((b) => b.do === 'shrug')).toBe(false);
    expect(fixed[0]).toMatch(/^trimmed from about \d+ to \d+ seconds/);
  });

  it('never trims a scene within its time, and never below two lines', () => {
    expect(trimToLength(long, 60).sheet).toBe(long);
    const { sheet } = trimToLength(long, 1);
    expect(sheet.beats.filter((b) => b.kind === 'line').length).toBe(3);
  });

  it('keeps scene 1 its lines: the setup is there', () => {
    const { sheet } = trimToLength(long, 1, { first: true });
    expect(sheet.beats.filter((b) => b.kind === 'line')).toHaveLength(4);
  });

  it('moves the camera with the beats it was on', () => {
    const shot = {
      ...long,
      camera: [{ beat: 8, shot: 'close', on: 'nadia' }],
    } as unknown as StorySheet;
    const { sheet } = trimToLength(shot, 10);
    expect(sheet.beats.length).toBeLessThan(long.beats.length);
    expect(sheet.beats[sheet.camera[0].beat].say).toBe(
      'My shirt is in there, and my interview is at nine.',
    );
  });
});

describe('what still sends a scene back, once', () => {
  const problem = (over: Partial<SheetProblem>): SheetProblem => ({
    rule: 'length',
    message: 'm',
    beat: null,
    level: 'warning',
    ...over,
  });

  it('is only what the stage cannot play, the plan cast left out, and lines a change lost', () => {
    const narrated = problem({ rule: 'narrator', level: 'error' });
    const kept = problem({ rule: 'kept' });
    const quiet = problem({ rule: 'quiet' });
    const length = problem({ rule: 'length' });
    const missing = problem({ rule: 'cast' });
    expect(hardFailures([narrated, kept, quiet, length], [missing])).toEqual([
      narrated,
      kept,
      missing,
    ]);
    expect(hardFailures([quiet, length])).toEqual([]);
  });

  it('finds someone the plan puts in the scene who never comes in; never a minor part', () => {
    const sheet = sheetOf([line('raj', 'nadia', 'Shut.', 'refuses')]);
    const missing = missingCast(
      sheet,
      { cast: ['nadia', 'raj', 'eve', 'cat'] },
      bible,
    );
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toMatch(/^Eve is in this scene's plan/);
    expect(missing[0].level).toBe('warning');
  });
});

describe("the writer's first ask", () => {
  it('says the length as a word budget, and in scene 1 the hero named and the setup by its time', () => {
    const list = craftChecklist({
      brief: { minutes: 2 },
      bible,
      outline,
      k: 0,
      narrator: { mode: 'none', character: null },
      by: { want: 25 },
    });
    expect(list).toMatch(/at most 48 words/);
    expect(list).toMatch(/Someone calls Nadia by name/);
    expect(list).toMatch(
      /By 25 seconds in, what the hero wants: a line from Raj to Nadia/,
    );
    expect(list).toMatch(/No narration beats at all/);
  });

  it('tells a scene written beside the one before how that one is planned to end', () => {
    expect(plannedHandOff(outline, 0, bible)).toBeNull();
    const told = plannedHandOff(outline, 1, bible)!;
    expect(told).toMatch(/^The scene before \(scene 1, "Locked In"\)/);
    expect(told).toMatch(
      /in Launderette \(launderette\) with Nadia \(nadia\), Raj \(raj\)/,
    );
    expect(told).toMatch(/It ends: Raj pockets the key/);
  });
});
