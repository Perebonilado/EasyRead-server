import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(320)
  email!: string;

  /** No length or composition rules; only empty is refused. */
  @IsString()
  @Length(1, 200, { message: 'Create a password' })
  password!: string;

  @IsString()
  @Length(1, 255, { message: 'Tell us what to call you' })
  name!: string;
}

export class LoginDto {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'That does not look like an email address' })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'That does not look like an email address' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @Length(1, 200, { message: 'Create a new password' })
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

/** Asking for a fresh confirmation link, by address. */
export class ResendVerificationDto {
  @Transform(normaliseEmail)
  @IsEmail()
  email!: string;
}

/** The ID token the Sign in with Google button hands the browser. */
export class GoogleAuthDto {
  @IsString()
  @MinLength(1)
  credential!: string;
}

/** The refresh token, presented in the body where cookies cannot go. */
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
