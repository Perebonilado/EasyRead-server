import { drawByCode } from './scene-code';
import { NAMED_EQUATIONS, exactPictureIn } from './scene-exact';
import { TEXT_FLOOR, textFloorOf } from './scene-exact-style';
import { renderMath } from './scene-math';
import { mendScript, type SceneScriptDraft } from './scene-script';
import {
  checkExplainer,
  repairExplainer,
  sentBackFor,
} from './studio/studio-check';
import type { ExplainerSheet } from './studio/studio';
import {
  EXACT_FILM,
  EXACT_SCENES,
  composeExactPictures,
} from './studio/__fixtures__/exact-pictures';

type Cast = SceneScriptDraft['cast'][number];

const NONE = {
  brief: null,
  motion: null,
  parts: null,
  states: null,
  shape: null,
  value: null,
  style: null,
  sound: null,
  lines: null,
  plot: null,
  quote: null,
  phrases: null,
  ref: null,
  state: null,
  timeline: null,
  chart: null,
} as const;

/** A one-sentence page showing one thing, and pointing at a part of it. */
const draftWith = (thing: Cast, point?: string): SceneScriptDraft => ({
  fit: 'good',
  fitReason: null,
  title: 'A page',
  mood: 'calm',
  beats: [
    {
      say: 'Here it is, and here is the part that matters most to us.',
      pause: 'short',
      delivery: 'explain',
      speaker: null,
    },
  ],
  cast: [thing],
  steps: [
    {
      beat: 0,
      phrase: 'Here it is',
      layout: 'one',
      show: [thing.id],
      arrows: null,
      effects: null,
    },
    ...(point
      ? [
          {
            beat: 0,
            phrase: 'the part that matters',
            layout: null,
            show: null,
            arrows: null,
            effects: [{ target: point, do: 'point' as const }],
          },
        ]
      : []),
  ],
});

const drawing = (id: string, name: string, brief: string): Cast => ({
  ...NONE,
  id,
  kind: 'drawing',
  name,
  brief,
  parts: [],
  states: [],
  shape: 'square',
});

describe('exact pictures: a drawing that is one, caught', () => {
  it.each([
    ['Flag of Kenya', 'The national flag of Kenya', 'flag', 'ke'],
    [
      'Flags',
      'The flags of Brazil, Japan and Nigeria side by side',
      'flag',
      'br,jp,ng',
    ],
    ['Ghana flag', '', 'flag', 'gh'],
    ['Glucose molecule', 'its skeletal structure', 'molecule', 'glucose'],
    ['Structure of caffeine', '', 'molecule', 'caffeine'],
    [
      'Water molecule',
      'two hydrogen atoms bonded to an oxygen atom',
      'molecule',
      'water',
    ],
    [
      'The photosynthesis equation',
      '6CO2 + 6H2O -> C6H12O6 + 6O2',
      'equation',
      'photosynthesis',
    ],
    ['E = mc²', "Einstein's famous equation", 'equation', 'mass-energy'],
    ['Momentum equation', 'p = mv, written large', 'equation', '-'],
    [
      'Water cycle diagram',
      'evaporation -> condensation -> precipitation -> collection, arrows in a loop',
      'flow',
      'Evaporation,Condensation,Precipitation,Collection',
    ],
    ['Food chain', 'grass → zebra → lion', 'flow', 'Grass,Zebra,Lion'],
    ['Life cycle of a frog', 'a frog life cycle drawing', 'flow', '-'],
  ])('%s: %s', (name, brief, kind, what) => {
    const ask = exactPictureIn(name, brief);
    expect(ask?.kind).toBe(kind);
    const found =
      ask?.flags?.map((f) => f.code).join(',') ??
      ask?.molecule?.key ??
      ask?.equation?.key ??
      ask?.flow?.nodes?.map((n) => n.label).join(',') ??
      '-';
    expect(found).toBe(what);
  });

  it.each([
    ['Waving person', 'a person waving a red flag'],
    [
      'Oxygen molecules in the blood',
      'red blood cells carrying oxygen molecules',
    ],
    ['Antibody molecule', 'a Y-shaped antibody'],
    ['Leaf structure', 'cross section of a leaf showing water moving'],
    ['Baby formula', 'a tin of infant formula'],
    ['Rain cloud', 'a grey rain cloud'],
    ['A balance', 'a set of scales, level'],
  ])('%s is the artist’s', (name, brief) => {
    expect(exactPictureIn(name, brief)).toBeNull();
  });

  it('sets every equation it knows by name, with terms to point at', () => {
    for (const one of NAMED_EQUATIONS) {
      const set = renderMath(
        one.latex.map((latex) => ({ latex, check: null })),
      );
      expect([one.key, Object.keys(set.parts).length > 0]).toEqual([
        one.key,
        true,
      ]);
      expect(set.svg.length).toBeLessThan(50 * 1024);
    }
  });
});

describe('exact pictures: mended into their kinds', () => {
  it('draws a flag asked of the artist by code, pointed at by country', () => {
    const { script, mended } = mendScript(
      draftWith(
        drawing('kenya', 'Flag of Kenya', 'The flag of Kenya'),
        'kenya.Kenya',
      ),
    );
    expect(script.cast[0]).toMatchObject({
      kind: 'flag',
      flags: [{ code: 'ke', said: 'Kenya' }],
    });
    expect(mended.join(' ')).toContain('drawn by code, not the artist');
    expect(script.steps.flatMap((s) => s.effects)).toEqual([
      { target: 'kenya', part: 'Kenya', do: 'point' },
    ]);
  });

  it('draws a molecule asked of the artist by code, and an equation it knows by name', () => {
    const sugar = mendScript(
      draftWith(
        drawing('sugar', 'Glucose molecule', 'its ring structure'),
        'sugar.oxygen',
      ),
    ).script;
    expect(sugar.cast[0]).toMatchObject({
      kind: 'molecule',
      molecule: { key: 'glucose' },
    });
    expect(sugar.steps.flatMap((s) => s.effects)).toEqual([
      { target: 'sugar', part: 'oxygen', do: 'point' },
    ]);
    const photo = mendScript(
      draftWith(drawing('eq', 'The photosynthesis equation', 'in symbols')),
    ).script.cast[0];
    expect(photo.kind).toBe('math');
    expect(photo.kind === 'math' && photo.lines[0].latex).toContain(
      '\\ce{C6H12O6}',
    );
  });

  it('reads the new kinds as the writer gives them, and sets what it cannot draw as words', () => {
    const flag = mendScript(
      draftWith({
        ...NONE,
        id: 'f',
        kind: 'flag',
        name: 'Flags',
        flag: ['Peru', 'Narnia'],
      }),
    );
    expect(flag.script.cast[0]).toMatchObject({
      kind: 'flag',
      flags: [{ code: 'pe' }],
    });
    expect(flag.mended).toContain('f: no flag for "Narnia"; left off');
    const none = mendScript(
      draftWith({
        ...NONE,
        id: 'f',
        kind: 'flag',
        name: 'Flags',
        flag: ['Narnia'],
      }),
    );
    expect(none.script.cast[0]).toMatchObject({ kind: 'words', text: 'Flags' });
    // An unknown molecule is its name in type, and said in the log; never a made-up structure.
    const odd = mendScript(
      draftWith({
        ...NONE,
        id: 'm',
        kind: 'molecule',
        name: 'Haemoglobin',
        molecule: 'haemoglobin',
      }),
    );
    expect(odd.script.cast[0]).toMatchObject({
      kind: 'words',
      text: 'Haemoglobin',
    });
    expect(odd.mended.join(' ')).toContain('no molecule code knows');
    expect(odd.problems.filter((p) => /"m"|molecule/i.test(p))).toEqual([]);
    const eq = mendScript(
      draftWith(
        {
          ...NONE,
          id: 'q',
          kind: 'equation',
          name: 'Factorising',
          equation: ['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0'],
        },
        'q.line 2',
      ),
    );
    expect(eq.script.cast[0]).toMatchObject({ kind: 'math', lines: [{}, {}] });
    expect(eq.problems.filter((p) => /"q"|equation|line/i.test(p))).toEqual([]);
    const flow = mendScript(
      draftWith(
        {
          ...NONE,
          id: 'w',
          kind: 'flow',
          name: 'The water cycle',
          flow: {
            direction: 'cycle',
            nodes: ['Evaporation', 'Condensation', 'Rain'].map((label) => ({
              label,
              kind: null,
            })),
            edges: null,
          },
        },
        'w.Condensation',
      ),
    );
    expect(flow.script.cast[0]).toMatchObject({
      kind: 'flow',
      flow: { direction: 'cycle' },
    });
    expect(flow.script.steps.flatMap((s) => s.effects)).toEqual([
      { target: 'w', part: 'Condensation', do: 'point' },
    ]);
    const thin = mendScript(
      draftWith({
        ...NONE,
        id: 'w',
        kind: 'flow',
        name: 'Steps',
        flow: {
          direction: null,
          nodes: [{ label: 'One', kind: null }],
          edges: null,
        },
      }),
    );
    expect(thin.problems[0]).toMatch(/^The flow "w" needs at least two steps/);
  });

  it('draws for its audience: a young one larger', () => {
    expect(textFloorOf('early')).toBeGreaterThan(TEXT_FLOOR);
    const young = mendScript(
      draftWith({
        ...NONE,
        id: 'f',
        kind: 'flag',
        name: 'Flags',
        flag: ['India', 'Chile'],
      }),
      { stage: 'early' },
    ).script.cast[0];
    expect(young).toMatchObject({ kind: 'flag', text: textFloorOf('early') });
  });
});

describe('exact pictures: the check', () => {
  const options = { teach: null, stage: null, maths: true, planned: null };
  const sheet = (thing: Cast): ExplainerSheet => ({
    kind: 'explainer',
    title: 'A page',
    transition: 'cut',
    draft: draftWith(thing),
  });

  it('sends a flag, an equation, a molecule or a flow asked of the artist back once, to be written as its kind', () => {
    for (const [thing, kind] of [
      [drawing('a', 'Flag of Kenya', 'its flag'), 'flag'],
      [drawing('b', 'Momentum equation', 'p = mv'), 'equation'],
      [drawing('c', 'Structure of caffeine', ''), 'molecule'],
      [drawing('d', 'Life cycle of a frog', 'drawn as a circle'), 'flow'],
    ] as const) {
      const { problems } = checkExplainer(sheet(thing), options);
      const exact = problems.filter((p) => p.rule === 'exact');
      expect(exact).toHaveLength(1);
      expect(exact[0].message).toContain(`kind "${kind}"`);
      expect(exact[0].level).toBe('warning');
      expect(sentBackFor(problems)).toContainEqual(exact[0]);
    }
    const plain = checkExplainer(
      sheet(drawing('e', 'A heart', 'a human heart')),
      options,
    );
    expect(plain.problems.filter((p) => p.rule === 'exact')).toEqual([]);
  });

  it('sets a flow the check turns down in type', () => {
    const thin = sheet({
      ...NONE,
      id: 'w',
      kind: 'flow',
      name: 'Steps',
      flow: {
        direction: null,
        nodes: [{ label: 'One', kind: null }],
        edges: null,
      },
    });
    expect(repairExplainer(thin, options).draft.cast[0]).toMatchObject({
      kind: 'words',
      flow: null,
    });
  });
});

describe('exact pictures: drawn by code for the stage', () => {
  it('draws each kind as a drawing the stage can point into, in either shape', async () => {
    for (const one of EXACT_FILM.scenes) {
      const { script } = mendScript(one.sheet.draft, {
        formats: ['explainer', 'maths'],
      });
      for (const thing of script.cast)
        for (const shape of ['wide', 'tall'] as const) {
          if (!['flag', 'flow', 'molecule', 'math'].includes(thing.kind))
            continue;
          const drawn = await drawByCode(thing as never, shape);
          expect(drawn.svg.startsWith('<svg')).toBe(true);
          expect(drawn.aspect).toBeGreaterThan(0.39);
          for (const id of Object.values(drawn.parts))
            expect(drawn.svg).toContain(`id="${id}"`);
        }
    }
  }, 60_000);

  it('composes the piece in both shapes with nothing left to the artist', async () => {
    for (const shape of ['wide', 'tall'] as const) {
      const film = await composeExactPictures(shape);
      expect(film).toHaveLength(EXACT_SCENES.length);
      for (const one of film) {
        const drawn = one.scene.things.filter((t) => t.kind === 'drawing');
        expect(drawn.length).toBeGreaterThan(0);
        for (const thing of drawn)
          expect([thing.id, thing.kind === 'drawing' && thing.source]).toEqual([
            thing.id,
            expect.stringMatching(/^(flag|flow|molecule|math)$/),
          ]);
        expect(one.scene.shape ?? 'wide').toBe(shape);
      }
    }
  }, 60_000);
});
