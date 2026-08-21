import { Inject, Injectable } from '@nestjs/common';
import type { BillingInterval } from '../../../contracts';
import { ValidationError } from '../../domain/errors/errors';
import { CLOCK, PAYMENTS } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { PaymentsPort } from '../../ports/payments.port';
import { SUBSCRIPTION_REPOSITORY } from '../../repositories/tokens';
import type { SubscriptionRepository } from '../../repositories/billing.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

/**
 * Cancels at the end of the period already paid for.
 *
 * The row is marked immediately so the billing screen tells the truth on
 * the next paint, and the gateway's own `subscription.updated` webhook
 * confirms it moments later. Access is not touched here: Pro runs to
 * `currentPeriodEnd`, which is what the customer bought.
 */
@Injectable()
export class CancelSubscriptionHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  void
> {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: {
    userId: string;
  }): Promise<CommandResponse<void>> {
    const record = await this.subscriptions.findByUser(cmd.userId);
    if (!record?.providerSubscriptionId) {
      throw new ValidationError('You do not have a subscription to cancel');
    }
    if (record.cancelAtPeriodEnd) {
      throw new ValidationError('This subscription is already cancelling');
    }

    await this.payments.cancelSubscription(record.providerSubscriptionId);
    await this.subscriptions.upsert({ ...record, cancelAtPeriodEnd: true });

    return CommandResponse.empty();
  }
}

/**
 * Moving an existing subscription between monthly and yearly.
 *
 * Someone on monthly who wants to commit to a year is trying to pay more,
 * so this must not require cancelling and waiting. The gateway's updated
 * view is written straight back, rather than leaving the screen stale
 * until the webhook that follows arrives.
 */
@Injectable()
export class ChangeIntervalHandler extends AbstractRequestHandlerTemplate<
  { userId: string; interval: BillingInterval },
  void
> {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: {
    userId: string;
    interval: BillingInterval;
  }): Promise<CommandResponse<void>> {
    const record = await this.subscriptions.findByUser(cmd.userId);
    if (!record?.providerSubscriptionId) {
      throw new ValidationError('You do not have a subscription to change');
    }
    if (record.interval === cmd.interval) {
      throw new ValidationError(`You are already billed ${cmd.interval}`);
    }
    // A subscription on its way out has nothing to switch: it is not
    // renewing at all, so let them resume first and change after.
    if (record.cancelAtPeriodEnd) {
      throw new ValidationError(
        'This subscription is cancelling. Resume it before changing how you are billed.',
      );
    }

    const updated = await this.payments.changeInterval(
      record.providerSubscriptionId,
      cmd.interval,
    );

    await this.subscriptions.upsert({
      ...record,
      interval: updated?.interval ?? cmd.interval,
      status: updated?.status ?? record.status,
      currentPeriodEnd: updated?.currentPeriodEnd ?? record.currentPeriodEnd,
      raw: updated ?? record,
    });

    return CommandResponse.empty();
  }
}

/**
 * Taking back a cancellation before it lands.
 *
 * Until the paid period ends nothing has actually stopped, so this is a
 * matter of clearing the pending change rather than selling them the plan
 * again.
 */
@Injectable()
export class ResumeSubscriptionHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  void
> {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: {
    userId: string;
  }): Promise<CommandResponse<void>> {
    const record = await this.subscriptions.findByUser(cmd.userId);
    if (!record?.providerSubscriptionId) {
      throw new ValidationError('You do not have a subscription to resume');
    }
    if (!record.cancelAtPeriodEnd) {
      throw new ValidationError('This subscription is not cancelling');
    }

    const updated = await this.payments.resumeSubscription(
      record.providerSubscriptionId,
    );

    await this.subscriptions.upsert({
      ...record,
      cancelAtPeriodEnd: updated?.cancelAtPeriodEnd ?? false,
      status: updated?.status ?? record.status,
      currentPeriodEnd: updated?.currentPeriodEnd ?? record.currentPeriodEnd,
      raw: updated ?? record,
    });

    return CommandResponse.empty();
  }
}

/**
 * A link into the gateway's own billing page.
 *
 * Cards, invoices and tax receipts live with the merchant of record, so
 * this hands the customer over rather than rebuilding any of it here.
 */
@Injectable()
export class OpenBillingPortalHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  { url: string | null }
> {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: {
    userId: string;
  }): Promise<CommandResponse<{ url: string | null }>> {
    const record = await this.subscriptions.findByUser(cmd.userId);
    if (!record?.providerCustomerId) {
      throw new ValidationError('There is no billing account yet');
    }
    const url = await this.payments.createPortalSession(
      record.providerCustomerId,
    );
    return CommandResponse.of({ url });
  }
}

/**
 * Pulls the live state from the gateway and rewrites the row.
 *
 * Webhooks are the primary path; this is the safety net for the delivery
 * that never arrived. Run on a schedule, it means a missed event costs a
 * few hours of staleness rather than a subscription that silently stops
 * matching what the customer is paying.
 */
@Injectable()
export class ReconcileSubscriptionHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  void
> {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: {
    userId: string;
  }): Promise<CommandResponse<void>> {
    const record = await this.subscriptions.findByUser(cmd.userId);
    if (!record?.providerSubscriptionId) return CommandResponse.empty();

    const live = await this.payments.fetchSubscription(
      record.providerSubscriptionId,
    );

    if (!live) {
      // The gateway no longer knows this subscription. Expire it rather
      // than leaving a row that grants Pro forever.
      const ended =
        record.currentPeriodEnd !== null &&
        record.currentPeriodEnd < this.clock.now();
      if (ended) {
        await this.subscriptions.upsert({ ...record, status: 'expired' });
      }
      return CommandResponse.empty();
    }

    await this.subscriptions.upsert({
      ...record,
      planCode: live.planCode,
      interval: live.interval,
      providerCustomerId: live.providerCustomerId,
      status: live.status,
      currentPeriodEnd: live.currentPeriodEnd,
      cancelAtPeriodEnd: live.cancelAtPeriodEnd,
      raw: live,
    });
    return CommandResponse.empty();
  }
}
