import type { User } from '../domain/entities/user';

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string | null;
  googleId: string | null;
  emailVerifiedAt: Date | null;
  verificationTokenHash: string | null;
  verificationTokenExpires: Date | null;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  findByVerificationTokenHash(hash: string): Promise<User | null>;
  findByResetTokenHash(hash: string): Promise<User | null>;
  emailExists(email: string): Promise<boolean>;
  create(input: CreateUserInput): Promise<User>;
  /** Persists the entity's mutable fields. */
  save(user: User): Promise<void>;
}
