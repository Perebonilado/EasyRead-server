import { Inject, Injectable } from '@nestjs/common';
import type { ImportDiscoverResponse } from '../../../contracts';
import { ValidationError } from '../../domain/errors/errors';
import { WEB_IMPORT } from '../../ports/tokens';
import type { WebImportPort } from '../../ports/web-import.port';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface DiscoverImportRequest {
  userId: string;
  url: string;
}

/**
 * "What is at this URL?" — the first half of importing docs.
 *
 * Synchronous rather than queued: one page plus maybe a sitemap, a couple of
 * seconds, and the reader is sitting in a wizard waiting to pick a scope.
 * Nothing is stored; the answer is only an offer.
 */
@Injectable()
export class DiscoverImportHandler extends AbstractRequestHandlerTemplate<
  DiscoverImportRequest,
  ImportDiscoverResponse
> {
  constructor(@Inject(WEB_IMPORT) private readonly web: WebImportPort) {
    super();
  }

  protected async handleRequest(cmd: DiscoverImportRequest) {
    const url = cmd.url.trim();
    if (!url || url.length > 2000) {
      throw new ValidationError('That does not look like a URL');
    }

    // The adapter's failures are the reader's to hear about — a bad URL or
    // an unreachable page is a 400 with words, not a 500.
    const discovered = await this.web.discover(url).catch((error: Error) => {
      throw new ValidationError(error.message);
    });
    return CommandResponse.of({
      url: discovered.url,
      title: discovered.title,
      framework: discovered.framework,
      pages: discovered.pages,
    });
  }
}
