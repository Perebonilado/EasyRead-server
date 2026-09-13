/* eslint-disable @typescript-eslint/require-await -- in-memory fakes stand in
   for models whose interface is Promise-shaped. */
import { NotFoundException } from '@nestjs/common';
import { ContinueStudyingQuery } from './continue-studying.query';
import type { RecentScope } from './document-list.query';

/** The resume card asks for the person's own reading, or their school's. */
function build(members: string[]) {
  const scopes: RecentScope[] = [];
  const query = new ContinueStudyingQuery(
    { findOne: async () => null } as never,
    { findAll: async () => [] } as never,
    {
      findOne: async (options: { where: { slug: string } }) =>
        options.where.slug === 'ur' ? { id: 'school-ur', slug: 'ur' } : null,
    } as never,
    {
      findOne: async (options: { where: { userId: string } }) =>
        members.includes(options.where.userId)
          ? { userId: options.where.userId }
          : null,
    } as never,
    {
      recentlyRead: async (
        _userId: string,
        _take: number,
        scope: RecentScope,
      ) => {
        scopes.push(scope);
        return [];
      },
    } as never,
    {} as never,
  );
  return { query, scopes };
}

describe('pick up where you left off', () => {
  it("looks at a person's own documents on their own dashboard", async () => {
    const { query, scopes } = build(['student']);
    await expect(query.execute('student')).resolves.toBeNull();
    expect(scopes).toEqual([{ kind: 'own' }]);
  });

  it("looks at the school's documents on the school dashboard", async () => {
    const { query, scopes } = build(['student']);
    await expect(query.forSchool('UR', 'student')).resolves.toBeNull();
    expect(scopes).toEqual([{ kind: 'school', institutionId: 'school-ur' }]);
  });

  it('shows a non-member, and a wrong address, the same missing school', async () => {
    const { query, scopes } = build(['student']);
    await expect(query.forSchool('ur', 'stranger')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(query.forSchool('nowhere', 'student')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(scopes).toEqual([]);
  });
});
