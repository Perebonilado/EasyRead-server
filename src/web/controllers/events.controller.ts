import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SseEvent } from '../../contracts';
import { DocumentAccessService } from '../../business/handlers/documents/document-access.service';
import { EVENT_BUS } from '../../business/ports/tokens';
import type { EventBusPort } from '../../business/ports/event-bus.port';
import { DocumentDetailQuery } from '../../query/document-detail.query';
import { CurrentUser } from '../security/current-user.decorator';

/** Proxies that buffer will stall the stream; this keeps it flowing. */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

const HEARTBEAT_MS = 25_000;

/**
 * Live pipeline progress (§5).
 *
 * The stream opens with a full `snapshot` so a client that connects late — or
 * reconnects after a drop — renders correct state without a separate fetch and
 * without replaying events it already applied.
 */
@Controller('documents/:id/events')
export class EventsController {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBusPort,
    private readonly access: DocumentAccessService,
    private readonly detail: DocumentDetailQuery,
  ) {}

  @Get()
  async stream(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.access.require(documentId, userId);

    response.writeHead(200, SSE_HEADERS);
    response.flushHeaders();

    const send = (event: SseEvent) => {
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({
      type: 'snapshot',
      document: await this.detail.execute(documentId, userId),
    });

    const unsubscribe = await this.bus.subscribe(documentId, send);

    // Comment frames keep intermediaries from reaping an idle connection.
    const heartbeat = setInterval(
      () => response.write(': ping\n\n'),
      HEARTBEAT_MS,
    );

    const close = () => {
      clearInterval(heartbeat);
      void unsubscribe();
      response.end();
    };
    request.on('close', close);
    response.on('error', close);
  }
}
