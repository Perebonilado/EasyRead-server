/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for repositories whose interface is Promise-shaped. */
import {
  CancelSchoolPassHandler,
  ResumeSchoolPassHandler,
  StartSchoolPassCheckoutHandler,
} from './school-pass.handlers';
import { ValidationError } from '../../domain/errors/errors';
import type { SchoolPassRecord } from '../../repositories/billing.repository';

const NOW = new Date('2026-09-13T12:00:00Z');

const pass = (overrides: Partial<SchoolPassRecord> = {}): SchoolPassRecord => ({
  userId: 'student',
  institutionId: 'ur',
  freeDocumentId: 'd1',
  freeDocumentAt: NOW,
  provider: 'stripe',
  providerSubscriptionId: 'sub_pass',
  providerCustomerId: null,
  status: 'active',
  currentPeriodEnd: new Date('2027-09-13T12:00:00Z'),
  cancelAtPeriodEnd: false,
  ...overrides,
});

function checkout({
  member = true,
  plan = 'free',
  row = null,
  customer = 'cus_pro',
}: {
  member?: boolean;
  plan?: 'free' | 'pro';
  row?: SchoolPassRecord | null;
  customer?: string | null;
} = {}) {
  const asked: unknown[] = [];
  const handler = new StartSchoolPassCheckoutHandler(
    {
      findById: async (id: string) => ({ id, email: `${id}@ur.ac.rw` }),
    } as never,
    {
      findMembership: async () =>
        member ? { userId: 'student', institutionId: 'ur' } : null,
    } as never,
    {
      findByUser: async () =>
        customer ? { providerCustomerId: customer } : null,
    } as never,
    { findByUser: async () => row } as never,
    {
      createSchoolPassCheckout: async (input: unknown) => {
        asked.push(input);
        return { url: 'https://checkout.example/session' };
      },
    } as never,
    { now: () => NOW },
    { planFor: async () => plan } as never,
  );
  return { handler, asked };
}

describe('checkout for the school pass', () => {
  it("opens checkout for the member's school, reusing the gateway customer", async () => {
    const { handler, asked } = checkout();
    const result = await handler.handle({ userId: 'student' });
    expect(result.data).toEqual({ url: 'https://checkout.example/session' });
    expect(asked).toEqual([
      {
        userId: 'student',
        email: 'student@ur.ac.rw',
        institutionId: 'ur',
        providerCustomerId: 'cus_pro',
      },
    ]);
  });

  it('prefers the customer the pass already knows', async () => {
    const { handler, asked } = checkout({
      row: pass({ status: 'expired', providerCustomerId: 'cus_pass' }),
    });
    await handler.handle({ userId: 'student' });
    expect(
      (asked[0] as { providerCustomerId: string }).providerCustomerId,
    ).toBe('cus_pass');
  });

  it('refuses without a school, on Pro, and while a pass still renews', async () => {
    await expect(
      checkout({ member: false }).handler.handle({ userId: 'student' }),
    ).rejects.toThrow('Join a school first');
    await expect(
      checkout({ plan: 'pro' }).handler.handle({ userId: 'student' }),
    ).rejects.toThrow('Pro already includes your school');
    await expect(
      checkout({ row: pass() }).handler.handle({ userId: 'student' }),
    ).rejects.toThrow('already have a school pass');
  });

  it('lets a cancelling or lapsed pass be bought again', async () => {
    const cancelling = checkout({ row: pass({ cancelAtPeriodEnd: true }) });
    await expect(
      cancelling.handler.handle({ userId: 'student' }),
    ).resolves.toBeDefined();
    const lapsed = checkout({ row: pass({ status: 'cancelled' }) });
    await expect(
      lapsed.handler.handle({ userId: 'student' }),
    ).resolves.toBeDefined();
  });
});

describe('stopping and keeping the pass', () => {
  function build(row: SchoolPassRecord | null, plan: 'free' | 'pro' = 'free') {
    const cancelled: string[] = [];
    const resumed: string[] = [];
    const upserts: SchoolPassRecord[] = [];
    const passes = {
      findAnyByUser: async () => row,
      upsert: async (record: SchoolPassRecord) => {
        upserts.push(record);
        return true;
      },
    } as never;
    const payments = {
      cancelSubscription: async (id: string) => {
        cancelled.push(id);
      },
      resumeSubscription: async (id: string) => {
        resumed.push(id);
        return null;
      },
    } as never;
    return {
      cancel: new CancelSchoolPassHandler(passes, payments),
      resume: new ResumeSchoolPassHandler(passes, payments, {
        planFor: async () => plan,
      } as never),
      cancelled,
      resumed,
      upserts,
    };
  }

  it('cancels at the period end and records it', async () => {
    const { cancel, cancelled, upserts } = build(pass());
    await cancel.handle({ userId: 'student' });
    expect(cancelled).toEqual(['sub_pass']);
    expect(upserts[0].cancelAtPeriodEnd).toBe(true);
  });

  it('refuses to cancel what is not there or already cancelling', async () => {
    await expect(
      build(null).cancel.handle({ userId: 'student' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      build(pass({ cancelAtPeriodEnd: true })).cancel.handle({
        userId: 'student',
      }),
    ).rejects.toThrow('already cancelling');
  });

  it('resumes a cancelling pass, but not on Pro', async () => {
    const { resume, resumed, upserts } = build(
      pass({ cancelAtPeriodEnd: true }),
    );
    await resume.handle({ userId: 'student' });
    expect(resumed).toEqual(['sub_pass']);
    expect(upserts[0].cancelAtPeriodEnd).toBe(false);
    await expect(
      build(pass({ cancelAtPeriodEnd: true }), 'pro').resume.handle({
        userId: 'student',
      }),
    ).rejects.toThrow('Pro already includes your school');
  });
});
