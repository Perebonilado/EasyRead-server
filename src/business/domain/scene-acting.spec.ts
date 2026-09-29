import type { SceneStepDto } from '../../contracts';
import {
  actingOf,
  mouthOf,
  shapesOf,
  styleOf,
  type SpokenLine,
} from './scene-acting';

/** A line said word by word, 300ms a word. */
const said = (speaker: string, text: string, startMs: number): SpokenLine => {
  const words = text.split(' ').map((word, i) => ({
    text: word,
    startMs: startMs + i * 300,
    endMs: startMs + i * 300 + 260,
  }));
  return {
    speaker,
    startMs,
    endMs: words[words.length - 1].endMs,
    words,
  };
};

const step = (atMs: number, show: string[]): SceneStepDto => ({
  atMs,
  layout: 'row',
  show,
  arrows: [],
  enter: {},
  focus: null,
});

/** Where someone looks at a moment: the last keyframe before it. */
const lookAt = (
  keys: [number, string | null, number][] | undefined,
  t: number,
) => [...(keys ?? [])].reverse().find(([at]) => at <= t)?.[1] ?? null;

describe('the mouth as someone speaks', () => {
  it('reads a word as the shapes of its sounds', () => {
    expect(shapesOf('Mama').map((s) => s.shape)).toEqual([0, 2, 0, 2]);
    expect(shapesOf('food').map((s) => s.shape)).toEqual([5, 4, 1]);
    expect(shapesOf('three').map((s) => s.shape)).toEqual([1, 1, 3]);
    // Vowels hold twice as long as consonants.
    expect(shapesOf('map').map((s) => s.weight)).toEqual([1, 2, 1]);
  });

  it('gives a line thirty shapes a second, shut between words set apart', () => {
    const line: SpokenLine = {
      speaker: 'ada',
      startMs: 1000,
      endMs: 2000,
      words: [
        { text: 'Oh', startMs: 1000, endMs: 1300 },
        // A pause of 300ms.
        { text: 'me', startMs: 1600, endMs: 2000 },
      ],
    };
    const mouth = mouthOf(line);
    expect(mouth).toHaveLength(30);
    expect(mouth).toMatch(/^[0-5]+$/);
    // Round for "Oh", shut in the pause, shut then wide for "me".
    expect(mouth[2]).toBe('4');
    expect(mouth[14]).toBe('0');
    expect(mouth[20]).toBe('0');
    expect(mouth[28]).toBe('3');
  });
});

describe('a page acted from its lines', () => {
  const steps = [step(0, ['ada', 'kofi', 'nana'])];
  const lines = [
    said('ada', 'Tell us a story, Nana.', 2000),
    said('nana', 'Tonight I will tell you about the moon.', 5000),
    said('kofi', 'Is it a long story?', 9000),
  ];
  const acting = actingOf({
    actors: ['ada', 'kofi', 'nana'],
    names: new Map([
      ['ada', ['Ada']],
      ['kofi', ['Kofi']],
      ['nana', ['Nana Efua']],
    ]),
    steps,
    lines,
    narration: [],
    directed: [],
    durationMs: 14_000,
    walks: true,
  });

  it('has the listeners look at whoever speaks, and the speaker at whom they talk to', () => {
    // Ada speaks to Nana, by name: the others look at her; she at Nana.
    expect(lookAt(acting.kofi.look, 2600)).toBe('ada');
    expect(lookAt(acting.nana.look, 2600)).toBe('ada');
    expect(lookAt(acting.ada.look, 2600)).toBe('nana');
    // Nana answers Ada, and looks at her; Ada looks back.
    expect(lookAt(acting.nana.look, 6000)).toBe('ada');
    expect(lookAt(acting.ada.look, 6000)).toBe('nana');
    // Between lines, they look at the viewer.
    expect(lookAt(acting.ada.look, 12_500)).toBeNull();
  });

  it('turns the two in a conversation toward each other, further than the rest', () => {
    const turn = (id: 'ada' | 'kofi' | 'nana', t: number) =>
      [...(acting[id].look ?? [])].reverse().find(([at]) => at <= t)?.[2];
    expect(turn('ada', 6000)).toBe(0.5);
    expect(turn('kofi', 6000)).toBe(0.35);
  });

  it("shapes each speaker's mouth for their own lines only", () => {
    expect(acting.ada.mouth).toEqual([
      [2000, expect.stringMatching(/^[0-5]+$/)],
    ]);
    expect(acting.nana.mouth?.[0][0]).toBe(5000);
    expect(acting.kofi.mouth?.[0][0]).toBe(9000);
  });

  it('moves a speaker as they speak, and a listener as a line ends', () => {
    const moved = (id: 'ada' | 'kofi' | 'nana') =>
      (acting[id].moves ?? []).map(([, what]) => what);
    // A gesture on a line of four words or more, a nod on its stressed word.
    expect(moved('ada')).toContain('gesture');
    expect(moved('ada')).toContain('nod');
    // A question lifts the brows.
    expect(moved('kofi')).toContain('brows');
    // Everyone walks, on a story's page.
    expect(acting.ada.walks).toBe(true);
  });

  it('draws the eyes to a newcomer, and to someone the narration names', () => {
    const later = actingOf({
      actors: ['ada', 'kofi'],
      names: new Map([
        ['ada', ['Ada']],
        ['kofi', ['Kofi']],
      ]),
      steps: [step(0, ['ada']), step(3000, ['ada', 'kofi'])],
      lines: [],
      narration: [{ text: 'Kofi', startMs: 6000, endMs: 6300 }],
      directed: [],
      durationMs: 10_000,
      walks: false,
    });
    expect(lookAt(later.ada.look, 3500)).toBe('kofi');
    expect(lookAt(later.ada.look, 5000)).toBeNull();
    expect(lookAt(later.ada.look, 6500)).toBe('kofi');
    expect(later.ada.walks).toBeUndefined();
  });

  it('plays what the writer asked for: a look, a reach, a hug', () => {
    const asked = actingOf({
      actors: ['ada', 'kofi'],
      names: new Map(),
      steps: [step(0, ['ada', 'kofi'])],
      lines: [],
      narration: [],
      directed: [
        { atMs: 1000, target: 'ada', other: 'kofi', do: 'reach' },
        { atMs: 5000, target: 'kofi', other: 'ada', do: 'hug' },
      ],
      durationMs: 9000,
      walks: true,
    });
    expect(asked.ada.moves).toEqual(
      expect.arrayContaining([
        [1000, 'reach', 1400, 'kofi'],
        [5120, 'hug', 2100, 'kofi'],
      ]),
    );
    expect(asked.kofi.moves).toEqual(
      expect.arrayContaining([[5000, 'hug', 2200, 'ada']]),
    );
    expect(lookAt(asked.ada.look, 1500)).toBe('kofi');
  });

  it('plays what the narration says: a wave, a sob, a look and a point at the sky, and attention', () => {
    const told = actingOf({
      actors: ['ada', 'kofi', 'nana'],
      names: new Map(),
      steps: [step(0, ['ada', 'kofi', 'nana'])],
      lines: [],
      narration: [],
      directed: [
        { atMs: 1000, target: 'ada', other: 'kofi', do: 'wave' },
        { atMs: 3000, target: 'kofi', other: null, do: 'sob' },
        { atMs: 6000, target: 'nana', other: '@up', do: 'look' },
        { atMs: 9000, target: 'ada', other: '@up', do: 'point' },
        { atMs: 12_000, target: 'kofi', other: null, do: 'attend' },
      ],
      durationMs: 16_000,
      walks: true,
    });
    expect(told.ada.moves).toEqual([
      [1000, 'wave', 1900, 'kofi'],
      [9000, 'point-up', 1700],
    ]);
    expect(told.kofi.moves).toEqual([[3000, 'sob', 2600]]);
    // Up at the sky: no one's head, the sky itself.
    expect(lookAt(told.nana.look, 6500)).toBe('@up');
    expect(lookAt(told.ada.look, 9500)).toBe('@up');
    expect(lookAt(told.ada.look, 1500)).toBe('kofi');
    // Everyone else looks at the one the writer drew attention to.
    expect(lookAt(told.ada.look, 12_500)).toBe('kofi');
    expect(lookAt(told.nana.look, 12_500)).toBe('kofi');
  });

  it('acts the same in every make', () => {
    const again = actingOf({
      actors: ['ada', 'kofi', 'nana'],
      names: new Map([
        ['ada', ['Ada']],
        ['kofi', ['Kofi']],
        ['nana', ['Nana Efua']],
      ]),
      steps,
      lines,
      narration: [],
      directed: [],
      durationMs: 14_000,
      walks: true,
    });
    expect(again.ada.moves).toEqual(acting.ada.moves);
    expect(again.kofi.look).toEqual(acting.kofi.look);
  });
});

describe('what someone is like, in how they move', () => {
  it('reads a lively one, a calm one, a shy one and a bold one from their traits', () => {
    expect(styleOf(['playful', 'impatient'])).toEqual({
      energy: 1.25,
      size: 1,
    });
    expect(styleOf(['wise', 'storyteller'])).toEqual({ energy: 0.8, size: 1 });
    expect(styleOf(['shy'])).toEqual({ energy: 0.85, size: 0.75 });
    expect(styleOf(['brave'])).toEqual({ energy: 1, size: 1.2 });
    expect(styleOf(['kind'])).toEqual({ energy: 1, size: 1 });
  });

  it('gestures on a short line when lively, on every other when calm, and hops or nods when first met', () => {
    const three = (who: string, text: string, at: number) =>
      said(who, text, at);
    const acting = actingOf({
      actors: ['ada', 'nana'],
      names: new Map(),
      steps: [step(0, ['ada', 'nana'])],
      lines: [
        three('ada', 'Tell us more!', 2000),
        three('nana', 'Long ago, the moon lived in a village.', 4000),
        three('nana', 'She lit a lamp for the fishermen every night.', 8000),
      ],
      narration: [],
      directed: [],
      durationMs: 14_000,
      walks: true,
      traits: new Map([
        ['ada', ['playful']],
        ['nana', ['wise', 'shy']],
      ]),
      firsts: new Set(['ada', 'nana']),
    });
    const moved = (id: string) =>
      (acting[id].moves ?? []).map(([at, what]) => `${what}@${at}`);
    // Three words, and lively: a gesture all the same; a hop as she comes on.
    expect(moved('ada')).toEqual(
      expect.arrayContaining(['gesture@2120', 'hop@700']),
    );
    // Calm: a gesture on the first long line, none on the next.
    expect(moved('nana').filter((m) => m.startsWith('gesture'))).toEqual([
      'gesture@4120',
    ]);
    // Shy: smaller moves, and eyes down as she is first met.
    expect(acting.nana.size).toBe(0.75);
    expect(acting.ada.size).toBeUndefined();
    expect(lookAt(acting.nana.look, 1000)).toBe('@down');
  });

  it('turns to whom the screenplay says a line is for', () => {
    const acting = actingOf({
      actors: ['ada', 'kofi', 'nana'],
      names: new Map([
        ['ada', ['Ada']],
        ['kofi', ['Kofi']],
        ['nana', ['Nana Efua']],
      ]),
      steps: [step(0, ['ada', 'kofi', 'nana'])],
      // The line names Nana, but is said to Kofi.
      lines: [
        { ...said('ada', 'Nana says you must come, Kofi.', 2000), to: 'kofi' },
      ],
      narration: [],
      directed: [],
      durationMs: 6000,
      walks: true,
    });
    expect(lookAt(acting.ada.look, 2600)).toBe('kofi');
  });
});

describe('a listener startled, and moves aimed at a side', () => {
  const two = (
    line: SpokenLine,
    directed: Parameters<typeof actingOf>[0]['directed'] = [],
    film = true,
  ) =>
    actingOf({
      actors: ['maya', 'mama'],
      names: new Map([
        ['maya', ['Maya']],
        ['mama', ['Mama']],
      ]),
      steps: [step(0, ['maya', 'mama'])],
      lines: [line],
      narration: [],
      directed,
      durationMs: 8000,
      walks: true,
      film,
    });
  // Leant back, or, at a warning in a film, flinching (scene-performance).
  const leans = (acting: ReturnType<typeof two>) =>
    (acting.mama?.moves ?? []).filter(
      ([, move]) => move === 'lean' || move === 'flinch',
    );

  it('leans back only at a line that startles: shouted, or a cry of alarm, never any "!"', () => {
    expect(
      leans(two(said('maya', 'Ready, Pip? Catch the ball!', 1000))),
    ).toEqual([]);
    expect(
      leans(
        two({ ...said('maya', 'Pip! Come back here!', 1000), pace: 'shout' }),
      ),
    ).toHaveLength(1);
    expect(leans(two(said('maya', 'Look out, the bus!', 1000)))).toHaveLength(
      1,
    );
    expect(leans(two(said('maya', 'Run, Pip, run!', 1000)))).toEqual([]);
  });

  it('leans back at any "!" on a book\'s page, as it always has', () => {
    expect(
      leans(two(said('maya', 'Look what I found!', 1000), [], false)),
    ).toHaveLength(1);
  });

  it('points, leans and looks toward a side of the stage, as long as the list says', () => {
    const acting = two(said('mama', 'Where did she go?', 500), [
      { atMs: 3000, target: 'maya', other: '@left', do: 'point', ms: 1200 },
      { atMs: 5000, target: 'maya', other: '@right', do: 'lean-in', ms: 900 },
    ]);
    expect(acting.maya.moves).toContainEqual([3000, 'point', 1200, '@left']);
    expect(acting.maya.moves).toContainEqual([5000, 'lean-in', 900, '@right']);
    expect(lookAt(acting.maya.look, 3500)).toBe('@left');
  });
});

describe("the body's own moves", () => {
  const acted = (
    directed: Parameters<typeof actingOf>[0]['directed'],
    steps = [step(0, ['maya', 'pip']), step(9000, ['maya'])],
  ) =>
    actingOf({
      actors: ['maya', 'pip'],
      names: new Map([
        ['maya', ['Maya']],
        ['pip', ['Pip']],
      ]),
      steps,
      lines: [],
      narration: [],
      directed,
      durationMs: 12_000,
      walks: true,
    });

  it('plays a lick toward whom it licks, the eyes on them, as long as the list says', () => {
    const acting = acted([
      { atMs: 1000, target: 'pip', other: 'maya', do: 'lick', ms: 900 },
      { atMs: 3000, target: 'pip', other: null, do: 'wag' },
    ]);
    expect(acting.pip.moves).toContainEqual([1000, 'lick', 900, 'maya']);
    expect(lookAt(acting.pip.look, 1400)).toBe('maya');
    // A wag toward no one, as long as a wag takes.
    expect(acting.pip.moves).toContainEqual([3000, 'wag', 1500]);
  });

  it('keeps someone sitting or lying down until they get up, or go', () => {
    const acting = acted([
      { atMs: 500, target: 'maya', other: null, do: 'sit', ms: 1400 },
      { atMs: 4000, target: 'maya', other: null, do: 'nod', ms: 600 },
      { atMs: 6000, target: 'maya', other: null, do: 'stand', ms: 1200 },
      { atMs: 1000, target: 'pip', other: null, do: 'lie', ms: 1600 },
    ]);
    // Held through the nod, until she is up at the end of getting up.
    expect(acting.maya.moves).toContainEqual([500, 'sit', 6700]);
    // Pip lies there until he goes, at 9s.
    expect(acting.pip.moves).toContainEqual([1000, 'lie', 8000]);
  });
});

describe('lines said after someone gone, or off the stage', () => {
  const names = new Map([
    ['maya', ['Maya']],
    ['mama', ['Mama']],
    ['pip', ['Pip']],
    ['tobi', ['Tobi']],
  ]);
  const acted = (lines: SpokenLine[], steps: SceneStepDto[]) =>
    actingOf({
      actors: ['maya', 'mama', 'pip', 'tobi'],
      names,
      steps,
      lines,
      narration: [],
      directed: [],
      durationMs: 20_000,
      walks: true,
      film: true,
    });
  /** Pip goes off by the right at 2 s; Maya and Mama stay. */
  const pipGone = [
    step(0, ['maya', 'pip', 'mama']),
    {
      ...step(2000, ['maya', 'mama']),
      exit: { pip: { side: 'right' as const } },
    },
  ];

  it('calls after someone gone toward the side they went, whoever it is said to', () => {
    const acting = acted(
      [{ ...said('maya', 'Pip! Where are you going?', 4000), to: 'mama' }],
      pipGone,
    );
    expect(lookAt(acting.maya.look, 4500)).toBe('@right');
    expect(acting.maya.moves).toContainEqual(
      expect.arrayContaining(['gesture', '@right']),
    );
  });

  it('says a line to no one toward where someone just went', () => {
    const acting = acted(
      [said('mama', 'Wait for me, please!', 4000)],
      [
        step(0, ['maya', 'mama']),
        {
          ...step(2000, ['mama']),
          exit: { maya: { side: 'left' as const } },
        },
      ],
    );
    expect(lookAt(acting.mama.look, 4500)).toBe('@left');
  });

  it('looks round for someone not here at all', () => {
    const acting = acted(
      [said('maya', 'Pip! Pip! Where are you?', 1000)],
      [step(0, ['maya', 'tobi'])],
    );
    const line = said('maya', 'Pip! Pip! Where are you?', 1000);
    expect(lookAt(acting.maya.look, 1100)).toBe('@left');
    expect(lookAt(acting.maya.look, line.endMs)).toBe('@right');
  });

  it('looks round for someone the scene has no part for', () => {
    const line = said('maya', 'Bingo! Where are you?', 1000);
    const acting = acted([line], [step(0, ['maya', 'tobi'])]);
    expect(lookAt(acting.maya.look, 1100)).toBe('@left');
    expect(lookAt(acting.maya.look, line.endMs)).toBe('@right');
  });

  it('points "that way": where the next one to go goes', () => {
    const acting = acted(
      [
        {
          ...said('tobi', 'Pip was here! He went that way!', 1000),
          to: 'maya',
        },
      ],
      [
        step(0, ['maya', 'tobi']),
        {
          ...step(6000, ['tobi']),
          exit: { maya: { side: 'left' as const } },
        },
      ],
    );
    const point = acting.tobi.moves?.find(([, move]) => move === 'point');
    expect(point?.[3]).toBe('@left');
    // At "that", the fifth word.
    expect(point?.[0]).toBe(1000 + 5 * 300);
  });
});
