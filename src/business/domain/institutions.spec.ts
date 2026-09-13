import {
  JOIN_CODE,
  catalogueScope,
  emailOnDomains,
  hashJoinCode,
  isValidSlug,
  joinCodeVerdict,
  mintInviteCode,
  mintJoinCode,
  slugify,
} from './institutions';

describe('a school address', () => {
  it('is lower case letters, digits and hyphens, and never one of our own routes', () => {
    expect(isValidSlug('university-of-rwanda')).toBe(true);
    expect(isValidSlug('ur')).toBe(true);
    expect(isValidSlug('library')).toBe(false);
    expect(isValidSlug('admin')).toBe(false);
    expect(isValidSlug('University')).toBe(false);
    expect(isValidSlug('-ur')).toBe(false);
    expect(isValidSlug('a')).toBe(false);
  });

  it('is made from the name', () => {
    expect(slugify('University of Rwanda')).toBe('university-of-rwanda');
    expect(slugify('École Polytechnique  ')).toBe('ecole-polytechnique');
  });
});

describe('whose email a school takes', () => {
  it('any address when it has no domains, else only its own', () => {
    expect(emailOnDomains({ emailDomains: [] }, 'a@gmail.com')).toBe(true);
    expect(emailOnDomains({ emailDomains: ['ur.ac.rw'] }, 'a@UR.ac.rw')).toBe(
      true,
    );
    expect(emailOnDomains({ emailDomains: ['ur.ac.rw'] }, 'a@gmail.com')).toBe(
      false,
    );
  });

  it('mints an eight-character code without look-alikes', () => {
    const code = mintInviteCode(() => 0.999);
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[01IOL]/);
  });
});

describe('a join code', () => {
  const now = new Date('2026-09-13T10:00:00Z');
  const stored = (
    over: Partial<Parameters<typeof joinCodeVerdict>[0] & object> = {},
  ) => ({
    userId: 'u1',
    codeHash: hashJoinCode('u1', '004242'),
    expiresAt: new Date(now.getTime() + JOIN_CODE.ttlMs),
    attempts: 0,
    consumedAt: null,
    ...over,
  });

  it('is six digits, zero-padded, and never stored as digits', () => {
    expect(mintJoinCode(() => 0)).toBe('000000');
    expect(mintJoinCode(() => 0.999999)).toBe('999999');
    expect(mintJoinCode(() => 0.5)).toMatch(/^\d{6}$/);
    expect(hashJoinCode('u1', '004242')).not.toContain('4242');
    expect(hashJoinCode('u1', '004242')).not.toBe(hashJoinCode('u2', '004242'));
  });

  it('passes the right code once, and says why the rest fail', () => {
    expect(joinCodeVerdict(stored(), '004242', now)).toBe('ok');
    expect(joinCodeVerdict(stored(), ' 004242 ', now)).toBe('ok');
    expect(joinCodeVerdict(stored(), '004243', now)).toBe('wrong');
    expect(joinCodeVerdict(null, '004242', now)).toBe('missing');
    expect(joinCodeVerdict(stored({ consumedAt: now }), '004242', now)).toBe(
      'missing',
    );
    expect(
      joinCodeVerdict(
        stored(),
        '004242',
        new Date(now.getTime() + JOIN_CODE.ttlMs + 1),
      ),
    ).toBe('expired');
    expect(
      joinCodeVerdict(stored({ attempts: JOIN_CODE.attempts }), '004242', now),
    ).toBe('exhausted');
  });
});

describe("a member's catalogue", () => {
  const student = {
    departmentId: 'medicine',
    levelId: 'year-3',
    role: 'student' as const,
  };

  it('is their own department and level when nothing is asked for', () => {
    expect(catalogueScope(student)).toEqual({
      departmentId: 'medicine',
      levelId: 'year-3',
    });
    expect(catalogueScope({ ...student, levelId: null })).toEqual({
      departmentId: 'medicine',
      levelId: null,
    });
  });

  it('is what they ask for when they look elsewhere', () => {
    expect(
      catalogueScope(student, {
        departmentId: 'agriculture',
        levelId: 'year-4',
      }),
    ).toEqual({ departmentId: 'agriculture', levelId: 'year-4' });
    expect(catalogueScope(student, { departmentId: 'agriculture' })).toEqual({
      departmentId: 'agriculture',
      levelId: null,
    });
  });

  it('is the whole school for a member with no department yet, whatever their role', () => {
    expect(catalogueScope({ ...student, departmentId: null })).toBeNull();
    expect(
      catalogueScope({ ...student, role: 'admin', departmentId: null }),
    ).toBeNull();
    expect(catalogueScope({ ...student, role: 'staff' })).toEqual({
      departmentId: 'medicine',
      levelId: 'year-3',
    });
    expect(
      catalogueScope(
        { ...student, role: 'staff' },
        { departmentId: 'medicine' },
      ),
    ).toEqual({ departmentId: 'medicine', levelId: null });
  });
});
