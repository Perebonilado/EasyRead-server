import type {
  JobQueuePort,
  VisualJobState,
  VisualSceneJob,
} from '../business/ports/job-queue.port';
import type {
  VisualSceneRecord,
  VisualSceneRepository,
} from '../business/repositories/visual.repository';
import { SCENE_GENERATOR_VERSION } from '../business/domain/scene-script';
import { QUEUE } from './queues';
import { VisualWatchdog, WATCH_AFTER_MS } from './visual-watchdog.service';

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

describe('the visual watchdog', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  const setup = (rows: VisualSceneRecord[], states: VisualJobState[]) => {
    const asked: { generatorVersion: string; before: Date }[] = [];
    const updates: [string, Partial<VisualSceneRecord>][] = [];
    const queued: VisualSceneJob[] = [];
    const visuals = {
      listUnfinished: (input: { generatorVersion: string; before: Date }) => {
        asked.push(input);
        return Promise.resolve(rows);
      },
      update: (id: string, patch: Partial<VisualSceneRecord>) => {
        updates.push([id, patch]);
        return Promise.resolve();
      },
    } as unknown as VisualSceneRepository;
    const queue = {
      visualSceneStates: () => Promise.resolve(states),
      enqueueVisualScenes: (jobs: VisualSceneJob[]) => {
        queued.push(...jobs);
        return Promise.resolve();
      },
    } as unknown as JobQueuePort;
    const watchdog = new VisualWatchdog(visuals, queue, {
      now: () => now,
    });
    return { watchdog, asked, updates, queued };
  };

  it('queues a page again when nothing carries it, marks one failed whose job failed, and leaves the rest', async () => {
    const { watchdog, asked, updates, queued } = setup(
      [row(1, 'pending'), row(2, 'making'), row(3, 'pending')],
      [
        { state: 'gone' },
        { state: 'live' },
        { state: 'failed', reason: 'The voice refused the page' },
      ],
    );
    expect(await watchdog.sweep()).toEqual({ requeued: 1, failed: 1 });
    // Only this generator's pages, and only those left alone a while.
    expect(asked[0].generatorVersion).toBe(SCENE_GENERATOR_VERSION);
    expect(asked[0].before.getTime()).toBe(now.getTime() - WATCH_AFTER_MS);
    expect(queued).toEqual([
      {
        documentId: 'd1',
        contentVersion: 1,
        pageNumber: 1,
        topicId: 't1',
        requestedBy: 'u1',
        priority: 1,
      },
    ]);
    expect(updates).toEqual([
      [
        'r3',
        { status: 'failed', step: null, error: 'The voice refused the page' },
      ],
    ]);
  });

  it('does nothing when every page is on its way', async () => {
    const { watchdog, updates, queued } = setup(
      [row(1, 'pending')],
      [{ state: 'live' }],
    );
    expect(await watchdog.sweep()).toEqual({ requeued: 0, failed: 0 });
    expect(queued).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('keeps the video queue to its own generator, so a worker of another cannot take its jobs', () => {
    expect(QUEUE.visualScene).toBe(`visual-${SCENE_GENERATOR_VERSION}`);
  });
});
