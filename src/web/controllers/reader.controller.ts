import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  PageTextResponse,
  SimplifiedPagesResponse,
  TopicDto,
} from '../../contracts';
import { DocumentAccessService } from '../../business/handlers/documents/document-access.service';
import {
  MarkTopicsHandler,
  PrioritisePagesHandler,
  RetryPageHandler,
  SavePositionHandler,
  StartEasiestHandler,
} from '../../business/handlers/documents/reading.handlers';
import { ReaderQuery } from '../../query/reader.query';
import { CurrentUser } from '../security/current-user.decorator';
import {
  MarkTopicsDto,
  PageRangeDto,
  PrioritiseDto,
  RetryPageDto,
  SavePositionDto,
  SimplifiedPagesQueryDto,
} from '../validation/document.dto';

@Controller('documents/:id')
export class ReaderController {
  constructor(
    private readonly reader: ReaderQuery,
    private readonly access: DocumentAccessService,
    private readonly prioritise: PrioritisePagesHandler,
    private readonly startEasiest: StartEasiestHandler,
    private readonly retryPage: RetryPageHandler,
    private readonly savePosition: SavePositionHandler,
    private readonly markTopics: MarkTopicsHandler,
  ) {}

  @Get('pages')
  async pages(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Query() range: PageRangeDto,
  ): Promise<PageTextResponse> {
    await this.access.require(documentId, userId);
    return this.reader.pageText(documentId, range);
  }

  @Get('simplified')
  async simplified(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Query() query: SimplifiedPagesQueryDto,
  ): Promise<SimplifiedPagesResponse> {
    await this.access.require(documentId, userId);
    return this.reader.simplifiedPages(
      documentId,
      query.level ?? 'standard',
      query,
    );
  }

  @Get('topics')
  async topics(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<TopicDto[]> {
    await this.access.require(documentId, userId);
    return this.reader.topicList(documentId, userId);
  }

  /** The reader reached an unwritten page — jump it to the front (FR-1.7). */
  @Post('prioritise')
  @HttpCode(202)
  async prioritisePages(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: PrioritiseDto,
  ): Promise<void> {
    await this.prioritise.handle({ userId, documentId, ...body });
  }

  @Post('easiest')
  @HttpCode(202)
  async easiest(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<void> {
    await this.startEasiest.handle({ userId, documentId });
  }

  @Post('retry-page')
  @HttpCode(202)
  async retry(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: RetryPageDto,
  ): Promise<void> {
    await this.retryPage.handle({ userId, documentId, ...body });
  }

  @Post('position')
  @HttpCode(204)
  async position(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: SavePositionDto,
  ): Promise<void> {
    await this.savePosition.handle({ userId, documentId, ...body });
  }

  @Post('topics/read')
  @HttpCode(204)
  async readTopics(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: MarkTopicsDto,
  ): Promise<void> {
    // Ownership of the topics themselves is checked in the handler; this
    // confirms the caller can see the document they came from.
    await this.access.require(documentId, userId);
    await this.markTopics.handle({ userId, ...body });
  }
}
