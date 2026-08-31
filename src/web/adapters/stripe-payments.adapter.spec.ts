import { createHmac } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { StripePaymentsAdapter } from './stripe-payments.adapter';

/**
 * Signatures are minted the way Stripe mints them, so a verification bug
 * fails here rather than against the live gateway. The checkout and
 * lifecycle calls assert the exact form-encoded wire shape, because those
 * payloads are the whole integration — an unsent `automatic_tax` would mean
 * uncollected VAT nobody notices until a tax return.
 */
const SECRET = 'whsec_test_stripe_secret';

const VALUES: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_key',
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_MONTHLY: 'price_monthly',
  STRIPE_PRICE_YEARLY: 'price_yearly',
  STRIPE_PRICE_MIN30: 'price_min30',
  STRIPE_PRICE_MIN90: 'price_min90',
  STRIPE_PRICE_MIN220: 'price_min220',
  FRONTEND_URL: 'https://easiread.com,https://www.easiread.com',
};

const config = {
  get: (key: string) => VALUES[key],
  getOrThrow: (key: string) => {
    const value = VALUES[key];
    if (!value) throw new Error(`missing ${key}`);
    return value;
  },
} as unknown as ConfigService;

const adapter = new StripePaymentsAdapter(config);

/** Signs a body the way Stripe does: HMAC-SHA256 over `t.body`, hex. */
function sign(body: string, atMs = Date.now()): Record<string, string> {
  const t = Math.floor(atMs / 1000).toString();
  const v1 = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  return { 'stripe-signature': `t=${t},v1=${v1}` };
}

const subscriptionEvent = (
  overrides: Record<string, unknown> = {},
  type = 'customer.subscription.updated',
) =>
  JSON.stringify({
    id: 'evt_01',
    type,
    created: Math.floor(Date.parse('2026-08-21T10:00:00Z') / 1000),
    data: {
      object: {
        id: 'sub_01',
        customer: 'cus_01',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { userId: 'user-123' },
        items: {
          data: [
            {
              id: 'si_01',
              price: { id: 'price_monthly' },
              current_period_end: Math.floor(
                Date.parse('2026-09-21T10:00:00Z') / 1000,
              ),
            },
          ],
        },
        ...overrides,
      },
    },
  });

/** Parses a form-encoded request body back into comparable pairs. */
const sent = (body: unknown) =>
  Object.fromEntries(new URLSearchParams(String(body)));

describe('StripePaymentsAdapter.verifyAndParseWebhook', () => {
  it('accepts a correctly signed event and normalises it', async () => {
    const body = subscriptionEvent();
    const [event] =
      (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
      [];

    expect(event?.id).toBe('evt_01');
    expect(event?.userId).toBe('user-123');
    expect(event?.occurredAt.toISOString()).toBe('2026-08-21T10:00:00.000Z');
    expect(event?.subscription?.status).toBe('active');
    expect(event?.subscription?.planCode).toBe('pro');
    expect(event?.subscription?.interval).toBe('monthly');
    expect(event?.subscription?.providerCustomerId).toBe('cus_01');
    expect(event?.subscription?.currentPeriodEnd?.toISOString()).toBe(
      '2026-09-21T10:00:00.000Z',
    );
    expect(event?.subscription?.cancelAtPeriodEnd).toBe(false);
  });

  it('reads the yearly price id as the yearly interval', async () => {
    const body = subscriptionEvent({
      items: { data: [{ id: 'si_01', price: { id: 'price_yearly' } }] },
    });
    const [event] =
      (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
      [];
    expect(event?.subscription?.interval).toBe('yearly');
  });

  it('treats a scheduled cancellation as cancelling, not cancelled', async () => {
    const body = subscriptionEvent({ cancel_at_period_end: true });
    const [event] =
      (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
      [];
    // Still active: the customer keeps Pro until the period they paid for ends.
    expect(event?.subscription?.status).toBe('active');
    expect(event?.subscription?.cancelAtPeriodEnd).toBe(true);
  });

  it('grants nothing for a checkout whose first payment never succeeded', async () => {
    const body = subscriptionEvent({ status: 'incomplete' });
    const [event] =
      (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
      [];
    expect(event?.subscription?.status).toBe('expired');
  });

  it('maps unpaid and unknown statuses to expired rather than granting Pro', async () => {
    for (const status of ['unpaid', 'incomplete_expired', 'something_new']) {
      const body = subscriptionEvent({ status });
      const [event] =
        (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
        [];
      expect(event?.subscription?.status).toBe('expired');
    }
  });

  it('falls back to a top-level period end when the item carries none', async () => {
    const body = subscriptionEvent({
      current_period_end: Math.floor(Date.parse('2026-10-01T00:00:00Z') / 1000),
      items: { data: [{ id: 'si_01', price: { id: 'price_monthly' } }] },
    });
    const [event] =
      (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
      [];
    expect(event?.subscription?.currentPeriodEnd?.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });

  it('credits the wallet from a completed one-time checkout', async () => {
    const body = JSON.stringify({
      id: 'evt_02',
      type: 'checkout.session.completed',
      created: 1_790_000_000,
      data: {
        object: {
          id: 'cs_01',
          mode: 'payment',
          client_reference_id: 'user-123',
          metadata: { userId: 'user-123', creditSeconds: '1800' },
        },
      },
    });
    const [event] =
      (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
      [];

    expect(event?.creditSeconds).toBe(1800);
    expect(event?.userId).toBe('user-123');
    expect(event?.subscription).toBeNull();
  });

  it('credits nothing when a subscription checkout completes', async () => {
    const body = JSON.stringify({
      id: 'evt_03',
      type: 'checkout.session.completed',
      created: 1_790_000_000,
      data: {
        object: {
          id: 'cs_02',
          mode: 'subscription',
          client_reference_id: 'user-123',
          metadata: { userId: 'user-123' },
        },
      },
    });
    const [event] =
      (await adapter.verifyAndParseWebhook(Buffer.from(body), sign(body))) ??
      [];
    // The subscription events grant Pro; this one must not also buy minutes.
    expect(event?.creditSeconds).toBeNull();
    expect(event?.userId).toBe('user-123');
  });

  it('rejects a tampered body whose signature no longer matches', async () => {
    const body = subscriptionEvent();
    const headers = sign(body);
    const tampered = body.replace('user-123', 'user-999');

    await expect(
      adapter.verifyAndParseWebhook(Buffer.from(tampered), headers),
    ).resolves.toBeNull();
  });

  it('rejects a replayed body signed long ago', async () => {
    const body = subscriptionEvent();
    const old = sign(body, Date.now() - 60 * 60 * 1000);

    await expect(
      adapter.verifyAndParseWebhook(Buffer.from(body), old),
    ).resolves.toBeNull();
  });

  it('rejects a missing or malformed signature header', async () => {
    const body = subscriptionEvent();
    await expect(
      adapter.verifyAndParseWebhook(Buffer.from(body), {}),
    ).resolves.toBeNull();
    await expect(
      adapter.verifyAndParseWebhook(Buffer.from(body), {
        'stripe-signature': 'nonsense',
      }),
    ).resolves.toBeNull();
  });

  it('accepts any one matching signature during a secret rotation', async () => {
    const body = subscriptionEvent();
    const headers = sign(body);
    headers['stripe-signature'] =
      `${headers['stripe-signature']},v1=${'0'.repeat(64)}`;

    const events = await adapter.verifyAndParseWebhook(
      Buffer.from(body),
      headers,
    );
    expect(events).toHaveLength(1);
  });

  it('returns an empty batch, not a refusal, for a verified body it cannot read', async () => {
    const body = 'not json at all';
    await expect(
      adapter.verifyAndParseWebhook(Buffer.from(body), sign(body)),
    ).resolves.toEqual([]);
  });
});

describe('StripePaymentsAdapter checkout and lifecycle calls', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  const respond = (payload: unknown) =>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });

  it('mints a hosted subscription checkout that collects tax and names our user', async () => {
    respond({ id: 'cs_01', url: 'https://checkout.stripe.com/c/cs_01' });

    const intent = await adapter.createCheckout({
      userId: 'user-123',
      email: 'reader@example.com',
      interval: 'yearly',
      providerCustomerId: null,
    });

    expect(intent).toEqual({ url: 'https://checkout.stripe.com/c/cs_01' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const form = sent(init.body);
    expect(form.mode).toBe('subscription');
    expect(form['line_items[0][price]']).toBe('price_yearly');
    expect(form.client_reference_id).toBe('user-123');
    expect(form['metadata[userId]']).toBe('user-123');
    // The one that every later renewal event depends on.
    expect(form['subscription_data[metadata][userId]']).toBe('user-123');
    expect(form['automatic_tax[enabled]']).toBe('true');
    expect(form.customer_email).toBe('reader@example.com');
    // The first FRONTEND_URL origin is the canonical app.
    expect(form.success_url).toBe(
      'https://easiread.com/billing?checkout=success',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_test_key');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('reuses a known customer and lets Stripe Tax fill in their address', async () => {
    respond({ id: 'cs_02', url: 'https://checkout.stripe.com/c/cs_02' });

    await adapter.createCheckout({
      userId: 'user-123',
      email: 'reader@example.com',
      interval: 'monthly',
      providerCustomerId: 'cus_01',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = sent(init.body);
    expect(form.customer).toBe('cus_01');
    // Without this Stripe refuses the session outright when automatic tax
    // is on and the customer has no address yet.
    expect(form['customer_update[address]']).toBe('auto');
    expect(form.customer_email).toBeUndefined();
  });

  it('never asks subscription mode to create a customer, which Stripe refuses', async () => {
    respond({ id: 'cs_sub', url: 'https://checkout.stripe.com/c/cs_sub' });

    await adapter.createCheckout({
      userId: 'user-123',
      email: 'reader@example.com',
      interval: 'monthly',
      providerCustomerId: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = sent(init.body);
    // Subscription mode always creates a customer; passing the flag is a
    // 400 that only shows up against the live API.
    expect(form.customer_creation).toBeUndefined();
    expect(form.customer_email).toBe('reader@example.com');
  });

  it('does ask payment mode to create one, so bundle buyers are reusable', async () => {
    respond({ id: 'cs_pay', url: 'https://checkout.stripe.com/c/cs_pay' });

    await adapter.createCreditCheckout({
      userId: 'user-123',
      email: 'reader@example.com',
      bundle: 'min30',
      providerCustomerId: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(sent(init.body).customer_creation).toBe('always');
  });

  it('sells a credit bundle with the seconds stamped into metadata', async () => {
    respond({ id: 'cs_03', url: 'https://checkout.stripe.com/c/cs_03' });

    await adapter.createCreditCheckout({
      userId: 'user-123',
      email: 'reader@example.com',
      bundle: 'min90',
      providerCustomerId: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = sent(init.body);
    expect(form.mode).toBe('payment');
    expect(form['line_items[0][price]']).toBe('price_min90');
    expect(form['metadata[creditSeconds]']).toBe('5400');
    expect(form['metadata[userId]']).toBe('user-123');
  });

  it('cancels at period end, never mid-period', async () => {
    respond({ id: 'sub_01' });

    await adapter.cancelSubscription('sub_01');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/subscriptions/sub_01');
    expect(sent(init.body).cancel_at_period_end).toBe('true');
  });

  it('swaps the existing item when moving up to yearly, and invoices now', async () => {
    respond({
      id: 'sub_01',
      items: { data: [{ id: 'si_01', price: { id: 'price_monthly' } }] },
    });
    respond({
      id: 'sub_01',
      status: 'active',
      items: { data: [{ id: 'si_01', price: { id: 'price_yearly' } }] },
    });

    const updated = await adapter.changeInterval('sub_01', 'yearly');

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const form = sent(init.body);
    // By item id: updating by price alone would add a second line instead
    // of replacing the one they are on.
    expect(form['items[0][id]']).toBe('si_01');
    expect(form['items[0][price]']).toBe('price_yearly');
    expect(form.proration_behavior).toBe('always_invoice');
    expect(updated?.interval).toBe('yearly');
  });

  it('lets a downgrade to monthly wait for the renewal, with no clawback', async () => {
    respond({
      id: 'sub_01',
      items: { data: [{ id: 'si_01', price: { id: 'price_yearly' } }] },
    });
    respond({
      id: 'sub_01',
      status: 'active',
      items: { data: [{ id: 'si_01', price: { id: 'price_monthly' } }] },
    });

    await adapter.changeInterval('sub_01', 'monthly');

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(sent(init.body).proration_behavior).toBe('none');
  });

  it('resumes by clearing the pending cancellation', async () => {
    respond({ id: 'sub_01', status: 'active', cancel_at_period_end: false });

    const resumed = await adapter.resumeSubscription('sub_01');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(sent(init.body).cancel_at_period_end).toBe('false');
    expect(resumed?.cancelAtPeriodEnd).toBe(false);
  });

  it('opens the hosted billing portal', async () => {
    respond({ url: 'https://billing.stripe.com/p/session_01' });

    const url = await adapter.createPortalSession('cus_01');

    expect(url).toBe('https://billing.stripe.com/p/session_01');
    const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(called).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(sent(init.body).customer).toBe('cus_01');
  });

  it('recovers a customer email as the last attribution thread', async () => {
    respond({ id: 'cus_01', email: 'Reader@Example.com' });
    await expect(adapter.fetchCustomerEmail('cus_01')).resolves.toBe(
      'reader@example.com',
    );
  });

  it('surfaces a refused key as an explanatory error, not a bare status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":{"message":"Invalid API Key"}}'),
    });

    await expect(
      adapter.createCheckout({
        userId: 'user-123',
        email: 'reader@example.com',
        interval: 'monthly',
        providerCustomerId: null,
      }),
    ).rejects.toThrow(/test key cannot act on live data/);
  });
});
