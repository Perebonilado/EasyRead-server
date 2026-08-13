import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { LookupDto, VisualizeResponse } from '../../contracts';
import {
  HighlightHandler,
  ListLookupsHandler,
  VisualizeHandler,
} from '../../business/handlers/documents/highlight.handlers';
import { CurrentUser } from '../security/current-user.decorator';
import { HighlightDto, VisualizeDto } from '../validation/highlight.dto';

@Controller('documents/:id')
export class HighlightController {
  constructor(
    private readonly highlight: HighlightHandler,
    private readonly visualize: VisualizeHandler,
    private readonly lookups: ListLookupsHandler,
  ) {}

  /**
   * Streams the answer as newline-delimited JSON.
   *
   * Headers are written on the first token rather than up front, so anything
   * that fails before generation starts — a limit, a missing document — still
   * comes back as a normal JSON error envelope instead of a half-open stream.
   */
  @Post('highlight')
  async explain(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: HighlightDto,
    @Res() response: Response,
  ): Promise<void> {
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      response.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      });
    };

    const result = await this.highlight.handle({
      userId,
      documentId,
      action: body.action,
      selection: body.selection,
      pageNumber: body.pageNumber,
      onToken: (chunk) => {
        begin();
        response.write(`${JSON.stringify({ token: chunk })}\n`);
      },
    });

    begin();
    response.write(`${JSON.stringify({ done: true, answer: result.data })}\n`);
    response.end();
  }

  @Post('visualize')
  async images(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: VisualizeDto,
  ): Promise<VisualizeResponse> {
    const result = await this.visualize.handle({
      userId,
      documentId,
      selection: body.selection,
    });
    return { results: result.data };
  }

  /** The reader's history strip — previous lookups on this document (§8). */
  @Get('lookups')
  async history(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<LookupDto[]> {
    const result = await this.lookups.handle({ userId, documentId });
    return result.data;
  }
}
