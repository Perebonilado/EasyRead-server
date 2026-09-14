import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { ProcessingStatusDto } from '../contracts';
import { ProcessingSettingsService } from '../business/handlers/documents/processing-settings.service';
import { AiCallLogModel } from '../web/database/models';

/**
 * The admin's Processing panel: the channels chosen, and each channel's
 * standing. A Modal service is never pinged for this, since a request
 * wakes its container and starts the meter; the ledger's last call says
 * how it went the last time it was asked.
 */
@Injectable()
export class ProcessingStatusQuery {
  constructor(
    private readonly settings: ProcessingSettingsService,
    private readonly config: ConfigService,
    @InjectModel(AiCallLogModel)
    private readonly calls: typeof AiCallLogModel,
  ) {}

  async execute(): Promise<ProcessingStatusDto> {
    const record = await this.settings.record();
    const [text, audio] = await Promise.all([
      this.lastCall({
        model: { [Op.like]: 'modal:%' },
        task: { [Op.ne]: 'tts_lecture' },
      }),
      this.lastCall({ model: { [Op.like]: 'modal:%' }, task: 'tts_lecture' }),
    ]);
    const set = (key: string) => Boolean(this.config.get<string>(key));
    return {
      channels: record.channels,
      changedAt: record.changedAt?.toISOString() ?? null,
      health: {
        openai: { configured: set('OPENAI_API_KEY') },
        modalText: {
          configured: set('MODAL_LLM_URL') && set('MODAL_LLM_TOKEN'),
          model: this.config.get<string>('MODAL_LLM_MODEL') || null,
          ...text,
        },
        modalAudio: {
          configured: set('MODAL_TTS_URL') && set('MODAL_TTS_TOKEN'),
          model: this.config.get<string>('MODAL_TTS_MODEL') || null,
          ...audio,
        },
      },
    };
  }

  private async lastCall(
    where: Record<string, unknown>,
  ): Promise<{ lastCallAt: string | null; lastOutcome: string | null }> {
    const row = await this.calls.findOne({
      where: where as never,
      order: [['createdAt', 'DESC']] as never,
      attributes: ['outcome', 'createdAt'],
    });
    return {
      lastCallAt: row ? (row.get('createdAt') as Date).toISOString() : null,
      lastOutcome: row?.outcome ?? null,
    };
  }
}
