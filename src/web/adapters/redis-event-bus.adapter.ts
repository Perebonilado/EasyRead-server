import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { SseEvent } from '../../contracts';
import type { EventBusPort } from '../../business/ports/event-bus.port';

const channel = (documentId: string) => `doc-events:${documentId}`;

/**
 * Redis pub/sub fan-out.
 *
 * The worker publishes; every API instance subscribes on first client and
 * relays to its own SSE connections. That's what lets any instance serve any
 * client without sticky sessions (§5).
 */
@Injectable()
export class RedisEventBusAdapter implements EventBusPort, OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBusAdapter.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners = new Map<
    string,
    Set<(event: SseEvent) => void>
  >();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6380');
    this.publisher = new Redis(url, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });

    this.subscriber.on('message', (name, payload) => {
      const handlers = this.listeners.get(name);
      if (!handlers?.size) return;
      let event: SseEvent;
      try {
        event = JSON.parse(payload) as SseEvent;
      } catch {
        this.logger.warn(`Unparseable event on ${name}`);
        return;
      }
      for (const handler of handlers) handler(event);
    });
  }

  async publish(documentId: string, event: SseEvent): Promise<void> {
    await this.publisher.publish(channel(documentId), JSON.stringify(event));
  }

  async subscribe(
    documentId: string,
    listener: (event: SseEvent) => void,
  ): Promise<() => void> {
    const name = channel(documentId);
    let handlers = this.listeners.get(name);

    if (!handlers) {
      handlers = new Set();
      this.listeners.set(name, handlers);
      await this.subscriber.subscribe(name);
    }
    handlers.add(listener);

    return () => {
      handlers.delete(listener);
      // Last client for this document — stop consuming the channel.
      if (handlers.size === 0) {
        this.listeners.delete(name);
        void this.subscriber.unsubscribe(name);
      }
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
  }
}
