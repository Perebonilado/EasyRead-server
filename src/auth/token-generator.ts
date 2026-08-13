import { randomBytes, createHash } from 'crypto';
import { Injectable } from '@nestjs/common';

/**
 * One-time tokens for email verification, password reset and refresh.
 *
 * The plaintext goes to the user; only the hash is stored. A database leak
 * therefore doesn't hand over working links (§10).
 */
@Injectable()
export class TokenGenerator {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
