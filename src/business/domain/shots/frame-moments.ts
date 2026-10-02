/**
 * Which moments of a film to take stills at, for the frame checks
 * (explainer-animation-plan.md §9.1): every beat's middle, the start,
 * middle and end of every shot (a shots scene), and a still every couple
 * of seconds between, so nothing on screen for long goes unseen. The
 * render page says where each scene plays on the video's clock
 * (`__render.timeline`, the client's render-plan.ts); a moment of a scene
 * is found there, and a moment of the video is told back to its scene.
 */
import type { SceneDto } from '../../../contracts';

/** One scene as the video plays it (the client's TimelineClip). */
export interface FilmClip {
  sceneId: string;
  title: string;
  /** Where in the video its in point plays. */
  startsAtMs: number;
  /** The part of the scene shown, on its own clock. */
  inMs: number;
  outMs: number;
  durationMs: number;
  join: string;
}

/** A video's scenes on its clock (the client's RenderTimeline). */
export interface FilmTimeline {
  titleMs: number;
  filmMs: number;
  endMs: number;
  durationMs: number;
  clips: FilmClip[];
}

/** Which moments to take: every beat's middle, every shot's start, middle and end, a still every 2 s, or all of them. */
export type MomentsPer = 'beat' | 'shot' | '2s' | 'all';

export interface Moment {
  /** On the video's clock: where the page is seeked. */
  videoMs: number;
  /** The scene it is a still of, by its place in the timeline, and the moment on its own clock. */
  clip: number;
  sceneMs: number;
  /** Two scenes share the frame here, one giving way to the other. */
  join: boolean;
  why: 'beat' | 'shot' | 'grid';
}

/** Moments closer than this on the video's clock are one still. */
const SAME_MS = 120;
/** The grid's step, for `2s`. */
export const GRID_MS = 2000;

/** Where a moment of a scene plays in the video. */
export const videoMsOf = (clip: FilmClip, sceneMs: number): number =>
  clip.startsAtMs + (sceneMs - clip.inMs);

/** Where a clip ends in the video. */
const endOf = (clip: FilmClip) => clip.startsAtMs + clip.outMs - clip.inMs;

/**
 * The scene a moment of the video is a still of, and the moment on its
 * clock: the clip it falls in; where two overlap in a join, the one whose
 * voice is speaking, else the nearer to its own middle. Null on the title,
 * the end card and the black between scenes.
 */
export function clipAt(
  timeline: FilmTimeline,
  videoMs: number,
  scenes: readonly (Pick<SceneDto, 'beats'> | null)[] = [],
): { clip: number; sceneMs: number; join: boolean } | null {
  const on = timeline.clips.flatMap((clip, index) =>
    videoMs >= clip.startsAtMs && videoMs < endOf(clip)
      ? [{ clip, index }]
      : [],
  );
  if (!on.length) return null;
  const local = (one: { clip: FilmClip }) =>
    one.clip.inMs + (videoMs - one.clip.startsAtMs);
  const speaking = (one: { clip: FilmClip; index: number }) => {
    const beats = scenes[one.index]?.beats ?? [];
    const at = local(one);
    return (
      beats.length > 0 &&
      at >= beats[0].startMs &&
      at <= beats[beats.length - 1].endMs
    );
  };
  const chosen =
    on.find(speaking) ??
    on.reduce((best, one) => {
      const mid = (c: FilmClip) => (c.startsAtMs + endOf(c)) / 2;
      return Math.abs(videoMs - mid(one.clip)) <
        Math.abs(videoMs - mid(best.clip))
        ? one
        : best;
    });
  return {
    clip: chosen.index,
    sceneMs: Math.round(local(chosen)),
    join: on.length > 1,
  };
}

/**
 * The moments to take stills at: each scene's beats' middles and its
 * shots' starts, middles and ends, on its own clock and inside the part of
 * it the video shows; a still every GRID_MS across the film; never two
 * within SAME_MS of each other (a beat's moment kept over a shot's, a
 * shot's over the grid's). In the order they play.
 */
export function momentsOf(
  timeline: FilmTimeline,
  scenes: readonly (SceneDto | null)[],
  per: MomentsPer = 'all',
  gridMs = GRID_MS,
): Moment[] {
  const out: Moment[] = [];
  const take = (videoMs: number, why: Moment['why']) => {
    const at = clipAt(timeline, Math.round(videoMs), scenes);
    if (at) out.push({ videoMs: Math.round(videoMs), ...at, why });
  };
  timeline.clips.forEach((clip, index) => {
    const scene = scenes[index];
    if (!scene) return;
    const inside = (ms: number) => ms >= clip.inMs && ms < clip.outMs;
    if (per === 'all' || per === 'beat')
      for (const beat of scene.beats ?? []) {
        const mid = (beat.startMs + beat.endMs) / 2;
        if (inside(mid)) take(videoMsOf(clip, mid), 'beat');
      }
    if (
      (per === 'all' || per === 'shot') &&
      scene.engine === 'shots' &&
      scene.shots
    )
      for (const shot of scene.shots.shots)
        for (const ms of [
          shot.startMs,
          (shot.startMs + shot.endMs) / 2,
          shot.endMs - 1,
        ])
          if (inside(ms)) take(videoMsOf(clip, ms), 'shot');
  });
  if (per === 'all' || per === '2s')
    for (
      let ms = timeline.titleMs;
      ms < timeline.titleMs + timeline.filmMs;
      ms += gridMs
    )
      take(ms, 'grid');
  const rank = { beat: 0, shot: 1, grid: 2 } as const;
  const kept: Moment[] = [];
  for (const moment of [...out].sort(
    (a, b) => rank[a.why] - rank[b.why] || a.videoMs - b.videoMs,
  ))
    if (!kept.some((one) => Math.abs(one.videoMs - moment.videoMs) < SAME_MS))
      kept.push(moment);
  return kept.sort((a, b) => a.videoMs - b.videoMs);
}
