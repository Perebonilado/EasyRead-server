import { Inject, Injectable } from '@nestjs/common';
import type { InstitutionAdminDto } from '../../../contracts';
import { NotFoundError, ValidationError } from '../../domain/errors/errors';
import { INSTITUTION_REPOSITORY } from '../../repositories/tokens';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

export interface SetSchoolFreeUntilRequest {
  institutionId: string;
  /** A date, or null to lift it. */
  freeUntil: string | null;
}

/** The admin's lever while a school onboards: free for its students until a date. */
@Injectable()
export class SetSchoolFreeUntilHandler extends AbstractRequestHandlerTemplate<
  SetSchoolFreeUntilRequest,
  InstitutionAdminDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }

  protected async handleRequest(cmd: SetSchoolFreeUntilRequest) {
    const school = await this.institutions.findById(cmd.institutionId);
    if (!school) throw new NotFoundError('School');
    let passFreeUntil: Date | null = null;
    if (cmd.freeUntil) {
      passFreeUntil = new Date(cmd.freeUntil);
      if (Number.isNaN(passFreeUntil.getTime())) {
        throw new ValidationError('That is not a date');
      }
    }
    await this.institutions.update(school.id, { passFreeUntil });
    const fresh = await this.institutions.findById(school.id);
    return CommandResponse.of(fresh!);
  }
}
