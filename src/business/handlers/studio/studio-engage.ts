/**
 * What an explainer's player is given beyond its scenes (studio-explainer-
 * plan, Ask 9, set A): whether it pauses for questions, its host in the
 * corner, its end card's recap and "What next?", and whether it offers
 * "Now you explain it"; and that one check, made and recorded under its
 * own task (studio_teach_back). A story's film is given none of it.
 */
import type { StudioPlayDto, StudioTeachBackDto } from '../../../contracts';
import { bandOf } from '../../domain/studio/studio-audience';
import { pausesFor } from '../../domain/studio/studio-checkpoint';
import {
  recapCards,
  teachBackAsk,
  teachBackOf,
  teachBackPoints,
} from '../../domain/studio/studio-end';
import { hostFaces, hostIn, hostOn } from '../../domain/studio/studio-host';
import type {
  ExplainerSheet,
  StudioBrief,
  StudioBible,
  StudioOutline,
} from '../../domain/studio/studio';
import type { LlmGatewayPort, LlmUsage } from '../../ports/llm.port';

type Extras = Pick<
  StudioPlayDto,
  'pauses' | 'host' | 'recap' | 'next' | 'teachBack'
>;

/** An explainer's film's own extras, by code: none for a story. */
export function explainerPlay(
  show: { brief: StudioBrief; bible: StudioBible | null },
  outline: StudioOutline | null,
  sheets: readonly (ExplainerSheet | { kind: string } | null)[],
): Extras {
  if (show.brief.format !== 'explainer') return {};
  const host = hostOn(show.brief) ? hostIn(show.bible) : null;
  const faces = host ? hostFaces(host) : null;
  const lessons = sheets
    .filter((s): s is ExplainerSheet => s?.kind === 'explainer')
    .map((sheet) => ({ sheet }));
  const recap = recapCards(
    lessons,
    (show.bible?.pictures ?? []).map((p) => p.name),
  );
  const next = outline?.next ?? [];
  const points = teachBackPoints(outline?.scenes ?? []);
  return {
    pauses: pausesFor(bandOf(show.brief)),
    ...(host && faces
      ? {
          host: {
            name: host.name,
            kind: host.kind === 'animal' ? 'animal' : 'person',
            faces,
          },
        }
      : {}),
    ...(recap.length ? { recap } : {}),
    ...(next.length ? { next } : {}),
    ...(points.length ? { teachBack: true } : {}),
  };
}

/**
 * A viewer's own explanation checked: one small call (DeepSeek, no
 * thinking) against the episode's points, what it cost recorded under its
 * own task. Null when there is nothing to check (too few words, or an
 * episode with no points).
 */
export async function teachBack(
  llm: Pick<LlmGatewayPort, 'studioTeachBack'>,
  record: (usage: LlmUsage) => Promise<void>,
  show: { brief: StudioBrief },
  outline: StudioOutline | null,
  answer: unknown,
): Promise<StudioTeachBackDto | null> {
  if (show.brief.format !== 'explainer') return null;
  const ask = teachBackAsk(outline, answer, bandOf(show.brief));
  if (!ask) return null;
  const result = await llm.studioTeachBack(ask);
  await record(result.usage).catch(() => undefined);
  return teachBackOf(result.value, ask.points);
}
