import { Inject, Injectable } from '@nestjs/common';
import type { SchoolAccess } from '../../../contracts';
import { SchoolPassRequiredError } from '../../domain/errors/errors';
import { passIsLive } from '../../domain/institutions';
import { CLOCK } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import {
  INSTITUTION_REPOSITORY,
  SCHOOL_PASS_REPOSITORY,
} from '../../repositories/tokens';
import type {
  SchoolPassRecord,
  SchoolPassRepository,
} from '../../repositories/billing.repository';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import { EntitlementsService } from '../documents/entitlements.service';

/** A member's standing with the school's library, for the banner and Settings. */
export interface SchoolStanding {
  access: SchoolAccess;
  pass: SchoolPassRecord | null;
}

/**
 * One question, answered in one place: may this member read the school's
 * documents? Pro includes the school; a school may be free until a date
 * while it onboards; a live pass reads; anything else is locked, and the
 * route answers 402 so the client can offer the pass. The order matters:
 * the money is only looked at after Pro and the school's own free period.
 */
@Injectable()
export class SchoolAccessService {
  constructor(
    private readonly entitlements: EntitlementsService,
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(SCHOOL_PASS_REPOSITORY)
    private readonly passes: SchoolPassRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async standing(
    userId: string,
    institutionId: string,
  ): Promise<SchoolStanding> {
    const pass = await this.passes.findByUser(userId, institutionId);
    const access = await this.decide(userId, institutionId, pass);
    return { access, pass };
  }

  /** A locked member is refused with 402, whatever the document. */
  async assertMayRead(userId: string, institutionId: string): Promise<void> {
    const { access } = await this.standing(userId, institutionId);
    if (access === 'locked') throw new SchoolPassRequiredError();
  }

  private async decide(
    userId: string,
    institutionId: string,
    pass: SchoolPassRecord | null,
  ): Promise<SchoolAccess> {
    if ((await this.entitlements.planFor(userId)) === 'pro') return 'pro';
    const now = this.clock.now();
    const school = await this.institutions.findById(institutionId);
    if (school?.passFreeUntil && new Date(school.passFreeUntil) > now) {
      return 'school_free';
    }
    if (passIsLive(pass, now)) return 'pass';
    return 'locked';
  }
}
