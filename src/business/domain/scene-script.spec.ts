import {
  fitLayout,
  mendScript,
  phraseAt,
  quietStretches,
  type SceneScriptDraft,
} from './scene-script';

const thing = (
  id: string,
  kind: SceneScriptDraft['cast'][number]['kind'],
  extra: Partial<SceneScriptDraft['cast'][number]> = {},
): SceneScriptDraft['cast'][number] => ({
  id,
  kind,
  name: id,
  brief: kind === 'drawing' ? `a ${id}` : null,
  motion: kind === 'drawing' ? 'it sways' : null,
  parts: null,
  states: null,
  shape: null,
  value: kind === 'stat' ? '70%' : null,
  style: null,
  sound: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  ref: null,
  state: null,
  ...extra,
});

const step = (
  beat: number,
  phrase: string,
  extra: Partial<SceneScriptDraft['steps'][number]> = {},
): SceneScriptDraft['steps'][number] => ({
  beat,
  phrase,
  layout: null,
  show: null,
  arrows: null,
  effects: null,
  ...extra,
});

const draft = (): SceneScriptDraft => ({
  fit: 'good',
  fitReason: null,
  title: 'How plants make food',
  mood: 'curious',
  beats: [
    { say: 'Plants make their own food.', pause: 'short', delivery: 'hook' },
    {
      say: 'To do it, they need sunlight, water and carbon dioxide.',
      pause: 'short',
      delivery: 'explain',
    },
    {
      say: 'All three meet inside the leaf, in tiny parts called chloroplasts.',
      pause: 'long',
      delivery: 'key',
    },
  ],
  cast: [
    thing('Leaf', 'drawing', {
      parts: [
        { name: 'chloroplasts', label: true },
        { name: 'Chloroplasts', label: true },
      ],
      states: [{ name: 'glowing', look: 'bright green' }],
    }),
    thing('sun', 'drawing'),
    thing('co2', 'stat', { value: null }),
  ],
  steps: [
    step(0, 'Plants make', { layout: 'row', show: ['Leaf'] }),
    step(1, 'sunlight', {
      layout: 'hub',
      show: ['leaf', 'sun', 'nobody'],
      arrows: [
        { from: 'sun', to: 'leaf', label: 'light', flow: true },
        { from: 'sun', to: 'ghost', label: null, flow: false },
      ],
    }),
    step(1, 'CHLOROPLASTS,', {
      effects: [{ target: 'leaf.chloro-plasts', do: 'point' }],
    }),
  ],
});

describe('the writer’s storyboard, mended', () => {
  it('finds a phrase whatever its case and punctuation, and a near miss', () => {
    expect(
      phraseAt(
        'All three meet inside the leaf, in tiny parts called chloroplasts.',
        'called chloroplasts',
      ),
    ).toBe(9);
    expect(phraseAt('Plants make their own food.', 'OWN FOOD')).toBe(3);
    expect(phraseAt('the chloroplasts trap light', 'chloroplast traps')).toBe(
      1,
    );
    expect(phraseAt('Plants make their own food.', 'the moon')).toBe(-1);
  });

  it('holds a layout only as many things as it takes', () => {
    expect(fitLayout('one', 3)).toBe('row');
    expect(fitLayout('hub', 2)).toBe('row');
    expect(fitLayout('compare', 2)).toBe('compare');
    expect(fitLayout('row', 1)).toBe('one');
  });

  it('makes ids safe, drops what is not in the cast, and moves a phrase to the sentence it is in', () => {
    const { script, problems, mended } = mendScript(draft());
    expect(problems).toEqual([]);
    const [first, second, third] = script.steps;
    expect(first.stage).toEqual({ layout: 'one', show: ['leaf'], arrows: [] });
    // Two things left once "nobody" is dropped: a hub cannot hold two.
    expect(second.stage?.layout).toBe('row');
    expect(second.stage?.show).toEqual(['leaf', 'sun']);
    expect(second.stage?.arrows).toEqual([
      { from: 'sun', to: 'leaf', label: 'light', flow: true },
    ]);
    // The phrase is in the third sentence, not the second.
    expect(third.at.beat).toBe(2);
    expect(third.word).toBe(10);
    expect(third.effects).toEqual([
      { target: 'leaf', part: 'chloroplasts', do: 'point' },
    ]);
    expect(mended.join(' ')).toMatch(/nobody/);
    // One part of a name, however it was capitalised.
    const leaf = script.cast.find((t) => t.id === 'leaf');
    expect(leaf?.kind === 'drawing' && leaf.parts).toHaveLength(1);
    // A number with no value is set as words, and a thing never on stage is dropped.
    expect(script.cast.map((t) => t.id)).toEqual(['leaf', 'sun']);
  });

  it('asks for a redo when the phrases are not in the narration or nothing is ever shown', () => {
    const bad = draft();
    bad.steps = bad.steps.map((s) => ({
      ...s,
      phrase: 'words that are nowhere',
    }));
    expect(mendScript(bad).problems.join(' ')).toMatch(
      /not in their sentences/,
    );
    const empty = draft();
    empty.steps = [
      step(0, 'Plants', { effects: [{ target: 'leaf', do: 'pulse' }] }),
    ];
    expect(mendScript(empty).problems.join(' ')).toMatch(
      /never puts anything on the stage/,
    );
  });

  it('keeps an unfit page as the writer judged it', () => {
    const poor = {
      ...draft(),
      fit: 'poor' as const,
      fitReason: 'An index.',
      steps: [],
    };
    const { script, problems } = mendScript(poor);
    expect(script.fit).toBe('poor');
    expect(problems).toEqual([]);
  });

  it('counts the words that pass with nothing changing', () => {
    const { script } = mendScript(draft());
    expect(quietStretches(script, 5).length).toBeGreaterThan(0);
    expect(quietStretches(script, 50)).toEqual([]);
  });

  it('keeps how each sentence is said and what a drawing sounds like, and mends what is off the list', () => {
    const odd = draft();
    odd.mood = 'grim' as never;
    odd.beats[1].delivery = 'shout' as never;
    odd.cast[0].sound = 'heartbeat';
    odd.cast[1].sound = 'trumpet' as never;
    const { script } = mendScript(odd);
    expect(script.mood).toBe('curious');
    expect(script.beats.map((b) => b.delivery)).toEqual([
      'hook',
      'explain',
      'key',
    ]);
    const [leaf, sun] = script.cast;
    expect(leaf.kind === 'drawing' && leaf.sound).toBe('heartbeat');
    expect(sun.kind === 'drawing' && sun.sound).toBeNull();
  });

  it("checks a working's sums, a graph's function and a quotation's words, and points at their parts", () => {
    const d = draft();
    d.cast.push(
      thing('work', 'math', {
        lines: [
          { latex: 'M = \\term{image}{h_i} / h_o', check: null },
          { latex: '= 50/0.1', check: '50/0.1 = 5000' },
        ],
      }),
      thing('graph', 'plot', {
        plot: {
          fn: 'x^2',
          xFrom: -2,
          xTo: 2,
          yFrom: null,
          yTo: null,
          xLabel: null,
          yLabel: null,
          points: [{ x: 1, name: 'one' }],
        },
      }),
      thing('poem', 'quote', {
        quote: 'Plants make their own food.',
        phrases: [
          { name: 'own', phrase: 'their own food', note: 'made at home' },
        ],
      }),
    );
    d.steps.push(
      step(2, 'called chloroplasts', {
        layout: 'stack',
        show: ['work', 'graph', 'poem'],
        effects: [
          { target: 'work.image', do: 'point' },
          { target: 'work.line 2', do: 'show' },
          { target: 'graph.one', do: 'point' },
          { target: 'poem.own', do: 'point' },
        ],
      }),
    );
    const material = d.beats.map((b) => b.say).join(' ');
    const { script, problems } = mendScript(d, { material });
    expect(problems.join(' ')).toMatch(/does not add up: 50\/0\.1 = 5000/);
    const last = script.steps[script.steps.length - 1];
    expect(last.stage?.layout).toBe('stack');
    expect(last.effects).toEqual([
      { target: 'work', part: 'image', do: 'point' },
      { target: 'work', part: 'line 2', do: 'show' },
      { target: 'graph', part: 'one', do: 'point' },
      { target: 'poem', part: 'own', do: 'point' },
    ]);
    // A book that may only explain: all three are set in type.
    const plain = mendScript(d, { material, formats: ['explainer'] });
    expect(
      plain.script.cast.filter((t) => t.kind === 'words').map((t) => t.id),
    ).toEqual(expect.arrayContaining(['work', 'graph', 'poem']));
    // A quotation that is not the page's own words goes back.
    const off = draft();
    off.cast.push(thing('poem', 'quote', { quote: 'Trees are tall.' }));
    off.steps.push(
      step(0, 'Plants make', { layout: 'row', show: ['leaf', 'poem'] }),
    );
    expect(mendScript(off, { material }).problems.join(' ')).toMatch(
      /not the page's own words/,
    );
  });

  it('reads a stage restated as it stands as its effects only', () => {
    const restated = draft();
    restated.steps = [
      step(0, 'Plants make', { layout: 'one', show: ['leaf'] }),
      step(1, 'sunlight', {
        layout: 'one',
        show: ['leaf'],
        effects: [{ target: 'leaf', do: 'pulse' }],
      }),
    ];
    const { script, mended } = mendScript(restated);
    expect(script.steps[1].stage).toBeNull();
    expect(script.steps[1].effects).toHaveLength(1);
    expect(mended.join(' ')).toMatch(/restated/);
  });
});

describe('a story told with its own characters', () => {
  const characters = [
    { id: 'mira', name: 'Mira', aliases: ['Mira Arden'] },
    { id: 'ember', name: 'Ember', aliases: ['the fox'] },
  ];
  const story = (): SceneScriptDraft => ({
    fit: 'good',
    fitReason: null,
    title: 'The lantern goes out',
    mood: 'serious',
    beats: [
      {
        say: 'Mira stands at the end of the quay.',
        pause: 'short',
        delivery: 'hook',
      },
      {
        say: 'A fox slips out of the dark and grins at her.',
        pause: 'short',
        delivery: 'explain',
      },
      { say: 'Mira gasps, then laughs.', pause: 'long', delivery: 'key' },
    ],
    cast: [
      thing('girl', 'character', { ref: 'mira', state: 'sad' }),
      // The writer's own words for the fox, and the same girl again.
      thing('fox', 'character', {
        ref: null,
        name: 'The Fox',
        state: 'grinning' as never,
      }),
      thing('mira-again', 'character', { ref: 'Mira Arden' }),
      thing('ghost', 'character', { ref: 'nobody' }),
      thing('quay', 'drawing'),
    ],
    steps: [
      step(0, 'Mira stands', { layout: 'one', show: ['girl'] }),
      step(1, 'A fox', {
        layout: 'row',
        show: ['fox', 'mira-again', 'ghost'],
        effects: [{ target: 'fox.head', do: 'point' }],
      }),
      step(2, 'Mira gasps', {
        effects: [{ target: 'mira-again.surprised', do: 'show' }],
      }),
      step(2, 'then laughs', {
        effects: [{ target: 'girl.happy', do: 'show' }],
      }),
    ],
  });

  it("shows each character as the story's own, once, by id, name or alias", () => {
    const { script, mended } = mendScript(story(), { characters });
    const people = script.cast.filter((t) => t.kind === 'character');
    expect(people).toEqual([
      {
        id: 'girl',
        kind: 'character',
        ref: 'mira',
        name: 'Mira',
        state: 'sad',
        met: 0,
        intro: [],
      },
      {
        id: 'fox',
        kind: 'character',
        ref: 'ember',
        name: 'Ember',
        state: null,
        met: 0,
        intro: [],
      },
    ]);
    // Someone the story does not have is set in type.
    expect(script.cast.find((t) => t.id === 'ghost')).toMatchObject({
      kind: 'words',
    });
    expect(mended.join(' ')).toContain(
      '"nobody" is not one of the story\'s characters',
    );
    // The same girl twice is the one figure, wherever the storyboard names her.
    expect(script.steps[1].stage!.show).toEqual(['fox', 'girl', 'ghost']);
    expect(script.steps[2].effects).toEqual([
      { target: 'girl', part: 'surprised', do: 'show' },
    ]);
    expect(script.steps[1].effects).toEqual([
      { target: 'fox', part: 'head', do: 'point' },
    ]);
  });

  it('sets characters in type in a book that is no story', () => {
    const { script } = mendScript(story());
    expect(script.cast.some((t) => t.kind === 'character')).toBe(false);
  });
});
