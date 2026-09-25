import { sayLatex, startMathsSpeech, mathsSpeechReady } from './maths-speech';
import { spokenForm } from './spoken';

describe('maths said aloud', () => {
  it('says the common things even before the full reader loads', () => {
    expect(sayLatex('x^2 + 3x = 10')).toContain('squared');
    expect(sayLatex('\\frac{1}{2}')).toBe('a half');
  });

  it('says maths as a teacher does, once the reader has loaded', async () => {
    await startMathsSpeech();
    expect(mathsSpeechReady()).toBe(true);
    expect(sayLatex('x^2 + 3x = 10')).toBe('x squared plus 3 x equals 10');
    expect(sayLatex('\\sqrt{2}')).toBe('the square root of 2');
    expect(sayLatex('5\\% \\times 200{,}000')).toBe('5 percent times 200,000');
    expect(sayLatex('\\sigma \\approx 2.45')).toBe('sigma is about 2.45');
    expect(sayLatex('v = 11\\,\\text{m/s}')).toContain('metres per second');
  }, 30000);

  it('speaks maths between dollar signs and signs on their own, one written word to its spoken ones', async () => {
    await startMathsSpeech();
    const text = 'So $x^2 + 3x = 10$, and 4 × 5 = 20 cm².';
    const spoken = spokenForm(text);
    expect(spoken.text).toContain('x squared plus 3 x equals 10,');
    expect(spoken.text).toContain('times');
    expect(spoken.text).toContain('equals');
    expect(spoken.text).toContain('squared');
    expect(spoken.spans).toHaveLength((text.match(/\S+/g) ?? []).length);
  }, 30000);
});
