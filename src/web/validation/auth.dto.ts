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

  /**
   * Long minimum, no composition rules — length is what actually resists
   * guessing, and character classes mostly push people toward `Password1!`.
   */
  @IsString()
  @Length(10, 200, { message: 'Passwords need at least 10 characters' })
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
  @Length(10, 200, { message: 'Passwords need at least 10 characters' })
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

/** The refresh token, presented in the body where cookies cannot go. */
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
