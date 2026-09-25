import { cleanExtractedText } from './text';

describe('cleanExtractedText', () => {
  it('reads a symbol-font bullet and a lost dash as the characters they were', () => {
    expect(
      cleanExtractedText(
        '\uF0B7 Incidence rising\n\uFFFD In 1998\uFFFD99, 45,000 cases',
      ),
    ).toBe('• Incidence rising\n• In 1998–99, 45,000 cases');
  });

  it('drops a replacement character that stands for nothing, and unknown symbol glyphs', () => {
    expect(
      cleanExtractedText('T.b. gambiense\uFFFD is common \uF0C5 here'),
    ).toBe('T.b. gambiense is common here');
  });

  it('leaves clean text alone', () => {
    const clean =
      'Epidemics in the DRC and northern Angola.\n• A bullet that survived.';
    expect(cleanExtractedText(clean)).toBe(clean);
  });

  it("reads the Symbol font's maths as the characters it draws", () => {
    // As Word stores Symbol: its codes moved to U+F020 on.
    expect(
      cleanExtractedText(
        'Area = \uF070r\uF0B2, and 6 \uF0B8 2 \uF03D 3, so x \uF0B9 y and \uF053 of \uF061 \uF0A3 \uF0A5',
      ),
    ).toBe('Area = πr″, and 6 ÷ 2 = 3, so x ≠ y and Σ of α ≤ ∞');
  });

  it('never makes a lost character between two numbers a minus', () => {
    expect(cleanExtractedText('3\uFFFD4 = 12')).toBe('3–4 = 12');
    expect(cleanExtractedText('pre\uFFFDoperative')).toBe('pre-operative');
  });

  it('keeps a Wingdings bullet a bullet at the start of a line, and a Greek letter in the middle of one', () => {
    expect(
      cleanExtractedText('\uF06E First point\nThe wavelength \uF06C is 5 m'),
    ).toBe('• First point\nThe wavelength λ is 5 m');
    expect(cleanExtractedText('\uF02D a dash point')).toBe('- a dash point');
  });
});
