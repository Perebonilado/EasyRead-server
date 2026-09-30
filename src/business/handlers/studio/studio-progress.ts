/**
 * What the Studio is doing now, kept on the rows the maker's page polls,
 * so work that takes a while never looks stuck: the step (a scene sent
 * back and fixed, the whole script read, the pictures checked), and a
 * call that failed and is being tried again, in plain words, with how
 * many tries and why ("The writer is busy, trying again (2 of 3)"; "The
 * writing service is out of credit").
 *
 * A job is followed with `followStudioJob`; the code it runs says what it
 * does through work-progress, which knows nothing of the Studio. What is
 * said goes on the job's own row (the episode's, or the scene's for a job
 * about one scene) or, said about a scene, on that scene's; every row
 * said on is cleared when the job ends. A job that failed and will be
 * tried again says so until it is.
 */
import {
  followWork,
  retryWords,
  troubleOf,
  troubleWords,
  type RetryNotice,
  type WorkFollower,
  type WorkService,
  type WorkStep,
} from '../../domain/work-progress';
import type {
  StudioActivity,
  StudioRepository,
  StudioSceneRecord,
} from '../../repositories/studio.repository';

/** The job followed: its episode, the one scene it is about if any, its kind, and which try of it this is. */
export interface StudioJobShape {
  episodeId: string;
  sceneId?: string | null;
  kind: string;
  /** A scene written again to put right what its pictures showed wrong. */
  picture?: boolean;
  /** This try, from 1, and how many the queue makes. */
  attempt: number;
  attempts: number;
  /** How long the queue waits before the next try. */
  backoffMs?: number;
}

type Rows = Pick<StudioRepository, 'noteActivity' | 'listScenes'> &
  Partial<Pick<StudioRepository, 'findScene'>>;

/** The jobs that only write: what goes wrong is the writer's. */
const WRITING = new Set(['bible', 'outline', 'script', 'scene']);

type Target = { episodeId: string } | { sceneId: string };
const keyOf = (target: Target) =>
  'sceneId' in target ? `s:${target.sceneId}` : `e:${target.episodeId}`;

/** What a job says it is doing as it starts, before anything it runs says more; null for one whose card says it already. */
export function jobSays(
  job: Pick<StudioJobShape, 'kind' | 'picture'>,
  position: number | null,
): Pick<StudioActivity, 'says' | 'short'> | null {
  const scene = position === null ? 'the scene' : `scene ${position + 1}`;
  switch (job.kind) {
    case 'scene':
      return job.picture
        ? {
            says: `${cap(scene)}: fixing what its pictures show wrong`,
            short: 'Fixing',
          }
        : { says: `Writing ${scene} again`, short: 'Rewriting' };
    case 'prepare':
      return { says: 'Drawing the cast for the film' };
    case 'repace':
      return { says: 'Changing the pace of the voice', short: 'Pacing' };
    default:
      return null;
  }
}

const cap = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * What a scene sent back to its writer is fixing, in a line and a word
 * for its row: made shorter when it runs too long, else the first thing
 * wrong, made plain ("Scene 1: fixing who's holding what").
 */
export function sendBackSays(
  k: number,
  reasons: readonly string[],
): Required<Pick<WorkStep, 'says' | 'short' | 'scene'>> {
  const all = reasons.join(' ');
  if (
    /too long|runs? (?:over|long)|over (?:its|the) (?:time|seconds)|seconds? (?:over|too many)|cut it/i.test(
      all,
    )
  )
    return {
      scene: k,
      says: `Making scene ${k + 1} shorter`,
      short: 'Shortening',
    };
  const what = fixingWords(all);
  return {
    scene: k,
    says: `Scene ${k + 1}: fixing ${what}`,
    short: 'Fixing',
  };
}

/** What a scene's problems are about, as a few plain words. */
function fixingWords(problems: string): string {
  if (
    /\b(?:hold|holds|held|holding|hand|hands|carr(?:y|ies|ied))\b/i.test(
      problems,
    )
  )
    return "who's holding what";
  if (
    /\b(?:enter|enters|exit|exits|leaves?|on stage|onstage|off stage|offstage|arrive)/i.test(
      problems,
    )
  )
    return "who's there and when";
  if (/\b(?:cast|missing|left out|not in the scene)\b/i.test(problems))
    return 'who is in it';
  if (/\b(?:wear|wears|wearing|clothes|coat|hat)\b/i.test(problems))
    return "what they're wearing";
  if (/\b(?:set|place|door|room)\b/i.test(problems)) return 'where it happens';
  if (/\b(?:line|lines|says|said|narrat)/i.test(problems)) return 'its lines';
  return 'what the stage cannot play';
}

/** A scene written again after the read, and why, from its first note: "Rewriting scene 5 (the viewer missed the stakes)". */
export function rewriteSays(
  k: number,
  notes: readonly string[],
): Required<Pick<WorkStep, 'says' | 'short' | 'scene'>> {
  const why = notes
    .map((note) => note.replace(/\s+/g, ' ').trim())
    .find((note) => note && !/^keep\b/i.test(note));
  const short = why
    ? why
        .replace(/[.;:].*$/, '')
        .replace(/^the (?:note|read|critic) (?:says|said):?\s*/i, '')
    : '';
  const reason =
    short.length > 60 ? `${short.slice(0, 57).replace(/\s+\S*$/, '')}…` : short;
  return {
    scene: k,
    says: `Rewriting scene ${k + 1}${reason ? ` (${lower(reason)})` : ''}`,
    short: 'Rewriting',
  };
}

const lower = (words: string) =>
  /^[A-Z][a-z]/.test(words)
    ? words.charAt(0).toLowerCase() + words.slice(1)
    : words;

/**
 * The follower of one job: what it says, on the rows it is said about,
 * each row's writes kept in order and made only when what is said
 * changes. Never throws: a report that cannot be kept is let go.
 */
export class StudioProgress implements WorkFollower {
  /** What the job's own row says between steps. */
  private base: Pick<StudioActivity, 'says' | 'short'> | null = null;
  /** What each row says now, by row. */
  private readonly now = new Map<string, StudioActivity | null>();
  private readonly targets = new Map<string, Target>();
  /** Failures of each call so far, by call. */
  private readonly failures = new Map<string, number>();
  private readonly writes = new Map<string, Promise<void>>();
  private scenes: StudioSceneRecord[] | null = null;
  /** Steps said about scenes, taken in the order they were said. */
  private sceneSteps: Promise<void> = Promise.resolve();
  /** The call whose trouble the job's row shows, if it is one call's. */
  private troubled: string | undefined;
  private readonly own: Target;

  constructor(
    private readonly rows: Rows,
    private readonly job: StudioJobShape,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.own = job.sceneId
      ? { sceneId: job.sceneId }
      : { episodeId: job.episodeId };
  }

  /** The job begun: what it is doing, on its row, anything a try before said gone. */
  async begin(): Promise<void> {
    let position: number | null = null;
    if (this.job.sceneId && this.rows.findScene) {
      const row = await this.rows.findScene(this.job.sceneId).catch(() => null);
      position = row?.position ?? null;
    }
    this.base = jobSays(this.job, position);
    this.put(this.own, this.base ? this.stamp(this.base) : null);
  }

  step(step: WorkStep): void {
    if (step.scene !== undefined && !('sceneId' in this.own)) {
      const k = step.scene;
      this.sceneSteps = this.sceneSteps
        .then(() => this.onScene(k, step))
        .catch(() => undefined);
      return;
    }
    if (step.done) {
      this.put(this.own, this.base ? this.stamp(this.base) : null);
      return;
    }
    if (!step.says) return;
    this.put(
      this.own,
      this.stamp({
        says: step.says,
        ...(step.short ? { short: step.short } : {}),
      }),
    );
  }

  retry(notice: RetryNotice): void {
    const call = notice.call ?? `${notice.service}:*`;
    const failed = notice.waiting ? 0 : (this.failures.get(call) ?? 0) + 1;
    if (!notice.waiting) this.failures.set(call, failed);
    const attempt = notice.waiting ? undefined : (notice.attempt ?? failed + 1);
    const final =
      notice.final === true ||
      (attempt !== undefined && notice.of !== undefined && attempt > notice.of);
    const reason =
      notice.reason ??
      troubleWords(
        notice.service,
        troubleOf(notice.error, notice.status, notice.body),
      );
    const retry: NonNullable<StudioActivity['retry']> = {
      reason,
      says: retryWords({
        reason,
        attempt,
        of: notice.of,
        waitMs: notice.waitMs,
        final,
        waiting: notice.waiting,
      }),
      ...(attempt !== undefined && notice.of !== undefined && !final
        ? { attempt, of: notice.of }
        : {}),
      ...(notice.waitMs
        ? { waitSeconds: Math.round(notice.waitMs / 1000) }
        : {}),
      ...(final ? { final: true } : {}),
    };
    // Given up on: a later call like it is counted afresh.
    if (final) this.failures.delete(call);
    this.troubled = final ? undefined : notice.call;
    const was = this.now.get(keyOf(this.own)) ?? null;
    this.put(this.own, {
      says: was?.says ?? this.base?.says ?? null,
      ...(was?.short ? { short: was.short } : {}),
      retry,
      at: this.clock().toISOString(),
    });
  }

  recovered(_service: WorkService, call?: string): void {
    if (call) this.failures.delete(call);
    const key = keyOf(this.own);
    const was = this.now.get(key);
    if (!was?.retry) return;
    // Another call's answer does not end one still being tried again.
    if (!was.retry.final && this.troubled && call !== this.troubled) return;
    this.troubled = undefined;
    const { retry: _gone, ...rest } = was;
    void _gone;
    this.put(
      this.own,
      rest.says || rest.short
        ? { ...rest, at: this.clock().toISOString() }
        : null,
    );
  }

  /** The job over: every row it said anything on cleared. */
  async end(): Promise<void> {
    await this.sceneSteps;
    for (const target of this.targets.values()) this.put(target, null);
    await this.settled();
  }

  /**
   * The job failed and the queue will try it again: its row says so, and
   * why, until the next try begins; any scene it spoke of is cleared.
   */
  async failed(error: unknown): Promise<void> {
    await this.sceneSteps;
    for (const [key, target] of this.targets)
      if (key !== keyOf(this.own)) this.put(target, null);
    // Writing's troubles are the writer's; the film's may be anyone's.
    const reason = WRITING.has(this.job.kind)
      ? troubleWords('writer', troubleOf(error))
      : troubleWords('writer', 'failed');
    const attempt = this.job.attempt + 1;
    const waitMs = this.job.backoffMs;
    this.put(this.own, {
      says: this.base?.says ?? null,
      ...(this.base?.short ? { short: this.base.short } : {}),
      retry: {
        reason,
        says: retryWords({ reason, attempt, of: this.job.attempts, waitMs }),
        attempt,
        of: this.job.attempts,
        ...(waitMs ? { waitSeconds: Math.round(waitMs / 1000) } : {}),
      },
      at: this.clock().toISOString(),
    });
    await this.settled();
  }

  /** Every write asked for so far, made. */
  async settled(): Promise<void> {
    await Promise.all([...this.writes.values()]);
  }

  private stamp(said: Pick<StudioActivity, 'says' | 'short'>): StudioActivity {
    return { ...said, at: this.clock().toISOString() };
  }

  /** A step said about scene k: on its row, as its sheet is now. */
  private async onScene(k: number, step: WorkStep): Promise<void> {
    const row = await this.sceneAt(k);
    if (!row) return;
    const target = { sceneId: row.id };
    if (step.done || !step.says) {
      this.put(target, null);
      return;
    }
    this.put(target, {
      says: step.says,
      ...(step.short ? { short: step.short } : {}),
      sheetHash: row.sheetHash,
      at: this.clock().toISOString(),
    });
  }

  private async sceneAt(k: number): Promise<StudioSceneRecord | null> {
    const list = async (): Promise<StudioSceneRecord[]> => {
      const rows = await this.rows
        .listScenes(this.job.episodeId)
        .catch((): StudioSceneRecord[] => []);
      this.scenes = rows;
      return rows;
    };
    const at = (rows: StudioSceneRecord[]) =>
      rows.find((s) => s.position === k) ?? null;
    // Kept from before, else looked up again: the scenes may be new since.
    const found = at(this.scenes ?? []) ?? at(await list());
    if (!found) return null;
    // Its sheet as it is now: what is said lapses once it changes.
    const fresh = this.rows.findScene
      ? await this.rows.findScene(found.id).catch(() => null)
      : null;
    return fresh ?? found;
  }

  /** What a row says, kept: in order, and only when it changes. */
  private put(target: Target, activity: StudioActivity | null): void {
    const key = keyOf(target);
    const was = this.now.get(key);
    if (was === undefined && activity === null && !this.targets.has(key)) {
      // Nothing said here before in this job: cleared once, in case a try before left something.
      this.targets.set(key, target);
    } else if (was !== undefined && same(was, activity)) return;
    this.targets.set(key, target);
    this.now.set(key, activity);
    const before = this.writes.get(key) ?? Promise.resolve();
    this.writes.set(
      key,
      before.then(() =>
        typeof this.rows.noteActivity === 'function'
          ? this.rows.noteActivity(target, activity).catch(() => undefined)
          : undefined,
      ),
    );
  }
}

/** Whether two activities say the same, whenever they were said. */
function same(a: StudioActivity | null, b: StudioActivity | null): boolean {
  if (!a || !b) return a === b;
  const { at: _a, ...one } = a;
  const { at: _b, ...other } = b;
  void _a;
  void _b;
  return JSON.stringify(one) === JSON.stringify(other);
}

/**
 * A Studio job run followed: what it does kept on its rows as it goes,
 * cleared when it ends; if it throws (the queue will try it again), its
 * row says it is being tried again, and why.
 */
export async function followStudioJob<T>(
  rows: Rows,
  job: StudioJobShape,
  work: () => Promise<T>,
): Promise<T> {
  const progress = new StudioProgress(rows, job);
  await progress.begin().catch(() => undefined);
  try {
    const done = await followWork(progress, work);
    await progress.end().catch(() => undefined);
    return done;
  } catch (error) {
    await progress.failed(error).catch(() => undefined);
    throw error;
  }
}
