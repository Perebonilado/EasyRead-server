import { AsyncLocalStorage } from 'node:async_hooks';
import type { ProcessingChannels } from '../../contracts';

/**
 * The channels of the job in hand, carried down the call stack without a
 * parameter on every model call. The worker opens a frame per job; the
 * model registry and the voice read it; the queue stamps a run's own
 * choice onto the jobs it fans out, so a retry on OpenAI stays on OpenAI
 * through its chapters, voices and boards.
 */
interface Frame {
  channels: ProcessingChannels;
  /** What the run itself asked for, if anything: the part that travels. */
  override: Partial<ProcessingChannels> | null;
}

const storage = new AsyncLocalStorage<Frame>();

export function runWithChannels<T>(
  channels: ProcessingChannels,
  override: Partial<ProcessingChannels> | null,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ channels, override }, fn);
}

/** Null outside a job or a run: the caller falls back to its own default. */
export function currentChannels(): ProcessingChannels | null {
  return storage.getStore()?.channels ?? null;
}

export function currentOverride(): Partial<ProcessingChannels> | null {
  return storage.getStore()?.override ?? null;
}
