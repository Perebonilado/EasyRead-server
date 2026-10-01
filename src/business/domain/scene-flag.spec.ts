import {
  MAX_FLAGS,
  countriesIn,
  countryOf,
  readFlags,
} from './scene-flag-names';
import { flagInner, renderFlags } from './scene-flag';
import { THEMES, themedCode } from './scene-themes';

describe('flags: names read by code', () => {
  it.each([
    ['Kenya', 'ke'],
    ['the USA', 'us'],
    ['United States of America', 'us'],
    ['America', 'us'],
    ['UK', 'gb'],
    ['Great Britain', 'gb'],
    ['England', 'gb-eng'],
    ['Scotland', 'gb-sct'],
    ['Ivory Coast', 'ci'],
    ["Côte d'Ivoire", 'ci'],
    ['DRC', 'cd'],
    ['Democratic Republic of the Congo', 'cd'],
    ['Republic of the Congo', 'cg'],
    ['Holland', 'nl'],
    ['Türkiye', 'tr'],
    ['Turkey', 'tr'],
    ['South Korea', 'kr'],
    ['North Korea', 'kp'],
    ['Burma', 'mm'],
    ['Swaziland', 'sz'],
    ['the Gambia', 'gm'],
    ['St Lucia', 'lc'],
    ['UAE', 'ae'],
    ['flag of Japan', 'jp'],
    ['Viet Nam', 'vn'],
    ['Papua New Guinea', 'pg'],
    ['New Zealand', 'nz'],
    ['Peru', 'pe'],
  ])('%s is %s', (name, code) => {
    expect(countryOf(name)?.code).toBe(code);
  });

  it('never guesses a country it does not know', () => {
    expect(countryOf('Narnia')).toBeNull();
    expect(countryOf('Atlantis')).toBeNull();
    expect(countryOf('')).toBeNull();
  });

  it('finds the countries a sentence names, in order, each once, a shorter name inside a longer one not again', () => {
    expect(
      countriesIn(
        'the flags of Ghana, Papua New Guinea and the Democratic Republic of the Congo, and Niger',
      ).map((c) => c.code),
    ).toEqual(['gh', 'pg', 'cd', 'ne']);
    expect(countriesIn('a red flag on a pole')).toEqual([]);
  });

  it('reads a picture of flags: what it knows, once each, and what it does not', () => {
    const read = readFlags(['USA', 'United States', 'Brazil', 'Narnia']);
    expect(read.flags.map((f) => [f.code, f.said])).toEqual([
      ['us', 'USA'],
      ['br', 'Brazil'],
    ]);
    expect(read.unknown).toEqual(['Narnia']);
    const many = readFlags([
      'Kenya',
      'India',
      'Peru',
      'Japan',
      'Fiji',
      'Chile',
      'Spain',
      'Egypt',
    ]);
    expect(many.flags).toHaveLength(MAX_FLAGS);
  });
});

describe('flags: drawn by code', () => {
  const five = readFlags([
    'Brazil',
    'Kenya',
    'Japan',
    'Germany',
    'Australia',
  ]).flags;

  it('draws each flag as a part by the name the writer gave it, its ids its own', () => {
    const drawn = renderFlags({ flags: five }, 'wide');
    expect(Object.keys(drawn.parts)).toEqual([
      'Brazil',
      'Kenya',
      'Japan',
      'Germany',
      'Australia',
    ]);
    const ids = [...drawn.svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    // Every reference is to an id it has.
    for (const m of drawn.svg.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g))
      expect(ids).toContain(m[1] ?? m[2]);
    expect(drawn.svg).not.toMatch(/<script|<image|xlink:|javascript:/i);
    // Several flags carry their names under them, and come in one by one.
    expect(drawn.svg).toContain('>Kenya<');
    expect(drawn.moves).toBe(true);
  });

  it('keeps a flag its own colours in every look', () => {
    // Japan's white and red; the white is the paper theme's card token, moved a shade off it.
    const japan = flagInner('jp');
    for (const theme of Object.values(THEMES))
      expect(themedCode(japan, theme)).toBe(japan);
    expect(japan).not.toMatch(/#fff\b|#ffffff\b/i);
  });

  it('is laid out for the film: wide in a row or two, tall in a column', () => {
    const wide = renderFlags({ flags: five }, 'wide');
    const tall = renderFlags({ flags: five }, 'tall');
    const aspect = (v: number[]) => v[2] / v[3];
    expect(aspect(wide.viewBox)).toBeGreaterThan(aspect(tall.viewBox));
    expect(aspect(tall.viewBox)).toBeLessThan(1);
    expect(wide.viewBox[2]).toBeLessThanOrEqual(1400 + 8);
    expect(tall.viewBox[3]).toBeLessThanOrEqual(780 + 8);
  });

  it('sets its names at its audience size at least', () => {
    const child = renderFlags({ flags: five }, 'wide', 48);
    const sizes = [...child.svg.matchAll(/font-size="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(48);
  });

  it('stays small: five common flags well under 50 KB', () => {
    expect(renderFlags({ flags: five }, 'wide').svg.length).toBeLessThan(
      50 * 1024,
    );
  });
});
