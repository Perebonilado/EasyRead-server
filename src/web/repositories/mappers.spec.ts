import { toUser } from './mappers';

/**
 * Sequelize hands back a row it has just created with the columns nobody
 * set left undefined rather than null. The account's deleted check is a
 * strict null test, so a brand-new account read that way looked deleted
 * and its first Google sign-in was refused.
 */
const row = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'u1',
    email: 'amina@ur.ac.rw',
    passwordHash: null,
    googleId: 'google-1',
    name: 'Amina',
    emailVerifiedAt: new Date('2026-09-13T10:00:00Z'),
    verificationTokenHash: null,
    verificationTokenExpires: null,
    resetTokenHash: null,
    resetTokenExpires: null,
    tokenVersion: 0,
    role: 'learner',
    get: () => new Date('2026-09-13T10:00:00Z'),
    ...overrides,
  }) as never;

describe('an account read from its row', () => {
  it('can log in the moment it is created, before deletedAt was ever set', () => {
    const user = toUser(row({ deletedAt: undefined }));
    expect(user.props.deletedAt).toBeNull();
    expect(user.isDeleted).toBe(false);
    expect(user.canLogin()).toBe(true);
  });

  it('is deleted once the row says so', () => {
    const user = toUser(row({ deletedAt: new Date('2026-09-12T10:00:00Z') }));
    expect(user.isDeleted).toBe(true);
    expect(user.canLogin()).toBe(false);
  });
});
