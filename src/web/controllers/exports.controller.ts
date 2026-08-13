import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  GetExportHandler,
  RequestExportHandler,
  type ExportStatus,
} from '../../business/handlers/documents/export.handlers';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { CurrentUser } from '../security/current-user.decorator';
import { ExportDto } from '../validation/document.dto';

@Controller()
export class ExportsController {
  constructor(
    private readonly request: RequestExportHandler,
    private readonly get: GetExportHandler,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /**
   * Asks for an export. Returns `done` immediately when a cached file for this
   * (level, contentVersion) already exists, so a repeat download doesn't
   * re-typeset the document.
   */
  @Post('documents/:id/exports')
  @HttpCode(202)
  async create(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: ExportDto,
  ): Promise<ExportStatus> {
    const result = await this.request.handle({
      userId,
      documentId,
      level: body.level,
    });
    return result.data;
  }

  @Get('exports/:exportId/download')
  async download(
    @CurrentUser('id') userId: string,
    @Param('exportId') exportId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data } = await this.get.handle({ userId, exportId });

    const { stream, size } = await this.storage.stream(data.fileRef);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', size);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(data.fileName)}`,
    );
    stream.pipe(response);
  }
}
