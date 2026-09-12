import { catalogueSpeechCost, costOf, estimatePrepare } from './cost';

describe('the cost of a call', () => {
  it('prices text by tokens and speech by characters, and leaves the unknown null', () => {
    expect(
      costOf({
        task: 'simplify_standard',
        model: 'openai:gpt-4o-mini',
        tokensIn: 1_000_000,
        tokensOut: 0,
      }),
    ).toBe(0.15);
    expect(
      costOf({
        task: 'lecture_verify',
        model: 'openai:gpt-4.1-mini',
        tokensIn: 0,
        tokensOut: 1_000_000,
      }),
    ).toBe(1.6);
    // Fifteen characters a second: a minute is nine hundred characters, and costs the listed cent and a half.
    expect(
      costOf({
        task: 'tts_lecture',
        model: 'openai:gpt-4o-mini-tts',
        tokensIn: 900,
        tokensOut: null,
      }),
    ).toBe(0.015);
    expect(
      costOf({
        task: 'voice_session',
        model: 'openai:gpt-realtime',
        tokensIn: null,
        tokensOut: null,
      }),
    ).toBeNull();
    expect(
      costOf({
        task: 'ocr_document',
        model: 'mistral:ocr',
        tokensIn: 0,
        tokensOut: 0,
      }),
    ).toBeNull();
  });
});

describe('the rented voice', () => {
  it('prices a page by the audio it made at the measured rate, and nothing by nothing', () => {
    // An hour of audio at ten cents an hour is ten cents; a minute is a sixth of a cent.
    expect(catalogueSpeechCost(3_600_000, 0.1)).toBe(0.1);
    expect(catalogueSpeechCost(60_000, 0.1)).toBe(0.001667);
    expect(catalogueSpeechCost(0, 0.1)).toBe(0);
    expect(catalogueSpeechCost(60_000, Number.NaN)).toBe(0);
  });
});

describe('the estimate before the button', () => {
  it('charges text for what is still to run and audio per style asked for and not yet there', () => {
    const estimate = estimatePrepare({
      documents: [
        { pages: 27, needsPipeline: false, hasEasiest: false, styles: [] },
        {
          pages: 27,
          needsPipeline: false,
          hasEasiest: true,
          styles: ['steady'],
        },
      ],
      easiest: true,
      styles: ['steady'],
    });
    expect(estimate.documents).toBe(2);
    expect(estimate.pages).toBe(54);
    // First deck: easiest notes plus steady text. Second: nothing.
    expect(estimate.textUsd).toBeCloseTo(27 * 0.0007 + 27 * 0.003, 4);
    expect(estimate.audioUsd).toBeCloseTo(27 * 0.02, 4);
    expect(estimate.totalUsd).toBeCloseTo(
      estimate.textUsd + estimate.audioUsd,
      4,
    );
  });
});
