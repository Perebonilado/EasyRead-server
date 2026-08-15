import { Inject, Injectable } from '@nestjs/common';
import type { Level } from '../../../contracts';
import {
  DocumentNotReadyError,
  NotFoundError,
} from '../../domain/errors/errors';
import { JOB_QUEUE } from '../../ports/tokens';
import type { JobQueuePort } from '../../ports/job-queue.port';
import {
  EXPORT_REPOSITORY,
  NOTE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
} from '../../repositories/tokens';
import type { NoteRepository } from '../../repositories/note.repository';
import type { ExportRepository } from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

export interface RequestExportRequest {
  userId: string;
  documentId: string;
  level: Level;
}

export interface ExportStatus {
  exportId: string;
  status: 'processing' | 'done' | 'failed';
  watermarked: boolean;
}

/**
 * Exports are cached on (document, level, contentVersion), so asking twice for
 * the same unchanged document returns the existing file instantly — that's the
 * "re-downloads are instant" shortcut the design asks for (§3.13).
 */
@Injectable()
export class RequestExportHandler extends AbstractRequestHandlerTemplate<
  RequestExportRequest,
  ExportStatus
> {
  constructor(
    @Inject(EXPORT_REPOSITORY) private readonly exports: ExportRepository,
    @Inject(NOTE_REPOSITORY) private readonly notes: NoteRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly pages: SimplifiedPageRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: RequestExportRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    // Nothing to typeset until that level has actually been written.
    const progress = await this.pages.progress(cmd.documentId, cmd.level);
    if (progress.total === 0 || progress.done === 0) {
      throw new DocumentNotReadyError(
        cmd.level === 'easiest'
          ? 'Easiest Read has not been generated for this document'
          : 'This document has not been simplified yet',
      );
    }

    const cached = await this.exports.findCached(
      cmd.documentId,
      cmd.level,
      doc.contentVersion,
    );

    // The document is keyed by contentVersion, but the appendix isn't part of
    // the document — a note written after the last export would otherwise be
    // missing from a PDF the cache calls up to date.
    const notesChangedAt = await this.notes
      .lastChangedAt(cmd.documentId, cmd.userId)
      .catch(() => null);
    const appendixStale = Boolean(
      cached && notesChangedAt && notesChangedAt > cached.renderedAt,
    );

    if (cached && cached.status !== 'failed' && !appendixStale) {
      return CommandResponse.of({
        exportId: cached.id,
        status: cached.status,
        watermarked: cached.watermarked,
      });
    }

    if (cached && appendixStale) {
      await this.exports.markProcessing(cached.id);
    }

    const entitlements = await this.entitlements.forUser(cmd.userId);
    const watermarked = entitlements.exportsAreWatermarked();

    const record =
      cached ??
      (await this.exports.create({
        documentId: cmd.documentId,
        level: cmd.level,
        contentVersion: doc.contentVersion,
        watermarked,
      }));

    await this.queue.enqueueExport({
      documentId: cmd.documentId,
      contentVersion: doc.contentVersion,
      exportId: record.id,
      level: cmd.level,
    });

    return CommandResponse.of({
      exportId: record.id,
      status: 'processing' as const,
      watermarked,
    });
  }
}

export interface GetExportRequest {
  userId: string;
  exportId: string;
}

@Injectable()
export class GetExportHandler extends AbstractRequestHandlerTemplate<
  GetExportRequest,
  { fileRef: string; fileName: string }
> {
  constructor(
    @Inject(EXPORT_REPOSITORY) private readonly exports: ExportRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: GetExportRequest) {
    const record = await this.exports.findById(cmd.exportId);
    if (!record) throw new NotFoundError('Export');

    // The export is addressed by its own id, so ownership is proven through
    // its parent document.
    const doc = await this.access.require(record.documentId, cmd.userId);

    if (record.status !== 'done' || !record.fileRef) {
      throw new DocumentNotReadyError('That export is still being prepared');
    }

    const suffix = record.level === 'easiest' ? 'Easiest' : 'Standard';
    return CommandResponse.of({
      fileRef: record.fileRef,
      fileName: `${doc.props.title} — ${suffix}.pdf`,
    });
  }
}
