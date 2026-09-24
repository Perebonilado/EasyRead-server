import { findPhrase, isVerbatim, renderQuote } from './scene-quote';

const POEM = `I wandered lonely as a cloud
That floats on high o'er vales and hills,
When all at once I saw a crowd,
A host, of golden daffodils;`;

describe('the text set in its own words', () => {
  it('finds a phrase whatever its case and punctuation', () => {
    const words = POEM.split(/\s+/);
    expect(findPhrase(words, 'lonely as a cloud')).toBe(2);
    expect(findPhrase(words, 'GOLDEN DAFFODILS')).toBe(words.length - 2);
    expect(findPhrase(words, 'a field of tulips')).toBe(-1);
  });

  it("tells the page's own words from a paraphrase", () => {
    const page = `Wordsworth wrote: ${POEM} It was published in 1807.`;
    expect(isVerbatim('When all at once I saw a crowd,', page)).toBe(true);
    expect(isVerbatim('When suddenly I saw a crowd', page)).toBe(false);
  });

  it("keeps the poem's lines, marks each phrase, and hands its note to the stage", () => {
    const set = renderQuote({
      text: POEM,
      phrases: [
        {
          name: 'simile',
          phrase: 'lonely as a cloud',
          note: 'simile: alone and drifting',
        },
        { name: 'host', phrase: 'A host, of golden daffodils', note: null },
        { name: 'missing', phrase: 'roses', note: 'never there' },
      ],
    });
    expect(set.parts).toEqual({ simile: 'phrase-simile', host: 'phrase-host' });
    expect(set.svg.match(/<text x="118"/g)).toHaveLength(4);
    expect(set.svg).toContain('<tspan id="phrase-simile">');
    expect(set.callouts).toEqual([
      expect.objectContaining({
        part: 'simile',
        text: 'simile: alone and drifting',
      }),
    ]);
    expect(set.viewBox[3]).toBeGreaterThan(4 * 44);
  });

  it('brings each note in from the margin: past the end of its line, or before the rule', () => {
    const set = renderQuote({
      text: POEM,
      phrases: [
        { name: 'simile', phrase: 'lonely as a cloud', note: 'alone' },
        { name: 'crowd', phrase: 'a crowd, A host', note: 'people' },
      ],
    });
    const [simile, crowd] = set.callouts;
    // The simile's leader from the right stops past "cloud", the end of its
    // line; from the left, before the rule, on the same line.
    expect(simile.ends!.right[0]).toBeGreaterThan(simile.anchor[0]);
    expect(simile.ends!.right[1]).toBe(simile.anchor[1]);
    expect(simile.ends!.left[0]).toBeLessThan(40);
    expect(simile.ends!.left[1]).toBe(simile.anchor[1]);
    // A phrase that runs onto the next line is reached from the right at
    // the end of that line, and from the left at the line it starts on.
    expect(crowd.ends!.right[1]).toBeGreaterThan(crowd.anchor[1]);
    expect(crowd.ends!.left[1]).toBe(crowd.anchor[1]);
    expect(set.size).toBe(44);
  });

  it('wraps a long line to fit, and a phrase that runs on keeps one id', () => {
    const set = renderQuote({
      text: 'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief',
      phrases: [
        {
          name: 'contrast',
          phrase: 'age of wisdom, it was the age of foolishness',
          note: null,
        },
      ],
    });
    expect(set.svg.match(/<text /g)!.length).toBeGreaterThan(2);
    expect(set.svg.match(/id="phrase-contrast"/g)).toHaveLength(1);
  });
});
