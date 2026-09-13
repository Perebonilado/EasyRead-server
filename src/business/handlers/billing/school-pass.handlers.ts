import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { passIsLive } from '../../domain/institutions';
import { CLOCK, PAYMENTS } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { CheckoutIntent, PaymentsPort } from '../../ports/payments.port';
import {
  INSTITUTION_REPOSITORY,
  SCHOOL_PASS_REPOSITORY,
  SUBSCRIPTION_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
import type {
  SchoolPassRepository,
  SubscriptionRepository,
} from '../../repositories/billing.repository';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { EntitlementsService } from '../documents/entitlements.service';

/**
 * Checkout for the school pass: a member's own school, 15 a year. Refused
 * on Pro, which already includes the school, and while a pass still
 * renews, so nobody is ever charged twice. The gateway customer is reused
 * from either table, so cards and invoices stay in one place.
 */
@Injectable()
export class StartSchoolPassCheckoutHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  CheckoutIntent
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(SCHOOL_PASS_REPOSITORY)
    private readonly passes: SchoolPassRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: { userId: string }) {
    const user = await this.users.findById(cmd.userId);
    if (!user) throw new NotFoundError('Account');
    const membership = await this.institutions.findMembership(cmd.userId);
    if (!membership) throw new ValidationError('Join a school first');
    if ((await this.entitlements.planFor(cmd.userId)) === 'pro') {
      throw new ValidationError('Pro already includes your school');
    }
    const pass = await this.passes.findByUser(
      cmd.userId,
      membership.institutionId,
    );
    if (pass && passIsLive(pass, this.clock.now()) && !pass.cancelAtPeriodEnd) {
      throw new ValidationError('You already have a school pass');
    }
    const subscription = await this.subscriptions.findByUser(cmd.userId);
    const intent = await this.payments.createSchoolPassCheckout({
      userId: user.id,
      email: user.email,
      institutionId: membership.institutionId,
      providerCustomerId:
        pass?.providerCustomerId ?? subscription?.providerCustomerId ?? null,
    });
    return CommandResponse.of(intent);
  }
}

/** Stops the pass renewing at the end of the paid year; it reads until then. */
@Injectable()
export class CancelSchoolPassHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  void
> {
  constructor(
    @Inject(SCHOOL_PASS_REPOSITORY)
    private readonly passes: SchoolPassRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: { userId: string }) {
    const pass = await this.passes.findAnyByUser(cmd.userId);
    if (!pass?.providerSubscriptionId) {
      throw new ValidationError('You do not have a school pass to cancel');
    }
    if (pass.cancelAtPeriodEnd) {
      throw new ValidationError('This pass is already cancelling');
    }
    await this.payments.cancelSubscription(pass.providerSubscriptionId);
    await this.passes.upsert({ ...pass, cancelAtPeriodEnd: true });
    return CommandResponse.empty();
  }
}

/** Takes back a cancellation that has not taken effect yet: the pass renews after all. */
@Injectable()
export class ResumeSchoolPassHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  void
> {
  constructor(
    @Inject(SCHOOL_PASS_REPOSITORY)
    private readonly passes: SchoolPassRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: { userId: string }) {
    const pass = await this.passes.findAnyByUser(cmd.userId);
    if (!pass?.providerSubscriptionId) {
      throw new ValidationError('You do not have a school pass to resume');
    }
    if (!pass.cancelAtPeriodEnd) {
      throw new ValidationError('This pass is not cancelling');
    }
    if ((await this.entitlements.planFor(cmd.userId)) === 'pro') {
      throw new ValidationError('Pro already includes your school');
    }
    const updated = await this.payments.resumeSubscription(
      pass.providerSubscriptionId,
    );
    await this.passes.upsert({
      ...pass,
      cancelAtPeriodEnd: updated?.cancelAtPeriodEnd ?? false,
      status: updated?.status ?? pass.status,
      currentPeriodEnd: updated?.currentPeriodEnd ?? pass.currentPeriodEnd,
      raw: updated ?? undefined,
    });
    return CommandResponse.empty();
  }
}
