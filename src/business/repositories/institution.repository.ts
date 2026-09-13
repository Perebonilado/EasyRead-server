import type {
  CourseDto,
  DepartmentDto,
  InstitutionAdminDto,
  InstitutionListItemDto,
  LevelDto,
  MembershipDto,
} from '../../contracts';

export interface MembershipRecord {
  userId: string;
  institutionId: string;
  departmentId: string | null;
  levelId: string | null;
  role: MembershipDto['role'];
  schoolEmail: string | null;
  verifiedAt: Date | null;
}

/** A code sent to a school email, as stored: hashed, dated, counted. */
export interface JoinCodeRecord {
  id: string;
  userId: string;
  institutionId: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

/**
 * Schools and what is in them: departments, levels, courses, and the people
 * who belong. One repository, because the admin edits them as one thing and
 * the front door reads them as one thing.
 */
export interface InstitutionRepository {
  findById(id: string): Promise<InstitutionAdminDto | null>;
  findBySlug(slug: string): Promise<InstitutionAdminDto | null>;
  list(): Promise<InstitutionAdminDto[]>;
  /** Every school, as the list a person picks from. */
  listPublic(): Promise<InstitutionListItemDto[]>;
  create(input: {
    name: string;
    slug: string;
    country: string | null;
    levelWord: string;
    emailDomains: string[];
    inviteCode: string | null;
  }): Promise<InstitutionAdminDto>;
  update(
    id: string,
    patch: Partial<{
      name: string;
      slug: string;
      country: string | null;
      levelWord: string;
      emailDomains: string[];
      inviteCode: string | null;
      verifyStudents: boolean;
    }>,
  ): Promise<void>;

  listDepartments(institutionId: string): Promise<DepartmentDto[]>;
  findDepartment(
    id: string,
  ): Promise<(DepartmentDto & { institutionId: string }) | null>;
  createDepartment(input: {
    institutionId: string;
    name: string;
    slug: string;
    orderIndex: number;
  }): Promise<DepartmentDto>;
  updateDepartment(
    id: string,
    patch: Partial<{ name: string; slug: string; orderIndex: number }>,
  ): Promise<void>;
  deleteDepartment(id: string): Promise<void>;

  listLevels(institutionId: string): Promise<LevelDto[]>;
  findLevel(id: string): Promise<(LevelDto & { institutionId: string }) | null>;
  createLevel(input: {
    institutionId: string;
    name: string;
    orderIndex: number;
  }): Promise<LevelDto>;
  updateLevel(
    id: string,
    patch: Partial<{ name: string; orderIndex: number }>,
  ): Promise<void>;
  deleteLevel(id: string): Promise<void>;

  /** Every course in the school, across its departments. */
  listCourses(institutionId: string): Promise<CourseDto[]>;
  findCourse(
    id: string,
  ): Promise<(CourseDto & { institutionId: string }) | null>;
  createCourse(input: {
    departmentId: string;
    levelId: string | null;
    name: string;
    code: string | null;
    orderIndex: number;
  }): Promise<CourseDto>;
  updateCourse(
    id: string,
    patch: Partial<{
      levelId: string | null;
      name: string;
      code: string | null;
      orderIndex: number;
    }>,
  ): Promise<void>;
  deleteCourse(id: string): Promise<void>;

  findMembership(userId: string): Promise<MembershipRecord | null>;
  isMember(userId: string, institutionId: string): Promise<boolean>;
  join(input: {
    userId: string;
    institutionId: string;
    departmentId: string | null;
    levelId: string | null;
    schoolEmail: string | null;
    verifiedAt: Date | null;
  }): Promise<void>;
  setMembership(
    userId: string,
    patch: { departmentId: string | null; levelId: string | null },
  ): Promise<void>;
  /** The person leaves their school; nothing else of theirs changes. */
  leave(userId: string): Promise<void>;

  /** The newest code for a person and a school, consumed or not. */
  findJoinCode(
    userId: string,
    institutionId: string,
  ): Promise<JoinCodeRecord | null>;
  /** A new code replaces any earlier one for the person and the school. */
  saveJoinCode(input: {
    userId: string;
    institutionId: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<void>;
  countJoinAttempt(id: string): Promise<void>;
  consumeJoinCode(id: string, now: Date): Promise<void>;
}
