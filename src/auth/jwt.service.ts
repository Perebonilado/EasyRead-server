import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../business/domain/errors/errors';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  /** Rejects tokens minted before a password reset or account deletion. */
  ver: number;
}

@Injectable()
export class JwtService {
  constructor(private readonly config: ConfigService) {}

  signAccessToken(claims: AccessTokenClaims): {
    token: string;
    expiresIn: number;
  } {
    const ttl = this.config.get<string>('ACCESS_TOKEN_TTL', '15m');
    const token = jwt.sign(
      claims,
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      {
        expiresIn: ttl as jwt.SignOptions['expiresIn'],
      },
    );
    const decoded = jwt.decode(token) as { exp: number; iat: number };
    return { token, expiresIn: decoded.exp - decoded.iat };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      return jwt.verify(
        token,
        this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      ) as AccessTokenClaims;
    } catch {
      throw new UnauthorizedError('Your session has expired');
    }
  }

  refreshTtlDays(): number {
    return Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS', '30'));
  }
}
