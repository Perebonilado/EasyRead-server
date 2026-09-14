import { Injectable } from '@nestjs/common';
import type { ProcessingChannel } from '../../../contracts';
import { isChannel } from '../../domain/processing';
import { ValidationError } from '../../domain/errors/errors';
import type { ProcessingSettingsRecord } from '../../repositories/settings.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { ProcessingSettingsService } from './processing-settings.service';

export interface SetProcessingChannelsRequest {
  userId: string;
  text?: ProcessingChannel;
  audio?: ProcessingChannel;
}

/** The admin moves text or audio, or both, between OpenAI and Modal. */
@Injectable()
export class SetProcessingChannelsHandler extends AbstractRequestHandlerTemplate<
  SetProcessingChannelsRequest,
  ProcessingSettingsRecord
> {
  constructor(private readonly settings: ProcessingSettingsService) {
    super();
  }

  protected async handleRequest(cmd: SetProcessingChannelsRequest) {
    for (const value of [cmd.text, cmd.audio]) {
      if (value !== undefined && !isChannel(value)) {
        throw new ValidationError('A channel is openai or modal');
      }
    }
    const current = await this.settings.current();
    const record = await this.settings.set(
      { text: cmd.text ?? current.text, audio: cmd.audio ?? current.audio },
      cmd.userId,
    );
    return CommandResponse.of(record);
  }
}
