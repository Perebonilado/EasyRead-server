import { Inject, Injectable } from '@nestjs/common';
import type {
  CourseDto,
  CreateInstitutionRequest,
  DepartmentDto,
  InstitutionAdminDto,
  InstitutionDetailDto,
  InstitutionDto,
  InstitutionListItemDto,
  InstitutionPublicDto,
  JoinInstitutionRequest,
  LevelDto,
  MembershipDto,
  SetMembershipRequest,
  UpdateInstitutionRequest,
} from '../../../contracts';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors/errors';
import {
  JOIN_CODE,
  emailOnDomains,
  hashJoinCode,
  isValidSlug,
  joinCodeVerdict,
  mintInviteCode,
  mintJoinCode,
  slugify,
} from '../../domain/institutions';
import { CLOCK, EMAIL } from '../../ports/tokens';
import type { ClockPort } from '../../ports/clock.port';
import type { EmailPort } from '../../ports/email.port';
import {
  INSTITUTION_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';
import type { InstitutionRepository } from '../../repositories/institution.repository';
import type { UserRepository } from '../../repositories/user.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';

/** The admin's shape, less the code and the counts: what a member or a visitor sees. */
export function publicShape(school: InstitutionAdminDto): InstitutionDto {
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    country: school.country,
    levelWord: school.levelWord,
    needsInviteCode: school.needsInviteCode,
    emailDomains: school.emailDomains,
    verifyStudents: school.verifyStudents,
  };
}

// ── Admin: schools ──────────────────────────────────────────────────────────

@Injectable()
export class ListInstitutionsHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  { institutions: InstitutionAdminDto[] }
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest() {
    return CommandResponse.of({ institutions: await this.institutions.list() });
  }
}

@Injectable()
export class CreateInstitutionHandler extends AbstractRequestHandlerTemplate<
  CreateInstitutionRequest & { userId: string },
  InstitutionAdminDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: CreateInstitutionRequest) {
    const slug = (cmd.slug || slugify(cmd.name)).trim().toLowerCase();
    if (!isValidSlug(slug)) {
      throw new ValidationError(
        'That address is not available: lower-case letters, digits and hyphens, and not one of our own pages',
      );
    }
    if (await this.institutions.findBySlug(slug)) {
      throw new ValidationError('A school already has that address');
    }
    const created = await this.institutions.create({
      name: cmd.name.trim(),
      slug,
      country: cmd.country?.trim().toUpperCase() || null,
      levelWord: cmd.levelWord?.trim() || 'Year',
      emailDomains: cleanDomains(cmd.emailDomains ?? []),
      inviteCode: cmd.inviteCode === true ? mintInviteCode() : null,
    });
    return CommandResponse.of(created);
  }
}

@Injectable()
export class UpdateInstitutionHandler extends AbstractRequestHandlerTemplate<
  UpdateInstitutionRequest & { userId: string; institutionId: string },
  InstitutionAdminDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(
    cmd: UpdateInstitutionRequest & { institutionId: string },
  ) {
    const school = await this.institutions.findById(cmd.institutionId);
    if (!school) throw new NotFoundError('School');
    const patch: Parameters<InstitutionRepository['update']>[1] = {};
    if (cmd.name !== undefined) patch.name = cmd.name.trim();
    if (cmd.slug !== undefined) {
      const slug = cmd.slug.trim().toLowerCase();
      if (!isValidSlug(slug))
        throw new ValidationError('That address is not available');
      const taken = await this.institutions.findBySlug(slug);
      if (taken && taken.id !== school.id) {
        throw new ValidationError('A school already has that address');
      }
      patch.slug = slug;
    }
    if (cmd.country !== undefined) {
      patch.country = cmd.country?.trim().toUpperCase() || null;
    }
    if (cmd.levelWord !== undefined)
      patch.levelWord = cmd.levelWord.trim() || 'Year';
    if (cmd.verifyStudents !== undefined) {
      patch.verifyStudents = cmd.verifyStudents;
    }
    if (cmd.emailDomains !== undefined) {
      patch.emailDomains = cleanDomains(cmd.emailDomains);
    }
    if (cmd.inviteCode === 'rotate') patch.inviteCode = mintInviteCode();
    if (cmd.inviteCode === 'none') patch.inviteCode = null;
    await this.institutions.update(school.id, patch);
    const fresh = await this.institutions.findById(school.id);
    return CommandResponse.of(fresh!);
  }
}

@Injectable()
export class InstitutionDetailHandler extends AbstractRequestHandlerTemplate<
  { userId: string; institutionId: string },
  InstitutionDetailDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: { institutionId: string }) {
    const institution = await this.institutions.findById(cmd.institutionId);
    if (!institution) throw new NotFoundError('School');
    const [departments, levels, courses] = await Promise.all([
      this.institutions.listDepartments(institution.id),
      this.institutions.listLevels(institution.id),
      this.institutions.listCourses(institution.id),
    ]);
    return CommandResponse.of({ institution, departments, levels, courses });
  }
}

// ── Admin: departments, levels, courses ─────────────────────────────────────

@Injectable()
export class SaveDepartmentHandler extends AbstractRequestHandlerTemplate<
  {
    userId: string;
    institutionId: string;
    departmentId?: string;
    name: string;
    orderIndex?: number;
  },
  DepartmentDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: {
    institutionId: string;
    departmentId?: string;
    name: string;
    orderIndex?: number;
  }) {
    const name = cmd.name.trim();
    if (!name) throw new ValidationError('A department needs a name');
    if (cmd.departmentId) {
      const existing = await this.institutions.findDepartment(cmd.departmentId);
      if (!existing || existing.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Department');
      }
      await this.institutions.updateDepartment(cmd.departmentId, {
        name,
        slug: slugify(name),
        ...(cmd.orderIndex !== undefined ? { orderIndex: cmd.orderIndex } : {}),
      });
      const fresh = await this.institutions.findDepartment(cmd.departmentId);
      return CommandResponse.of(fresh!);
    }
    const siblings = await this.institutions.listDepartments(cmd.institutionId);
    const created = await this.institutions.createDepartment({
      institutionId: cmd.institutionId,
      name,
      slug: uniqueSlug(
        slugify(name),
        siblings.map((d) => d.slug),
      ),
      orderIndex: cmd.orderIndex ?? siblings.length,
    });
    return CommandResponse.of(created);
  }
}

@Injectable()
export class DeleteDepartmentHandler extends AbstractRequestHandlerTemplate<
  { userId: string; institutionId: string; departmentId: string },
  { ok: true }
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: {
    institutionId: string;
    departmentId: string;
  }) {
    const existing = await this.institutions.findDepartment(cmd.departmentId);
    if (!existing || existing.institutionId !== cmd.institutionId) {
      throw new NotFoundError('Department');
    }
    await this.institutions.deleteDepartment(cmd.departmentId);
    return CommandResponse.of({ ok: true as const });
  }
}

@Injectable()
export class SaveLevelHandler extends AbstractRequestHandlerTemplate<
  {
    userId: string;
    institutionId: string;
    levelId?: string;
    name: string;
    orderIndex?: number;
  },
  LevelDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: {
    institutionId: string;
    levelId?: string;
    name: string;
    orderIndex?: number;
  }) {
    const name = cmd.name.trim();
    if (!name) throw new ValidationError('A level needs a name');
    if (cmd.levelId) {
      const existing = await this.institutions.findLevel(cmd.levelId);
      if (!existing || existing.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Level');
      }
      await this.institutions.updateLevel(cmd.levelId, {
        name,
        ...(cmd.orderIndex !== undefined ? { orderIndex: cmd.orderIndex } : {}),
      });
      const fresh = await this.institutions.findLevel(cmd.levelId);
      return CommandResponse.of(fresh!);
    }
    const siblings = await this.institutions.listLevels(cmd.institutionId);
    const created = await this.institutions.createLevel({
      institutionId: cmd.institutionId,
      name,
      orderIndex: cmd.orderIndex ?? siblings.length,
    });
    return CommandResponse.of(created);
  }
}

@Injectable()
export class DeleteLevelHandler extends AbstractRequestHandlerTemplate<
  { userId: string; institutionId: string; levelId: string },
  { ok: true }
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: {
    institutionId: string;
    levelId: string;
  }) {
    const existing = await this.institutions.findLevel(cmd.levelId);
    if (!existing || existing.institutionId !== cmd.institutionId) {
      throw new NotFoundError('Level');
    }
    await this.institutions.deleteLevel(cmd.levelId);
    return CommandResponse.of({ ok: true as const });
  }
}

@Injectable()
export class SaveCourseHandler extends AbstractRequestHandlerTemplate<
  {
    userId: string;
    institutionId: string;
    courseId?: string;
    departmentId: string;
    levelId: string | null;
    name: string;
    code?: string | null;
    orderIndex?: number;
  },
  CourseDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: {
    institutionId: string;
    courseId?: string;
    departmentId: string;
    levelId: string | null;
    name: string;
    code?: string | null;
    orderIndex?: number;
  }) {
    const name = cmd.name.trim();
    if (!name) throw new ValidationError('A course needs a name');
    const department = await this.institutions.findDepartment(cmd.departmentId);
    if (!department || department.institutionId !== cmd.institutionId) {
      throw new NotFoundError('Department');
    }
    if (cmd.levelId) {
      const level = await this.institutions.findLevel(cmd.levelId);
      if (!level || level.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Level');
      }
    }
    // One name per place, so the chips stay unambiguous: a course for the
    // whole department shares the row with every year's.
    const twin = (await this.institutions.listCourses(cmd.institutionId)).find(
      (course) =>
        course.id !== cmd.courseId &&
        course.departmentId === cmd.departmentId &&
        (!course.levelId || !cmd.levelId || course.levelId === cmd.levelId) &&
        course.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (twin) {
      throw new ValidationError('A course with that name is already here');
    }
    if (cmd.courseId) {
      const existing = await this.institutions.findCourse(cmd.courseId);
      if (!existing || existing.institutionId !== cmd.institutionId) {
        throw new NotFoundError('Course');
      }
      await this.institutions.updateCourse(cmd.courseId, {
        levelId: cmd.levelId,
        name,
        code: cmd.code?.trim() || null,
        ...(cmd.orderIndex !== undefined ? { orderIndex: cmd.orderIndex } : {}),
      });
      const fresh = await this.institutions.findCourse(cmd.courseId);
      return CommandResponse.of(stripInstitution(fresh!));
    }
    const siblings = (
      await this.institutions.listCourses(cmd.institutionId)
    ).filter((course) => course.departmentId === cmd.departmentId);
    const created = await this.institutions.createCourse({
      departmentId: cmd.departmentId,
      levelId: cmd.levelId,
      name,
      code: cmd.code?.trim() || null,
      orderIndex: cmd.orderIndex ?? siblings.length,
    });
    return CommandResponse.of(created);
  }
}

@Injectable()
export class DeleteCourseHandler extends AbstractRequestHandlerTemplate<
  { userId: string; institutionId: string; courseId: string },
  { ok: true }
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: {
    institutionId: string;
    courseId: string;
  }) {
    const existing = await this.institutions.findCourse(cmd.courseId);
    if (!existing || existing.institutionId !== cmd.institutionId) {
      throw new NotFoundError('Course');
    }
    await this.institutions.deleteCourse(cmd.courseId);
    return CommandResponse.of({ ok: true as const });
  }
}

// ── The front door and membership ───────────────────────────────────────────

/** The school at an address, for anyone: name, departments, levels, whether a code is needed. */
@Injectable()
export class InstitutionPublicHandler extends AbstractRequestHandlerTemplate<
  { slug: string },
  InstitutionPublicDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: { slug: string }) {
    const school = await this.institutions.findBySlug(cmd.slug.toLowerCase());
    if (!school) throw new NotFoundError('School');
    const [departments, levels] = await Promise.all([
      this.institutions.listDepartments(school.id),
      this.institutions.listLevels(school.id),
    ]);
    return CommandResponse.of({
      institution: publicShape(school),
      departments,
      levels,
    });
  }
}

/** Every school, for the list a person picks from. */
@Injectable()
export class ListPublicInstitutionsHandler extends AbstractRequestHandlerTemplate<
  Record<string, never>,
  { institutions: InstitutionListItemDto[] }
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest() {
    return CommandResponse.of({
      institutions: await this.institutions.listPublic(),
    });
  }
}

/**
 * A school that asks for a school email: the person names theirs, a code
 * goes to it, and the code lets them join. The address must be on the
 * school's domains when it has any; a new code replaces the last, and a
 * minute must pass between sends.
 */
@Injectable()
export class StartSchoolVerificationHandler extends AbstractRequestHandlerTemplate<
  { userId: string; slug: string; email: string },
  { ok: true; resendAfterMs: number }
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EMAIL) private readonly email: EmailPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }
  protected async handleRequest(cmd: {
    userId: string;
    slug: string;
    email: string;
  }) {
    const school = await this.institutions.findBySlug(cmd.slug.toLowerCase());
    if (!school) throw new NotFoundError('School');
    if (!school.verifyStudents) {
      throw new ValidationError('This school does not ask for a school email');
    }
    const user = await this.users.findById(cmd.userId);
    if (!user) throw new NotFoundError('User');
    const email = cmd.email.trim().toLowerCase();
    if (!emailOnDomains(school, email)) {
      throw new ValidationError(
        `That is not a ${school.name} address; use your school email`,
      );
    }
    const now = this.clock.now();
    const last = await this.institutions.findJoinCode(cmd.userId, school.id);
    if (
      last &&
      !last.consumedAt &&
      now.getTime() - last.createdAt.getTime() < JOIN_CODE.resendMs
    ) {
      throw new ValidationError(
        'A code was sent a moment ago; give it a minute before asking again',
      );
    }
    const code = mintJoinCode();
    await this.institutions.saveJoinCode({
      userId: cmd.userId,
      institutionId: school.id,
      email,
      codeHash: hashJoinCode(cmd.userId, code),
      expiresAt: new Date(now.getTime() + JOIN_CODE.ttlMs),
    });
    await this.email.sendSchoolCode({
      to: email,
      name: user.name,
      school: school.name,
      code,
    });
    return CommandResponse.of({
      ok: true as const,
      resendAfterMs: JOIN_CODE.resendMs,
    });
  }
}

/**
 * A signed-in person joins a school. A school that does not ask for a
 * school email takes anyone who picks it; one that does takes the email
 * and the code sent to it, and keeps the email on the membership.
 */
@Injectable()
export class JoinInstitutionHandler extends AbstractRequestHandlerTemplate<
  JoinInstitutionRequest & { userId: string; slug: string },
  MembershipDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {
    super();
  }
  protected async handleRequest(
    cmd: JoinInstitutionRequest & { userId: string; slug: string },
  ) {
    const school = await this.institutions.findBySlug(cmd.slug.toLowerCase());
    if (!school) throw new NotFoundError('School');
    const user = await this.users.findById(cmd.userId);
    if (!user) throw new NotFoundError('User');

    let schoolEmail: string | null = null;
    let verifiedAt: Date | null = null;
    if (school.verifyStudents) {
      const email = cmd.email?.trim().toLowerCase() ?? '';
      const code = cmd.code?.trim() ?? '';
      if (!email || !code) {
        throw new ValidationError(
          'This school asks for your school email and the code sent to it',
        );
      }
      const now = this.clock.now();
      const stored = await this.institutions.findJoinCode(
        cmd.userId,
        school.id,
      );
      const verdict = joinCodeVerdict(stored, code, now);
      if (verdict === 'wrong' && stored) {
        await this.institutions.countJoinAttempt(stored.id);
      }
      if (verdict !== 'ok' || !stored || stored.email !== email) {
        throw new ForbiddenError(JOIN_CODE_MESSAGES[verdict]);
      }
      await this.institutions.consumeJoinCode(stored.id, now);
      schoolEmail = email;
      verifiedAt = now;
    }

    const placement = await this.checkedPlacement(school.id, cmd);
    await this.institutions.join({
      userId: cmd.userId,
      institutionId: school.id,
      ...placement,
      schoolEmail,
      verifiedAt,
    });
    return CommandResponse.of({
      institution: publicShape(school),
      ...placement,
      role: 'student' as const,
      schoolEmail,
    });
  }

  private async checkedPlacement(
    institutionId: string,
    cmd: { departmentId?: string; levelId?: string },
  ): Promise<{ departmentId: string | null; levelId: string | null }> {
    let departmentId: string | null = null;
    let levelId: string | null = null;
    if (cmd.departmentId) {
      const department = await this.institutions.findDepartment(
        cmd.departmentId,
      );
      if (!department || department.institutionId !== institutionId) {
        throw new NotFoundError('Department');
      }
      departmentId = department.id;
    }
    if (cmd.levelId) {
      const level = await this.institutions.findLevel(cmd.levelId);
      if (!level || level.institutionId !== institutionId) {
        throw new NotFoundError('Level');
      }
      levelId = level.id;
    }
    return { departmentId, levelId };
  }
}

/** What a person is told when their code does not let them in. */
const JOIN_CODE_MESSAGES: Record<
  'ok' | 'missing' | 'expired' | 'exhausted' | 'wrong',
  string
> = {
  ok: 'That code is not right for this email',
  missing: 'Ask for a code first',
  expired: 'That code has expired; ask for a new one',
  exhausted: 'Too many tries; ask for a new code',
  wrong: 'That code is not right',
};

/** A member leaves their school; their own documents are untouched. */
@Injectable()
export class LeaveInstitutionHandler extends AbstractRequestHandlerTemplate<
  { userId: string },
  { ok: true }
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(cmd: { userId: string }) {
    await this.institutions.leave(cmd.userId);
    return CommandResponse.of({ ok: true as const });
  }
}

/** A member's department and level, set at onboarding and changed in settings. */
@Injectable()
export class SetMembershipHandler extends AbstractRequestHandlerTemplate<
  SetMembershipRequest & { userId: string },
  MembershipDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
  ) {
    super();
  }
  protected async handleRequest(
    cmd: SetMembershipRequest & { userId: string },
  ) {
    const membership = await this.institutions.findMembership(cmd.userId);
    if (!membership) throw new NotFoundError('School');
    if (cmd.departmentId) {
      const department = await this.institutions.findDepartment(
        cmd.departmentId,
      );
      if (
        !department ||
        department.institutionId !== membership.institutionId
      ) {
        throw new NotFoundError('Department');
      }
    }
    if (cmd.levelId) {
      const level = await this.institutions.findLevel(cmd.levelId);
      if (!level || level.institutionId !== membership.institutionId) {
        throw new NotFoundError('Level');
      }
    }
    await this.institutions.setMembership(cmd.userId, {
      departmentId: cmd.departmentId,
      levelId: cmd.levelId,
    });
    const school = await this.institutions.findById(membership.institutionId);
    return CommandResponse.of({
      institution: publicShape(school!),
      departmentId: cmd.departmentId,
      levelId: cmd.levelId,
      role: membership.role,
      schoolEmail: membership.schoolEmail,
    });
  }
}

function cleanDomains(domains: string[]): string[] {
  return Array.from(
    new Set(
      domains
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
        .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)),
    ),
  );
}

function uniqueSlug(base: string, taken: string[]): string {
  const root = base || 'department';
  if (!taken.includes(root)) return root;
  let n = 2;
  while (taken.includes(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

function stripInstitution<T extends { institutionId: string }>(
  value: T,
): Omit<T, 'institutionId'> {
  const rest: Partial<T> = { ...value };
  delete rest.institutionId;
  return rest as Omit<T, 'institutionId'>;
}
