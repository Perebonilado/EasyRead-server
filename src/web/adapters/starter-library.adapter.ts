import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import type { StarterLibraryPort } from '../../business/ports/starter-library.port';
import type { StoragePort } from '../../business/ports/storage.port';
import { STORAGE } from '../../business/ports/tokens';
import { DocumentChunkModel } from '../database/models/document-chunk.model';
import { DocumentModel } from '../database/models/document.model';
import { DocumentPageModel } from '../database/models/document-page.model';
import { DocumentSummaryModel } from '../database/models/document-summary.model';
import { PageAssetModel } from '../database/models/page-asset.model';
import { SimplifiedPageModel } from '../database/models/simplified-page.model';
import { TopicModel } from '../database/models/topic.model';
import { TopicPrerequisiteModel } from '../database/models/topic-prerequisite.model';
import { newId } from '../database/uuid';

/** Strips a row to plain column values, dropping what a copy must not keep. */
function plain<T extends { get: (o: { plain: true }) => unknown }>(row: T) {
  const values = { ...(row.get({ plain: true }) as Record<string, unknown>) };
  delete values.id;
  delete values.createdAt;
  delete values.updatedAt;
  return values;
}

/**
 * The starter document, copied into a new account (see the port).
 *
 * A deep snapshot of everything the reader needs — pages, simplified text,
 * chapters and their assumptions, the summary, figures, the chat's chunk
 * embeddings — and fresh copies of the stored files, because the purge job
 * that follows a delete removes files by reference and a shared file would
 * make one reader's delete everyone's loss. What is deliberately NOT copied:
 * anything a reader produces (notes, chat, checks, positions) and pure
 * caches (previews regenerate on first touch).
 */
@Injectable()
export class StarterLibraryAdapter implements StarterLibraryPort {
  private readonly logger = new Logger(StarterLibraryAdapter.name);

  constructor(
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly config: ConfigService,
    @InjectModel(DocumentModel)
    private readonly documents: typeof DocumentModel,
    @InjectModel(DocumentPageModel)
    private readonly pages: typeof DocumentPageModel,
    @InjectModel(SimplifiedPageModel)
    private readonly simplified: typeof SimplifiedPageModel,
    @InjectModel(DocumentSummaryModel)
    private readonly summaries: typeof DocumentSummaryModel,
    @InjectModel(PageAssetModel)
    private readonly assets: typeof PageAssetModel,
    @InjectModel(DocumentChunkModel)
    private readonly chunks: typeof DocumentChunkModel,
    @InjectModel(TopicModel)
    private readonly topics: typeof TopicModel,
    @InjectModel(TopicPrerequisiteModel)
    private readonly prerequisites: typeof TopicPrerequisiteModel,
  ) {}

  async copyToUser(userId: string): Promise<void> {
    const sourceId = this.config.get<string>('STARTER_DOCUMENT_ID');
    if (!sourceId) return;

    const source = await this.documents.findOne({
      where: { id: sourceId, status: 'ready', deletedAt: null } as never,
    });
    if (!source) {
      this.logger.warn(
        `STARTER_DOCUMENT_ID=${sourceId} is not a ready document; skipping seed`,
      );
      return;
    }

    const docId = newId();

    const copyFile = async (ref: string | null, name: string) => {
      if (!ref) return null;
      const key = `documents/${docId}/${name}`;
      const body = await this.storage.get(ref);
      const stored = await this.storage.put({
        key,
        body,
        mimeType: name.endsWith('.png') ? 'image/png' : 'application/pdf',
      });
      return stored.ref;
    };

    await this.documents.create({
      ...plain(source),
      id: docId,
      userId,
      source: 'starter',
      originalFileRef: await copyFile(source.originalFileRef, 'original'),
      canonicalPdfRef: await copyFile(source.canonicalPdfRef, 'canonical.pdf'),
      thumbnailRef: await copyFile(source.thumbnailRef, 'thumbnail.png'),
    } as never);

    const where = { where: { documentId: sourceId } as never };
    const rebase = (row: { get: (o: { plain: true }) => unknown }) => ({
      ...plain(row),
      id: newId(),
      documentId: docId,
    });

    await this.pages.bulkCreate(
      (await this.pages.findAll(where)).map(rebase) as never,
    );
    await this.simplified.bulkCreate(
      (await this.simplified.findAll(where)).map(rebase) as never,
    );
    await this.summaries.bulkCreate(
      (await this.summaries.findAll(where)).map(rebase) as never,
    );
    await this.chunks.bulkCreate(
      (await this.chunks.findAll(where)).map(rebase) as never,
    );

    // Figures are stored files of their own; each copy gets its own object.
    const sourceAssets = await this.assets.findAll(where);
    for (const asset of sourceAssets) {
      await this.assets.create({
        ...rebase(asset),
        fileRef: await copyFile(
          asset.fileRef,
          `asset-${asset.pageNumber}-${asset.orderIndex}.png`,
        ),
      } as never);
    }

    // Topics carry an id remap: prerequisites point at topics on both ends.
    const sourceTopics = await this.topics.findAll(where as never);
    const topicIdMap = new Map<string, string>();
    for (const topic of sourceTopics) topicIdMap.set(topic.id, newId());
    if (sourceTopics.length) {
      await this.topics.bulkCreate(
        sourceTopics.map((topic) => ({
          ...plain(topic),
          id: topicIdMap.get(topic.id),
          documentId: docId,
        })) as never,
      );
      const sourcePrereqs = await this.prerequisites.findAll({
        where: { topicId: [...topicIdMap.keys()] } as never,
      });
      if (sourcePrereqs.length) {
        await this.prerequisites.bulkCreate(
          sourcePrereqs.map((prereq) => ({
            ...plain(prereq),
            id: newId(),
            topicId: topicIdMap.get(prereq.topicId),
            coveredByTopicId: prereq.coveredByTopicId
              ? (topicIdMap.get(prereq.coveredByTopicId) ?? null)
              : null,
          })) as never,
        );
      }
    }

    this.logger.log(`Seeded starter document ${docId} for user ${userId}`);
  }
}
