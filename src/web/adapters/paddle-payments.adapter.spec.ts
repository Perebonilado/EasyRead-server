import { createHmac } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { PaddlePaymentsAdapter } from './paddle-payments.adapter';

const SECRET = 'pdl_ntfset_test_secret';

const config = {
  get: (key: string) =>
    ({
      PADDLE_WEBHOOK_SECRET: SECRET,
      PADDLE_PRICE_MONTHLY: 'pri_monthly',
      PADDLE_PRICE_YEARLY: 'pri_yearly',
      PADDLE_ENV: 'sandbox',
    })[key],
  getOrThrow: (key: string) => key,
} as unknown as ConfigService;

const adapter = new PaddlePaymentsAdapter(config);

/** Signs a body the way Paddle does, so the test exercises the real path. */
function sign(body: string, atMs = Date.now()): string {
  const ts = Math.floor(atMs / 1000).toString();
  const h1 = createHmac('sha256', SECRET).update(`${ts}:${body}`).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

const subscriptionBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    event_id: 'evt_01',
    event_type: 'subscription.created',
    occurred_at: '2026-08-21T10:00:00Z',
    data: {
      id: 'sub_01',
      customer_id: 'ctm_01',
      status: 'active',
      custom_data: { userId: 'user-123' },
      current_billing_period: { ends_at: '2026-09-21T10:00:00Z' },
      items: [{ price: { id: 'pri_monthly' } }],
      ...overrides,
    },
  });

describe('PaddlePaymentsAdapter.verifyAndParseWebhook', () => {
  it('accepts a correctly signed body and normalises it', () => {
    const body = subscriptionBody();
    const event = adapter.verifyAndParseWebhook(Buffer.from(body), sign(body));

    expect(event).not.toBeNull();
    expect(event?.id).toBe('evt_01');
    expect(event?.userId).toBe('user-123');
    expect(event?.subscription?.status).toBe('active');
    expect(event?.subscription?.planCode).toBe('pro');
    expect(event?.subscription?.interval).toBe('monthly');
    expect(event?.subscription?.providerCustomerId).toBe('ctm_01');
    expect(event?.subscription?.cancelAtPeriodEnd).toBe(false);
  });

  it('reads the yearly price id as the yearly interval', () => {
    const body = subscriptionBody({ items: [{ price: { id: 'pri_yearly' } }] });
    const event = adapter.verifyAndParseWebhook(Buffer.from(body), sign(body));
    expect(event?.subscription?.interval).toBe('yearly');
  });

  it('treats a scheduled cancellation as cancelling, not cancelled', () => {
    const body = subscriptionBody({ scheduled_change: { action: 'cancel' } });
    const event = adapter.verifyAndParseWebhook(Buffer.from(body), sign(body));
    // Still active: the customer keeps Pro until the period they paid for ends.
    expect(event?.subscription?.status).toBe('active');
    expect(event?.subscription?.cancelAtPeriodEnd).toBe(true);
  });

  it('maps an unknown provider status to expired rather than granting Pro', () => {
    const body = subscriptionBody({ status: 'something_new' });
    const event = adapter.verifyAndParseWebhook(Buffer.from(body), sign(body));
    expect(event?.subscription?.status).toBe('expired');
  });

  it('rejects a tampered body whose signature no longer matches', () => {
    const body = subscriptionBody();
    const signature = sign(body);
    const tampered = body.replace('user-123', 'user-999');

    expect(
      adapter.verifyAndParseWebhook(Buffer.from(tampered), signature),
    ).toBeNull();
  });

  it('rejects a replayed body signed long ago', () => {
    const body = subscriptionBody();
    const old = sign(body, Date.now() - 60 * 60 * 1000);

    expect(adapter.verifyAndParseWebhook(Buffer.from(body), old)).toBeNull();
  });

  it('rejects a missing or malformed signature header', () => {
    const body = subscriptionBody();
    expect(
      adapter.verifyAndParseWebhook(Buffer.from(body), undefined),
    ).toBeNull();
    expect(
      adapter.verifyAndParseWebhook(Buffer.from(body), 'nonsense'),
    ).toBeNull();
  });

  it('carries no subscription for events that are not about one', () => {
    const body = JSON.stringify({
      event_id: 'evt_02',
      event_type: 'transaction.completed',
      occurred_at: '2026-08-21T10:00:00Z',
      data: { id: 'txn_01' },
    });
    const event = adapter.verifyAndParseWebhook(Buffer.from(body), sign(body));

    expect(event?.type).toBe('transaction.completed');
    expect(event?.subscription).toBeNull();
  });
});
