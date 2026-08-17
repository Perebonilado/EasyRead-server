import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotFoundError } from '../../domain/errors/errors';
import { TUTORS } from '../../domain/values/tutors';
import { SPEECH, STORAGE } from '../../ports/tokens';
import type { SpeechPort } from '../../ports/voice.port';
import type { StoragePort } from '../../ports/storage.port';
import { ElevenLabsSpeechAdapter } from '../../../web/adapters/elevenlabs-voice.adapters';
import { AI_CALL_LOG_REPOSITORY } from '../../repositories/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface TutorIntroRequest {
  tutorId: string;
}

/**
 * A tutor introducing themself, in their own voice — the picker's audition.
 *
 * Synthesised once per (tutor, script, voice, model) and kept in storage
 * forever: the file is shared by every user, so the roster costs four TTS
 * calls total, ever — until a script or voice changes, which changes the key
 * and quietly regenerates.
 */
@Injectable()
export class TutorIntroHandler extends AbstractRequestHandlerTemplate<
  TutorIntroRequest,
  { fileRef: string; mimeType: string }
> {
  constructor(
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(SPEECH) private readonly speech: SpeechPort,
    private readonly elevenlabs: ElevenLabsSpeechAdapter,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: TutorIntroRequest) {
    const tutor = TUTORS.find((entry) => entry.id === cmd.tutorId);
    if (!tutor) throw new NotFoundError('Tutor');

    // Same provider routing as the lessons: the intro auditions the exact
    // voice that will teach, falling back to the tutor's OpenAI voice when
    // ElevenLabs isn't configured.
    const useElevenLabs =
      tutor.voice.provider === 'elevenlabs' && this.elevenlabs.isConfigured();
    const provider = useElevenLabs ? 'elevenlabs' : 'openai';
    const voiceId = useElevenLabs
      ? tutor.voice.voiceId
      : tutor.voice.provider === 'openai'
        ? tutor.voice.voiceId
        : tutor.voice.openaiFallback;
    const model = useElevenLabs
      ? this.config.get<string>(
          'ELEVENLABS_TTS_MODEL',
          'eleven_multilingual_v2',
        )
      : this.config.get<string>('AI_TTS_MODEL', 'gpt-4o-mini-tts');

    // The script participates in the key so editing an intro regenerates it.
    const script = hashOf(tutor.intro);
    const key = `tutors/${tutor.id}/intro-${script}-${provider}-${voiceId}-${model}.mp3`;

    const cached = await this.storage.size(key).catch(() => null);
    if (cached) {
      return CommandResponse.of({ fileRef: key, mimeType: 'audio/mpeg' });
    }

    const result = useElevenLabs
      ? await this.elevenlabs.synthesize({ text: tutor.intro, voice: voiceId })
      : await this.speech.synthesize({ text: tutor.intro, voice: voiceId });
    await this.storage.put({
      key,
      body: result.audio,
      mimeType: result.mimeType,
    });

    await this.calls.record({
      documentId: null,
      task: 'tts_tutor_intro',
      model: `${provider}:${result.model}`,
      tokensIn: tutor.intro.length,
      tokensOut: null,
      latencyMs: null,
      outcome: 'ok',
    });

    return CommandResponse.of({ fileRef: key, mimeType: 'audio/mpeg' });
  }
}

/** Tiny stable content hash (djb2) — cache-key material, nothing more. */
function hashOf(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
