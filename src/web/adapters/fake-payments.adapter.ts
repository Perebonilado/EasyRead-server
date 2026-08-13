import { createHmac, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CheckoutSession,
  GatewaySubscription,
  PaymentsPort,
} from '../../business/ports/payments.port';

/**
 * Local billing. Checkout returns a URL back into the frontend's return handler
 * so the post-payment states ("finalising your subscription…", success) can be
 * exercised without Paystack. Signature verification still runs the real HMAC
 * so the webhook path isn't accidentally left unguarded when the real adapter
 * is switched on.
 */
@Injectable()
export class FakePaymentsAdapter implements PaymentsPort {
  private readonly logger = new Logger('Payments');

  constructor(private readonly config: ConfigService) {}

  async initializeCheckout({
    email,
    planCode,
    callbackUrl,
  }: {
    email: string;
    planCode: string;
    callbackUrl: string;
  }): Promise<CheckoutSession> {
    const reference = `fake_${randomUUID()}`;
    this.logger.log(`[checkout] ${email} -> ${planCode} (${reference})`);
    return {
      reference,
      authorizationUrl: `${callbackUrl}?status=success&reference=${reference}&simulated=1`,
    };
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string | undefined,
  ): boolean {
    const secret = this.config.get<string>('PAYSTACK_WEBHOOK_SECRET');
    if (!secret) return true; // unset locally; the real adapter requires it
    if (!signature) return false;
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    return expected === signature;
  }

  async fetchSubscription(
    subscriptionCode: string,
  ): Promise<GatewaySubscription | null> {
    return {
      subscriptionCode,
      customerCode: 'fake_customer',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  async disableSubscription(subscriptionCode: string): Promise<void> {
    this.logger.log(`[cancel] ${subscriptionCode}`);
  }
}
