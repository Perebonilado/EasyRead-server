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
  freeDocumentId: null,
  freeDocumentAt: null,
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
  const claims: string[] = [];
  const service = new SchoolAccessService(
    { planFor: async () => plan } as never,
    {
      findById: async () => ({ id: 'ur', passFreeUntil: freeUntil }),
    } as never,
    {
      findByUser: async () => row,
      claimFreeDocument: async (
        _user: string,
        _school: string,
        documentId: string,
      ) => {
        claims.push(documentId);
        return documentId;
      },
    } as never,
    { now: () => NOW },
  );
  return { service, claims };
}

describe('who may read a school document, in order', () => {
  it('Pro first, whatever the pass says', async () => {
    const { service } = build({
      plan: 'pro',
      row: pass({ status: 'expired', freeDocumentId: 'd-old' }),
    });
    expect((await service.standing('student', 'ur')).access).toBe('pro');
    await expect(service.verdict('student', 'ur', 'd2', true)).resolves.toBe(
      'pro',
    );
  });

  it('then the school being free until a date, and not past it', async () => {
    const soon = new Date(NOW.getTime() + DAY).toISOString();
    const gone = new Date(NOW.getTime() - DAY).toISOString();
    expect(
      (await build({ freeUntil: soon }).service.standing('s', 'ur')).access,
    ).toBe('school_free');
    expect(
      (await build({ freeUntil: gone }).service.standing('s', 'ur')).access,
    ).toBe('first_document');
  });

  it('then a live pass, with a week of grace after a failed renewal', async () => {
    const live = build({ row: pass({ status: 'active' }) });
    expect((await live.service.standing('s', 'ur')).access).toBe('pass');
    const retrying = build({
      row: pass({
        status: 'past_due',
        currentPeriodEnd: new Date(NOW.getTime() - 3 * DAY),
        freeDocumentId: 'd1',
      }),
    });
    expect((await retrying.service.standing('s', 'ur')).access).toBe('pass');
    const lapsed = build({
      row: pass({
        status: 'past_due',
        currentPeriodEnd: new Date(NOW.getTime() - 10 * DAY),
        freeDocumentId: 'd1',
      }),
    });
    expect((await lapsed.service.standing('s', 'ur')).access).toBe('locked');
  });

  it('gives one document free, remembers it on the open, and locks the second', async () => {
    const fresh = build();
    await expect(fresh.service.verdict('s', 'ur', 'd1', true)).resolves.toBe(
      'first_document',
    );
    expect(fresh.claims).toEqual(['d1']);

    const taken = build({ row: pass({ freeDocumentId: 'd1' }) });
    await expect(taken.service.verdict('s', 'ur', 'd1', false)).resolves.toBe(
      'first_document',
    );
    await expect(taken.service.verdict('s', 'ur', 'd2', true)).resolves.toBe(
      'locked',
    );
    await expect(
      taken.service.assertMayRead('s', 'ur', 'd2', true),
    ).rejects.toBeInstanceOf(SchoolPassRequiredError);
    expect(taken.claims).toEqual([]);
    expect((await taken.service.standing('s', 'ur')).access).toBe('locked');
  });

  it('only looks, and claims nothing, when not opening the document', async () => {
    const fresh = build();
    await expect(fresh.service.verdict('s', 'ur', 'd1', false)).resolves.toBe(
      'first_document',
    );
    expect(fresh.claims).toEqual([]);
  });
});
