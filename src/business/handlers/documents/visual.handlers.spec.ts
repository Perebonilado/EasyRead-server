import { Document } from '../../domain/entities/document';
import { SCENE_GENERATOR_VERSION } from '../../domain/scene-script';
import type {
  JobQueuePort,
  VisualJobState,
  VisualSceneJob,
} from '../../ports/job-queue.port';
import type { VisualSceneRecord } from '../../repositories/visual.repository';
import { queueVisuals, type VisualsQueueDeps } from './visual.handlers';

const doc = new Document({
  id: 'd1',
  userId: 'u1',
  title: 'The Lantern Keeper',
  fileName: 'lantern.pdf',
  status: 'ready',
  pageCount: 4,
  sourceMimeType: 'application/pdf',
  sizeBytes: 1,
  source: 'uploaded',
  brief: null,
  sourceUrl: null,
  importManifest: null,
  originalFileRef: null,
  canonicalPdfRef: 'x',
  thumbnailRef: null,
  contentVersion: 1,
  simplificationUnavailable: false,
  failureReason: null,
  deletedAt: null,
  createdAt: new Date(),
  uploadBatchId: null,
  publishedAt: null,
  institutionId: null,
  departmentId: null,
  levelId: null,
  courseId: null,
  contentHash: null,
  orderIndex: 0,
});

const row = (
  page: number,
  status: VisualSceneRecord['status'],
): VisualSceneRecord => ({
  id: `r${page}`,
  documentId: 'd1',
  topicId: 't1',
  pageNumber: page,
  contentVersion: 1,
  generatorVersion: SCENE_GENERATOR_VERSION,
  status,
  step: null,
  fit: null,
  fitReason: null,
  error: null,
  attempts: 0,
  title: null,
  sceneKey: null,
  audioKey: null,
  thumbKey: null,
  timing: null,
  durationMs: null,
  requestedBy: 'u1',
  updatedAt: new Date(0),
});

describe('asking for pages to be made', () => {
  it('queues again a page on its way whose job was lost, and leaves one still carried', async () => {
    const rows = [row(1, 'done'), row(2, 'pending'), row(3, 'making')];
    const reset: string[] = [];
    const queued: VisualSceneJob[] = [];
    const deps = {
      topics: {
        listByDocument: () =>
          Promise.resolve([
            {
              id: 't1',
              title: 'One',
              shortDescription: null,
              startPage: 1,
              endPage: 4,
              orderIndex: 0,
            },
          ]),
      },
      pages: {
        findRange: () =>
          Promise.resolve(
            [1, 2, 3, 4].map((pageNumber) => ({
              pageNumber,
              text: 'x',
              charCount: 1,
              isEmpty: false,
              textSource: 'extracted',
            })),
          ),
      },
      visuals: {
        listByDocument: () => Promise.resolve(rows),
        ensure: (input: { pageNumber: number }) => {
          const found = rows.find((r) => r.pageNumber === input.pageNumber);
          return Promise.resolve(
            found
              ? { record: found, created: false }
              : { record: row(input.pageNumber, 'pending'), created: true },
          );
        },
        resetForRetry: (id: string) => {
          reset.push(id);
          return Promise.resolve();
        },
      },
      queue: {
        // Page 2's job was dropped; page 3's is running.
        visualSceneStates: (pages: { pageNumber: number }[]) =>
          Promise.resolve(
            pages.map((p): VisualJobState =>
              p.pageNumber === 2 ? { state: 'gone' } : { state: 'live' },
            ),
          ),
        enqueueVisualScenes: (jobs: VisualSceneJob[]) => {
          queued.push(...jobs);
          return Promise.resolve();
        },
      } as unknown as JobQueuePort,
    } as unknown as VisualsQueueDeps;
    const result = await queueVisuals(deps, {
      doc,
      userId: 'u1',
      mode: 'whole',
      fromPage: 1,
    });
    expect(queued.map((j) => j.pageNumber)).toEqual([2, 4]);
    expect(reset).toEqual(['r2']);
    expect(result).toEqual({ queued: 2, existing: 0 });
  });
});
