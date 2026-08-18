import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  AssessmentKind,
  ComputeResponse,
  DiagramCheckResponse,
  DiagramResponse,
  MasteryResponse,
  SketchResponse,
  VoiceMode,
  VoiceSessionResponse,
} from '../../contracts';
import {
  AskDiagramCheckHandler,
  ComputeHandler,
  DrawDiagramHandler,
  GenerateTopicQuizHandler,
  type TopicQuizResponse,
  DrawSketchHandler,
  PageAudioHandler,
  StartVoiceSessionHandler,
  type AudioLevel,
} from '../../business/handlers/documents/voice.handlers';
import {
  GetMasteryHandler,
  RecordAssessmentHandler,
} from '../../business/handlers/documents/learning.handlers';
import { RecordDwellHandler } from '../../business/handlers/documents/dwell.handlers';
import { ValidationError } from '../../business/domain/errors/errors';
import { STORAGE } from '../../business/ports/tokens';
import type { StoragePort } from '../../business/ports/storage.port';
import { CurrentUser } from '../security/current-user.decorator';

const AUDIO_LEVELS: AudioLevel[] = ['original', 'standard', 'easiest'];

class VoiceSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageNumber!: number;

  @IsOptional()
  @IsIn(['chat', 'teach'])
  mode?: VoiceMode;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  tutorId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  revisitTopicId?: string;
}

class DiagramDto {
  @IsString()
  @Length(3, 300)
  description!: string;
}

class SketchDto {
  @IsString()
  @Length(3, 300)
  description!: string;
}

class ComputeDto {
  @IsString()
  @Length(1, 500)
  expression!: string;

  @IsOptional()
  @IsObject()
  scope?: Record<string, number>;
}

class AssessmentDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  topicId?: string;

  @IsIn(['mcq', 'flashcard', 'verbal'])
  kind!: AssessmentKind;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  score!: number;

  @IsOptional()
  payload?: unknown;
}

class DwellVisitDto {
  @IsInt()
  @Min(1)
  page!: number;

  @IsIn(['original', 'standard', 'easiest'])
  level!: 'original' | 'standard' | 'easiest';

  @IsInt()
  @Min(0)
  ms!: number;
}

class DwellDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DwellVisitDto)
  visits!: DwellVisitDto[];
}

@Controller('documents/:id')
export class VoiceController {
  constructor(
    private readonly pageAudio: PageAudioHandler,
    private readonly startSession: StartVoiceSessionHandler,
    private readonly drawDiagram: DrawDiagramHandler,
    private readonly drawSketch: DrawSketchHandler,
    private readonly compute: ComputeHandler,
    private readonly diagramCheck: AskDiagramCheckHandler,
    private readonly topicQuiz: GenerateTopicQuizHandler,
    private readonly recordAssessment: RecordAssessmentHandler,
    private readonly recordDwell: RecordDwellHandler,
    private readonly getMastery: GetMasteryHandler,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /**
   * The page read aloud. Synthesises on first request, then serves the cached
   * file; the client fetches it with the session's token and plays a blob URL,
   * so no Range support is needed here.
   */
  @Get('audio/:level/:page')
  async audio(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('level') level: string,
    @Param('page') page: string,
    @Res() response: Response,
  ): Promise<void> {
    // Validated by hand: a whole-object @Param() DTO would also receive the
    // route's :id and be rejected by the global whitelist.
    if (!AUDIO_LEVELS.includes(level as AudioLevel)) {
      throw new ValidationError('Unknown audio level');
    }
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new ValidationError('That page number is not valid');
    }

    const { data } = await this.pageAudio.handle({
      userId,
      documentId,
      level: level as AudioLevel,
      pageNumber,
    });

    const { stream, size } = await this.storage.stream(data.fileRef);
    response.setHeader('Content-Type', data.mimeType);
    response.setHeader('Content-Length', size);
    // The file is immutable for its key — the key changes when anything that
    // would alter the audio does — so the browser may keep it.
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.pipe(response);
  }

  /** Mints the short-lived credentials for a voice conversation. */
  @Post('voice-session')
  @HttpCode(201)
  async voiceSession(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: VoiceSessionDto,
  ): Promise<VoiceSessionResponse> {
    const result = await this.startSession.handle({
      userId,
      documentId,
      pageNumber: body.pageNumber,
      mode: body.mode ?? 'chat',
      tutorId: body.tutorId,
      revisitTopicId: body.revisitTopicId,
    });
    return result.data;
  }

  /** A grounded flowchart for the lesson board (teach mode's pencil). */
  @Post('diagram')
  @HttpCode(201)
  async diagram(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: DiagramDto,
  ): Promise<DiagramResponse> {
    const result = await this.drawDiagram.handle({
      userId,
      documentId,
      description: body.description,
    });
    return result.data;
  }

  /** A grounded free-form sketch for the lesson board. */
  @Post('sketch')
  @HttpCode(201)
  async sketch(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: SketchDto,
  ): Promise<SketchResponse> {
    const result = await this.drawSketch.handle({
      userId,
      documentId,
      description: body.description,
    });
    return result.data;
  }

  /** Self-serve checks for solo study: fresh MCQs on one chapter. */
  @Post('topics/:topicId/quiz')
  @HttpCode(201)
  async topicQuizRoute(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('topicId') topicId: string,
  ): Promise<TopicQuizResponse> {
    const result = await this.topicQuiz.handle({
      userId,
      documentId,
      topicId,
    });
    return result.data;
  }

  /** A diagram with one "?" node — the visual check the student completes. */
  @Post('diagram-check')
  @HttpCode(201)
  async diagramCheckRoute(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: SketchDto,
  ): Promise<DiagramCheckResponse> {
    const result = await this.diagramCheck.handle({
      userId,
      documentId,
      description: body.description,
    });
    return result.data;
  }

  /** Verified arithmetic — the tutor never does its own sums. */
  @Post('compute')
  @HttpCode(201)
  async computeExpression(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: ComputeDto,
  ): Promise<ComputeResponse> {
    const result = await this.compute.handle({
      userId,
      documentId,
      expression: body.expression,
      scope: body.scope,
    });
    return result.data;
  }

  /** One answered quiz, flashcard or tutor rating — the loop's raw signal. */
  @Post('assessments')
  @HttpCode(201)
  async assessment(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: AssessmentDto,
  ): Promise<{ profileAdjusted: boolean }> {
    const result = await this.recordAssessment.handle({
      userId,
      documentId,
      topicId: body.topicId ?? null,
      kind: body.kind,
      score: body.score,
      payload: body.payload,
    });
    return result.data;
  }

  /**
   * Reading time, already interpreted. The client sends closed page visits;
   * the server decides whether any of them meant anything and keeps only
   * that verdict.
   */
  @Post('dwell')
  @HttpCode(200)
  async dwell(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: DwellDto,
  ): Promise<{ stuckOnPage: number | null }> {
    const result = await this.recordDwell.handle({
      userId,
      documentId,
      visits: body.visits,
    });
    return result.data;
  }

  /** Per-topic understanding, plus a tutor worth trying for the revisit. */
  @Get('mastery')
  async mastery(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Query('tutor') tutor?: string,
  ): Promise<MasteryResponse> {
    const result = await this.getMastery.handle({
      userId,
      documentId,
      currentTutorId: tutor,
    });
    return result.data;
  }
}
