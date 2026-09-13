import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ForbiddenError } from '../../business/domain/errors/errors';
import { isStudent } from '../../business/domain/institutions';
import type { InstitutionRepository } from '../../business/repositories/institution.repository';
import { INSTITUTION_REPOSITORY } from '../../business/repositories/tokens';
import type { AuthenticatedRequest } from './auth.guard';

/** What a student is told at any door that makes a file of one's own. */
export const SCHOOL_ADDS_FILES = 'Your school adds your files';

/**
 * The gate on making a file of one's own: uploading, importing from a
 * link, having one written. A student's files come from their school, so
 * a student is refused with the one line that says so; everyone else
 * passes. Applied after the bearer gate has put the user on the request.
 */
@Injectable()
export class OwnFilesGuard implements CanActivate {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return true;
    const membership = await this.institutions.findMembership(user.id);
    if (isStudent(membership)) throw new ForbiddenError(SCHOOL_ADDS_FILES);
    return true;
  }
}
