import type { Pcm } from '../domain/wav';

/**
 * Audio as samples and back: what the pace step (scene-pace-audio) needs
 * to put a voice right after voicing, on a voice that answers in mp3
 * (Kokoro, OpenAI). A voice that has its samples already hands them over
 * and is never decoded.
 */
export interface AudioCodecPort {
  /** One channel of 16-bit samples from an mp3 (or any audio the host can read). */
  decode(audio: Buffer, mimeType: string): Promise<Pcm>;
  /** Samples as an mp3, as every scene's audio is stored. */
  encode(pcm: Pcm): Promise<Buffer>;
}
