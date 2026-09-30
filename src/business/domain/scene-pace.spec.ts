import {
  AUDIENCE_BANDS,
  BASE_WPM,
  DENSITY_FLOOR,
  SILENCE_BUDGET,
  TEMPO_RANGE,
  bandOfStage,
  densityOf,
  lessonPace,
  motionFactor,
  paceReport,
  paceWordFor,
  paceWords,
  syllablesOf,
  pauseLimits,
  shapePause,
  speechSeconds,
  targetWpm,
  tempoFor,
  voiceRate,
  voiceRatesOf,
  withinBudget,
} from './scene-pace';

describe('the target rate', () => {
  const plain = {
    say: 'The heart pumps blood around the body.',
    delivery: 'explain' as const,
  };

  it('rises with the band, from the youngest to adults', () => {
    const order = [
      'early-years',
      'primary-lower',
      'primary-upper',
      'secondary-lower',
      'secondary-upper',
      'university',
    ] as const;
    const rates = order.map((band) => targetWpm(plain, { band }));
    for (let i = 1; i < rates.length; i += 1)
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    expect(targetWpm(plain, { band: 'general-adult' })).toBe(155);
  });

  it('is slower for a viewer new to it, a learner of the language, and a relaxed maker; quicker when revising', () => {
    const base = targetWpm(plain, { band: 'university' });
    expect(targetWpm(plain, { band: 'university', prior: 'new' })).toBeLessThan(
      base,
    );
    expect(targetWpm(plain, { band: 'university', language: 'learning' })).toBe(
      Math.round(base * 0.9),
    );
    expect(
      targetWpm(plain, { band: 'university', maker: 'relaxed' }),
    ).toBeLessThan(base);
    expect(
      targetWpm(plain, { band: 'university', prior: 'revising' }),
    ).toBeGreaterThan(base);
    expect(
      targetWpm(plain, { band: 'university', maker: 'brisk' }),
    ).toBeGreaterThan(base);
  });

  it('slows a key point and quickens a recap', () => {
    const base = targetWpm(plain, { band: 'general-adult' });
    expect(
      targetWpm({ ...plain, delivery: 'key' }, { band: 'general-adult' }),
    ).toBeLessThan(base);
    expect(
      targetWpm({ ...plain, delivery: 'recap' }, { band: 'general-adult' }),
    ).toBeGreaterThan(base);
  });

  it('holds a nudge from the chat within its range', () => {
    const base = targetWpm(plain, { band: 'general-adult' });
    expect(targetWpm(plain, { band: 'general-adult', nudge: 3 })).toBe(
      Math.round(base * 1.14),
    );
  });
});

describe('density', () => {
  it('slows for new terms, a number with its unit, and a long sentence', () => {
    expect(
      densityOf('A plain short sentence here.', { band: 'general-adult' }),
    ).toBe(1);
    expect(
      densityOf('Osmosis moves water.', {
        band: 'general-adult',
        terms: ['osmosis'],
      }),
    ).toBeCloseTo(0.94);
    expect(densityOf('It weighs 5 kg.', { band: 'general-adult' })).toBeCloseTo(
      0.95,
    );
    expect(
      densityOf('Then F = m a holds.', { band: 'general-adult' }),
    ).toBeCloseTo(0.95);
    expect(densityOf('We counted 3 apples.', { band: 'general-adult' })).toBe(
      1,
    );
    const long = Array.from({ length: 14 }, () => 'word').join(' ');
    expect(densityOf(long, { band: 'early-years' })).toBeCloseTo(0.96);
  });

  it('never goes below its floor', () => {
    const packed = densityOf(
      'Mitosis, meiosis, cytokinesis and interphase take 24 hours = one cycle, said in a very long sentence for the youngest viewers.',
      {
        band: 'early-years',
        terms: ['mitosis', 'meiosis', 'cytokinesis', 'interphase'],
      },
    );
    expect(packed).toBe(DENSITY_FLOOR);
  });
});

describe('pause shaping', () => {
  it('takes the largest reason, not the sum', () => {
    const shaped = shapePause(
      [
        { reason: 'end', seconds: 0.35 },
        { reason: 'term', seconds: 0.7 },
      ],
      'general-adult',
    );
    expect(shaped.seconds).toBe(0.7);
  });

  it('adds a little where two reasons beyond the end agree', () => {
    const shaped = shapePause(
      [
        { reason: 'end', seconds: 0.35 },
        { reason: 'idea', seconds: 0.75 },
        { reason: 'before-key', seconds: 0.55 },
      ],
      'general-adult',
    );
    expect(shaped.seconds).toBe(0.9);
  });

  it('holds each reason to its band: a question waits longer for a child', () => {
    const q = [{ reason: 'question' as const, seconds: 0.75 }];
    expect(shapePause(q, 'primary-upper').seconds).toBeGreaterThanOrEqual(
      pauseLimits('primary-upper').question[0],
    );
    expect(shapePause(q, 'general-adult').seconds).toBeLessThanOrEqual(1.2);
    expect(
      shapePause([{ reason: 'end', seconds: 3 }], 'general-adult').seconds,
    ).toBe(0.45);
  });

  it('keeps a hold as it is, outside the budget', () => {
    const held = shapePause(
      [
        { reason: 'end', seconds: 0.35 },
        { reason: 'hold', seconds: 6 },
      ],
      'general-adult',
    );
    expect(held).toMatchObject({ seconds: 6, held: true });
  });

  it('keeps the silence within the budget, shaving plain ends first and never below their floors', () => {
    const idea = shapePause(
      [{ reason: 'idea', seconds: 0.9 }],
      'general-adult',
    );
    const end = shapePause([{ reason: 'end', seconds: 0.45 }], 'general-adult');
    const pauses = [end, idea, end, idea, end, end];
    const speech = 6;
    const out = withinBudget(pauses, speech, 'general-adult');
    const counted = out.slice(0, -1).reduce((n, s) => n + s, 0);
    const budget = SILENCE_BUDGET['general-adult'];
    expect(counted / (counted + speech)).toBeLessThanOrEqual(budget + 0.01);
    expect(out[0]).toBeGreaterThanOrEqual(end.floor);
    expect(out[1]).toBeGreaterThanOrEqual(idea.floor);
    // The last is where the scene's last moments play: left as it was.
    expect(out[5]).toBe(end.seconds);
    // Plain ends are shaved before an idea changing.
    expect(out[0] / end.seconds).toBeLessThanOrEqual(out[1] / idea.seconds);
  });

  it('leaves pauses that are within budget alone', () => {
    const end = shapePause([{ reason: 'end', seconds: 0.35 }], 'general-adult');
    expect(withinBudget([end, end, end], 60, 'general-adult')).toEqual([
      0.35, 0.35, 0.35,
    ]);
  });
});

describe('a lesson as the voice is sent it', () => {
  const beats = [
    {
      say: 'Why does ice float on water?',
      delivery: 'hook' as const,
      pause: 'short' as const,
    },
    {
      say: 'Water expands as it freezes into ice.',
      delivery: 'explain' as const,
      pause: 'short' as const,
    },
    {
      say: 'So ice is less dense than water.',
      delivery: 'key' as const,
      pause: 'long' as const,
    },
    {
      say: 'What would happen if it sank?',
      delivery: 'question' as const,
      pause: 'short' as const,
    },
  ];

  it('asks a voice for its target over its own rate, within the speeds it takes', () => {
    const paced = lessonPace(
      beats,
      { band: 'primary-upper' },
      { naturalWpm: 170 },
    );
    for (const piece of paced) {
      expect(piece.speed).toBeCloseTo(piece.targetWpm / 170, 1);
      expect(piece.speed).toBeGreaterThanOrEqual(0.5);
    }
    expect(paced[2].targetWpm).toBeLessThan(paced[1].targetWpm);
  });

  it('is slower and waits longer for a young child than for an adult', () => {
    const child = lessonPace(
      beats,
      { band: 'early-years' },
      { naturalWpm: 160 },
    );
    const adult = lessonPace(
      beats,
      { band: 'general-adult' },
      { naturalWpm: 160 },
    );
    expect(child[1].targetWpm).toBeLessThan(adult[1].targetWpm);
    expect(child[3].pauseAfter).toBeGreaterThan(adult[3].pauseAfter);
  });

  it('keeps its planned silence within its budget', () => {
    const paced = lessonPace(
      beats,
      { band: 'general-adult' },
      { naturalWpm: 160 },
    );
    const speech = beats.reduce(
      (n, b, i) => n + speechSeconds(b.say, paced[i].targetWpm),
      0,
    );
    const silence = paced.slice(0, -1).reduce((n, p) => n + p.pauseAfter, 0);
    expect(silence / (speech + silence)).toBeLessThanOrEqual(
      SILENCE_BUDGET['general-adult'] + 0.02,
    );
  });
});

describe('the stretch', () => {
  it('leaves a sentence within 6 % of its target', () => {
    expect(tempoFor(150, 155)).toEqual({ tempo: 1, beyond: false });
    expect(tempoFor(null, 155)).toEqual({ tempo: 1, beyond: false });
  });

  it('brings one further off to its target, held to the range', () => {
    expect(tempoFor(170, 155).tempo).toBeCloseTo(155 / 170, 3);
    expect(tempoFor(100, 155)).toEqual({ tempo: TEMPO_RANGE[1], beyond: true });
    expect(tempoFor(250, 155)).toEqual({ tempo: TEMPO_RANGE[0], beyond: true });
  });
});

describe('what the voice came out as', () => {
  it('measures words a minute, the silence share and the longest pause', () => {
    const report = paceReport([
      {
        text: 'open river stone lake bright',
        startMs: 0,
        endMs: 2000,
        words: [
          [0, 3, 0, 300],
          [4, 7, 350, 700],
          [8, 13, 750, 1100],
          [14, 18, 1150, 1500],
          [19, 23, 1550, 2000],
        ],
      },
      {
        text: 'open river stone lake bright',
        startMs: 3000,
        endMs: 5000,
        words: [
          [0, 3, 3000, 3300],
          [4, 9, 3350, 3700],
          [10, 15, 3750, 4100],
          [16, 20, 4150, 4500],
          [21, 24, 4550, 5000],
        ],
      },
    ]);
    // Five words of seven syllables: five words of average length.
    expect(report.wpm).toBe(150);
    expect(report.plainWpm).toBe(150);
    expect(report.longestPauseMs).toBe(1000);
    expect(report.silenceShare).toBeCloseTo(0.2, 2);
    expect(report.sentences).toEqual([150, 150]);
  });
});

describe('a voice’s own rate', () => {
  it('is its measured rate where there is one, else its engine’s guess', () => {
    const rates = voiceRatesOf({
      kokoro: { am_puck: { wpm: 172 } },
      gemini: { bogus: { wpm: 'x' } },
    });
    expect(voiceRate(rates, 'kokoro', 'am_puck').wpm).toBe(172);
    expect(voiceRate(rates, 'kokoro', 'af_heart').wpm).toBe(183);
    expect(voiceRate(rates, 'kokoro', 'bf_emma').wpm).toBe(185);
    expect(rates.gemini).toBeUndefined();
  });

  it('chooses Gemini’s pace word by its measured rate', () => {
    const rate = {
      wpm: 150,
      words: { 'brisk and clear': 170, natural: 150, unhurried: 128 },
    };
    expect(paceWordFor(rate, 125)).toBe('unhurried');
    expect(paceWordFor(rate, 152)).toBe('natural');
    expect(paceWordFor(rate, 168)).toBe('brisk and clear');
  });
});

describe('bands', () => {
  it('reads a book’s stage as a band', () => {
    expect(bandOfStage('early')).toBe('primary-upper');
    expect(bandOfStage(null)).toBe('general-adult');
    for (const band of AUDIENCE_BANDS)
      expect(BASE_WPM[band]).toBeGreaterThan(100);
  });

  it('moves the picture more slowly for the young, leaned by the maker', () => {
    expect(motionFactor('early-years')).toBe(0.75);
    expect(motionFactor('general-adult')).toBe(1);
    expect(motionFactor('general-adult', 'brisk')).toBe(1.08);
    expect(motionFactor('early-years', 'relaxed')).toBe(0.7);
  });
});

describe('words of average length', () => {
  it('counts syllables near enough to time speech by', () => {
    const counts = [
      'make',
      'makes',
      'table',
      'jumped',
      'wanted',
      'free',
      'people',
      'evaporation',
      'the',
    ].map(syllablesOf);
    expect(counts).toEqual([1, 1, 2, 2 - 1, 2, 1, 2, 5, 1]);
    expect(syllablesOf('1918')).toBe(2);
  });

  it('measures a sentence of long words as the same pace as one of short words, said alike', () => {
    // Long words take longer to say: the same voice is not slower for them.
    const short = paceWords('the cat sat on the mat');
    const long = paceWords('the percentage change in quantity demanded');
    expect(long / 6).toBeGreaterThan(short / 6);
    expect(paceWords('open river stone lake bright')).toBeCloseTo(5, 5);
  });
});
