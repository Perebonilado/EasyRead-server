import { createHash } from 'crypto';
import type { SubscriptionStatus } from '../../contracts';
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

/** Whether an email is on one of the school's domains; a school with no domains takes any address. */
export function emailOnDomains(
  school: { emailDomains: string[] },
  email: string,
): boolean {
  if (!school.emailDomains.length) return true;
  const domain = emailDomainOf(email);
  return school.emailDomains.some(
    (allowed) => allowed.toLowerCase() === domain,
  );
}

/** The rules a join code lives by: six digits, ten minutes, five tries, a minute between sends. */
export const JOIN_CODE = {
  length: 6,
  ttlMs: 10 * 60_000,
  attempts: 5,
  resendMs: 60_000,
};

/** A six-digit code, zero-padded, from the random source given. */
export function mintJoinCode(random: () => number = Math.random): string {
  const limit = 10 ** JOIN_CODE.length;
  const value = Math.min(limit - 1, Math.floor(random() * limit));
  return String(value).padStart(JOIN_CODE.length, '0');
}

/** The code as stored: never the digits, and tied to the person it was sent for. */
export function hashJoinCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code.trim()}`).digest('hex');
}

export type JoinCodeVerdict =
  'ok' | 'missing' | 'expired' | 'exhausted' | 'wrong';

/** What a code entered against the stored one comes to, by the rules above. */
export function joinCodeVerdict(
  stored: {
    userId: string;
    codeHash: string;
    expiresAt: Date;
    attempts: number;
    consumedAt: Date | null;
  } | null,
  entered: string,
  now: Date,
): JoinCodeVerdict {
  if (!stored || stored.consumedAt) return 'missing';
  if (now.getTime() > stored.expiresAt.getTime()) return 'expired';
  if (stored.attempts >= JOIN_CODE.attempts) return 'exhausted';
  return hashJoinCode(stored.userId, entered) === stored.codeHash
    ? 'ok'
    : 'wrong';
}

/** A department and, when set, a level: what a member's catalogue is filtered to. */
export interface CatalogueScope {
  departmentId: string;
  levelId: string | null;
}

/**
 * What a member's catalogue is filtered to. A request names a department
 * and maybe a level; a member with nothing requested gets their own
 * department and level; a member with no department yet gets the whole
 * school, which is null here. A file with no level belongs to every level,
 * which the query honours.
 */
export function catalogueScope(
  member: {
    departmentId: string | null;
    levelId: string | null;
    role: 'student' | 'staff' | 'admin';
  },
  requested: { departmentId?: string | null; levelId?: string | null } = {},
): CatalogueScope | null {
  if (requested.departmentId) {
    return {
      departmentId: requested.departmentId,
      levelId: requested.levelId ?? null,
    };
  }
  if (member.departmentId) {
    return { departmentId: member.departmentId, levelId: member.levelId };
  }
  return null;
}

/** How long a pass keeps reading after a renewal fails, while the gateway retries the card. */
export const PASS_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** A pass that still reads: paid up, or a failed renewal inside its grace. */
export function passIsLive(
  pass: {
    status: SubscriptionStatus | null;
    currentPeriodEnd: Date | null;
  } | null,
  now: Date,
): boolean {
  if (!pass?.status) return false;
  if (pass.status === 'active' || pass.status === 'trialing') return true;
  if (pass.status === 'past_due') {
    return (
      !pass.currentPeriodEnd ||
      now.getTime() < pass.currentPeriodEnd.getTime() + PASS_GRACE_MS
    );
  }
  return false;
}
