/* eslint-disable @typescript-eslint/require-await -- an in-memory fake stands in
   for a repository whose interface is Promise-shaped. */
import type { ExecutionContext } from '@nestjs/common';
import { OwnFilesGuard, SCHOOL_ADDS_FILES } from './own-files.guard';
import type {
  InstitutionRepository,
  MembershipRecord,
} from '../../business/repositories/institution.repository';

const contextFor = (user: { id: string; role: 'learner' | 'admin' } | null) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: user ?? undefined }) }),
  }) as unknown as ExecutionContext;

const guardWith = (memberships: Record<string, MembershipRecord>) =>
  new OwnFilesGuard({
    async findMembership(userId: string) {
      return memberships[userId] ?? null;
    },
  } as unknown as InstitutionRepository);

const member = (
  userId: string,
  role: MembershipRecord['role'],
): MembershipRecord => ({
  userId,
  institutionId: 'school',
  departmentId: 'medicine',
  levelId: 'year-3',
  role,
});

describe('the gate on making a file of your own', () => {
  it('refuses a student with the line that says the school adds their files', async () => {
    const guard = guardWith({ s1: member('s1', 'student') });
    await expect(
      guard.canActivate(contextFor({ id: 's1', role: 'learner' })),
    ).rejects.toThrow(SCHOOL_ADDS_FILES);
  });

  it('lets a regular user, a staff member and an admin through', async () => {
    const guard = guardWith({
      t1: member('t1', 'staff'),
      a1: member('a1', 'admin'),
    });
    expect(
      await guard.canActivate(contextFor({ id: 'r1', role: 'learner' })),
    ).toBe(true);
    expect(
      await guard.canActivate(contextFor({ id: 't1', role: 'learner' })),
    ).toBe(true);
    expect(
      await guard.canActivate(contextFor({ id: 'a1', role: 'admin' })),
    ).toBe(true);
  });

  it('leaves a missing user to the bearer gate', async () => {
    expect(await guardWith({}).canActivate(contextFor(null))).toBe(true);
  });
});
