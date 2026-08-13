import { Injectable, Logger } from '@nestjs/common';
import { RequestHandler } from './RequestHandler';
import { CommandResponse } from './response/CommandResponse';

/**
 * Template Method: the public `handle` owns logging (and later, metrics),
 * subclasses only implement `handleRequest`. Controllers see `handle` alone.
 */
@Injectable()
export default abstract class AbstractRequestHandlerTemplate<
  T,
  U,
> implements RequestHandler<T, U> {
  protected readonly logger = new Logger(this.constructor.name);

  protected abstract handleRequest(request: T): Promise<CommandResponse<U>>;

  public async handle(request: T): Promise<CommandResponse<U>> {
    const startedAt = Date.now();
    this.logger.log('Executing');
    try {
      const result = await this.handleRequest(request);
      this.logger.log(`Completed in ${Date.now() - startedAt}ms`);
      return result;
    } catch (error) {
      this.logger.warn(
        `Failed after ${Date.now() - startedAt}ms: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
