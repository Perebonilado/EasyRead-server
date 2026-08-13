import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import type { PlanCode } from '../../contracts';
import type {
  SubscriptionRecord,
  SubscriptionRepository,
  UsageRepository,
  WebhookEventRepository,
} from '../../business/repositories/billing.repository';
import type { UsageMetric } from '../../business/domain/values';
import {
  SubscriptionModel,
  UsageCounterModel,
  WebhookEventModel,
} from '../database/models';
import { newId } from '../database/uuid';

@Injectable()
export class SequelizeSubscriptionRepository implements SubscriptionRepository {
  constructor(
    @InjectModel(SubscriptionModel)
    private readonly model: typeof SubscriptionModel,
  ) {}

  private toRecord(row: SubscriptionModel): SubscriptionRecord {
    return {
      userId: row.userId,
      planCode: row.planCode as PlanCode,
      subscriptionCode: row.subscriptionCode,
      customerCode: row.customerCode,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
    };
  }

  async findByUser(userId: string): Promise<SubscriptionRecord | null> {
    const row = await this.model.findOne({ where: { userId } });
    return row ? this.toRecord(row) : null;
  }

  async findBySubscriptionCode(
    code: string,
  ): Promise<SubscriptionRecord | null> {
    const row = await this.model.findOne({ where: { subscriptionCode: code } });
    return row ? this.toRecord(row) : null;
  }

  async upsert(record: SubscriptionRecord & { raw?: unknown }): Promise<void> {
    const existing = await this.model.findOne({
      where: { userId: record.userId },
    });
    const values = {
      planCode: record.planCode,
      subscriptionCode: record.subscriptionCode,
      customerCode: record.customerCode,
      status: record.status,
      currentPeriodEnd: record.currentPeriodEnd,
      raw: record.raw ?? null,
    };
    if (existing) await existing.update(values);
    else
      await this.model.create({
        id: newId(),
        userId: record.userId,
        provider: 'paystack',
        ...values,
      } as any);
  }
}

@Injectable()
export class SequelizeUsageRepository implements UsageRepository {
  constructor(
    @InjectModel(UsageCounterModel)
    private readonly model: typeof UsageCounterModel,
  ) {}

  /**
   * Atomic check-and-increment in one statement.
   *
   * Two uploads racing the last free slot would both read "2 of 3" and both
   * pass a read-then-write check. INSERT … ON DUPLICATE KEY UPDATE makes the
   * increment the source of truth, and the caller compares the returned value
   * against the limit (§2.1).
   */
  async increment(
    userId: string,
    metric: UsageMetric,
    period: string,
  ): Promise<number> {
    const sequelize = this.model.sequelize!;
    await sequelize.query(
      `INSERT INTO usage_counters (id, user_id, period, metric, count, created_at, updated_at)
       VALUES (:id, :userId, :period, :metric, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE count = count + 1, updated_at = NOW()`,
      {
        replacements: { id: newId(), userId, period, metric },
        type: QueryTypes.INSERT,
      },
    );
    return this.get(userId, metric, period);
  }

  /** Used to roll back a reserved slot when the gated action fails to enqueue. */
  async decrement(
    userId: string,
    metric: UsageMetric,
    period: string,
  ): Promise<void> {
    await this.model.sequelize!.query(
      `UPDATE usage_counters SET count = GREATEST(count - 1, 0), updated_at = NOW()
       WHERE user_id = :userId AND period = :period AND metric = :metric`,
      { replacements: { userId, period, metric }, type: QueryTypes.UPDATE },
    );
  }

  async get(
    userId: string,
    metric: UsageMetric,
    period: string,
  ): Promise<number> {
    const row = await this.model.findOne({ where: { userId, metric, period } });
    return row?.count ?? 0;
  }
}

@Injectable()
export class SequelizeWebhookEventRepository implements WebhookEventRepository {
  constructor(
    @InjectModel(WebhookEventModel)
    private readonly model: typeof WebhookEventModel,
  ) {}

  /** False when this event id was already recorded — providers do redeliver. */
  async claim(
    provider: string,
    externalId: string,
    eventType: string,
    payload: unknown,
  ): Promise<boolean> {
    const [, created] = await this.model.findOrCreate({
      where: { provider, externalId },
      defaults: {
        id: newId(),
        provider,
        externalId,
        eventType,
        payload,
      } as any,
    });
    return created;
  }

  async markProcessed(
    provider: string,
    externalId: string,
    now: Date,
  ): Promise<void> {
    await this.model.update(
      { processedAt: now },
      { where: { provider, externalId } },
    );
  }
}
