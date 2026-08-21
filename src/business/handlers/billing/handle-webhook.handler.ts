import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, PAYMENTS } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { PaymentsPort } from '../../ports/payments.port';
import {
  SUBSCRIPTION_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from '../../repositories/tokens';
import type {
  SubscriptionRepository,
  WebhookEventRepository,
} from '../../repositories/billing.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface HandleWebhookRequest {
  rawBody: Buffer;
  signature: string | undefined;
}

/** What the controller turns into a status code. */
export interface WebhookOutcome {
  accepted: boolean;
  reason?: string;
}

/**
 * The gateway telling us what it did, and the only thing that grants Pro.
 *
 * Checkout completing in the browser is not evidence of payment; a signed
 * webhook is. So nothing here trusts the client, and the row is written
 * from the gateway's own view of the subscription.
 *
 * Three properties matter, in this order:
 *  - verified: an unsigned or stale body is refused by the adapter.
 *  - idempotent: providers redeliver, so every event is claimed once by id.
 *  - self-healing: the whole subscription state is rewritten from each
 *    event rather than patched, so a missed delivery is corrected by the
 *    next one instead of leaving the row permanently skewed.
 */
@Injectable()
export class HandleWebhookHandler extends AbstractRequestHandlerTemplate<
  HandleWebhookRequest,
  WebhookOutcome
> {
  constructor(
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(WEBHOOK_EVENT_REPOSITORY)
    private readonly events: WebhookEventRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: HandleWebhookRequest,
  ): Promise<CommandResponse<WebhookOutcome>> {
    const event = this.payments.verifyAndParseWebhook(
      cmd.rawBody,
      cmd.signature,
    );
    if (!event) {
      return CommandResponse.of({ accepted: false, reason: 'bad_signature' });
    }

    const provider = this.payments.provider;
    const fresh = await this.events.claim(
      provider,
      event.id,
      event.type,
      event.subscription ?? null,
    );
    // A redelivery of something already applied. Answering ok stops the
    // gateway retrying forever.
    if (!fresh) return CommandResponse.of({ accepted: true, reason: 'replay' });

    if (event.subscription) {
      const userId = await this.resolveUserId(event.userId, event.subscription);
      if (!userId) {
        this.logger.warn(
          `${provider} event ${event.id} (${event.type}) names no known user`,
        );
        await this.events.markProcessed(provider, event.id, this.clock.now());
        return CommandResponse.of({ accepted: true, reason: 'no_user' });
      }

      await this.subscriptions.upsert({
        userId,
        provider,
        planCode: event.subscription.planCode,
        interval: event.subscription.interval,
        providerSubscriptionId: event.subscription.providerSubscriptionId,
        providerCustomerId: event.subscription.providerCustomerId,
        status: event.subscription.status,
        currentPeriodEnd: event.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: event.subscription.cancelAtPeriodEnd,
        raw: event.subscription,
      });

      this.logger.log(
        `${event.type}: ${userId} -> ${event.subscription.planCode}/${event.subscription.status}`,
      );
    }

    await this.events.markProcessed(provider, event.id, this.clock.now());
    return CommandResponse.of({ accepted: true });
  }

  /**
   * The user id travels in the gateway's custom data on checkout, but a
   * later event (a renewal months on, say) may not carry it. Falling back
   * to the subscription id keeps those attributable.
   */
  private async resolveUserId(
    fromEvent: string | null,
    subscription: { providerSubscriptionId: string },
  ): Promise<string | null> {
    if (fromEvent) return fromEvent;
    const known = await this.subscriptions.findByProviderSubscriptionId(
      subscription.providerSubscriptionId,
    );
    return known?.userId ?? null;
  }
}
