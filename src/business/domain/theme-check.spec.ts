import {
  PAPER,
  THEMES,
  THEME_IDS,
  contrast,
  deltaE2000,
  hexRgb,
  labOf,
} from './scene-themes';
import {
  CHART_APART,
  RULES,
  allThemeProblems,
  seenWith,
  themeProblems,
} from './theme-check';

describe('every theme, checked by code', () => {
  it.each(THEME_IDS)('%s passes contrast and colour-blind checks', (id) => {
    expect(themeProblems(THEMES[id])).toEqual([]);
  });

  it('finds nothing wrong with any of them', () => {
    expect(allThemeProblems()).toEqual([]);
  });

  it('holds ink on paper to 7:1 and the accent to 3:1', () => {
    for (const id of THEME_IDS) {
      expect(contrast(THEMES[id].ink, THEMES[id].paper)).toBeGreaterThanOrEqual(
        RULES.ink,
      );
      expect(
        contrast(THEMES[id].accent, THEMES[id].paper),
      ).toBeGreaterThanOrEqual(RULES.graphic);
    }
  });

  it('catches a theme that would fail: pale words, a chart told apart by red and green alone', () => {
    const bad = {
      ...PAPER,
      muted: '#C8C8C8',
      chart: [
        '#D62728',
        '#2CA02C',
        '#0050BE',
        '#BB7907',
        '#733359',
        '#1A99CE',
      ] as typeof PAPER.chart,
    };
    const problems = themeProblems(bad);
    expect(problems.some((p) => p.includes('muted on paper'))).toBe(true);
    expect(
      problems.some(
        (p) => p.includes('chart 1 and 2') && /protanopia|deuteranopia/.test(p),
      ),
    ).toBe(true);
    expect(CHART_APART).toBe(12);
  });
});

describe('seeing as a colour-blind viewer does', () => {
  it('leaves white white and black black', () => {
    for (const d of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      expect(seenWith('#FFFFFF', d).map(Math.round)).toEqual([255, 255, 255]);
      expect(seenWith('#000000', d).map(Math.round)).toEqual([0, 0, 0]);
    }
  });

  it('brings red and green much nearer without the red cones', () => {
    const seen = deltaE2000(
      labOf(seenWith('#D62728', 'protanopia')),
      labOf(seenWith('#2CA02C', 'protanopia')),
    );
    const normal = deltaE2000(
      labOf(hexRgb('#D62728')!),
      labOf(hexRgb('#2CA02C')!),
    );
    expect(seen).toBeLessThan(normal / 2);
  });
});
