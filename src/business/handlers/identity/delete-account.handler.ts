import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../domain/errors/errors';
import { CLOCK, PAYMENTS } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { PaymentsPort } from '../../ports/payments.port';
import {
  DOCUMENT_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  SUBSCRIPTION_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
import type { SubscriptionRepository } from '../../repositories/billing.repository';
import type { DocumentRepository } from '../../repositories/document.repository';
import type { RefreshTokenRepository } from '../../repositories/refresh-token.repository';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface DeleteAccountRequest {
  userId: string;
}

/**
 * Soft-deletes the account and everything under it (PRD §10).
 *
 * Sessions end immediately — `softDelete` bumps `tokenVersion`, which the auth
 * guard checks, so live access tokens stop working rather than lasting out
 * their TTL. The files and rows are removed by the purge job once the 14-day
 * recovery window closes. Any live subscription is cancelled first, so a
 * deleted account never keeps being charged.
 */
@Injectable()
export class DeleteAccountHandler extends AbstractRequestHandlerTemplate<
  DeleteAccountRequest,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: SubscriptionRepository,
    @Inject(PAYMENTS) private readonly payments: PaymentsPort,
  ) {
    super();
  }

  protected async handleRequest(cmd: DeleteAccountRequest) {
    const user = await this.users.findById(cmd.userId);
    if (!user || user.isDeleted) throw new NotFoundError('Account');

    const now = this.clock.now();

    for (const doc of await this.documents.listForUser(cmd.userId)) {
      if (doc.props.deletedAt) continue;
      doc.softDelete(now);
      await this.documents.save(doc);
    }

    // Nobody should keep paying for an account they deleted. Cancelling at
    // period end matches the in-app cancel: they keep what they paid for,
    // and the gateway stops billing. A gateway that refuses must not block
    // the deletion itself — the account going away is the promise we made.
    const subscription = await this.subscriptions.findByUser(cmd.userId);
    if (subscription?.providerSubscriptionId) {
      try {
        await this.payments.cancelSubscription(
          subscription.providerSubscriptionId,
        );
      } catch (error) {
        this.logger.error(
          `Deleted ${cmd.userId} but could not cancel ${subscription.providerSubscriptionId}: ${(error as Error).message}. Cancel it by hand in the gateway dashboard.`,
        );
      }
    }

    user.softDelete(now);
    await this.users.save(user);
    await this.refreshTokens.revokeAllForUser(user.id, now);

    return CommandResponse.empty();
  }
}
