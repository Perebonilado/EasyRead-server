import { parseDocument } from 'htmlparser2';
import { elements } from './scene-dom';
import { askedFor, houseSamples, paletteWords } from './scene-house';
import { styleFaults, styleReport } from './scene-polish';
import { optionsKey, ownFeatureScale, ownThingScale } from './scene-sheet';

describe('the house style as the artist is told it', () => {
  it('shows it small samples cut from what code draws, each in the house style', () => {
    const samples = houseSamples();
    expect(samples).toHaveLength(3);
    for (const svg of samples) {
      expect(svg.length).toBeLessThan(1500);
      const root = elements(parseDocument(svg, { xmlMode: true }).children)[0];
      expect(root.name).toBe('svg');
      // Drawn in the kit's units: the kit's line as it is.
      expect(styleFaults(styleReport(svg, 1))).toEqual([]);
      expect(svg).not.toContain('fill-opacity');
    }
    // The face: the neutral face's own group, and the mouth's place marked.
    expect(samples[0]).toContain('id="neutral"');
    expect(samples[0]).toContain('id="mouth-at"');
  });

  it('names every house colour with its hex', () => {
    const words = paletteWords();
    expect(words).toContain('brown coat #8b5e3c');
    expect(words).toContain('sky #cfe6f3');
  });

  it('asks for the kit’s line on the stage, eyes that read, and no part thinner than four lines', () => {
    expect(askedFor(800, 130)).toEqual({ line: 16, eyes: 92, least: 64 });
    expect(askedFor(800, 95).line).toBe(21.9);
    expect(askedFor(800, 230).line).toBe(9);
  });
});

describe('a show’s own, set in the kit’s units', () => {
  const ink = (width: number, height: number) => ({
    x: 0,
    y: 0,
    width,
    height,
  });

  it('scales a thing to its real length, or as drawn', () => {
    // A kite 90 cm long, drawn 180 long: halved to about 119 of the kit's units.
    expect(
      ownThingScale(ink(120, 180), { heightCm: 90, lengthCm: 60 }),
    ).toBeCloseTo((90 * 224) / 170 / 180, 5);
    expect(ownThingScale(ink(40, 30), null)).toBe(1);
  });

  it('scales a feature to its real length when it is long, else its height', () => {
    expect(
      ownFeatureScale(ink(500, 300), { heightCm: 100, lengthCm: 170 }),
    ).toBeCloseTo((170 * 224) / 170 / 500, 5);
  });

  it('keeps the takes not chosen beside the cast', () => {
    expect(optionsKey('studio/abc/cast.json')).toBe(
      'studio/abc/cast-options.json',
    );
  });
});
