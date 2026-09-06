import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SPEECH, STORAGE } from '../../ports/tokens';
import type { SpeechPort } from '../../ports/voice.port';
import type { StoragePort } from '../../ports/storage.port';
import { INVITATION_DELIVERY, INVITATION_LINES } from '../../domain/ask';
import { ValidationError } from '../../domain/errors/errors';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';

export interface LectureInvitationRequest {
  userId: string;
  documentId: string;
  /** Which of the recorded lines, 0 to one less than their count. */
  index: number;
}

export interface LectureInvitationResponse {
  fileRef: string;
  mimeType: string;
  text: string;
}

/**
 * One of the tutor's recorded invitations: the line the learner hears the
 * moment the mic is pressed, before the call is awake. Synthesised once
 * in the tutor's own voice and kept in storage under a key that names
 * the voice and the speech model, so a change to either makes new ones.
 */
@Injectable()
export class LectureInvitationHandler extends AbstractRequestHandlerTemplate<
  LectureInvitationRequest,
  LectureInvitationResponse
> {
  private readonly log = new Logger(LectureInvitationHandler.name);
  /** One synthesis per line at a time; a second request waits for the first. */
  private readonly inFlight = new Map<string, Promise<void>>();
  /** Where each line was stored, when the store names files by something other than the key. */
  private readonly refs = new Map<string, string>();

  constructor(
    @Inject(SPEECH) private readonly speech: SpeechPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly access: DocumentAccessService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: LectureInvitationRequest) {
    await this.access.require(cmd.documentId, cmd.userId);
    const text = INVITATION_LINES[cmd.index];
    if (!text) throw new ValidationError('There is no such invitation');
    const voice = this.config.get<string>('AI_LECTURE_ASK_VOICE', 'cedar');
    const model = this.config.get<string>('AI_TTS_MODEL', 'gpt-4o-mini-tts');
    const key = `tutor/invitations/${voice}/${model}/${cmd.index}.mp3`;
    if (!(await this.exists(key))) {
      const pending =
        this.inFlight.get(key) ?? this.synthesise(key, text, voice);
      this.inFlight.set(key, pending);
      try {
        await pending;
      } finally {
        this.inFlight.delete(key);
      }
    }
    return CommandResponse.of<LectureInvitationResponse>({
      fileRef: this.refs.get(key) ?? key,
      mimeType: 'audio/mpeg',
      text,
    });
  }

  private async exists(key: string): Promise<boolean> {
    try {
      return (await this.storage.size(this.refs.get(key) ?? key)) > 0;
    } catch {
      return false;
    }
  }

  private async synthesise(
    key: string,
    text: string,
    voice: string,
  ): Promise<void> {
    const spoken = await this.speech.synthesize({
      text,
      voice,
      instructions: INVITATION_DELIVERY,
    });
    const stored = await this.storage.put({
      key,
      body: spoken.audio,
      mimeType: spoken.mimeType || 'audio/mpeg',
    });
    this.refs.set(key, stored.ref);
    this.log.log(`invitation "${text}" recorded in ${voice} (${spoken.model})`);
  }
}
