import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  OpenAiSpeechAdapter,
  SCENE_PACE_INSTRUCTIONS,
  pieceInstructions,
} from './openai-voice.adapters';

const calls: Record<string, unknown>[] = [];

/** One mp3 frame of silence, long enough not to be taken for a fragment. */
const FRAME = Buffer.from([
  0xff,
  0xf3,
  0x84,
  0xc4,
  ...new Array<number>(140).fill(0),
]);

/** The adapter with OpenAI's endpoint answered here. */
class Heard extends OpenAiSpeechAdapter {
  protected generate(request: Record<string, unknown>): Promise<Buffer> {
    calls.push(request);
    return Promise.resolve(Buffer.concat(new Array(40).fill(FRAME)));
  }
}

const configOf = (values: Record<string, string>) =>
  ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => values[key] ?? 'sk-test',
  }) as unknown as ConfigService;

describe('the OpenAI voice for a scene', () => {
  beforeEach(() => {
    calls.length = 0;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const pieces = [
    {
      text: 'Water expands as it freezes.',
      speed: 0.92,
      pauseAfter: 0.4,
      style: 'clear; natural',
    },
    { text: 'So ice floats.', speed: 1.05, pauseAfter: 0.5 },
  ];

  it('sends a voice that takes direction the pace in words, piece by piece', async () => {
    const adapter = new Heard(configOf({ AI_TTS_MODEL: 'gpt-4o-mini-tts' }));
    await adapter.synthesize({ text: '', pieces });
    expect(calls).toHaveLength(2);
    const byText = (text: string) => calls.find((c) => c.text === text)!;
    expect(byText(pieces[0].text).instructions).toBe(
      `${SCENE_PACE_INSTRUCTIONS} This sentence: clear; natural.`,
    );
    expect(byText(pieces[1].text).instructions).toBe(SCENE_PACE_INSTRUCTIONS);
    expect(byText(pieces[0].text).speed).toBeUndefined();
  });

  it('sends a voice that takes a rate each piece’s speed, and no direction', async () => {
    const adapter = new Heard(configOf({ AI_TTS_MODEL: 'tts-1' }));
    await adapter.synthesize({ text: '', pieces });
    const byText = (text: string) => calls.find((c) => c.text === text)!;
    expect(byText(pieces[0].text).speed).toBe(0.92);
    expect(byText(pieces[1].text).speed).toBe(1.05);
    expect(byText(pieces[0].text).instructions).toBeUndefined();
  });

  it('puts the page’s own direction before the sentence’s', () => {
    expect(pieceInstructions('warm', 'Speak slowly.')).toBe(
      'Speak slowly. This sentence: warm.',
    );
  });
});
