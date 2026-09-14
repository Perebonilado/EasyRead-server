/* eslint-disable @typescript-eslint/require-await -- an in-memory fake stands in
   for the repository, whose interface is Promise-shaped. */
import {
  ProcessingSettingsService,
  SETTINGS_CACHE_MS,
} from './processing-settings.service';

describe("the admin's channels, as the worker reads them", () => {
  function build() {
    let now = new Date('2026-09-14T10:00:00Z').getTime();
    let reads = 0;
    let stored = { text: 'openai', audio: 'modal' } as const;
    const service = new ProcessingSettingsService(
      {
        async get() {
          reads += 1;
          return { channels: stored, changedBy: null, changedAt: null };
        },
        async set(channels: typeof stored, changedBy: string, at: Date) {
          stored = channels;
          return { channels, changedBy, changedAt: at };
        },
      },
      { now: () => new Date(now) },
    );
    return {
      service,
      advance: (ms: number) => (now += ms),
      reads: () => reads,
    };
  }

  it('reads once for many jobs, then again after the cache has aged', async () => {
    const { service, advance, reads } = build();
    await service.current();
    await service.current();
    expect(reads()).toBe(1);
    advance(SETTINGS_CACHE_MS + 1);
    await service.current();
    expect(reads()).toBe(2);
  });

  it('answers a switch at once, without waiting on the cache', async () => {
    const { service, reads } = build();
    await service.current();
    await service.set({ text: 'modal', audio: 'modal' }, 'admin');
    expect(await service.current()).toEqual({ text: 'modal', audio: 'modal' });
    expect(reads()).toBe(1);
  });
});
