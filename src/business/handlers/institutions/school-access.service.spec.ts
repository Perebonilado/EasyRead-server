/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for repositories whose interface is Promise-shaped. */
import { SchoolAccessService } from './school-access.service';
import { SchoolPassRequiredError } from '../../domain/errors/errors';
import type { SchoolPassRecord } from '../../repositories/billing.repository';

const NOW = new Date('2026-09-13T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const pass = (overrides: Partial<SchoolPassRecord> = {}): SchoolPassRecord => ({
  userId: 'student',
  institutionId: 'ur',
  provider: 'stripe',
  providerSubscriptionId: 'sub_pass',
  providerCustomerId: 'cus_1',
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  ...overrides,
});

function build({
  plan = 'free',
  freeUntil = null,
  row = null,
}: {
  plan?: 'free' | 'pro';
  freeUntil?: string | null;
  row?: SchoolPassRecord | null;
} = {}) {
  return new SchoolAccessService(
    { planFor: async () => plan } as never,
    {
      findById: async () => ({ id: 'ur', passFreeUntil: freeUntil }),
    } as never,
    { findByUser: async () => row } as never,
    { now: () => NOW },
  );
}

describe('who may read a school document, in order', () => {
  it('Pro first, whatever the pass says', async () => {
    const service = build({ plan: 'pro', row: pass({ status: 'expired' }) });
    expect((await service.standing('student', 'ur')).access).toBe('pro');
    await expect(
      service.assertMayRead('student', 'ur'),
    ).resolves.toBeUndefined();
  });

  it('then the school being free until a date, and not past it', async () => {
    const soon = new Date(NOW.getTime() + DAY).toISOString();
    const gone = new Date(NOW.getTime() - DAY).toISOString();
    expect((await build({ freeUntil: soon }).standing('s', 'ur')).access).toBe(
      'school_free',
    );
    expect((await build({ freeUntil: gone }).standing('s', 'ur')).access).toBe(
      'locked',
    );
  });

  it('then a live pass, with a week of grace after a failed renewal', async () => {
    expect(
      (await build({ row: pass({ status: 'active' }) }).standing('s', 'ur'))
        .access,
    ).toBe('pass');
    const retrying = build({
      row: pass({
        status: 'past_due',
        currentPeriodEnd: new Date(NOW.getTime() - 3 * DAY),
      }),
    });
    expect((await retrying.standing('s', 'ur')).access).toBe('pass');
    const lapsed = build({
      row: pass({
        status: 'past_due',
        currentPeriodEnd: new Date(NOW.getTime() - 10 * DAY),
      }),
    });
    expect((await lapsed.standing('s', 'ur')).access).toBe('locked');
  });

  it('locks everything else, and refuses a read with the pass error', async () => {
    const nothing = build();
    expect((await nothing.standing('s', 'ur')).access).toBe('locked');
    await expect(nothing.assertMayRead('s', 'ur')).rejects.toBeInstanceOf(
      SchoolPassRequiredError,
    );
    const cancelled = build({ row: pass({ status: 'cancelled' }) });
    await expect(cancelled.assertMayRead('s', 'ur')).rejects.toBeInstanceOf(
      SchoolPassRequiredError,
    );
  });
});
