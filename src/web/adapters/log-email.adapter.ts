import { Injectable, Logger } from '@nestjs/common';
import type { EmailPort } from '../../business/ports/email.port';

/**
 * Development email: prints the link instead of sending it, so the whole
 * verification and reset flow is exercisable without an email provider.
 */
@Injectable()
export class LogEmailAdapter implements EmailPort {
  private readonly logger = new Logger('Email');

  async sendVerification({
    to,
    url,
  }: {
    to: string;
    name: string;
    url: string;
  }): Promise<void> {
    this.logger.log(`[verify] ${to} -> ${url}`);
  }

  async sendPasswordReset({
    to,
    url,
  }: {
    to: string;
    name: string;
    url: string;
  }): Promise<void> {
    this.logger.log(`[reset] ${to} -> ${url}`);
  }
}
