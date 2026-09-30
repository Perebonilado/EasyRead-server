/**
 * What an explainer's player is given beyond its scenes (studio-explainer-
 * plan, Ask 9, set A): its host in the corner and its end card's "What
 * next?". A story's film is given neither.
 */
import type { StudioPlayDto } from '../../../contracts';
import { hostFaces, hostIn, hostOn } from '../../domain/studio/studio-host';
import type {
  StudioBrief,
  StudioBible,
  StudioOutline,
} from '../../domain/studio/studio';

type Extras = Pick<StudioPlayDto, 'host' | 'next'>;

/** An explainer's film's own extras, by code: none for a story. */
export function explainerPlay(
  show: { brief: StudioBrief; bible: StudioBible | null },
  outline: StudioOutline | null,
): Extras {
  if (show.brief.format !== 'explainer') return {};
  const host = hostOn(show.brief) ? hostIn(show.bible) : null;
  const faces = host ? hostFaces(host) : null;
  const next = outline?.next ?? [];
  return {
    ...(host && faces
      ? {
          host: {
            name: host.name,
            kind: host.kind === 'animal' ? 'animal' : 'person',
            faces,
          },
        }
      : {}),
    ...(next.length ? { next } : {}),
  };
}
