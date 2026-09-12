import { Inject, Injectable } from '@nestjs/common';
import type {
  CourseDto,
  CreateInstitutionRequest,
  DepartmentDto,
  InstitutionAdminDto,
  InstitutionDetailDto,
  InstitutionDto,
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
  admits,
  isValidSlug,
  mintInviteCode,
  slugify,
} from '../../domain/institutions';
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

/** A signed-in person joins the school at an address, by its code or their email's domain. */
@Injectable()
export class JoinInstitutionHandler extends AbstractRequestHandlerTemplate<
  JoinInstitutionRequest & { userId: string; slug: string },
  MembershipDto
> {
  constructor(
    @Inject(INSTITUTION_REPOSITORY)
    private readonly institutions: InstitutionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
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
    if (
      !admits(
        { inviteCode: school.inviteCode, emailDomains: school.emailDomains },
        { email: user.email, code: cmd.inviteCode ?? null },
      )
    ) {
      throw new ForbiddenError(
        school.needsInviteCode
          ? 'That code is not right for this school'
          : "Your email is not on this school's domains",
      );
    }
    const placement = await this.checkedPlacement(school.id, cmd);
    await this.institutions.join({
      userId: cmd.userId,
      institutionId: school.id,
      ...placement,
    });
    return CommandResponse.of({
      institution: publicShape(school),
      ...placement,
      role: 'student' as const,
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
