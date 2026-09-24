import { renderPlot, sample, ticks } from './scene-plot';

describe('a graph drawn by code', () => {
  it('ticks at round numbers', () => {
    expect(ticks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticks(-3, 3)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(ticks(0, 0.9, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
  });

  it('works the function out, and has no value where it has none', () => {
    const points = sample('sqrt(x)', [-1, 1], 4);
    expect(points.map((p) => p.y)).toEqual([null, null, 0, Math.SQRT1_2, 1]);
  });

  it('draws the curve, the axes and the marked points, each point a part with its label', () => {
    const plot = renderPlot({
      fn: 'x^2 - 4',
      x: [-3, 3],
      y: null,
      points: [
        { x: -2, name: 'root' },
        { x: 0, name: 'lowest point' },
        { x: 9, name: 'off the graph' },
      ],
      xLabel: 'x',
      yLabel: 'y',
    });
    expect(plot.parts).toEqual({
      curve: 'curve',
      root: 'point-root',
      'lowest point': 'point-lowest-point',
    });
    expect(plot.callouts.map((c) => c.text)).toEqual(['root', 'lowest point']);
    expect(plot.svg).toContain('id="curve"');
    // The curve draws itself as it arrives.
    expect(plot.svg).toMatch(/@keyframes draw/);
    expect(plot.svg).not.toContain('NaN');
  });

  it('breaks the curve at an asymptote rather than join across it', () => {
    const plot = renderPlot({
      fn: '1/x',
      x: [-2, 2],
      y: [-5, 5],
      points: [],
      xLabel: null,
      yLabel: null,
    });
    const moves = plot.svg.match(/M[\d.-]+ [\d.-]+/g) ?? [];
    expect(moves.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses a function it cannot work out, and what the calculator may not do', () => {
    expect(() =>
      renderPlot({
        fn: 'log(-1 - x^2)',
        x: [0, 1],
        y: null,
        points: [],
        xLabel: null,
        yLabel: null,
      }),
    ).toThrow();
    expect(() =>
      renderPlot({
        fn: 'import({a: 1})',
        x: [0, 1],
        y: null,
        points: [],
        xLabel: null,
        yLabel: null,
      }),
    ).toThrow();
  });
});
