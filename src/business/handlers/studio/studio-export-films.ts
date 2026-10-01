/**
 * The films a video is made of (studio-export), as they stand now: what
 * the API checks when the maker asks for one, and what the worker draws.
 */
import type { FilmShape } from '../../domain/scene-shape';
import {
  filmsFor,
  madeScene,
  type ExportScope,
} from '../../domain/studio/studio-export';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../repositories/studio.repository';
import { episodeShape } from './studio-twins';

/** One film of a video: the episode drawn, its made scenes, and the title and number it plays under (a twin's are its lead's). */
export interface ExportFilm {
  episode: StudioEpisodeRecord;
  scenes: StudioSceneRecord[];
  title: string;
  number: number;
}

/**
 * The episode asked from, in the shape asked for (its twin, for the other
 * shape), or every episode of the show in that shape by its number; only
 * those made, with a made scene to play.
 */
export async function exportFilms(
  studio: StudioRepository,
  show: StudioShowRecord,
  lead: StudioEpisodeRecord,
  scope: ExportScope,
  shape: FilmShape,
): Promise<ExportFilm[]> {
  const episodes = await studio.listEpisodes(show.id);
  const scenes = await studio.listScenesOf(episodes.map((e) => e.id));
  const madeOf = new Map<string, StudioSceneRecord[]>();
  for (const scene of scenes)
    if (madeScene(scene))
      madeOf.set(scene.episodeId, [
        ...(madeOf.get(scene.episodeId) ?? []),
        scene,
      ]);
  const byId = new Map(episodes.map((e) => [e.id, e]));
  type Film = StudioEpisodeRecord & { shape: FilmShape; twinOf: string | null };
  const normal = (e: StudioEpisodeRecord): Film => ({
    ...e,
    shape: episodeShape(e),
    twinOf: e.twinOf ?? null,
  });
  return filmsFor<Film>({
    scope,
    shape,
    lead: normal(lead),
    episodes: episodes.map(normal),
    made: (e) => e.phase === 'made' && (madeOf.get(e.id)?.length ?? 0) > 0,
  }).map((film) => {
    const of = film.twinOf ? (byId.get(film.twinOf) ?? film) : film;
    return {
      episode: film,
      scenes: (madeOf.get(film.id) ?? []).sort(
        (a, b) => a.position - b.position,
      ),
      title: of.title,
      number: of.number,
    };
  });
}
