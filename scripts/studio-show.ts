/**
 * What the Studio's tools share: a show as its scenes find it, and a copy
 * of a file kept before it is written over.
 */
import type { StudioBible } from '../src/business/domain/studio/studio';
import { foundIn } from '../src/business/domain/studio/studio-check';
import { storyBibleFor } from '../src/business/domain/studio/studio-stage';
import type { StoragePort } from '../src/business/ports/storage.port';
import type {
  StudioEpisodeRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../src/business/repositories/studio.repository';
import {
  studioCastKey,
  studioOwnKey,
  studioSetsKey,
} from '../src/business/handlers/studio/studio-cast.service';
import type { PageStory } from '../src/pipeline/processors/scene.processor';

/**
 * A show, its episodes and every scene of them, and its bible as its
 * scenes find it (every feature and thing their words name), as a book's
 * story is kept for the drawing: where its cast, sets and own things are.
 */
export async function showStory(
  studio: StudioRepository,
  showId: string,
): Promise<{
  show: StudioShowRecord;
  episodes: StudioEpisodeRecord[];
  rows: StudioSceneRecord[];
  bible: StudioBible;
  story: PageStory;
}> {
  const show = await studio.findShow(showId);
  if (!show?.bible) throw new Error(`No show ${showId} with a cast`);
  const episodes = await studio.listEpisodes(show.id);
  const rows = await studio.listScenesOf(episodes.map((e) => e.id));
  // Each episode's scenes in their order, one episode after another.
  const byEpisode = episodes.flatMap((episode, k) =>
    rows
      .filter((row) => row.episodeId === episode.id)
      .map((row) => ({ ...row, position: k * 1000 + row.position })),
  );
  const bible = foundIn(show.bible, byEpisode);
  const sheets = byEpisode.flatMap((row) =>
    row.sheet?.kind === 'story' ? [row.sheet] : [],
  );
  return {
    show,
    episodes,
    rows,
    bible,
    story: {
      bible: storyBibleFor(bible, sheets, show.title),
      page: 1,
      castKey: studioCastKey(show.id),
      setsKey: studioSetsKey(show.id),
      ownKey: studioOwnKey(show.id),
      bookTitle: show.title,
    },
  };
}

/** A copy of a stored file kept beside it before it is written over, named for when: the copy's key. */
export async function keepCopy(
  storage: StoragePort,
  key: string,
  at = new Date(),
): Promise<string> {
  const copy = `${key}.${at.toISOString().replace(/[:.]/g, '-')}.bak`;
  await storage.put({
    key: copy,
    body: await storage.get(key),
    mimeType: 'application/json',
  });
  return copy;
}
