/**
 * The critic's eyes (explainer-animation-plan §9.1, §9.3): stills of one
 * scene of an episode, taken as the export takes its frames, on the render
 * page (`/render/<episode>?scene=<id>`, which plays that scene alone; a
 * page without the scene mode plays the whole film, and the stills are
 * taken where its timeline says this scene plays). Each still comes with
 * what the page says is on its frame (`__render.inspect`), for the frame
 * checks. The stills are half the frame's size: what the checks read, and
 * quick to take.
 */
import type { FilmShape } from '../../contracts';
import type { FrameReport } from '../../business/domain/shots/frame-checks';
import {
  videoMsOf,
  type FilmClip,
  type FilmTimeline,
} from '../../business/domain/shots/frame-moments';
import type { CriticMoment } from '../../business/domain/shots/shot-critic';
import {
  EXPORT_SIZE,
  RENDER_KEY_MS,
  signKey,
} from '../../business/domain/studio/studio-export';
import type { FilmCapturePort } from './film-capture';

/** One still of the scene: its moment on the scene's clock, its file, and what was on the frame. */
export interface SceneStill {
  moment: CriticMoment;
  file: string;
  inspect: FrameReport | null;
  /** Another scene shares the frame here (a join), on a page that plays the whole film. */
  join: boolean;
}

export interface SceneEyesPort {
  /** The scene's stills at its moments, in order; none when the page does not play it. */
  stills(input: {
    episodeId: string;
    sceneId: string;
    shape: FilmShape;
    moments: readonly CriticMoment[];
    outDir: string;
  }): Promise<SceneStill[]>;
}

/**
 * The moments of a scene where its clip plays them on the video's clock:
 * only those inside the part of it the film shows, each with whether
 * another clip shares the frame then.
 */
export function clipMoments(
  timeline: FilmTimeline,
  sceneId: string,
  moments: readonly CriticMoment[],
): { videoMs: number; moment: CriticMoment; join: boolean }[] {
  const clip = timeline.clips.find((one) => one.sceneId === sceneId);
  if (!clip) return [];
  const shared = (videoMs: number) =>
    timeline.clips.some(
      (other: FilmClip) =>
        other !== clip &&
        videoMs >= other.startsAtMs &&
        videoMs < other.startsAtMs + other.outMs - other.inMs,
    );
  return moments
    .filter((m) => m.ms >= clip.inMs && m.ms < clip.outMs)
    .map((moment) => {
      const videoMs = Math.round(videoMsOf(clip, moment.ms));
      return { videoMs, moment, join: shared(videoMs) };
    });
}

/** The eyes on the render page, through the export's own capture. */
export class RenderPageEyes implements SceneEyesPort {
  constructor(
    private readonly capture: FilmCapturePort,
    private readonly settings: {
      /** The web the render page is on (RENDER_WEB_URL). */
      web: string;
      /** The render keys' secret (studio-export's keySecret). */
      secret: string;
      now?: () => number;
    },
  ) {}

  async stills(input: {
    episodeId: string;
    sceneId: string;
    shape: FilmShape;
    moments: readonly CriticMoment[];
    outDir: string;
  }): Promise<SceneStill[]> {
    const now = this.settings.now ?? (() => Date.now());
    const key = signKey(
      {
        scope: 'episode',
        id: input.episodeId,
        expiresAt: now() + RENDER_KEY_MS,
      },
      this.settings.secret,
    );
    const query = new URLSearchParams({
      key,
      captions: '1',
      title: '0',
      end: '0',
      fps: '30',
      scene: input.sceneId,
    });
    const size = EXPORT_SIZE[input.shape];
    let chosen: ReturnType<typeof clipMoments> = [];
    const taken = await this.capture.stills({
      url: `${this.settings.web.replace(/\/+$/, '')}/render/${input.episodeId}?${query.toString()}`,
      width: size.width,
      height: size.height,
      times: (timeline) => {
        chosen = clipMoments(timeline, input.sceneId, input.moments);
        return chosen.map((one) => one.videoMs);
      },
      outDir: input.outDir,
      inspect: true,
      scale: 0.5,
      pages: 1,
      name: (ms) => `still-${String(ms).padStart(7, '0')}.png`,
    });
    const byMs = new Map(taken.map((one) => [one.ms, one]));
    return chosen.flatMap((one) => {
      const still = byMs.get(one.videoMs);
      return still
        ? [
            {
              moment: one.moment,
              file: still.file,
              inspect: still.inspect
                ? { ...still.inspect, ms: one.moment.ms }
                : null,
              join: one.join,
            },
          ]
        : [];
    });
  }
}
