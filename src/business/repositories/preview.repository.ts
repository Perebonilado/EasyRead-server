import type { TopicPreviewBody } from '../../contracts';

/**
 * Cached chapter previews (guided reading).
 *
 * A preview derives from the document alone, so there is exactly one per
 * topic and it serves every reader — generated on first request, free after.
 */
export interface TopicPreviewRepository {
  find(topicId: string): Promise<TopicPreviewBody | null>;

  save(input: {
    documentId: string;
    topicId: string;
    body: TopicPreviewBody;
  }): Promise<void>;
}
