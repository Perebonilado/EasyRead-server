import {
  admits,
  catalogueScope,
  isStudent,
  isValidSlug,
  mintInviteCode,
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

describe('who a school admits', () => {
  it('by email domain when it has domains, else by code, else anyone', () => {
    const domains = { inviteCode: null, emailDomains: ['ur.ac.rw'] };
    expect(admits(domains, { email: 'a@UR.ac.rw', code: null })).toBe(true);
    expect(admits(domains, { email: 'a@gmail.com', code: null })).toBe(false);
    const coded = { inviteCode: 'ABCD2345', emailDomains: [] };
    expect(admits(coded, { email: 'a@gmail.com', code: 'abcd2345' })).toBe(
      true,
    );
    expect(admits(coded, { email: 'a@gmail.com', code: 'nope' })).toBe(false);
    const both = { inviteCode: 'ABCD2345', emailDomains: ['ur.ac.rw'] };
    expect(admits(both, { email: 'a@ur.ac.rw', code: null })).toBe(true);
    expect(admits(both, { email: 'a@gmail.com', code: 'ABCD2345' })).toBe(true);
    expect(admits(both, { email: 'a@gmail.com', code: null })).toBe(false);
    expect(
      admits(
        { inviteCode: null, emailDomains: [] },
        { email: 'x@y.z', code: null },
      ),
    ).toBe(true);
  });

  it('mints an eight-character code without look-alikes', () => {
    const code = mintInviteCode(() => 0.999);
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[01IOL]/);
  });
});

describe("a student's catalogue", () => {
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

  it('is the whole school for a student with no department yet, and for staff and admins unless they ask', () => {
    expect(catalogueScope({ ...student, departmentId: null })).toBeNull();
    expect(catalogueScope({ ...student, role: 'staff' })).toBeNull();
    expect(catalogueScope({ ...student, role: 'admin' })).toBeNull();
    expect(
      catalogueScope(
        { ...student, role: 'staff' },
        { departmentId: 'medicine' },
      ),
    ).toEqual({ departmentId: 'medicine', levelId: null });
  });

  it('knows a student from the membership role alone', () => {
    expect(isStudent(student)).toBe(true);
    expect(isStudent({ role: 'staff' })).toBe(false);
    expect(isStudent(null)).toBe(false);
  });
});
