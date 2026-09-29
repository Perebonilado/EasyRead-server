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
/** Where a page's job stands in the queue. */
export type VisualJobState =
  { state: 'live' } | { state: 'gone' } | { state: 'failed'; reason: string };

export interface VisualSceneJob extends PipelineJob {
  pageNumber: number;
  /** The chapter the page is in. */
  topicId: string;
  requestedBy: string;
  /** Lower goes first; the page the learner is on gets 1. */
  priority?: number;
  /**
   * Make a page that is already made again, keeping it playable until
   * the new one is ready: a book whose people are drawn anew (scene:recast).
   */
  remake?: boolean;
}

export interface LectureFollowJob extends PipelineJob {
  pageNumber: number;
  style: LectureStyle;
  kind?: SegmentKind;
  priority?: number;
}

/**
 * A maker's request for a change to a scene that was made, carried with
 * the work it sets going (written again, made again, checked): so what
 * comes of it is checked against the film, and said honestly, once.
 */
export interface StudioAsk {
  /** Its own id: the message it came in, else one of its own. What the thread records of it is keyed by it. */
  id: string;
  /** The maker's own words. */
  words: string;
  /** What the producer took them to ask for. */
  request: string;
  /** The first try, or the Studio's one try again. */
  tries: 1 | 2;
  /** Every scene the maker's words asked about at once, by number: each is checked only for what they ask of it. */
  of?: number[];
  /** The film as it was before the change, in words from what it plays, and the same without its times. */
  before?: { key: string; lines: string[] } | null;
  /** What the check found still wrong, for the writer's second try. */
  problems?: string[];
  /** What the first try's check told the maker the film shows: said again if the second try changes nothing. */
  tell?: string;
  /** What the second try's sheet has besides, for what the check found: clothes someone wears from the start. */
  remedy?: { wear?: { who: string; thing: string }[] };
  /** Made again without spending the maker's film: the Studio's own try again. */
  free?: boolean;
  /**
   * The Studio's own try again at what its picture check found wrong
   * (studio-scenery-plan §8.6), not at a maker's words: quiet in the
   * thread, and not checked as a maker's ask is.
   */
  picture?: true;
}

/** A piece of the Studio's work on one episode. */
export interface StudioJob {
  kind:
    | 'bible'
    | 'outline'
    | 'script'
    | 'scene'
    | 'prepare'
    | 'make'
    | 'draw'
    | 'redraw';
  /** For 'draw': the characters the artist draws at the cast step; for 'redraw', the one drawn again as the maker asks. */
  characterIds?: string[];
  characterId?: string;
  showId: string;
  episodeId: string;
  userId: string;
  sceneId?: string;
  /** For 'prepare': the scenes to make once the cast and the places are drawn. */
  sceneIds?: string[];
  request?: string;
  /** For 'outline': the request is for the story itself (the Story step), developed again before the outline. */
  story?: boolean;
  /** A maker's request for a change to a made scene: written, made again and checked. */
  ask?: StudioAsk;
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
  /**
   * Whether each page still has a job carrying it: live (waiting, running,
   * or due to be tried again), gone (none, or one finished without making
   * the page), or failed for good, with why.
   */
  visualSceneStates(
    pages: Pick<
      VisualSceneJob,
      'documentId' | 'contentVersion' | 'pageNumber'
    >[],
  ): Promise<VisualJobState[]>;
  /** Writes a document about a topic, then starts the normal pipeline. */
  enqueueLearn(job: PipelineJob): Promise<void>;
  /** The Studio's work: a cast, an outline, an episode's scenes, a scene written again or made. */
  enqueueStudio(jobs: StudioJob[]): Promise<void>;
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
