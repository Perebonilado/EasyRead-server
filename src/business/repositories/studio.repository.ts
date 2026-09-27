import type {
  SceneSheet,
  StudioBible,
  StudioBrief,
  StudioFormat,
  StudioOutline,
} from '../domain/studio/studio';
import type { SheetProblem } from '../domain/studio/studio-check';

/**
 * Where an episode has got to: its brief being talked through, its
 * outline waiting on the maker, its cast (a story's), its scenes written
 * and checked, or made into a film.
 */
export const EPISODE_PHASES = [
  'brief',
  'outline',
  'cast',
  'script',
  'made',
] as const;
export type EpisodePhase = (typeof EPISODE_PHASES)[number];

/** What an episode is busy with: writing its cast, its outline or its scenes, or making the film. */
export type EpisodeBusy = 'bible' | 'outline' | 'script' | 'scene' | 'make';

/** A scene: being written, written and checked, being made, made, or failed. */
export type StudioSceneStatus =
  'writing' | 'ready' | 'making' | 'made' | 'failed';

export interface StudioShowRecord {
  id: string;
  userId: string;
  title: string;
  format: StudioFormat | null;
  brief: StudioBrief;
  bible: StudioBible | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudioEpisodeRecord {
  id: string;
  showId: string;
  userId: string;
  number: number;
  title: string;
  logline: string | null;
  phase: EpisodePhase;
  busy: EpisodeBusy | null;
  error: string | null;
  outline: StudioOutline | null;
  shareToken: string | null;
  durationMs: number | null;
  thumbKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudioSceneRecord {
  id: string;
  episodeId: string;
  position: number;
  sheet: SceneSheet | null;
  sheetHash: string | null;
  problems: SheetProblem[];
  previousSheet: SceneSheet | null;
  status: StudioSceneStatus;
  step: string | null;
  error: string | null;
  sceneKey: string | null;
  audioKey: string | null;
  thumbKey: string | null;
  madeHash: string | null;
  durationMs: number | null;
  updatedAt: Date;
}

/** Something the Studio recorded in the thread: what happened, and the step it belongs to. */
export interface StudioEventRecord {
  what:
    | 'outline'
    | 'cast'
    | 'scenes'
    | 'scene'
    | 'made'
    | 'approved'
    | 'asked'
    | 'edited'
    | 'make'
    | 'shared'
    | 'episode'
    | 'failed'
    | 'checked';
  step: EpisodePhase;
  sceneId?: string;
  version?: number;
  line: string;
}

export interface StudioMessageRecord {
  id: string;
  showId: string;
  episodeId: string | null;
  role: 'user' | 'assistant';
  content: string;
  meta: {
    choices?: string[];
    action?: string;
    refused?: boolean;
    /** An event, not something said: the content is its line. */
    kind?: 'event';
    event?: StudioEventRecord;
    /**
     * A request that was checked and could not be shown yet, for us: what
     * was asked, why it still does not show, and the film before and after
     * in words. Never sent to the maker.
     */
    check?: {
      words: string;
      request: string;
      reason: string;
      before: string[];
      after: string[];
      faults: string[];
      tries: number;
    };
  } | null;
  createdAt: Date;
}

export interface StudioRepository {
  createShow(input: {
    userId: string;
    title: string;
    brief: StudioBrief;
  }): Promise<StudioShowRecord>;
  /** A show that is not deleted. */
  findShow(id: string): Promise<StudioShowRecord | null>;
  /** A maker's shows, the latest first. */
  listShows(userId: string): Promise<StudioShowRecord[]>;
  updateShow(
    id: string,
    patch: Partial<
      Pick<StudioShowRecord, 'title' | 'format' | 'brief' | 'bible'>
    >,
  ): Promise<void>;
  deleteShow(id: string, now: Date): Promise<void>;

  createEpisode(input: {
    showId: string;
    userId: string;
    number: number;
    title: string;
    phase: EpisodePhase;
  }): Promise<StudioEpisodeRecord>;
  findEpisode(id: string): Promise<StudioEpisodeRecord | null>;
  findEpisodeByShareToken(token: string): Promise<StudioEpisodeRecord | null>;
  listEpisodes(showId: string): Promise<StudioEpisodeRecord[]>;
  updateEpisode(
    id: string,
    patch: Partial<
      Pick<
        StudioEpisodeRecord,
        | 'title'
        | 'logline'
        | 'phase'
        | 'busy'
        | 'error'
        | 'outline'
        | 'shareToken'
        | 'durationMs'
        | 'thumbKey'
      >
    >,
  ): Promise<void>;
  /**
   * Claims an episode for a piece of work: sets `busy` only if nothing is
   * running on it now. False when something is.
   */
  claimEpisode(id: string, busy: EpisodeBusy): Promise<boolean>;

  /** An episode's scenes replaced: one row a scene of its new outline. */
  replaceScenes(episodeId: string, count: number): Promise<StudioSceneRecord[]>;
  listScenes(episodeId: string): Promise<StudioSceneRecord[]>;
  /** The scenes of several episodes at once, each episode's in order: one query for a list of shows. */
  listScenesOf(episodeIds: readonly string[]): Promise<StudioSceneRecord[]>;
  findScene(id: string): Promise<StudioSceneRecord | null>;
  updateScene(
    id: string,
    patch: Partial<
      Pick<
        StudioSceneRecord,
        | 'sheet'
        | 'sheetHash'
        | 'problems'
        | 'previousSheet'
        | 'status'
        | 'step'
        | 'error'
        | 'sceneKey'
        | 'audioKey'
        | 'thumbKey'
        | 'madeHash'
        | 'durationMs'
      >
    >,
  ): Promise<void>;
  /** A scene added at a position, the ones after it moved along. */
  insertScene(episodeId: string, position: number): Promise<StudioSceneRecord>;
  /** A scene taken out, the ones after it moved up. */
  removeScene(id: string): Promise<void>;
  /** How many scenes of a maker's are being made now. */
  makingFor(userId: string): Promise<number>;

  /**
   * A message added to a show's thread. Given an id already taken, the
   * message is there already: the one kept is returned, and nothing added.
   */
  addMessage(input: {
    id?: string;
    showId: string;
    episodeId: string | null;
    role: 'user' | 'assistant';
    content: string;
    meta?: StudioMessageRecord['meta'];
  }): Promise<StudioMessageRecord>;
  /**
   * A show's conversation, the latest `limit`, oldest first; with `before`
   * (a message's id), the latest of those that came before it.
   */
  listMessages(
    showId: string,
    limit?: number,
    before?: string,
  ): Promise<StudioMessageRecord[]>;
  /** How many messages a maker has sent since a moment: for the fair-use limit. */
  countUserMessagesSince(userId: string, since: Date): Promise<number>;
}
