import {
  catalogueSpeechCost,
  costOf,
  estimatePrepare,
  voiceSessionCost,
} from './cost';

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
        task: 'tts_standard',
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
    // A page of lecture audio is priced by the voice job itself, not here.
    expect(
      costOf({
        task: 'tts_lecture',
        model: 'modal:kokoro-82m',
        tokensIn: 900,
        tokensOut: null,
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
        { pages: 27, needsPipeline: false, styles: [] },
        { pages: 27, needsPipeline: false, styles: ['steady'] },
        // Words written at upload, no audio yet: audio alone.
        { pages: 10, needsPipeline: false, styles: [], scripted: ['steady'] },
      ],
      styles: ['steady'],
      usdPerAudioHour: 0.03,
    });
    expect(estimate.documents).toBe(3);
    expect(estimate.pages).toBe(64);
    // First deck: steady text. Second: nothing. Third: no text.
    expect(estimate.textUsd).toBeCloseTo(27 * 0.003, 4);
    // Thirty-seven pages of narration at a minute and a third each, three cents an hour.
    expect(estimate.audioUsd).toBeCloseTo((37 * 1.33 * 0.03) / 60, 4);
    expect(estimate.totalUsd).toBeCloseTo(
      estimate.textUsd + estimate.audioUsd,
      4,
    );
  });

  it('charges the pipeline for a document not yet read, and prices audio as free until the voice is measured', () => {
    const estimate = estimatePrepare({
      documents: [{ pages: 100, needsPipeline: true, styles: [] }],
      styles: ['steady', 'brisk'],
      usdPerAudioHour: 0,
    });
    expect(estimate.textUsd).toBeCloseTo(100 * 0.002 + 200 * 0.003, 4);
    expect(estimate.audioUsd).toBe(0);
    expect(estimate.totalUsd).toBe(estimate.textUsd);
  });
});

describe('voiceSessionCost', () => {
  const rates = { livekit: 0.004, openai: 0.015, elevenlabs: 0.08 };

  it('prices a session by its minutes at the line it ran on', () => {
    expect(voiceSessionCost('livekit', 600, rates)).toBe(0.04);
    expect(voiceSessionCost('openai', 600, rates)).toBe(0.15);
    expect(voiceSessionCost('elevenlabs', 60, rates)).toBe(0.08);
  });

  it('gives no price for an unknown line or no time', () => {
    expect(voiceSessionCost('other', 600, rates)).toBeNull();
    expect(voiceSessionCost('livekit', 0, rates)).toBeNull();
  });
});
