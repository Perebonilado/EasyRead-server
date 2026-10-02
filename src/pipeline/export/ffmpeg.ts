/**
 * ffmpeg as the export worker uses it (studio-export): a run that is
 * waited for, and an encoder fed frames on its input as they are drawn.
 * Where it is: FFMPEG_PATH, else `ffmpeg` on the PATH (ffprobe beside it).
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';

/** How much of ffmpeg's report is kept to say why it failed. */
const REPORT_TAIL = 2000;

/** ffmpeg's own words, the end of them, for the logs: never shown to a maker. */
export class FfmpegError extends Error {
  constructor(
    readonly code: number | null,
    readonly report: string,
  ) {
    super(`ffmpeg exited ${code}: ${report.slice(-400).trim()}`);
    this.name = 'FfmpegError';
  }
}

/** A running encoder: frames in, one at a time, then ended. */
export interface FrameSink {
  /** A frame (a JPEG) given to it; waits while it catches up. */
  write(frame: Buffer): Promise<void>;
  /** No more frames: waits for the file to be finished. */
  end(): Promise<void>;
  /** Stopped at once, the file left unfinished. */
  kill(): void;
}

export interface VideoTools {
  run(args: readonly string[]): Promise<{ report: string }>;
  encoder(args: readonly string[]): FrameSink;
  /** A file's length in milliseconds, as ffprobe reads it. */
  durationOf(file: string): Promise<number>;
}

export class Ffmpeg implements VideoTools {
  readonly ffprobe: string;

  constructor(readonly path: string = process.env.FFMPEG_PATH || 'ffmpeg') {
    this.ffprobe =
      process.env.FFPROBE_PATH ||
      (path.includes('/') ? join(dirname(path), 'ffprobe') : 'ffprobe');
  }

  run(args: readonly string[]): Promise<{ report: string }> {
    return this.spawned(this.path, args).done;
  }

  encoder(args: readonly string[]): FrameSink {
    const { child, done } = this.spawned(this.path, args);
    // Set by the process's end, checked as each frame goes in.
    let failure: Error | null = null;
    done.catch((error: Error) => {
      failure = error;
    });
    const check = () => {
      if (failure) throw failure;
    };
    return {
      write: async (frame) => {
        check();
        if (!child.stdin.write(frame))
          await Promise.race([
            once(child.stdin, 'drain'),
            done.then(() => {
              throw new Error('ffmpeg finished before the frames did');
            }),
          ]);
        check();
      },
      end: async () => {
        child.stdin.end();
        await done;
      },
      kill: () => {
        child.kill('SIGKILL');
      },
    };
  }

  async durationOf(file: string): Promise<number> {
    const { report } = await this.spawned(
      this.ffprobe,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        file,
      ],
      true,
    ).done;
    const seconds = Number(report.trim());
    return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
  }

  /** A process, its report (stderr, or stdout for ffprobe) kept; done when it exits, failed unless it exits clean. */
  private spawned(
    command: string,
    args: readonly string[],
    stdout = false,
  ): {
    child: ChildProcessWithoutNullStreams;
    done: Promise<{ report: string }>;
  } {
    const child = spawn(command, args as string[], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let report = '';
    const keep = (chunk: Buffer) => {
      report += chunk.toString('utf8');
      // Long runs print a line a frame: only the end matters.
      if (report.length > 64_000) report = report.slice(-32_000);
    };
    (stdout ? child.stdout : child.stderr).on('data', keep);
    if (stdout) child.stderr.on('data', () => undefined);
    else child.stdout.on('data', () => undefined);
    // A pipe closed under a write is the process's exit, reported there.
    child.stdin.on('error', () => undefined);
    const done = new Promise<{ report: string }>((resolve, reject) => {
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code === 0) resolve({ report });
        else reject(new FfmpegError(code, report.slice(-REPORT_TAIL)));
      });
    });
    return { child, done };
  }
}
