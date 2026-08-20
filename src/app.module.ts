import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './core.module';
import { DeleteAccountHandler } from './business/handlers/identity/delete-account.handler';
import { ForgotPasswordHandler } from './business/handlers/identity/forgot-password.handler';
import { LoginHandler } from './business/handlers/identity/login.handler';
import { RegisterHandler } from './business/handlers/identity/register.handler';
import { ResetPasswordHandler } from './business/handlers/identity/reset-password.handler';
import { SessionService } from './business/handlers/identity/session.service';
import { ResendVerificationHandler } from './business/handlers/identity/resend-verification.handler';
import { VerifyEmailHandler } from './business/handlers/identity/verify-email.handler';
import {
  GetExportHandler,
  RequestExportHandler,
} from './business/handlers/documents/export.handlers';
import {
  HighlightHandler,
  ListLookupsHandler,
  VisualizeHandler,
} from './business/handlers/documents/highlight.handlers';
import {
  DeleteDocumentHandler,
  MarkTopicsHandler,
  PrioritisePagesHandler,
  RenameDocumentHandler,
  RetryPageHandler,
  SavePositionHandler,
  StartEasiestHandler,
} from './business/handlers/documents/reading.handlers';
import {
  UploadCompleteHandler,
  UploadIntentHandler,
} from './business/handlers/documents/upload.handlers';
import {
  DrawDiagramHandler,
  AskDiagramCheckHandler,
  ComputeHandler,
  GenerateTopicQuizHandler,
  DrawSketchHandler,
  PageAudioHandler,
  StartVoiceSessionHandler,
} from './business/handlers/documents/voice.handlers';
import {
  GetMasteryHandler,
  RecordAssessmentHandler,
  UpdateLearnerProfileHandler,
} from './business/handlers/documents/learning.handlers';
import { TutorIntroHandler } from './business/handlers/tutors/tutor-intro.handler';
import {
  ClarifyChatMessageHandler,
  ListChatMessagesHandler,
  SendChatMessageHandler,
} from './business/handlers/documents/chat.handlers';
import { DiscoverImportHandler } from './business/handlers/import/discover.handler';
import { StartImportHandler } from './business/handlers/import/start.handler';
import {
  GetPageAssetFileHandler,
  ListPageAssetsHandler,
} from './business/handlers/documents/assets.handlers';
import {
  CreateRecapHandler,
  ListRecapsHandler,
} from './business/handlers/documents/recap.handlers';
import {
  CheckQuestionAnswerHandler,
  GetTopicPreviewHandler,
  GradeRecallHandler,
  TranscribeAudioHandler,
} from './business/handlers/documents/guided.handlers';
import { GetDocumentReportHandler } from './business/handlers/documents/report.handlers';
import {
  CreateNoteHandler,
  DeleteNoteHandler,
  ListAllNotesHandler,
  ListNotesHandler,
  UpdateNoteHandler,
} from './business/handlers/documents/notes.handlers';
import { DocumentDetailQuery } from './query/document-detail.query';
import { DocumentListQuery } from './query/document-list.query';
import { ContinueStudyingQuery } from './query/continue-studying.query';
import { AdminController } from './web/controllers/admin.controller';
import { AdaptationEffectQuery } from './query/adaptation-effect.query';
import { AdaptationService } from './business/handlers/documents/adaptation.service';
import { RecordDwellHandler } from './business/handlers/documents/dwell.handlers';
import { StruggleRecorder } from './business/handlers/documents/struggle-recorder.service';
import {
  ExpandDocumentHandler,
  GenerateDocumentHandler,
  InterviewHandler,
} from './business/handlers/learn/learn.handlers';
import { MeQuery } from './query/me.query';
import { ReaderQuery } from './query/reader.query';
import { AccountController } from './web/controllers/account.controller';
import { AuthController } from './web/controllers/auth.controller';
import { DocumentsController } from './web/controllers/documents.controller';
import { EventsController } from './web/controllers/events.controller';
import { HealthController } from './web/controllers/health.controller';
import { ExportsController } from './web/controllers/exports.controller';
import { HighlightController } from './web/controllers/highlight.controller';
import { ChatController } from './web/controllers/chat.controller';
import { NotesController } from './web/controllers/notes.controller';
import { GroupsController } from './web/controllers/groups.controller';
import { SessionGateway } from './web/gateways/session.gateway';
import { GroupLessonFactory } from './web/gateways/group-lesson';
import {
  CreateGroupHandler,
  EndSessionHandler,
  GroupDetailHandler,
  JoinGroupHandler,
  ListGroupsHandler,
  RegenerateCodeHandler,
  RemoveMemberHandler,
  StartSessionHandler,
  UpdatePlanHandler,
  DeleteGroupHandler,
} from './business/handlers/groups/groups.handlers';
import { NotebookController } from './web/controllers/notebook.controller';
import { RecapsController } from './web/controllers/recaps.controller';
import { ImportController } from './web/controllers/import.controller';
import { LearnController } from './web/controllers/learn.controller';
import { ConceptsController } from './web/controllers/concepts.controller';
import { ReaderController } from './web/controllers/reader.controller';
import { TutorsController } from './web/controllers/tutors.controller';
import { VoiceController } from './web/controllers/voice.controller';
import { GuidedController } from './web/controllers/guided.controller';
import { DomainExceptionFilter } from './web/filters/domain-exception.filter';
import { AuthGuard } from './web/security/auth.guard';

const handlers = [
  RegisterHandler,
  CreateGroupHandler,
  JoinGroupHandler,
  ListGroupsHandler,
  GroupDetailHandler,
  RegenerateCodeHandler,
  RemoveMemberHandler,
  StartSessionHandler,
  UpdatePlanHandler,
  DeleteGroupHandler,
  EndSessionHandler,
  SessionGateway,
  GroupLessonFactory,
  LoginHandler,
  VerifyEmailHandler,
  ResendVerificationHandler,
  ForgotPasswordHandler,
  ResetPasswordHandler,
  DeleteAccountHandler,
  SessionService,
  UploadIntentHandler,
  UploadCompleteHandler,
  RenameDocumentHandler,
  DeleteDocumentHandler,
  PrioritisePagesHandler,
  StartEasiestHandler,
  RetryPageHandler,
  SavePositionHandler,
  MarkTopicsHandler,
  HighlightHandler,
  VisualizeHandler,
  ListLookupsHandler,
  RequestExportHandler,
  GetExportHandler,
  PageAudioHandler,
  StartVoiceSessionHandler,
  DrawDiagramHandler,
  AskDiagramCheckHandler,
  ComputeHandler,
  GenerateTopicQuizHandler,
  DrawSketchHandler,
  RecordAssessmentHandler,
  GetMasteryHandler,
  UpdateLearnerProfileHandler,
  TutorIntroHandler,
  SendChatMessageHandler,
  ListChatMessagesHandler,
  ClarifyChatMessageHandler,
  CreateNoteHandler,
  ListNotesHandler,
  ListAllNotesHandler,
  CreateRecapHandler,
  ListRecapsHandler,
  GetTopicPreviewHandler,
  GradeRecallHandler,
  CheckQuestionAnswerHandler,
  TranscribeAudioHandler,
  GetDocumentReportHandler,
  DiscoverImportHandler,
  StartImportHandler,
  ListPageAssetsHandler,
  GetPageAssetFileHandler,
  UpdateNoteHandler,
  DeleteNoteHandler,
  InterviewHandler,
  GenerateDocumentHandler,
  ExpandDocumentHandler,
  StruggleRecorder,
  AdaptationService,
  RecordDwellHandler,
  AdaptationEffectQuery,
];

const queries = [
  DocumentListQuery,
  DocumentDetailQuery,
  ReaderQuery,
  MeQuery,
  ContinueStudyingQuery,
];

/**
 * The API process. It enqueues work but never consumes it — the worker owns the
 * queues, so a slow model call can't tie up a request (§4.1).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // A blunt per-IP ceiling. The real spend controls are the plan limits;
    // this is only here to blunt credential stuffing and scripted abuse.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    CoreModule,
  ],
  controllers: [
    AdminController,
    AuthController,
    AccountController,
    DocumentsController,
    ReaderController,
    HighlightController,
    ChatController,
    NotesController,
    GroupsController,
    NotebookController,
    RecapsController,
    ImportController,
    LearnController,
    ConceptsController,
    ExportsController,
    VoiceController,
    GuidedController,
    TutorsController,
    EventsController,
    HealthController,
  ],
  providers: [
    ...handlers,
    ...queries,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
