import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import type { PlanCode } from '../../contracts';
import type {
  SubscriptionRecord,
  SubscriptionRepository,
  UsageRepository,
  VoiceCreditsRepository,
  WebhookEventRepository,
} from '../../business/repositories/billing.repository';
import type { UsageMetric } from '../../business/domain/values';
import {
  SubscriptionModel,
  UsageCounterModel,
  VoiceCreditModel,
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
      provider: row.provider,
      planCode: row.planCode as PlanCode,
      interval: row.interval,
      providerSubscriptionId: row.providerSubscriptionId,
      providerCustomerId: row.providerCustomerId,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    };
  }

  async findByUser(userId: string): Promise<SubscriptionRecord | null> {
    const row = await this.model.findOne({ where: { userId } });
    return row ? this.toRecord(row) : null;
  }

  async findByProviderSubscriptionId(
    id: string,
  ): Promise<SubscriptionRecord | null> {
    const row = await this.model.findOne({
      where: { providerSubscriptionId: id },
    });
    return row ? this.toRecord(row) : null;
  }

  async upsert(record: SubscriptionRecord & { raw?: unknown }): Promise<void> {
    const existing = await this.model.findOne({
      where: { userId: record.userId },
    });
    const values = {
      provider: record.provider,
      planCode: record.planCode,
      interval: record.interval,
      providerSubscriptionId: record.providerSubscriptionId,
      providerCustomerId: record.providerCustomerId,
      status: record.status,
      currentPeriodEnd: record.currentPeriodEnd,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      raw: record.raw ?? null,
    };
    if (existing) await existing.update(values);
    else
      await this.model.create({
        id: newId(),
        userId: record.userId,
        ...values,
      });
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
    return this.incrementBy(userId, metric, period, 1);
  }

  async incrementBy(
    userId: string,
    metric: UsageMetric,
    period: string,
    amount: number,
  ): Promise<number> {
    const sequelize = this.model.sequelize!;
    await sequelize.query(
      `INSERT INTO usage_counters (id, user_id, period, metric, count, created_at, updated_at)
       VALUES (:id, :userId, :period, :metric, :amount, NOW(), NOW())
       ON DUPLICATE KEY UPDATE count = count + :amount, updated_at = NOW()`,
      {
        replacements: { id: newId(), userId, period, metric, amount },
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
        processedAt: null,
      },
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

@Injectable()
export class SequelizeVoiceCreditsRepository implements VoiceCreditsRepository {
  constructor(
    @InjectModel(VoiceCreditModel)
    private readonly model: typeof VoiceCreditModel,
  ) {}

  async balance(userId: string): Promise<number> {
    const row = await this.model.findOne({ where: { userId } });
    return row?.balanceSeconds ?? 0;
  }

  /** Atomic upsert-and-add, mirroring the usage counter's shape. */
  async add(userId: string, seconds: number): Promise<void> {
    await this.model.sequelize!.query(
      `INSERT INTO voice_credits (id, user_id, balance_seconds, created_at, updated_at)
       VALUES (:id, :userId, :seconds, NOW(), NOW())
       ON DUPLICATE KEY UPDATE balance_seconds = balance_seconds + :seconds, updated_at = NOW()`,
      {
        replacements: { id: newId(), userId, seconds },
        type: QueryTypes.INSERT,
      },
    );
  }

  async deduct(userId: string, seconds: number): Promise<void> {
    await this.model.sequelize!.query(
      `UPDATE voice_credits
       SET balance_seconds = GREATEST(balance_seconds - :seconds, 0), updated_at = NOW()
       WHERE user_id = :userId`,
      { replacements: { userId, seconds }, type: QueryTypes.UPDATE },
    );
  }
}
