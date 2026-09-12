/**
 * The rules of a school's front door, kept pure so they can be tested
 * without a database: what a slug may be, who a school admits, and the
 * code it hands out.
 */

/** Words a school's address may not be: they are the app's own routes. */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'billing',
  'groups',
  'library',
  'login',
  'notes',
  'pricing',
  'privacy',
  'read',
  'refunds',
  'register',
  'reset',
  'review',
  'settings',
  'terms',
  'verify',
  'v2',
  'v3',
  'about',
  'help',
  'support',
  'static',
  '_next',
]);

/** Two to eighty characters, starting and ending on a letter or digit. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** "University of Rwanda" becomes "university-of-rwanda". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** An eight-character code without the letters and digits that read alike. */
export function mintInviteCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[Math.floor(random() * alphabet.length)];
  }
  return code;
}

export function emailDomainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

/**
 * Whether a school lets this person in: by its code, by their email's
 * domain, or freely when it asks for neither.
 */
export function admits(
  school: { inviteCode: string | null; emailDomains: string[] },
  who: { email: string; code: string | null },
): boolean {
  if (school.emailDomains.length) {
    const domain = emailDomainOf(who.email);
    if (
      school.emailDomains.some((allowed) => allowed.toLowerCase() === domain)
    ) {
      return true;
    }
  }
  if (school.inviteCode) {
    return (
      who.code !== null &&
      who.code.trim().toUpperCase() === school.inviteCode.toUpperCase()
    );
  }
  return school.emailDomains.length === 0;
}
