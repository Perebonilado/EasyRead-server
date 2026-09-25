import {
  answerOf,
  checkLines,
  checkNote,
  checkSolution,
  lostNumbers,
  settleNote,
  mathsSignals,
  repairInlineLatex,
  repairLatex,
  statementsOf,
  strangersIn,
  trimSolution,
  type WorkedSolution,
} from './maths-work';

const step = (latex: string, does = '') => ({
  latex,
  does,
  why: null,
  changes: [],
  says: does,
});

describe('reading a line of maths', () => {
  it('reads sides and relations, implicit products, fractions, roots and powers', () => {
    const [one] = statementsOf('\\frac{3}{4} \\times 12 = 9')!;
    expect(one.relations).toEqual(['=']);
    expect(one.sides).toHaveLength(2);
    expect(statementsOf('2x + 3 = 11')![0].sides[0]).toBe('2 * v_x + 3');
    expect(statementsOf('4ac')![0].sides[0]).toBe('4 * v_a * v_c');
    expect(statementsOf('x^{2} + \\sqrt{16} = x^2 + 4')).not.toBeNull();
    expect(statementsOf('v_{0} + at')![0].sides[0]).toBe('v_v_0 + v_a * v_t');
  });

  it('splits a line at ⇒ and reads money, percentages and thousands as numbers', () => {
    expect(statementsOf('2x = 8 \\Rightarrow x = 4')).toHaveLength(2);
    expect(
      checkLines([
        '5\\% \\times ₦200{,}000 = 0.05 \\times 200{,}000 = ₦10{,}000',
      ]),
    ).toEqual(['true']);
  });

  it('leaves what it cannot read unchecked, never wrong', () => {
    expect(
      statementsOf('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'),
    ).toBeNull();
    expect(checkLines(['\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'])).toEqual([
      'unchecked',
    ]);
  });
});

describe('checking the lines of a working', () => {
  it('checks arithmetic to the precision it is written to', () => {
    expect(
      checkLines([
        '12 \\times 4 = 48',
        '\\frac{22}{7} \\approx 3.14',
        '50 / 0.1 = 5000',
      ]),
    ).toEqual(['true', 'true', 'false']);
    expect(checkLines(['\\sqrt{2} = 1.41'])).toEqual(['true']);
    expect(checkLines(['\\sqrt{2} = 1.5'])).toEqual(['false']);
  });

  it("finds the slip in an equation's working: the line its solution does not satisfy", () => {
    expect(checkLines(['2x + 3 = 11', '2x = 8', 'x = 4'])).toEqual([
      'true',
      'true',
      'true',
    ]);
    expect(checkLines(['2x + 3 = 11', '2x = 14', 'x = 7'])).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(
      checkLines(['3(x - 2) = 2x + 5', '3x - 6 = 2x + 5', 'x = 11']),
    ).toEqual(['true', 'true', 'true']);
  });

  it('goes on down a chain from the last side of the line before', () => {
    expect(checkLines(['2x + 3 = 11', '2x = 11 - 3', '= 8', 'x = 4'])).toEqual([
      'true',
      'true',
      'true',
      'true',
    ]);
    expect(checkLines(['2x = 11 - 3', '= 9'])).toEqual(['true', 'false']);
  });

  it("checks a mean's arithmetic even beside the unknown it defines", () => {
    expect(
      checkLines(['\\bar{x} = \\frac{2 + 4 + 6 + 8}{4} = \\frac{20}{4} = 5']),
    ).toEqual(['true']);
    expect(checkLines(['\\bar{x} = \\frac{20}{4} = 6'])).toEqual(['false']);
  });

  it('checks the lines a maths writer really wrote', () => {
    const naira = [
      'P = 200,000\\,\\text{naira}',
      'r = 0.05\\,\\text{per year}',
      't = 3\\,\\text{years}',
    ];
    // A power on a bracket, and a quantity named in the working.
    expect(
      checkLines(
        [
          'A = P (1 + r)^t',
          'A = 200,000 \\times (1 + 0.05)^3',
          'A = 200,000 \\times 1.157625',
          'A = 231,525',
        ],
        naira,
      ),
    ).toEqual(['true', 'true', 'true', 'true']);
    expect(
      checkLines(
        ['I = P \\times r \\times t', 'I = 10,000 \\times 3', 'I = 35,000'],
        naira,
      ),
    ).toEqual(['true', 'true', 'false']);
    // A quantity named in words, and a unit with a power.
    expect(
      checkLines(
        ['\\text{Total payable} = P + I', '\\text{Total payable} = 230,000'],
        ['P = 200,000', 'I = 30,000'],
      ),
    ).toEqual(['true', 'true']);
    expect(
      checkLines(
        ['v = u + at', 'v = 11'],
        ['u = 5', 'a = 2\\,\\text{m/s}^2', 't = 3'],
      ),
    ).toEqual(['true', 'true']);
    expect(
      checkLines([
        '(12-14)^2 = (-2)^2 = 4',
        '\\sigma = \\sqrt{6} \\approx 2.45',
      ]),
    ).toEqual(['true', 'true']);
    expect(
      checkLines(['200,000 \\times 0.05 = 10,000; 10,000 \\times 3 = 30,000']),
    ).toEqual(['true']);
  });

  it('keeps either root of a quadratic', () => {
    expect(
      checkLines(['x^2 - 5x + 6 = 0', '(x - 2)(x - 3) = 0', 'x = 2', 'x = 3']),
    ).toEqual(['true', 'true', 'true', 'true']);
    expect(checkLines(['x^2 - 5x + 6 = 0', 'x = 4'])).toEqual([
      'true',
      'false',
    ]);
  });

  it('checks a simplification everywhere, a line going on from the one before', () => {
    expect(checkLines(['3(x + 2) - 2x', '= 3x + 6 - 2x', '= x + 6'])).toEqual([
      'true',
      'true',
      'true',
    ]);
    expect(checkLines(['(x + 1)^2', '= x^2 + 1'])).toEqual(['true', 'false']);
  });

  it('substitutes what the problem gives', () => {
    const given = [
      'u = 5\\,\\text{m/s}',
      'a = 2\\,\\text{m/s}^2',
      't = 3\\,\\text{s}',
    ];
    expect(
      checkLines(
        ['v = u + at', 'v = 5 + 2 \\times 3', 'v = 11\\,\\text{m/s}'],
        given,
      ),
    ).toEqual(['true', 'true', 'true']);
    expect(
      checkLines(['v = u + at', 'v = 5 + 2 \\times 3', 'v = 16'], given),
    ).toEqual(['true', 'true', 'false']);
  });

  it('checks a formula rearranged, whatever its letters stand for', () => {
    expect(
      checkLines(['v = u + at', 'v - u = at', 'a = \\frac{v - u}{t}']),
    ).toEqual(['true', 'true', 'true']);
    expect(checkLines(['v = u + at', 'a = \\frac{v + u}{t}'])).toEqual([
      'true',
      'false',
    ]);
  });

  it('checks calculus numerically: integrals, sums, derivatives and antiderivatives', () => {
    expect(
      checkLines([
        '\\int_0^1 x^2 \\, dx = \\left[\\frac{x^3}{3}\\right]_0^1 = \\frac{1}{3}',
      ]),
    ).toEqual(['true']);
    expect(checkLines(['\\int_0^1 x^2 \\, dx = \\frac{1}{2}'])).toEqual([
      'false',
    ]);
    expect(checkLines(['\\sum_{i=1}^{10} i = 55'])).toEqual(['true']);
    expect(checkLines(['\\frac{d}{dx}\\left(x^3\\right) = 3x^2'])).toEqual([
      'true',
    ]);
    expect(checkLines(['\\int 2x \\, dx = x^2 + C'])).toEqual(['true']);
    expect(checkLines(['\\int 2x \\, dx = 2x^2 + C'])).toEqual(['false']);
    expect(checkLines(['\\sin 30^\\circ = 0.5'])).toEqual(['true']);
  });
});

describe('a worked solution', () => {
  /** Simple interest, as a law or finance page works it. */
  const interest: WorkedSolution = {
    given: ['P = ₦200{,}000', 'r = 5\\%', 't = 3'],
    wanted: 'The simple interest after 3 years',
    steps: [
      step('I = P \\times r \\times t', 'Write the formula'),
      step('I = 200{,}000 \\times 0.05 \\times 3', 'Put in the numbers'),
      step('I = 30{,}000', 'Multiply'),
    ],
    answer: '₦30{,}000',
    check: '30{,}000 \\div (200{,}000 \\times 3) = 0.05',
  };
  const page =
    'Ada borrows ₦200,000 at a simple interest rate of 5% a year for 3 years. How much interest does she pay?';

  it('stands behind a solution whose every line, answer and check hold, from the page', () => {
    const found = checkSolution(interest, page);
    expect(found.steps).toEqual(['true', 'true', 'true']);
    expect(found.answer).toBe('true');
    expect(found.check).toBe('true');
    expect(found.problems).toEqual([]);
  });

  it('names a wrong line, a wrong answer, and a given the page never gives', () => {
    const wrong: WorkedSolution = {
      ...interest,
      given: ['P = ₦250{,}000', 'r = 5\\%', 't = 3'],
      steps: [
        interest.steps[0],
        step('I = 250{,}000 \\times 0.05 \\times 3'),
        step('I = 35{,}000'),
      ],
      answer: '₦35{,}000',
    };
    const found = checkSolution(wrong, page);
    expect(found.steps).toEqual(['true', 'true', 'false']);
    expect(found.strangers).toEqual([250000]);
    expect(found.problems.join(' ')).toContain('Step 3');
    expect(found.problems.join(' ')).toContain('250000');
  });

  it('stops at the last true line and gives the answer code finds', () => {
    const slip: WorkedSolution = {
      given: [],
      wanted: 'x',
      steps: [step('2x + 3 = 11'), step('2x = 14'), step('x = 7')],
      answer: 'x = 7',
      check: '2(7) + 3 = 17',
    };
    const found = checkSolution(slip, null);
    const trimmed = trimSolution(slip, found);
    expect(trimmed.steps.map((s) => s.latex)).toEqual(['2x + 3 = 11']);
    expect(trimmed.answer).toBe('x = 4');
    expect(trimmed.check).toBeNull();
    expect(trimmed.cut).toBe(true);
    expect(answerOf(['x^2 = 9'])).toBe('x = -3 \\text{ or } x = 3');
  });

  it('checks the first step against an equation the givens state', () => {
    const given = ['3(x - 2) = 2x + 5'];
    const right = checkSolution({
      given,
      wanted: 'x',
      steps: [step('3x - 6 = 2x + 5'), step('x = 11')],
      answer: 'x = 11',
      check: null,
    });
    expect(right.steps).toEqual(['true', 'true']);
    const slip = checkSolution({
      given,
      wanted: 'x',
      steps: [step('3x - 2 = 2x + 5'), step('x = 7')],
      answer: 'x = 7',
      check: null,
    });
    expect(slip.steps).toEqual(['false', 'false']);
  });

  it('finds the numbers of the givens on the page, in any of their forms', () => {
    expect(
      strangersIn(['r = 0.05', 'd = 2000\\,\\text{m}'], 'at 5% for 2 km'),
    ).toEqual([]);
    expect(strangersIn(['r = 0.07'], 'at 5% for 2 km')).toEqual([0.07]);
  });
});

describe('finding maths on a page', () => {
  it('knows a page of working from prose with a number in it', () => {
    expect(
      mathsSignals(
        'Solve for x.\n2x + 3 = 11\n2x = 8\nx = 4\nSo the answer is four.',
      ).maths,
    ).toBe(true);
    expect(
      mathsSignals(
        'The war ended in 1945. About 70 million people died, and the world was never the same again.',
      ).maths,
    ).toBe(false);
  });

  it('sees the traces a symbol font leaves when it loses a glyph', () => {
    const lost =
      'The area is 3\uFFFD4 = 12 and the ratio 6\uFFFD2 = 3, so 5\uFFFD5 = 25 and 9\uFFFD3 = 3.';
    const found = mathsSignals(lost);
    expect(found.lost).toBe(4);
    expect(found.maths).toBe(true);
  });
});

describe("a maths page's note", () => {
  const page =
    'Ada borrows ₦200,000 at a simple interest rate of 5% a year for 3 years. Find the interest. Then solve 2x + 3 = 11.';
  const working = (
    latex: string[],
    answer: string,
  ): { type: string; text: string; working: WorkedSolution } => ({
    type: 'working',
    text: 'Solve 2x + 3 = 11',
    working: {
      given: [],
      wanted: 'x',
      steps: latex.map((line) => step(line)),
      answer,
      check: null,
    },
  });

  it('finds a wrong line and the numbers a rewrite lost', () => {
    const blocks = [
      { type: 'paragraph', text: 'Ada borrows money for 3 years.' },
      working(['2x + 3 = 11', '2x = 14', 'x = 7'], 'x = 7'),
    ];
    const problems = checkNote(blocks, page);
    expect(problems.join(' ')).toContain('Step 2');
    expect(lostNumbers(page, blocks)).toEqual([200000]);
  });

  it('cuts a working still wrong at its last true line, with the answer code finds', () => {
    const [kept] = settleNote(
      [working(['2x + 3 = 11', '2x = 14', 'x = 7'], 'x = 7')],
      page,
    );
    expect(kept.working?.steps.map((s) => s.latex)).toEqual(['2x + 3 = 11']);
    expect(kept.working?.answer).toBe('x = 4');
    expect(kept.working?.cut).toBe(true);
    const [right] = settleNote(
      [working(['2x + 3 = 11', '2x = 8', 'x = 4'], 'x = 4')],
      page,
    );
    expect(right.working?.cut).toBeUndefined();
  });
});

describe('LaTeX through JSON', () => {
  it('puts back the backslashes a JSON escape took, and only in the maths', () => {
    expect(repairLatex('3 \times 4 = 12')).toBe('3 \\times 4 = 12');
    expect(repairLatex('\frac{1}{2} \neq 1')).toBe('\\frac{1}{2} \\neq 1');
    expect(repairInlineLatex('Multiply: $3 \times x$.\nThen add.')).toBe(
      'Multiply: $3 \\times x$.\nThen add.',
    );
  });

  it('reads "or" between two statements as two statements', () => {
    expect(
      checkLines([
        'x^2 - 5x + 6 = 0',
        '(x - 2) = 0 \\text{ or } (x - 3) = 0',
        'x = 2 \\ \\text{or}\\ x = 3',
      ]),
    ).toEqual(['true', 'true', 'true']);
  });
});

describe('a percentage, either way', () => {
  const step = (latex: string) => ({
    latex,
    does: '',
    why: null,
    changes: [],
    says: '',
  });
  const given = [
    'P = 200{,}000\\,\\text{Naira}',
    'r = 5\\% \\text{ per year}',
    't = 3 \\text{ years}',
  ];

  it('reads a rate as its whole number where the formula divides by a hundred', () => {
    const found = checkSolution({
      given,
      wanted: 'the simple interest',
      steps: [
        step('I = \\frac{P \\times r \\times t}{100}'),
        step('I = 200{,}000 \\times \\dfrac{5}{100} \\times 3'),
        step('I = 10{,}000 \\times 3'),
        step('I = 30{,}000'),
      ],
      answer: 'I = 30{,}000\\,\\text{Naira}',
      check: null,
    });
    expect(found.steps).toEqual(['true', 'true', 'true', 'true']);
    expect(found.answer).toBe('true');
    expect(found.problems).toEqual([]);
    expect(found.wholePercent).toBe(true);
  });

  it('reads it as a fraction where the formula takes it so', () => {
    const found = checkSolution({
      given,
      wanted: 'the simple interest',
      steps: [
        step('I = P \\times r \\times t'),
        step('I = 200{,}000 \\times 0.05 \\times 3'),
        step('I = 30{,}000'),
      ],
      answer: null,
      check: null,
    });
    expect(found.steps).toEqual(['true', 'true', 'true']);
    expect(found.wholePercent).toBeUndefined();
  });

  it('gives the right answer when a working is cut', () => {
    const working = {
      given,
      wanted: 'the simple interest',
      steps: [
        step('I = \\frac{P \\times r \\times t}{100}'),
        step('I = 200{,}000 \\times \\dfrac{5}{100} \\times 3'),
        step('I = 20{,}000'),
      ],
      answer: 'I = 20{,}000',
      check: null,
    };
    const cut = trimSolution(working, checkSolution(working));
    expect(cut.steps).toHaveLength(2);
    expect(cut.answer).toBe('I = 30{,}000');
  });
});

describe('a working whose check alone is wrong', () => {
  it('keeps every step and the answer, drops the check, and cuts nothing', () => {
    const step = (latex: string) => ({
      latex,
      does: '',
      why: null,
      changes: [],
      says: '',
    });
    const working = {
      given: ['2x + 3 = 11'],
      wanted: 'x',
      steps: [step('2x = 8'), step('x = 4')],
      answer: 'x = 4',
      check: '2(4) + 3 = 12',
    };
    const found = checkSolution(working);
    expect(found.check).toBe('false');
    const kept = trimSolution(working, found);
    expect(kept.steps).toHaveLength(2);
    expect(kept.answer).toBe('x = 4');
    expect(kept.check).toBeNull();
    expect(kept.cut).toBeUndefined();
  });
});
