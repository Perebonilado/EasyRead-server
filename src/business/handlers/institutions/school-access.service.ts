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

/** A member's standing with the school's library, for the band and Settings. */
export interface SchoolStanding {
  access: SchoolAccess;
  pass: SchoolPassRecord | null;
}

/**
 * One question, answered in one place: may this member read this school
 * document? Pro includes the school; a school may be free until a date
 * while it onboards; a live pass reads; the first document ever opened is
 * free and remembered; anything else is locked, and the route answers 402
 * so the client can offer the pass. The order matters: the money is only
 * looked at after Pro and the school's own free period.
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
    const access = await this.decide(userId, institutionId, pass, null);
    return { access, pass };
  }

  /**
   * Whether this member may read this document of the school. Opening a
   * document (`claim`) is where the one free document is remembered; the
   * other reads of it only look.
   */
  async verdict(
    userId: string,
    institutionId: string,
    documentId: string,
    claim: boolean,
  ): Promise<SchoolAccess> {
    const pass = await this.passes.findByUser(userId, institutionId);
    const access = await this.decide(userId, institutionId, pass, documentId);
    if (access === 'first_document' && claim && !pass?.freeDocumentId) {
      await this.passes.claimFreeDocument(
        userId,
        institutionId,
        documentId,
        this.clock.now(),
      );
    }
    return access;
  }

  async assertMayRead(
    userId: string,
    institutionId: string,
    documentId: string,
    claim: boolean,
  ): Promise<void> {
    const access = await this.verdict(userId, institutionId, documentId, claim);
    if (access === 'locked') throw new SchoolPassRequiredError();
  }

  private async decide(
    userId: string,
    institutionId: string,
    pass: SchoolPassRecord | null,
    documentId: string | null,
  ): Promise<SchoolAccess> {
    if ((await this.entitlements.planFor(userId)) === 'pro') return 'pro';
    const now = this.clock.now();
    const school = await this.institutions.findById(institutionId);
    if (school?.passFreeUntil && new Date(school.passFreeUntil) > now) {
      return 'school_free';
    }
    if (passIsLive(pass, now)) return 'pass';
    // Nothing paid: the one free document, if this is it or none is taken.
    if (!pass?.freeDocumentId) return 'first_document';
    if (documentId !== null && pass.freeDocumentId === documentId) {
      return 'first_document';
    }
    return 'locked';
  }
}
