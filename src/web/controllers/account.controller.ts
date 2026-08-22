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
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  LearnerProfileDto,
  PlanDto,
  LocalAdaptationDto,
  ProfileChangeDto,
  StudyClockDto,
  SubscriptionResponse,
  VoiceBalanceDto,
} from '../../contracts';
import { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import {
  StudyHeartbeatDto,
  VoiceHeartbeatDto,
} from '../validation/metering.dto';
import { UpdateLearnerProfileHandler } from '../../business/handlers/documents/learning.handlers';
import {
  DOCUMENT_LEARNING_STATE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  PROFILE_CHANGE_REPOSITORY,
} from '../../business/repositories/tokens';
import { Inject } from '@nestjs/common';
import {
  DEFAULT_LEARNER_PROFILE,
  type DocumentLearningStateRepository,
  type LearnerProfileRepository,
  type ProfileChangeRepository,
} from '../../business/repositories/learning.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import { DeleteAccountHandler } from '../../business/handlers/identity/delete-account.handler';
import { MeQuery } from '../../query/me.query';
import { CurrentUser } from '../security/current-user.decorator';
import { Public } from '../security/public.decorator';

class LearnerProfileDtoBody {
  @IsOptional()
  @IsIn(['slower', 'steady', 'faster'])
  pace?: LearnerProfileDto['pace'];

  @IsOptional()
  @IsIn(['lighter', 'standard', 'deeper'])
  depth?: LearnerProfileDto['depth'];

  @IsOptional()
  @IsIn(['less', 'standard', 'more'])
  interactivity?: LearnerProfileDto['interactivity'];

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;

  /**
   * Who is writing. The settings screen sends `manual`, which pins each
   * changed dial against automatic adjustment; the lesson tool sends `tutor`.
   * Defaults to `manual` — this is a human-facing endpoint.
   */
  @IsOptional()
  @IsIn(['manual', 'tutor'])
  source?: 'manual' | 'tutor';

  /** Dials to release back to automatic adjustment. */
  @IsOptional()
  @IsArray()
  @IsIn(['pace', 'depth', 'interactivity'], { each: true })
  release?: ('pace' | 'depth' | 'interactivity')[];

  /** Erase the accumulated style notes. */
  @IsOptional()
  @IsIn([true, false])
  clearNotes?: boolean;
}

class ChangesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

@Controller()
export class AccountController {
  constructor(
    private readonly me: MeQuery,
    private readonly deleteAccount: DeleteAccountHandler,
    private readonly updateProfile: UpdateLearnerProfileHandler,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(PROFILE_CHANGE_REPOSITORY)
    private readonly changes: ProfileChangeRepository,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documents: DocumentRepository,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * The study clock's pulse. The client banks its active seconds here and
   * learns what is left, so the same call drives the quiet five-minute
   * warning and the wall.
   */
  @Post('study/heartbeat')
  @HttpCode(200)
  async studyHeartbeat(
    @CurrentUser('id') userId: string,
    @Body() body: StudyHeartbeatDto,
  ): Promise<StudyClockDto> {
    return this.entitlements.recordStudyTime(
      userId,
      body.seconds,
      body.tzOffsetMinutes,
    );
  }

  /** The voice wallet's pulse, for 1:1 calls the server cannot observe. */
  @Post('voice/heartbeat')
  @HttpCode(200)
  async voiceHeartbeat(
    @CurrentUser('id') userId: string,
    @Body() body: VoiceHeartbeatDto,
  ): Promise<VoiceBalanceDto> {
    await this.entitlements.recordVoiceSeconds(userId, body.seconds);
    return this.entitlements.voiceBalance(userId);
  }

  /** How this user learns — read into every lesson. */
  @Get('learner-profile')
  async learnerProfile(
    @CurrentUser('id') userId: string,
  ): Promise<LearnerProfileDto> {
    return (await this.profiles.find(userId)) ?? DEFAULT_LEARNER_PROFILE;
  }

  /** The adaptive loop's write channel — settings and the tutor's tool. */
  @Patch('learner-profile')
  async patchLearnerProfile(
    @CurrentUser('id') userId: string,
    @Body() body: LearnerProfileDtoBody,
  ): Promise<LearnerProfileDto> {
    const result = await this.updateProfile.handle({
      userId,
      ...body,
      source: body.source ?? 'manual',
    });
    return result.data;
  }

  /**
   * Adaptations that apply to one document only. Without these the settings
   * panel would describe a general profile the reader is not actually being
   * taught with.
   */
  @Get('learner-profile/local')
  async localAdaptations(
    @CurrentUser('id') userId: string,
  ): Promise<LocalAdaptationDto[]> {
    const states = await this.docStates.active(userId);
    if (!states.length) return [];
    // Few enough to name individually: a reader holds local adaptations in
    // the handful of documents they are actively working through.
    const docs = await Promise.all(
      states.map((state) =>
        this.documents.findById(state.documentId).catch(() => null),
      ),
    );
    return states.map((state, index) => ({
      documentId: state.documentId,
      documentTitle: docs[index]?.props.title ?? 'a document',
      paceDelta: state.paceDelta,
      depthDelta: state.depthDelta,
      reason: state.reason,
    }));
  }

  /** Undo a per-document adaptation the reader disagrees with. */
  @Delete('learner-profile/local/:documentId')
  @HttpCode(204)
  async clearLocalAdaptation(
    @CurrentUser('id') userId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    await this.docStates.upsert(userId, documentId, {
      paceDelta: 'none',
      depthDelta: 'none',
      reason: null,
    });
  }

  /** The recent history of how the app changed its teaching, with reasons. */
  @Get('learner-profile/changes')
  async profileChanges(
    @CurrentUser('id') userId: string,
    @Query() query: ChangesQueryDto,
  ): Promise<ProfileChangeDto[]> {
    const rows = await this.changes.list(userId, query.limit ?? 5);
    return rows.map((row) => ({
      id: row.id,
      field: row.field,
      fromValue: row.fromValue,
      toValue: row.toValue,
      source: row.source,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  @Get('subscription')
  async subscription(
    @CurrentUser('id') userId: string,
  ): Promise<SubscriptionResponse> {
    return this.me.subscription(userId);
  }

  /** Pricing is static, so the upgrade screen renders without a session. */
  @Public()
  @Get('plans')
  plans(): PlanDto[] {
    return this.me.plans();
  }

  @Delete('account')
  @HttpCode(204)
  async destroy(@CurrentUser('id') userId: string): Promise<void> {
    await this.deleteAccount.handle({ userId });
  }
}
