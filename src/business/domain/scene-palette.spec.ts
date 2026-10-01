import {
  GIVE_ORDER,
  HELD_TOKEN,
  PALETTE_TOKENS,
  clashesInEveryTheme,
  colourOr,
  freeTokens,
  mendPalette,
  nameKey,
  paletteLookup,
  paletteOf,
  paperColour,
  pickPalette,
  tokenColour,
  tokenOf,
  tooClose,
} from './scene-palette';
import { applyPalette, showPalette } from './scene-palette-apply';
import { PAPER, THEMES, THEME_IDS, codeColour } from './scene-themes';
import type { SceneThing } from './scene-script';

describe('a show palette: colours named by theme token', () => {
  it('reads a token however it is written, and never a hex', () => {
    expect(tokenOf('chart2')).toBe('chart2');
    expect(tokenOf('Chart 4')).toBe('chart4');
    expect(tokenOf('chart-0')).toBe('chart0');
    expect(tokenOf('accent 2')).toBe('accent2');
    expect(tokenOf('grey')).toBe('muted');
    expect(tokenOf('#0050BE')).toBeNull();
    expect(tokenOf('red')).toBeNull();
    expect(tokenOf(7)).toBeNull();
  });

  it('draws a token in the paper colour every theme recolours as its own token', () => {
    for (const token of PALETTE_TOKENS)
      for (const id of THEME_IDS)
        expect(codeColour(paperColour(token), THEMES[id])).toBe(
          tokenColour(token, THEMES[id]),
        );
    expect(colourOr(null, PAPER.ink)).toBe(PAPER.ink);
    expect(colourOr('chart1', PAPER.ink)).toBe(PAPER.chart[1]);
  });

  it('makes a stored palette sound: known tokens, one entry a thing, at most eight', () => {
    expect(
      paletteOf([
        { thing: 'The North', token: 'chart0' },
        { thing: 'the north', token: 'chart1' },
        { thing: 'West', token: '#ff0000' },
        { thing: '', token: 'chart2' },
        'nonsense',
        { thing: 'East', token: 'Chart 2' },
      ]),
    ).toEqual([
      { thing: 'The North', token: 'chart0' },
      { thing: 'East', token: 'chart2' },
    ]);
    expect(paletteOf('no')).toEqual([]);
    expect(nameKey('The  Northern Région!')).toBe('northern region');
  });

  it('looks a thing up by its name: whole words, the longest match winning', () => {
    const lookup = paletteLookup([
      { thing: 'North', token: 'chart0' },
      { thing: 'North East', token: 'chart1' },
      { thing: 'Action Group', token: 'chart2' },
    ]);
    expect(lookup('the North')).toBe('chart0');
    expect(lookup("North East's members")).toBe('chart1');
    expect(lookup('AG (Action Group)')).toBe('chart2');
    expect(lookup('Northern Region')).toBeNull();
    expect(lookup('')).toBeNull();
    expect(lookup(null)).toBeNull();
  });
});

describe('a show palette: told apart by colour-blind viewers', () => {
  it('finds colours too close under deuteranopia or protanopia in a theme', () => {
    // A theme's good and its second chart green are near twins.
    const clashes = tooClose(['chart2', 'good'], PAPER);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ a: 'chart2', b: 'good', theme: 'paper' });
    // The chart's own colours are kept apart in every look (theme-check).
    expect(
      clashesInEveryTheme(['chart0', 'chart1', 'chart2', 'chart3', 'chart4', 'chart5']),
    ).toEqual([]);
  });

  it('gives five things five colours apart in every look, holding the chart red back', () => {
    const { palette, held } = pickPalette(['North', 'West', 'East', 'Britain', 'Lagos']);
    expect(held).toBe(HELD_TOKEN);
    expect(palette.map((p) => p.token)).toEqual(['chart0', 'chart1', 'chart2', 'chart4', 'chart5']);
    expect(palette.some((p) => p.token === held)).toBe(false);
    expect(clashesInEveryTheme([...palette.map((p) => p.token), held])).toEqual([]);
    // Never right or wrong's colour for a side.
    expect(palette.some((p) => p.token === 'good' || p.token === 'bad')).toBe(false);
  });

  it('keeps what an earlier episode coloured, and gives a newcomer a free colour', () => {
    const { palette } = pickPalette(['North', 'Press'], {
      keep: [{ thing: 'North', token: 'chart4' }],
    });
    expect(palette).toEqual([
      { thing: 'North', token: 'chart4' },
      { thing: 'Press', token: 'chart0' },
    ]);
  });

  it('mends a palette without a word: the held colour, right and wrong, and a clash each given another', () => {
    const { palette, mended } = mendPalette([
      { thing: 'North', token: 'chart0' },
      { thing: 'West', token: 'chart3' },
      { thing: 'East', token: 'bad' },
      { thing: 'Lagos', token: 'chart0' },
    ]);
    expect(palette.map((p) => p.token)).toEqual(['chart0', 'chart1', 'chart2', 'chart4']);
    expect(mended).toHaveLength(3);
    expect(freeTokens(palette)).toEqual(GIVE_ORDER.filter((t) => !['chart0', 'chart1', 'chart2', 'chart4', 'chart3'].includes(t)));
  });
});

describe('a show palette: put on what code draws', () => {
  const show = showPalette([
    { thing: 'North', token: 'chart0' },
    { thing: 'Action Group', token: 'chart2' },
  ]);

  it("colours a chamber's named groups, and the rest from what is free", () => {
    const thing = {
      id: 'house',
      kind: 'seats',
      name: '',
      seats: {
        layout: 'hemicycle',
        groups: [
          { name: 'NPC (North)', seats: 134, colour: null },
          { name: 'Action Group', seats: 73, colour: null },
          { name: 'Others', seats: 16, colour: null },
        ],
        majority: false,
        label: null,
        source: null,
      },
    } as SceneThing;
    const coloured = applyPalette(thing, show);
    expect(coloured.kind === 'seats' && coloured.seats.groups.map((g) => g.colour)).toEqual([
      'chart0',
      'chart2',
      'chart1',
    ]);
  });

  it("colours a chart's bars by their labels, and a name card by its person", () => {
    const chart = applyPalette(
      {
        id: 'c',
        kind: 'chart',
        name: 'Seats',
        chart: { kind: 'bar', unit: null, bars: [{ label: 'North', value: 3 }, { label: 'South', value: 2 }] },
      } as SceneThing,
      show,
    );
    expect(chart.kind === 'chart' && chart.chart.bars.map((b) => b.colour)).toEqual(['chart0', 'chart1']);
    const card = applyPalette(
      {
        id: 'n',
        kind: 'namecard',
        name: '',
        namecard: { name: 'Action Group', role: null, line: null, colour: 'chart5', bust: null },
      } as SceneThing,
      show,
    );
    expect(card.kind === 'namecard' && card.namecard.colour).toBe('chart2');
  });

  it('leaves a thing with no colour as it was', () => {
    const words = { id: 'w', kind: 'words', text: 'North', style: 'keyword' } as SceneThing;
    expect(applyPalette(words, show)).toBe(words);
  });
});
