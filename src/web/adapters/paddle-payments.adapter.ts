import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BillingInterval, SubscriptionStatus } from '../../contracts';
import type {
  CheckoutIntent,
  GatewaySubscription,
  GatewayWebhookEvent,
  PaymentsPort,
} from '../../business/ports/payments.port';

/** Paddle's statuses, mapped onto ours. Anything unknown is treated as dead. */
const STATUS: Record<string, SubscriptionStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  paused: 'paused',
  canceled: 'cancelled',
};

/** Tolerance on the signature timestamp, against replay of an old body. */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

interface PaddleSubscriptionPayload {
  id?: string;
  customer_id?: string;
  status?: string;
  scheduled_change?: { action?: string } | null;
  current_billing_period?: { ends_at?: string } | null;
  custom_data?: { userId?: string } | null;
  items?: { price?: { id?: string } }[];
}

interface PaddleEnvelope {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: PaddleSubscriptionPayload;
}

/**
 * Paddle Billing, over its HTTP API.
 *
 * Paddle is the merchant of record: it charges the customer, remits sales
 * tax and VAT in every jurisdiction, and pays out the net. That is why
 * EasiRead can sell worldwide from Nigeria without a US entity, which
 * Stripe would require.
 *
 * Prices live in Paddle and are referenced by id from env, so changing what
 * Pro costs never means shipping code.
 */
@Injectable()
export class PaddlePaymentsAdapter implements PaymentsPort {
  readonly provider = 'paddle';
  private readonly logger = new Logger('Payments');

  constructor(private readonly config: ConfigService) {}

  private get apiBase(): string {
    return this.config.get<string>('PADDLE_ENV') === 'production'
      ? 'https://api.paddle.com'
      : 'https://sandbox-api.paddle.com';
  }

  private priceIdFor(interval: BillingInterval): string {
    return this.config.getOrThrow<string>(
      interval === 'yearly' ? 'PADDLE_PRICE_YEARLY' : 'PADDLE_PRICE_MONTHLY',
    );
  }

  private intervalFor(priceId: string | undefined): BillingInterval | null {
    if (!priceId) return null;
    if (priceId === this.config.get('PADDLE_PRICE_YEARLY')) return 'yearly';
    if (priceId === this.config.get('PADDLE_PRICE_MONTHLY')) return 'monthly';
    return null;
  }

  private async call<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<T> {
    const key = this.config.getOrThrow<string>('PADDLE_API_KEY');
    const response = await fetch(`${this.apiBase}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Paddle refused ${init.method} ${path} (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    return (await response.json()) as T;
  }

  /**
   * A transaction created server-side, not in the browser.
   *
   * The user id rides along in `custom_data`, so the webhook can attribute
   * the subscription to an account without trusting anything the client
   * said. A checkout opened purely client-side could claim any user.
   */
  async createCheckout(input: {
    userId: string;
    email: string;
    interval: BillingInterval;
    providerCustomerId: string | null;
  }): Promise<CheckoutIntent> {
    const body: Record<string, unknown> = {
      items: [{ price_id: this.priceIdFor(input.interval), quantity: 1 }],
      custom_data: { userId: input.userId },
    };
    // A returning subscriber keeps their Paddle customer, so their saved
    // cards and invoice history stay in one place.
    if (input.providerCustomerId) body.customer_id = input.providerCustomerId;
    else body.customer = { email: input.email };

    const created = await this.call<{ data?: { id?: string } }>(
      '/transactions',
      { method: 'POST', body },
    );

    const transactionId = created.data?.id;
    if (!transactionId) throw new Error('Paddle returned no transaction id');
    return { kind: 'overlay', transactionId };
  }

  /**
   * `Paddle-Signature: ts=<unix>;h1=<hmac>` where the HMAC is taken over
   * `<ts>:<raw body>`. The raw bytes matter: re-serialising the parsed JSON
   * would change the digest and every webhook would be rejected.
   */
  verifyAndParseWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): GatewayWebhookEvent | null {
    const secret = this.config.get<string>('PADDLE_WEBHOOK_SECRET');
    if (!secret || !signature) return null;

    const parts = new Map(
      signature.split(';').map((pair) => {
        const [key, value] = pair.split('=');
        return [key?.trim(), value?.trim()] as [string, string];
      }),
    );
    const ts = parts.get('ts');
    const h1 = parts.get('h1');
    if (!ts || !h1) return null;

    const age = Math.abs(Date.now() - Number(ts) * 1000);
    if (!Number.isFinite(age) || age > SIGNATURE_MAX_AGE_MS) {
      this.logger.warn('Rejected a Paddle webhook: signature timestamp stale');
      return null;
    }

    const expected = createHmac('sha256', secret)
      .update(`${ts}:${rawBody.toString('utf8')}`)
      .digest('hex');
    const given = Buffer.from(h1, 'hex');
    const mine = Buffer.from(expected, 'hex');
    if (given.length !== mine.length || !timingSafeEqual(given, mine)) {
      this.logger.warn('Rejected a Paddle webhook: bad signature');
      return null;
    }

    let envelope: PaddleEnvelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf8')) as PaddleEnvelope;
    } catch {
      return null;
    }
    if (!envelope.event_id || !envelope.event_type) return null;

    const data = envelope.data;
    return {
      id: envelope.event_id,
      type: envelope.event_type,
      occurredAt: envelope.occurred_at
        ? new Date(envelope.occurred_at)
        : new Date(),
      userId: data?.custom_data?.userId ?? null,
      subscription:
        envelope.event_type.startsWith('subscription.') && data?.id
          ? this.toSubscription(data)
          : null,
    };
  }

  async fetchSubscription(id: string): Promise<GatewaySubscription | null> {
    const found = await this.call<{ data?: PaddleSubscriptionPayload }>(
      `/subscriptions/${id}`,
      { method: 'GET' },
    ).catch(() => null);
    return found?.data?.id ? this.toSubscription(found.data) : null;
  }

  /**
   * Never mid-period: the customer keeps what they paid for, and the row
   * only drops to Free when Paddle says the period ended.
   */
  async cancelSubscription(id: string): Promise<void> {
    await this.call(`/subscriptions/${id}/cancel`, {
      method: 'POST',
      body: { effective_from: 'next_billing_period' },
    });
  }

  /**
   * Switching between monthly and yearly on a live subscription.
   *
   * Moving up to yearly bills the difference straight away, because the
   * customer is asking for the better rate now. Moving down to monthly
   * takes effect at the next renewal instead: they already paid for this
   * year, and clawing that back as a mid-term credit would be a worse
   * deal than simply letting it run.
   */
  async changeInterval(
    id: string,
    interval: BillingInterval,
  ): Promise<GatewaySubscription | null> {
    const updated = await this.call<{ data?: PaddleSubscriptionPayload }>(
      `/subscriptions/${id}`,
      {
        method: 'PATCH',
        body: {
          items: [{ price_id: this.priceIdFor(interval), quantity: 1 }],
          proration_billing_mode:
            interval === 'yearly'
              ? 'prorated_immediately'
              : 'prorated_next_billing_period',
        },
      },
    );
    return updated.data?.id ? this.toSubscription(updated.data) : null;
  }

  /** Removes the pending cancellation Paddle is holding as a scheduled change. */
  async resumeSubscription(id: string): Promise<GatewaySubscription | null> {
    const updated = await this.call<{ data?: PaddleSubscriptionPayload }>(
      `/subscriptions/${id}`,
      { method: 'PATCH', body: { scheduled_change: null } },
    );
    return updated.data?.id ? this.toSubscription(updated.data) : null;
  }

  async createPortalSession(customerId: string): Promise<string | null> {
    const session = await this.call<{
      data?: { urls?: { general?: { overview?: string } } };
    }>(`/customers/${customerId}/portal-sessions`, {
      method: 'POST',
      body: {},
    }).catch((error: Error) => {
      this.logger.warn(`Paddle portal session failed: ${error.message}`);
      return null;
    });
    return session?.data?.urls?.general?.overview ?? null;
  }

  private toSubscription(data: PaddleSubscriptionPayload): GatewaySubscription {
    const status = STATUS[data.status ?? ''] ?? 'expired';
    return {
      providerSubscriptionId: data.id ?? '',
      providerCustomerId: data.customer_id ?? null,
      // Only one paid plan exists; a live Paddle subscription means Pro.
      planCode: 'pro',
      interval: this.intervalFor(data.items?.[0]?.price?.id),
      status,
      currentPeriodEnd: data.current_billing_period?.ends_at
        ? new Date(data.current_billing_period.ends_at)
        : null,
      // Paddle keeps the subscription active and records the pending
      // cancellation as a scheduled change until the period actually ends.
      cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
    };
  }
}
