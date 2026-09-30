/**
 * A voice's own rate, measured once, so the pace step can ask it for a
 * lesson's target (studio-explainer-plan, Ask 1 §3):
 *
 *   npm run voice:calibrate -- [--engine kokoro] [--voice am_puck] [--save]
 *
 * A neutral passage is voiced plainly at speed 1 (twelve sentences on our
 * own Kokoro, six on a paid engine, to keep it to cents), each sentence
 * timed by the voice's own word times or the aligner, and its words a
 * minute measured over the time spent saying them. Gemini, which takes no
 * number, is voiced once in each of its pace words ("brisk and clear",
 * "natural", "unhurried": three short requests, about two cents) and each
 * rate kept, so a scene's pace word is chosen by its measured rate.
 *
 * With --save the rate is kept in app_settings.voice_rates (migration
 * 0060) for the worker to read; without it, it is only printed. Nothing
 * else is touched.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from '../src/core.module';
import { SceneVoiceService } from '../src/business/handlers/admin/scene-voice.service';
import {
  sceneSpoken,
  spokenWordsFromVoice,
  timeBeats,
} from '../src/business/domain/scene-timing';
import { wordTimesFromAligned } from '../src/business/domain/board';
import { spokenForm } from '../src/business/domain/spoken';
import {
  DEFAULT_RATES,
  PACE_WORDS,
  paceReport,
  type PaceWord,
  type VoiceRate,
} from '../src/business/domain/scene-pace';
import {
  LESSON_DELIVERY_STYLE,
  LESSON_MOOD_STYLE,
} from '../src/business/domain/scene-voice';
import type { SpeechPort } from '../src/business/ports/voice.port';
import {
  KOKORO_HOME,
  ModalSpeechAdapter,
} from '../src/web/adapters/modal-speech.adapter';
import { GeminiSpeechAdapter } from '../src/web/adapters/gemini-speech.adapter';
import { CartesiaSceneSpeechAdapter } from '../src/web/adapters/cartesia-scene-speech.adapter';
import { ElevenLabsSceneSpeechAdapter } from '../src/web/adapters/elevenlabs-scene-speech.adapter';
import { OpenAiSpeechAdapter } from '../src/web/adapters/ai-sdk/openai-voice.adapters';
import { EchogardenAlignerAdapter } from '../src/web/adapters/echogarden-aligner.adapter';
import { CALIBRATION_PASSAGE } from './pace-fixtures';

loadEnv({ path: process.env.ENV_FILE ?? '.env' });

/** The settings as the adapters read them: the environment. */
export const envConfig = {
  get: <T = string>(key: string, fallback?: T) =>
    (process.env[key] as T | undefined) ?? fallback,
  getOrThrow: <T = string>(key: string) => {
    const value = process.env[key];
    if (value === undefined) throw new Error(`${key} is not set`);
    return value as T;
  },
} as unknown as ConfigService;

/** Only what saving a rate needs: the settings and the voices. */
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), CoreModule] })
class CalibrateModule {}

type Engine = 'kokoro' | 'gemini' | 'cartesia' | 'elevenlabs' | 'openai';

export function speechFor(engine: Engine): SpeechPort | null {
  const has = (key: string) => Boolean(process.env[key]?.trim());
  switch (engine) {
    case 'kokoro':
      return has('KOKORO_TTS_URL')
        ? new ModalSpeechAdapter(envConfig, KOKORO_HOME)
        : null;
    case 'gemini':
      return has('GEMINI_API_KEY') || has('GOOGLE_GENERATIVE_AI_API_KEY')
        ? new GeminiSpeechAdapter(envConfig)
        : null;
    case 'cartesia':
      return has('CARTESIA_API_KEY')
        ? new CartesiaSceneSpeechAdapter(envConfig)
        : null;
    case 'elevenlabs':
      return has('ELEVENLABS_API_KEY')
        ? new ElevenLabsSceneSpeechAdapter(envConfig)
        : null;
    case 'openai':
      return has('OPENAI_API_KEY') ? new OpenAiSpeechAdapter(envConfig) : null;
  }
}

/** The passage voiced plainly, in a pace word or none, and its words a minute. */
export async function measure(
  speech: SpeechPort,
  voice: string,
  sentences: string[],
  word: PaceWord | null,
  /** The speed it is asked at, for a voice that takes one. */
  speed = 1,
): Promise<{ wpm: number; seconds: number }> {
  const forms = sentences.map((say) => spokenForm(say, new Map()));
  const spoken = sceneSpoken(forms);
  const style = `${LESSON_MOOD_STYLE.calm}; ${LESSON_DELIVERY_STYLE.explain}${word ? `; ${word} pace` : ''}`;
  const result = await speech.synthesize({
    text: spoken.text,
    voice,
    speed: 1,
    timestamps: true,
    pieces: forms.map((form) => ({
      text: form.text,
      speed,
      pauseAfter: 0.35,
      style,
    })),
  });
  const durationMs = result.durationMs ?? 0;
  let words = result.words?.length
    ? spokenWordsFromVoice(result.words, spoken.text)
    : null;
  if (!words) {
    const aligner = new EchogardenAlignerAdapter(envConfig);
    const aligned = await aligner.align({
      audio: result.audio,
      mimeType: result.mimeType,
      text: spoken.text,
    });
    const times = aligned
      ? wordTimesFromAligned(
          aligned.words,
          spoken.text,
          durationMs,
          'calibrate',
          `echogarden-${aligned.engine}`,
        )
      : null;
    if (!times)
      throw new Error(
        'The voice gave no word times and the aligner could not time it',
      );
    words = times.words;
  }
  const beats = timeBeats(
    sentences.map((say) => ({ say })),
    forms,
    words,
  );
  return {
    wpm: paceReport(
      beats,
      forms.map((form) => form.text),
    ).wpm,
    seconds: durationMs / 1000,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const engine = (option('--engine') ?? 'kokoro') as Engine;
  const speech = speechFor(engine);
  if (!speech) {
    console.error(
      `${engine}: not set up here (no key or URL): nothing measured`,
    );
    process.exit(2);
  }
  const voice = option('--voice') ?? speech.label().voice;
  // Our own voice at no cost says all twelve; a paid one six.
  const sentences =
    engine === 'kokoro' ? CALIBRATION_PASSAGE : CALIBRATION_PASSAGE.slice(0, 6);
  const rate: VoiceRate = { wpm: 0, at: new Date().toISOString() };
  if (engine === 'gemini') {
    rate.words = {};
    for (const word of PACE_WORDS) {
      const measured = await measure(speech, voice, sentences, word);
      rate.words[word] = measured.wpm;
      console.log(
        `gemini ${voice} "${word}": ${measured.wpm} wpm (${measured.seconds.toFixed(1)} s)`,
      );
    }
    rate.wpm = rate.words.natural ?? DEFAULT_RATES.gemini.wpm;
  } else {
    const measured = await measure(speech, voice, sentences, null);
    rate.wpm = measured.wpm;
    console.log(
      `${engine} ${voice}: ${measured.wpm} wpm at speed 1 (${measured.seconds.toFixed(1)} s, ${sentences.length} sentences)`,
    );
  }
  console.log(JSON.stringify({ [engine]: { [voice]: rate } }));
  if (!args.includes('--save')) return;
  // Kept for the worker, beside every other voice's.
  const app = await NestFactory.createApplicationContext(CalibrateModule, {
    logger: ['warn', 'error'],
  });
  try {
    const saved = await app
      .get(SceneVoiceService)
      .saveRate(engine, voice, rate);
    console.log(
      `kept in app_settings.voice_rates: ${JSON.stringify(saved[engine])}`,
    );
  } finally {
    await app.close();
  }
}

// Run as a script; imported by the pace bench for its voices alone.
if (require.main === module)
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
