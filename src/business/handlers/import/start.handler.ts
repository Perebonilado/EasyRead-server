import { Inject, Injectable } from '@nestjs/common';
import type { ImportManifest, ImportPageDto } from '../../../contracts';
import type { Document } from '../../domain/entities/document';
import { ValidationError } from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { JOB_QUEUE } from '../../ports/tokens';
import type { JobQueuePort } from '../../ports/job-queue.port';
import { DOCUMENT_REPOSITORY } from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { EntitlementsService } from '../documents/entitlements.service';

/**
 * No cap on how many pages an import may select — the only gate is the
 * plan's typeset page limit, checked in the processor where web pages and
 * PDF pages actually meet.
 */
export interface StartImportRequest {
  userId: string;
  url: string;
  title: string;
  pages: { url: string; title: string; depth: number }[];
}

/**
 * Commissions an import: the reader has picked a scope, a document row is
 * created immediately so the library shows it processing, and the fetching
 * happens on the queue — exactly the Learn flow with a different author.
 */
@Injectable()
export class StartImportHandler extends AbstractRequestHandlerTemplate<
  StartImportRequest,
  { documentId: string }
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: StartImportRequest) {
    let origin: string;
    try {
      origin = new URL(cmd.url).origin;
    } catch {
      throw new ValidationError('That does not look like a URL');
    }

    // Scope confinement: every page must live on the entry URL's origin.
    // The wizard only offers such pages; this stops a tampered request from
    // turning one import into a crawl of somewhere else.
    const seen = new Set<string>();
    const pages: ImportPageDto[] = [];
    for (const page of cmd.pages) {
      let url: URL;
      try {
        url = new URL(page.url);
      } catch {
        continue;
      }
      if (url.origin !== origin) {
        throw new ValidationError(
          'Every page in an import must come from the same site',
        );
      }
      url.hash = '';
      const key = url.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      pages.push({
        url: key,
        title: (page.title || url.pathname).slice(0, 200),
        depth: Math.max(0, Math.min(6, Math.trunc(page.depth))),
      });
    }

    if (!pages.length) {
      throw new ValidationError('Pick at least one page to import');
    }

    // An imported document takes a monthly slot like any other, booked before
    // anything is created so the gate can refuse first.
    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.DOCUMENTS_UPLOADED,
      (e) => e.assertCanUpload(0),
    );

    const title = cmd.title.trim().slice(0, 200) || new URL(cmd.url).hostname;
    const manifest: ImportManifest = { url: cmd.url, pages, chapters: null };

    let document: Document;
    try {
      document = await this.documents.create({
        userId: cmd.userId,
        title,
        fileName: `${new URL(cmd.url).hostname}.pdf`,
        sourceMimeType: 'application/pdf',
        sizeBytes: 0,
        source: 'imported',
        sourceUrl: cmd.url,
        importManifest: manifest,
      });
    } catch (error) {
      await this.entitlements.release(
        cmd.userId,
        UsageMetric.DOCUMENTS_UPLOADED,
      );
      throw error;
    }

    await this.queue.enqueueImport({
      documentId: document.id,
      contentVersion: document.contentVersion,
    });

    return CommandResponse.of({ documentId: document.id });
  }
}
