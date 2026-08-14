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
  ListChatMessagesHandler,
  SendChatMessageHandler,
} from './business/handlers/documents/chat.handlers';
import { DocumentDetailQuery } from './query/document-detail.query';
import { DocumentListQuery } from './query/document-list.query';
import { ContinueStudyingQuery } from './query/continue-studying.query';
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
import { ExportsController } from './web/controllers/exports.controller';
import { HighlightController } from './web/controllers/highlight.controller';
import { ChatController } from './web/controllers/chat.controller';
import { LearnController } from './web/controllers/learn.controller';
import { ReaderController } from './web/controllers/reader.controller';
import { TutorsController } from './web/controllers/tutors.controller';
import { VoiceController } from './web/controllers/voice.controller';
import { DomainExceptionFilter } from './web/filters/domain-exception.filter';
import { AuthGuard } from './web/security/auth.guard';

const handlers = [
  RegisterHandler,
  LoginHandler,
  VerifyEmailHandler,
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
  RecordAssessmentHandler,
  GetMasteryHandler,
  UpdateLearnerProfileHandler,
  TutorIntroHandler,
  SendChatMessageHandler,
  ListChatMessagesHandler,
  InterviewHandler,
  GenerateDocumentHandler,
  ExpandDocumentHandler,
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
    AuthController,
    AccountController,
    DocumentsController,
    ReaderController,
    HighlightController,
    ChatController,
    LearnController,
    ExportsController,
    VoiceController,
    TutorsController,
    EventsController,
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
