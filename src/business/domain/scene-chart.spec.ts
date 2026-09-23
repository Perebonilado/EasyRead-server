import { numbersIn, renderChart, valueText } from './scene-chart';

describe('a chart drawn by code', () => {
  it('reads the numbers a page gives, however it writes them', () => {
    expect(
      numbersIn(
        'About 1,500 people, 70% of them, spent 3.5 hours in 1911, and 12,000,000 more.',
      ),
    ).toEqual([1500, 70, 3.5, 1911, 12000000]);
  });

  it('writes a value with its unit', () => {
    expect(valueText(70, '%')).toBe('70%');
    expect(valueText(1.5, 'million')).toBe('1.5 million');
    expect(valueText(12000, null)).toBe('12,000');
  });

  it('draws each bar as a part, growing from the axis, its value on it', () => {
    const drawn = renderChart({
      kind: 'bar',
      unit: '%',
      bars: [
        { label: 'Shower', value: 34 },
        { label: 'Toilet', value: 22 },
        { label: 'Taps', value: 20 },
      ],
    });
    expect(drawn.parts).toEqual({
      Shower: 'bar-shower',
      Toilet: 'bar-toilet',
      Taps: 'bar-taps',
    });
    expect(drawn.svg).toContain('@keyframes grow');
    expect(drawn.svg).toContain('>34%<');
  });

  it('draws a line through its points, each a part', () => {
    const drawn = renderChart({
      kind: 'line',
      unit: '°C',
      bars: [
        { label: '1900', value: 13.7 },
        { label: '1950', value: 13.9 },
        { label: '2000', value: 14.4 },
      ],
    });
    expect(Object.values(drawn.parts)).toEqual([
      'bar-1900',
      'bar-1950',
      'bar-2000',
    ]);
    expect(drawn.svg).toContain('class="line"');
    expect(drawn.svg).toContain('14.4°C');
    expect(() =>
      renderChart({
        kind: 'bar',
        unit: null,
        bars: [{ label: 'one', value: 1 }],
      }),
    ).toThrow();
  });
});
