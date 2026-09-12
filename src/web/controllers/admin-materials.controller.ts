import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
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
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  LECTURE_STYLE_KEYS,
  type AdminUploadIntentResponse,
  type LectureStyle,
  type MaterialDto,
  type PrepareResponse,
  MaterialPageDto,
} from '../../contracts';
import { MAX_UPLOAD_BYTES } from '../../business/domain/values';
import {
  AdminUploadIntentHandler,
  MoveMaterialHandler,
  PrepareMaterialsHandler,
} from '../../business/handlers/institutions/materials.handlers';
import { MaterialsQuery } from '../../query/materials.query';
import { AdminGuard } from '../security/admin.guard';
import { CurrentUser } from '../security/current-user.decorator';

class AdminUploadIntentDto {
  @IsString()
  @Length(1, 512)
  filename!: string;

  @IsString()
  @Length(1, 128)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  sizeBytes!: number;

  @IsString()
  @Length(64, 64)
  contentHash!: string;

  @IsUUID('all')
  departmentId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  levelId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  courseId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

class PrepareDto {
  @IsOptional()
  @IsUUID('all')
  departmentId?: string;

  @IsOptional()
  @IsUUID('all')
  levelId?: string;

  @IsOptional()
  @IsUUID('all')
  courseId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  documentIds?: string[];

  @IsBoolean()
  easiest!: boolean;

  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(LECTURE_STYLE_KEYS, { each: true })
  styles!: LectureStyle[];

  /** Voice every page again, keeping the words: after a pronunciation was added. */
  @IsOptional()
  @IsBoolean()
  revoice?: boolean;
}

class MoveMaterialDto {
  @IsOptional()
  @IsUUID('all')
  departmentId?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  levelId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  courseId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;
}

/** A school's documents, as the admin uploads, arranges and prepares them. */
@Controller('admin/institutions/:id')
@UseGuards(AdminGuard)
export class AdminMaterialsController {
  constructor(
    private readonly materials: MaterialsQuery,
    private readonly intent: AdminUploadIntentHandler,
    private readonly move: MoveMaterialHandler,
    private readonly prepare: PrepareMaterialsHandler,
  ) {}

  @Get('materials')
  async list(
    @Param('id') institutionId: string,
    @Query('departmentId') departmentId?: string,
    @Query('levelId') levelId?: string,
    @Query('courseId') courseId?: string,
  ): Promise<{ materials: MaterialDto[] }> {
    const materials = await this.materials.execute({
      institutionId,
      departmentId: departmentId || undefined,
      levelId: levelId || undefined,
      courseId: courseId || undefined,
    });
    return { materials };
  }

  /** One document's lecture rows with their reasons, for the card's detail panel. */
  @Get('materials/:documentId/pages')
  async pages(
    @Param('id') institutionId: string,
    @Param('documentId') documentId: string,
  ): Promise<{ pages: MaterialPageDto[] }> {
    return { pages: await this.materials.pages(institutionId, documentId) };
  }

  /** The hash first: a duplicate is answered without its bytes. Then the usual content route. */
  @Post('upload-intent')
  @HttpCode(201)
  async uploadIntent(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: AdminUploadIntentDto,
  ): Promise<AdminUploadIntentResponse> {
    const { data } = await this.intent.handle({
      userId,
      institutionId,
      ...body,
      levelId: body.levelId ?? null,
    });
    return data;
  }

  @Patch('materials/:documentId')
  async moveOne(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Param('documentId') documentId: string,
    @Body() body: MoveMaterialDto,
  ): Promise<{ ok: true }> {
    const { data } = await this.move.handle({
      userId,
      institutionId,
      documentId,
      ...body,
    });
    return data;
  }

  /** The number before the button. */
  @Post('estimate')
  async estimate(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: PrepareDto,
  ): Promise<PrepareResponse> {
    const { data } = await this.prepare.handle({
      userId,
      institutionId,
      ...body,
      dryRun: true,
    });
    return data;
  }

  @Post('prepare')
  @HttpCode(202)
  async run(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: PrepareDto,
  ): Promise<PrepareResponse> {
    const { data } = await this.prepare.handle({
      userId,
      institutionId,
      ...body,
    });
    return data;
  }
}
