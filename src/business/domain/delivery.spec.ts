import {
  DELIVERY,
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
  it('says a plain page as one piece at the style pace', () => {
    expect(
      deliveryPieces({
        stretches: ['The kidney filters the blood. It does so all day.'],
        style: 'steady',
        midChapter: false,
        landing: false,
      }),
    ).toEqual([
      {
        text: 'The kidney filters the blood. It does so all day.',
        speed: 1,
        pauseAfter: 0,
      },
    ]);
  });

  it('holds at a pause for as long as the style takes, and breathes at a paragraph', () => {
    const pieces = deliveryPieces({
      stretches: [
        'What would happen without it?',
        'It would fail.\n\nAnd so would we.',
      ],
      style: 'gentle',
      midChapter: false,
      landing: false,
    });
    expect(pieces).toEqual([
      {
        text: 'What would happen without it?',
        speed: 0.9,
        pauseAfter: DELIVERY.gentle.hold,
      },
      { text: 'It would fail.', speed: 0.9, pauseAfter: 0.25 },
      { text: 'And so would we.', speed: 0.9, pauseAfter: 0 },
    ]);
    const brisk = deliveryPieces({
      stretches: ['What would happen without it?', 'It would fail.'],
      style: 'brisk',
      midChapter: false,
      landing: false,
    });
    expect(brisk[0].pauseAfter).toBe(DELIVERY.brisk.hold);
    expect(brisk[0].speed).toBe(1.1);
  });

  it('slows the sentence with the figure and stresses the figure, and not two sentences running', () => {
    const pieces = deliveryPieces({
      stretches: [
        'Cases were declining. Then forty-five thousand were reported. Ten times more than before. That is the trend.',
      ],
      style: 'steady',
      midChapter: false,
      landing: false,
    });
    expect(pieces.map((piece) => piece.speed)).toEqual([1, 0.93, 1]);
    expect(pieces[1].text).toBe(
      'Then [forty-five thousand](+1) were reported.',
    );
    expect(pieces[2].text).toBe(
      '[Ten times](+1) more than before. That is the trend.',
    );
  });

  it("quickens a page's opening join mid-chapter, and lands a chapter's last sentence slower", () => {
    const pieces = deliveryPieces({
      stretches: [
        'Because of that, the fly matters. The fly bites by day. So the day is the danger.',
      ],
      style: 'steady',
      midChapter: true,
      landing: true,
    });
    expect(pieces.map((piece) => piece.speed)).toEqual([1.04, 1, 0.93]);
    expect(pieces[2].text).toBe('So the day is the danger.');
  });

  it('breathes rather than holds past the second pause on a page', () => {
    const pieces = deliveryPieces({
      stretches: ['One?', 'Two?', 'Three?', 'Done.'],
      style: 'steady',
      midChapter: false,
      landing: false,
    });
    expect(pieces.map((piece) => piece.pauseAfter)).toEqual([
      0.75, 0.75, 0.3, 0,
    ]);
  });
});
