import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsString, Length } from 'class-validator';
import type {
  DocumentReportResponse,
  QuestionCheckResponse,
  RecallGradeResponse,
  TopicPreviewResponse,
  TranscribeResponse,
} from '../../contracts';
import {
  CheckQuestionAnswerHandler,
  GetTopicPreviewHandler,
  GradeRecallHandler,
  TranscribeAudioHandler,
} from '../../business/handlers/documents/guided.handlers';
import { GetDocumentReportHandler } from '../../business/handlers/documents/report.handlers';
import { ValidationError } from '../../business/domain/errors/errors';
import { CurrentUser } from '../security/current-user.decorator';

class RecallGradeDto {
  /** Typed or transcribed — by the time it arrives here it is just text. */
  @IsString()
  @Length(1, 8000)
  recall!: string;
}

class QuestionCheckDto {
  @IsString()
  @Length(1, 500)
  question!: string;

  @IsString()
  @Length(1, 4000)
  answer!: string;
}

/**
 * Guided reading's endpoints (guided-reading plan, Phase 0). POST throughout,
 * including the preview — it may generate on first call.
 */
@Controller('documents/:id')
export class GuidedController {
  constructor(
    private readonly preview: GetTopicPreviewHandler,
    private readonly gradeRecall: GradeRecallHandler,
    private readonly checkAnswer: CheckQuestionAnswerHandler,
    private readonly transcribeAudio: TranscribeAudioHandler,
    private readonly report: GetDocumentReportHandler,
  ) {}

  /**
   * How the reading went: chapter scores, what never came back, the
   * reader's own questions, what the tutor noticed. Composed at read time.
   */
  @Get('report')
  async documentReport(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
  ): Promise<DocumentReportResponse> {
    const result = await this.report.handle({ userId, documentId });
    return result.data;
  }

  /** The chapter preview — cached after the first generation. */
  @Post('topics/:topicId/preview')
  @HttpCode(201)
  async topicPreview(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('topicId') topicId: string,
  ): Promise<TopicPreviewResponse> {
    const result = await this.preview.handle({ userId, documentId, topicId });
    return result.data;
  }

  /** Grades a book-closed recall against the chapter itself. */
  @Post('topics/:topicId/recall-grade')
  @HttpCode(201)
  async recallGrade(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Param('topicId') topicId: string,
    @Body() body: RecallGradeDto,
  ): Promise<RecallGradeResponse> {
    const result = await this.gradeRecall.handle({
      userId,
      documentId,
      topicId,
      recall: body.recall,
    });
    return result.data;
  }

  /** Verdict on the reader answering their own pre-reading question. */
  @Post('question-check')
  @HttpCode(201)
  async questionCheck(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Body() body: QuestionCheckDto,
  ): Promise<QuestionCheckResponse> {
    const result = await this.checkAnswer.handle({
      userId,
      documentId,
      question: body.question,
      answer: body.answer,
    });
    return result.data;
  }

  /**
   * Speech-to-text for voice input. Raw audio bytes, no multipart — `raw()`
   * is mounted on this path in the bootstrap with the size cap, the same
   * arrangement as the upload path.
   */
  @Post('transcribe')
  @HttpCode(201)
  async transcribe(
    @CurrentUser('id') userId: string,
    @Param('id') documentId: string,
    @Req() request: Request,
  ): Promise<TranscribeResponse> {
    const body = request.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new ValidationError('No audio was sent');
    }

    const result = await this.transcribeAudio.handle({
      userId,
      documentId,
      audio: body,
      mimeType: request.headers['content-type'] ?? 'audio/webm',
    });
    return result.data;
  }
}
