import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SCENE_GENERATOR_VERSION } from '../business/domain/scene-script';
import type { ClockPort } from '../business/ports/clock.port';
import type { JobQueuePort } from '../business/ports/job-queue.port';
import { CLOCK, JOB_QUEUE } from '../business/ports/tokens';
import { VISUAL_SCENE_REPOSITORY } from '../business/repositories/tokens';
import type { VisualSceneRepository } from '../business/repositories/visual.repository';

/** How often the watchdog looks. */
export const WATCH_INTERVAL_MS = 60 * 1000;
/**
 * How long a page must have waited unchanged before it is looked at: the
 * few seconds between a row being written and its job being queued are
 * never mistaken for a lost job.
 */
export const WATCH_AFTER_MS = 60 * 1000;
/** The most pages looked at in one sweep; the rest wait for the next. */
const WATCH_BATCH = 200;
/**
 * A page being made is someone's work: the worker's, or `scene:page`
 * making it in its own process with no job at all. It is taken for lost
 * only when it has not moved for this long; the maker marks each step, and
 * a page takes minutes, never ten.
 */
export const MAKING_STALE_MS = 10 * 60 * 1000;

/**
 * Every page asked for gets made. A page is lost when nothing carries it
 * any more: its job taken and dropped by a worker of another generator,
 * lost with a crashed worker, or never queued because the queue was down
 * when it was asked for. Its row then waits as pending for ever, and the
 * player with it, waiting on the next page. So each minute every page
 * waiting (or being made, and not moved for ten minutes) is checked
 * against the queue: one whose job is gone is queued again, and one whose
 * job failed for good is marked failed, so the player moves past it
 * instead of waiting on it.
 */
@Injectable()
export class VisualWatchdog implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VisualWatchdog.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    @Inject(VISUAL_SCENE_REPOSITORY)
    private readonly visuals: VisualSceneRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  onModuleInit(): void {
    // `unref` so an idle watchdog never holds the process open on shutdown.
    this.timer = setInterval(() => void this.sweep(), WATCH_INTERVAL_MS);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One look: what it queued again and what it marked failed. */
  async sweep(): Promise<{ requeued: number; failed: number }> {
    if (this.sweeping) return { requeued: 0, failed: 0 };
    this.sweeping = true;
    try {
      const now = this.clock.now().getTime();
      const rows = (
        await this.visuals.listUnfinished({
          generatorVersion: SCENE_GENERATOR_VERSION,
          before: new Date(now - WATCH_AFTER_MS),
          limit: WATCH_BATCH,
        })
      ).filter(
        (row) =>
          row.status !== 'making' ||
          (row.updatedAt?.getTime() ?? 0) < now - MAKING_STALE_MS,
      );
      if (!rows.length) return { requeued: 0, failed: 0 };
      const states = await this.queue.visualSceneStates(rows);
      const lost = rows.filter((_, i) => states[i].state === 'gone');
      let failed = 0;
      for (const [i, row] of rows.entries()) {
        const state = states[i];
        if (state.state !== 'failed') continue;
        await this.visuals.update(row.id, {
          status: 'failed',
          step: null,
          error: state.reason,
        });
        failed += 1;
      }
      if (lost.length)
        await this.queue.enqueueVisualScenes(
          lost.map((row) => ({
            documentId: row.documentId,
            contentVersion: row.contentVersion,
            pageNumber: row.pageNumber,
            topicId: row.topicId,
            requestedBy: row.requestedBy ?? '',
            // They have waited already: ahead of pages asked for since.
            priority: 1,
          })),
        );
      if (lost.length || failed)
        this.logger.log(
          `${lost.length} page${lost.length === 1 ? '' : 's'} had lost their jobs and are queued again${failed ? `; ${failed} whose jobs failed are marked failed` : ''}: ${lost
            .slice(0, 6)
            .map((row) => `${row.documentId} p${row.pageNumber}`)
            .join(', ')}`,
        );
      return { requeued: lost.length, failed };
    } catch (error) {
      this.logger.error(
        `The visual watchdog could not look: ${(error as Error).message}`,
      );
      return { requeued: 0, failed: 0 };
    } finally {
      this.sweeping = false;
    }
  }
}
