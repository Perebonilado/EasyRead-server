import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import type {
  CatalogueDto,
  InstitutionListItemDto,
  InstitutionPublicDto,
  MembershipDto,
} from '../../contracts';
import { CatalogueQuery } from '../../query/catalogue.query';
import {
  InstitutionPublicHandler,
  JoinInstitutionHandler,
  LeaveInstitutionHandler,
  ListPublicInstitutionsHandler,
  SetMembershipHandler,
  StartSchoolVerificationHandler,
} from '../../business/handlers/institutions/institution.handlers';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';

class JoinInstitutionDto {
  /** The school email and the code sent to it, when the school asks for them. */
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\s*\d{6}\s*$/)
  code?: string;

  @IsOptional()
  @IsUUID('all')
  departmentId?: string;

  @IsOptional()
  @IsUUID('all')
  levelId?: string;
}

/** A department and level to look at; a student sees their own when neither is given. */
class CatalogueQueryDto {
  @IsOptional()
  @IsUUID('all')
  departmentId?: string;

  @IsOptional()
  @IsUUID('all')
  levelId?: string;
}

class VerifySchoolEmailDto {
  @IsEmail()
  email!: string;
}

class SetMembershipDto {
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  departmentId!: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  levelId!: string | null;
}

/**
 * A school's front door and a member's place in it. The address is public
 * so a visitor can see whose door it is before signing up; joining and
 * placement need a signed-in person.
 */
@Controller('institutions')
export class InstitutionsController {
  constructor(
    private readonly front: InstitutionPublicHandler,
    private readonly join: JoinInstitutionHandler,
    private readonly place: SetMembershipHandler,
    private readonly catalogue: CatalogueQuery,
    private readonly list: ListPublicInstitutionsHandler,
    private readonly verify: StartSchoolVerificationHandler,
    private readonly leave: LeaveInstitutionHandler,
  ) {}

  /** The school's catalogue, for a member: every course, with their own progress. */
  @Get(':slug/catalogue')
  async catalogueOf(
    @CurrentUser('id') userId: string,
    @Param('slug') slug: string,
    @Query() query: CatalogueQueryDto,
  ): Promise<CatalogueDto> {
    return this.catalogue.execute(slug, userId, {
      departmentId: query.departmentId ?? null,
      levelId: query.levelId ?? null,
    });
  }

  /** The member's own department and level, set at onboarding or changed later. */
  @Patch('membership')
  async membership(
    @CurrentUser('id') userId: string,
    @Body() body: SetMembershipDto,
  ): Promise<MembershipDto> {
    const { data } = await this.place.handle({
      userId,
      departmentId: body.departmentId ?? null,
      levelId: body.levelId ?? null,
    });
    return data;
  }

  /** Every school, for the list a person picks from. */
  @Public()
  @Get()
  async all(): Promise<{ institutions: InstitutionListItemDto[] }> {
    const { data } = await this.list.handle({});
    return data;
  }

  /** The member leaves their school. */
  @Delete('membership')
  async leaveSchool(@CurrentUser('id') userId: string): Promise<{ ok: true }> {
    const { data } = await this.leave.handle({ userId });
    return data;
  }

  /** A code to the school email named, for a school that asks for one. Few a minute, on purpose. */
  @Post(':slug/verify')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  async verifySchoolEmail(
    @CurrentUser('id') userId: string,
    @Param('slug') slug: string,
    @Body() body: VerifySchoolEmailDto,
  ): Promise<{ ok: true; resendAfterMs: number }> {
    const { data } = await this.verify.handle({
      userId,
      slug,
      email: body.email,
    });
    return data;
  }

  @Public()
  @Get(':slug')
  async bySlug(@Param('slug') slug: string): Promise<InstitutionPublicDto> {
    const { data } = await this.front.handle({ slug });
    return data;
  }

  @Post(':slug/join')
  @HttpCode(201)
  async joinSchool(
    @CurrentUser('id') userId: string,
    @Param('slug') slug: string,
    @Body() body: JoinInstitutionDto,
  ): Promise<MembershipDto> {
    const { data } = await this.join.handle({ userId, slug, ...body });
    return data;
  }
}
