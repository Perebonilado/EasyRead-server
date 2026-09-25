import { sayLatex } from './maths-speech';
import {
  figureLatex,
  numbersSaid,
  penText,
  wordsHold,
  workLines,
} from './maths-board';

describe('penText', () => {
  it.each([
    ['2x + 3 = 11', '2x + 3 = 11'],
    ['\\frac{3}{4} \\times 20 = 15', '3/4 x 20 = 15'],
    ['x^{2} + 3x - 10 = 0', 'x^2 + 3x - 10 = 0'],
    ['(x+5)(x-2) = 0', '(x + 5)(x - 2) = 0'],
    ['2 \\times x = 8', '2 * x = 8'],
    ['\\sqrt{16} = 4', 'sqrt(16) = 4'],
    ['A = \\pi r^{2}', 'A = pi r^2'],
    ['1{,}500 \\div 3 = 500', '1,500 / 3 = 500'],
    ['\\bar{x} = 12', 'x-bar = 12'],
    ['x_{1} = -5', 'x1 = -5'],
    ['\\frac{x+1}{2} = 3', '(x + 1)/2 = 3'],
    ['e^{-kt}', 'e^(-kt)'],
    ['\\term{a}{2x} = 8', '2x = 8'],
    ['x \\le 4', 'x <= 4'],
    ['\\int_{0}^{1} 2x \\, dx = 1', 'int_0^1 2x dx = 1'],
    ['= \\left[ x^3 + x^2 \\right]_0^2', '= [x^3 + x^2]_0^2'],
  ])('writes %s as %s', (latex, pen) => {
    expect(penText(latex)).toBe(pen);
  });

  it('writes a unit apart from its number', () => {
    expect(
      penText('v = 5\\,\\text{m/s} + 2\\,\\text{m/s}^2 \\times 3\\,\\text{s}'),
    ).toBe('v = 5 m/s + 2 m/s^2 x 3 s');
  });

  it('writes only characters the pen has', () => {
    expect(penText('5\\% \\times ₦200{,}000 = ₦10{,}000')).toBe(
      '5% x N200,000 = N10,000',
    );
    expect(penText('x² ≤ 9 · π')).toBe('x^2 <= 9 * pi');
  });
});

describe('workLines', () => {
  it('writes the problem, each step, and an answer the last step does not say', () => {
    const lines = workLines({
      given: ['2x + 3 = 11'],
      wanted: 'x',
      steps: [
        {
          latex: '2x = 8',
          does: 'subtract 3 from both sides',
          why: null,
          changes: [],
          says: '',
        },
        {
          latex: 'x = 4',
          does: 'divide both sides by 2',
          why: 'to get x on its own',
          changes: [],
          says: '',
        },
      ],
      answer: 'x = 4',
      check: '2(4) + 3 = 11',
    });
    expect(lines.map((line) => [line.role, line.plain, line.does])).toEqual([
      ['problem', '2x + 3 = 11', null],
      ['step', '2x = 8', 'subtract 3 from both sides'],
      ['step', 'x = 4', 'divide both sides by 2'],
      ['check', '2(4) + 3 = 11', null],
    ]);
    expect(lines[1].said).toMatch(/2 ?x equals 8/);
  });

  it('adds the answer when it says more than the last step', () => {
    const lines = workLines({
      given: [
        'u = 5\\,\\text{m/s}',
        'a = 2\\,\\text{m/s}^2',
        't = 3\\,\\text{s}',
      ],
      wanted: 'the final speed',
      steps: [
        {
          latex: 'v = u + at',
          does: 'write the formula',
          why: null,
          changes: [],
          says: '',
        },
        {
          latex: 'v = 5 + 2 \\times 3',
          does: 'put in the numbers',
          why: null,
          changes: [],
          says: '',
        },
        {
          latex: 'v = 11',
          does: 'work it out',
          why: null,
          changes: [],
          says: '',
        },
      ],
      answer: 'v = 11\\,\\text{m/s}',
      check: null,
    });
    expect(lines.map((line) => line.plain)).toEqual([
      'u = 5 m/s',
      'a = 2 m/s^2',
      't = 3 s',
      'v = u + at',
      'v = 5 + 2 x 3',
      'v = 11',
      'v = 11 m/s',
    ]);
    expect(lines[6].role).toBe('answer');
  });
});

describe('figureLatex', () => {
  it.each([
    ['E = mc^2', 'E =mc^{2}'],
    ['A = pi r^2', 'A =\\pi r^{2}'],
    ['1/2 m v^2', '\\frac{1}{2} m v^{2}'],
    ['9.8 m/s^2', '9.8\\,\\text{m/s}^{2}'],
    ['F = 6.67 x 10^-11', 'F =6.67\\times 10^{-11}'],
    ['5% * 200,000 = 10,000', '5\\%\\times 200{,}000=10{,}000'],
    ['Area = pi r^2', '\\text{Area}=\\pi r^{2}'],
    ['v = v0 + at', 'v =v_{0}+at'],
    ['sin(theta) = 0.5', '\\sin (\\theta )=0.5'],
    ['x² + 3x − 10 = 0', 'x^{2}+3x -10=0'],
  ])('sets %s in type', (text, latex) => {
    expect(figureLatex(text)).toBe(latex);
  });

  it('leaves a figure type would show no better, and one that is not maths', () => {
    expect(figureLatex('N = 4 servers')).toBeNull();
    expect(figureLatex('30%')).toBeNull();
    expect(figureLatex('x = 5')).toBeNull();
    expect(figureLatex('₦200,000 at 5% a year')).toBeNull();
  });
});

describe('the words a step is said in', () => {
  it('reads the numbers a sentence says, in figures or words', () => {
    expect(numbersSaid('seventy-five')).toEqual([75]);
    expect(numbersSaid('two hundred thousand naira')).toEqual([200000]);
    expect(numbersSaid('forty-seven plus twenty-eight')).toEqual([47, 28]);
    expect(numbersSaid('so 2x is 8')).toEqual([2, 8]);
    expect(numbersSaid('add forty-seven and twenty-eight')).toEqual([47, 28]);
    expect(numbersSaid('two hundred and five')).toEqual([205]);
    expect(numbersSaid('seven plus eight is fifteen')).toEqual([7, 8, 15]);
  });

  it("keeps the writer's words only where every number in them holds", () => {
    expect(wordsHold('so two x is eight', ['2x = 8', '2x + 3 = 11'])).toBe(
      true,
    );
    expect(wordsHold('so two x is nine', ['2x = 8', '2x + 3 = 11'])).toBe(
      false,
    );
  });

  it('says an antiderivative between its limits as a teacher does', () => {
    expect(sayLatex('\\left[ x^3 + x^2 \\right]_0^2')).toContain(
      'evaluated from 0 to 2',
    );
  });
});

describe('the lines a board writes', () => {
  const step = (latex: string, does: string, says = '') => ({
    latex,
    does,
    why: null,
    changes: [],
    says,
  });

  it('leaves out bare numbers given, and a step that only writes the line before again', () => {
    const lines = workLines({
      given: ['47', '28', '2x + 3 = 11'],
      wanted: 'x',
      steps: [
        step('2x + 3 = 11', 'write the equation'),
        step('2x = 8', 'subtract 3 from both sides', 'so two x is eight'),
        step('x = 4', 'halve both sides', 'so x is nine'),
      ],
      answer: 'x = 4',
      check: '2(4) + 3 = 11',
    });
    expect(lines.map((line) => line.plain)).toEqual([
      '2x + 3 = 11',
      '2x = 8',
      'x = 4',
      '2(4) + 3 = 11',
    ]);
    // The writer's words where they hold; the line as it reads where not.
    expect(lines[1].said).toBe('so two x is eight');
    expect(lines[2].said).not.toContain('nine');
  });

  it('writes a check of two parts as two lines', () => {
    const lines = workLines({
      given: ['x^2 + 3x - 10 = 0'],
      wanted: 'x',
      steps: [
        step('(x + 5)(x - 2) = 0', 'factorise'),
        step('x = -5 \\text{ or } x = 2', 'solve each'),
      ],
      answer: null,
      check: '(-5)^2 + 3(-5) - 10 = 0 \\text{ and } 2^2 + 3(2) - 10 = 0',
    });
    expect(
      lines.filter((line) => line.role === 'check').map((line) => line.plain),
    ).toEqual(['(-5)^2 + 3(-5) - 10 = 0', '2^2 + 3(2) - 10 = 0']);
  });
});
