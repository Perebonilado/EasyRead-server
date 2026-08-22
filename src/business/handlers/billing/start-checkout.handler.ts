import { Inject, Injectable } from '@nestjs/common';
import type { BillingInterval } from '../../../contracts';
import type { CreditBundle } from '../../domain/values';
import { NotFoundError } from '../../domain/errors/errors';
import { PAYMENTS } from '../../ports/tokens';
import type { CheckoutIntent, PaymentsPort } from '../../ports/payments.port';
import {
  SUBSCRIPTION_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
import type { SubscriptionRepository } from '../../repositories/billing.repository';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface StartCheckoutRequest {
  userId: string;
  interval: BillingInterval;
}

/**
 * Opens checkout for Pro.
 *
 * The price is chosen server-side from the interval, so the browser never
 * gets to name what it is about to be charged, and a returning subscriber
 * is handed back to their existing gateway customer so cards and invoices
 * stay in one place.
 */
@Injectable()
export class StartCheckoutHandler extends AbstractRequestHandlerTemplate<
  StartCheckoutRequest,
  CheckoutIntent
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: StartCheckoutRequest,
  ): Promise<CommandResponse<CheckoutIntent>> {
    const user = await this.users.findById(cmd.userId);
    if (!user) throw new NotFoundError('Account');

    const existing = await this.subscriptions.findByUser(cmd.userId);

    const intent = await this.payments.createCheckout({
      userId: user.id,
      email: user.email,
      interval: cmd.interval,
      providerCustomerId: existing?.providerCustomerId ?? null,
    });

    return CommandResponse.of(intent);
  }
}

export interface BuyCreditsRequest {
  userId: string;
  bundle: CreditBundle;
}

/** Opens checkout for a one-time voice-minutes bundle. */
@Injectable()
export class StartCreditCheckoutHandler extends AbstractRequestHandlerTemplate<
  BuyCreditsRequest,
  CheckoutIntent
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(
    cmd: BuyCreditsRequest,
  ): Promise<CommandResponse<CheckoutIntent>> {
    const user = await this.users.findById(cmd.userId);
    if (!user) throw new NotFoundError('Account');

    const existing = await this.subscriptions.findByUser(cmd.userId);
    const intent = await this.payments.createCreditCheckout({
      userId: user.id,
      email: user.email,
      bundle: cmd.bundle,
      providerCustomerId: existing?.providerCustomerId ?? null,
    });
    return CommandResponse.of(intent);
  }
}
