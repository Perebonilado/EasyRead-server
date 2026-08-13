import { Inject, Injectable } from '@nestjs/common';
import type { UploadIntentResponse } from '../../../contracts';
import {
  DocumentNotReadyError,
  UnsupportedFormatError,
  ValidationError,
} from '../../domain/errors/errors';
import {
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  UsageMetric,
} from '../../domain/values';
import { CLOCK, STORAGE } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { StoragePort } from '../../ports/storage.port';
import { DOCUMENT_REPOSITORY } from '../../repositories/tokens';
import type { DocumentRepository } from '../../repositories/document.repository';
import { PipelineOrchestrator } from '../../../pipeline/orchestrator.service';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

export interface UploadIntentRequest {
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Reserves a document row and tells the client where to send bytes.
 *
 * Deliberately does no work beyond that — this is the path PRD G1 measures at
 * under 3 seconds, so conversion, extraction and everything else happens after
 * the bytes land, not here.
 */
@Injectable()
export class UploadIntentHandler extends AbstractRequestHandlerTemplate<
  UploadIntentRequest,
  UploadIntentResponse
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: UploadIntentRequest,
  ): Promise<CommandResponse<UploadIntentResponse>> {
    const extension = ACCEPTED_MIME_TYPES[cmd.mimeType];
    if (!extension) {
      throw new UnsupportedFormatError(
        cmd.filename.split('.').pop() ??
          cmd.mimeType.split('/').pop() ??
          'file',
      );
    }
    if (cmd.sizeBytes <= 0 || cmd.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new ValidationError('That file size is not accepted', {
        maxBytes: MAX_UPLOAD_BYTES,
      });
    }

    // Book the monthly slot before creating anything. If the plan gate throws,
    // the reservation is rolled back inside `consume`.
    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.DOCUMENTS_UPLOADED,
      (e) => e.assertCanUpload(cmd.sizeBytes),
    );

    let document;
    try {
      document = await this.documents.create({
        userId: cmd.userId,
        title: stripExtension(cmd.filename),
        fileName: cmd.filename,
        sourceMimeType: cmd.mimeType,
        sizeBytes: cmd.sizeBytes,
      });
    } catch (error) {
      await this.entitlements.release(
        cmd.userId,
        UsageMetric.DOCUMENTS_UPLOADED,
      );
      throw error;
    }

    const target = await this.storage.createUploadTarget({
      documentId: document.id,
      filename: cmd.filename,
      mimeType: cmd.mimeType,
      sizeBytes: cmd.sizeBytes,
    });

    return CommandResponse.of({
      documentId: document.id,
      uploadUrl: target.uploadUrl,
      uploadMode: target.uploadMode,
    });
  }
}

export interface UploadCompleteRequest {
  userId: string;
  documentId: string;
  /** Present on the proxy path; absent when bytes went straight to storage. */
  body?: Buffer;
}

/**
 * The client's "bytes are in" signal. Verifies the object exists, flips the
 * document to `processing`, starts the pipeline and returns — this is the
 * sub-3-second acknowledgement path (§3.2).
 */
@Injectable()
export class UploadCompleteHandler extends AbstractRequestHandlerTemplate<
  UploadCompleteRequest,
  { documentId: string }
> {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly access: DocumentAccessService,
    private readonly pipeline: PipelineOrchestrator,
  ) {
    super();
  }

  protected async handleRequest(cmd: UploadCompleteRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const key = `documents/${doc.id}/original`;
    if (cmd.body) {
      await this.storage.put({
        key,
        body: cmd.body,
        mimeType: doc.props.sourceMimeType,
      });
    } else {
      // Direct-to-storage path: confirm the object actually arrived rather
      // than trusting the client's word for it.
      await this.storage.size(key).catch(() => {
        throw new DocumentNotReadyError('We never received the file');
      });
    }

    doc.markUploaded(key);
    await this.documents.save(doc);

    await this.pipeline.start(doc.id, doc.contentVersion);

    return CommandResponse.of({ documentId: doc.id });
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}
