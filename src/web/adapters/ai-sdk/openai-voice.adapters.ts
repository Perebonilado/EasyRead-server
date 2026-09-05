import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  RealtimeAudioOptions,
  RealtimePort,
  RealtimeSession,
  RealtimeTool,
  SpeechPort,
  TranscriptionPort,
} from '../../../business/ports/voice.port';
import { mp3DurationMs, speechTooShort } from '../../../business/domain/speech';

/**
 * Text-to-speech through the AI SDK's OpenAI provider.
 *
 * Model and voice are config, consistent with the text gateway:
 * `AI_TTS_MODEL` (default gpt-4o-mini-tts) and `AI_TTS_VOICE` (default alloy).
 */
@Injectable()
export class OpenAiSpeechAdapter implements SpeechPort {
  private readonly logger = new Logger(OpenAiSpeechAdapter.name);

  /** OpenAI rejects TTS inputs beyond this many characters. */
  private static readonly INPUT_LIMIT = 4096;

  constructor(private readonly config: ConfigService) {}

  async synthesize({
    text,
    voice,
    instructions,
    speed,
  }: {
    text: string;
    voice?: string;
    instructions?: string;
    speed?: number;
  }): Promise<{ audio: Buffer; mimeType: string; model: string }> {
    const { experimental_generateSpeech } = await import('ai');
    const { createOpenAI } = await import('@ai-sdk/openai');

    const model = this.config.get<string>('AI_TTS_MODEL', 'gpt-4o-mini-tts');
    const chosenVoice =
      voice ?? this.config.get<string>('AI_TTS_VOICE', 'alloy');
    const openai = createOpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });

    // A dense page can exceed the provider's input cap, so long text is read
    // in sentence-aligned chunks. Bare MP3 frames are self-contained, which is
    // what makes concatenating the chunks yield one playable stream.
    const parts = chunkText(text, OpenAiSpeechAdapter.INPUT_LIMIT);
    const buffers: Buffer[] = [];

    // The instruction-steered models take delivery in words; the older
    // ones take a rate, and reject instructions. Each gets only its own.
    const steerable = model.startsWith('gpt-');
    const delivery = {
      ...(steerable && instructions ? { instructions } : {}),
      ...(!steerable && speed && speed !== 1 ? { speed } : {}),
    };

    for (const part of parts) {
      // The instruction-steered voice sometimes stops a few sentences in
      // and returns the fragment as if it were the whole. A chunk far
      // shorter than its words is asked for again, and given up on with a
      // clear error rather than saved as a page with six seconds of audio.
      let audio: Buffer | null = null;
      for (let attempt = 1; attempt <= SHORT_SPEECH_ATTEMPTS; attempt += 1) {
        const result = await experimental_generateSpeech({
          model: openai.speech(model),
          text: part,
          voice: chosenVoice,
          outputFormat: 'mp3',
          ...delivery,
        });
        const bytes = Buffer.from(result.audio.uint8Array);
        if (!speechTooShort(bytes.length, part.length)) {
          audio = bytes;
          break;
        }
        this.logger.warn(
          `Speech came back short: ${Math.round(mp3DurationMs(bytes.length) / 1000)}s for ${part.length} chars (attempt ${attempt} of ${SHORT_SPEECH_ATTEMPTS})`,
        );
      }
      if (!audio) {
        throw new Error(
          `The voice stopped early: ${part.length} characters came back as a few seconds of audio, three times`,
        );
      }
      buffers.push(audio);
    }

    this.logger.log(
      `Synthesised ${text.length} chars in ${parts.length} chunk(s) via ${model}/${chosenVoice}`,
    );
    return { audio: Buffer.concat(buffers), mimeType: 'audio/mpeg', model };
  }
}

/** How many times a chunk that comes back short is asked for. */
const SHORT_SPEECH_ATTEMPTS = 3;

/** Splits on sentence ends, falling back to hard cuts for run-on text. */
export function chunkText(text: string, limit: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return [trimmed];

  const sentences = trimmed.match(/[^.!?\n]+[.!?\n]*\s*/g) ?? [trimmed];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    // A single sentence over the limit has no natural seam; cut it hard.
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < sentence.length; i += limit) {
        chunks.push(sentence.slice(i, i + limit));
      }
      continue;
    }
    if (current.length + sentence.length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current);
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

/**
 * Ephemeral credentials for the browser's own realtime connection.
 *
 * Direct HTTP because the AI SDK doesn't cover the realtime session-minting
 * endpoint. The response shape is read defensively — the GA and beta APIs
 * disagree about where the secret lives.
 */
@Injectable()
export class OpenAiRealtimeAdapter implements RealtimePort {
  private readonly logger = new Logger(OpenAiRealtimeAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async createSession({
    instructions,
    tools,
    voice: voiceOverride,
    audio,
  }: {
    instructions: string;
    tools?: RealtimeTool[];
    voice?: string;
    audio?: RealtimeAudioOptions;
  }): Promise<RealtimeSession> {
    const model = this.config.get<string>('AI_REALTIME_MODEL', 'gpt-realtime');
    const voice =
      voiceOverride ?? this.config.get<string>('AI_REALTIME_VOICE', 'marin');

    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.getOrThrow<string>('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model,
            instructions,
            ...(tools?.length
              ? {
                  tools: tools.map((tool) => ({
                    type: 'function',
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  })),
                  tool_choice: 'auto',
                }
              : {}),
            audio: {
              // Transcribing the student's speech lets the panel show both
              // sides of the conversation, not just the tutor's.
              input: {
                transcription: { model: 'gpt-4o-mini-transcribe' },
                // Off means the client commits every turn itself
                // (hold-to-talk); the provider's own detection otherwise.
                ...(audio?.turnDetection === 'off'
                  ? { turn_detection: null }
                  : audio?.turnDetection === 'semantic'
                    ? {
                        turn_detection: {
                          type: 'semantic_vad',
                          eagerness: audio.eagerness ?? 'medium',
                          create_response: true,
                          // The room never cuts the tutor off; the learner
                          // does, by the button.
                          interrupt_response: false,
                        },
                      }
                    : {}),
                ...(audio?.noiseReduction
                  ? { noise_reduction: { type: audio.noiseReduction } }
                  : {}),
              },
              output: {
                voice,
                ...(audio?.speed ? { speed: audio.speed } : {}),
              },
            },
          },
        }),
      },
    );

    const body = (await response.json().catch(() => ({}))) as {
      value?: string;
      expires_at?: number | string;
      client_secret?: { value?: string; expires_at?: number | string };
      error?: { message?: string };
    };

    if (!response.ok) {
      this.logger.error(
        `Realtime session mint failed (${response.status}): ${body.error?.message ?? 'unknown'}`,
      );
      throw new Error(
        body.error?.message ?? 'Could not start a voice session just now',
      );
    }

    const secret = body.value ?? body.client_secret?.value;
    if (!secret) {
      this.logger.error(
        `Realtime session response had no secret: ${JSON.stringify(body).slice(0, 300)}`,
      );
      throw new Error('Could not start a voice session just now');
    }

    const expires = body.expires_at ?? body.client_secret?.expires_at ?? null;
    return {
      provider: 'openai' as const,
      clientSecret: secret,
      model,
      expiresAt:
        typeof expires === 'number'
          ? new Date(expires * 1000).toISOString()
          : (expires ?? null),
    };
  }
}

/**
 * Speech-to-text through the AI SDK's OpenAI provider — guided reading's
 * voice input. STT stays on OpenAI regardless of which TTS a tutor uses,
 * which is why this is its own port rather than a SpeechPort method.
 * Model is config: `AI_STT_MODEL` (default gpt-4o-mini-transcribe).
 */
@Injectable()
export class OpenAiTranscriptionAdapter implements TranscriptionPort {
  private readonly logger = new Logger(OpenAiTranscriptionAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe({
    audio,
    mimeType,
  }: {
    audio: Buffer;
    mimeType: string;
  }): Promise<{ text: string; model: string }> {
    const { experimental_transcribe } = await import('ai');
    const { createOpenAI } = await import('@ai-sdk/openai');

    const model = this.config.get<string>(
      'AI_STT_MODEL',
      'gpt-4o-mini-transcribe',
    );
    const openai = createOpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
    });

    const result = await experimental_transcribe({
      model: openai.transcription(model),
      audio,
    });

    this.logger.log(
      `Transcribed ${audio.length} bytes (${mimeType}) → ${result.text.length} chars via ${model}`,
    );
    return { text: result.text, model };
  }
}
