import {
  FIGURE_OUTLINES,
  figureHasAnchor,
  guessFigure,
  resolveDrawing,
} from './visual-figures';

describe('what a thing is drawn as', () => {
  it('draws a living thing as a moving figure, even when the library has an icon of it', () => {
    expect(resolveDrawing('tsetse fly')).toMatchObject({
      kind: 'figure',
      figure: { outline: 'insect', manner: 'flutter' },
    });
    expect(resolveDrawing('a mosquito')).toMatchObject({
      kind: 'figure',
      figure: { outline: 'insect' },
    });
    expect(resolveDrawing('cattle')).toMatchObject({
      kind: 'figure',
      figure: { outline: 'quadruped' },
    });
    expect(resolveDrawing('maize')).toMatchObject({
      kind: 'figure',
      figure: { outline: 'plant' },
    });
  });

  it('keeps a still picture for a thing the library draws well, and a role for a person', () => {
    expect(resolveDrawing('bus')).toMatchObject({ kind: 'picture' });
    expect(resolveDrawing('doctor')).toMatchObject({ kind: 'picture' });
    expect(resolveDrawing('farmer')).toMatchObject({
      kind: 'figure',
      figure: { outline: 'person' },
    });
  });

  it('takes the shape the model asked for over its own guess', () => {
    const drawn = resolveDrawing('the parasite', {
      outline: 'segmented',
      parts: ['stripes', 'wings'],
      manner: 'crawl',
    });
    expect(drawn).toMatchObject({
      kind: 'figure',
      figure: { outline: 'segmented', parts: ['stripes'], manner: 'crawl' },
    });
  });

  it('knows which parts a callout can point at', () => {
    const fly = guessFigure('tsetse fly')!;
    expect(figureHasAnchor(fly, 'proboscis')).toBe(true);
    expect(figureHasAnchor(fly, 'head')).toBe(true);
    expect(figureHasAnchor(fly, 'fins')).toBe(false);
    expect(FIGURE_OUTLINES).toContain('insect');
  });
});
