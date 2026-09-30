import type { SceneThemeName } from '../../contracts';
import FIXTURES from './__fixtures__/explainer-drawings.json';
import { renderChart } from './scene-chart';
import { renderPlot } from './scene-plot';
import { renderQuote } from './scene-quote';
import { renderTimeline } from './scene-timeline';
import {
  HOUSE,
  PAPER,
  THEMES,
  THEME_IDS,
  codeColour,
  contrast,
  deltaE2000,
  drawingColour,
  hexRgb,
  houseColourOf,
  labOf,
  recolour,
  themeOf,
  themeVars,
  themedCode,
  themedDrawing,
  themedKept,
  themedSvg,
  themesPrint,
  viewedTheme,
  withRim,
  type HouseColour,
  type ThemeId,
} from './scene-themes';

/** The player's copy prints this too (easyread's src/lib/scene/themes.test.ts). */
const PRINT = '1moho3f:8682';

const hexes = (svg: string) =>
  new Set([...svg.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toUpperCase()));
const idsOf = (svg: string) =>
  [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]).sort();

describe('the theme table', () => {
  it('prints what the player prints: the two copies are the same', () => {
    expect(themesPrint()).toBe(PRINT);
  });

  it('names the looks as the contract does', () => {
    const one: SceneThemeName[] = [...THEME_IDS];
    const two: ThemeId[] = one;
    expect(two).toHaveLength(6);
  });

  it('has three light and three dark themes, each with a twin of the other kind', () => {
    expect(THEME_IDS.filter((id) => THEMES[id].dark)).toEqual([
      'chalkboard',
      'blueprint',
      'nightsky',
    ]);
    for (const id of THEME_IDS) {
      const theme = THEMES[id];
      expect(THEMES[theme.twin].twin).toBe(id);
      expect(THEMES[theme.twin].dark).toBe(!theme.dark);
    }
    expect(THEMES.paper.twin).toBe('nightsky');
    expect(THEMES.cleanlab.twin).toBe('blueprint');
    expect(THEMES.sunny.twin).toBe('chalkboard');
  });

  it('is paper for anything it does not know, as a scene before themes', () => {
    expect(themeOf(undefined)).toBe(PAPER);
    expect(themeOf('neon')).toBe(PAPER);
    expect(themeOf('sunny').id).toBe('sunny');
  });

  it("keeps a dark maker's look, and swaps a light one for its twin, for a dark picture", () => {
    expect(viewedTheme('paper', true)).toBe('nightsky');
    expect(viewedTheme('sunny', true)).toBe('chalkboard');
    expect(viewedTheme('blueprint', true)).toBe('blueprint');
    expect(viewedTheme('cleanlab', false)).toBe('cleanlab');
  });

  it('keeps paper as the stage was: its colours are the old constants', () => {
    expect(PAPER).toMatchObject({
      paper: '#FBF7EF',
      paperEdge: '#E4DCCB',
      ink: '#1F2A37',
      muted: '#5B6675',
      accent: '#E0663A',
      card: '#FFFFFF',
    });
    expect(PAPER.drawingMap).toEqual(HOUSE);
  });

  it('gives each token code draws with a colour of its own, so every colour says its token', () => {
    const tokens = [
      PAPER.paper,
      PAPER.paperEdge,
      PAPER.ink,
      PAPER.muted,
      PAPER.card,
      PAPER.accent,
      PAPER.accent2,
      PAPER.grid,
      PAPER.good,
      PAPER.bad,
      ...PAPER.chart,
    ].map((c) => c.toUpperCase());
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('sets every token as a CSS variable, the same names for every theme', () => {
    const names = Object.keys(themeVars(PAPER)).sort();
    expect(names).toContain('--t-ink');
    expect(names).toContain('--t-chart-6');
    for (const id of THEME_IDS) {
      const vars = themeVars(THEMES[id]);
      expect(Object.keys(vars).sort()).toEqual(names);
      expect(vars['--t-paper']).toBe(THEMES[id].paper);
      for (const value of Object.values(vars))
        expect(value).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('colour', () => {
  it("measures a difference as CIEDE2000 does (Sharma's pair)", () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(
      2.0425,
      4,
    );
  });

  it('measures contrast as WCAG does', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('knows a house colour, and a shade of one, and nothing far from them', () => {
    expect(houseColourOf('#E0663A')?.name).toBe('coral');
    expect(houseColourOf('#E46C40')?.name).toBe('coral');
    expect(houseColourOf('#B22222')).toBeNull();
    expect(houseColourOf('#8B1A1A')).toBeNull();
  });
});

describe('recolouring what the artist drew', () => {
  const sample =
    '<svg viewBox="0 0 200 100"><defs><linearGradient id="fade"><stop stop-color="#3D8FD1"/></linearGradient></defs>' +
    '<style>.a{fill:#3d8fd1;stroke:#1F2A37}</style>' +
    '<rect fill="url(#fade)" stroke="#3D8FD180" width="10" height="10"/>' +
    '<circle style="fill: #F4F1EA" r="3"/><path fill="#B22222" d=""/>' +
    '<animate attributeName="fill" values="#3D8FD1;#B22222" dur="1s"/></svg>';

  it('maps every house colour its theme changes, wherever it is painted', () => {
    const out = themedDrawing(sample, THEMES.cleanlab);
    expect(out).not.toMatch(/#3d8fd1/i);
    expect(out).toContain('stop-color="#2F6FDE"');
    expect(out).toContain('.a{fill:#2F6FDE;stroke:#1F2A37}');
    expect(out).toContain('fill: #EEF2F8');
    expect(out).toContain('values="#2F6FDE;#B22222"');
  });

  it('keeps an alpha, an id in url(#…) and a colour of its own (blood red)', () => {
    const out = themedDrawing(sample, THEMES.cleanlab);
    expect(out).toContain('stroke="#2F6FDE80"');
    expect(out).toContain('fill="url(#fade)"');
    expect(out).toContain('fill="#B22222"');
  });

  it('moves a shade of a house colour as far as that colour moves, so its shading stays', () => {
    const lighter = '#5AA2DE'; // a lighter face of sky
    expect(houseColourOf(lighter)?.name).toBe('sky');
    const mapped = drawingColour(lighter, THEMES.cleanlab)!;
    const base = labOf(hexRgb(THEMES.cleanlab.drawingMap.sky)!);
    expect(labOf(hexRgb(mapped)!)[0]).toBeGreaterThan(base[0]);
  });

  it('keeps the dark outlines on a dark theme and cuts the drawing out with a light rim', () => {
    const out = themedDrawing(sample, THEMES.chalkboard);
    expect(out).toContain('stroke:#1F2A37');
    expect(out).toContain('<filter id="t-rim"');
    expect(out).toContain(`flood-color="${THEMES.chalkboard.rim}"`);
    expect(out).toMatch(/<g filter="url\(#t-rim\)">[\s\S]*<\/g><\/svg>$/);
    expect(out.match(/<svg\b/g)).toHaveLength(1);
  });

  it('sizes the rim by the drawing: about 3 px wide on a phone', () => {
    expect(withRim('<svg viewBox="0 0 400 300"></svg>', '#FFF')).toContain(
      'radius="3.6"',
    );
  });

  it('leaves a paper drawing exactly as it was drawn', () => {
    for (const one of FIXTURES)
      expect(themedSvg({ svg: one.svg }, PAPER)).toBe(one.svg);
  });

  it.each(THEME_IDS.filter((id) => id !== 'paper'))(
    'recolours ten drawings of lessons for %s: every house colour it changes gone, their parts kept',
    (id) => {
      const theme = THEMES[id];
      const changed = (Object.keys(HOUSE) as HouseColour[])
        .filter((name) => theme.drawingMap[name] !== HOUSE[name])
        .map((name) => HOUSE[name]);
      for (const one of FIXTURES) {
        const out = themedDrawing(one.svg, theme);
        const left = hexes(out);
        for (const hex of changed) expect(left.has(hex)).toBe(false);
        // Off the palette, left as drawn.
        for (const hex of hexes(one.svg))
          if (!houseColourOf(hex)) expect(left.has(hex)).toBe(true);
        expect(idsOf(out).filter((i) => i !== 't-rim')).toEqual(idsOf(one.svg));
      }
    },
  );

  it('recolours each drawing once per theme and keeps it', () => {
    const thing = { svg: FIXTURES[0].svg };
    const first = themedSvg(thing, THEMES.sunny);
    const kept = themedKept();
    expect(themedSvg(thing, THEMES.sunny)).toBe(first);
    expect(themedKept()).toBe(kept);
    themedSvg(thing, THEMES.nightsky);
    expect(themedKept()).toBe(kept + 1);
  });

  it("gives a person the kit drew a rim, never other colours; and never touches a story's set", () => {
    const person = { svg: sample, rig: true };
    expect(themedSvg(person, THEMES.sunny)).toBe(sample);
    const rimmed = themedSvg(person, THEMES.blueprint);
    expect(rimmed).toContain('t-rim');
    expect(rimmed).toContain('stroke="#3D8FD180"');
    expect(themedSvg({ svg: sample, backdrop: true }, THEMES.nightsky)).toBe(
      sample,
    );
  });
});

describe('recolouring what code drew', () => {
  const drawn = [
    renderChart({
      kind: 'bar',
      unit: '%',
      bars: [
        { label: 'Showers', value: 30 },
        { label: 'Toilets', value: 25 },
        { label: 'Taps', value: 20 },
      ],
    }).svg,
    renderChart({
      kind: 'line',
      unit: null,
      bars: [
        { label: '1990', value: 3 },
        { label: '2000', value: 5 },
      ],
    }).svg,
    renderPlot({
      fn: 'x^2 - 4',
      x: [-3, 3],
      y: null,
      points: [{ x: 2, name: 'root' }],
      xLabel: 'x',
      yLabel: 'y',
    }).svg,
    renderTimeline({
      events: [
        { when: '1911', name: 'Amundsen reaches the Pole' },
        { when: '1912', name: 'Scott reaches the Pole' },
      ],
    }).svg,
    renderQuote({ text: 'We shall stick it out to the end.', phrases: [] }).svg,
  ];

  it('paints with nothing but the paper theme tokens', () => {
    for (const svg of drawn)
      for (const hex of hexes(svg))
        expect(codeColour(hex, THEMES.nightsky)).not.toBeNull();
  });

  it.each(THEME_IDS)('puts every one of them in %s tokens', (id) => {
    const theme = THEMES[id];
    const tokens = new Set(
      [
        theme.paper,
        theme.paperEdge,
        theme.ink,
        theme.muted,
        theme.card,
        theme.accent,
        theme.accent2,
        theme.grid,
        theme.good,
        theme.bad,
        ...theme.chart,
      ].map((c) => c.toUpperCase()),
    );
    for (const svg of drawn)
      for (const hex of hexes(themedCode(svg, theme)))
        expect(tokens.has(hex)).toBe(true);
  });

  it('colours working in the theme ink, as the player does with currentColor', () => {
    expect(
      themedCode(
        '<svg viewBox="0 0 1 1"><g fill="currentColor"/></svg>',
        THEMES.blueprint,
        'math',
      ),
    ).toBe(
      `<svg color="${THEMES.blueprint.ink}" viewBox="0 0 1 1"><g fill="currentColor"/></svg>`,
    );
  });

  it('gives a bar chart one palette colour a bar, in order', () => {
    const svg = drawn[0];
    const fills = [
      ...svg.matchAll(/<rect class="grow[^>]*fill="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(fills).toEqual(PAPER.chart.slice(0, 3));
  });

  it("writes working's pictures in the theme's ink, not the figure kit's dark one", () => {
    const picture =
      '<svg viewBox="0 0 1 1"><text fill="#2d2a32">6 rows of 7</text></svg>';
    expect(themedCode(picture, THEMES.chalkboard, 'math')).toContain(
      `fill="${THEMES.chalkboard.ink}"`,
    );
  });

  it('recolours an older chart, one sky blue, as the theme has that blue', () => {
    const old = '<svg viewBox="0 0 1 1"><rect fill="#3D8FD1"/></svg>';
    expect(themedCode(old, THEMES.nightsky)).toContain(
      `fill="${THEMES.nightsky.accent2}"`,
    );
  });

  it('changes nothing it does not know', () => {
    expect(recolour('<svg><rect fill="#123456"/></svg>', () => null)).toBe(
      '<svg><rect fill="#123456"/></svg>',
    );
  });
});
