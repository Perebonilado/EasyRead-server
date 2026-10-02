import type { SceneEffectDto, SceneStepDto } from '../../contracts';
import {
  INFOGRAPHIC_FILL,
  LESSON_FILL,
  composeScene,
  fillQuiet,
  holdSpans,
  thingDto,
} from './scene-compose';
import { phraseSaidAt, stateCues, wordOf } from './scene-infographic-cues';
import { readStrike } from './scene-strike';
import { readCalendar } from './scene-calendar';
import { readTransfer } from './scene-transfer';
import type { InfographicThing, SceneScript } from './scene-script';
import type { GatedDrawing } from './scene-svg';
import type { TimedBeat } from './scene-timing';

const timedBeat = (
  text: string,
  startMs: number,
  perWord = 400,
): TimedBeat => ({
  text,
  startMs,
  endMs: startMs + text.split(' ').length * perWord,
  words: [...text.matchAll(/\S+/g)].map((m, i) => [
    m.index,
    m.index + m[0].length,
    startMs + i * perWord,
    startMs + i * perWord + 350,
  ]),
});

const strike: InfographicThing = {
  id: 'question',
  kind: 'strike',
  name: '',
  strike: readStrike({ from: 'IF', to: 'HOW', label: null })!,
};

describe('the later looks of an infographic: their cues', () => {
  it('cues each state by its own words, numbers, or a stop', () => {
    expect(stateCues(strike)).toEqual([
      { state: 'replaced', words: [['how']], numbers: [], unsaid: true },
    ]);
    const calendar: InfographicThing = {
      id: 'c',
      kind: 'calendar',
      name: '',
      calendar: readCalendar({
        calendars: [
          { label: 'West', dates: ['1957', '1 October 1960'] },
          { label: 'North', dates: ['1959'] },
        ],
        merge: '1 October 1960',
      })!,
    };
    expect(stateCues(calendar).map((c) => [c.state, c.numbers])).toEqual([
      ['page 2', [1, 1960]],
      ['merge', [1, 1960]],
    ]);
    const flow: InfographicThing = {
      id: 'f',
      kind: 'transfer',
      name: '',
      transfer: readTransfer(
        { from: 'A', to: 'B', token: null, label: null, shut: true },
        'x',
      )!,
    };
    expect(stateCues(flow)[0]).toMatchObject({ state: 'shut', unsaid: false });
  });

  it('finds when the voice says a phrase, word after word', () => {
    const said = 'The question was not if but how'
      .split(' ')
      .map((word, i) => ({ word: wordOf(word), at: i * 300 }));
    expect(phraseSaidAt(said, [['how']], 0, 5000)).toBe(1800);
    expect(phraseSaidAt(said, [['not', 'if']], 0, 5000)).toBe(900);
    expect(phraseSaidAt(said, [['why']], 0, 5000)).toBeNull();
    expect(phraseSaidAt(said, [['how']], 1800, 5000)).toBeNull();
  });
});

describe('an infographic composed', () => {
  const beats = [
    timedBeat('The plan had always asked one small word.', 0),
    timedBeat('Not whether it would happen, but how it would happen.', 4000),
  ];
  const script: SceneScript = {
    fit: 'good',
    fitReason: null,
    title: 'The question',
    mood: 'curious',
    beats: beats.map((b) => ({
      say: b.text,
      pause: 'short',
      delivery: 'explain',
    })),
    cast: [strike],
    steps: [
      {
        at: { beat: 0, phrase: 'The plan' },
        word: 0,
        stage: { layout: 'one', show: ['question'], arrows: [] },
        effects: [],
      },
    ],
  };
  const drawing: GatedDrawing = {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 600"><g id="strike-old"/><g id="strike-new"/></svg>',
    viewBox: [0, 0, 1400, 600],
    aspect: 1400 / 600,
    parts: { IF: 'strike-old', old: 'strike-old' },
    labels: {},
    states: { replaced: 'strike-new', HOW: 'strike-new', new: 'strike-new' },
    moves: true,
    callouts: [],
    field: null,
  };

  it('strikes its words out as the voice says the new one, when the writer never said when', () => {
    const { scene } = composeScene({
      script,
      drawings: new Map([['question', drawing]]),
      beats,
      durationMs: 9500,
      timing: 'voice',
      generator: 'scene-2',
    });
    const shown = scene.effects.filter(
      (e) => e.target === 'question' && e.do === 'show',
    );
    expect(shown).toHaveLength(1);
    // "how" is the seventh word of the second sentence: 4000 + 6 × 400.
    expect(shown[0].atMs).toBe(6400 - 150);
    const thing = scene.things.find((t) => t.id === 'question');
    expect(thing?.kind === 'drawing' && thing.source).toBe('strike');
    expect(thing?.kind === 'drawing' && thing.hidden).toEqual(['strike-new']);
  });

  it('keeps the moment the writer gave', () => {
    const { scene } = composeScene({
      script: {
        ...script,
        steps: [
          ...script.steps,
          {
            at: { beat: 1, phrase: 'Not whether' },
            word: 0,
            stage: null,
            effects: [{ target: 'question', part: 'new', do: 'show' }],
          },
        ],
      },
      drawings: new Map([['question', drawing]]),
      beats,
      durationMs: 9500,
      timing: 'voice',
      generator: 'scene-2',
    });
    const shown = scene.effects.filter(
      (e) => e.target === 'question' && e.do === 'show',
    );
    expect(shown).toHaveLength(1);
    expect(shown[0].atMs).toBeLessThan(4000);
  });

  it('is a card of what it shows when it cannot be drawn', () => {
    expect(thingDto(strike, null)).toEqual({
      id: 'question',
      kind: 'words',
      text: 'Changed',
      style: 'card',
    });
    const card: InfographicThing = {
      id: 'who',
      kind: 'namecard',
      name: '',
      namecard: {
        name: 'Marie Curie',
        role: null,
        line: null,
        colour: null,
        bust: null,
      },
    };
    expect(thingDto(card, null)).toMatchObject({
      kind: 'words',
      text: 'Marie Curie',
    });
  });
});

describe("an editor's episode's quiet stretches", () => {
  const steps = [
    { atMs: 0, show: ['a', 'b'], focus: 'a' },
  ] as unknown as SceneStepDto[];
  const beats = [
    timedBeat(Array.from({ length: 14 }, (_, i) => `w${i}`).join(' '), 0),
  ];
  const base = {
    steps,
    beats,
    durationMs: 5800,
    names: () => [],
    parts: () => [],
    acting: () => false,
  };

  it('fills a stretch past five seconds; a lesson waits past six', () => {
    const lesson: SceneEffectDto[] = [];
    expect(fillQuiet({ ...base, effects: lesson })).toBe(0);
    const paced: SceneEffectDto[] = [];
    expect(fillQuiet({ ...base, effects: paced, pace: INFOGRAPHIC_FILL })).toBe(
      1,
    );
    expect(paced[0]).toMatchObject({ filler: true });
    expect(LESSON_FILL.quietMs).toBe(6000);
    expect(INFOGRAPHIC_FILL.quietMs).toBe(5000);
  });

  it('leaves a hold still', () => {
    const paced: SceneEffectDto[] = [];
    expect(
      fillQuiet({
        ...base,
        effects: paced,
        pace: INFOGRAPHIC_FILL,
        holds: [[0, 5800]],
      }),
    ).toBe(0);
  });

  it('holds a held sentence to the next one, and a held step to the next change', () => {
    const two = [
      timedBeat('one two three', 0),
      timedBeat('four five six', 3000),
    ];
    expect(
      holdSpans(
        {
          beats: [
            {
              say: 'one two three',
              pause: 'short',
              delivery: 'explain',
              hold: true,
            },
            { say: 'four five six', pause: 'short', delivery: 'explain' },
          ],
        },
        two,
        [],
        9000,
      ),
    ).toEqual([[-300, 3000]]);
    expect(
      holdSpans(
        { beats: [] },
        [],
        [
          { step: { hold: true }, atMs: 1000 },
          { step: {}, atMs: 4000 },
        ],
        9000,
      ),
    ).toEqual([[1000, 4000]]);
  });
});
