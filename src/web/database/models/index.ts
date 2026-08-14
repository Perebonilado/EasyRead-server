export { AiCallLogModel } from './ai-call-log.model';
export { AssessmentEventModel } from './assessment-event.model';
export { ChatMessageModel } from './chat-message.model';
export { ConceptKnowledgeModel } from './concept-knowledge.model';
export { TopicPrerequisiteModel } from './topic-prerequisite.model';
export { LearnerProfileModel } from './learner-profile.model';
export { ProfileChangeModel } from './profile-change.model';
export { StruggleSignalModel } from './struggle-signal.model';
export { DocumentLearningStateModel } from './document-learning-state.model';
export { DocumentChunkModel } from './document-chunk.model';
export { DocumentPageModel } from './document-page.model';
export { DocumentSummaryModel } from './document-summary.model';
export { DocumentModel } from './document.model';
export { ExportModel } from './export.model';
export { HighlightLookupModel } from './highlight-lookup.model';
export { PipelineRunModel } from './pipeline-run.model';
export { ReadingPositionModel } from './reading-position.model';
export { RefreshTokenModel } from './refresh-token.model';
export { SimplifiedPageModel } from './simplified-page.model';
export { SubscriptionModel } from './subscription.model';
export { TopicReadStateModel } from './topic-read-state.model';
export { TopicModel } from './topic.model';
export { UsageCounterModel } from './usage-counter.model';
export { UserModel } from './user.model';
export { WebhookEventModel } from './webhook-event.model';

import { AiCallLogModel } from './ai-call-log.model';
import { AssessmentEventModel } from './assessment-event.model';
import { ChatMessageModel } from './chat-message.model';
import { ConceptKnowledgeModel } from './concept-knowledge.model';
import { TopicPrerequisiteModel } from './topic-prerequisite.model';
import { LearnerProfileModel } from './learner-profile.model';
import { ProfileChangeModel } from './profile-change.model';
import { StruggleSignalModel } from './struggle-signal.model';
import { DocumentLearningStateModel } from './document-learning-state.model';
import { DocumentChunkModel } from './document-chunk.model';
import { DocumentPageModel } from './document-page.model';
import { DocumentSummaryModel } from './document-summary.model';
import { DocumentModel } from './document.model';
import { ExportModel } from './export.model';
import { HighlightLookupModel } from './highlight-lookup.model';
import { PipelineRunModel } from './pipeline-run.model';
import { ReadingPositionModel } from './reading-position.model';
import { RefreshTokenModel } from './refresh-token.model';
import { SimplifiedPageModel } from './simplified-page.model';
import { SubscriptionModel } from './subscription.model';
import { TopicReadStateModel } from './topic-read-state.model';
import { TopicModel } from './topic.model';
import { UsageCounterModel } from './usage-counter.model';
import { UserModel } from './user.model';
import { WebhookEventModel } from './webhook-event.model';

/** Registered with SequelizeModule in both the API and the worker. */
export const ALL_MODELS = [
  UserModel,
  RefreshTokenModel,
  SubscriptionModel,
  UsageCounterModel,
  WebhookEventModel,
  DocumentModel,
  DocumentPageModel,
  DocumentSummaryModel,
  SimplifiedPageModel,
  TopicModel,
  TopicReadStateModel,
  ReadingPositionModel,
  ExportModel,
  HighlightLookupModel,
  PipelineRunModel,
  DocumentChunkModel,
  AiCallLogModel,
  AssessmentEventModel,
  LearnerProfileModel,
  ProfileChangeModel,
  StruggleSignalModel,
  DocumentLearningStateModel,
  ChatMessageModel,
  ConceptKnowledgeModel,
  TopicPrerequisiteModel,
];
