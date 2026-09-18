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
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  type BatchDto,
  type LectureStyle,
  type MaterialDto,
  type PrepareResponse,
  type VisualsResponse,
  type VoiceResponse,
  MaterialPageDto,
} from '../../contracts';
import { MAX_UPLOAD_BYTES } from '../../business/domain/values';
import {
  AdminUploadIntentHandler,
  MoveMaterialHandler,
  PrepareMaterialsHandler,
  PublishMaterialsHandler,
  RemoveMaterialHandler,
  VisualsMaterialsHandler,
  VoiceMaterialsHandler,
} from '../../business/handlers/institutions/materials.handlers';
import { BatchesQuery } from '../../query/batches.query';
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

  /** The drop this file is part of, one id per drop, made by the client. */
  @IsOptional()
  @IsUUID('all')
  batchId?: string;
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

  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(LECTURE_STYLE_KEYS, { each: true })
  styles!: LectureStyle[];

  /** Prepare writes the words; the audio has its own route. */
  @IsOptional()
  @IsIn(['write'])
  stage?: 'write';
}

/** A batch, a selection, or one file to the voice. */
class VoiceDto {
  @IsOptional()
  @IsUUID('all')
  batchId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  documentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsIn(LECTURE_STYLE_KEYS, { each: true })
  styles?: LectureStyle[];

  /** Voice every page again, keeping the words: after a pronunciation was added. */
  @IsOptional()
  @IsBoolean()
  revoice?: boolean;
}

/** A batch, a selection, or one file to be drawn whole. */
class VisualsDto {
  @IsOptional()
  @IsUUID('all')
  batchId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  documentIds?: string[];
}

/** A batch, a selection, or one file published to the school's students, or hidden. */
class PublishDto {
  @IsOptional()
  @IsUUID('all')
  batchId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  documentIds?: string[];

  @IsBoolean()
  published!: boolean;
}

/** Many files into one course, or out of any, in one request. */
class MoveManyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  documentIds!: string[];

  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  courseId!: string | null;
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

  /** Publish to the school's students, or hide from them. */
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

/** A school's documents, as the admin uploads, arranges and prepares them. */
@Controller('admin/institutions/:id')
@UseGuards(AdminGuard)
export class AdminMaterialsController {
  constructor(
    private readonly materials: MaterialsQuery,
    private readonly intent: AdminUploadIntentHandler,
    private readonly move: MoveMaterialHandler,
    private readonly removeMaterial: RemoveMaterialHandler,
    private readonly prepare: PrepareMaterialsHandler,
    private readonly voice: VoiceMaterialsHandler,
    private readonly visuals: VisualsMaterialsHandler,
    private readonly publish: PublishMaterialsHandler,
    private readonly batches: BatchesQuery,
  ) {}

  /** A batch, a selection, or one file drawn whole: every page's visual tutorial. */
  @Post('visuals')
  @HttpCode(202)
  async drawMany(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: VisualsDto,
  ): Promise<VisualsResponse> {
    const { data } = await this.visuals.handle({
      userId,
      institutionId,
      ...body,
    });
    return data;
  }

  /** The admin's drops, newest first, each with its files' tallies and one state. */
  @Get('batches')
  async listBatches(
    @Param('id') institutionId: string,
  ): Promise<{ batches: BatchDto[] }> {
    return { batches: await this.batches.execute(institutionId) };
  }

  /** A batch, a selection, or one file to the voice, whole or not at all. */
  @Post('voice')
  @HttpCode(202)
  async voiceMany(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: VoiceDto,
  ): Promise<VoiceResponse> {
    const { data } = await this.voice.handle({
      userId,
      institutionId,
      ...body,
    });
    return data;
  }

  /** Published to the school's students, or hidden from them. */
  @Post('materials/publish')
  async publishMany(
    @Param('id') institutionId: string,
    @Body() body: PublishDto,
  ): Promise<{ ok: true; changed: number }> {
    const { data } = await this.publish.handle({ institutionId, ...body });
    return data;
  }

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

  /** A file removed from the school: the one door to deleting a school's document. */
  @Delete('materials/:documentId')
  async removeOne(
    @Param('id') institutionId: string,
    @Param('documentId') documentId: string,
  ): Promise<{ ok: true }> {
    const { data } = await this.removeMaterial.handle({
      institutionId,
      documentId,
    });
    return data;
  }

  /** The selected files into a course, or out of any: one request, one answer. */
  @Post('materials/move')
  async moveMany(
    @CurrentUser('id') userId: string,
    @Param('id') institutionId: string,
    @Body() body: MoveManyDto,
  ): Promise<{ ok: true; moved: number }> {
    let moved = 0;
    for (const documentId of body.documentIds) {
      await this.move.handle({
        userId,
        institutionId,
        documentId,
        courseId: body.courseId,
      });
      moved += 1;
    }
    return { ok: true, moved };
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
