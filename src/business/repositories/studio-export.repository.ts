import type { FilmShape } from '../../contracts';
import type { ExportScope, ExportStatus } from '../domain/studio/studio-export';

/** A Studio film made into a video file (studio-export): the request, how far it has got, and the file. */
export interface StudioExportRecord {
  id: string;
  showId: string;
  /** The episode it was asked from: a twin's lead, so either shape lists it. */
  episodeId: string;
  userId: string;
  scope: ExportScope;
  shape: FilmShape;
  captions: boolean;
  status: ExportStatus;
  /** 0 to 1. */
  progress: number;
  fileKey: string | null;
  bytes: number | null;
  error: string | null;
  /** What it is made from (filmPrint): the same film asked for again is handed this one. */
  filmHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type StudioExportPatch = Partial<
  Pick<
    StudioExportRecord,
    'status' | 'progress' | 'fileKey' | 'bytes' | 'error' | 'filmHash'
  >
>;

export interface StudioExportRepository {
  create(input: {
    showId: string;
    episodeId: string;
    userId: string;
    scope: ExportScope;
    shape: FilmShape;
    captions: boolean;
    filmHash: string | null;
  }): Promise<StudioExportRecord>;
  find(id: string): Promise<StudioExportRecord | null>;
  update(id: string, patch: StudioExportPatch): Promise<void>;
  /**
   * The videos made of the same film, the latest first: an episode's, or
   * (scope 'show') its show's whole-show videos, in one shape.
   */
  listSame(input: {
    showId: string;
    episodeId: string;
    scope: ExportScope;
    shape: FilmShape;
    limit: number;
  }): Promise<StudioExportRecord[]>;
  /** What the maker sees under an episode, the latest first: its own videos and its show's whole-show ones. */
  listFor(input: {
    showId: string;
    episodeId: string;
    limit: number;
  }): Promise<StudioExportRecord[]>;
}
