import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailPort } from '../../business/ports/email.port';
import {
  passwordResetEmail,
  verificationEmail,
  type RenderedEmail,
} from './email-templates';

/**
 * Real email, through Resend's HTTP API.
 *
 * Chosen behind EMAIL_DRIVER=resend; development stays on the log adapter
 * so QA signups never spend sends. Failures throw: the handlers already
 * catch, log and carry on, because a lost email must never lose a signup.
 */
@Injectable()
export class ResendEmailAdapter implements EmailPort {
  private readonly logger = new Logger('Email');

  constructor(private readonly config: ConfigService) {}

  async sendVerification(input: {
    to: string;
    name: string;
    url: string;
  }): Promise<void> {
    await this.deliver(input.to, verificationEmail(input));
  }

  async sendPasswordReset(input: {
    to: string;
    name: string;
    url: string;
  }): Promise<void> {
    await this.deliver(input.to, passwordResetEmail(input));
  }

  private from(): string {
    const configured = this.config.get<string>(
      'EMAIL_FROM',
      'onboarding@resend.dev',
    );
    // A bare address gets the product's name in front of it.
    return configured.includes('<') ? configured : `EasyRead <${configured}>`;
  }

  private async deliver(to: string, email: RenderedEmail): Promise<void> {
    const key = this.config.getOrThrow<string>('RESEND_API_KEY');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from(),
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Resend refused (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    const { id } = (await response.json()) as { id?: string };
    this.logger.log(`Sent "${email.subject}" to ${to} (${id ?? 'no id'})`);
  }
}
