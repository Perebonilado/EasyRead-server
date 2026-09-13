import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, PAYMENTS } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type {
  GatewayWebhookEvent,
  PaymentsPort,
} from '../../ports/payments.port';
import {
  SCHOOL_PASS_REPOSITORY,
  SUBSCRIPTION_REPOSITORY,
  USER_REPOSITORY,
  VOICE_CREDITS_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from '../../repositories/tokens';
import type {
  SchoolPassRepository,
  SubscriptionRepository,
  VoiceCreditsRepository,
  WebhookEventRepository,
} from '../../repositories/billing.repository';
import { passIsLive } from '../../domain/institutions';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface HandleWebhookRequest {
  rawBody: Buffer;
  /** The delivery's headers, lowercased: gateways sign in different ones. */
  headers: Record<string, string | undefined>;
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
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VOICE_CREDITS_REPOSITORY)
    private readonly credits: VoiceCreditsRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(SCHOOL_PASS_REPOSITORY)
    private readonly passes: SchoolPassRepository,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: HandleWebhookRequest,
  ): Promise<CommandResponse<WebhookOutcome>> {
    const events = await this.payments.verifyAndParseWebhook(
      cmd.rawBody,
      cmd.headers,
    );
    if (!events) {
      // Loud on purpose: the gateway sees a 200 either way, so this line is
      // the only trace that a secret mismatch is silently dropping events.
      this.logger.warn(
        'Webhook refused: signature did not verify. STRIPE_WEBHOOK_SECRET must be the signing secret of the endpoint that sent this request — each endpoint has its own, and the one `stripe listen` prints is different from the one the dashboard shows.',
      );
      return CommandResponse.of({ accepted: false, reason: 'bad_signature' });
    }

    // Some gateways batch several events into one delivery; each is claimed
    // and applied on its own, so a redelivered batch skips exactly the
    // events that already landed.
    for (const event of events) {
      await this.applyEvent(event);
    }
    return CommandResponse.of({
      accepted: true,
      reason: events.length === 0 ? 'empty' : undefined,
    });
  }

  private async applyEvent(event: GatewayWebhookEvent): Promise<void> {
    this.logger.log(`Webhook ${event.type} (${event.id}) verified`);

    const provider = this.payments.provider;
    // The payload column refuses null, and payment events carry no
    // subscription; the type alone still leaves a usable audit trail.
    const fresh = await this.events.claim(
      provider,
      event.id,
      event.type,
      event.subscription ?? { type: event.type },
    );
    // A redelivery of something already applied. Skipping quietly is what
    // stops the gateway retrying forever.
    if (!fresh) return;

    // A school pass is its own row, never the Pro subscription.
    if (event.subscription?.product === 'school') {
      await this.applySchoolPass(event, event.subscription);
      await this.events.markProcessed(provider, event.id, this.clock.now());
      return;
    }

    if (event.subscription) {
      const userId = await this.resolveUserId(event.userId, event.subscription);
      if (!userId) {
        this.logger.warn(
          `${provider} event ${event.id} (${event.type}) names no known user`,
        );
        await this.events.markProcessed(provider, event.id, this.clock.now());
        return;
      }

      const written = await this.subscriptions.upsert({
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
        lastEventAt: event.occurredAt,
      });

      this.logger.log(
        written
          ? `${event.type}: ${userId} -> ${event.subscription.planCode}/${event.subscription.status}`
          : `${event.type}: ignored, older than the state already applied for ${userId}`,
      );
      // Pro includes the school: a pass that still renews stops at its
      // period end, so nobody is charged for both.
      if (
        written &&
        (event.subscription.status === 'active' ||
          event.subscription.status === 'trialing')
      ) {
        await this.stopPassRenewing(userId);
      }
    }

    // A completed credit purchase tops the wallet up. Idempotent for the
    // same reason everything here is: the event id was claimed above. The
    // existence check keeps another environment's test purchases from
    // crashing into this database's foreign keys.
    if (
      event.creditSeconds &&
      event.userId &&
      (await this.users.findById(event.userId))
    ) {
      await this.credits.add(event.userId, event.creditSeconds);
      this.logger.log(
        `${event.type}: credited ${event.creditSeconds}s of voice to ${event.userId}`,
      );
    }

    await this.events.markProcessed(provider, event.id, this.clock.now());
  }

  /**
   * Whose subscription is this? Three threads, pulled in order of trust:
   * the user id we stamped into the gateway's custom data at checkout; the
   * subscription id, for renewals of a subscription we already know; and
   * finally the gateway customer's email matched against our accounts, so
   * a payment can still land even if custom data never propagated.
   *
   * Every thread ends in an existence check. A sandbox gateway account is
   * shared between environments, so events made by a dev machine reach the
   * deployed webhook carrying user ids from a different database; writing
   * those blind is a foreign-key crash, and they are correctly nobody here.
   */
  private async applySchoolPass(
    event: GatewayWebhookEvent,
    subscription: NonNullable<GatewayWebhookEvent['subscription']>,
  ): Promise<void> {
    const userId = await this.resolveUserId(event.userId, subscription);
    const known = await this.passes.findByProviderSubscriptionId(
      subscription.providerSubscriptionId,
    );
    const institutionId = subscription.institutionId ?? known?.institutionId;
    if (!userId || !institutionId) {
      this.logger.warn(
        `${this.payments.provider} event ${event.id} (${event.type}) is a school pass for no known member`,
      );
      return;
    }
    const written = await this.passes.upsert({
      userId,
      institutionId,
      provider: this.payments.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
      providerCustomerId: subscription.providerCustomerId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      raw: subscription,
      lastEventAt: event.occurredAt,
    });
    this.logger.log(
      written
        ? `${event.type}: ${userId} -> school pass/${subscription.status}`
        : `${event.type}: ignored, older than the pass state already applied for ${userId}`,
    );
  }

  private async stopPassRenewing(userId: string): Promise<void> {
    const pass = await this.passes.findAnyByUser(userId);
    if (
      !pass?.providerSubscriptionId ||
      pass.cancelAtPeriodEnd ||
      !passIsLive(pass, this.clock.now())
    ) {
      return;
    }
    try {
      await this.payments.cancelSubscription(pass.providerSubscriptionId);
      await this.passes.upsert({ ...pass, cancelAtPeriodEnd: true });
      this.logger.log(
        `Pro is live for ${userId}: the school pass stops renewing at its period end`,
      );
    } catch (cause) {
      this.logger.warn(
        `Could not stop the school pass renewing for ${userId}: ${String(cause)}`,
      );
    }
  }

  private async resolveUserId(
    fromEvent: string | null,
    subscription: {
      providerSubscriptionId: string;
      providerCustomerId: string | null;
    },
  ): Promise<string | null> {
    if (fromEvent && (await this.users.findById(fromEvent))) return fromEvent;

    const known = await this.subscriptions.findByProviderSubscriptionId(
      subscription.providerSubscriptionId,
    );
    if (known) return known.userId;
    const knownPass = await this.passes.findByProviderSubscriptionId(
      subscription.providerSubscriptionId,
    );
    if (knownPass) return knownPass.userId;

    if (subscription.providerCustomerId) {
      const email = await this.payments.fetchCustomerEmail(
        subscription.providerCustomerId,
      );
      const user = email ? await this.users.findByEmail(email) : null;
      if (user) {
        this.logger.log(
          `Attributed ${subscription.providerSubscriptionId} by customer email`,
        );
        return user.id;
      }
    }
    return null;
  }
}
