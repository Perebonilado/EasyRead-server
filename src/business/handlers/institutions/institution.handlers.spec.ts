/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for repositories and ports whose interfaces are Promise-shaped. */
import {
  JoinInstitutionHandler,
  LeaveInstitutionHandler,
  StartSchoolVerificationHandler,
} from './institution.handlers';
import { JOIN_CODE, hashJoinCode } from '../../domain/institutions';
import type { EmailPort } from '../../ports/email.port';
import type {
  InstitutionRepository,
  JoinCodeRecord,
  MembershipRecord,
} from '../../repositories/institution.repository';
import type { UserRepository } from '../../repositories/user.repository';
import type { InstitutionAdminDto } from '../../../contracts';

const NOW = new Date('2026-09-13T10:00:00Z');
const clock = { now: () => NOW };

const school = (
  verifyStudents: boolean,
  emailDomains: string[] = [],
): InstitutionAdminDto => ({
  id: 'school-1',
  name: 'university of rwanda',
  slug: 'ur',
  country: 'RW',
  levelWord: 'Year',
  needsInviteCode: false,
  emailDomains,
  verifyStudents,
  inviteCode: null,
  memberCount: 0,
  documentCount: 0,
});

function fakes(
  theSchool: InstitutionAdminDto,
  code: JoinCodeRecord | null = null,
) {
  const joined: unknown[] = [];
  const saved: JoinCodeRecord[] = [];
  const state = {
    code,
    attempts: 0,
    consumed: null as Date | null,
    left: [] as string[],
  };
  const institutions = {
    async findBySlug(slug: string) {
      return slug === theSchool.slug ? theSchool : null;
    },
    async findJoinCode() {
      return state.code
        ? {
            ...state.code,
            attempts: state.attempts,
            consumedAt: state.consumed,
          }
        : null;
    },
    async saveJoinCode(
      input: Omit<
        JoinCodeRecord,
        'id' | 'attempts' | 'consumedAt' | 'createdAt'
      >,
    ) {
      const record: JoinCodeRecord = {
        id: 'code-1',
        attempts: 0,
        consumedAt: null,
        createdAt: NOW,
        ...input,
      };
      saved.push(record);
      state.code = record;
      state.attempts = 0;
      state.consumed = null;
    },
    async countJoinAttempt() {
      state.attempts += 1;
    },
    async consumeJoinCode(_id: string, now: Date) {
      state.consumed = now;
    },
    async join(input: unknown) {
      joined.push(input);
    },
    async leave(userId: string) {
      state.left.push(userId);
    },
    async findDepartment() {
      return null;
    },
    async findLevel() {
      return null;
    },
  } as unknown as InstitutionRepository;
  const users = {
    async findById(id: string) {
      return { id, name: 'Aline Uwase', email: 'aline@gmail.com' };
    },
  } as unknown as UserRepository;
  const sent: { to: string; school: string; code: string }[] = [];
  const email = {
    async sendSchoolCode(input: {
      to: string;
      name: string;
      school: string;
      code: string;
    }) {
      sent.push({ to: input.to, school: input.school, code: input.code });
    },
  } as unknown as EmailPort;
  return { institutions, users, email, joined, saved, sent, state };
}

const liveCode = (over: Partial<JoinCodeRecord> = {}): JoinCodeRecord => ({
  id: 'code-1',
  userId: 'u1',
  institutionId: 'school-1',
  email: 'aline@ur.ac.rw',
  codeHash: hashJoinCode('u1', '004242'),
  expiresAt: new Date(NOW.getTime() + JOIN_CODE.ttlMs),
  attempts: 0,
  consumedAt: null,
  createdAt: new Date(NOW.getTime() - 5 * 60_000),
  ...over,
});

describe('joining a school that takes anyone', () => {
  it('joins on the pick alone and keeps no school email', async () => {
    const f = fakes(school(false));
    const handler = new JoinInstitutionHandler(f.institutions, f.users, clock);
    const result = await handler.handle({ userId: 'u1', slug: 'ur' });
    expect(result.data.institution.slug).toBe('ur');
    expect(result.data.schoolEmail).toBeNull();
    expect(f.joined).toEqual([
      {
        userId: 'u1',
        institutionId: 'school-1',
        departmentId: null,
        levelId: null,
        schoolEmail: null,
        verifiedAt: null,
      },
    ]);
  });
});

describe('joining a school that asks for a school email', () => {
  it('refuses the pick alone', async () => {
    const f = fakes(school(true));
    const handler = new JoinInstitutionHandler(f.institutions, f.users, clock);
    await expect(handler.handle({ userId: 'u1', slug: 'ur' })).rejects.toThrow(
      'school email',
    );
    expect(f.joined).toEqual([]);
  });

  it('joins with the right code, keeps the email, and spends the code', async () => {
    const f = fakes(school(true), liveCode());
    const handler = new JoinInstitutionHandler(f.institutions, f.users, clock);
    const result = await handler.handle({
      userId: 'u1',
      slug: 'ur',
      email: 'Aline@UR.ac.rw',
      code: '004242',
    });
    expect(result.data.schoolEmail).toBe('aline@ur.ac.rw');
    expect(f.joined[0]).toMatchObject({
      schoolEmail: 'aline@ur.ac.rw',
      verifiedAt: NOW,
    });
    expect(f.state.consumed).toEqual(NOW);
    // The same code a second time is spent.
    await expect(
      handler.handle({
        userId: 'u1',
        slug: 'ur',
        email: 'aline@ur.ac.rw',
        code: '004242',
      }),
    ).rejects.toThrow('Ask for a code first');
  });

  it('counts a wrong code, and refuses an exhausted or expired one by name', async () => {
    const f = fakes(school(true), liveCode());
    const handler = new JoinInstitutionHandler(f.institutions, f.users, clock);
    await expect(
      handler.handle({
        userId: 'u1',
        slug: 'ur',
        email: 'aline@ur.ac.rw',
        code: '000000',
      }),
    ).rejects.toThrow('not right');
    expect(f.state.attempts).toBe(1);
    f.state.attempts = JOIN_CODE.attempts;
    await expect(
      handler.handle({
        userId: 'u1',
        slug: 'ur',
        email: 'aline@ur.ac.rw',
        code: '004242',
      }),
    ).rejects.toThrow('Too many tries');
    const stale = fakes(
      school(true),
      liveCode({ expiresAt: new Date(NOW.getTime() - 1) }),
    );
    await expect(
      new JoinInstitutionHandler(stale.institutions, stale.users, clock).handle(
        { userId: 'u1', slug: 'ur', email: 'aline@ur.ac.rw', code: '004242' },
      ),
    ).rejects.toThrow('expired');
  });

  it('refuses a code sent to a different address', async () => {
    const f = fakes(school(true), liveCode());
    const handler = new JoinInstitutionHandler(f.institutions, f.users, clock);
    await expect(
      handler.handle({
        userId: 'u1',
        slug: 'ur',
        email: 'someone@ur.ac.rw',
        code: '004242',
      }),
    ).rejects.toThrow('not right for this email');
    expect(f.joined).toEqual([]);
  });
});

describe('asking for a code', () => {
  it('sends six digits to a school address, stores only their hash, and refuses another for a minute', async () => {
    const f = fakes(school(true, ['ur.ac.rw']));
    const handler = new StartSchoolVerificationHandler(
      f.institutions,
      f.users,
      f.email,
      clock,
    );
    const result = await handler.handle({
      userId: 'u1',
      slug: 'ur',
      email: 'Aline@UR.ac.rw',
    });
    expect(result.data).toEqual({
      ok: true,
      resendAfterMs: JOIN_CODE.resendMs,
    });
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].to).toBe('aline@ur.ac.rw');
    expect(f.sent[0].code).toMatch(/^\d{6}$/);
    expect(f.saved[0].codeHash).toBe(hashJoinCode('u1', f.sent[0].code));
    expect(f.saved[0].expiresAt).toEqual(
      new Date(NOW.getTime() + JOIN_CODE.ttlMs),
    );
    await expect(
      handler.handle({ userId: 'u1', slug: 'ur', email: 'aline@ur.ac.rw' }),
    ).rejects.toThrow('a minute');
    expect(f.sent).toHaveLength(1);
  });

  it('refuses an address off the school domains, and a school that does not ask', async () => {
    const strict = fakes(school(true, ['ur.ac.rw']));
    await expect(
      new StartSchoolVerificationHandler(
        strict.institutions,
        strict.users,
        strict.email,
        clock,
      ).handle({ userId: 'u1', slug: 'ur', email: 'aline@gmail.com' }),
    ).rejects.toThrow('school email');
    expect(strict.sent).toEqual([]);
    const open = fakes(school(false));
    await expect(
      new StartSchoolVerificationHandler(
        open.institutions,
        open.users,
        open.email,
        clock,
      ).handle({ userId: 'u1', slug: 'ur', email: 'aline@gmail.com' }),
    ).rejects.toThrow('does not ask');
  });
});

describe('leaving a school', () => {
  it('removes the membership and nothing else', async () => {
    const f = fakes(school(false));
    const result = await new LeaveInstitutionHandler(f.institutions).handle({
      userId: 'u1',
    });
    expect(result.data).toEqual({ ok: true });
    expect(f.state.left).toEqual(['u1']);
  });
});

// A MembershipRecord shape is referenced so the fake stays honest if it grows.
const _shape: MembershipRecord | null = null;
void _shape;
