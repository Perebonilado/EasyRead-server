/**
 * The same film in the other shape (studio-vertical-plan §1.4, Richard's
 * decisions of 2026-09-30): a twin episode, wide or tall, on its lead's
 * script and voice. Vertical never replaces wide; both are kept.
 *
 * The lead is the episode the maker writes: its outline, its sheets, its
 * voice. Its twin has one scene for each of the lead's (`twinOf`), each
 * made by composing the lead's scene again for the twin's frame, from the
 * same sheet, drawings and audio: no writer, no voice, no model. A twin's
 * scene needs composing again when the lead's scene has changed since
 * (its fingerprint, as a lead's own staleness is judged) or was voiced
 * again (its audio).
 */
import type {
  FilmShape,
  StudioShapeChoice,
  StudioTwinDto,
} from '../../../contracts';
import type { StudioBible, StudioBrief } from '../../domain/studio/studio';
import { carriedWears } from '../../domain/studio/studio-check';
import type {
  StudioEpisodeRecord,
  StudioSceneRecord,
} from '../../repositories/studio.repository';
import { activityDto, needsMaking, sceneFingerprint } from './studio-views';

/** The other shape. */
export const otherShape = (shape: FilmShape): FilmShape =>
  shape === 'tall' ? 'wide' : 'tall';

/** A shape as the maker says it. */
export const shapeWord = (shape: FilmShape): string =>
  shape === 'tall' ? 'vertical' : 'wide';

/** An episode's shape: absent is wide (every episode made before shapes). */
export const episodeShape = (episode: Pick<StudioEpisodeRecord, 'shape'>) =>
  episode.shape === 'tall' ? 'tall' : 'wide';

/**
 * The shapes an episode is made in, as the brief asks: its own, and its
 * twin's when the maker chose both (the lead wide, its twin vertical).
 * Wide is the default.
 */
export function shapesOf(brief: { shape?: StudioShapeChoice | null }): {
  lead: FilmShape;
  twin: FilmShape | null;
} {
  if (brief.shape === 'tall') return { lead: 'tall', twin: null };
  if (brief.shape === 'both') return { lead: 'wide', twin: 'tall' };
  return { lead: 'wide', twin: null };
}

/** An episode's twin among a show's episodes: the one that is its twin, or the one it is the twin of. */
export function twinOf<E extends Pick<StudioEpisodeRecord, 'id' | 'twinOf'>>(
  episode: E,
  episodes: readonly E[],
): E | null {
  if (episode.twinOf)
    return episodes.find((one) => one.id === episode.twinOf) ?? null;
  return episodes.find((one) => one.twinOf === episode.id) ?? null;
}

/** Each lead scene's fingerprint now, by its id: what a twin's scene made from it must have been made at. */
export function leadFingerprints(
  lead: readonly StudioSceneRecord[],
  bible: StudioBible | null,
  brief: StudioBrief,
): Map<string, string> {
  const carried = carriedWears(lead, bible);
  return new Map(
    lead.flatMap((row) =>
      row.sheet
        ? [
            [
              row.id,
              sceneFingerprint(
                row.sheet,
                bible,
                brief,
                carried.get(row.position) ?? [],
              ),
            ],
          ]
        : [],
    ),
  );
}

/**
 * Whether a twin's scene needs composing again: not made, failed, or its
 * lead's scene changed since (its script, anyone or anywhere it shows)
 * or voiced again.
 */
export function twinStale(
  twin: Pick<
    StudioSceneRecord,
    'status' | 'sceneKey' | 'audioKey' | 'madeHash'
  > | null,
  lead: Pick<StudioSceneRecord, 'audioKey'>,
  fingerprint: string | undefined,
): boolean {
  if (!twin || twin.status === 'failed' || !twin.sceneKey) return true;
  return twin.madeHash !== fingerprint || twin.audioKey !== lead.audioKey;
}

/**
 * The lead's scenes its twin can be composed from now: made, as they are
 * now (not changed since), and their twin's scene stale. A lead scene
 * that must be made again is made first; its twin is composed with it.
 */
export function twinWork(
  lead: readonly StudioSceneRecord[],
  twin: readonly StudioSceneRecord[],
  bible: StudioBible | null,
  brief: StudioBrief,
): StudioSceneRecord[] {
  const prints = leadFingerprints(lead, bible, brief);
  const carried = carriedWears(lead, bible);
  const byLead = new Map(twin.map((row) => [row.twinOf ?? '', row]));
  return lead.filter(
    (row) =>
      row.sheet &&
      row.sceneKey &&
      row.audioKey &&
      row.status === 'made' &&
      !needsMaking(row, bible, brief, carried.get(row.position)) &&
      twinStale(byLead.get(row.id) ?? null, row, prints.get(row.id)),
  );
}

/**
 * The same film in the other shape, as the film's Wide/Vertical switch
 * shows it: `other` is the twin of `lead`, or the lead itself when the
 * episode looked at is the twin. Its scenes still to make are judged
 * against the lead's scenes as they are now.
 */
export function twinDto(
  other: StudioEpisodeRecord,
  otherRows: readonly StudioSceneRecord[],
  lead: readonly StudioSceneRecord[],
  bible: StudioBible | null,
  brief: StudioBrief,
): StudioTwinDto {
  const working =
    Boolean(other.busy) || otherRows.some((row) => row.status === 'making');
  let stale: number;
  if (other.twinOf) {
    const prints = leadFingerprints(lead, bible, brief);
    const byLead = new Map(otherRows.map((row) => [row.twinOf ?? '', row]));
    stale = lead.filter(
      (row) =>
        row.sheet &&
        twinStale(byLead.get(row.id) ?? null, row, prints.get(row.id)),
    ).length;
  } else {
    const carried = carriedWears(otherRows, bible);
    stale = otherRows.filter(
      (row) =>
        !row.sceneKey ||
        needsMaking(row, bible, brief, carried.get(row.position)),
    ).length;
  }
  const made = otherRows.filter((row) => row.sceneKey && row.audioKey);
  return {
    id: other.id,
    shape: episodeShape(other),
    phase: other.phase,
    made: made.length > 0 && stale === 0,
    stale,
    durationMs: other.durationMs,
    hasThumb: Boolean(other.thumbKey),
    shareToken: other.shareToken,
    making: working,
    activity: activityDto(other.activity, working),
  };
}

/** Where a made scene's parts are kept beside its film (its script and the drawings the artist made for it): what its twin is composed from. */
export const partsKeyOf = (sceneKey: string): string =>
  sceneKey.replace(/-scene\.json$/, '-parts.json');
