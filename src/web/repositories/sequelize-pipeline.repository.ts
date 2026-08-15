import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type { PipelineStatus, PipelineStep } from '../../contracts';
import type {
  PipelineRunRecord,
  PipelineRunRepository,
} from '../../business/repositories/misc.repository';
import { PipelineRunModel } from '../database/models';
import { newId } from '../database/uuid';

/**
 * The idempotency ledger. `claim` is the gate every job passes through: a step
 * already marked `done` is never executed twice, which is what makes the whole
 * pipeline safe to replay after a crash or a redeploy (§2.3).
 */
@Injectable()
export class SequelizePipelineRunRepository implements PipelineRunRepository {
  constructor(
    @InjectModel(PipelineRunModel)
    private readonly model: typeof PipelineRunModel,
  ) {}

  async claim(documentId: string, step: PipelineStep): Promise<boolean> {
    // Ensure the row exists before taking any lock. A locked findOrCreate on
    // a missing row gap-locks the (document_id, step) index, and parallel
    // steps of the same document (summarize/embed/topics fan out together)
    // deadlock on those overlapping gaps. Created unlocked, the insert holds
    // only an insert-intention lock, which distinct keys never contend on.
    await this.model.findOrCreate({
      where: { documentId, step },
      defaults: { id: newId(), documentId, step, status: 'running' } as any,
    });

    return this.model.sequelize!.transaction(async (transaction) => {
      // Row lock on the now-existing record: two workers racing the same
      // step, one wins. An equality read on the unique index locks just this
      // row — no gaps, so concurrent claims for other steps sail past.
      const row = await this.model.findOne({
        where: { documentId, step },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      // Gone between the two statements means reset() ran — the document is
      // being reprocessed and this job is stale.
      if (!row || row.status === 'done') return false;

      await row.update(
        {
          status: 'running',
          attempts: row.attempts + 1,
          startedAt: new Date(),
          error: null,
        },
        { transaction },
      );
      return true;
    });
  }

  async complete(documentId: string, step: PipelineStep): Promise<void> {
    await this.model.update(
      { status: 'done', finishedAt: new Date(), error: null },
      { where: { documentId, step } },
    );
  }

  async fail(
    documentId: string,
    step: PipelineStep,
    error: string,
  ): Promise<void> {
    await this.model.update(
      { status: 'failed', finishedAt: new Date(), error: error.slice(0, 2000) },
      { where: { documentId, step } },
    );
  }

  async skip(documentId: string, step: PipelineStep): Promise<void> {
    await this.model.findOrCreate({
      where: { documentId, step },
      defaults: { id: newId(), documentId, step, status: 'skipped' } as any,
    });
    await this.model.update(
      { status: 'skipped' },
      { where: { documentId, step } },
    );
  }

  async status(
    documentId: string,
    step: PipelineStep,
  ): Promise<PipelineStatus | null> {
    const row = await this.model.findOne({ where: { documentId, step } });
    return row?.status ?? null;
  }

  async list(documentId: string): Promise<PipelineRunRecord[]> {
    const rows = await this.model.findAll({ where: { documentId } });
    return rows.map((row) => ({
      step: row.step,
      status: row.status,
      attempts: row.attempts,
      error: row.error,
    }));
  }

  /** A step counts as satisfied when it's done OR deliberately skipped. */
  async reset(documentId: string): Promise<void> {
    await this.model.destroy({ where: { documentId } });
  }

  async allDone(documentId: string, steps: PipelineStep[]): Promise<boolean> {
    const count = await this.model.count({
      where: {
        documentId,
        step: { [Op.in]: steps },
        status: { [Op.in]: ['done', 'skipped'] },
      },
    });
    return count === steps.length;
  }
}
