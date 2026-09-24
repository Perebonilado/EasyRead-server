import {
  calculate,
  checkArithmetic,
  markTerms,
  renderMath,
  splitAtEquals,
} from './scene-math';

describe('maths set by code', () => {
  it('checks the arithmetic a line claims, to the precision it is written', () => {
    expect(checkArithmetic('50/0.1 = 500')).toEqual({
      holds: true,
      value: 500,
    });
    expect(checkArithmetic('50/0.1 = 5000')?.holds).toBe(false);
    expect(checkArithmetic('22/7 = 3.14')?.holds).toBe(true);
    expect(checkArithmetic('22/7 = 3.1')?.holds).toBe(true);
    expect(checkArithmetic('22/7 = 3.15')?.holds).toBe(false);
    expect(checkArithmetic('1,000 * 3 = 3,000')?.holds).toBe(true);
    expect(checkArithmetic('20% * 50 = 10')?.holds).toBe(true);
    expect(checkArithmetic('2^10 = 1024 = 1,024')?.holds).toBe(true);
    // A variable, or not an equality: nothing to say.
    expect(checkArithmetic('2x + 3 = 7')).toBeNull();
    expect(checkArithmetic('500')).toBeNull();
  });

  it('will not do anything but arithmetic', () => {
    expect(() => calculate('import({x: 1})')).toThrow();
    expect(checkArithmetic('evaluate("1") = 1')).toBeNull();
  });

  it('marks terms as groups the voice can point at', () => {
    const { tex, terms } = markTerms(
      'M = \\term{image size}{h_i} / \\term{real size}{h_{o}}',
      2,
    );
    expect(tex).toBe(
      'M = \\cssId{term-image-size-2}{h_i} / \\cssId{term-real-size-2}{h_{o}}',
    );
    expect(terms.map((t) => t.name)).toEqual(['image size', 'real size']);
  });

  it('splits a line at its first equals sign, not a sign inside a group or a command', () => {
    expect(splitAtEquals('a^2 + b^2 = c^2')).toEqual(['a^2 + b^2', '= c^2']);
    expect(splitAtEquals('\\frac{a=1}{2} \\leq 3 = x')).toEqual([
      '\\frac{a=1}{2} \\leq 3',
      '= x',
    ]);
    expect(splitAtEquals('x \\neq 2')).toBeNull();
  });

  it('stacks the lines with their equals signs in one column, each line and term a group', () => {
    const set = renderMath([
      {
        latex: 'M = \\frac{\\term{image size}{h_i}}{\\term{real size}{h_o}}',
        check: null,
      },
      { latex: '= \\frac{50}{0.1}', check: '50/0.1 = 500' },
      { latex: '= 500', check: null },
    ]);
    expect(set.parts).toEqual({
      'image size': 'term-image-size-1',
      'real size': 'term-real-size-1',
    });
    expect(set.states).toEqual({ 'line 2': 'line-2', 'line 3': 'line-3' });
    expect(set.svg).toContain('id="line-1"');
    expect(set.svg).toContain('id="term-image-size-1"');
    expect(set.viewBox[2]).toBeGreaterThan(0);
    // Every line's right side starts in the same column.
    const starts = [
      ...set.svg.matchAll(
        /<g id="line-\d+">(?:<g transform="translate\(([\d.-]+) [\d.-]+\)">[\s\S]*?<\/g>)??<g transform="translate\(([\d.-]+)/g,
      ),
    ];
    expect(starts.length).toBe(3);
  });

  it('refuses TeX that will not set, rather than put an error on the stage', () => {
    expect(() => renderMath([{ latex: '\\frac{1}{', check: null }])).toThrow();
  });
});
