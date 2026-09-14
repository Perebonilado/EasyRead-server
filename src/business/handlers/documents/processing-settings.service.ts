import { Inject, Injectable } from '@nestjs/common';
import type { ProcessingChannels } from '../../../contracts';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import { PROCESSING_SETTINGS_REPOSITORY } from '../../repositories/tokens';
import type {
  ProcessingSettingsRecord,
  ProcessingSettingsRepository,
} from '../../repositories/settings.repository';

/** How long the worker trusts what it last read: a switch lands within this. */
export const SETTINGS_CACHE_MS = 10_000;

/**
 * The admin's choice of channels, read by the worker once per job and by
 * the API when a run is priced. Cached for seconds, not minutes, so a
 * switch takes effect on the next page and never costs a query per page.
 */
@Injectable()
export class ProcessingSettingsService {
  private cached: { record: ProcessingSettingsRecord; at: number } | null =
    null;

  constructor(
    @Inject(PROCESSING_SETTINGS_REPOSITORY)
    private readonly settings: ProcessingSettingsRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async current(): Promise<ProcessingChannels> {
    return (await this.record()).channels;
  }

  async record(): Promise<ProcessingSettingsRecord> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.at < SETTINGS_CACHE_MS) {
      return this.cached.record;
    }
    const record = await this.settings.get();
    this.cached = { record, at: now };
    return record;
  }

  async set(
    channels: ProcessingChannels,
    changedBy: string,
  ): Promise<ProcessingSettingsRecord> {
    const record = await this.settings.set(
      channels,
      changedBy,
      this.clock.now(),
    );
    this.cached = { record, at: this.clock.now().getTime() };
    return record;
  }
}
