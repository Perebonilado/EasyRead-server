import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';
import type {
  CourseDto,
  DepartmentDto,
  InstitutionAdminDto,
  InstitutionDetailDto,
  LevelDto,
} from '../../contracts';
import {
  CreateInstitutionHandler,
  DeleteCourseHandler,
  DeleteDepartmentHandler,
  DeleteLevelHandler,
  InstitutionDetailHandler,
  ListInstitutionsHandler,
  SaveCourseHandler,
  SaveDepartmentHandler,
  SaveLevelHandler,
  UpdateInstitutionHandler,
} from '../../business/handlers/institutions/institution.handlers';
import { AdminGuard } from '../security/admin.guard';
import { CurrentUser } from '../security/current-user.decorator';

class CreateInstitutionDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(2, 2)
  country?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  levelWord?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  emailDomains?: string[];

  @IsOptional()
  @IsBoolean()
  inviteCode?: boolean;
}

class UpdateInstitutionDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  slug?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(2, 2)
  country?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  levelWord?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  emailDomains?: string[];

  @IsOptional()
  @IsIn(['rotate', 'none'])
  inviteCode?: 'rotate' | 'none';

  @IsOptional()
  @IsBoolean()
  verifyStudents?: boolean;
}

class NamedDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

class CourseBodyDto extends NamedDto {
  @IsUUID('all')
  departmentId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  levelId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Length(0, 40)
  code?: string | null;
}

/** The platform admin's view of the schools. Every route is behind the admin gate. */
@Controller('admin/institutions')
@UseGuards(AdminGuard)
export class AdminInstitutionsController {
  constructor(
    private readonly listSchools: ListInstitutionsHandler,
    private readonly createSchool: CreateInstitutionHandler,
    private readonly updateSchool: UpdateInstitutionHandler,
    private readonly detail: InstitutionDetailHandler,
    private readonly saveDepartment: SaveDepartmentHandler,
    private readonly dropDepartment: DeleteDepartmentHandler,
    private readonly saveLevel: SaveLevelHandler,
    private readonly dropLevel: DeleteLevelHandler,
    private readonly saveCourse: SaveCourseHandler,
    private readonly dropCourse: DeleteCourseHandler,
  ) {}

  @Get()
  async list(
    @CurrentUser('id') userId: string,
  ): Promise<{ institutions: InstitutionAdminDto[] }> {
    const { data } = await this.listSchools.handle({ userId });
    return data;
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser('id') userId: string,
    @Body() body: CreateInstitutionDto,
  ): Promise<InstitutionAdminDto> {
    const { data } = await this.createSchool.handle({ userId, ...body });
    return data;
  }

  @Get(':id')
  async one(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
  ): Promise<InstitutionDetailDto> {
    const { data } = await this.detail.handle({ userId, institutionId });
    return data;
  }

  @Patch(':id')
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: UpdateInstitutionDto,
  ): Promise<InstitutionAdminDto> {
    const { data } = await this.updateSchool.handle({
      userId,
      institutionId,
      ...body,
    });
    return data;
  }

  @Post(':id/departments')
  @HttpCode(201)
  async addDepartment(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: NamedDto,
  ): Promise<DepartmentDto> {
    const { data } = await this.saveDepartment.handle({
      userId,
      institutionId,
      ...body,
    });
    return data;
  }

  @Patch(':id/departments/:departmentId')
  async editDepartment(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Param('departmentId') departmentId: string,
    @Body() body: NamedDto,
  ): Promise<DepartmentDto> {
    const { data } = await this.saveDepartment.handle({
      userId,
      institutionId,
      departmentId,
      ...body,
    });
    return data;
  }

  @Delete(':id/departments/:departmentId')
  async removeDepartment(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Param('departmentId') departmentId: string,
  ): Promise<{ ok: true }> {
    const { data } = await this.dropDepartment.handle({
      userId,
      institutionId,
      departmentId,
    });
    return data;
  }

  @Post(':id/levels')
  @HttpCode(201)
  async addLevel(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: NamedDto,
  ): Promise<LevelDto> {
    const { data } = await this.saveLevel.handle({
      userId,
      institutionId,
      ...body,
    });
    return data;
  }

  @Patch(':id/levels/:levelId')
  async editLevel(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Param('levelId') levelId: string,
    @Body() body: NamedDto,
  ): Promise<LevelDto> {
    const { data } = await this.saveLevel.handle({
      userId,
      institutionId,
      levelId,
      ...body,
    });
    return data;
  }

  @Delete(':id/levels/:levelId')
  async removeLevel(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Param('levelId') levelId: string,
  ): Promise<{ ok: true }> {
    const { data } = await this.dropLevel.handle({
      userId,
      institutionId,
      levelId,
    });
    return data;
  }

  @Post(':id/courses')
  @HttpCode(201)
  async addCourse(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: CourseBodyDto,
  ): Promise<CourseDto> {
    const { data } = await this.saveCourse.handle({
      userId,
      institutionId,
      ...body,
      levelId: body.levelId ?? null,
    });
    return data;
  }

  @Patch(':id/courses/:courseId')
  async editCourse(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Param('courseId') courseId: string,
    @Body() body: CourseBodyDto,
  ): Promise<CourseDto> {
    const { data } = await this.saveCourse.handle({
      userId,
      institutionId,
      courseId,
      ...body,
      levelId: body.levelId ?? null,
    });
    return data;
  }

  @Delete(':id/courses/:courseId')
  async removeCourse(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Param('courseId') courseId: string,
  ): Promise<{ ok: true }> {
    const { data } = await this.dropCourse.handle({
      userId,
      institutionId,
      courseId,
    });
    return data;
  }
}
