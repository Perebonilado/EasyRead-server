import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { CLOCK, STORAGE, VECTOR_STORE } from '../business/ports/tokens';
import type { ClockPort } from '../business/ports/clock.port';
import type { StoragePort } from '../business/ports/storage.port';
import type { VectorStorePort } from '../business/ports/vector-store.port';
import { DOCUMENT_REPOSITORY } from '../business/repositories/tokens';
import type { DocumentRepository } from '../business/repositories/document.repository';
import { DocumentModel, UserModel } from '../web/database/models';

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const BATCH = 50;

/**
 * Hard-deletes what was soft-deleted once the recovery window closes (PRD §10).
 *
 * Deletion is two-phase on purpose: the user's delete is instant and
 * reversible, and the irreversible part happens 14 days later. That's what
 * makes an accidental delete recoverable without making "delete" a lie.
 */
@Injectable()
export class PurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PurgeService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly retentionDays: number;

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @InjectModel(DocumentModel)
    private readonly documentModel: typeof DocumentModel,
    @InjectModel(UserModel) private readonly userModel: typeof UserModel,
    config: ConfigService,
  ) {
    this.retentionDays = Number(config.get<string>('PURGE_AFTER_DAYS', '14'));
  }

  onModuleInit(): void {
    // `unref` so an idle sweep timer never holds the process open on shutdown.
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    try {
      const cutoff = new Date(
        this.clock.now().getTime() - this.retentionDays * DAY_MS,
      );
      const purged = await this.purgeDocuments(cutoff);
      const users = await this.purgeUsers(cutoff);
      if (purged || users) {
        this.logger.log(`Purged ${purged} documents and ${users} accounts`);
      }
    } catch (error) {
      this.logger.error(`Purge sweep failed: ${(error as Error).message}`);
    }
  }

  private async purgeDocuments(cutoff: Date): Promise<number> {
    const rows = await this.documentModel.findAll({
      where: { deletedAt: { [Op.ne]: null, [Op.lt]: cutoff } } as never,
      limit: BATCH,
    });

    for (const row of rows) {
      // Files first: a crash between the two leaves an orphaned row we will
      // retry, whereas the reverse leaves files nobody can ever find.
      for (const ref of [
        row.originalFileRef,
        row.canonicalPdfRef,
        row.thumbnailRef,
      ]) {
        if (ref) await this.storage.delete(ref).catch(() => undefined);
      }
      await this.vectors.deleteByDocument(row.id).catch(() => undefined);
      await this.documents.purge(row.id);
    }

    return rows.length;
  }

  /** Accounts are removed only once their documents are already gone. */
  private async purgeUsers(cutoff: Date): Promise<number> {
    const rows = await this.userModel.findAll({
      where: { deletedAt: { [Op.ne]: null, [Op.lt]: cutoff } } as never,
      limit: BATCH,
    });

    let removed = 0;
    for (const row of rows) {
      const remaining = await this.documentModel.count({
        where: { userId: row.id },
      });
      if (remaining > 0) continue;
      await row.destroy();
      removed += 1;
    }

    return removed;
  }
}
