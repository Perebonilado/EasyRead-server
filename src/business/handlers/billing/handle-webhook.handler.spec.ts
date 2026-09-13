/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for the gateway and repositories, all Promise-shaped. */
import { HandleWebhookHandler } from './handle-webhook.handler';
import type { GatewayWebhookEvent } from '../../ports/payments.port';
import type {
  SchoolPassRecord,
  SchoolPassSubscription,
  SubscriptionRecord,
} from '../../repositories/billing.repository';

const NOW = new Date('2026-09-13T12:00:00Z');

const event = (
  subscription: Partial<NonNullable<GatewayWebhookEvent['subscription']>>,
  id = 'evt_1',
): GatewayWebhookEvent => ({
  id,
  type: 'customer.subscription.updated',
  occurredAt: NOW,
  userId: 'student',
  creditSeconds: null,
  subscription: {
    providerSubscriptionId: 'sub_1',
    providerCustomerId: 'cus_1',
    planCode: 'pro',
    interval: 'yearly',
    status: 'active',
    currentPeriodEnd: new Date('2027-09-13T12:00:00Z'),
    cancelAtPeriodEnd: false,
    ...subscription,
  },
});

function build(
  events: GatewayWebhookEvent[],
  passRow: SchoolPassRecord | null,
) {
  const cancelled: string[] = [];
  const subscriptionWrites: SubscriptionRecord[] = [];
  const passWrites: SchoolPassSubscription[] = [];
  const handler = new HandleWebhookHandler(
    {
      provider: 'stripe',
      verifyAndParseWebhook: async () => events,
      fetchCustomerEmail: async () => null,
      cancelSubscription: async (id: string) => {
        cancelled.push(id);
      },
    } as never,
    {
      findByProviderSubscriptionId: async () => null,
      upsert: async (record: SubscriptionRecord) => {
        subscriptionWrites.push(record);
        return true;
      },
    } as never,
    { claim: async () => true, markProcessed: async () => undefined },
    {
      findById: async (id: string) => (id === 'student' ? { id } : null),
      findByEmail: async () => null,
    } as never,
    { add: async () => undefined } as never,
    { now: () => NOW },
    {
      findAnyByUser: async () => passRow,
      findByProviderSubscriptionId: async () => null,
      upsert: async (record: SchoolPassSubscription) => {
        passWrites.push(record);
        return true;
      },
    } as never,
  );
  return { handler, cancelled, subscriptionWrites, passWrites };
}

const run = (handler: HandleWebhookHandler) =>
  handler.handle({ rawBody: Buffer.from('{}'), headers: {} });

describe('a school pass arriving from the gateway', () => {
  it('writes the pass for its school, and never the Pro subscription', async () => {
    const { handler, subscriptionWrites, passWrites } = build(
      [
        event({
          providerSubscriptionId: 'sub_pass',
          product: 'school',
          institutionId: 'ur',
        }),
      ],
      null,
    );
    await run(handler);
    expect(subscriptionWrites).toEqual([]);
    expect(passWrites).toHaveLength(1);
    expect(passWrites[0]).toMatchObject({
      userId: 'student',
      institutionId: 'ur',
      provider: 'stripe',
      providerSubscriptionId: 'sub_pass',
      status: 'active',
      lastEventAt: NOW,
    });
  });

  it('drops a pass that names no school and no known member', async () => {
    const { handler, passWrites } = build(
      [
        event({
          product: 'school',
          institutionId: null,
          userId: null,
        } as never),
      ],
      null,
    );
    await run(handler);
    expect(passWrites).toEqual([]);
  });
});

describe('Pro arriving while a pass renews', () => {
  const renewing: SchoolPassRecord = {
    userId: 'student',
    institutionId: 'ur',
    freeDocumentId: 'd1',
    freeDocumentAt: NOW,
    provider: 'stripe',
    providerSubscriptionId: 'sub_pass',
    providerCustomerId: 'cus_1',
    status: 'active',
    currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
    cancelAtPeriodEnd: false,
  };

  it('stops the pass renewing at its period end, so nobody pays twice', async () => {
    const { handler, cancelled, subscriptionWrites, passWrites } = build(
      [event({})],
      renewing,
    );
    await run(handler);
    expect(subscriptionWrites).toHaveLength(1);
    expect(cancelled).toEqual(['sub_pass']);
    expect(passWrites[0]).toMatchObject({
      providerSubscriptionId: 'sub_pass',
      cancelAtPeriodEnd: true,
    });
  });

  it('leaves a pass that is already cancelling or not live alone', async () => {
    const already = build([event({})], {
      ...renewing,
      cancelAtPeriodEnd: true,
    });
    await run(already.handler);
    expect(already.cancelled).toEqual([]);
    const lapsed = build([event({})], { ...renewing, status: 'cancelled' });
    await run(lapsed.handler);
    expect(lapsed.cancelled).toEqual([]);
  });

  it('does nothing to the pass when Pro is not live', async () => {
    const { handler, cancelled } = build(
      [event({ status: 'expired' })],
      renewing,
    );
    await run(handler);
    expect(cancelled).toEqual([]);
  });
});
