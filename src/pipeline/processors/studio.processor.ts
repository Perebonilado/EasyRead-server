import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DocumentProfile } from '../../business/domain/scene-profile';
import {
  AUDIENCE_STAGE,
  bibleOf,
  explainerSheetOf,
  outlineOf,
  storySheetOf,
  WORDS_A_SECOND,
  type ExplainerSheet,
  type StorySheet,
  type StudioBible,
  type StudioOutline,
} from '../../business/domain/studio/studio';
import {
  checkBible,
  checkExplainer,
  checkOutline,
  checkSheet,
  describeEnd,
  distinctVoices,
  endBefore,
  endStateOf,
  errorsIn,
  mendOutline,
  mendSheet,
  repairExplainer,
  repairSheet,
  sentBackFor,
  keptFeatures,
  withFeatures,
  type EndState,
  type SheetProblem,
} from '../../business/domain/studio/studio-check';
import {
  auditScene,
  describeAudit,
} from '../../business/domain/studio/studio-audit';
import type { SceneDto } from '../../contracts';
import {
  stageStory,
  storyBibleFor,
} from '../../business/domain/studio/studio-stage';
import {
  describeBible,
  describeBrief,
  describeEarlier,
  describeOutline,
  describeOutlineScene,
  describeScene,
} from '../../business/domain/studio/studio-words';
import { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import { iconicOf } from '../../business/domain/scene-iconic';
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import { JOB_QUEUE, LLM_GATEWAY, STORAGE } from '../../business/ports/tokens';
import type { JobQueuePort } from '../../business/ports/job-queue.port';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type { TopicRecord } from '../../business/repositories/misc.repository';
import type {
  StudioEpisodeRecord,
  StudioEventRecord,
  StudioRepository,
  StudioSceneRecord,
  StudioShowRecord,
} from '../../business/repositories/studio.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  STUDIO_REPOSITORY,
} from '../../business/repositories/tokens';
import { sceneFingerprint } from '../../business/handlers/studio/studio-views';
import {
  EVENT_LINES,
  logEvent,
} from '../../business/handlers/studio/studio-log';
import {
  StudioCastService,
  studioCastKey,
  studioSetsKey,
} from '../../business/handlers/studio/studio-cast.service';
import type { StudioJobData } from '../queues';
import { isPermanentFailure, type JobContext } from './base.processor';
import { SceneProcessor } from './scene.processor';

/** Explainer scenes written at once: each is its own lesson page. */
const WRITERS = 3;

/** Work that did not go through, as the thread says it: where, and what to do. */
const FAILED: Record<
  'bible' | 'outline' | 'script' | 'scene',
  { step: StudioEventRecord['step']; line: string }
> = {
  bible: {
    step: 'cast',
    line: 'The cast could not be changed. Try again in a moment.',
  },
  outline: {
    step: 'outline',
    line: 'The outline could not be written. Try again in a moment.',
  },
  script: {
    step: 'script',
    line: 'The scenes could not all be written. Try again in a moment.',
  },
  scene: {
    step: 'script',
    line: 'The scene could not be written. Try again in a moment.',
  },
};

/**
 * What one scene of a film is made from, as the worker makes it: its
 * sheet put right and staged, the film's profile, its episode as the
 * chapter, and the show's cast and sets. Shared with scripts/studio-remake,
 * which makes a scene again the same way without touching its row.
 */
export function studioMakeOf(
  show: StudioShowRecord,
  episode: StudioEpisodeRecord,
  row: StudioSceneRecord,
  rows: StudioSceneRecord[],
  bible: StudioBible,
): Omit<Parameters<SceneProcessor['make']>[0], 'base' | 'who'> {
  const story = row.sheet?.kind === 'story';
  const stage = show.brief.audience
    ? AUDIENCE_STAGE[show.brief.audience]
    : null;
  const lesson = {
    teach: episode.outline?.scenes[row.position]?.teach ?? null,
    source: show.brief.source,
    stage,
    maths: bible.maths,
    planned: null,
  };
  // Whatever the writer left wrong is put right here, so a scene is
  // always one the stage can play: carrying on from how the scene before
  // left things, on its set with every feature its words name.
  const before = endBefore(rows, row.position, bible);
  const sheet = story
    ? repairSheet(row.sheet as StorySheet, bible, before)
    : null;
  const staged = sheet
    ? withFeatures(bible, sheet.set, mendSheet(sheet, bible, before).features)
    : bible;
  const script = sheet
    ? stageStory(sheet, staged, { before })
    : checkExplainer(
        repairExplainer(row.sheet as ExplainerSheet, lesson),
        lesson,
      ).script;
  // Made, each action, thing handled and reaction is looked for in the
  // film: one that shows nothing is played again by its fallback, and
  // what does not show as its words say is logged for us, never the maker.
  const recheck = sheet
    ? (scene: SceneDto) => {
        const seen = auditScene(sheet, scene, staged);
        const unseen = seen.filter((one) => one.verdict === 'unseen');
        const notes = describeAudit(seen);
        return {
          notes: notes.length ? [`audit: ${notes.join('; ')}`] : [],
          script: unseen.length
            ? stageStory(sheet, staged, {
                before,
                plain: new Set(unseen.map((one) => one.beat)),
              })
            : null,
        };
      }
    : undefined;
  // A film's scene: played as a clip of the film, its shots cut.
  const profile: DocumentProfile & { film: true } = {
    film: true,
    subject: story ? 'a story' : bible.subject,
    kind: story ? 'fiction' : 'textbook',
    tone:
      show.brief.tone === 'serious'
        ? 'serious'
        : show.brief.tone === 'funny' || show.brief.tone === 'exciting'
          ? 'light'
          : 'neutral',
    formats: bible.maths ? ['explainer', 'maths'] : ['explainer'],
    story,
    stage,
  };
  const sheets = rows
    .map((r) => r.sheet)
    .filter((s): s is StorySheet => s?.kind === 'story');
  const topic: TopicRecord = {
    id: episode.id,
    title: episode.outline?.title ?? episode.title,
    shortDescription: null,
    startPage: 1,
    endPage: rows.length,
    orderIndex: episode.number,
  };
  return {
    // The ledger keeps the film's cost against its episode.
    documentId: episode.id,
    documentTitle: show.title,
    topic,
    material: '',
    context: '',
    profile,
    story: story
      ? {
          bible: storyBibleFor(bible, sheets, show.title),
          page: row.position + 1,
          castKey: studioCastKey(show.id),
          setsKey: studioSetsKey(show.id),
          bookTitle: show.title,
        }
      : null,
    script,
    kept: new Map(),
    ...(recheck ? { recheck } : {}),
  };
}

/**
 * Whether one set of problems is worse than another: more that keep a
 * scene from being made, then more of anything sent back. Below zero,
 * better; zero, as good.
 */
function worse(a: readonly SheetProblem[], b: readonly SheetProblem[]): number {
  return (
    errorsIn(a).length - errorsIn(b).length ||
    sentBackFor(a).length - sentBackFor(b).length
  );
}

/**
 * A figure every tradition draws one way (Jesus, Moses, John the Baptist)
 * starts out looking that way, as in a book's pages; after that the look
 * is the maker's, changed on the cast card or by asking.
 */
function traditional(
  bible: StudioBible,
  before: StudioBible | null,
): StudioBible {
  return {
    ...bible,
    characters: bible.characters.map((c) => {
      if (c.kind !== 'person') return c;
      if (before?.characters.some((was) => was.id === c.id)) return c;
      const known = iconicOf([c.name], false);
      return known
        ? {
            ...c,
            figure: known.figure,
            carries: c.carries ?? known.carries ?? null,
          }
        : c;
    }),
  };
}

/** Each item through `work`, at most `limit` at a time. */
async function inBatches<T>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const at = next++;
      await work(items[at], at);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
}

/**
 * The Studio's work, off the request path: a show's cast, an episode's
 * outline, its scenes written and checked one by one (a story's in order,
 * each carrying on from how the one before left the stage), a scene
 * written again as the maker asked, and each scene made into film by the
 * same stage a book's pages are made on, playing exactly its sheet.
 *
 * Every writer's answer is made sound and checked by code; one that fails
 * the check is sent back once with what is wrong, and the better of the
 * two is kept. A scene that still has problems keeps them on its card: it
 * is not made until they are put right.
 */
@Injectable()
export class StudioProcessor {
  private readonly logger = new Logger(StudioProcessor.name);

  constructor(
    @Inject(STUDIO_REPOSITORY) private readonly studio: StudioRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly scenes: SceneProcessor,
    private readonly entitlements: EntitlementsService,
    private readonly cast: StudioCastService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueuePort,
  ) {}

  async process(job: StudioJobData, context: JobContext): Promise<void> {
    const show = await this.studio.findShow(job.showId);
    const episode = await this.studio.findEpisode(job.episodeId);
    if (!show || !episode) return;
    const who = `studio ${episode.id} (${job.kind})`;
    // What the job records in the thread: once, however often it is tried.
    const key = context.jobId ? `job:${context.jobId}` : undefined;
    const failed = key ? `${key}:failed` : undefined;
    try {
      if (job.kind === 'bible')
        await this.writeBible(show, episode, job.request, true, key);
      else if (job.kind === 'outline')
        await this.writeOutline(show, episode, job.request, key);
      else if (job.kind === 'script')
        await this.writeScript(show, episode, key);
      else if (job.kind === 'scene' && job.sceneId)
        await this.rewriteScene(
          show,
          episode,
          job.sceneId,
          job.request ?? '',
          key,
        );
      else if (job.kind === 'prepare')
        await this.prepare(show, episode, job.userId, job.sceneIds ?? []);
      else if (job.kind === 'make' && job.sceneId)
        await this.make(show, episode, job.sceneId, job.userId, context);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${who}: ${message}`);
      const last = context.isFinalAttempt || isPermanentFailure(error);
      if (job.kind === 'make' && job.sceneId) {
        if (!last) throw error;
        await this.studio.updateScene(job.sceneId, {
          status: 'failed',
          step: null,
          error: 'This scene could not be made. Try making it again.',
        });
        const row = await this.studio.findScene(job.sceneId);
        await this.log(
          show,
          episode,
          {
            what: 'failed',
            step: 'made',
            sceneId: job.sceneId,
            line: `Scene ${(row?.position ?? 0) + 1} could not be made. Make the film again to try once more.`,
          },
          failed,
        );
        await this.settle(show, episode);
        return;
      }
      if (job.kind === 'prepare') {
        if (!last) throw error;
        for (const id of job.sceneIds ?? [])
          await this.studio.updateScene(id, {
            status: 'failed',
            step: null,
            error: 'The cast could not be drawn. Try making it again.',
          });
        await this.log(
          show,
          episode,
          {
            what: 'failed',
            step: 'made',
            line: 'The cast could not be drawn for the film. Make the film again to try once more.',
          },
          failed,
        );
        await this.settle(show, episode);
        return;
      }
      if (!last) throw error;
      if (job.kind !== 'make') {
        const row = job.sceneId
          ? await this.studio.findScene(job.sceneId)
          : null;
        await this.log(
          show,
          episode,
          {
            what: 'failed',
            ...FAILED[job.kind],
            ...(row
              ? {
                  sceneId: row.id,
                  line: `Scene ${row.position + 1} could not be written. Try again in a moment.`,
                }
              : {}),
          },
          failed,
        );
      }
      if (job.kind === 'scene' && job.sceneId)
        await this.studio.updateScene(job.sceneId, { status: 'ready' });
      if (job.kind === 'script')
        for (const scene of await this.studio.listScenes(episode.id))
          if (scene.status === 'writing')
            await this.studio.updateScene(scene.id, {
              status: 'failed',
              error: 'This scene could not be written. Ask for it again.',
            });
      await this.studio.updateEpisode(episode.id, {
        busy: null,
        error: 'That did not work. Try again in a moment.',
      });
    }
  }

  // ── The cast ────────────────────────────────────────────────────────────

  /**
   * A show's cast and places from its brief; or, with a request, changed
   * as the maker asks, ids kept. Drawings of anyone or anywhere whose look
   * changed are forgotten, so they are drawn again.
   */
  private async writeBible(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    request?: string,
    /** Whether the episode is free once the cast is written: not when an outline comes next. */
    release = true,
    /** What the job records in the thread under, once. */
    key?: string,
  ): Promise<StudioBible> {
    const story = show.brief.format !== 'explainer';
    const before = show.bible;
    const brief = describeBrief(show.brief);
    const first = await this.llm.studioBible({
      brief,
      ...(request && before ? { previous: before, request } : {}),
    });
    await this.record(episode.id, first.usage);
    // A set's features, once named, are its for good.
    let bible = keptFeatures(
      distinctVoices(traditional(bibleOf(first.value), before)),
      before,
    );
    const problems = checkBible(bible, story);
    if (problems.length) {
      this.logger.log(
        `studio ${episode.id}: the cast goes back: ${problems.join(' ')}`,
      );
      const again = await this.llm.studioBible({
        brief,
        previous: first.value,
        problems,
        ...(request ? { request } : {}),
      });
      await this.record(episode.id, again.usage);
      const second = keptFeatures(
        distinctVoices(traditional(bibleOf(again.value), before)),
        before,
      );
      if (checkBible(second, story).length <= problems.length) bible = second;
    }
    await this.studio.updateShow(show.id, { bible });
    if (before) await this.cast.forgetChanged(show.id, before, bible);
    if (request && release) {
      await this.log(
        show,
        episode,
        {
          what: 'cast',
          step: 'cast',
          line: EVENT_LINES.cast(bible.characters.length, bible.sets.length),
        },
        key,
      );
      await this.studio.updateEpisode(episode.id, { busy: null, error: null });
    }
    this.logger.log(
      `studio ${episode.id}: cast of ${bible.characters.map((c) => c.name).join(', ') || 'no one'}; places ${bible.sets.map((s) => s.name).join(', ') || 'none'}`,
    );
    return bible;
  }

  // ── The outline ─────────────────────────────────────────────────────────

  private async writeOutline(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    request?: string,
    key?: string,
  ): Promise<void> {
    const story = show.brief.format !== 'explainer';
    // A new episode of a story may go somewhere new, or meet someone new:
    // they join the cast first, everyone else as they were.
    const fresh = story && episode.number > 1 && !episode.outline && request;
    const bible =
      show.bible && fresh
        ? await this.writeBible(
            show,
            episode,
            `The next episode: ${request}. Add any place and any character it needs that the show does not have yet; keep everyone and everywhere else exactly as they are.`,
            false,
          )
        : (show.bible ?? (await this.writeBible(show, episode)));
    const earlier = (await this.studio.listEpisodes(show.id)).filter(
      (e) => e.number < episode.number,
    );
    const ask = {
      brief: describeBrief(show.brief),
      bible: describeBible(bible, story),
      ...(earlier.length ? { before: describeEarlier(earlier) } : {}),
    };
    const minutes = show.brief.minutes ?? 1;
    const revising = Boolean(request && episode.outline);
    const first = await this.llm.studioOutline({
      ...ask,
      ...(revising ? { previous: episode.outline, request } : {}),
      ...(!revising && request ? { request } : {}),
    });
    await this.record(episode.id, first.usage);
    let outline = mendOutline(outlineOf(first.value), bible);
    let problems = checkOutline(
      outline,
      bible,
      minutes,
      story,
      episode.number === 1,
    );
    if (problems.length) {
      this.logger.log(
        `studio ${episode.id}: the outline goes back: ${problems.join(' ')}`,
      );
      const again = await this.llm.studioOutline({
        ...ask,
        previous: first.value,
        problems,
        ...(request ? { request } : {}),
      });
      await this.record(episode.id, again.usage);
      const second = mendOutline(outlineOf(again.value), bible);
      const left = checkOutline(
        second,
        bible,
        minutes,
        story,
        episode.number === 1,
      );
      if (left.length <= problems.length) [outline, problems] = [second, left];
    }
    if (!outline.scenes.length) throw new Error('The outline came back empty');
    await this.log(
      show,
      episode,
      {
        what: 'outline',
        step: 'outline',
        line: EVENT_LINES.outline(outline, revising),
      },
      key,
    );
    // What the maker added to the brief while it was being written is taken
    // in: it is written again with the brief as it is now, straight after.
    const now = await this.studio.findShow(show.id);
    const moved =
      now !== null && describeBrief(now.brief) !== describeBrief(show.brief);
    await this.studio.updateEpisode(episode.id, {
      outline,
      title: outline.title,
      logline: outline.logline,
      phase: 'outline',
      busy: moved ? 'outline' : null,
      error: null,
    });
    if (moved) {
      await this.queue.enqueueStudio([
        {
          kind: 'outline',
          showId: show.id,
          episodeId: episode.id,
          userId: show.userId,
          request: 'Take in what the brief says now.',
        },
      ]);
      await this.log(
        show,
        episode,
        {
          what: 'asked',
          step: 'outline',
          line: 'Writing the outline again with what the brief says now',
        },
        key && `${key}:again`,
      );
    }
    if (episode.number === 1 && (show.title === 'New show' || !show.title))
      await this.studio.updateShow(show.id, { title: outline.title });
    this.logger.log(
      `studio ${episode.id}: outlined "${outline.title}", ${outline.scenes.length} scenes, ${outline.scenes.reduce((n, s) => n + s.seconds, 0)}s${problems.length ? `; left: ${problems.join(' ')}` : ''}`,
    );
  }

  // ── The scenes ──────────────────────────────────────────────────────────

  /** Every scene of the outline written and checked: a story's in order, an explainer's a few at once. */
  private async writeScript(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
  ): Promise<void> {
    const outline = episode.outline;
    if (!outline) throw new Error('No outline to write from');
    const bible = show.bible ?? (await this.writeBible(show, episode));
    const rows = await this.studio.replaceScenes(
      episode.id,
      outline.scenes.length,
    );
    if (show.brief.format === 'explainer')
      await inBatches(rows, WRITERS, async (row, k) => {
        await this.writeExplainerScene(show, episode, outline, bible, row, k);
      });
    else {
      let before: EndState | null = null;
      for (const [k, row] of rows.entries()) {
        const sheet = await this.writeStoryScene(
          show,
          episode,
          outline,
          bible,
          row,
          k,
          before,
        );
        if (sheet) before = endStateOf(sheet, bible, before);
      }
    }
    await this.log(
      show,
      episode,
      { what: 'scenes', step: 'script', line: EVENT_LINES.scenes(rows.length) },
      key,
    );
    await this.studio.updateEpisode(episode.id, { busy: null, error: null });
  }

  /** A scene written again as the maker asked, the rest of it kept. */
  private async rewriteScene(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    sceneId: string,
    request: string,
    key?: string,
  ): Promise<void> {
    const outline = episode.outline;
    const row = await this.studio.findScene(sceneId);
    if (!outline || !row) return;
    const bible = show.bible ?? (await this.writeBible(show, episode));
    const k = row.position;
    try {
      let title: string | undefined;
      if (show.brief.format === 'explainer')
        title = (
          await this.writeExplainerScene(
            show,
            episode,
            outline,
            bible,
            row,
            k,
            request,
          )
        ).title;
      else {
        const rows = await this.studio.listScenes(episode.id);
        const before = endBefore(rows, k, bible);
        title = (
          await this.writeStoryScene(
            show,
            episode,
            outline,
            bible,
            row,
            k,
            before,
            request,
          )
        )?.title;
      }
      // A scene added has no sheet before this one: it is written, not written again.
      await this.log(
        show,
        episode,
        {
          what: 'scene',
          step: 'script',
          sceneId: row.id,
          line: EVENT_LINES.scene(
            k,
            title ?? outline.scenes[k]?.title ?? `Scene ${k + 1}`,
            Boolean(row.sheet),
          ),
        },
        key,
      );
    } finally {
      // Free once no other scene is being written again.
      const rows = await this.studio.listScenes(episode.id);
      if (!rows.some((r) => r.status === 'writing'))
        await this.studio.updateEpisode(episode.id, { busy: null });
    }
  }

  /**
   * One story scene: written from the outline and how the scene before
   * left the stage, mended, checked, and sent back once with its errors.
   */
  private async writeStoryScene(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    outline: StudioOutline,
    bible: StudioBible,
    row: StudioSceneRecord,
    k: number,
    before: EndState | null,
    request?: string,
  ): Promise<StorySheet | null> {
    const planned = outline.scenes[k]?.seconds ?? null;
    const ask = {
      brief: describeBrief(show.brief),
      bible: describeBible(bible, true),
      outline: describeOutline(outline, true),
      scene: outline.scenes[k]
        ? describeOutlineScene(outline.scenes[k], k, true)
        : `Scene ${k + 1}: the scene the maker asked for.`,
      before: describeEnd(before, bible),
    };
    const old = row.sheet?.kind === 'story' ? row.sheet : null;
    const first = await this.llm.studioScene({
      ...ask,
      ...(request && old ? { previous: old, request } : {}),
    });
    await this.record(episode.id, first.usage);
    const judged = (raw: unknown) => {
      const mended = mendSheet(storySheetOf(raw), bible, before);
      return {
        sheet: mended.sheet,
        mended: mended.mended,
        features: mended.features,
        problems: checkSheet(mended.sheet, bible, planned, before),
      };
    };
    let best = judged(first.value);
    const reasons = sentBackFor(best.problems);
    if (reasons.length) {
      this.logger.log(
        `studio ${episode.id} s${k + 1}: goes back: ${reasons.map((p) => p.message).join(' ')}`,
      );
      const again = await this.llm.studioScene({
        ...ask,
        previous: first.value,
        problems: reasons.map((p) => p.message),
        ...(request ? { request } : {}),
      });
      await this.record(episode.id, again.usage);
      const second = judged(again.value);
      if (worse(second.problems, best.problems) <= 0) best = second;
    }
    // What the writer still got wrong is put right here, not handed to
    // the maker: the scene is always one the stage can play.
    if (errorsIn(best.problems).length) {
      this.logger.log(
        `studio ${episode.id} s${k + 1}: repaired: ${errorsIn(best.problems)
          .map((p) => p.message)
          .join(' ')}`,
      );
      const sheet = repairSheet(best.sheet, bible, before);
      best = {
        ...best,
        sheet,
        problems: checkSheet(sheet, bible, planned, before),
      };
    }
    if (best.mended.length)
      this.logger.log(
        `studio ${episode.id} s${k + 1}: mended: ${best.mended.slice(0, 8).join('; ')}`,
      );
    // A feature the words name joins its set for good, as new places and
    // people join the cast: the next scene there has it too.
    const features = mendSheet(best.sheet, bible, before).features;
    if (features.length) {
      const grown = withFeatures(bible, best.sheet.set, features);
      await this.studio.updateShow(show.id, { bible: grown });
      bible.sets.splice(0, bible.sets.length, ...grown.sets);
    }
    await this.studio.updateScene(row.id, {
      sheet: best.sheet,
      sheetHash: sceneFingerprint(best.sheet, bible, show.brief),
      problems: best.problems,
      ...(request && old ? { previousSheet: old } : {}),
      status: 'ready',
      error: null,
    });
    return best.sheet;
  }

  /**
   * One explainer scene: its narration and storyboard written as a
   * lesson's page is, from what the outline says it teaches, held to the
   * lesson checks and sent back once.
   */
  private async writeExplainerScene(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    outline: StudioOutline,
    bible: StudioBible,
    row: StudioSceneRecord,
    k: number,
    request?: string,
  ): Promise<ExplainerSheet> {
    const scene = outline.scenes[k];
    const stage = show.brief.audience
      ? AUDIENCE_STAGE[show.brief.audience]
      : null;
    const teach = scene?.teach ?? scene?.summary ?? show.brief.idea;
    // A page fuller than the seconds can say: the writer keeps to its main
    // ideas, and does not run long to say them all.
    const fuller =
      teach.split(/\s+/).length > (scene?.seconds ?? 30) * WORDS_A_SECOND * 1.4;
    const around = [
      outline.scenes[k - 1]
        ? `The scene before taught: ${outline.scenes[k - 1].summary}`
        : 'It is the first scene: open with a hook.',
      outline.scenes[k + 1]
        ? `The scene after will teach: ${outline.scenes[k + 1].summary}`
        : 'It is the last scene: end with a short recap.',
    ].join(' ');
    const ask = {
      documentTitle: show.title,
      topicTitle: outline.title,
      material: teach,
      context: `This is scene ${k + 1} of ${outline.scenes.length} of the animated lesson "${outline.title}": "${scene?.title ?? ''}", about ${scene?.seconds ?? 30} seconds. ${around} Teach only what this scene says; the scenes either side teach the rest.${fuller ? ` The page is fuller than ${scene?.seconds ?? 30} seconds can say: keep to its main ideas and leave out the detail.` : ''}`,
      profile: [
        describeScene(stage, scene?.seconds ?? 30),
        `Subject: ${bible.subject || show.brief.idea}. Tone: ${show.brief.tone ?? 'calm'}.`,
      ]
        .filter(Boolean)
        .join('\n'),
      notes: [
        scene?.points.length
          ? `The small ideas, each with what to show:\n- ${scene.points.join('\n- ')}`
          : '',
        describeBible(bible, false),
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
    const old = row.sheet?.kind === 'explainer' ? row.sheet : null;
    const first = await this.llm.sceneScript({
      ...ask,
      ...(request && old
        ? {
            previous: old.draft,
            problems: [
              `The maker asks for this change; make it and keep the rest: ${request}`,
            ],
          }
        : {}),
    });
    await this.record(episode.id, first.usage);
    const options = {
      teach,
      source: show.brief.source,
      stage,
      maths: bible.maths,
      planned: scene?.seconds ?? null,
    };
    const sheetFrom = (draft: unknown): ExplainerSheet =>
      explainerSheetOf({
        kind: 'explainer',
        title: scene?.title,
        transition: 'cut',
        draft,
      });
    let sheet = sheetFrom(first.value);
    let problems: SheetProblem[] = checkExplainer(sheet, options).problems;
    const reasons = sentBackFor(problems);
    if (reasons.length) {
      this.logger.log(
        `studio ${episode.id} s${k + 1}: goes back: ${reasons.map((p) => p.message).join(' ')}`,
      );
      const again = await this.llm.sceneScript({
        ...ask,
        previous: first.value,
        problems: reasons.map((p) => p.message),
      });
      await this.record(episode.id, again.usage);
      const second = sheetFrom(again.value);
      const left = checkExplainer(second, options).problems;
      if (worse(left, problems) <= 0) [sheet, problems] = [second, left];
    }
    // A picture the writer still got wrong is set in type, not handed to
    // the maker to put right.
    if (errorsIn(problems).length) {
      sheet = repairExplainer(sheet, options);
      problems = checkExplainer(sheet, options).problems;
    }
    await this.studio.updateScene(row.id, {
      sheet,
      sheetHash: sceneFingerprint(sheet, bible, show.brief),
      problems,
      ...(request && old ? { previousSheet: old } : {}),
      status: 'ready',
      error: null,
    });
    return sheet;
  }

  // ── Making a scene ──────────────────────────────────────────────────────

  /**
   * Before a film's scenes are made side by side: everyone and everywhere
   * in them drawn and painted, once, and kept for the whole show. Then
   * each scene, made at once on whichever worker is free, draws on the
   * same drawings, so no one looks different from one scene to the next.
   */
  private async prepare(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    userId: string,
    sceneIds: string[],
  ): Promise<void> {
    const rows = await this.studio.listScenes(episode.id);
    const wanted = rows.filter((r) => sceneIds.includes(r.id));
    const sheets = rows
      .map((r) => r.sheet)
      .filter((s): s is StorySheet => s?.kind === 'story');
    const bible = show.bible;
    if (bible && sheets.length) {
      for (const row of wanted)
        await this.studio.updateScene(row.id, { step: 'drawing' });
      const made = wanted
        .map((r) => r.sheet)
        .filter((s): s is StorySheet => s?.kind === 'story');
      await this.scenes.prepareStory(
        {
          bible: storyBibleFor(bible, sheets, show.title),
          page: 1,
          castKey: studioCastKey(show.id),
          setsKey: studioSetsKey(show.id),
          bookTitle: show.title,
        },
        episode.id,
        `studio ${episode.id} (cast)`,
        {
          characters: new Set(
            made.flatMap((s) => [
              ...s.onStage.map((p) => p.who),
              ...s.beats.flatMap((b) => (b.who ? [b.who] : [])),
            ]),
          ),
          places: new Set(made.map((s) => s.set)),
        },
      );
    }
    await this.queue.enqueueStudio(
      wanted.map((row) => ({
        kind: 'make' as const,
        showId: show.id,
        episodeId: episode.id,
        userId,
        sceneId: row.id,
      })),
    );
  }

  /**
   * One scene made into film: its sheet staged exactly, drawn, voiced and
   * composed by the stage a book's pages are made on, and stored beside
   * its audio and a still. The month's film is spent as it is made.
   */
  private async make(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    sceneId: string,
    userId: string,
    context: JobContext,
  ): Promise<void> {
    const row = await this.studio.findScene(sceneId);
    if (!row?.sheet) return;
    const bible = show.bible ?? (await this.writeBible(show, episode));
    const rows = await this.studio.listScenes(episode.id);
    const fingerprint = sceneFingerprint(row.sheet, bible, show.brief);
    const who = `studio ${episode.id} s${row.position + 1}`;
    await this.studio.updateScene(row.id, {
      status: 'making',
      step: 'drawing',
      error: null,
    });
    const made = await this.scenes.make({
      ...studioMakeOf(show, episode, row, rows, bible),
      base: `studio/${show.id}/${episode.id}/${row.id}-${fingerprint.slice(0, 8)}-${Date.now().toString(36)}`,
      who,
      keepAs: `studio-${row.id}`,
      step: (step) => this.studio.updateScene(row.id, { step }),
    });
    if (made.fit === 'poor') throw new Error(made.reason);
    const { scene, sceneKey, thumbKey, voice } = made;
    await this.studio.updateScene(row.id, {
      status: 'made',
      step: null,
      error: null,
      sceneKey,
      audioKey: voice.audioKey,
      thumbKey,
      madeHash: fingerprint,
      durationMs: voice.durationMs,
    });
    // The files it was made from before are no one's now.
    for (const key of [row.sceneKey, row.audioKey, row.thumbKey])
      if (key && ![sceneKey, voice.audioKey, thumbKey].includes(key))
        await this.storage.delete(key).catch(() => undefined);
    await this.entitlements.recordStudioSeconds(
      userId,
      voice.durationMs / 1000,
    );
    this.logger.log(
      `${who}: made "${scene.title}" in ${Math.round(voice.durationMs / 1000)}s of film, ${scene.steps.length} stage changes, ${scene.effects.length} effects${context.attemptsMade > 1 ? ` (try ${context.attemptsMade})` : ''}`,
    );
    await this.settle(show, episode);
  }

  /**
   * An episode whose scenes are all made, or given up on: made, its length
   * the sum of its scenes', its still the first scene's; and the film
   * recorded in the thread, once, however many scenes finish at once, and
   * only when something in it was made anew: saying how many of its scenes
   * it has when some could not be made.
   */
  private async settle(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<void> {
    const episodeId = episode.id;
    const rows = await this.studio.listScenes(episodeId);
    if (rows.some((r) => r.status === 'making')) return;
    const made = rows.filter((r) => r.status === 'made' && r.sceneKey);
    const durationMs = made.reduce((n, r) => n + (r.durationMs ?? 0), 0);
    if (made.length)
      await this.log(
        show,
        episode,
        {
          what: 'made',
          step: 'made',
          line: EVENT_LINES.made(
            episode.outline?.title ?? episode.title,
            durationMs / 1000,
            { made: made.length, of: rows.length },
          ),
        },
        // Every scene made anew is a new file, and one that could not be
        // made again keeps the file it had: the same files, the same film,
        // so a make that made nothing new records nothing.
        `made:${rows.flatMap((r) => (r.sceneKey ? [r.sceneKey] : [])).join(',')}`,
      );
    await this.studio.updateEpisode(episodeId, {
      busy: null,
      ...(made.length
        ? {
            phase: 'made',
            durationMs,
            thumbKey: made[0].thumbKey,
          }
        : {}),
      error: rows.some((r) => r.status === 'failed')
        ? 'Some scenes could not be made. Make the episode again to try them once more.'
        : null,
    });
  }

  /** Something that happened, recorded in the thread, once for its key: never in the way of the work. */
  private async log(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    event: StudioEventRecord,
    key?: string,
  ): Promise<void> {
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: episode.id },
      event,
      key,
    ).catch((error: Error) =>
      this.logger.warn(`studio ${episode.id}: not recorded: ${error.message}`),
    );
  }

  private async record(episodeId: string, usage: LlmUsage): Promise<void> {
    await this.calls.record({
      documentId: episodeId,
      task: 'studio_write',
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      tokensCached: usage.tokensCached ?? null,
      latencyMs: usage.latencyMs,
      outcome: 'ok',
    });
  }
}
