import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
import type {
  CatalogueDto,
  InstitutionPublicDto,
  MembershipDto,
} from '../../contracts';
import { CatalogueQuery } from '../../query/catalogue.query';
import {
  InstitutionPublicHandler,
  JoinInstitutionHandler,
  SetMembershipHandler,
} from '../../business/handlers/institutions/institution.handlers';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';

class JoinInstitutionDto {
  @IsOptional()
  @IsString()
  @Length(1, 16)
  inviteCode?: string;

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
