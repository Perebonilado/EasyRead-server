import type { PipelineStep } from '../../contracts';
import type { LectureStyle, SegmentKind } from '../../contracts';

export interface PipelineJob {
  documentId: string;
  contentVersion: number;
}

export interface SimplifyJob extends PipelineJob {
  pageNumber: number;
}

export interface LectureChapterJob extends PipelineJob {
  topicId: string;
  orderIndex: number;
  style: LectureStyle;
  /** Write this page and the rest of the chapter first: a learner is waiting there. */
  startAtPage?: number;
  /** Where this chapter stands in the queue, lower sooner; set when preparing ahead of a learner. */
  priority?: number;
  /** False: write the words and ask for no audio. */
  voice?: boolean;
  /** The chapter's own retry of its failed pages, queued by the first run; never queues another. */
  secondPass?: boolean;
  /** How long to wait before running, for a second pass. */
  delayMs?: number;
  /** Which pass over pages that left paragraphs untaught this is; absent on the first write. */
  coveragePass?: number;
  /** How many times this pass has waited for a listener to leave a page it would write again. */
  listeningRetries?: number;
}

export interface LectureVoiceJob extends PipelineJob {
  pageNumber: number;
  style: LectureStyle;
  /** Omitted means the page itself. */
  kind?: SegmentKind;
}

export interface LectureAlignJob extends PipelineJob {
  pageNumber: number;
  style: LectureStyle;
  kind?: SegmentKind;
}

export interface LectureDiagramJob extends PipelineJob {
  topicId: string;
  pageNumber: number;
  style: LectureStyle;
}

export interface LectureBoardJob extends PipelineJob {
  pageNumber: number;
  style: LectureStyle;
  kind?: SegmentKind;
}

/** The follow-along track for one row. */
export interface VisualSceneJob extends PipelineJob {
  pageNumber: number;
  /** The chapter the page is in. */
  topicId: string;
  requestedBy: string;
  /** Lower goes first; the page the learner is on gets 1. */
  priority?: number;
}

export interface LectureFollowJob extends PipelineJob {
  pageNumber: number;
  style: LectureStyle;
  kind?: SegmentKind;
  priority?: number;
}

export interface ExportJob extends PipelineJob {
  exportId: string;
}

/**
 * Enqueuing is a port so handlers stay free of BullMQ, and so tests can assert
 * "this was enqueued" without Redis.
 */
export interface JobQueuePort {
  enqueueStep(
    step: Exclude<PipelineStep, 'export'>,
    job: PipelineJob,
  ): Promise<void>;
  enqueueSimplifyPages(jobs: SimplifyJob[]): Promise<void>;
  enqueueExport(job: ExportJob): Promise<void>;
  /** One job per chapter: plan its arc, then write its pages in order. */
  enqueueLectureChapters(jobs: LectureChapterJob[]): Promise<void>;
  /** One job per finished script: turn it into audio. */
  enqueueLectureVoices(jobs: LectureVoiceJob[]): Promise<void>;
  /** The page a learner has opened goes to the front of the voice queue, its part with it, if still waiting. */
  bumpLectureVoice(job: {
    documentId: string;
    contentVersion: number;
    pageNumber: number;
    style: LectureStyle;
  }): Promise<void>;
  /** One job per voiced row: measure where each word is heard. */
  enqueueLectureAligns(jobs: LectureAlignJob[]): Promise<void>;
  /** One job per figure the plan asked for. */
  enqueueLectureDiagrams(jobs: LectureDiagramJob[]): Promise<void>;
  /** One job per row that has words but no current board. */
  enqueueLectureBoards(jobs: LectureBoardJob[]): Promise<void>;
  /** Follow-along tracks, nearest the learner first when a priority is given. */
  enqueueLectureFollows(jobs: LectureFollowJob[]): Promise<void>;
  /** A chapter's scene; asking again for one being made changes nothing. */
  enqueueVisualScenes(jobs: VisualSceneJob[]): Promise<void>;
  /** Writes a document about a topic, then starts the normal pipeline. */
  enqueueLearn(job: PipelineJob): Promise<void>;
  /** Fetches an imported document's pages, then starts the normal pipeline. */
  enqueueImport(job: PipelineJob): Promise<void>;
  /** Raises priority for pages N..N+3 so the page being read lands first. */
  prioritise(input: {
    documentId: string;
    contentVersion: number;
    fromPage: number;
    toPage: number;
  }): Promise<void>;
}
