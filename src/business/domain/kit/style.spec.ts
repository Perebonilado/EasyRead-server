/**
 * The kit's style: the look's colours become a piece's fills (a side's
 * colour, its shade, its lit rim), mixed in OKLab so a tint keeps its
 * hue; the editorial look draws no outline, the illustrated one does.
 */
import type { ShotLookDto } from '../../../contracts';
import {
  colourOf,
  fillsOf,
  hazed,
  hexOfOklab,
  kitStyle,
  luminance,
  mixOk,
  oklabOf,
  shadeOk,
} from './style';

const LOOK: ShotLookDto = {
  palette: {
    paper: '#F4EFE6',
    ink: '#1D232B',
    muted: '#646B76',
    accent: '#D9480F',
    sides: { North: '#0050BE', South: '#BB7907' },
  },
  fonts: { display: 'Plus Jakarta Sans', text: 'Plus Jakarta Sans' },
  grain: 0.15,
  motion: 'springy',
};

describe('the kit’s style', () => {
  it('round-trips colours through OKLab', () => {
    for (const hex of ['#000000', '#ffffff', '#0050be', '#bb7907', '#1d232b'])
      expect(hexOfOklab(oklabOf(hex))).toBe(hex);
  });

  it('mixes and shades, keeping a colour’s hue', () => {
    expect(mixOk('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixOk('#000000', '#ffffff', 1)).toBe('#ffffff');
    const blue = oklabOf('#0050be');
    const darker = oklabOf(shadeOk('#0050be', 0.2));
    expect(darker[0]).toBeLessThan(blue[0]);
    // The hue (the angle of a and b) stays within a few degrees.
    const hue = (lab: number[]) => Math.atan2(lab[2], lab[1]);
    expect(Math.abs(hue(darker) - hue(blue))).toBeLessThan(0.08);
  });

  it('draws the editorial look without outlines and the illustrated one with them', () => {
    expect(kitStyle(LOOK).line).toBe(0);
    expect(kitStyle(LOOK, { look: 'illustrated' }).line).toBeGreaterThan(0);
    expect(kitStyle(LOOK, { shape: 'tall' }).shape).toBe('tall');
  });

  it('finds a side’s colour by its name, a role by its word, the ink for anything else', () => {
    const style = kitStyle(LOOK);
    expect(colourOf(style, 'north')).toBe('#0050BE');
    expect(colourOf(style, 'accent')).toBe('#D9480F');
    expect(colourOf(style, 'Martians')).toBe('#1D232B');
    expect(colourOf(style, undefined)).toBe('#1D232B');
  });

  it('works out a piece’s fills from one colour: a shade darker, a rim lighter', () => {
    const style = kitStyle(LOOK);
    const fills = fillsOf(style, '#0050BE');
    expect(fills.body).toBe('#0050BE');
    expect(luminance(fills.shade)).toBeLessThan(luminance(fills.body));
    expect(luminance(fills.rim)).toBeGreaterThan(luminance(fills.body));
    // The ink, nearly black, has a shade a little toward the paper, never blacker.
    const ink = fillsOf(style, style.ink);
    expect(luminance(ink.shade)).toBeGreaterThanOrEqual(luminance(style.ink));
  });

  it('fades far things toward the paper', () => {
    const style = kitStyle(LOOK);
    expect(hazed(style, '#0050BE', 0)).toBe('#0050be');
    expect(luminance(hazed(style, '#0050BE', 1))).toBeGreaterThan(
      luminance('#0050BE'),
    );
  });

  it('keeps a lighter rim and a darker shadow on a dark ground', () => {
    const dark = kitStyle({
      ...LOOK,
      palette: { ...LOOK.palette, paper: '#101820', ink: '#E8EEF4' },
    });
    expect(dark.shadow.opacity).toBeGreaterThan(kitStyle(LOOK).shadow.opacity);
  });
});
