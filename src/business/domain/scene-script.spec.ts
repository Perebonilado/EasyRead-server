import {
  fitLayout,
  mendScript,
  phraseAt,
  quietStretches,
  type SceneScriptDraft,
} from './scene-script';

const thing = (
  id: string,
  kind: 'drawing' | 'stat' | 'words',
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
  beats: [
    { say: 'Plants make their own food.', pause: 'short' },
    {
      say: 'To do it, they need sunlight, water and carbon dioxide.',
      pause: 'short',
    },
    {
      say: 'All three meet inside the leaf, in tiny parts called chloroplasts.',
      pause: 'long',
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
});
