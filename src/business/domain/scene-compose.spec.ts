import { composeScene, fullestStep, thumbSvg } from './scene-compose';
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

const drawing = (overrides: Partial<GatedDrawing> = {}): GatedDrawing => ({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><rect width="10" height="10"/></svg>',
  viewBox: [0, 0, 960, 600],
  aspect: 1.6,
  parts: { chloroplasts: 'chloroplasts' },
  labels: { chloroplasts: 'chloroplasts-label' },
  states: { glowing: 'glow' },
  moves: true,
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

  it('carries the mood of the page for the music, and what a drawing sounds like', () => {
    expect(scene.version).toBe(4);
    expect(scene.sound).toEqual({ mood: 'curious' });
    const leaf = scene.things.find((t) => t.id === 'leaf');
    expect(leaf?.kind === 'drawing' && leaf.ambience).toBeNull();
    // A drawing that failed is a card, and a card makes no sound.
    const sun = scene.things.find((t) => t.id === 'sun');
    expect(sun?.kind).toBe('words');
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
    expect(scene.effects.some((e) => e.atMs > 8000 && e.do === 'pulse')).toBe(
      true,
    );
    // A pulse that only fills a stretch is marked, so the player keeps it silent.
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
