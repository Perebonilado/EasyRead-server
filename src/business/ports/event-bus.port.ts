import type { SseEvent } from '../../contracts';

/**
 * Worker publishes, API instances subscribe and fan out to SSE clients. Redis
 * pub/sub in production so any API instance can serve any client (§5).
 */
export interface EventBusPort {
  publish(documentId: string, event: SseEvent): Promise<void>;
  subscribe(
    documentId: string,
    listener: (event: SseEvent) => void,
  ): Promise<() => void>;
}
