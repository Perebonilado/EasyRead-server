import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../domain/errors/errors';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import {
  DOCUMENT_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
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
 * recovery window closes.
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

    user.softDelete(now);
    await this.users.save(user);
    await this.refreshTokens.revokeAllForUser(user.id, now);

    return CommandResponse.empty();
  }
}
