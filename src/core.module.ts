import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from './auth/jwt.service';
import { PasswordService } from './auth/password.service';
import { TokenGenerator } from './auth/token-generator';
import { ComputeService } from './business/handlers/documents/compute.service';
import { DocumentAccessService } from './business/handlers/documents/document-access.service';
import { EntitlementsService } from './business/handlers/documents/entitlements.service';
import { SchoolAccessService } from './business/handlers/institutions/school-access.service';
import {
  GenerateLectureHandler,
  LectureStatusHandler,
} from './business/handlers/documents/lecture.handlers';
import { PronunciationSeeder } from './business/handlers/institutions/pronunciation.handlers';
import { SceneVoiceService } from './business/handlers/admin/scene-voice.service';
import { PipelineOrchestrator } from './pipeline/orchestrator.service';
import { DatabaseModule } from './web/database/database.module';
import { portProviders } from './web/providers/ports.providers';
import { repositoryProviders } from './web/providers/repositories.providers';

const shared = [
  ...portProviders,
  ...repositoryProviders,
  JwtService,
  PasswordService,
  TokenGenerator,
  ComputeService,
  DocumentAccessService,
  EntitlementsService,
  SchoolAccessService,
  // The orchestrator writes a school document's lecture at upload, in both
  // processes, so the handler that does it lives here with it.
  LectureStatusHandler,
  GenerateLectureHandler,
  PronunciationSeeder,
  // Visualize's voice as the admin chose it: set by the API, read by the worker.
  SceneVoiceService,
  PipelineOrchestrator,
];

/**
 * Everything both processes need: the database, the ports, the repositories and
 * the services that sit directly on them.
 *
 * The API and the worker are separate bootstraps with different controllers and
 * queue consumers, but they resolve the same domain from here — so a rule can't
 * be enforced in one and forgotten in the other.
 */
@Global()
@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: shared,
  exports: [...shared, DatabaseModule],
})
export class CoreModule {}
