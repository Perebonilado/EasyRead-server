import { PLAIN_FIGURE } from './scene-figure';
import {
  composeScene,
  fillQuiet,
  rhythmOf,
  storyShots,
  fullestStep,
  oneFaceAtATime,
  sidesKept,
  spokenIn,
  thumbSvg,
} from './scene-compose';
import type { SceneScript } from './scene-script';
import type { GatedDrawing } from './scene-svg';
import type { TimedBeat } from './scene-timing';

const beat = (text: string, startMs: number, perWord = 300): TimedBeat => ({
  text,
  startMs,
  endMs: startMs + text.split(' ').length * perWord,
  words: [...text.matchAll(/\S+/g)].map((m, i) => [
    m.index,
    m.index + m[0].length,
    startMs + i * perWord,
    startMs + i * perWord + 250,
  ]),
});

const beats = [
  beat('Plants make their own food.', 0),
  beat('They need sunlight and water.', 2000),
  beat('Inside the leaf are tiny parts called chloroplasts.', 4000),
  beat(
    'They trap the light and make sugar, which the plant uses to grow, day after day, for its whole life long.',
    7000,
  ),
];

const script: SceneScript = {
  fit: 'good',
  fitReason: null,
  title: 'Plants make food',
  mood: 'curious',
  beats: beats.map((b) => ({
    say: b.text,
    pause: 'short',
    delivery: 'explain',
  })),
  cast: [
    {
      id: 'leaf',
      kind: 'drawing',
      name: 'Leaf',
      brief: 'a leaf',
      motion: 'sways',
      parts: [
        { name: 'chloroplasts', label: true },
        { name: 'veins', label: false },
      ],
      states: [{ name: 'glowing', look: 'bright' }],
      shape: 'wide',
      sound: null,
    },
    {
      id: 'sun',
      kind: 'drawing',
      name: 'Sun',
      brief: 'a sun',
      motion: 'rays pulse',
      parts: [],
      states: [],
      shape: 'square',
      sound: 'fire',
    },
    { id: 'water', kind: 'words', text: 'water', style: 'keyword' },
  ],
  steps: [
    {
      at: { beat: 0, phrase: 'Plants make' },
      word: 0,
      stage: { layout: 'one', show: ['leaf'], arrows: [] },
      effects: [],
    },
    {
      at: { beat: 1, phrase: 'sunlight' },
      word: 2,
      stage: {
        layout: 'row',
        show: ['sun', 'leaf'],
        arrows: [{ from: 'sun', to: 'leaf', label: 'light', flow: true }],
      },
      effects: [],
    },
    {
      at: { beat: 1, phrase: 'water' },
      word: 4,
      stage: {
        layout: 'hub',
        show: ['leaf', 'sun', 'water'],
        arrows: [{ from: 'leaf', to: 'water', label: null, flow: false }],
      },
      effects: [],
    },
    {
      at: { beat: 2, phrase: 'called chloroplasts' },
      word: 6,
      stage: null,
      effects: [
        { target: 'leaf', part: 'chloroplasts', do: 'point' },
        { target: 'leaf', part: 'glowing', do: 'show' },
        { target: 'leaf', part: 'veins', do: 'point' },
      ],
    },
  ],
};

/** Ink in the middle of a 960 by 600 drawing, its corners empty, as a real drawing's map is. */
const blob = (): GatedDrawing['field'] => {
  const cols = 48;
  const rows = 30;
  let bits = '';
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1)
      bits += (c - 24) ** 2 / 400 + (r - 15) ** 2 / 110 <= 1 ? '1' : '0';
  return { viewBox: [0, 0, 960, 600], map: { cols, rows, bits } };
};

const drawing = (overrides: Partial<GatedDrawing> = {}): GatedDrawing => ({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><rect width="10" height="10"/></svg>',
  viewBox: [0, 0, 960, 600],
  aspect: 1.6,
  parts: { chloroplasts: 'chloroplasts' },
  labels: { chloroplasts: 'chloroplasts-label' },
  states: { glowing: 'glow' },
  moves: true,
  callouts: [],
  field: null,
  ...overrides,
});

describe('the scene put together', () => {
  const { scene, filled } = composeScene({
    script,
    drawings: new Map([
      ['leaf', drawing()],
      ['sun', null],
    ]),
    beats,
    durationMs: 16_000,
    timing: 'voice',
    generator: 'scene-1',
  });

  it('puts every step on its words, apart, and places it in both stagings', () => {
    expect(scene.steps.map((s) => s.atMs)).toEqual([0, 2400, 3000]);
    expect(scene.stagings.box.places).toHaveLength(3);
    expect(scene.stagings.wide.places[2].water).toBeDefined();
  });

  it('carries the mood of the page, its score, and what a drawing sounds like', () => {
    expect(scene.version).toBe(4);
    // No profile: a lesson's instruments, one state from the mood all the way.
    expect(scene.sound).toEqual({
      mood: 'curious',
      music: [{ atMs: 0, state: 'curious' }],
      palette: 'lesson',
    });
    const leaf = scene.things.find((t) => t.id === 'leaf');
    expect(leaf?.kind === 'drawing' && leaf.ambience).toBeNull();
    // A drawing that failed is a card, and a card makes no sound.
    const sun = scene.things.find((t) => t.id === 'sun');
    expect(sun?.kind).toBe('words');
  });

  it("sets a drawing's lifted labels beside it at every step, and the arrow's label on its arrow", () => {
    const lifted = composeScene({
      script,
      drawings: new Map([
        [
          'leaf',
          drawing({
            labels: {},
            callouts: [
              {
                part: 'chloroplasts',
                text: 'chloroplasts',
                anchor: [700, 300],
              },
              { part: 'veins', text: 'veins', anchor: [200, 250] },
            ],
            field: blob(),
          }),
        ],
        ['sun', drawing({ labels: {}, parts: {}, states: {}, field: blob() })],
      ]),
      beats,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-1',
    });
    const leaf = lifted.scene.things.find((t) => t.id === 'leaf');
    expect(leaf?.kind === 'drawing' && leaf.callouts).toEqual({
      chloroplasts: 'chloroplasts',
      veins: 'veins',
    });
    // Both are pointed at later, so both wait for their moment.
    expect(leaf?.kind === 'drawing' && leaf.calloutsLater?.sort()).toEqual([
      'chloroplasts',
      'veins',
    ]);
    for (const staging of ['box', 'wide'] as const) {
      const { places, pills } = lifted.scene.stagings[staging];
      for (const step of places) {
        const at = step.leaf;
        expect(at.labels?.map((l) => l.part).sort()).toEqual([
          'chloroplasts',
          'veins',
        ]);
        expect(at).not.toHaveProperty('room');
      }
      // The row's arrow has its label placed; the hub's has none to place.
      expect(pills?.[1]['sun>leaf']).toMatchObject({ size: 26 });
      expect(pills?.[2]).toEqual({});
    }
    expect(lifted.audit.box).toHaveLength(lifted.scene.steps.length);
  });

  it('shows the lines of a working in turn when the writer did not say when', () => {
    const worked = composeScene({
      script: {
        ...script,
        cast: [
          ...script.cast,
          {
            id: 'sum',
            kind: 'math',
            name: '',
            lines: [
              { latex: 'a = 1', check: null },
              { latex: '= 2', check: null },
              { latex: '= 3', check: null },
            ],
          },
        ],
        steps: [
          ...script.steps,
          {
            at: { beat: 3, phrase: 'They trap' },
            word: 0,
            stage: { layout: 'one', show: ['sum'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        ['leaf', drawing()],
        ['sun', null],
        [
          'sum',
          drawing({
            parts: {},
            labels: {},
            states: { 'line 2': 'line-2', 'line 3': 'line-3' },
          }),
        ],
      ]),
      beats,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    });
    const sum = worked.scene.things.find((t) => t.id === 'sum');
    expect(sum?.kind === 'drawing' && sum.source).toBe('math');
    const shows = worked.scene.effects.filter(
      (e) => e.target === 'sum' && e.do === 'show',
    );
    expect(shows.map((e) => e.part)).toEqual(['line 2', 'line 3']);
    expect(shows[0].atMs).toBeLessThan(shows[1].atMs);
    expect(sum?.kind === 'drawing' && sum.hidden).toEqual(['line-2', 'line-3']);
  });

  it('shows a line of working as the voice says what it comes to', () => {
    const said = [
      beat('We work out the interest.', 0),
      beat(
        'Two hundred thousand times nought point nought five is ten thousand.',
        2000,
      ),
      beat('Times three years makes thirty thousand naira.', 6000),
    ];
    const worked = composeScene({
      script: {
        ...script,
        beats: said.map((b) => ({
          say: b.text,
          pause: 'short' as const,
          delivery: 'explain' as const,
        })),
        cast: [
          {
            id: 'sum',
            kind: 'math',
            name: '',
            lines: [
              { latex: 'I = P r t', check: null },
              { latex: '= 200{,}000 \\times 0.05 = 10{,}000', check: null },
              { latex: '= 10{,}000 \\times 3 = 30{,}000', check: null },
            ],
          },
        ],
        steps: [
          {
            at: { beat: 0, phrase: '' },
            word: 0,
            stage: { layout: 'one', show: ['sum'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        [
          'sum',
          drawing({
            parts: {},
            labels: {},
            states: { 'line 2': 'line-2', 'line 3': 'line-3' },
          }),
        ],
      ]),
      beats: said,
      durationMs: 10_000,
      timing: 'voice',
      generator: 'scene-2',
    });
    const shows = worked.scene.effects.filter(
      (e) => e.target === 'sum' && e.do === 'show',
    );
    // "ten thousand" starts the tenth word from 2000; "thirty thousand" the fifth from 6000.
    expect(shows.map((e) => e.atMs)).toEqual([
      2000 + 9 * 300 - 150,
      6000 + 4 * 300 - 150,
    ]);
  });

  it('decides how each newcomer arrives', () => {
    expect(scene.steps[0].enter.leaf).toEqual({ how: 'wipe' });
    expect(scene.steps[1].enter.sun).toEqual({ how: 'slide' });
    // An arrow from something already there: the newcomer grows out of it.
    expect(scene.steps[2].enter.water).toEqual({ how: 'grow', from: 'leaf' });
    expect(scene.steps[2].focus).toBe('water');
  });

  it('hides what is pointed at later, and every state, and moves the whole thing for a part it lacks', () => {
    const leaf = scene.things.find((t) => t.id === 'leaf');
    expect(leaf?.kind === 'drawing' && leaf.hidden.sort()).toEqual([
      'chloroplasts-label',
      'glow',
    ]);
    const veins = scene.effects.find(
      (e) => e.target === 'leaf' && e.do === 'pulse' && e.atMs < 7000,
    );
    expect(veins?.part).toBeNull();
  });

  it('sets a drawing that failed as a card with its name', () => {
    expect(scene.things.find((t) => t.id === 'sun')).toEqual({
      id: 'sun',
      kind: 'words',
      text: 'Sun',
      style: 'card',
    });
  });

  it('fills a long stretch where nothing would change', () => {
    expect(filled).toBeGreaterThan(0);
    // Nothing on the stage named then: no close-up on something the
    // voice is not talking about, only a pulse.
    const fill = scene.effects.find((e) => e.filler && e.atMs > 8000);
    expect(fill).toMatchObject({ do: 'pulse', part: null });
    expect(scene.effects.some((e) => e.filler && e.do === 'zoom')).toBe(false);
    // A change that only fills a stretch is marked, so the player keeps it silent.
    expect(scene.effects.filter((e) => e.filler)).toHaveLength(filled);
  });

  it('draws the fullest step for the card', () => {
    expect(fullestStep(scene)).toBe(2);
    const svg = thumbSvg(scene, new Map([['leaf', Buffer.from('png')]]));
    expect(svg).toContain('data:image/png;base64');
    expect(svg).toContain('>water<');
  });

  it('reads a stage restated as it stands as its effects, not a change', () => {
    const restated: SceneScript = {
      ...script,
      steps: [
        script.steps[0],
        {
          at: { beat: 1, phrase: 'They need' },
          word: 0,
          stage: { layout: 'one', show: ['leaf'], arrows: [] },
          effects: [{ target: 'leaf', part: null, do: 'pulse' }],
        },
      ],
    };
    const { scene: again } = composeScene({
      script: restated,
      drawings: new Map([['leaf', drawing()]]),
      beats,
      durationMs: 6000,
      timing: 'voice',
      generator: 'scene-1',
    });
    expect(again.steps).toHaveLength(1);
    expect(
      again.effects.some(
        (e) => e.do === 'pulse' && e.atMs >= 1500 && e.atMs < 2100,
      ),
    ).toBe(true);
  });
});

describe('the score on the page', () => {
  const long = [
    beat('A river starts as rain on a hill.', 0),
    beat('The water gathers in a stream.', 4000),
    beat('Streams meet other streams.', 8000),
    beat('The stream runs down, faster and faster, over the rocks.', 12000),
    beat('It joins other streams and grows wide.', 17000),
    beat('At last it reaches the sea.', 22000),
    beat('Remember: water always flows downhill.', 27000),
  ];
  const music: SceneScript = {
    ...script,
    mood: 'calm',
    beats: long.map((b, i) => ({
      say: b.text,
      pause: 'short',
      delivery: i === 6 ? 'key' : i === 0 ? 'hook' : 'explain',
      ...(i === 3 ? { music: 'motion' as const, energy: 'high' as const } : {}),
      ...(i === 6 ? { music: 'calm' as const } : {}),
    })),
  };
  const made = (profile?: Parameters<typeof composeScene>[0]['profile']) =>
    composeScene({
      script: music,
      drawings: new Map([
        ['leaf', drawing()],
        ['sun', null],
      ]),
      beats: long,
      durationMs: 34_000,
      timing: 'voice',
      generator: 'scene-2',
      profile,
    }).scene;

  it("places the writer's changes on their sentences, and marks the key point", () => {
    const scene = made();
    // The last calm is one sentence long: it merges into the moving before it.
    expect(scene.sound?.music).toEqual([
      { atMs: 0, state: 'calm' },
      { atMs: 12000, state: 'motion', energy: 'high' },
    ]);
    expect(scene.beats.map((b) => b.delivery)).toEqual([
      'hook',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'key',
    ]);
  });

  it("gives a story its instruments and its motif, and holds the music to the book's tone", () => {
    const scene = made({ kind: 'fiction', tone: 'neutral', story: true });
    expect(scene.sound?.palette).toBe('story');
    expect(scene.sound?.motif).toBe(true);
    expect(
      made({ kind: 'poetry', tone: 'neutral', story: false }).sound?.palette,
    ).toBe('verse');
  });
});

describe("a story's characters on the stage", () => {
  const faces = Object.fromEntries(
    ['neutral', 'happy', 'sad', 'angry', 'afraid', 'surprised', 'thinking'].map(
      (f) => [f, f],
    ),
  );
  const figure = (): GatedDrawing =>
    drawing({
      aspect: 0.6,
      viewBox: [0, 0, 600, 900],
      parts: { head: 'head', body: 'body' },
      labels: {},
      states: faces,
      callouts: [{ part: 'trait-1', text: 'brave', anchor: [300, 200] }],
    });
  const story: SceneScript = {
    ...script,
    cast: [
      {
        id: 'fox',
        kind: 'character',
        ref: 'ember',
        name: 'Ember',
        state: null,
        met: 1,
        intro: [],
      },
      {
        id: 'mira',
        kind: 'character',
        ref: 'mira',
        name: 'Mira',
        state: 'sad',
        met: 0,
        intro: ['brave'],
      },
      { id: 'lamp', kind: 'words', text: 'lamp', style: 'keyword' },
    ],
    steps: [
      {
        at: { beat: 0, phrase: 'Plants make' },
        word: 0,
        stage: { layout: 'one', show: ['mira'], arrows: [] },
        effects: [],
      },
      {
        at: { beat: 1, phrase: 'sunlight' },
        word: 2,
        // The writer put the fox first; she stands on the left all book long.
        stage: { layout: 'row', show: ['fox', 'lamp', 'mira'], arrows: [] },
        effects: [],
      },
      {
        at: { beat: 2, phrase: 'called chloroplasts' },
        word: 6,
        stage: null,
        effects: [
          { target: 'mira', part: 'happy', do: 'show' },
          { target: 'fox', part: 'head', do: 'point' },
        ],
      },
      {
        at: { beat: 3, phrase: 'They trap' },
        word: 0,
        stage: null,
        effects: [{ target: 'mira', part: 'happy', do: 'hide' }],
      },
    ],
  };
  const { scene } = composeScene({
    script: story,
    drawings: new Map([
      ['mira', figure()],
      ['fox', figure()],
    ]),
    beats,
    durationMs: 16_000,
    timing: 'voice',
    generator: 'scene-2',
  });

  it('keeps each on their own side of a row, the rest where the writer put them', () => {
    expect(scene.steps[1].show).toEqual(['mira', 'lamp', 'fox']);
    expect(
      sidesKept(
        { layout: 'focus', show: ['fox', 'mira'] },
        new Map(story.cast.map((t) => [t.id, t])),
      ).show,
    ).toEqual(['fox', 'mira']);
  });

  it('shows one face at a time: the first as they come on, silently, each after replacing the last', () => {
    const mira = scene.things.find((t) => t.id === 'mira');
    expect(mira?.kind === 'drawing' && mira.hidden.sort()).toEqual(
      Object.keys(faces).sort(),
    );
    const onMira = scene.effects
      .filter((e) => e.target === 'mira' && e.part && e.part in faces)
      .map((e) => `${e.do} ${e.part}${e.filler ? ' (silent)' : ''}`);
    expect(onMira).toEqual([
      'show sad (silent)',
      'hide sad',
      'show happy',
      // Hiding the face she wears leaves her calm, never faceless.
      'hide happy',
      'show neutral',
    ]);
    // The fox comes on as the last page left him.
    const fox = scene.effects.filter(
      (e) => e.target === 'fox' && e.do === 'show',
    );
    expect(fox).toEqual([
      expect.objectContaining({ part: 'neutral', filler: true }),
    ]);
    expect(fox[0].atMs).toBeLessThan(scene.steps[1].atMs);
  });

  it("labels nothing on a story's page: no names, no traits, no captions, no parts", () => {
    const labelled = composeScene({
      script: {
        ...story,
        cast: story.cast.map((t) =>
          t.kind === 'character' && t.id === 'mira'
            ? { ...t, first: true }
            : t.id === 'lamp'
              ? {
                  id: 'lamp',
                  kind: 'drawing' as const,
                  name: 'lamp',
                  brief: 'a brass lamp',
                  motion: '',
                  parts: [{ name: 'wick', label: true }],
                  states: [],
                  shape: 'square' as const,
                  sound: null,
                }
              : t,
        ),
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
        [
          'lamp',
          drawing({
            parts: { wick: 'wick' },
            labels: { wick: 'wick-label' },
            callouts: [{ part: 'glass', text: 'glass', anchor: [10, 10] }],
          }),
        ],
      ]),
      beats,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    for (const id of ['mira', 'fox', 'lamp']) {
      const thing = labelled.things.find((t) => t.id === id);
      expect(thing?.kind === 'drawing' && thing.caption).toBeNull();
      expect(thing?.kind === 'drawing' && thing.callouts).toBeUndefined();
    }
    // The label the artist drew stays hidden, and no effect can show it.
    const lamp = labelled.things.find((t) => t.id === 'lamp');
    expect(lamp?.kind === 'drawing' && lamp.labels).toEqual({});
    expect(lamp?.kind === 'drawing' && lamp.hidden).toContain('wick-label');
    expect(
      labelled.stagings.wide.places.flatMap((step) =>
        Object.values(step).flatMap((place) => place.labels ?? []),
      ),
    ).toEqual([]);
  });

  it("captions and labels a lesson's drawings as ever", () => {
    const lesson = composeScene({
      script,
      drawings: new Map([
        [
          'leaf',
          drawing({
            callouts: [{ part: 'vein', text: 'vein', anchor: [10, 10] }],
          }),
        ],
      ]),
      beats,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    const leaf = lesson.things.find((t) => t.kind === 'drawing');
    expect(leaf?.kind === 'drawing' && leaf.caption).toBeTruthy();
    expect(leaf?.kind === 'drawing' && leaf.callouts).toEqual({ vein: 'vein' });
  });

  it('gives a person the page shows their faces one at a time, as a character', () => {
    const effects = oneFaceAtATime(
      [{ atMs: 5000, target: 'doctor', part: 'happy', do: 'show' }],
      [
        {
          id: 'doctor',
          kind: 'person',
          name: 'Doctor',
          figure: PLAIN_FIGURE,
          state: null,
        },
      ],
      [{ ...scene.steps[0], atMs: 1000, show: ['doctor'] }],
    );
    expect(effects.map((e) => `${e.atMs} ${e.do} ${e.part}`)).toEqual([
      '600 show neutral',
      '5000 hide neutral',
      '5000 show happy',
    ]);
  });

  it('shows the signs someone comes on with before they come on, and wears pain as a face', () => {
    const effects = oneFaceAtATime(
      [
        { atMs: 4000, target: 'patient', part: 'pain', do: 'show' },
        { atMs: 6000, target: 'patient', part: 'shaking', do: 'hide' },
      ],
      [
        {
          id: 'patient',
          kind: 'person',
          name: 'Patient',
          figure: PLAIN_FIGURE,
          pose: 'lying',
          signs: ['shaking', 'sweating'],
          state: 'afraid',
        },
      ],
      [{ ...scene.steps[0], atMs: 1000, show: ['patient'] }],
    );
    expect(effects.map((e) => `${e.atMs} ${e.do} ${e.part}`)).toEqual([
      '600 show afraid',
      '600 show shaking',
      '600 show sweating',
      '4000 hide afraid',
      '4000 show pain',
      // A sign stays on until an effect hides it.
      '6000 hide shaking',
    ]);
    expect(effects.filter((e) => e.atMs === 600).every((e) => e.filler)).toBe(
      true,
    );
  });

  it('gives an animal drawn by the artist the nearest face it has, and none of the kit’s signs', () => {
    const effects = oneFaceAtATime(
      [{ atMs: 4000, target: 'fox', part: 'pain', do: 'show' }],
      [
        {
          id: 'fox',
          kind: 'character',
          ref: 'fox',
          name: 'Fox',
          state: null,
          met: 1,
          intro: [],
          signs: ['shivering'],
        },
      ],
      [{ ...scene.steps[0], atMs: 1000, show: ['fox'] }],
      () => true,
      new Map(),
      (_, state) => state !== 'pain' && state !== 'shivering',
    );
    expect(effects.map((e) => `${e.atMs} ${e.do} ${e.part}`)).toEqual([
      '600 show neutral',
      '4000 hide neutral',
      '4000 show afraid',
    ]);
  });

  it('gives no faces to a character who could not be drawn', () => {
    const effects = oneFaceAtATime(
      [{ atMs: 500, target: 'mira', part: 'happy', do: 'show' }],
      story.cast,
      scene.steps,
      (id) => id !== 'mira',
    );
    expect(effects.filter((e) => e.target === 'mira')).toEqual([
      { atMs: 500, target: 'mira', part: 'happy', do: 'show' },
    ]);
  });
});

describe("a page taught to its learners' stage", () => {
  const labelled = drawing({
    parts: { chloroplasts: 'chloroplasts', veins: 'veins' },
    labels: {},
    callouts: [
      { part: 'chloroplasts', text: 'Chloroplasts', anchor: [100, 100] },
      // The artist labelled a part the writer left unlabelled.
      { part: 'veins', text: 'Veins', anchor: [300, 200] },
    ],
  });
  const make = (stage?: 'middle') =>
    composeScene({
      script,
      drawings: new Map([
        ['leaf', labelled],
        ['sun', null],
      ]),
      beats,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
      profile: stage
        ? { kind: 'textbook', tone: 'neutral', story: false, stage }
        : null,
    }).scene;

  it("keeps only the writer's labels for learners who take few, and says whom it is for", () => {
    const staged = make('middle');
    const leaf = staged.things.find((t) => t.id === 'leaf');
    expect(leaf?.kind === 'drawing' && leaf.callouts).toEqual({
      chloroplasts: 'Chloroplasts',
    });
    expect(staged.stage).toBe('middle');
    // With no stage read, every label as drawn, and nothing said.
    const plain = make();
    const all = plain.things.find((t) => t.id === 'leaf');
    expect(all?.kind === 'drawing' && Object.keys(all.callouts ?? {})).toEqual([
      'chloroplasts',
      'veins',
    ]);
    expect('stage' in plain).toBe(false);
  });
});

describe('what a character says, in a bubble', () => {
  it('takes the quoted words from the sentence, in any quotation marks', () => {
    expect(
      spokenIn('"You are holding the matches upside down," says the fox.'),
    ).toBe('You are holding the matches upside down');
    expect(spokenIn('“Foxes don’t talk,” says Mira.')).toBe('Foxes don’t talk');
    expect(spokenIn('‘You’re late,’ says Tobi, ‘again.’')).toBe(
      'You’re late … again.',
    );
    expect(spokenIn('Mira says nothing at all.')).toBeNull();
    // Straight single quotes, the apostrophes inside them left alone.
    expect(
      spokenIn("'You're holding the matches upside down,' says the fox."),
    ).toBe("You're holding the matches upside down");
    // A quote the writer never opened, or never closed.
    expect(spokenIn("Foxes don't talk,' she says.")).toBe("Foxes don't talk");
    expect(spokenIn('She calls out, "Same time tomorrow?')).toBe(
      'Same time tomorrow?',
    );
    // A possessive is no quotation.
    expect(spokenIn("The boys' fire goes out.")).toBeNull();
    // A speech: the sentences that start it, as many as a bubble holds.
    expect(
      spokenIn(
        '"And lanterns don\'t light themselves. I\'m Ember. Your grandfather and I go back a long way," says the fox.',
      ),
    ).toBe("And lanterns don't light themselves. I'm Ember.");
    expect(spokenIn(`"${'word '.repeat(60)}"`)!.length).toBeLessThanOrEqual(81);
  });

  /** A standing figure's ink: a column down the middle of its box, its sides empty. */
  const standing = (): GatedDrawing['field'] => {
    const cols = 48;
    const rows = 72;
    let bits = '';
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1)
        bits += Math.abs(c - 24) <= 8 && r >= 4 ? '1' : '0';
    return { viewBox: [0, 0, 600, 900], map: { cols, rows, bits } };
  };
  // Drawn as characters are: standing with people, a grown-up's height.
  const figure = (): GatedDrawing =>
    drawing({
      aspect: 0.6,
      viewBox: [0, 0, 600, 900],
      parts: { head: 'head' },
      labels: {},
      states: { neutral: 'neutral', happy: 'happy' },
      head: [300, 180],
      field: standing(),
      stands: { units: 234 },
      acts: true,
      joints: {
        r: [
          [360, 360],
          [380, 480],
          [400, 600],
        ],
        l: [
          [240, 360],
          [220, 480],
          [200, 600],
        ],
      },
    });
  const talking: SceneScript = {
    ...script,
    beats: [
      ...script.beats.slice(0, 3),
      {
        say: '"You are holding the matches upside down," says the fox.',
        pause: 'short',
        delivery: 'explain',
        // As the mend finds it: the fox's line.
        lines: [{ span: [1, 41], speaker: 'fox' }],
      },
    ],
    cast: [
      {
        id: 'fox',
        kind: 'character',
        ref: 'ember',
        name: 'Ember',
        state: null,
        met: 1,
        intro: [],
      },
      {
        id: 'mira',
        kind: 'character',
        ref: 'mira',
        name: 'Mira',
        state: null,
        met: 0,
        intro: [],
      },
    ],
    steps: [
      {
        at: { beat: 0, phrase: 'Plants make' },
        word: 0,
        stage: { layout: 'compare', show: ['mira', 'fox'], arrows: [] },
        effects: [],
      },
      {
        at: { beat: 2, phrase: 'Inside the leaf' },
        word: 0,
        stage: null,
        // A "say" left on the stage makes no bubble: lines do.
        effects: [{ target: 'mira', part: null, do: 'say' }],
      },
    ],
  };
  const beatsSaid = [
    ...beats.slice(0, 3),
    beat('"You are holding the matches upside down," says the fox.', 7000),
  ];
  const { scene, audit } = composeScene({
    script: talking,
    drawings: new Map([
      ['mira', figure()],
      ['fox', figure()],
    ]),
    beats: beatsSaid,
    durationMs: 16_000,
    timing: 'voice',
    generator: 'scene-2',
  });

  it("acts the page: the speaker's mouth moves with the words, the listener looks at him", () => {
    expect(scene.acting?.fox.mouth?.[0][0]).toBe(7000);
    const look = scene.acting?.mira.look ?? [];
    const at = (t: number) =>
      [...look].reverse().find(([when]) => when <= t)?.[1] ?? null;
    expect(at(8000)).toBe('fox');
    // Where each one's head is, to look from.
    const fox = scene.things.find((t) => t.id === 'fox');
    expect(fox?.kind === 'drawing' && fox.head).toEqual([0.5, 0.2]);
    // And its arms' joints, as shares of its box, for the player to bend.
    expect(fox?.kind === 'drawing' && fox.rig).toBe(true);
    expect(fox?.kind === 'drawing' && fox.joints?.r).toEqual([
      [0.6, 0.4],
      [0.633, 0.533],
      [0.667, 0.667],
    ]);
  });

  it('acts what the writer directs, and keeps the camera on two', () => {
    const directed = composeScene({
      script: {
        ...talking,
        steps: [
          ...talking.steps,
          {
            at: { beat: 2, phrase: 'Inside the leaf' },
            word: 0,
            stage: null,
            effects: [
              { target: 'mira', part: 'fox', do: 'reach' },
              { target: 'fox', part: 'mira', do: 'zoom' },
            ],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    expect(directed.acting?.mira.moves).toEqual(
      expect.arrayContaining([[expect.any(Number), 'reach', 1400, 'fox']]),
    );
    // The reach is acted, not a change on the stage; the two-shot stays.
    expect(directed.effects.some((e) => (e.do as string) === 'reach')).toBe(
      false,
    );
    expect(directed.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'fox', part: 'mira', do: 'zoom' }),
      ]),
    );
  });

  it('acts what the narration says at the word that says it, and attention on a character as looks', () => {
    const sentence = talking.beats[3].say;
    const at = sentence.indexOf('says');
    const acted = composeScene({
      script: {
        ...talking,
        beats: [
          ...talking.beats.slice(0, 3),
          {
            ...talking.beats[3],
            acts: [{ at, who: 'fox', do: 'wave', toward: 'mira' }],
          },
        ],
        steps: [
          ...talking.steps,
          {
            at: { beat: 1, phrase: 'They need' },
            word: 0,
            stage: null,
            effects: [
              // A lesson's ring and pulse, on a story's characters.
              { target: 'mira', part: 'head', do: 'point' },
              { target: 'fox', part: null, do: 'pulse' },
            ],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    // "says" is the line's eighth word: 7000 + 7 × 300.
    expect(acted.acting?.fox.moves).toEqual(
      expect.arrayContaining([[9100, 'wave', 1900, 'mira']]),
    );
    // No ring round a face, no pulse: the fox looks at Mira, and nods.
    expect(
      acted.effects.filter((e) => e.do === 'point' || e.do === 'pulse'),
    ).toEqual([]);
    const look = acted.acting?.fox.look ?? [];
    const lookAt = (t: number) =>
      [...look].reverse().find(([when]) => when <= t)?.[1] ?? null;
    expect(lookAt(2600)).toBe('mira');
    expect(acted.acting?.fox.moves).toEqual(
      expect.arrayContaining([[expect.any(Number), 'nod', 600]]),
    );
  });

  it('finds characters in the scene as it opens, walks on those the words bring, and cuts in a speaker', () => {
    const staged = (second: { arrive?: string[]; cutIn?: string[] }) =>
      composeScene({
        script: {
          ...talking,
          steps: [
            {
              at: { beat: 0, phrase: 'Plants make' },
              word: 0,
              stage: { layout: 'one', show: ['mira'], arrows: [] },
              effects: [],
            },
            {
              at: { beat: 1, phrase: 'They need' },
              word: 0,
              stage: {
                layout: 'row',
                show: ['mira', 'fox'],
                arrows: [],
                ...second,
              },
              effects: [],
            },
          ],
        },
        drawings: new Map([
          ['mira', figure()],
          ['fox', figure()],
        ]),
        beats: beatsSaid,
        durationMs: 16_000,
        timing: 'voice',
        generator: 'scene-2',
      }).scene;
    const arriving = staged({ arrive: ['fox'] });
    expect(arriving.steps[0].enter).toEqual({ mira: { how: 'fade' } });
    expect(arriving.steps[1].enter.fox.how).toBe('slide');
    expect(arriving.steps[1].cut).toBeUndefined();
    expect(staged({ cutIn: ['fox'] }).steps[1].enter.fox.how).toBe('fade');
  });

  it('cuts, rather than walks, when the stage is swapped whole', () => {
    const swapped = composeScene({
      script: {
        ...talking,
        steps: [
          {
            at: { beat: 0, phrase: 'Plants make' },
            word: 0,
            stage: { layout: 'one', show: ['mira'], arrows: [] },
            effects: [],
          },
          {
            at: { beat: 1, phrase: 'They need' },
            word: 0,
            stage: { layout: 'one', show: ['fox'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    expect(swapped.steps[1]).toMatchObject({
      cut: true,
      enter: { fox: { how: 'fade' } },
    });
    // The stage emptied: a cut away, unless the words take them off.
    const emptied = (leave?: string[]) =>
      composeScene({
        script: {
          ...talking,
          steps: [
            talking.steps[0],
            {
              at: { beat: 1, phrase: 'They need' },
              word: 0,
              stage: {
                layout: 'one',
                show: [],
                arrows: [],
                ...(leave ? { leave } : {}),
              },
              effects: [],
            },
          ],
        },
        drawings: new Map([
          ['mira', figure()],
          ['fox', figure()],
        ]),
        beats: beatsSaid,
        durationMs: 16_000,
        timing: 'voice',
        generator: 'scene-2',
      }).scene.steps[1].cut;
    expect(emptied()).toBe(true);
    expect(emptied(['fox'])).toBeUndefined();
  });

  it('cuts back to whoever was there before a cut away', () => {
    const back = composeScene({
      script: {
        ...talking,
        steps: [
          talking.steps[0],
          {
            at: { beat: 1, phrase: 'They need' },
            word: 0,
            stage: { layout: 'one', show: [], arrows: [] },
            effects: [],
          },
          {
            at: { beat: 2, phrase: 'Inside the leaf' },
            word: 0,
            stage: { layout: 'one', show: ['mira'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    expect(back.steps[2].enter).toEqual({ mira: { how: 'fade' } });
  });

  it('plays a screenplay: moments in the quiet after a line, a close shot on a whisper, and who says each line', () => {
    const line = (
      say: string,
      speaker: string,
      extra: Partial<SceneScript['beats'][number]> = {},
    ): SceneScript['beats'][number] => ({
      say,
      pause: 'short',
      delivery: 'explain',
      kind: 'line',
      speaker,
      lines: [{ span: [0, say.length], speaker }],
      ...extra,
    });
    const played = composeScene({
      script: {
        ...talking,
        beats: [
          {
            say: 'A cold night on the quay.',
            pause: 'short',
            delivery: 'explain',
            kind: 'narration',
          },
          line('Who goes there?', 'mira', { to: 'fox', holdS: 1.2 }),
          line('A friend of your grandfather.', 'fox', {
            to: 'mira',
            pace: 'whisper',
          }),
          line('Foxes do not talk.', 'mira'),
        ],
        steps: [
          {
            at: { beat: 0, phrase: '' },
            word: 0,
            stage: { layout: 'row', show: ['mira', 'fox'], arrows: [] },
            effects: [],
          },
          {
            at: { beat: 1, phrase: 'The fox waves' },
            word: 0,
            after: 0.2,
            stage: null,
            effects: [{ target: 'fox', part: 'mira', do: 'wave' }],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: [
        beat('A cold night on the quay.', 0),
        beat('Who goes there?', 2000),
        beat('A friend of your grandfather.', 4500),
        beat('Foxes do not talk.', 7000),
      ],
      durationMs: 9000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    // The line ends at 2900: the wave 150ms after, and 0.2s into the quiet.
    expect(played.acting?.fox.moves).toEqual(
      expect.arrayContaining([[3250, 'wave', 1900, 'mira']]),
    );
    expect(played.beats.map((b) => b.who)).toEqual([
      undefined,
      'Mira',
      'Ember',
      'Mira',
    ]);
    // The whisper, close on the fox until just after its last word.
    const shots = played.effects.filter((e) => e.untilMs !== undefined);
    expect(shots).toEqual([
      {
        atMs: 4300,
        target: 'fox',
        part: null,
        do: 'zoom',
        // Five words from 4500, and half a second after.
        untilMs: 4500 + 5 * 300 + 500,
      },
    ]);
    // Mira speaks to the fox, and looks at him.
    const look = played.acting?.mira.look ?? [];
    expect([...look].reverse().find(([when]) => when <= 2200)?.[1]).toBe('fox');
  });

  it('shows where a voice from elsewhere comes from: above, off the stage, a thought', () => {
    const line = (
      say: string,
      speaker: string,
      extra: Partial<SceneScript['beats'][number]> = {},
    ): SceneScript['beats'][number] => ({
      say,
      pause: 'short',
      delivery: 'explain',
      kind: 'line',
      speaker,
      lines: [{ span: [0, say.length], speaker }],
      ...extra,
    });
    const played = composeScene({
      script: {
        ...talking,
        cast: [
          ...talking.cast,
          {
            id: 'god',
            kind: 'character',
            ref: 'god',
            name: 'God',
            state: null,
            met: 2,
            intro: [],
          },
          {
            id: 'mum',
            kind: 'character',
            ref: 'mum',
            name: 'Mum',
            state: null,
            met: 3,
            intro: [],
          },
        ],
        beats: [
          {
            say: 'A cold night on the quay.',
            pause: 'short',
            delivery: 'explain',
            kind: 'narration',
          },
          line('This is my beloved child.', 'god', { from: 'above' }),
          line('Dinner is ready!', 'mum', { from: 'off' }),
          line('I wish I could fly.', 'mira', { from: 'thought' }),
        ],
        steps: [
          {
            at: { beat: 0, phrase: '' },
            word: 0,
            stage: { layout: 'row', show: ['mira', 'fox'], arrows: [] },
            effects: [],
          },
        ],
      },
      // No one draws a voice.
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: [
        beat('A cold night on the quay.', 0),
        beat('This is my beloved child.', 2000),
        beat('Dinner is ready!', 4500),
        beat('I wish I could fly.', 7000),
      ],
      durationMs: 9500,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    const says = played.effects.filter((e) => e.say);
    expect(says.map((e) => [e.target, e.say!.from])).toEqual([
      ['god', 'above'],
      ['mum', 'off'],
      ['mira', 'thought'],
    ]);
    const placed = played.stagings.wide.bubbles!;
    const [above, off, thought] = says.map((e) => placed[e.say!.id]!);
    // From above: across the top, pointing at no one on the stage.
    expect(above.from).toBe('above');
    expect(above.tail[1]).toBeLessThan(0);
    // Mum, met after everyone: her voice from the right, out past the edge.
    expect(off.from).toBe('off');
    expect(off.tail[0]).toBeGreaterThan(off.x + off.w);
    expect(thought.from).toBe('thought');
    // Everyone looks up at the voice from above, and to the right at Mum's.
    const lookAt = (id: string, t: number) =>
      [...(played.acting?.[id]?.look ?? [])]
        .reverse()
        .find(([when]) => when <= t)?.[1];
    expect(lookAt('fox', 2600)).toBe('@up');
    expect(lookAt('mira', 5000)).toBe('@right');
    // No mouth moves for a voice, nor for a thought.
    expect(played.acting?.god).toBeUndefined();
    expect(played.acting?.mira.mouth ?? []).toEqual([]);
  });

  it("dresses a story's page: its set at full strength, its night and storm, and a crowd that speaks and cheers", () => {
    const line = (
      say: string,
      speaker: string,
      extra: Partial<SceneScript['beats'][number]> = {},
    ): SceneScript['beats'][number] => ({
      say,
      pause: 'short',
      delivery: 'explain',
      kind: 'line',
      speaker,
      lines: [{ span: [0, say.length], speaker }],
      ...extra,
    });
    const played = composeScene({
      script: {
        ...talking,
        cast: [
          ...talking.cast.map((thing) =>
            thing.id === 'mira' ? { ...thing, first: true } : thing,
          ),
          {
            id: 'crowd-people',
            kind: 'character',
            ref: 'the-crowd',
            name: 'The crowd',
            state: null,
            met: 2,
            intro: [],
            group: true,
          },
        ],
        beats: [
          {
            say: 'A great multitude gathers on the shore.',
            pause: 'short',
            delivery: 'explain',
            kind: 'narration',
          },
          line('Who goes there?', 'mira'),
          line('Hosanna!', 'crowd-people'),
        ],
        steps: [
          {
            at: { beat: 0, phrase: '' },
            word: 0,
            stage: { layout: 'row', show: ['mira', 'fox'], arrows: [] },
            effects: [],
          },
        ],
        setting: {
          time: 'night',
          weather: 'storm',
          crowd: 'many',
          world: null,
        },
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: [
        beat('A great multitude gathers on the shore.', 0),
        beat('Who goes there?', 3000),
        beat('Hosanna!', 5000),
      ],
      durationMs: 7000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    expect(played.setting).toEqual({
      full: true,
      time: 'night',
      weather: 'storm',
      crowd: { id: '@crowd', moves: [[5000, 'cheer', 1400]] },
    });
    // The crowd is drawn by code, and never stands in a step.
    expect(
      played.things.some((t) => t.id === '@crowd' && t.kind === 'drawing'),
    ).toBe(true);
    expect(played.steps.every((step) => !step.show.includes('@crowd'))).toBe(
      true,
    );
    // The crowd's line comes from over the crowd.
    const shout = played.effects.find((e) => e.target === 'crowd-people');
    expect(shout?.say?.from).toBe('crowd');
    expect(played.stagings.wide.bubbles![shout!.say!.id]?.from).toBe('crowd');
    // Mira, met here for the first time, gets a moment of the camera.
    expect(
      played.effects.some(
        (e) =>
          e.do === 'zoom' && e.target === 'mira' && e.untilMs !== undefined,
      ),
    ).toBe(true);
  });

  it('walks one over to the other before a hug across the row, and keeps them side by side', () => {
    const three = composeScene({
      script: {
        ...talking,
        cast: [
          ...talking.cast,
          {
            id: 'tobi',
            kind: 'character',
            ref: 'tobi',
            name: 'Tobi',
            state: null,
            met: 2,
            intro: [],
          },
        ],
        steps: [
          {
            at: { beat: 0, phrase: 'Plants make' },
            word: 0,
            stage: { layout: 'row', show: ['mira', 'fox', 'tobi'], arrows: [] },
            effects: [],
          },
          {
            at: { beat: 1, phrase: 'They need' },
            word: 0,
            after: 0,
            stage: null,
            effects: [{ target: 'mira', part: 'tobi', do: 'hug' }],
          },
          {
            at: { beat: 3, phrase: 'They trap' },
            word: 0,
            stage: { layout: 'row', show: ['mira', 'fox', 'tobi'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
        ['tobi', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    // Tobi walks over beside Mira, and the hug comes once he is there.
    expect(three.steps.map((step) => step.show)).toEqual([
      ['mira', 'fox', 'tobi'],
      ['mira', 'tobi', 'fox'],
    ]);
    const hug = three.acting?.mira.moves?.find(([, what]) => what === 'hug');
    expect(hug?.[0]).toBe(three.steps[1].atMs + 1100);
    // Asked for the old row again later, they stay together: no change.
    expect(three.steps).toHaveLength(2);
  });

  it('opens a bubble for each line, from just before its first word', () => {
    const says = scene.effects.filter((e) => e.do === 'say');
    expect(says.map((e) => [e.target, e.atMs, e.say?.text])).toEqual([
      // The line's first word is at 7000ms.
      ['fox', 6850, 'You are holding the matches upside down'],
    ]);
    // A "say" on the stage with no line under it is no bubble.
    expect(
      scene.effects.some((e) => e.target === 'mira' && e.do === 'say'),
    ).toBe(false);
  });

  it('holds a line until the voice has said it, and the mouth for exactly that long', () => {
    const [say] = scene.effects.filter((e) => e.do === 'say');
    expect(say.say).toMatchObject({ id: 'say-1' });
    // Its last word, "down,", ends at 9050ms; the sentence goes on after it.
    expect(say.say!.saidUntilMs).toBe(9050);
    expect(say.say!.untilMs).toBe(9050 + 700);
  });

  it('gives each of two speakers in a sentence their own bubble, never closed before its words end', () => {
    const text = '"Is it far?" asks Mira. "Not far," says the fox.';
    const two = composeScene({
      script: {
        ...talking,
        beats: [
          ...talking.beats.slice(0, 3),
          {
            say: text,
            pause: 'short',
            delivery: 'explain',
            lines: [
              { span: [1, 11], speaker: 'mira' },
              { span: [25, 33], speaker: 'fox' },
            ],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: [...beats.slice(0, 3), beat(text, 7000)],
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    const says = two.effects.filter((e) => e.do === 'say');
    expect(says.map((e) => [e.target, e.say!.text])).toEqual([
      ['mira', 'Is it far?'],
      ['fox', 'Not far'],
    ]);
    // Mira's words end at 7850ms; the fox's bubble opens after them, and hers closes as it does.
    expect(says[0].say!.saidUntilMs).toBe(7850);
    expect(says[0].say!.untilMs).toBe(says[1].atMs);
    expect(says[0].say!.untilMs).toBeGreaterThanOrEqual(7850);
  });

  it('carries a line across a change of stage, and ends it with its speaker leaving', () => {
    const moving = composeScene({
      script: {
        ...talking,
        steps: [
          ...talking.steps,
          // Mid-line, the stage changes: the fox stays, then goes.
          {
            at: { beat: 3, phrase: 'the matches' },
            word: 3,
            stage: { layout: 'row', show: ['fox', 'mira'], arrows: [] },
            effects: [],
          },
          {
            at: { beat: 3, phrase: 'down' },
            word: 6,
            stage: { layout: 'one', show: ['mira'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    const says = moving.effects.filter((e) => e.do === 'say');
    expect(says).toHaveLength(2);
    const [first, rest] = says;
    const change = moving.steps[moving.steps.length - 2].atMs;
    const leaves = moving.steps[moving.steps.length - 1].atMs;
    expect(first.say).toMatchObject({ untilMs: change, carried: true });
    expect(rest).toMatchObject({ atMs: change, target: 'fox' });
    expect(rest.say).toMatchObject({
      text: first.say!.text,
      continues: true,
      untilMs: leaves,
    });
    // Each part is placed for its own step.
    for (const staging of ['box', 'wide'] as const)
      for (const one of says)
        expect(moving.stagings[staging].bubbles?.[one.say!.id]).toBeTruthy();
  });

  it('never shows a finished line again when the stage changes as its bubble lingers', () => {
    const lingering = composeScene({
      script: {
        ...talking,
        steps: [
          ...talking.steps,
          // The stage changes on "fox", after the fox's line is all said,
          // while its bubble lingers.
          {
            at: { beat: 3, phrase: 'fox' },
            word: 9,
            stage: { layout: 'row', show: ['fox', 'mira'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    const says = lingering.effects.filter((e) => e.do === 'say');
    // Each line once: none carried on after its last word.
    expect(says.filter((e) => e.say!.continues)).toEqual([]);
  });

  it('sets a line with no room by the speaker in a strip across the top, with their name', () => {
    const off = composeScene({
      script: {
        ...talking,
        // The fox is not on the stage when he speaks.
        steps: [
          {
            at: { beat: 0, phrase: 'Plants make' },
            word: 0,
            stage: { layout: 'one', show: ['mira'], arrows: [] },
            effects: [],
          },
        ],
      },
      drawings: new Map([
        ['mira', figure()],
        ['fox', figure()],
      ]),
      beats: beatsSaid,
      durationMs: 16_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;
    const [say] = off.effects.filter((e) => e.do === 'say');
    for (const staging of ['box', 'wide'] as const) {
      const strip = off.stagings[staging].bubbles?.[say.say!.id];
      expect(strip).toMatchObject({ who: 'Ember', y: 12 });
      expect(strip!.lines.join(' ')).toBe(
        'Ember: You are holding the matches upside down',
      );
    }
  });

  it('sets the bubble by the head, clear of everything, in both stagings', () => {
    for (const staging of ['box', 'wide'] as const) {
      const bubble = scene.stagings[staging].bubbles?.['say-1'];
      expect(bubble).toBeTruthy();
      const fox = scene.stagings[staging].places[0].fox;
      // Its tail reaches toward the fox's head, from outside the fox.
      const head = [fox.x + (300 / 600) * fox.w, fox.y + (180 / 900) * fox.h];
      const [tx, ty] = bubble!.tail;
      expect(Math.hypot(tx - head[0], ty - head[1])).toBeLessThan(
        Math.hypot(
          bubble!.x + bubble!.w / 2 - head[0],
          bubble!.y + bubble!.h / 2 - head[1],
        ),
      );
      expect(bubble!.lines.join(' ')).toBe(
        'You are holding the matches upside down',
      );
      expect(audit[staging].flat()).toEqual([]);
    }
  });
});

describe('the scene behind the stage', () => {
  const quay = (): GatedDrawing =>
    drawing({
      aspect: 16 / 9,
      viewBox: [0, 0, 1600, 900],
      parts: {},
      labels: {},
      states: {},
    });
  const backdrops: SceneScript = {
    ...script,
    backdrop: 'quay',
    cast: [
      {
        id: 'quay',
        kind: 'place',
        ref: 'quay',
        name: 'The quay',
        sound: 'water',
      },
      { id: 'home', kind: 'place', ref: 'home', name: 'Home', sound: null },
      {
        id: 'mira',
        kind: 'character',
        ref: 'mira',
        name: 'Mira',
        state: null,
        met: 0,
        intro: [],
      },
    ],
    steps: [
      {
        at: { beat: 0, phrase: 'Plants make' },
        word: 0,
        stage: { layout: 'one', show: [], arrows: [] },
        effects: [],
      },
      {
        at: { beat: 1, phrase: 'sunlight' },
        word: 2,
        stage: { layout: 'one', show: ['mira'], arrows: [] },
        effects: [],
      },
      // The same stage somewhere else: a change all the same.
      {
        at: { beat: 2, phrase: 'called chloroplasts' },
        word: 6,
        stage: { layout: 'one', show: ['mira'], arrows: [], backdrop: 'home' },
        effects: [],
      },
    ],
  };
  const { scene, audit } = composeScene({
    script: backdrops,
    drawings: new Map([
      ['quay', quay()],
      ['home', quay()],
      [
        'mira',
        drawing({
          aspect: 0.6,
          viewBox: [0, 0, 600, 900],
          parts: {},
          labels: {},
          states: {},
        }),
      ],
    ]),
    beats,
    durationMs: 16_000,
    timing: 'voice',
    generator: 'scene-2',
  });

  it("carries the page's own place from the start, and each place shown from its step", () => {
    expect(scene.steps.map((s) => s.backdrop)).toEqual([
      'quay',
      'quay',
      'home',
    ]);
    expect(scene.steps[0].show).toEqual([]);
    const set = scene.things.find((t) => t.id === 'quay');
    expect(set).toMatchObject({
      kind: 'drawing',
      backdrop: true,
      caption: null,
      ambience: 'water',
    });
    expect(audit.wide.flat()).toEqual([]);
  });
});

describe('the "previously" before a story page', () => {
  const figure = (): GatedDrawing =>
    drawing({
      aspect: 0.6,
      viewBox: [0, 0, 600, 900],
      parts: {},
      labels: {},
      states: { neutral: 'neutral', happy: 'happy', afraid: 'afraid' },
    });
  const late = beats.map((b) => ({
    ...b,
    startMs: b.startMs + 2000,
    endMs: b.endMs + 2000,
    words: b.words.map((w) => [w[0], w[1], w[2] + 2000, w[3] + 2000]),
  }));
  const story: SceneScript = {
    ...script,
    opening: { show: ['mira'], backdrop: null },
    cast: [
      {
        id: 'mira',
        kind: 'character',
        ref: 'mira',
        name: 'Mira',
        state: 'happy',
        met: 0,
        intro: [],
        before: 'afraid',
      },
    ],
    steps: [
      {
        at: { beat: 1, phrase: 'sunlight' },
        word: 2,
        stage: { layout: 'one', show: ['mira'], arrows: [] },
        effects: [],
      },
    ],
  };
  const make = (timed: typeof beats) =>
    composeScene({
      script: story,
      drawings: new Map([['mira', figure()]]),
      beats: timed,
      durationMs: 18_000,
      timing: 'voice',
      generator: 'scene-2',
    }).scene;

  it('opens on who comes back, with the face they left with, until the page turns it', () => {
    const scene = make(late);
    expect(scene.steps[0]).toMatchObject({
      atMs: 0,
      layout: 'one',
      show: ['mira'],
    });
    const faces = scene.effects
      .filter(
        (e) => e.target === 'mira' && (e.do === 'show' || e.do === 'hide'),
      )
      .map((e) => `${e.atMs < 2000 ? 'before' : 'after'} ${e.do} ${e.part}`);
    expect(faces).toEqual([
      'before show afraid',
      'after hide afraid',
      'after show happy',
    ]);
  });

  it('is left out when the voice did not wait for it', () => {
    const scene = make(beats);
    expect(scene.steps[0].atMs).toBeGreaterThan(0);
    expect(
      scene.effects.find((e) => e.target === 'mira' && e.do === 'show')?.part,
    ).toBe('happy');
  });
});

describe("a screenplay's camera", () => {
  const person = (id: string) => ({
    id,
    kind: 'character' as const,
    ref: id,
    name: id,
    state: null,
    met: 0,
    intro: [],
  });
  const cast = ['ada', 'kofi', 'nana', 'mira', 'fox', 'tobi'].map(person);
  const line = (say: string, speaker: string, to?: string) => ({
    say,
    pause: 'short' as const,
    delivery: 'explain' as const,
    kind: 'line' as const,
    speaker,
    ...(to ? { to } : {}),
    lines: [{ span: [0, say.length] as [number, number], speaker }],
  });
  const step = (atMs: number, show: string[]) => ({
    atMs,
    layout: 'row' as const,
    show,
    arrows: [],
    enter: {},
    focus: null,
  });

  it('frames the two in a conversation together while a third stands by, and goes wide for the narrator', () => {
    const shots = storyShots(
      {
        ...script,
        cast,
        beats: [
          line('Is it far?', 'ada', 'kofi'),
          line('Not far.', 'kofi', 'ada'),
          line('Will we be back by dark?', 'ada', 'kofi'),
          {
            say: 'They walk on.',
            pause: 'short',
            delivery: 'explain',
            kind: 'narration',
          },
          line('Wait for me!', 'nana'),
        ],
      },
      [
        beat('Is it far?', 1000),
        beat('Not far.', 2500),
        beat('Will we be back by dark?', 4000),
        beat('They walk on.', 6500),
        beat('Wait for me!', 8000),
      ],
      [step(0, ['ada', 'kofi', 'nana'])],
      [],
      10_000,
    );
    expect(shots).toEqual([
      {
        atMs: 800,
        target: 'ada',
        part: 'kofi',
        do: 'zoom',
        untilMs: 4000 + 6 * 300 + 400,
      },
    ]);
  });

  it('ends a shot where the stage changes, and waits a while between close shots', () => {
    const shots = storyShots(
      {
        ...script,
        cast,
        beats: [
          { ...line('Please.', 'mira'), pace: 'whisper' as const },
          { ...line('Please, please.', 'mira'), pace: 'whisper' as const },
        ],
      },
      [beat('Please.', 1000, 800), beat('Please, please.', 3000, 800)],
      [step(0, ['mira', 'fox']), step(2000, ['mira', 'fox', 'tobi'])],
      [],
      6000,
    );
    // The first cut short by the change at 2000; the second too soon after.
    expect(shots).toEqual([
      { atMs: 800, target: 'mira', part: null, do: 'zoom', untilMs: 2000 },
    ]);
  });
});

describe('a quiet stretch filled with what the words bring', () => {
  const step = (atMs: number, show: string[], focus: string | null = null) =>
    ({
      atMs,
      layout: show.length > 1 ? 'row' : 'one',
      show,
      arrows: [],
      enter: {},
      focus: focus ?? show[0],
    }) as never;
  /** Twenty seconds of words, one every 400 ms, some of them names. */
  const said = (words: Record<number, string>) => {
    const list = Array.from({ length: 50 }, (_, i) => words[i] ?? 'and');
    return [beat(`${list.join(' ')}.`, 0, 400)];
  };
  const fill = (
    steps: never[],
    words: Record<number, string>,
    parts: Record<string, string[]> = {},
    names: Record<string, string> = {},
  ) => {
    const effects: Parameters<typeof fillQuiet>[0]['effects'] = [];
    const added = fillQuiet({
      steps,
      effects,
      beats: said(words),
      durationMs: 20_000,
      names: (id) => (names[id] ? [names[id]] : []),
      parts: (id) => parts[id] ?? [],
      acting: () => false,
    });
    return { effects, added };
  };

  it('points at a part of a drawing when the voice names it', () => {
    // "…the left ventricle…" said about 6.5 s in, the heart alone on stage.
    const { effects } = fill(
      [step(0, ['heart'])],
      { 16: 'left', 17: 'ventricle' },
      { heart: ['left-ventricle', 'aorta'] },
    );
    expect(effects[0]).toMatchObject({
      target: 'heart',
      part: 'left-ventricle',
      do: 'point',
      filler: true,
    });
  });

  it('moves in close on a thing the voice names, when there is more than one', () => {
    const { effects } = fill(
      [step(0, ['heart', 'lungs'], 'heart')],
      { 16: 'lungs' },
      {},
      { heart: 'Heart', lungs: 'Lungs' },
    );
    expect(effects[0]).toMatchObject({ target: 'lungs', do: 'zoom' });
    expect(effects[0].untilMs! - effects[0].atMs).toBeGreaterThanOrEqual(1500);
  });

  it('keeps its distance from other changes, and changes about every six seconds', () => {
    const { effects, added } = fill([step(0, ['heart', 'lungs'])], {});
    // Twenty quiet seconds: three changes, each clear of the start and end.
    expect(added).toBe(3);
    for (const e of effects) {
      expect(e.atMs).toBeGreaterThanOrEqual(2000);
      expect(e.untilMs ?? e.atMs).toBeLessThanOrEqual(20_000 - 400);
    }
    // Nothing named: no close-ups at all.
    expect(effects.every((e) => e.do === 'pulse')).toBe(true);
  });

  it('fills a stretch of pulses too, which show nothing new, keeping clear of them', () => {
    const effects: Parameters<typeof fillQuiet>[0]['effects'] = [
      { atMs: 4000, target: 'heart', part: null, do: 'pulse' },
      { atMs: 9000, target: 'heart', part: null, do: 'pulse' },
    ];
    const added = fillQuiet({
      steps: [step(0, ['heart', 'lungs'])],
      effects,
      beats: said({}),
      durationMs: 20_000,
      names: () => [],
      parts: () => [],
      acting: () => false,
    });
    expect(added).toBeGreaterThan(0);
    const fills = effects.filter((e) => e.filler);
    for (const f of fills)
      expect(
        effects
          .filter((e) => !e.filler)
          .every((e) => Math.abs(e.atMs - f.atMs) >= 1000),
      ).toBe(true);
  });

  it('pulses what holds the eye only when there is nothing else to do', () => {
    const { effects } = fill([step(0, ['heart'])], {});
    expect(effects.map((e) => e.do)).toEqual(['pulse', 'pulse', 'pulse']);
  });
});

describe('the rhythm of a page', () => {
  it('finds the longest the picture sits still, and the changes a minute, pulses aside', () => {
    expect(
      rhythmOf({
        steps: [{ atMs: 0 }, { atMs: 20_000 }],
        effects: [
          { atMs: 5000, do: 'point' },
          { atMs: 12_000, do: 'pulse' },
        ],
        durationMs: 60_000,
      }),
    ).toEqual({ stillMs: 40_000, perMinute: 3, stagesPerMinute: 2 });
  });
});
