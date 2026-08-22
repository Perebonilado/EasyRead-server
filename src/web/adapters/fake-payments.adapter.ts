import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { BillingInterval } from '../../contracts';
import type {
  CheckoutIntent,
  GatewaySubscription,
  GatewayWebhookEvent,
  PaymentsPort,
} from '../../business/ports/payments.port';

/**
 * Local billing, bound whenever Paddle is not configured.
 *
 * Checkout returns a redirect back into the frontend's own return handler so
 * the post-payment states can be exercised without a gateway. Webhooks are
 * refused outright rather than waved through: a fake that accepted unsigned
 * bodies would be a hole waiting to be promoted to production by accident.
 */
@Injectable()
export class FakePaymentsAdapter implements PaymentsPort {
  readonly provider = 'fake';
  private readonly logger = new Logger('Payments');

  createCheckout(input: {
    userId: string;
    email: string;
    interval: BillingInterval;
  }): Promise<CheckoutIntent> {
    const reference = `fake_${randomUUID()}`;
    this.logger.log(
      `[checkout] ${input.email} -> pro/${input.interval} (${reference})`,
    );
    return Promise.resolve({
      kind: 'redirect',
      url: `/billing?status=simulated&reference=${reference}`,
    });
  }

  createCreditCheckout(input: {
    userId: string;
    email: string;
    bundle: string;
  }): Promise<CheckoutIntent> {
    this.logger.log(`[credits] ${input.email} -> ${input.bundle}`);
    return Promise.resolve({
      kind: 'redirect',
      url: `/billing?status=simulated&credits=${input.bundle}`,
    });
  }

  verifyAndParseWebhook(): GatewayWebhookEvent | null {
    this.logger.warn('Webhook received with no payment gateway configured');
    return null;
  }

  fetchSubscription(): Promise<GatewaySubscription | null> {
    return Promise.resolve(null);
  }

  fetchCustomerEmail(): Promise<string | null> {
    return Promise.resolve(null);
  }

  cancelSubscription(id: string): Promise<void> {
    this.logger.log(`[cancel] ${id}`);
    return Promise.resolve();
  }

  changeInterval(
    id: string,
    interval: BillingInterval,
  ): Promise<GatewaySubscription | null> {
    this.logger.log(`[interval] ${id} -> ${interval}`);
    return Promise.resolve(null);
  }

  resumeSubscription(id: string): Promise<GatewaySubscription | null> {
    this.logger.log(`[resume] ${id}`);
    return Promise.resolve(null);
  }

  createPortalSession(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
