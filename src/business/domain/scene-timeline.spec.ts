import { dateOf, positions, renderTimeline } from './scene-timeline';

describe('a timeline drawn by code', () => {
  it('reads a year, an era, or nothing at all', () => {
    expect(dateOf('1914')).toBe(1914);
    expect(dateOf('44 BC')).toBe(-44);
    expect(dateOf('AD 79')).toBe(79);
    expect(dateOf('Stage 2')).toBeNull();
    expect(dateOf('Spring')).toBeNull();
    // A month and a day: a fraction into the year.
    expect(dateOf('June 1910')).toBeCloseTo(1910 + 5 / 12, 5);
    expect(dateOf('14 Dec 1911')).toBeCloseTo(1911 + 11 / 12 + 13 / 365, 5);
    expect(dateOf('14 Dec 1911')! < dateOf('17 Jan 1912')!).toBe(true);
  });

  it('spaces events by their dates, pushed apart where they crowd, evenly when undated', () => {
    const dated = positions([
      { when: '1900', name: 'a' },
      { when: '1901', name: 'b' },
      { when: '2000', name: 'c' },
    ]);
    expect(dated[0]).toBe(0);
    expect(dated[2]).toBe(1);
    // A year apart in a century: still apart enough to read.
    expect(dated[1] - dated[0]).toBeGreaterThanOrEqual(0.1);
    expect(
      positions([
        { when: 'Stage 1', name: 'a' },
        { when: 'Stage 2', name: 'b' },
        { when: 'Stage 3', name: 'c' },
      ]),
    ).toEqual([0, 0.5, 1]);
  });

  it('draws each event as a part, in date order, the axis drawing itself', () => {
    const drawn = renderTimeline({
      events: [
        { when: '1912', name: 'Scott reaches the pole' },
        { when: '1910', name: 'Scott sets sail' },
        { when: '1911', name: 'Amundsen reaches the pole' },
      ],
    });
    expect(Object.keys(drawn.parts)).toEqual([
      'Scott sets sail',
      'Amundsen reaches the pole',
      'Scott reaches the pole',
    ]);
    expect(drawn.svg).toContain('id="event-scott-sets-sail"');
    expect(drawn.svg).toContain('@keyframes axis');
    // Neighbours take turns above and below the axis.
    expect(drawn.svg).toContain('class="up"');
    expect(drawn.svg).toContain('class="down"');
    expect(() =>
      renderTimeline({ events: [{ when: '1', name: 'alone' }] }),
    ).toThrow();
  });
});
