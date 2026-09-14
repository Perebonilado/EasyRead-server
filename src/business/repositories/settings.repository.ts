import type { ProcessingChannels } from '../../contracts';

export interface ProcessingSettingsRecord {
  channels: ProcessingChannels;
  changedBy: string | null;
  changedAt: Date | null;
}

/** The one row of platform settings: made with the defaults when missing. */
export interface ProcessingSettingsRepository {
  get(): Promise<ProcessingSettingsRecord>;
  set(
    channels: ProcessingChannels,
    changedBy: string,
    now: Date,
  ): Promise<ProcessingSettingsRecord>;
}
