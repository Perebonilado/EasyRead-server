import type { Provider } from '@nestjs/common';
import {
  AI_CALL_LOG_REPOSITORY,
  ASSESSMENT_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  EXPORT_REPOSITORY,
  LOOKUP_REPOSITORY,
  PIPELINE_RUN_REPOSITORY,
  READING_POSITION_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUBSCRIPTION_REPOSITORY,
  SUMMARY_REPOSITORY,
  TOPIC_REPOSITORY,
  USAGE_REPOSITORY,
  USER_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from '../../business/repositories/tokens';
import { SequelizeAiCallLogRepository } from '../repositories/sequelize-ai-call-log.repository';
import {
  SequelizeAssessmentRepository,
  SequelizeLearnerProfileRepository,
} from '../repositories/sequelize-learning.repositories';
import {
  SequelizeSubscriptionRepository,
  SequelizeUsageRepository,
  SequelizeWebhookEventRepository,
} from '../repositories/sequelize-billing.repositories';
import { SequelizeDocumentPageRepository } from '../repositories/sequelize-document-page.repository';
import { SequelizeDocumentRepository } from '../repositories/sequelize-document.repository';
import {
  SequelizeExportRepository,
  SequelizeLookupRepository,
  SequelizeReadingPositionRepository,
  SequelizeSummaryRepository,
  SequelizeTopicRepository,
} from '../repositories/sequelize-misc.repositories';
import { SequelizePipelineRunRepository } from '../repositories/sequelize-pipeline.repository';
import { SequelizeRefreshTokenRepository } from '../repositories/sequelize-refresh-token.repository';
import { SequelizeSimplifiedPageRepository } from '../repositories/sequelize-simplified-page.repository';
import { SequelizeUserRepository } from '../repositories/sequelize-user.repository';

/**
 * Binds every repository interface to its Sequelize implementation.
 *
 * Business code depends on the interface and the symbol; nothing above this
 * file knows Sequelize exists, which is what keeps the domain testable without
 * a database.
 */
export const repositoryProviders: Provider[] = [
  { provide: USER_REPOSITORY, useClass: SequelizeUserRepository },
  {
    provide: REFRESH_TOKEN_REPOSITORY,
    useClass: SequelizeRefreshTokenRepository,
  },
  { provide: DOCUMENT_REPOSITORY, useClass: SequelizeDocumentRepository },
  {
    provide: DOCUMENT_PAGE_REPOSITORY,
    useClass: SequelizeDocumentPageRepository,
  },
  {
    provide: SIMPLIFIED_PAGE_REPOSITORY,
    useClass: SequelizeSimplifiedPageRepository,
  },
  { provide: SUMMARY_REPOSITORY, useClass: SequelizeSummaryRepository },
  { provide: TOPIC_REPOSITORY, useClass: SequelizeTopicRepository },
  {
    provide: READING_POSITION_REPOSITORY,
    useClass: SequelizeReadingPositionRepository,
  },
  { provide: EXPORT_REPOSITORY, useClass: SequelizeExportRepository },
  { provide: LOOKUP_REPOSITORY, useClass: SequelizeLookupRepository },
  {
    provide: PIPELINE_RUN_REPOSITORY,
    useClass: SequelizePipelineRunRepository,
  },
  {
    provide: SUBSCRIPTION_REPOSITORY,
    useClass: SequelizeSubscriptionRepository,
  },
  { provide: USAGE_REPOSITORY, useClass: SequelizeUsageRepository },
  {
    provide: WEBHOOK_EVENT_REPOSITORY,
    useClass: SequelizeWebhookEventRepository,
  },
  { provide: AI_CALL_LOG_REPOSITORY, useClass: SequelizeAiCallLogRepository },
  { provide: ASSESSMENT_REPOSITORY, useClass: SequelizeAssessmentRepository },
  {
    provide: LEARNER_PROFILE_REPOSITORY,
    useClass: SequelizeLearnerProfileRepository,
  },
];
