import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/** bcrypt cost 12, per the technical design's §3.1 requirement. */
const ROUNDS = 12;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Burns roughly the same time as a real comparison. Without this, "no such
   * user" returns measurably faster than "wrong password" and the login
   * endpoint becomes an email-enumeration oracle.
   */
  async fakeCompare(): Promise<void> {
    await bcrypt.compare(
      'dummy',
      '$2b$12$1234567890123456789012345678901234567890123456789012',
    );
  }
}
