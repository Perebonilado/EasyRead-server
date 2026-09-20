import { directByRules, fit, revealsFor, stepDown } from './visual-direct';
import {
  assembleTutorial,
  layoutTutorial,
  tidyTutorial,
  tutorialProblems,
  type VisualNarration,
} from './visual-cards';
import {
  STAGES,
  layoutProblems,
  materialPool,
  repairVisual,
  visualProblems,
} from './visual';

/** A hand-marked narration of a page on the kidney, the way the narrator now writes it. */
const MATERIAL = [
  'The kidney filters the blood. Each kidney holds about a million nephrons.',
  'A nephron has a glomerulus, a tubule and a collecting duct.',
  'Blood enters, water and salts are taken back, and urine leaves.',
  'The cow and the goat drink from the river by the village clinic.',
  'Filtration is the first step. Reabsorption is the second. Secretion is the third.',
  'The cortex is the outer layer and the medulla is the inner layer.',
].join(' ');

const NARRATION: VisualNarration = {
  title: 'How the kidney cleans the blood',
  fit: 'good',
  fitReason: null,
  sentences: [
    'Every drop of your blood passes through your kidneys many times a day, and this page shows how.',
    'The kidney is the organ that filters the blood and keeps what the body needs.',
    'Inside each kidney sit about a million tiny units called nephrons.',
    'A nephron has three parts: a glomerulus, a tubule and a collecting duct.',
    'Blood enters, water and salts are taken back, and urine leaves.',
    'Think of it in three steps: filtration first, reabsorption second, and secretion third.',
    'Filtration is the word for the first step, where the blood is sieved.',
    'The cortex is the outer layer, and the medulla is the inner layer.',
    'So the kidney keeps you alive by cleaning your blood, every day.',
  ],
  moments: [
    {
      from: 0,
      to: 0,
      intent: 'why the kidney matters',
      show: { kind: 'none', heading: 'The kidney' },
    },
    {
      from: 1,
      to: 1,
      intent: 'the kidney filters the blood',
      show: { kind: 'thing', names: ['kidney'] },
    },
    {
      from: 2,
      to: 2,
      intent: 'a million nephrons in each kidney',
      show: {
        kind: 'figure',
        figure: '1,000,000',
        caption: 'nephrons in each kidney',
      },
    },
    {
      from: 3,
      to: 3,
      intent: 'the three parts of a nephron',
      show: {
        kind: 'things',
        names: ['glomerulus', 'tubule', 'collecting duct'],
      },
    },
    {
      from: 4,
      to: 4,
      intent: 'blood in, urine out',
      show: {
        kind: 'line',
        text: 'Blood enters, water and salts are taken back, and urine leaves.',
      },
    },
    {
      from: 5,
      to: 5,
      intent: 'three steps in order',
      show: {
        kind: 'steps',
        names: ['filtration', 'reabsorption', 'secretion'],
      },
    },
    {
      from: 6,
      to: 6,
      intent: 'what filtration means',
      show: {
        kind: 'term',
        term: 'filtration',
        text: 'The first step, where the blood is sieved.',
      },
    },
    {
      from: 7,
      to: 7,
      intent: 'the cortex outside, the medulla inside',
      show: { kind: 'layers', names: ['medulla', 'cortex'] },
    },
    {
      from: 8,
      to: 8,
      intent: 'the kidney keeps you alive by cleaning your blood',
      show: { kind: 'none' },
    },
  ],
};

describe('directByRules', () => {
  const decisions = directByRules(NARRATION, { field: 'medicine' });
  const byIndex = new Map(decisions.moments.map((d) => [d.index, d]));

  it("fills every card from its mark, in the page's words", () => {
    expect(byIndex.get(0)).toMatchObject({
      card: 'title',
      heading: 'The kidney',
    });
    expect(byIndex.get(1)).toMatchObject({ card: 'picture', name: 'kidney' });
    expect(byIndex.get(2)).toMatchObject({
      card: 'number',
      figure: '1,000,000',
    });
    expect(byIndex.get(3)?.card).toBe('chips');
    expect(byIndex.get(3)?.items?.map((i) => i.text)).toEqual([
      'glomerulus',
      'tubule',
      'collecting duct',
    ]);
    expect(byIndex.get(4)).toMatchObject({ card: 'statement' });
    expect(byIndex.get(5)?.card).toBe('flow');
    expect(byIndex.get(6)).toMatchObject({ card: 'term', term: 'filtration' });
    expect(byIndex.get(7)).toMatchObject({
      card: 'rings',
      layers: ['medulla', 'cortex'],
    });
    // The closing line: its own sentence in big type, a title never twice.
    expect(byIndex.get(8)?.card).toBe('statement');
  });

  it('reveals the steps on the sentence that names them, in order', () => {
    const reveals = byIndex.get(5)?.reveals ?? [];
    expect(reveals.map((r) => r.part)).toEqual([0, 1, 2]);
    expect(reveals.every((r) => r.sentence === 5)).toBe(true);
  });

  it('passes the checks and lays out without a fault', () => {
    const tutorial = tidyTutorial(assembleTutorial(NARRATION, decisions));
    const pool = materialPool(MATERIAL);
    const problems = tutorialProblems(tutorial, pool, 90, MATERIAL);
    expect(problems).toEqual([]);
    const script = repairVisual(
      layoutTutorial(tutorial, STAGES.box),
      STAGES.box,
    );
    expect([
      ...visualProblems(script, null),
      ...layoutProblems(script, STAGES.box),
    ]).toEqual([]);
  });

  it('keeps the same thing on the stage across neighbouring moments', () => {
    const twice: VisualNarration = {
      ...NARRATION,
      moments: [
        NARRATION.moments[0],
        {
          from: 1,
          to: 1,
          intent: 'the kidney filters',
          show: { kind: 'thing', names: ['kidney'] },
        },
        {
          from: 2,
          to: 8,
          intent: 'the kidney again',
          show: { kind: 'thing', names: ['kidney'] },
        },
      ],
    };
    const out = directByRules(twice, { field: 'medicine' });
    expect(out.moments[2]).toMatchObject({
      card: 'picture',
      picture: out.moments[1].picture,
      continues: true,
    });
  });

  it('never leaves two statements in a row, and steps a refused card down to its words', () => {
    const plainish: VisualNarration = {
      ...NARRATION,
      moments: [
        NARRATION.moments[0],
        { from: 1, to: 2, intent: 'the kidney filters the blood' },
        { from: 3, to: 8, intent: 'a nephron has parts' },
      ],
    };
    const out = directByRules(plainish);
    expect(out.moments.map((d) => d.card)).toEqual([
      'title',
      'statement',
      'title',
    ]);
    const stepped = stepDown(decisions, [3], NARRATION);
    expect(stepped.moments.find((d) => d.index === 3)?.card).toBe('statement');
    const dropped = stepDown(stepped, [3], NARRATION);
    expect(dropped.moments.find((d) => d.index === 3)).toBeUndefined();
  });

  it('cuts at a word, never mid-word, and gives up rather than cut short', () => {
    expect(fit('the collecting duct of the nephron', 22)).toBe(
      'the collecting duct of',
    );
    expect(fit('supercalifragilistic', 10)).toBeNull();
    expect(fit('one two three four five six', 100, 5)).toBe(
      'one two three four five',
    );
  });

  it('gives no reveals when the parts are not named in order', () => {
    const backwards = revealsFor(
      { ...NARRATION, sentences: ['secretion then filtration.'] },
      { from: 0, to: 0 },
      ['filtration', 'secretion'],
    );
    expect(backwards).toBeUndefined();
  });
});
