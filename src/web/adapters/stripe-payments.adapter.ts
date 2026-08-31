import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BillingInterval, SubscriptionStatus } from '../../contracts';
import {
  CREDIT_BUNDLES,
  type CreditBundle,
} from '../../business/domain/values';
import type {
  CheckoutIntent,
  GatewaySubscription,
  GatewayWebhookEvent,
  PaymentsPort,
} from '../../business/ports/payments.port';

/**
 * Stripe's statuses, mapped onto ours. Anything unknown is treated as dead,
 * so a status Stripe adds tomorrow can never quietly grant Pro.
 *
 * `incomplete` is a checkout whose first payment never succeeded, and
 * `unpaid` is one whose retries were exhausted; neither is access.
 */
const STATUS: Record<string, SubscriptionStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  paused: 'paused',
  canceled: 'cancelled',
  unpaid: 'expired',
  incomplete: 'expired',
  incomplete_expired: 'expired',
};

/** Tolerance on the signature timestamp, against replay of an old body. */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/** Pinned, so Stripe changing its default shape is never a surprise. */
const API_VERSION = '2025-08-27.basil';

interface StripeSubscription {
  id?: string;
  customer?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: { userId?: string } | null;
  items?: {
    data?: {
      id?: string;
      price?: { id?: string };
      current_period_end?: number;
    }[];
  };
}

interface StripeCheckoutSession {
  id?: string;
  mode?: string;
  customer?: string;
  client_reference_id?: string;
  metadata?: { userId?: string; creditSeconds?: string } | null;
}

interface StripeEnvelope {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: StripeSubscription & StripeCheckoutSession };
}

/**
 * Stripe, over its HTTP API.
 *
 * Unlike Paddle and Inflow before it, Stripe is a payment processor rather
 * than a merchant of record: EasiRead's own US entity is the seller. Sales
 * tax and VAT are calculated and collected by Stripe Tax on every session
 * (`automatic_tax`), so the prices in the catalogue stay tax-exclusive USD
 * and the buyer sees tax added at checkout.
 *
 * Checkout is Stripe's hosted page: every intent minted here is a
 * `redirect`, the customer returns to `/billing?checkout=success`, and the
 * signed webhook — never the redirect — is what actually grants Pro.
 */
@Injectable()
export class StripePaymentsAdapter implements PaymentsPort {
  readonly provider = 'stripe';
  private readonly logger = new Logger('Payments');

  constructor(private readonly config: ConfigService) {}

  private priceIdFor(interval: BillingInterval): string {
    return this.config.getOrThrow<string>(
      interval === 'yearly' ? 'STRIPE_PRICE_YEARLY' : 'STRIPE_PRICE_MONTHLY',
    );
  }

  private bundlePriceId(bundle: CreditBundle): string {
    return this.config.getOrThrow<string>(
      {
        min30: 'STRIPE_PRICE_MIN30',
        min90: 'STRIPE_PRICE_MIN90',
        min220: 'STRIPE_PRICE_MIN220',
      }[bundle],
    );
  }

  private intervalFor(priceId: string | undefined): BillingInterval | null {
    if (!priceId) return null;
    if (priceId === this.config.get('STRIPE_PRICE_YEARLY')) return 'yearly';
    if (priceId === this.config.get('STRIPE_PRICE_MONTHLY')) return 'monthly';
    return null;
  }

  /**
   * Where the hosted checkout sends the customer afterwards. FRONTEND_URL
   * may list several origins for CORS; the first one is the canonical app.
   */
  private returnUrl(outcome: 'success' | 'cancelled'): string {
    const origin = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    )
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
    return `${origin}/billing?checkout=${outcome}`;
  }

  /**
   * Stripe speaks form-encoding, not JSON, and expresses nesting in the key:
   * `line_items[0][price]=price_123`. Flattening here keeps every call site
   * writing plain objects.
   */
  private encode(value: unknown, prefix = ''): string[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
      return value.flatMap((item, index) =>
        this.encode(item, `${prefix}[${index}]`),
      );
    }
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).flatMap(
        ([key, inner]) =>
          this.encode(inner, prefix ? `${prefix}[${key}]` : key),
      );
    }
    // Everything object-shaped was flattened above, so what is left should
    // be a scalar. Narrowing rather than String()-ing means an accidental
    // value can never silently encode as "[object Object]".
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return [];
    }
    return [
      `${encodeURIComponent(prefix)}=${encodeURIComponent(value.toString())}`,
    ];
  }

  private async call<T>(
    path: string,
    init: { method: string; body?: Record<string, unknown> },
  ): Promise<T> {
    const key = this.config.getOrThrow<string>('STRIPE_SECRET_KEY');
    const response = await fetch(`https://api.stripe.com${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': API_VERSION,
      },
      body:
        init.body === undefined ? undefined : this.encode(init.body).join('&'),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const hint =
        response.status === 401
          ? ' — the STRIPE_SECRET_KEY was refused; check it belongs to this mode (a test key cannot act on live data, nor the reverse)'
          : '';
      throw new Error(
        `Stripe refused ${init.method} ${path} (${response.status}): ${detail.slice(0, 300)}${hint}`,
      );
    }
    return (await response.json()) as T;
  }

  /**
   * A hosted Checkout session for Pro.
   *
   * The user id rides in three places on purpose: `client_reference_id` and
   * the session metadata for the completion event, and `subscription_data`
   * metadata so it lands on the subscription itself — that is what every
   * later renewal and cancellation event carries.
   */
  async createCheckout(input: {
    userId: string;
    email: string;
    interval: BillingInterval;
    providerCustomerId: string | null;
  }): Promise<CheckoutIntent> {
    const body: Record<string, unknown> = {
      mode: 'subscription',
      line_items: [{ price: this.priceIdFor(input.interval), quantity: 1 }],
      client_reference_id: input.userId,
      metadata: { userId: input.userId },
      subscription_data: { metadata: { userId: input.userId } },
      success_url: this.returnUrl('success'),
      cancel_url: this.returnUrl('cancelled'),
      // Stripe Tax works out and collects VAT and US sales tax per buyer,
      // so the catalogue stays tax-exclusive USD.
      automatic_tax: { enabled: true },
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
    };
    if (input.providerCustomerId) {
      body.customer = input.providerCustomerId;
      // Automatic tax needs an address on the customer; without this Stripe
      // refuses the session outright for a customer that has none yet.
      body.customer_update = { address: 'auto', name: 'auto' };
    } else {
      // No customer_creation here: subscription mode always makes one, and
      // Stripe rejects the parameter outright outside payment mode.
      body.customer_email = input.email;
    }

    const session = await this.call<{ url?: string }>('/v1/checkout/sessions', {
      method: 'POST',
      body,
    });
    if (!session.url) throw new Error('Stripe returned no checkout url');
    return { url: session.url };
  }

  /**
   * The same hosted page in one-time mode. The credited seconds ride in the
   * session metadata, so the completion event can top the wallet up without
   * a catalogue lookup — the session says what it bought.
   */
  async createCreditCheckout(input: {
    userId: string;
    email: string;
    bundle: CreditBundle;
    providerCustomerId: string | null;
  }): Promise<CheckoutIntent> {
    const body: Record<string, unknown> = {
      mode: 'payment',
      line_items: [{ price: this.bundlePriceId(input.bundle), quantity: 1 }],
      client_reference_id: input.userId,
      metadata: {
        userId: input.userId,
        creditSeconds: CREDIT_BUNDLES[input.bundle].minutes * 60,
      },
      success_url: this.returnUrl('success'),
      cancel_url: this.returnUrl('cancelled'),
      automatic_tax: { enabled: true },
      billing_address_collection: 'auto',
    };
    if (input.providerCustomerId) {
      body.customer = input.providerCustomerId;
      body.customer_update = { address: 'auto', name: 'auto' };
    } else {
      body.customer_email = input.email;
      body.customer_creation = 'always';
    }

    const session = await this.call<{ url?: string }>('/v1/checkout/sessions', {
      method: 'POST',
      body,
    });
    if (!session.url) throw new Error('Stripe returned no checkout url');
    return { url: session.url };
  }

  /**
   * `Stripe-Signature: t=<unix>,v1=<hmac>` where the HMAC is taken over
   * `<t>.<raw body>`. The raw bytes matter: re-serialising the parsed JSON
   * would change the digest and every webhook would be rejected.
   */
  verifyAndParseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<GatewayWebhookEvent[] | null> {
    return Promise.resolve(this.parseDelivery(rawBody, headers));
  }

  private parseDelivery(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): GatewayWebhookEvent[] | null {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    const signature = headers['stripe-signature'];
    if (!secret || !signature) return null;

    const parts = new Map<string, string[]>();
    for (const pair of signature.split(',')) {
      const [key, value] = pair.split('=');
      if (!key || !value) continue;
      parts.set(key.trim(), [...(parts.get(key.trim()) ?? []), value.trim()]);
    }
    const timestamp = parts.get('t')?.[0];
    const signatures = parts.get('v1') ?? [];
    if (!timestamp || signatures.length === 0) return null;

    const age = Math.abs(Date.now() - Number(timestamp) * 1000);
    if (!Number.isFinite(age) || age > SIGNATURE_MAX_AGE_MS) {
      this.logger.warn('Rejected a Stripe webhook: signature timestamp stale');
      return null;
    }

    const mine = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest();
    // Stripe sends several v1 signatures while a secret is being rotated.
    const matches = signatures.some((candidate) => {
      const given = Buffer.from(candidate, 'hex');
      return given.length === mine.length && timingSafeEqual(given, mine);
    });
    if (!matches) {
      this.logger.warn('Rejected a Stripe webhook: bad signature');
      return null;
    }

    // Signature verified: from here, an unreadable body is an empty batch,
    // not a forgery.
    let envelope: StripeEnvelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf8')) as StripeEnvelope;
    } catch {
      return [];
    }
    if (!envelope.id || !envelope.type) return [];

    const object = envelope.data?.object ?? {};
    const occurredAt = envelope.created
      ? new Date(envelope.created * 1000)
      : new Date();

    const event: GatewayWebhookEvent = {
      id: envelope.id,
      type: envelope.type,
      occurredAt,
      userId: null,
      subscription: null,
      creditSeconds: null,
    };

    if (envelope.type.startsWith('customer.subscription.') && object.id) {
      event.subscription = this.toSubscription(object);
      event.userId = object.metadata?.userId ?? null;
      return [event];
    }

    // A finished one-time checkout: the only thing that credits the wallet.
    // A subscription session reaches here too and correctly credits nothing,
    // because only bundle sessions carry creditSeconds.
    if (envelope.type === 'checkout.session.completed') {
      event.userId =
        object.metadata?.userId ?? object.client_reference_id ?? null;
      if (object.mode === 'payment') {
        const credited = Number(object.metadata?.creditSeconds);
        if (Number.isFinite(credited) && credited > 0) {
          event.creditSeconds = Math.round(credited);
        }
      }
    }
    return [event];
  }

  async fetchSubscription(id: string): Promise<GatewaySubscription | null> {
    const found = await this.call<StripeSubscription>(
      `/v1/subscriptions/${id}`,
      { method: 'GET' },
    ).catch(() => null);
    return found?.id ? this.toSubscription(found) : null;
  }

  async fetchCustomerEmail(customerId: string): Promise<string | null> {
    const found = await this.call<{ email?: string; deleted?: boolean }>(
      `/v1/customers/${customerId}`,
      { method: 'GET' },
    ).catch(() => null);
    return found?.email?.toLowerCase() ?? null;
  }

  /**
   * Never mid-period: the customer keeps what they paid for, and the row
   * only drops to Free when Stripe says the period ended.
   */
  async cancelSubscription(id: string): Promise<void> {
    await this.call(`/v1/subscriptions/${id}`, {
      method: 'POST',
      body: { cancel_at_period_end: true },
    });
  }

  /** Clears the pending cancellation, so the subscription renews after all. */
  async resumeSubscription(id: string): Promise<GatewaySubscription | null> {
    const updated = await this.call<StripeSubscription>(
      `/v1/subscriptions/${id}`,
      { method: 'POST', body: { cancel_at_period_end: false } },
    );
    return updated.id ? this.toSubscription(updated) : null;
  }

  /**
   * Switching between monthly and yearly on a live subscription.
   *
   * Moving up to yearly invoices the difference straight away, because the
   * customer is asking for the better rate now. Moving down to monthly takes
   * effect at the next renewal with no proration: they already paid for this
   * year, and clawing that back as a credit would be a worse deal than
   * letting it run.
   *
   * Stripe replaces a subscription's price by item id, so the current item
   * is read first — updating by price alone would add a second line rather
   * than swap the existing one.
   */
  async changeInterval(
    id: string,
    interval: BillingInterval,
  ): Promise<GatewaySubscription | null> {
    const current = await this.call<StripeSubscription>(
      `/v1/subscriptions/${id}`,
      { method: 'GET' },
    );
    const itemId = current.items?.data?.[0]?.id;
    if (!itemId) throw new Error('Stripe subscription has no item to change');

    const updated = await this.call<StripeSubscription>(
      `/v1/subscriptions/${id}`,
      {
        method: 'POST',
        body: {
          items: [{ id: itemId, price: this.priceIdFor(interval) }],
          proration_behavior: interval === 'yearly' ? 'always_invoice' : 'none',
          payment_behavior: 'allow_incomplete',
        },
      },
    );
    return updated.id ? this.toSubscription(updated) : null;
  }

  /** Stripe's own card-and-invoices page. */
  async createPortalSession(customerId: string): Promise<string | null> {
    const session = await this.call<{ url?: string }>(
      '/v1/billing_portal/sessions',
      {
        method: 'POST',
        body: {
          customer: customerId,
          return_url: this.returnUrl('success').replace(
            '?checkout=success',
            '',
          ),
        },
      },
    ).catch((error: Error) => {
      this.logger.warn(`Stripe portal session failed: ${error.message}`);
      return null;
    });
    return session?.url ?? null;
  }

  private toSubscription(data: StripeSubscription): GatewaySubscription {
    // Stripe moved the period boundary onto the item; older payloads and
    // the API version pinned above may still carry it at the top level.
    const periodEnd =
      data.items?.data?.[0]?.current_period_end ?? data.current_period_end;
    return {
      providerSubscriptionId: data.id ?? '',
      providerCustomerId: data.customer ?? null,
      // Only one paid plan exists; a live Stripe subscription means Pro.
      planCode: 'pro',
      interval: this.intervalFor(data.items?.data?.[0]?.price?.id),
      status: STATUS[data.status ?? ''] ?? 'expired',
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: data.cancel_at_period_end === true,
    };
  }
}
