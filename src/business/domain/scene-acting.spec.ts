import type { SceneStepDto } from '../../contracts';
import { actingOf, mouthOf, shapesOf, type SpokenLine } from './scene-acting';

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

  it('has the listeners look at whoever speaks, and the speaker at whom they answer', () => {
    // Ada speaks: the others look at her; she looks at her neighbour.
    expect(lookAt(acting.kofi.look, 2600)).toBe('ada');
    expect(lookAt(acting.nana.look, 2600)).toBe('ada');
    expect(lookAt(acting.ada.look, 2600)).toBe('kofi');
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

  it('acts the same in every make', () => {
    const again = actingOf({
      actors: ['ada', 'kofi', 'nana'],
      names: new Map(),
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
