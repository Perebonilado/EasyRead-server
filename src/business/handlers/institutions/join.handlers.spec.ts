/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for repositories whose interface is Promise-shaped. */
import { JoinInstitutionHandler } from './institution.handlers';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import type { UserRepository } from '../../repositories/user.repository';

const SCHOOL = {
  id: 'ur',
  name: 'university of rwanda',
  slug: 'ur',
  country: 'Rwanda',
  levelWord: 'Year',
  needsInviteCode: false,
  emailDomains: [],
  verifyStudents: false,
  inviteCode: null,
  memberCount: 0,
  documentCount: 0,
};
const OTHER = { ...SCHOOL, id: 'kist', name: 'kist', slug: 'kist' };

function build(
  existing: {
    institutionId: string;
    departmentId: string | null;
    levelId: string | null;
  } | null,
) {
  const joins: unknown[] = [];
  const institutions = {
    async findBySlug(slug: string) {
      return [SCHOOL, OTHER].find((school) => school.slug === slug) ?? null;
    },
    async findMembership() {
      return existing
        ? {
            userId: 'u1',
            role: 'student' as const,
            schoolEmail: 'me@ur.ac.rw',
            verifiedAt: null,
            ...existing,
          }
        : null;
    },
    async join(input: unknown) {
      joins.push(input);
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
      return { id, props: { id } };
    },
  } as unknown as UserRepository;
  const clock = { now: () => new Date('2026-09-13') };
  const handler = new JoinInstitutionHandler(institutions, users, clock);
  return { handler, joins };
}

describe('joining a school', () => {
  it('keeps the row, place and school email when it is the school you are already in', async () => {
    const { handler, joins } = build({
      institutionId: 'ur',
      departmentId: 'medicine',
      levelId: 'year-4',
    });
    const { data } = await handler.handle({ userId: 'u1', slug: 'ur' });
    expect(joins).toEqual([]);
    expect(data.departmentId).toBe('medicine');
    expect(data.levelId).toBe('year-4');
    expect(data.schoolEmail).toBe('me@ur.ac.rw');
    expect(data.institution.slug).toBe('ur');
  });

  it('writes a fresh membership with no place when it is another school', async () => {
    const { handler, joins } = build({
      institutionId: 'ur',
      departmentId: 'medicine',
      levelId: 'year-4',
    });
    const { data } = await handler.handle({ userId: 'u1', slug: 'kist' });
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({
      userId: 'u1',
      institutionId: 'kist',
      departmentId: null,
      levelId: null,
      schoolEmail: null,
    });
    expect(data.institution.slug).toBe('kist');
    expect(data.departmentId).toBeNull();
    expect(data.role).toBe('student');
  });

  it('joins as before when there was no membership', async () => {
    const { handler, joins } = build(null);
    await handler.handle({ userId: 'u1', slug: 'ur' });
    expect(joins).toHaveLength(1);
  });
});
