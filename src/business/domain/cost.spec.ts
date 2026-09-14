import {
  catalogueSpeechCost,
  costOf,
  estimatePrepare,
  perPageByChannel,
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
        // Words written at upload, no audio yet: audio alone.
        {
          pages: 10,
          needsPipeline: false,
          hasEasiest: true,
          styles: [],
          scripted: ['steady'],
        },
      ],
      easiest: true,
      styles: ['steady'],
    });
    expect(estimate.documents).toBe(3);
    expect(estimate.pages).toBe(64);
    // First deck: easiest notes plus steady text. Second: nothing. Third: no text.
    expect(estimate.textUsd).toBeCloseTo(27 * 0.0007 + 27 * 0.003, 4);
    expect(estimate.audioUsd).toBeCloseTo(27 * 0.02 + 10 * 0.02, 4);
    expect(estimate.totalUsd).toBeCloseTo(
      estimate.textUsd + estimate.audioUsd,
      4,
    );
  });
});

describe('the rented text model', () => {
  it('is priced per million tokens at the measured rate, and unknown until measured', () => {
    const call = {
      task: 'lecture_segment',
      model: 'modal:Kimi-K3',
      tokensIn: 600_000,
      tokensOut: 400_000,
    };
    expect(costOf(call, { modalUsdPerMillionTokens: 0.5 })).toBe(0.5);
    expect(costOf(call)).toBeNull();
    expect(
      costOf(
        { ...call, tokensIn: 0, tokensOut: 0 },
        { modalUsdPerMillionTokens: 0.5 },
      ),
    ).toBeNull();
  });
});

describe('the estimate on each channel', () => {
  const documents = [
    {
      pages: 100,
      needsPipeline: false,
      hasEasiest: true,
      styles: [] as never[],
    },
  ];

  it('prices the chosen channels and shows the other pair beside them', () => {
    const estimate = estimatePrepare({
      documents,
      easiest: false,
      styles: ['steady'],
      channels: { text: 'modal', audio: 'modal' },
      rates: { modalUsdPerMillionTokens: 0.075, modalUsdPerAudioHour: 0.09 },
    });
    // Text at a fifth of gpt-4o-mini's blended price; audio at 0.09 an hour
    // against OpenAI's 0.90.
    expect(estimate.byChannel.text.openai).toBe(0.3);
    expect(estimate.byChannel.text.modal).toBe(0.06);
    expect(estimate.byChannel.audio.openai).toBe(2);
    expect(estimate.byChannel.audio.modal).toBe(0.2);
    expect(estimate.textUsd).toBe(0.06);
    expect(estimate.audioUsd).toBe(0.2);
    expect(estimate.totalUsd).toBe(0.26);
    expect(estimate.channels).toEqual({ text: 'modal', audio: 'modal' });
  });

  it('prices an unmeasured Modal as OpenAI rather than as free, and OpenAI when no channel is given', () => {
    const per = perPageByChannel({
      modalUsdPerMillionTokens: 0,
      modalUsdPerAudioHour: 0,
    });
    expect(per.text.modal).toBe(1);
    expect(per.audio.modal).toBe(per.audio.openai);
    const estimate = estimatePrepare({
      documents,
      easiest: false,
      styles: ['steady'],
    });
    expect(estimate.channels).toEqual({ text: 'openai', audio: 'openai' });
    expect(estimate.totalUsd).toBe(2.3);
  });
});
