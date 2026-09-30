import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AudioCodecPort } from '../../../business/ports/audio-codec.port';
import type { Pcm } from '../../../business/domain/wav';
import { readWav } from '../../../business/domain/wav';
import { encodeMp3 } from './mp3';

/** The rate every scene's voice is kept at when it is decoded here. */
const RATE = 24_000;

/**
 * Audio to samples and back, in this process. Decoding goes through the
 * aligner's own echogarden, which reads an mp3 with the ffmpeg it already
 * uses to align the same audio (the system's, ECHOGARDEN_FFMPEG_PATH, or
 * the one it fetches into its package directory the first time); encoding
 * is LAME in JavaScript, as the Gemini voice's is. A decoded mp3 is
 * encoded again at 96 kbps, so a second generation loses nothing heard.
 */
@Injectable()
export class EchogardenAudioCodecAdapter implements AudioCodecPort {
  constructor(private readonly config: ConfigService) {}

  async decode(audio: Buffer, mimeType: string): Promise<Pcm> {
    if (/wav/i.test(mimeType)) {
      const wav = readWav(audio);
      if (wav) return wav;
    }
    const ffmpegPath = this.config.get<string>('ECHOGARDEN_FFMPEG_PATH');
    const echogarden = await import('echogarden');
    echogarden.setGlobalOption('logLevel', 'error');
    if (ffmpegPath) echogarden.setGlobalOption('ffmpegPath', ffmpegPath);
    const { ensureRawAudio } = (await import(
      // echogarden keeps its decoder out of its API's index.
      'echogarden/dist/audio/AudioUtilities.js'
    )) as {
      ensureRawAudio: (
        input: Uint8Array,
        rate: number,
        channels: number,
        callbacks: { logLevel?: string },
      ) => Promise<{ audioChannels: Float32Array[]; sampleRate: number }>;
    };
    const raw = await ensureRawAudio(new Uint8Array(audio), RATE, 1, {
      logLevel: 'error',
    });
    const channel = raw.audioChannels[0] ?? new Float32Array(0);
    const samples = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i += 1)
      samples[i] = Math.max(
        -32768,
        Math.min(32767, Math.round(channel[i] * 32767)),
      );
    return { samples, sampleRate: raw.sampleRate };
  }

  encode(pcm: Pcm): Promise<Buffer> {
    return encodeMp3(pcm.samples, pcm.sampleRate, 96);
  }
}
