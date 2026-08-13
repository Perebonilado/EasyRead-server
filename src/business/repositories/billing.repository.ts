import type { PlanCode } from '../../contracts';
import type { UsageMetric } from '../domain/values';

export interface SubscriptionRecord {
  userId: string;
  planCode: PlanCode;
  subscriptionCode: string | null;
  customerCode: string | null;
  status: 'active' | 'non_renewing' | 'attention' | 'cancelled' | 'expired';
  currentPeriodEnd: Date | null;
}

export interface SubscriptionRepository {
  findByUser(userId: string): Promise<SubscriptionRecord | null>;
  findBySubscriptionCode(code: string): Promise<SubscriptionRecord | null>;
  upsert(record: SubscriptionRecord & { raw?: unknown }): Promise<void>;
}

export interface UsageRepository {
  /**
   * Atomic check-and-increment. Returns the count AFTER incrementing, so the
   * caller never races two uploads through the same last slot.
   */
  increment(
    userId: string,
    metric: UsageMetric,
    period: string,
  ): Promise<number>;
  decrement(userId: string, metric: UsageMetric, period: string): Promise<void>;
  get(userId: string, metric: UsageMetric, period: string): Promise<number>;
}

export interface WebhookEventRepository {
  /** False when this provider event id has been seen before. */
  claim(
    provider: string,
    externalId: string,
    eventType: string,
    payload: unknown,
  ): Promise<boolean>;
  markProcessed(provider: string, externalId: string, now: Date): Promise<void>;
}
