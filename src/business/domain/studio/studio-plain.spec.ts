import type { SceneScriptDraft } from '../scene-script';
import { explainerSheetOf, type ExplainerSheet } from './studio';
import { recipeFor } from './studio-audience';
import type { SheetProblem } from './studio-check';
import {
  abstractWords,
  measurePlain,
  plainDraft,
  plainExplainer,
  plainWords,
  rideAlong,
  splitLong,
} from './studio-plain';

/** An explainer's sheet from its sentences, a step on a phrase of each. */
function sheetOf(
  says: string[],
  steps: { beat: number; phrase: string }[] = [],
  delivery: SceneScriptDraft['beats'][number]['delivery'] = 'explain',
): ExplainerSheet {
  return explainerSheetOf({
    kind: 'explainer',
    title: 'The water cycle',
    draft: {
      fit: 'good',
      fitReason: null,
      title: 'The water cycle',
      mood: 'curious',
      beats: says.map((say) => ({ say, pause: 'short', delivery })),
      cast: [
        {
          id: 'vapour',
          kind: 'words',
          name: 'water vapour',
          style: 'keyword',
        },
      ],
      steps: steps.map((s) => ({
        ...s,
        layout: 'one',
        show: ['vapour'],
        arrows: null,
        effects: null,
      })),
    },
  });
}

const GRADE_5 = [
  'Have you ever seen a puddle vanish on a sunny day?',
  'The sun warms the water.',
  'The water turns into a gas called water vapour.',
  'It rises up into the sky, where the air is cold.',
  'The vapour cools and turns into tiny drops.',
  'The drops join up and make clouds.',
  'When the drops get big and heavy, they fall as rain.',
  'Then the water flows back to the sea, and it all starts again.',
];

const UNIVERSITY =
  'The hydrological cycle constitutes a continuous circulation of water, which is driven primarily by solar radiation and gravitational forces; evaporation from oceanic surfaces transports substantial quantities of moisture into the atmosphere, and then condensation produces precipitation because atmospheric temperatures decrease with altitude.';

const grade5 = recipeFor({ band: 'primary-upper', said: 'Grade 5' });

describe('a narration measured for its audience', () => {
  it('reads a grade-5 page at about grade 5 or under, with no hard words', () => {
    const m = measurePlain(GRADE_5.join(' '), { terms: ['water vapour'] });
    expect(m.grade).toBeLessThanOrEqual(5);
    expect(m.longest).toBeLessThanOrEqual(grade5.sentence[1]);
    expect(m.hard).toEqual([]);
    expect(m.english).toBe(true);
  });

  it('reads a university paragraph far above it, naming its hard words', () => {
    const m = measurePlain(UNIVERSITY);
    expect(m.grade).toBeGreaterThan(15);
    expect(m.hard).toEqual(
      expect.arrayContaining(['hydrological', 'condensation']),
    );
  });

  it('counts a lesson’s term as one word, and the lesson’s own words as known', () => {
    const bare = measurePlain('Photosynthesis makes sugar from light.');
    const termed = measurePlain('Photosynthesis makes sugar from light.', {
      terms: ['photosynthesis'],
    });
    expect(termed.grade).toBeLessThan(bare.grade);
    expect(
      measurePlain('Chlorophyll traps the light.', {
        material: 'Leaves hold chlorophyll, which traps light.',
      }).hard,
    ).toEqual([]);
  });

  it('knows a narration that is not English', () => {
    expect(
      measurePlain(
        "Le cycle de l'eau commence quand le soleil chauffe la mer et les rivières, puis la vapeur monte dans le ciel.",
      ).english,
    ).toBe(false);
  });
});

describe('a narration put right by code', () => {
  it('splits a long sentence where it joins two thoughts, each part a sentence', () => {
    const { sentences, splits } = splitLong(UNIVERSITY, 13);
    expect(splits.length).toBeGreaterThanOrEqual(3);
    expect(sentences[0]).toBe(
      'The hydrological cycle constitutes a continuous circulation of water.',
    );
    expect(sentences[1]).toMatch(
      /^This is driven primarily by solar radiation/,
    );
    expect(sentences.some((s) => s.startsWith('Then condensation'))).toBe(true);
    // Each part is within the cap now: "because" is left where it is.
    expect(sentences.every((s) => s.split(' ').length <= 13)).toBe(true);
    expect(
      splitLong(
        'Rain falls from the clouds over the hills and the sea because the tiny drops of water grow too heavy.',
        13,
      ).sentences,
    ).toEqual([
      'Rain falls from the clouds over the hills and the sea.',
      'That is because the tiny drops of water grow too heavy.',
    ]);
    // A sentence within the cap is left alone.
    expect(splitLong('The sun warms the water.', 13).sentences).toEqual([
      'The sun warms the water.',
    ]);
  });

  it('never splits into a scrap of a sentence', () => {
    expect(
      splitLong(
        'Plants need light; they make all of their own food from it using the green stuff in their leaves every single day.',
        13,
      ).sentences,
    ).toHaveLength(1);
  });

  it('swaps stiff words for plain ones, but never one the lesson uses', () => {
    expect(
      plainWords('Plants utilise light in order to obtain energy.').text,
    ).toBe('Plants use light to get energy.');
    expect(plainWords('Commence the test.').text).toBe('Start the test.');
    expect(
      plainWords(
        'Proteins facilitate diffusion.',
        'Facilitated diffusion: proteins facilitate the movement.',
      ).text,
    ).toBe('Proteins facilitate diffusion.');
  });

  it('swaps stiff phrases and verbs for the words a friend would use', () => {
    const plain = (text: string) => plainWords(text).text;
    expect(plain('Due to the fact that it is cold, the water freezes.')).toBe(
      'Because it is cold, the water freezes.',
    );
    expect(plain('The cell is able to generate heat.')).toBe(
      'The cell can make heat.',
    );
    expect(plain('However, the leaf converts light into sugar.')).toBe(
      'But the leaf turns light into sugar.',
    );
    expect(plain('The majority of the cells cease beating.')).toBe(
      'Most of the cells stop beating.',
    );
    expect(plain('The cells cease to work.')).toBe('The cells cease to work.');
    expect(plain('The majority of people recover rapidly.')).toBe(
      'Most people recover quickly.',
    );
    expect(plain('Antibodies eliminate germs, thus the fever ends.')).toBe(
      'Antibodies remove germs, so the fever ends.',
    );
    expect(plain('It cools, thus forming clouds.')).toBe(
      'It cools, thus forming clouds.',
    );
    // Only where its grammar is sure: "converts" with nothing turned into
    // is left, as is "once upon a time" and "however" inside a sentence.
    expect(plain('The bank converts your money.')).toBe(
      'The bank converts your money.',
    );
    expect(plain('Once upon a time it depends upon the sun.')).toBe(
      'Once upon a time it depends on the sun.',
    );
    expect(plain('The answer, however, is simple.')).toBe(
      'The answer, however, is simple.',
    );
    // A word the lesson's own material uses is kept.
    expect(
      plainWords(
        'Genetically modified crops grow fast.',
        'Genetically modified organisms',
      ).text,
    ).toBe('Genetically modified crops grow fast.');
  });

  it('names the abstract words no code can swap, unless the lesson uses them', () => {
    expect(
      abstractWords('The mechanism of locomotion is simple.').map(
        (a) => a.word,
      ),
    ).toEqual(['mechanism', 'locomotion']);
    expect(abstractWords('The robot moves the water.')).toEqual([]);
    expect(
      abstractWords(
        'The mechanism has two steps.',
        'Reaction mechanisms in organic chemistry',
      ),
    ).toEqual([]);
    expect(abstractWords('Each component matters.', '', ['component'])).toEqual(
      [],
    );
  });

  it('makes each split part a beat, and keeps each step on its words', () => {
    const sheet = sheetOf(
      ['Water is everywhere.', UNIVERSITY, 'That is the cycle.'],
      [
        { beat: 0, phrase: 'Water' },
        { beat: 1, phrase: 'condensation produces' },
        { beat: 2, phrase: 'the cycle' },
      ],
    );
    const { draft, fixes } = plainDraft(sheet.draft, 13);
    expect(fixes.join(' ')).toMatch(/sentence 2: split at/);
    expect(draft.beats.length).toBeGreaterThan(3);
    const [first, middle, last] = draft.steps;
    expect(first.beat).toBe(0);
    expect(draft.beats[middle.beat].say).toMatch(/condensation produces/);
    expect(draft.beats[last.beat].say).toBe('That is the cycle.');
    // The last part keeps the sentence's pause; the others run on.
    expect(draft.beats[1].pause).toBe('short');
  });

  it('keeps a question on the part that asks it, and a hook on the part that opens', () => {
    const asked = sheetOf(
      [
        'Plants cannot walk to find food, which is why they make their own from light, so where does the food come from?',
      ],
      [],
      'question',
    );
    const { draft } = plainDraft(asked.draft, 13);
    expect(draft.beats.map((b) => b.delivery)).toEqual(['explain', 'question']);
  });
});

describe('an explainer’s scene held to its audience', () => {
  it('passes a grade-5 scene for grade 5, untouched', () => {
    const sheet = sheetOf(GRADE_5);
    const out = plainExplainer(sheet, { recipe: grade5 });
    expect(out.problems).toEqual([]);
    expect(out.fixes).toEqual([]);
    expect(out.sheet).toBe(sheet);
  });

  it('splits a university paragraph given to grade 5, and still sends it back with the rest', () => {
    const out = plainExplainer(sheetOf([UNIVERSITY]), { recipe: grade5 });
    expect(out.fixes.join(' ')).toMatch(/split at/);
    expect(out.sheet.draft.beats.length).toBeGreaterThan(3);
    expect(out.problems).toHaveLength(1);
    expect(out.problems[0]).toMatchObject({ rule: 'plain', level: 'warning' });
    expect(out.problems[0].message).toMatch(
      /reads at about grade \d+; for these learners keep it near grade 5/,
    );
    // A plain university page is fine for a university student new to it.
    const pressure = sheetOf([
      'Blood pressure is the force of blood pushing on the walls of the arteries.',
      'It is written as two numbers.',
      'The systolic pressure is the peak, when the heart contracts and pushes blood out.',
      'The diastolic pressure is the lowest point, when the heart relaxes between beats.',
    ]);
    const terms = ['systolic pressure', 'diastolic pressure', 'blood pressure'];
    expect(
      plainExplainer(pressure, {
        recipe: recipeFor({ band: 'university', prior: 'new' }),
        terms,
      }).problems,
    ).toEqual([]);
  });

  it('asks for everyday words in place of abstract ones, riding along with the rest', () => {
    const robot = sheetOf([
      'This robot is smaller than a penny.',
      'Its mechanism of locomotion is strange.',
      'Light hits one part of it.',
      'That part pushes the water.',
    ]);
    const out = plainExplainer(robot, { recipe: grade5 });
    expect(out.problems).toEqual([
      expect.objectContaining({ rule: 'plain', level: 'warning' }),
    ]);
    expect(out.problems[0].message).toMatch(
      /"mechanism" \(how it works\), "locomotion" \(moving\)/,
    );
    // Over its grade too: one problem, the abstract words named first.
    const hard = plainExplainer(sheetOf([UNIVERSITY]), { recipe: grade5 });
    expect(hard.problems).toHaveLength(1);
    expect(hard.problems[0].message).toMatch(
      /in place of "constitutes" \(make up\)/,
    );
  });

  it('holds a narration in another language to its sentences only', () => {
    const french =
      "Le cycle de l'eau commence quand le soleil chauffe la mer et les rivières du monde entier pendant toute la journée, puis la vapeur monte très haut dans le ciel froid au-dessus des montagnes.";
    const out = plainExplainer(sheetOf([french]), { recipe: grade5 });
    expect(out.problems.map((p) => p.message)).toEqual([
      expect.stringMatching(/^A sentence runs \d+ words/),
    ]);
  });

  it('asks for the check for understanding the recipe wanted', () => {
    const out = plainExplainer(sheetOf(GRADE_5), {
      recipe: grade5,
      check: true,
    });
    expect(out.problems.map((p) => p.message)).toEqual([
      expect.stringMatching(/Ask the viewer one question/),
    ]);
    const asked = sheetOf(GRADE_5);
    asked.draft.beats[0].delivery = 'question';
    expect(
      plainExplainer(asked, { recipe: grade5, check: true }).problems,
    ).toEqual([]);
  });
});

describe('plain words on the send-back', () => {
  const plain: SheetProblem = {
    rule: 'plain',
    message: 'Too hard.',
    beat: null,
    level: 'warning',
  };
  const quiet: SheetProblem = {
    rule: 'storyboard',
    message: 'Nothing moves.',
    beat: null,
    level: 'warning',
  };

  it('ride along on a send-back that is going anyway, and never send one alone', () => {
    expect(rideAlong([quiet], [plain])).toEqual([quiet, plain]);
    expect(rideAlong([], [plain])).toEqual([]);
  });
});
