import {
  deliveryPieces,
  figureRuns,
  hasFigure,
  stressSentence,
} from './delivery';

const tokens = (sentence: string) => sentence.split(/\s+/);

describe('figures in a sentence', () => {
  it('finds a number the listener should catch, with its unit', () => {
    expect(
      hasFigure('around forty-five thousand new cases were reported'),
    ).toBe(true);
    expect(hasFigure('ten times more than in the nineteen sixties.')).toBe(
      true,
    );
    expect(hasFigure('the dose is nought point five milligrams')).toBe(true);
    expect(hasFigure('In 1998 there were 45,000 cases.')).toBe(true);
    expect(hasFigure('a tenfold rise')).toBe(true);
    expect(hasFigure('five percent of patients')).toBe(true);
  });

  it('leaves everyday number words alone', () => {
    expect(hasFigure('one of the parasites lives in the blood')).toBe(false);
    expect(hasFigure('half the class had seen it')).toBe(false);
    expect(hasFigure('the point is that it spreads')).toBe(false);
    expect(hasFigure('two things follow from this')).toBe(false);
    expect(hasFigure('nineteen ninety-eight to ninety-nine')).toBe(false);
    expect(hasFigure('three of them were children')).toBe(false);
  });

  it('marks the run as token ranges, unit included, and leaves a date out', () => {
    expect(
      figureRuns(tokens('around forty-five thousand new cases were reported')),
    ).toEqual([[1, 2]]);
    expect(
      figureRuns(tokens('ten times more than in the nineteen sixties.')),
    ).toEqual([[0, 1]]);
    expect(figureRuns(tokens('since the nineteen seventies'))).toEqual([]);
    expect(figureRuns(tokens('in two thousand and five'))).toEqual([]);
    expect(figureRuns(tokens('one thousand and fifty patients'))).toEqual([
      [0, 4],
    ]);
  });
});

describe('stress on a sentence', () => {
  it('wraps each count with the stress mark, punctuation outside it, and says a date plain', () => {
    expect(
      stressSentence(
        'In nineteen ninety-eight, around forty-five thousand new cases were reported annually, ten times more than in the nineteen sixties.',
      ),
    ).toBe(
      'In nineteen ninety-eight, around [forty-five thousand](+1) new cases were reported annually, [ten times](+1) more than in the nineteen sixties.',
    );
  });

  it("marks the writer's phrase where its words appear, and only once", () => {
    expect(
      stressSentence(
        'The parasite crosses into the brain, and that is the turn.',
        ['crosses into the brain'],
      ),
    ).toBe('The parasite [crosses into the brain](+1), and that is the turn.');
    expect(stressSentence('Nothing here matches.', ['the brain'])).toBe(
      'Nothing here matches.',
    );
  });

  it('stops a figure at a comma, so a number does not swallow the word after it', () => {
    expect(
      stressSentence(
        'Around twelve patients, three of them children, were seen.',
      ),
    ).toBe('Around [twelve patients](+1), three of them children, were seen.');
    expect(
      stressSentence('Before the nineteen seventies, cases were declining.'),
    ).toBe('Before the nineteen seventies, cases were declining.');
  });

  it('sees a figure on the far side of a dash', () => {
    expect(
      stressSentence('reported annually—ten times more than before.'),
    ).toBe('reported annually — [ten times](+1) more than before.');
  });

  it("does not mark the writer's phrase over a figure", () => {
    expect(stressSentence('ten times more', ['ten times'])).toBe(
      '[ten times](+1) more',
    );
  });
});

describe('the pieces a page becomes', () => {
  it('says a page sentence by sentence, a beat after each, longer after a long one', () => {
    const pieces = deliveryPieces({
      stretches: [
        'The kidney filters the blood. It does so all day, every day, whether the body is resting or working hard, without a pause.',
      ],
      style: 'steady',
      midChapter: false,
      landing: false,
    });
    expect(pieces).toEqual([
      { text: 'The kidney filters the blood.', speed: 0.9, pauseAfter: 0.6 },
      {
        text: 'It does so all day, every day, whether the body is resting or working hard, without a pause.',
        speed: 0.9,
        pauseAfter: 0,
      },
    ]);
    const longer = deliveryPieces({
      stretches: [
        'It does so all day, every day, whether the body is resting or working hard, without a pause. Then it rests.',
      ],
      style: 'steady',
      midChapter: false,
      landing: false,
    });
    expect(longer[0].pauseAfter).toBe(0.7);
  });

  it('breathes after an idea, thinks after a question, and scales both by style', () => {
    const steady = deliveryPieces({
      stretches: [
        'What would happen without it?',
        'It would fail.\n\nAnd so would we. Every time.',
      ],
      style: 'steady',
      midChapter: false,
      landing: false,
    });
    expect(steady.map((piece) => piece.pauseAfter)).toEqual([1.8, 1.2, 0.6, 0]);
    const gentle = deliveryPieces({
      stretches: [
        'What would happen without it?',
        'It would fail.\n\nAnd so would we. Every time.',
      ],
      style: 'gentle',
      midChapter: false,
      landing: false,
    });
    expect(gentle.map((piece) => piece.pauseAfter)).toEqual([
      2.39, 1.6, 0.8, 0,
    ]);
    expect(gentle[0].speed).toBe(0.84);
    const brisk = deliveryPieces({
      stretches: [
        'What would happen without it?',
        'It would fail.\n\nAnd so would we. Every time.',
      ],
      style: 'brisk',
      midChapter: false,
      landing: false,
    });
    expect(brisk.map((piece) => piece.pauseAfter)).toEqual([1.21, 0.8, 0.5, 0]);
    expect(brisk[0].speed).toBe(0.9);
  });

  it('lets a count land: the sentence a touch slower, stressed, with time after it, and never two running', () => {
    const pieces = deliveryPieces({
      stretches: [
        'Cases were declining. Then forty-five thousand were reported. Ten times more than before. That is the trend.',
      ],
      style: 'steady',
      midChapter: false,
      landing: false,
    });
    expect(pieces.map((piece) => piece.speed)).toEqual([0.9, 0.87, 0.9, 0.9]);
    expect(pieces.map((piece) => piece.pauseAfter)).toEqual([0.6, 1, 1, 0]);
    expect(pieces[1].text).toBe(
      'Then [forty-five thousand](+1) were reported.',
    );
    expect(pieces[2].text).toBe('[Ten times](+1) more than before.');
  });

  it("holds the door before a chapter's landing line and slows the line itself", () => {
    const pieces = deliveryPieces({
      stretches: [
        'The fly bites by day. So the day is the danger. That is the whole of it.',
      ],
      style: 'steady',
      midChapter: true,
      landing: true,
    });
    expect(pieces.map((piece) => piece.pauseAfter)).toEqual([0.6, 0.8, 0]);
    expect(pieces.map((piece) => piece.speed)).toEqual([0.9, 0.9, 0.87]);
  });

  it('thinks after the first two questions on a page and breathes after the rest', () => {
    const pieces = deliveryPieces({
      stretches: ['One?', 'Two?', 'Three?', 'Done.'],
      style: 'steady',
      midChapter: false,
      landing: false,
    });
    expect(pieces.map((piece) => piece.pauseAfter)).toEqual([1.8, 1.8, 1.2, 0]);
  });

  it('never leaves a gap shorter than half a second or longer than two and a half', () => {
    const brisk = deliveryPieces({
      stretches: ['Short.', 'Also short.'],
      style: 'brisk',
      midChapter: false,
      landing: false,
    });
    expect(brisk[0].pauseAfter).toBeGreaterThanOrEqual(0.5);
    const gentle = deliveryPieces({
      stretches: ['A question?', 'An answer.'],
      style: 'gentle',
      midChapter: false,
      landing: false,
    });
    expect(gentle[0].pauseAfter).toBeLessThanOrEqual(2.5);
  });
});
