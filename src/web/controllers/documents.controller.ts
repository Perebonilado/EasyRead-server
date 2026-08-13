import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  DocumentDetail,
  DocumentListItem,
  UploadIntentResponse,
} from '../../contracts';
import {
  DocumentNotReadyError,
  ValidationError,
} from '../../business/domain/errors/errors';
import { DocumentAccessService } from '../../business/handlers/documents/document-access.service';
import {
  DeleteDocumentHandler,
  RenameDocumentHandler,
} from '../../business/handlers/documents/reading.handlers';
import {
  UploadCompleteHandler,
  UploadIntentHandler,
} from '../../business/handlers/documents/upload.handlers';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { DocumentDetailQuery } from '../../query/document-detail.query';
import { DocumentListQuery } from '../../query/document-list.query';
import type { Pagination } from '../../query/shared/pagination';
import { CurrentUser } from '../security/current-user.decorator';
import {
  DocumentListQueryDto,
  RenameDocumentDto,
  UploadIntentDto,
} from '../validation/document.dto';

@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly uploadIntent: UploadIntentHandler,
    private readonly uploadComplete: UploadCompleteHandler,
    private readonly rename: RenameDocumentHandler,
    private readonly remove: DeleteDocumentHandler,
    private readonly list: DocumentListQuery,
    private readonly detail: DocumentDetailQuery,
    private readonly access: DocumentAccessService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  @Get()
  async index(
    @CurrentUser('id') userId: string,
    @Query() query: DocumentListQueryDto,
  ): Promise<{ items: DocumentListItem[]; pagination: Pagination }> {
    return this.list.execute(userId, query);
  }

  /** Powers the "Continue reading" rail above the library grid. */
  @Get('recent')
  async recent(@CurrentUser('id') userId: string): Promise<DocumentListItem[]> {
    return this.list.recentlyRead(userId);
  }

  @Post('upload-intent')
  @HttpCode(201)
  async intent(
    @CurrentUser('id') userId: string,
    @Body() body: UploadIntentDto,
  ): Promise<UploadIntentResponse> {
    const result = await this.uploadIntent.handle({ userId, ...body });
    return result.data;
  }

  /**
   * The proxy upload path: raw bytes, no multipart. Multipart would buffer the
   * whole file through a parser for no benefit — we already know the document
   * id and mime type from the intent.
   */
  @Post(':id/content')
  @HttpCode(202)
  async uploadContent(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Req() request: Request,
  ): Promise<{ documentId: string }> {
    // `raw()` is mounted on this path in the bootstrap, so the body arrives as
    // a Buffer with the size cap already enforced by the parser.
    const body = request.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new ValidationError('No file content was sent');
    }

    const result = await this.uploadComplete.handle({
      userId,
      documentId,
      body,
    });
    return result.data;
  }

  /** Direct-to-storage path: the client tells us the bytes have landed. */
  @Post(':id/complete')
  @HttpCode(202)
  async complete(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<{ documentId: string }> {
    const result = await this.uploadComplete.handle({ userId, documentId });
    return result.data;
  }

  @Get(':id')
  async show(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<DocumentDetail> {
    return this.detail.execute(documentId, userId);
  }

  @Patch(':id')
  @HttpCode(204)
  async patch(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: RenameDocumentDto,
  ): Promise<void> {
    await this.rename.handle({ userId, documentId, title: body.title });
  }

  @Delete(':id')
  @HttpCode(204)
  async destroy(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<void> {
    await this.remove.handle({ userId, documentId });
  }

  /**
   * Serves the canonical PDF to pdf.js, honouring Range requests — the reader's
   * time-to-first-page depends on the viewer fetching only the pages it needs
   * rather than the whole file (§3.2).
   */
  @Get(':id/file')
  async file(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const doc = await this.access.require(documentId, userId);

    // Only ever the canonical PDF. Falling back to the original would hand a
    // DOCX to pdf.js, which fails with "Invalid PDF structure" — an error about
    // the file's shape, when the real problem is that conversion hasn't run.
    const ref = doc.props.canonicalPdfRef;
    if (!ref) {
      throw new DocumentNotReadyError(
        doc.props.failureReason ?? 'This document is still being prepared',
      );
    }

    const total = await this.storage.size(ref);
    const range = parseRange(request.headers.range, total);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, max-age=3600');

    if (range) {
      const { stream } = await this.storage.stream(ref, range);
      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${total}`,
      );
      response.setHeader('Content-Length', range.end - range.start + 1);
      stream.pipe(response);
      return;
    }

    const { stream } = await this.storage.stream(ref);
    response.setHeader('Content-Length', total);
    stream.pipe(response);
  }
}

/** `bytes=0-1023`, `bytes=1024-`. Anything else falls back to the full file. */
function parseRange(
  header: string | undefined,
  total: number,
): { start: number; end: number } | null {
  if (!header?.startsWith('bytes=')) return null;

  const [rawStart, rawEnd] = header.slice('bytes='.length).split('-');
  const start = Number(rawStart);
  if (!Number.isFinite(start) || start < 0 || start >= total) return null;

  const end = rawEnd ? Math.min(Number(rawEnd), total - 1) : total - 1;
  if (!Number.isFinite(end) || end < start) return null;

  return { start, end };
}
