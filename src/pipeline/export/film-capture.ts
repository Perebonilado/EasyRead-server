/**
 * A film drawn into a silent video file by a headless browser (studio-
 * export): the client's render page (/render/<episode>) draws the film
 * exactly as the player does, at any moment asked; this steps it frame by
 * frame, takes each frame as a JPEG straight from the compositor, and
 * pipes it into ffmpeg. The page also says where each voice goes and
 * hands over the music and the stage's sounds, rendered offline, as WAVs.
 *
 * A frame is a function of the time alone, so a browser that crashes is
 * launched again and the film goes on from the frame it had reached; and
 * a film can be cut into segments drawn by several browsers at once
 * (EXPORT_PAGES), each into its own file, joined after without re-encoding.
 */
import { createWriteStream, existsSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { Browser, CDPSession, Page } from 'puppeteer-core';
import type { FrameReport } from '../../business/domain/shots/frame-checks';
import type { FilmTimeline } from '../../business/domain/shots/frame-moments';
import {
  concatList,
  encodeArgs,
  type Chapter,
} from '../../business/domain/studio/studio-export';
import type { VideoTools } from './ffmpeg';
import { mkdir, writeFile } from 'node:fs/promises';

/** One voice as the page lays it on the video's clock. */
export interface PageVoice {
  sceneId: string;
  url: string;
  startsAtMs: number;
  inMs: number;
  outMs: number;
}

export interface CaptureInput {
  /** The render page, its key and options in the query. */
  url: string;
  width: number;
  height: number;
  fps: number;
  /** Where the silent video is written. */
  video: string;
  /** Where its sound and its segments are kept meanwhile. */
  workDir: string;
  /** A name for this film's files in the work directory. */
  name: string;
  /** Told as frames are drawn: how many of how many. */
  onFrames?: (done: number, total: number) => void;
}

export interface CapturedFilm {
  durationMs: number;
  frames: number;
  voices: PageVoice[];
  chapters: Chapter[];
  /** The music laid on the video's clock (a WAV), or null for none. */
  music: string | null;
  /** The stage's own sounds likewise, or null for a film with none. */
  effects: string | null;
  stats: {
    ms: number;
    framesPerSecond: number;
    relaunches: number;
    pages: number;
  };
}

/** Stills of a film at chosen moments, for the frame checks (explainer-animation-plan §9.1). */
export interface StillsInput {
  /** The render page, its key and options in the query. */
  url: string;
  width: number;
  height: number;
  /**
   * The moments, on the video's clock, in ms; or how to choose them from
   * the film's timeline (`__render.timeline`), asked once it is loaded.
   */
  times: number[] | ((timeline: FilmTimeline) => number[]);
  /** Where the PNGs are written, one a moment. */
  outDir: string;
  /** Also what is on the frame at each moment (`__render.inspect`). */
  inspect?: boolean;
  /** Each still's file name; `still-<ms>.png` when absent. */
  name?: (ms: number, index: number) => string;
  /** How many browsers share the moments; the capture's own count when absent. */
  pages?: number;
  /** Told as stills are taken: how many of how many. */
  onStill?: (done: number, total: number) => void;
}

/** One still: its moment, its PNG, and what was on the frame (null when not asked). */
export interface CapturedStill {
  ms: number;
  file: string;
  inspect: FrameReport | null;
}

export interface FilmCapturePort {
  capture(input: CaptureInput): Promise<CapturedFilm>;
  /** Stills at moments of the film, in the order of their moments, each a PNG; what was on the frame too, when asked. */
  stills(input: StillsInput): Promise<CapturedStill[]>;
}

/** The render page's handle, as the browser holds it. */
interface RenderHandle {
  ready: Promise<void>;
  durationMs: number;
  fps: number;
  seek(ms: number): Promise<void>;
  voicePlan(): PageVoice[];
  audioBytes(kind: 'music' | 'effects'): Promise<number>;
  audioSlice(kind: 'music' | 'effects', from: number, to: number): string;
  chapters: Chapter[];
  inspect?(ms: number): Promise<FrameReport>;
  timeline?: FilmTimeline;
}
type RenderWindow = Window & { __render?: RenderHandle };

/** How many times a crashed browser is launched again for one film before it is given up on. */
const MOST_RELAUNCHES = 3;
/** How long one frame may take, drawn and taken, before the browser is taken for stuck. */
const FRAME_MS = 30_000;
/** How long a page may take to load its film. */
const READY_MS = 120_000;
/** How much of the sound comes across from the page at once. */
const SOUND_SLICE = 4 * 1024 * 1024;
/** How often progress is told, in frames. */
const TELL_EVERY = 15;

/** Where Chrome is: CHROME_PATH, else the first of the usual places that exists. */
export function chromePath(env: string | undefined): string {
  if (env?.trim()) return env.trim();
  const usual = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  return usual.find((path) => existsSync(path)) ?? usual[0];
}

/** Frames 0 to N, cut into `parts` runs about as long as each other, in order. */
export function segmentsOf(
  frames: number,
  parts: number,
): { from: number; to: number }[] {
  const count = Math.max(1, Math.min(parts, Math.floor(frames / 60) || 1));
  const out: { from: number; to: number }[] = [];
  for (let k = 0; k < count; k += 1)
    out.push({
      from: Math.round((frames * k) / count),
      to: Math.round((frames * (k + 1)) / count),
    });
  return out.filter((one) => one.to > one.from);
}

/** `count` things cut into at most `parts` runs, in order, about as long as each other; none for none. */
export function runsOf(
  count: number,
  parts: number,
): { from: number; to: number }[] {
  const n = Math.max(1, Math.min(Math.max(1, parts), count));
  const out: { from: number; to: number }[] = [];
  for (let k = 0; k < n; k += 1)
    out.push({
      from: Math.round((count * k) / n),
      to: Math.round((count * (k + 1)) / n),
    });
  return out.filter((one) => one.to > one.from);
}

const withTimeout = <T>(
  work: Promise<T>,
  ms: number,
  what: string,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${what} took longer than ${ms} ms`)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

/** One browser drawing one run of the film's frames. */
interface Drawer {
  browser: Browser;
  page: Page;
  cdp: CDPSession;
}

export class PuppeteerFilmCapture implements FilmCapturePort {
  private readonly logger = new Logger('FilmCapture');

  constructor(
    private readonly tools: VideoTools,
    private readonly options: {
      chrome: string;
      /** How many browsers draw a film at once. */
      pages: number;
    },
  ) {}

  async capture(input: CaptureInput): Promise<CapturedFilm> {
    const started = Date.now();
    let relaunches = 0;
    // The first browser reads the film: its length, its voices, its chapters and its sound.
    let first: Drawer | null = await this.open(input);
    try {
      const told = await first.page.evaluate(() => {
        const handle = (window as RenderWindow).__render!;
        return {
          durationMs: handle.durationMs,
          voices: handle.voicePlan(),
          chapters: handle.chapters,
        };
      });
      const frames = Math.max(
        1,
        Math.floor((told.durationMs * input.fps) / 1000) + 1,
      );
      const music = await this.sound(
        first.page,
        'music',
        join(input.workDir, `${input.name}-music.wav`),
      );
      const effects = await this.sound(
        first.page,
        'effects',
        join(input.workDir, `${input.name}-effects.wav`),
      );

      const segments = segmentsOf(frames, this.options.pages);
      const done = segments.map(() => 0);
      const tell = () =>
        input.onFrames?.(
          done.reduce((a, b) => a + b, 0),
          frames,
        );
      const files = segments.map((_, k) =>
        segments.length === 1
          ? input.video
          : join(input.workDir, `${input.name}-part-${k}.mp4`),
      );
      const drawers: (Drawer | null)[] = segments.map((_, k) =>
        k === 0 ? first : null,
      );
      first = null;
      // One run failing fails the film: the others stop where they are, and launch nothing more.
      let failed: Error | null = null;
      try {
        await Promise.all(
          segments.map(async (segment, k) => {
            const encoder = this.tools.encoder(encodeArgs(input.fps, files[k]));
            try {
              let frame = segment.from;
              let drawer = drawers[k] ?? (await this.open(input));
              drawers[k] = drawer;
              while (frame < segment.to) {
                if (failed) throw failed;
                try {
                  const ms = (frame * 1000) / input.fps;
                  await withTimeout(
                    drawer.page.evaluate(
                      (at) => (window as RenderWindow).__render!.seek(at),
                      ms,
                    ),
                    FRAME_MS,
                    'A frame',
                  );
                  const shot = await withTimeout(
                    drawer.cdp.send('Page.captureScreenshot', {
                      format: 'jpeg',
                      quality: 90,
                      optimizeForSpeed: true,
                    }),
                    FRAME_MS,
                    'A frame',
                  );
                  await encoder.write(Buffer.from(shot.data, 'base64'));
                  frame += 1;
                  done[k] = frame - segment.from;
                  if (frame % TELL_EVERY === 0) tell();
                } catch (error) {
                  relaunches += 1;
                  if (failed || relaunches > MOST_RELAUNCHES) throw error;
                  this.logger.warn(
                    `the browser failed at frame ${frame} (${(error as Error).message}): launching it again, from that frame`,
                  );
                  await drawer.browser.close().catch(() => undefined);
                  drawer = await this.open(input);
                  drawers[k] = drawer;
                }
              }
              await encoder.end();
            } catch (error) {
              encoder.kill();
              failed ??=
                error instanceof Error ? error : new Error(String(error));
              throw error;
            }
          }),
        );
      } finally {
        await Promise.all(
          drawers.flatMap((one) =>
            one ? [one.browser.close().catch(() => undefined)] : [],
          ),
        );
      }
      tell();
      if (segments.length > 1) {
        const list = join(input.workDir, `${input.name}-parts.txt`);
        await writeFile(list, concatList(files));
        await this.tools.run([
          '-hide_banner',
          '-nostats',
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          list,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          input.video,
        ]);
      }
      const ms = Date.now() - started;
      return {
        durationMs: told.durationMs,
        frames,
        voices: told.voices,
        chapters: told.chapters,
        music,
        effects,
        stats: {
          ms,
          framesPerSecond:
            Math.round((frames / Math.max(1, ms / 1000)) * 10) / 10,
          relaunches,
          pages: segments.length,
        },
      };
    } finally {
      await first?.browser.close().catch(() => undefined);
    }
  }

  /**
   * Stills at chosen moments (the frame checks' "times" mode): the same
   * page, the same seek and the same screenshot as a frame of the film,
   * as a PNG a moment, with what was on the frame when asked. The moments
   * are shared among the browsers in runs, in order, so each one seeks
   * forward; a browser that fails is launched again from the moment it
   * had reached, as a film's is.
   */
  async stills(input: StillsInput): Promise<CapturedStill[]> {
    await mkdir(input.outDir, { recursive: true });
    let relaunches = 0;
    let first: Drawer | null = await this.open(input);
    try {
      const told = await first.page.evaluate(() => {
        const handle = (window as RenderWindow).__render!;
        return {
          durationMs: handle.durationMs,
          timeline: handle.timeline ?? null,
          inspects: typeof handle.inspect === 'function',
        };
      });
      if (input.inspect && !told.inspects)
        throw new Error(
          'The render page cannot say what is on its frame: its web must be one with lib/scene/inspect.ts',
        );
      const timeline: FilmTimeline = told.timeline ?? {
        titleMs: 0,
        filmMs: told.durationMs,
        endMs: 0,
        durationMs: told.durationMs,
        clips: [],
      };
      const asked =
        typeof input.times === 'function' ? input.times(timeline) : input.times;
      const moments = [
        ...new Set(
          asked.map((ms) =>
            Math.min(told.durationMs, Math.max(0, Math.round(ms))),
          ),
        ),
      ].sort((a, b) => a - b);
      const name =
        input.name ??
        ((ms: number) => `still-${String(ms).padStart(7, '0')}.png`);
      // A browser for every dozen stills or so, up to the pages asked for.
      const runs = runsOf(
        moments.length,
        Math.min(
          input.pages ?? this.options.pages,
          Math.ceil(moments.length / 12),
        ),
      );
      const out: CapturedStill[] = new Array<CapturedStill>(moments.length);
      let done = 0;
      const drawers: (Drawer | null)[] = runs.map((_, k) =>
        k === 0 ? first : null,
      );
      if (runs.length) first = null;
      // One run failing fails them all: the others stop where they are.
      let failed: Error | null = null;
      try {
        await Promise.all(
          runs.map(async (run, k) => {
            try {
              let drawer = drawers[k] ?? (await this.open(input));
              drawers[k] = drawer;
              let i = run.from;
              while (i < run.to) {
                if (failed) throw failed;
                const ms = moments[i];
                try {
                  let inspect: FrameReport | null = null;
                  if (input.inspect)
                    inspect = await withTimeout(
                      drawer.page.evaluate(
                        (at) => (window as RenderWindow).__render!.inspect!(at),
                        ms,
                      ),
                      FRAME_MS,
                      'A still',
                    );
                  else
                    await withTimeout(
                      drawer.page.evaluate(
                        (at) => (window as RenderWindow).__render!.seek(at),
                        ms,
                      ),
                      FRAME_MS,
                      'A still',
                    );
                  const shot = await withTimeout(
                    drawer.cdp.send('Page.captureScreenshot', {
                      format: 'png',
                      optimizeForSpeed: true,
                    }),
                    FRAME_MS,
                    'A still',
                  );
                  const file = join(input.outDir, name(ms, i));
                  await writeFile(file, Buffer.from(shot.data, 'base64'));
                  out[i] = { ms, file, inspect };
                  i += 1;
                  done += 1;
                  input.onStill?.(done, moments.length);
                } catch (error) {
                  relaunches += 1;
                  if (failed || relaunches > MOST_RELAUNCHES) throw error;
                  this.logger.warn(
                    `the browser failed at the still at ${ms} ms (${(error as Error).message}): launching it again, from that still`,
                  );
                  await drawer.browser.close().catch(() => undefined);
                  drawer = await this.open(input);
                  drawers[k] = drawer;
                }
              }
            } catch (error) {
              failed ??=
                error instanceof Error ? error : new Error(String(error));
              throw error;
            }
          }),
        );
      } finally {
        await Promise.all(
          drawers.flatMap((one) =>
            one ? [one.browser.close().catch(() => undefined)] : [],
          ),
        );
      }
      return out;
    } finally {
      await first?.browser.close().catch(() => undefined);
    }
  }

  /** A browser at the frame's size, the film loaded and ready to draw. */
  private async open(
    input: Pick<CaptureInput, 'url' | 'width' | 'height'>,
  ): Promise<Drawer> {
    const { launch } = await import('puppeteer-core');
    const browser = await launch({
      executablePath: this.options.chrome,
      headless: true,
      defaultViewport: {
        width: input.width,
        height: input.height,
        deviceScaleFactor: 1,
      },
      protocolTimeout: 300_000,
      args: [
        // In a container the worker runs as root, where Chrome's own sandbox will not start.
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--force-color-profile=srgb',
        // Drawn at full speed even with no one watching.
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        `--window-size=${input.width},${input.height}`,
      ],
    });
    try {
      const page = await browser.newPage();
      // The film as made: its motion whole, its look the maker's.
      await page.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'no-preference' },
        { name: 'prefers-color-scheme', value: 'light' },
      ]);
      await page.goto(input.url, {
        waitUntil: 'domcontentloaded',
        timeout: READY_MS,
      });
      await page.waitForFunction(
        () => Boolean((window as RenderWindow).__render),
        {
          timeout: READY_MS,
        },
      );
      await withTimeout(
        page.evaluate(() => (window as RenderWindow).__render!.ready),
        READY_MS,
        'Loading the film',
      );
      const cdp = await page.createCDPSession();
      return { browser, page, cdp };
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  }

  /** The page's sound of one kind, written to a file a slice at a time; null for none. */
  private async sound(
    page: Page,
    kind: 'music' | 'effects',
    path: string,
  ): Promise<string | null> {
    const bytes = await page.evaluate(
      (which) => (window as RenderWindow).__render!.audioBytes(which),
      kind,
    );
    if (!bytes) return null;
    const out = createWriteStream(path);
    for (let from = 0; from < bytes; from += SOUND_SLICE) {
      const slice = await page.evaluate(
        (which, a, b) =>
          (window as RenderWindow).__render!.audioSlice(which, a, b),
        kind,
        from,
        Math.min(bytes, from + SOUND_SLICE),
      );
      if (!out.write(Buffer.from(slice, 'base64'))) await once(out, 'drain');
    }
    out.end();
    await once(out, 'finish');
    return path;
  }
}
