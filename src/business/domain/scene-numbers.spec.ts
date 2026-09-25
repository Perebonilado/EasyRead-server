import { renderMath } from './scene-math';
import { drawNumbers, numberPicture } from './scene-numbers';

const line = (latex: string) => ({ latex, check: null });

describe('numbers as pictures, for a young learner', () => {
  it('finds the sum a working does, and leaves what a picture cannot show plainly', () => {
    expect(numberPicture([line('47 + 28 = 75')])).toEqual({
      kind: 'add',
      a: 47,
      b: 28,
    });
    expect(numberPicture([line('120 - 36 = 84')])).toEqual({
      kind: 'take',
      a: 120,
      b: 36,
    });
    expect(numberPicture([line('6 \\times 7 = 42')])).toEqual({
      kind: 'times',
      a: 6,
      b: 7,
    });
    expect(numberPicture([line('12 \\div 3 = 4')])).toEqual({
      kind: 'share',
      a: 12,
      b: 3,
    });
    expect(numberPicture([line('\\frac{3}{4} \\text{ of the pizza}')])).toEqual(
      {
        kind: 'fraction',
        n: 3,
        d: 4,
      },
    );
    expect(numberPicture([line('2x + 3 = 11')])).toBeNull();
    expect(numberPicture([line('25 \\times 40 = 1000')])).toBeNull();
  });

  it('draws blocks to count for small amounts, bars for bigger ones, and rows of dots for a times table', () => {
    expect(
      drawNumbers({ kind: 'add', a: 3, b: 4 }).markup.match(/<rect/g),
    ).toHaveLength(7);
    expect(drawNumbers({ kind: 'take', a: 47, b: 28 }).markup).toContain('−28');
    expect(
      drawNumbers({ kind: 'times', a: 6, b: 7 }).markup.match(/<circle/g),
    ).toHaveLength(42);
    expect(drawNumbers({ kind: 'share', a: 12, b: 3 }).markup).toContain(
      '4 each',
    );
  });

  it('sets the picture under the working, as wide as it is', () => {
    const set = renderMath([line('47 + 28 = 75')], {
      kind: 'add',
      a: 47,
      b: 28,
    });
    expect(set.svg).toContain('id="numbers"');
    expect(set.viewBox[3]).toBeGreaterThan(
      renderMath([line('47 + 28 = 75')]).viewBox[3],
    );
  });

  it('pictures what the working comes to, not a step on the way', () => {
    expect(
      numberPicture([
        { latex: '40 + 20 = 60' },
        { latex: '7 + 8 = 15' },
        { latex: '60 + 15 = 75' },
      ] as never),
    ).toEqual({ kind: 'add', a: 60, b: 15 });
  });
});
