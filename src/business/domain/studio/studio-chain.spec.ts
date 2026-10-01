import type { SceneDelivery } from '../scene-script';
import {
  carriesOn,
  chainProblem,
  measureChain,
  opensWithLink,
} from './studio-chain';

type Beat = { say: string; delivery: SceneDelivery; pause: 'short' | 'long' };

const beats = (
  says: string[],
  shape: Partial<Record<number, Partial<Beat>>> = {},
): Beat[] =>
  says.map((say, i) => ({
    say,
    delivery: 'explain',
    pause: 'short',
    ...shape[i],
  }));

/** Richard's reference, as a scene: one chain of cause and effect. */
const ROBOT = beats(
  [
    'This is a robot, and here it is on a penny.',
    'But the way it moves is crazy.',
    'It can wiggle all on its own, because they fit a computer on there.',
    'And what happens is you send light to this part.',
    'That tells the robot to make an electric field.',
    'The field pushes the charged bits in the water.',
    'So the robot is not really moving itself.',
    'It is moving the water around it.',
  ],
  { 0: { delivery: 'hook' }, 6: { delivery: 'key' } },
);

/** A vaccine explained as a chain: each line picks up the last. */
const VACCINE = beats(
  [
    'A vaccine is a tiny bit of training for your body.',
    'Inside the shot is a harmless copy of a germ.',
    'Your white blood cells find the copy and study its shape.',
    'Those cells then build antibodies that fit that shape exactly.',
    'The antibodies stick to the germ, so it cannot get into your cells.',
    'Some of the trained cells stay in your blood for years.',
    'So the vaccine never fights the germ at all.',
    'It gives your body a practice run.',
  ],
  { 0: { delivery: 'hook' }, 6: { delivery: 'key' } },
);

/** The same subject as a list of separate facts: nothing joins them. */
const FACTS = beats([
  'Vaccines were first made in 1796.',
  'White blood cells fight infections.',
  'Measles spreads through the air.',
  'Some shots need a booster after ten years.',
  'Smallpox was wiped out in 1980.',
  'Most children get several shots before school.',
]);

describe('a line carrying on from the one before', () => {
  it('opens on a link word or a linking phrase', () => {
    expect(opensWithLink('So the robot is not really moving.')).toBe(true);
    expect(opensWithLink("That's why the drops fall.")).toBe(true);
    expect(opensWithLink('And what happens is you send light.')).toBe(true);
    expect(opensWithLink('In other words, the water moves.')).toBe(true);
    expect(opensWithLink('The germ then gets stuck.')).toBe(true);
    expect(opensWithLink('Measles spreads through the air.')).toBe(false);
    // "that" deep in a line is not a link back.
    expect(opensWithLink('Scientists know that shots work.')).toBe(false);
  });

  it('picks up what a line before ended on, or points back at it', () => {
    expect(
      carriesOn('The antibodies stick to the germ.', [
        'Those cells build antibodies.',
      ]),
    ).toBe(true);
    expect(
      carriesOn('The trained cells stay for years.', [
        'Your body makes trained cells.',
        'Nothing happens for a while.',
      ]),
    ).toBe(true);
    expect(carriesOn('Your body remembers it.', ['A germ gets in.'])).toBe(
      true,
    );
    expect(
      carriesOn('Measles spreads through the air.', [
        'White blood cells fight infections.',
      ]),
    ).toBe(false);
  });

  it('takes the same subject opening every line for a list, not a chain', () => {
    expect(
      carriesOn('The heart beats a hundred thousand times a day.', [
        'The heart has four chambers.',
      ]),
    ).toBe(false);
    expect(
      carriesOn('The blood carries oxygen to the muscles.', [
        'The heart pumps blood.',
      ]),
    ).toBe(true);
  });
});

describe('a scene measured as a chain', () => {
  it('passes a chain of cause and effect', () => {
    expect(measureChain(ROBOT).cold).toEqual([]);
    expect(chainProblem(ROBOT)).toBeNull();
    // "Inside the shot" picks the vaccine up by another word: one line the
    // code cannot see joined is never enough to flag a scene.
    expect(measureChain(VACCINE).cold.map((c) => c.beat)).toEqual([1]);
    expect(chainProblem(VACCINE)).toBeNull();
  });

  it('passes a plain water cycle for children, joined by its carried words', () => {
    const water = beats(
      [
        'Have you ever seen a puddle vanish on a sunny day?',
        'The sun warms the water.',
        'The water turns into a gas called water vapour.',
        'It rises up into the sky, where the air is cold.',
        'The vapour cools and turns into tiny drops.',
        'The drops join up and make clouds.',
        'When the drops get big and heavy, they fall as rain.',
        'Then the water flows back to the sea, and it all starts again.',
      ],
      { 0: { delivery: 'hook' } },
    );
    expect(measureChain(water).cold).toEqual([]);
  });

  it('flags a list of separate facts, naming the cold lines', () => {
    const chain = measureChain(FACTS);
    expect(chain.counted).toBe(5);
    expect(chain.cold.length).toBeGreaterThanOrEqual(4);
    const problem = chainProblem(FACTS);
    expect(problem).toMatchObject({ rule: 'chain', level: 'warning', beat: 1 });
    expect(problem!.message).toMatch(/separate facts, not one chain/);
    expect(problem!.message).toMatch(/line 2 \("White blood cells fight/);
  });

  it('flags the same subject said again and again', () => {
    const heart = beats([
      'The heart is a muscle.',
      'The heart has four chambers.',
      'The heart beats about a hundred thousand times a day.',
      'The heart sits a little to one side of the chest.',
      'The heart weighs about as much as a grapefruit.',
    ]);
    expect(chainProblem(heart)).toMatchObject({ rule: 'chain' });
  });

  it('asks no link of a hook, a question, its answer or a new idea', () => {
    const scene = beats(
      [
        'Ever wondered why the sky is blue?',
        'Sunlight is made of every colour.',
        'Air scatters blue light the most.',
        'Sunsets look red for a different reason.',
        'Is that the whole story?',
        'Mostly, yes.',
      ],
      {
        0: { delivery: 'question' },
        2: { pause: 'long' },
        4: { delivery: 'question' },
      },
    );
    const chain = measureChain(scene);
    // Counted: line 3 only (line 2 answers a question, line 4 opens a new
    // idea, line 5 is a question, line 6 answers it).
    expect(chain.counted).toBe(1);
    expect(chainProblem(scene)).toBeNull();
  });

  it('leaves a short scene, and one not in English, alone', () => {
    expect(chainProblem(FACTS.slice(0, 3))).toBeNull();
    const french = beats([
      'Le soleil chauffe la mer.',
      'Les nuages arrivent du nord.',
      'La pluie tombe sur les montagnes.',
      'Les rivières coulent vers la mer.',
      'Le vent souffle très fort.',
    ]);
    expect(chainProblem(french)).toBeNull();
  });

  it('measures sentences inside one line too', () => {
    const one = beats([
      'Vaccines were first made in 1796. White blood cells fight infections. Measles spreads through the air. Smallpox was wiped out in 1980.',
    ]);
    expect(measureChain(one).counted).toBe(3);
    expect(chainProblem(one)).toMatchObject({ rule: 'chain', beat: 0 });
  });
});
