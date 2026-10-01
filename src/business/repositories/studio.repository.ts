import type {
  SceneSheet,
  StudioBible,
  StudioBrief,
  StudioFormat,
  StudioOutline,
} from '../domain/studio/studio';
import type { SheetProblem } from '../domain/studio/studio-check';
import type { DocumentPick } from '../domain/studio/studio-document';
import type { StudioEditor } from '../domain/studio/studio-editor';
import type { StudioEditorial } from '../domain/studio/studio-editorial';
import type { FilmShape } from '../domain/scene-shape';

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

/**
 * What an episode is busy with: writing its cast, developing its story,
 * its outline or its scenes, or making the film; and the editor's desk
 * (studio-editor): the show's questions, research, plan and world, worked
 * on its first episode, and an episode's script edited.
 */
export type EpisodeBusy =
  | 'bible'
  | 'story'
  | 'outline'
  | 'script'
  | 'scene'
  | 'make'
  | 'angles'
  | 'research'
  | 'plan'
  | 'world'
  | 'edit';

/** A scene: being written, written and checked, being made, made, or failed. */
export type StudioSceneStatus =
  'writing' | 'ready' | 'making' | 'made' | 'failed';

/**
 * What is happening to an episode or a scene now, in plain words, kept
 * on its row while its job runs and cleared when the job ends: the step
 * ("Reading the whole script"), and a call that failed and is being tried
 * again ("The writer is busy, trying again (2 of 3)").
 */
export interface StudioActivity {
  /** What is being done; null while only a retry is to say. */
  says: string | null;
  /** A word for a scene's row: "Rewriting", "Shortening", "Fixing", "Checking". */
  short?: string;
  retry?: {
    /** The whole line: "The writer is busy, trying again (2 of 3)". */
    says: string;
    /** Why, alone: "The writer is busy". */
    reason: string;
    attempt?: number;
    of?: number;
    waitSeconds?: number;
    /** Given up on that call: said until the work moves on. */
    final?: boolean;
  };
  /** A scene's sheet when it was said: once the sheet changes, it no longer holds. */
  sheetHash?: string | null;
  /** When it was said, ISO. */
  at: string;
}

export interface StudioShowRecord {
  id: string;
  userId: string;
  title: string;
  format: StudioFormat | null;
  brief: StudioBrief;
  bible: StudioBible | null;
  /** The document given to it in the chat, if any. */
  documentId?: string | null;
  /** An explainer the editor plans (studio-editor); null or absent for a story and a show made before the editor. */
  editor?: StudioEditor | null;
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
  /** What is happening to it now (studio-progress); null when nothing is said. */
  activity?: StudioActivity | null;
  /** The pages of the show's document it teaches (studio-document); absent or null for none. */
  pages?: DocumentPick | null;
  /** The shape its film is made in (studio-vertical-plan): exactly one; absent or wide for every episode made before shapes. */
  shape?: FilmShape;
  /** The episode it is the twin of, in the other shape: that one's script and voice are its. Absent or null for an episode of its own. */
  twinOf?: string | null;
  /** An episode the editor wrote (studio-editorial); null or absent otherwise. */
  editorial?: StudioEditorial | null;
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
  /** What is happening to it now (studio-progress); null when nothing is said. */
  activity?: StudioActivity | null;
  /** A twin episode's scene: the scene of the episode it is the twin of that it is the same scene of. */
  twinOf?: string | null;
  updatedAt: Date;
}

/** Something the Studio recorded in the thread: what happened, and the step it belongs to. */
export interface StudioEventRecord {
  what:
    | 'story'
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
    | 'checked'
    | 'document'
    | 'pages'
    // The editor's desk: the questions offered, the research done, the
    // show planned, its world drawn up, an episode's script written.
    | 'angles'
    | 'research'
    | 'plan'
    | 'world'
    | 'editorial';
  /** The step it belongs to: a phase, or the story's own step (the Story card), which no episode's phase is. */
  step: EpisodePhase | 'story';
  sceneId?: string;
  /** The character it is about: new drawings of them to choose from, in the thread. */
  characterId?: string;
  /** The document it is about: its card, and the card to choose its pages. */
  documentId?: string;
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
    /** A second, optional row of choices, picked with the first (what the audience knows already). */
    also?: string[];
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
    /** A show the editor will plan once it is an explainer (STUDIO_EDITOR). */
    editor?: StudioEditor | null;
  }): Promise<StudioShowRecord>;
  /** A show that is not deleted. */
  findShow(id: string): Promise<StudioShowRecord | null>;
  /** A maker's shows, the latest first. */
  listShows(userId: string): Promise<StudioShowRecord[]>;
  updateShow(
    id: string,
    patch: Partial<
      Pick<
        StudioShowRecord,
        'title' | 'format' | 'brief' | 'bible' | 'documentId' | 'editor'
      >
    >,
  ): Promise<void>;
  deleteShow(id: string, now: Date): Promise<void>;

  createEpisode(input: {
    showId: string;
    userId: string;
    number: number;
    title: string;
    phase: EpisodePhase;
    /** The pages of the show's document it teaches. */
    pages?: DocumentPick | null;
    /** The shape its film is made in; absent, wide. */
    shape?: FilmShape;
    /** The episode it is the twin of (its number and title are that one's). */
    twinOf?: string | null;
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
        | 'pages'
        | 'shape'
        | 'editorial'
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
  /**
   * A twin episode's scenes kept in step with the scenes of the episode it
   * is the twin of (`lead`, in order): one each, at the same position,
   * with its sheet; a twin's scene whose scene is gone is taken out, and
   * one made keeps its film. Its scenes, in order.
   */
  syncTwinScenes(
    twinEpisodeId: string,
    lead: readonly Pick<StudioSceneRecord, 'id' | 'position' | 'sheet'>[],
  ): Promise<StudioSceneRecord[]>;
  /** A scene added at a position, the ones after it moved along. */
  insertScene(episodeId: string, position: number): Promise<StudioSceneRecord>;
  /** A scene taken out, the ones after it moved up. */
  removeScene(id: string): Promise<void>;
  /** How many scenes of a maker's are being made now. */
  makingFor(userId: string): Promise<number>;
  /**
   * What is happening to an episode or a scene now, kept on its row (null
   * clears it), leaving the row's updatedAt as it was: it is said often.
   */
  noteActivity(
    of: { episodeId: string } | { sceneId: string },
    activity: StudioActivity | null,
  ): Promise<void>;

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
