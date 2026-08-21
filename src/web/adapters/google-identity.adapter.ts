import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { InvalidTokenError } from '../../business/domain/errors/errors';
import type {
  GoogleIdentityPort,
  GoogleProfile,
} from '../../business/ports/google-identity.port';

/**
 * Real verification through Google's official library: signature against
 * Google's rotating keys, issuer, expiry, and — crucially — that the token
 * was minted for THIS app's client id, so a token issued to some other
 * site can never sign in here.
 */
@Injectable()
export class GoogleIdentityAdapter implements GoogleIdentityPort {
  private readonly logger = new Logger('GoogleIdentity');
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(config: ConfigService) {
    this.clientId = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    this.client = new OAuth2Client(this.clientId);
  }

  async verify(credential: string): Promise<GoogleProfile> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.warn(
        `Rejected Google credential: ${(error as Error).message}`,
      );
      throw new InvalidTokenError('Google could not confirm this sign-in');
    }

    if (!payload?.sub || !payload.email) {
      throw new InvalidTokenError('Google could not confirm this sign-in');
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name?.trim() || payload.email.split('@')[0],
    };
  }
}

/** Bound when GOOGLE_CLIENT_ID is absent, so the route fails honestly. */
@Injectable()
export class NullGoogleIdentityAdapter implements GoogleIdentityPort {
  verify(): Promise<GoogleProfile> {
    return Promise.reject(
      new InvalidTokenError('Google sign-in is not configured'),
    );
  }
}
