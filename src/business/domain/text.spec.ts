import { cleanExtractedText } from './text';

describe('cleanExtractedText', () => {
  it('reads a symbol-font bullet and a lost dash as the characters they were', () => {
    expect(
      cleanExtractedText(' Incidence rising\n� In 1998�99, 45,000 cases'),
    ).toBe('• Incidence rising\n• In 1998-99, 45,000 cases');
  });

  it('drops a replacement character that stands for nothing, and unknown symbol glyphs', () => {
    expect(cleanExtractedText('T.b. gambiense� is common  here')).toBe(
      'T.b. gambiense is common here',
    );
  });

  it('leaves clean text alone', () => {
    const clean =
      'Epidemics in the DRC and northern Angola.\n• A bullet that survived.';
    expect(cleanExtractedText(clean)).toBe(clean);
  });
});
