import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DocumentProfile } from '../../business/domain/scene-profile';
import {
  AUDIENCE_STAGE,
  bibleOf,
  explainerSheetOf,
  outlineOf,
  secondsOf,
  storySheetOf,
  WORDS_A_SECOND,
  type ExplainerSheet,
  type StorySheet,
  type StudioBible,
  type StudioCharacter,
  type StudioOutline,
} from '../../business/domain/studio/studio';
import {
  carriedWears,
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
  linesKept,
  wearFrom,
  withFound,
  type EndState,
  type SheetProblem,
} from '../../business/domain/studio/studio-check';
import {
  auditScene,
  describeAudit,
} from '../../business/domain/studio/studio-audit';
import {
  askedGone,
  concerns,
  describeStaged,
  stagedFaults,
  stillThere,
} from '../../business/domain/studio/studio-staged';
import type { SceneDto } from '../../contracts';
import {
  onItsVoice,
  paintedAt,
  stageStory,
  storyBibleFor,
} from '../../business/domain/studio/studio-stage';
import {
  setsOf,
  type Cast,
  type CharacterSheet,
  type Sets,
} from '../../business/domain/scene-sheet';
import {
  describeBible,
  describeBrief,
  describeEarlier,
  describeOutline,
  describeOutlineScene,
  describeScene,
  tellOf,
} from '../../business/domain/studio/studio-words';
import { EntitlementsService } from '../../business/handlers/documents/entitlements.service';
import { iconicOf } from '../../business/domain/scene-iconic';
import type {
  LlmGatewayPort,
  LlmTask,
  LlmUsage,
  StudioCheckVerdict,
} from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import { JOB_QUEUE, LLM_GATEWAY, STORAGE } from '../../business/ports/tokens';
import type {
  JobQueuePort,
  StudioAsk,
} from '../../business/ports/job-queue.port';
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
  studioOwnKey,
  studioSetsKey,
} from '../../business/handlers/studio/studio-cast.service';
import { DRAWN } from '../../business/domain/scene-own';
import {
  castLine,
  doneDrawing,
  gesturingIn,
  keptDrawn,
  keptKits,
  oneLookRequest,
  withCandidate,
} from '../../business/domain/studio/studio-drawings';
import {
  describeAnimal,
  type AnimalSpec,
} from '../../business/domain/scene-animal';
import {
  describeCreature,
  type CreatureSpec,
} from '../../business/domain/scene-creature';
import { animalSheet, creatureSheet } from '../../business/domain/scene-sheet';

/** A kit's spec for a character: an animal's, or a creature's. */
type KitSpec = AnimalSpec | CreatureSpec;
import type { StudioJobData } from '../queues';
import { isPermanentFailure, type JobContext } from './base.processor';
import { SceneProcessor } from './scene.processor';

/** Explainer scenes written at once: each is its own lesson page. */
const WRITERS = 3;

/** What the thread records of a maker's request, for one scene of it and one try: each scene asked for its own. */
const askKey = (ask: StudioAsk, sceneId: string) =>
  `ask:${ask.id}:${sceneId}:${ask.tries}`;

/** What a check that could not show what was asked says of the film, when it had no words of its own. */
const STILL_SHOWS = 'the film still shows what it did before';

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
  /** The show's sets as painted, where they are: its features stand where they are painted. */
  sets: Sets | null = null,
  /** Those the artist drew whose rigs turn their arms and nod: they gesture as people do. */
  gestures: ReadonlySet<string> = new Set(),
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
  const painted = sheet ? paintedAt(sets?.[sheet.set]) : {};
  const staged = sheet
    ? withFound(bible, sheet.set, mendSheet(sheet, bible, before))
    : bible;
  const script = sheet
    ? stageStory(sheet, staged, { before, painted, gestures })
    : checkExplainer(
        repairExplainer(row.sheet as ExplainerSheet, lesson),
        lesson,
      ).script;
  // Made, each action, thing handled and reaction is looked for in the
  // film: one that shows nothing is played again by its fallback, and
  // what does not show as its words say is logged for us, never the maker.
  // So too how it is staged: someone moving while still sat or lain down
  // gets up first; what else code sees is logged for us.
  const recheck = sheet
    ? (scene: SceneDto) => {
        const seen = auditScene(sheet, scene, staged);
        const unseen = seen.filter((one) => one.verdict === 'unseen');
        const notes = describeAudit(seen);
        const faults = stagedFaults(sheet, scene, staged);
        const rise = new Set(
          faults.flatMap((f) =>
            f.id === 'furniture-moves' && f.beat !== null ? [f.beat] : [],
          ),
        );
        return {
          notes: [
            ...(notes.length ? [`audit: ${notes.join('; ')}`] : []),
            ...(faults.length
              ? [
                  `staging: ${faults.map((f) => `${f.id}${f.beat !== null ? ` b${f.beat}` : ''} ${f.why}`).join('; ')}`,
                ]
              : []),
          ],
          script:
            unseen.length || rise.size
              ? stageStory(sheet, staged, {
                  before,
                  painted,
                  gestures,
                  plain: new Set(unseen.map((one) => one.beat)),
                  ...(rise.size ? { rise } : {}),
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
          ownKey: studioOwnKey(show.id),
          bookTitle: show.title,
        }
      : null,
    script,
    kept: new Map(),
    ...(recheck ? { recheck } : {}),
  };
}

/**
 * An episode as its scenes leave it once none is making: made, its length
 * the sum of its made scenes', its still the first's; and a word for the
 * maker when some could not be made. Its film as it was when none is made.
 */
export function settledEpisode(
  rows: readonly Pick<
    StudioSceneRecord,
    'status' | 'sceneKey' | 'durationMs' | 'thumbKey'
  >[],
): {
  phase?: 'made';
  durationMs?: number;
  thumbKey?: string | null;
  error: string | null;
} {
  const made = rows.filter((r) => r.status === 'made' && r.sceneKey);
  return {
    ...(made.length
      ? {
          phase: 'made' as const,
          durationMs: made.reduce((n, r) => n + (r.durationMs ?? 0), 0),
          thumbKey: made[0].thumbKey,
        }
      : {}),
    error: rows.some((r) => r.status === 'failed')
      ? 'Some scenes could not be made. Make the episode again to try them once more.'
      : null,
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
          job.ask,
        );
      else if (job.kind === 'prepare')
        await this.prepare(
          show,
          episode,
          job.userId,
          job.sceneIds ?? [],
          job.ask,
        );
      else if (job.kind === 'make' && job.sceneId)
        await this.make(
          show,
          episode,
          job.sceneId,
          job.userId,
          context,
          job.ask,
        );
      else if (job.kind === 'draw')
        await this.drawCast(show, episode, job.characterIds ?? [], key);
      else if (job.kind === 'redraw' && job.characterId)
        await this.redraw(
          show,
          episode,
          job.characterId,
          job.request ?? '',
          key,
        );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${who}: ${message}`);
      const last = context.isFinalAttempt || isPermanentFailure(error);
      // Drawing the cast holds nothing else up: it is simply not drawing.
      if (job.kind === 'draw' || job.kind === 'redraw') {
        if (!last) throw error;
        const ids =
          job.kind === 'draw' ? (job.characterIds ?? []) : [job.characterId!];
        await this.cast
          .changeWork(show.id, (work) => doneDrawing(work, ids))
          .catch(() => undefined);
        if (job.kind === 'redraw') {
          const name =
            show.bible?.characters.find((c) => c.id === job.characterId)
              ?.name ?? 'They';
          await this.log(
            show,
            episode,
            {
              what: 'failed',
              step: 'cast',
              line: EVENT_LINES.drawFailed(name, true),
            },
            failed,
          );
        }
        return;
      }
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
        // Made again as asked: its failure is the word on it, not a film.
        await this.settle(show, episode, Boolean(job.ask));
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
      // The Studio's own try again at a maker's change that could not be
      // written: the film made on the first try stands, and what its check
      // found is what the maker is told. Never a failure of theirs.
      if (job.kind === 'scene' && job.sceneId && job.ask?.tries === 2) {
        const row = await this.studio.findScene(job.sceneId);
        await this.studio.updateScene(job.sceneId, {
          status: row?.sceneKey ? 'made' : 'ready',
          step: null,
          error: null,
        });
        await this.log(
          show,
          episode,
          {
            what: 'checked',
            step: 'made',
            sceneId: job.sceneId,
            line: EVENT_LINES.checked(
              row?.position ?? 0,
              'not yet',
              job.ask.tell || STILL_SHOWS,
            ),
          },
          askKey(job.ask, job.sceneId),
          {
            words: job.ask.words,
            request: job.ask.request,
            reason: `written again, could not be: ${message}`,
            before: job.ask.before?.lines ?? [],
            after: [],
            faults: [],
            tries: job.ask.tries,
          },
        );
        await this.settle(show, episode, true);
        return;
      }
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
    // A set's features, once named, are its for good: but for one the
    // maker asks to be rid of ("get rid of the teapot").
    const gone =
      request && before
        ? askedGone(
            request,
            before.sets.flatMap((set) => set.features ?? []),
          )
        : [];
    let bible = keptFeatures(
      distinctVoices(traditional(bibleOf(first.value), before)),
      before,
      gone,
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
        gone,
      );
      if (checkBible(second, story).length <= problems.length) bible = second;
    }
    // Which drawing the maker chose of anyone still as they were, kept;
    // and whoever the artist drew is drawn so until the maker chooses a
    // drawing of the kit's for them.
    bible = keptDrawn(keptKits(bible, before), before);
    await this.studio.updateShow(show.id, { bible });
    if (before) await this.cast.forgetChanged(show.id, before, bible);
    // Every animal and creature not drawn yet (new, or whose look changed)
    // drawn now, so the maker meets them before any film is made.
    if (story) await this.drawLater({ ...show, bible }, episode);
    // A scene made where something is gone now shows it until it is made
    // again: so said of it, for the film to be made again.
    if (gone.length && before) {
      const places = new Set(
        before.sets
          .filter((set) =>
            (set.features ?? []).some((f) => gone.includes(f.id)),
          )
          .map((set) => set.id),
      );
      for (const one of await this.studio.listEpisodes(show.id))
        for (const row of await this.studio.listScenes(one.id))
          if (
            row.sheet?.kind === 'story' &&
            places.has(row.sheet.set) &&
            row.madeHash
          )
            await this.studio.updateScene(row.id, { madeHash: null });
    }
    if (request && release) {
      await this.log(
        show,
        episode,
        {
          what: 'cast',
          step: 'cast',
          // What changed, said: never a count of who is there.
          line: castLine(before, bible),
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

  /** The cast's animals and creatures with no drawing, set drawing on their own: never in the way of the cast. */
  private async drawLater(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<void> {
    if (!show.bible) return;
    try {
      const ids = await this.cast.markToDraw(show.id, show.bible, Date.now());
      if (ids.length)
        await this.queue.enqueueStudio([
          {
            kind: 'draw',
            showId: show.id,
            episodeId: episode.id,
            userId: show.userId,
            characterIds: ids,
          },
        ]);
    } catch (error) {
      this.logger.warn(
        `studio ${episode.id}: the cast could not be set drawing: ${(error as Error).message}`,
      );
    }
  }

  /**
   * The cast's animals and creatures drawn at the cast step, each as the
   * make step would draw them and kept for it: the maker meets them on
   * their cards before any film is made.
   */
  private async drawCast(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    ids: string[],
    key?: string,
  ): Promise<void> {
    const bible = show.bible;
    if (!bible || !ids.length) return;
    const wanted = new Set(
      ids.filter((id) => bible.characters.some((c) => c.id === id)),
    );
    try {
      await this.scenes.prepareStory(
        {
          bible: storyBibleFor(bible, [], show.title),
          page: 1,
          castKey: studioCastKey(show.id),
          setsKey: studioSetsKey(show.id),
          bookTitle: show.title,
        },
        episode.id,
        `studio ${episode.id} (cast)`,
        { characters: wanted, places: new Set() },
      );
    } finally {
      await this.cast.changeWork(show.id, (work) => doneDrawing(work, ids));
    }
    const cast = await this.cast.cast(show.id).catch(() => ({}));
    const drawn = bible.characters
      .filter((c) => wanted.has(c.id) && c.id in cast)
      .map((c) => c.name);
    const not = bible.characters
      .filter((c) => wanted.has(c.id) && !(c.id in cast))
      .map((c) => c.name);
    if (drawn.length)
      await this.log(
        show,
        episode,
        { what: 'cast', step: 'cast', line: EVENT_LINES.drawn(drawn) },
        key,
      );
    for (const name of not)
      await this.log(
        show,
        episode,
        {
          what: 'failed',
          step: 'cast',
          line: `${name} could not be drawn yet: they are drawn when the film is made, or ask for them again.`,
        },
        key && `${key}:${name}`,
      );
  }

  /**
   * One character drawn again as the maker asked, from the drawing they
   * have: the new drawing kept beside it for the maker to choose, never in
   * its place. One never drawn before is simply drawn, for their card.
   */
  private async redraw(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    characterId: string,
    words: string,
    key?: string,
  ): Promise<void> {
    const bible = show.bible;
    const who = bible?.characters.find((c) => c.id === characterId);
    if (!bible || !who) {
      await this.cast.changeWork(show.id, (work) =>
        doneDrawing(work, [characterId]),
      );
      return;
    }
    // An animal: its look changed by the cast's writer as a change to its
    // spec, the kit drawing it at once. One the artist drew whose species
    // the kit has is offered as the kit's this way too; for any other, the
    // artist draws it again.
    // A creature likewise, by the creature kit.
    if (who.kind === 'animal' || who.kind === 'creature') {
      const done = await this.respec(show, episode, who, words, key);
      if (done) return;
    }
    const now = (await this.cast.cast(show.id).catch((): Cast => ({})))[who.id];
    const story = storyBibleFor(bible, [], show.title);
    let sheet: CharacterSheet | null;
    try {
      sheet = await this.scenes.drawCandidate(
        { bible: story, bookTitle: show.title },
        who.id,
        words,
        now ?? null,
        episode.id,
        `studio ${episode.id} (redraw ${who.id})`,
      );
    } finally {
      await this.cast.changeWork(show.id, (work) =>
        doneDrawing(work, [who.id]),
      );
    }
    if (!sheet) {
      await this.log(
        show,
        episode,
        {
          what: 'failed',
          step: 'cast',
          line: EVENT_LINES.drawFailed(who.name, Boolean(now)),
        },
        key,
      );
      return;
    }
    if (!now) {
      // Never drawn: this is their drawing, as the make step's would be.
      await this.scenes.keepSheet(studioCastKey(show.id), who.id, sheet);
      await this.log(
        show,
        episode,
        { what: 'cast', step: 'cast', line: EVENT_LINES.drawn([who.name]) },
        key,
      );
      return;
    }
    await this.cast.changeWork(show.id, (work) =>
      withCandidate(work, who.id, sheet, words, Date.now()),
    );
    await this.log(
      show,
      episode,
      { what: 'cast', step: 'cast', line: EVENT_LINES.redrawn(who.name) },
      key,
    );
  }

  /**
   * An animal's or a creature's look changed as the maker asks, as a
   * change to its spec: the cast's writer is asked for that one character
   * alone, and the kit's drawing of what it says waits on their card
   * beside the one they have, to be chosen as any new drawing is. Whether
   * it was: false when the writer gave no spec for it (one the kits do not
   * draw), so the artist draws it. A spec that comes back as it was is
   * asked for once more, told so.
   */
  private async respec(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    who: StudioCharacter,
    words: string,
    key?: string,
  ): Promise<boolean> {
    const bible = show.bible!;
    // Which kit: the animal kit's spec, or the creature kit's.
    const creature = who.kind === 'creature';
    const specOf = (
      one: { animal?: AnimalSpec; creature?: CreatureSpec } | null | undefined,
    ): KitSpec | null => (creature ? one?.creature : one?.animal) ?? null;
    const describe = (spec: KitSpec) =>
      creature
        ? describeCreature(spec as CreatureSpec)
        : describeAnimal(spec as AnimalSpec);
    const work = await this.cast.work(show.id).catch(() => null);
    const tried = specOf(work?.candidates[who.id]?.sheet);
    const ask = async (again: string | null) => {
      const made = await this.llm.studioBible({
        brief: describeBrief(show.brief),
        previous: bible,
        request: [
          oneLookRequest(who, words),
          tried
            ? `Last time this gave ${describe(tried)}: give another reading of what they ask.`
            : '',
          again ?? '',
        ]
          .filter(Boolean)
          .join(' '),
      });
      await this.record(episode.id, made.usage);
      const written = bibleOf(made.value).characters.find(
        (c) => c.id === who.id || c.name === who.name,
      );
      return written?.kind === who.kind
        ? { spec: specOf(written), look: written.look }
        : { spec: null, look: '' };
    };
    const same = (a: KitSpec | null, b: KitSpec | null) =>
      JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const now = specOf(who);
    let got: { spec: KitSpec | null; look: string };
    try {
      got = await ask(null);
      if (got.spec && (same(got.spec, now) || same(got.spec, tried)))
        got = await ask(
          `That came back as it was: change ${who.name}'s ${creature ? 'creature' : 'animal'} so it shows what they ask.`,
        );
    } catch (error) {
      this.logger.warn(
        `studio ${episode.id}: ${who.name}'s new look could not be asked for: ${(error as Error).message}`,
      );
      got = { spec: null, look: '' };
    }
    const changed = got.spec && !same(got.spec, now) ? got.spec : null;
    if (!changed) {
      // One the artist drew is drawn by the artist again, as before.
      if (!now) return false;
      await this.cast.changeWork(show.id, (work) =>
        doneDrawing(work, [who.id]),
      );
      await this.log(
        show,
        episode,
        { what: 'failed', step: 'cast', line: EVENT_LINES.unchanged(who.name) },
        key,
      );
      return true;
    }
    const sheet = creature
      ? await creatureSheet(changed as CreatureSpec, who.id)
      : await animalSheet(changed as AnimalSpec, who.id);
    this.logger.log(
      `studio ${episode.id}: ${who.name} drawn again by the kit as asked: ${describe(changed)}`,
    );
    await this.cast.changeWork(show.id, (work) =>
      withCandidate(
        doneDrawing(work, [who.id]),
        who.id,
        sheet,
        words,
        Date.now(),
        got.look || undefined,
      ),
    );
    await this.log(
      show,
      episode,
      { what: 'cast', step: 'cast', line: EVENT_LINES.redrawn(who.name) },
      key,
    );
    return true;
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

  /**
   * A scene written again as the maker asked, the rest of it kept. One
   * that was made is made again at once and checked (`ask`): what it
   * showed before, in words, is what the new film is held against, and
   * the writer is told what the film showed.
   */
  private async rewriteScene(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    sceneId: string,
    request: string,
    key?: string,
    ask?: StudioAsk,
  ): Promise<void> {
    const outline = episode.outline;
    const row = await this.studio.findScene(sceneId);
    if (!outline || !row) return;
    const bible = show.bible ?? (await this.writeBible(show, episode));
    const k = row.position;
    // The film as it was, in words from what it plays.
    const film =
      ask && row.sceneKey && row.sheet?.kind === 'story'
        ? await this.filmInWords(row, bible, episode.id)
        : null;
    const asked: StudioAsk | undefined = ask
      ? { ...ask, before: ask.before ?? film }
      : undefined;
    const told = [
      request,
      ...(film
        ? [
            `What the film of this scene shows now, as it was made (what the viewer sees, not the sheet):\n${film.lines.join('\n')}`,
          ]
        : []),
      ...(ask?.problems ?? []),
    ].join('\n\n');
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
        const again = ask?.tries === 2;
        const sheet = await this.writeStoryScene(
          show,
          episode,
          outline,
          bible,
          row,
          k,
          before,
          told,
          again,
        );
        title = sheet?.title;
        // What the check found carried that the words have worn (the
        // uniform in a hand as he spins round in it): worn from the start,
        // in the sheet itself, so every later scene and make has it too.
        const wear = ask?.remedy?.wear ?? [];
        if (sheet && wear.length) {
          const worn = wearFrom(sheet, wear);
          await this.studio.updateScene(row.id, {
            sheet: worn,
            sheetHash: sceneFingerprint(
              worn,
              bible,
              show.brief,
              before?.wears ?? [],
            ),
          });
        }
      }
      // A scene added has no sheet before this one: it is written, not
      // written again. The Studio's own try again is quiet: what came of
      // it is the check's to say.
      if (ask?.tries !== 2)
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
      // Made before: made again at once, and checked.
      if (asked && row.sceneKey)
        await this.remakeAsked(show, episode, row, asked);
    } finally {
      // Free once no other scene is being written again; being made again
      // to be checked, it is making.
      const rows = await this.studio.listScenes(episode.id);
      if (!rows.some((r) => r.status === 'writing'))
        await this.studio.updateEpisode(episode.id, {
          busy: rows.some((r) => r.status === 'making') ? 'make' : null,
        });
    }
  }

  /** A made scene's film in words, from what it plays: null when it cannot be read. */
  private async filmInWords(
    row: StudioSceneRecord,
    bible: StudioBible,
    episodeId: string,
  ): Promise<{ key: string; lines: string[] } | null> {
    if (!row.sceneKey || row.sheet?.kind !== 'story') return null;
    const scene = await this.storedScene(row.sceneKey);
    if (!scene) return null;
    const rows = await this.studio.listScenes(episodeId);
    const before = endBefore(rows, row.position, bible);
    const sheet = repairSheet(row.sheet, bible, before);
    const staged = withFound(bible, sheet.set, mendSheet(sheet, bible, before));
    return describeStaged(sheet, scene, staged);
  }

  /** A scene's stored film; null for one that cannot be read. */
  private async storedScene(key: string): Promise<SceneDto | null> {
    try {
      return JSON.parse(
        (await this.storage.get(key)).toString('utf8'),
      ) as SceneDto;
    } catch {
      return null;
    }
  }

  /**
   * A scene written again as asked, made again to be checked: spent from
   * the maker's film as a make is (the Studio's own try again is not),
   * and said in the thread; with no film left, said plainly instead.
   */
  private async remakeAsked(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    row: StudioSceneRecord,
    ask: StudioAsk,
  ): Promise<void> {
    const fresh = await this.studio.findScene(row.id);
    if (!fresh?.sheet) return;
    // The Studio's own try again that wrote nothing new: nothing to make,
    // and the film as made is this sheet's still. What the first try's
    // check told the maker is what still shows.
    if (
      ask.tries === 2 &&
      JSON.stringify(fresh.sheet) === JSON.stringify(row.sheet)
    ) {
      await this.studio.updateScene(row.id, {
        status: 'made',
        step: null,
        error: null,
      });
      await this.log(
        show,
        episode,
        {
          what: 'checked',
          step: 'made',
          sceneId: row.id,
          line: EVENT_LINES.checked(
            row.position,
            'not yet',
            ask.tell || STILL_SHOWS,
          ),
        },
        askKey(ask, row.id),
        {
          words: ask.words,
          request: ask.request,
          reason: 'written again the same',
          before: ask.before?.lines ?? [],
          after: [],
          faults: [],
          tries: ask.tries,
        },
      );
      await this.settle(show, episode, true);
      return;
    }
    if (!ask.free)
      try {
        (await this.entitlements.forUser(show.userId)).assertStudioAvailable(
          secondsOf(fresh.sheet),
        );
      } catch {
        await this.log(
          show,
          episode,
          {
            what: 'failed',
            step: 'made',
            sceneId: row.id,
            line: `Scene ${row.position + 1} is written again; there is no film left this month to make it again.`,
          },
          `${askKey(ask, row.id)}:allowance`,
        );
        return;
      }
    await this.studio.updateScene(row.id, {
      status: 'making',
      step: null,
      error: null,
    });
    // Made again to check it: said once, on the maker's own try.
    if (ask.tries !== 2)
      await this.log(
        show,
        episode,
        {
          what: 'make',
          step: 'made',
          sceneId: row.id,
          line: EVENT_LINES.remake(row.position),
        },
        `${askKey(ask, row.id)}:make`,
      );
    await this.queue.enqueueStudio([
      {
        kind: 'prepare',
        showId: show.id,
        episodeId: episode.id,
        userId: show.userId,
        sceneIds: [row.id],
        ask,
      },
    ]);
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
    /** The Studio's own try again at a maker's change: the sheet from before their change is kept for undo. */
    again = false,
  ): Promise<StorySheet | null> {
    const old = row.sheet?.kind === 'story' ? row.sheet : null;
    // Written again as asked: as long as it was, at the least, so what the
    // maker did not ask to change is not cut to fit the outline's plan.
    const outlined = outline.scenes[k]?.seconds ?? null;
    const planned =
      request && old && outlined !== null
        ? Math.max(outlined, secondsOf(old))
        : outlined;
    const ask = {
      brief: describeBrief(show.brief),
      bible: describeBible(bible, true),
      outline: describeOutline(outline, true),
      scene: outline.scenes[k]
        ? describeOutlineScene(outline.scenes[k], k, true)
        : `Scene ${k + 1}: the scene the maker asked for.`,
      before: describeEnd(before, bible),
    };
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
        // Held to the show as the words grew it: a thing they named is
        // there; and, written again as asked, to the lines it had.
        problems: [
          ...checkSheet(
            mended.sheet,
            withFound(bible, mended.sheet.set, mended),
            planned,
            before,
          ),
          ...(request && old ? linesKept(old, mended.sheet, request) : []),
        ],
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
        problems: checkSheet(
          sheet,
          withFound(bible, sheet.set, mendSheet(sheet, bible, before)),
          planned,
          before,
        ),
      };
    }
    if (best.mended.length)
      this.logger.log(
        `studio ${episode.id} s${k + 1}: mended: ${best.mended.slice(0, 8).join('; ')}`,
      );
    // A feature the words name joins its set for good, and a thing of the
    // show's own the show, as new places and people join the cast: the
    // next scene has them too.
    const found = mendSheet(best.sheet, bible, before);
    if (found.features.length || found.things.length) {
      const grown = withFound(bible, best.sheet.set, found);
      await this.studio.updateShow(show.id, { bible: grown });
      bible.sets.splice(0, bible.sets.length, ...grown.sets);
      if (grown.things) bible.things = grown.things;
    }
    await this.studio.updateScene(row.id, {
      sheet: best.sheet,
      sheetHash: sceneFingerprint(
        best.sheet,
        bible,
        show.brief,
        before?.wears ?? [],
      ),
      problems: best.problems,
      ...(request && old && !again ? { previousSheet: old } : {}),
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
    /** A maker's request each is made for, to be checked once made. */
    ask?: StudioAsk,
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
      const places = new Set(made.map((s) => s.set));
      await this.scenes.prepareStory(
        {
          bible: storyBibleFor(bible, sheets, show.title),
          page: 1,
          castKey: studioCastKey(show.id),
          setsKey: studioSetsKey(show.id),
          ownKey: studioOwnKey(show.id),
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
          places,
        },
        // The show's own too, each drawn once before the scenes need it.
        {
          things: bible.things ?? [],
          features: bible.sets
            .filter((s) => places.has(s.id))
            .flatMap((s) => (s.features ?? []).filter((f) => f.kind === DRAWN)),
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
        ...(ask ? { ask } : {}),
      })),
    );
  }

  /** Those of the show's cast the artist drew whose rigs turn their arms and nod: none when the cast cannot be read. */
  private async gesturing(showId: string): Promise<Set<string>> {
    let cast: Cast = {};
    try {
      cast = await this.cast.cast(showId);
    } catch {
      // None known: everyone the artist drew bobs, as before.
    }
    return gesturingIn(cast);
  }

  /** The show's sets as painted: none yet, or none that can be read, is none. */
  private async paintedSets(showId: string): Promise<Sets | null> {
    try {
      const kept = await this.storage.get(studioSetsKey(showId));
      return setsOf(JSON.parse(kept.toString('utf8')));
    } catch {
      return null;
    }
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
    /** A maker's request it is made for: checked once it is made. */
    ask?: StudioAsk,
  ): Promise<void> {
    const row = await this.studio.findScene(sceneId);
    if (!row?.sheet) return;
    const bible = show.bible ?? (await this.writeBible(show, episode));
    const rows = await this.studio.listScenes(episode.id);
    // With the clothes its people come into it in, where any scene changes them.
    const fingerprint = sceneFingerprint(
      row.sheet,
      bible,
      show.brief,
      carriedWears(rows, bible).get(row.position) ?? [],
    );
    const who = `studio ${episode.id} s${row.position + 1}`;
    await this.studio.updateScene(row.id, {
      status: 'making',
      step: 'drawing',
      error: null,
    });
    const of = studioMakeOf(
      show,
      episode,
      row,
      rows,
      bible,
      await this.paintedSets(show.id),
      await this.gesturing(show.id),
    );
    const base = `studio/${show.id}/${episode.id}/${row.id}-${fingerprint.slice(0, 8)}-${Date.now().toString(36)}`;
    // The Studio's own try again, its words as voiced: staged again on the
    // voice it was made with, nothing voiced, nothing spent.
    const voiced =
      ask?.tries === 2 && row.sceneKey && row.audioKey && of.story
        ? await this.storedScene(row.sceneKey)
        : null;
    const onVoice = voiced && of.script ? onItsVoice(of.script, voiced) : null;
    const made =
      voiced && onVoice && row.audioKey
        ? await this.scenes
            .recompose({
              script: onVoice,
              kept: new Map(),
              beats: voiced.beats,
              durationMs: voiced.durationMs,
              timing: voiced.timing,
              profile: of.profile,
              story: of.story!,
              base,
              who,
              keepAs: `studio-${row.id}`,
              ...(of.recheck ? { recheck: of.recheck } : {}),
            })
            .then((again) => ({
              fit: 'good' as const,
              scene: again.scene,
              sceneKey: again.sceneKey,
              thumbKey: again.thumbKey,
              voice: {
                audioKey: row.audioKey!,
                durationMs: voiced.durationMs,
              },
            }))
        : await this.scenes.make({
            ...of,
            base,
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
    // The Studio's own try again is never the maker's to pay for.
    if (!ask?.free)
      await this.entitlements.recordStudioSeconds(
        userId,
        voice.durationMs / 1000,
      );
    this.logger.log(
      `${who}: made "${scene.title}" in ${Math.round(voice.durationMs / 1000)}s of film, ${scene.steps.length} stage changes, ${scene.effects.length} effects${context.attemptsMade > 1 ? ` (try ${context.attemptsMade})` : ''}`,
    );
    // The film is made and spent: the check of it, however it goes, never
    // makes it again, nor spends it twice.
    if (ask)
      try {
        await this.checkAsk(
          show,
          episode,
          (await this.studio.findScene(row.id)) ?? row,
          scene,
          ask,
          bible,
        );
      } catch (error) {
        this.logger.warn(
          `${who}: the ask could not be checked: ${(error as Error).message}`,
        );
        await this.log(
          show,
          episode,
          {
            what: 'checked',
            step: 'made',
            sceneId: row.id,
            line: EVENT_LINES.checked(row.position, 'unchecked'),
          },
          askKey(ask, row.id),
        );
        await this.studio
          .updateScene(row.id, { status: 'made', step: null, error: null })
          .catch(() => undefined);
      }
    await this.settle(show, episode, Boolean(ask)).catch((error: Error) =>
      this.logger.warn(`${who}: not settled: ${error.message}`),
    );
  }

  /**
   * A scene made again as the maker asked, looked at: what its film now
   * shows, in words, against what it showed before and what they asked
   * for. Shown as asked, the thread says so. Not yet, and it was the first
   * try: written again once more, quietly, with what still shows, and made
   * again free. Not yet on the second: said honestly, never as done, and
   * kept for us. The check itself failing: said so, and no more.
   */
  private async checkAsk(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    row: StudioSceneRecord,
    scene: SceneDto,
    ask: StudioAsk,
    bible: StudioBible,
  ): Promise<void> {
    if (row.sheet?.kind !== 'story') return;
    const who = `studio ${episode.id} s${row.position + 1}`;
    const key = askKey(ask, row.id);
    const rows = await this.studio.listScenes(episode.id);
    const before = endBefore(rows, row.position, bible);
    const sheet = repairSheet(row.sheet, bible, before);
    const staged = withFound(bible, sheet.set, mendSheet(sheet, bible, before));
    const after = describeStaged(sheet, scene, staged);
    // What code sees wrong, and what the maker asked to be rid of that is
    // still there.
    const faults = [
      ...stagedFaults(sheet, scene, staged),
      ...stillThere(`${ask.words} ${ask.request}`, scene),
    ];
    const line = (came: 'shown' | 'not yet' | 'unchecked', tell = '') => ({
      what: 'checked' as const,
      step: 'made' as const,
      sceneId: row.id,
      line: EVENT_LINES.checked(row.position, came, tell),
    });
    let verdict: StudioCheckVerdict;
    if (ask.before && ask.before.key === after.key)
      verdict = {
        resolved: false,
        reason: 'the film shows exactly what it did before',
        tell: 'the film still shows what it did before',
        faults: [],
      };
    else
      try {
        const checked = await this.llm.studioCheck({
          words: ask.words,
          request: ask.request,
          before: ask.before?.lines ?? [],
          after: after.lines,
          faults: faults.map((f) => `${f.id}: ${f.why}`),
          // Asked with other scenes at once: judged only for its own part.
          scene: row.position + 1,
          ...(ask.of?.length
            ? { others: ask.of.filter((n) => n !== row.position + 1) }
            : {}),
        });
        await this.record(episode.id, checked.usage, 'studio_check');
        verdict = checked.value;
      } catch (error) {
        this.logger.warn(
          `${who}: the ask could not be checked: ${(error as Error).message}`,
        );
        await this.log(show, episode, line('unchecked'), key);
        return;
      }
    // What code sees that is what the maker asked about outweighs the
    // check's word for it.
    const asked = faults.filter((f) =>
      concerns(f, `${ask.words} ${ask.request}`),
    );
    // What the check tells the maker: plain words about the film, no more.
    const tell = tellOf(verdict.tell);
    if (verdict.resolved && !asked.length) {
      await this.log(show, episode, line('shown', tell), key);
      return;
    }
    const reason =
      verdict.reason || asked[0]?.why || 'the film shows what it did before';
    if (ask.tries === 1) {
      this.logger.log(`${who}: ask not shown yet, written again: ${reason}`);
      const wear = faults.flatMap((f) => {
        if (f.id !== 'not-worn' || f.beat === null) return [];
        const thing = sheet.beats[f.beat]?.thing;
        const worn = /in the (\S+)/u.exec(f.why)?.[1];
        return [{ who: f.who, thing: thing ?? worn ?? '' }].filter(
          (one) => one.thing,
        );
      });
      const again: StudioAsk = {
        ...ask,
        tries: 2,
        free: true,
        ...(tell ? { tell } : {}),
        problems: [
          `The film as made still does not do what the maker asked: ${reason}`,
          `What the film shows now:\n${after.lines.join('\n')}`,
          'Keep every line and every word of narration exactly as it is; change only the staging: onStage pose, on and wears, the doings that change them (stand-up, sit, lie-down, dress, undress), and what is held.',
        ],
        ...(wear.length ? { remedy: { wear } } : {}),
      };
      await this.studio.updateScene(row.id, { status: 'writing', error: null });
      await this.studio.updateEpisode(episode.id, { busy: 'scene' });
      await this.queue.enqueueStudio([
        {
          kind: 'scene',
          showId: show.id,
          episodeId: episode.id,
          userId: show.userId,
          sceneId: row.id,
          request: ask.request,
          ask: again,
        },
      ]);
      return;
    }
    this.logger.warn(`${who}: ask not resolved: ${reason}`);
    await this.log(
      show,
      episode,
      line('not yet', tell || ask.tell || STILL_SHOWS),
      key,
      {
        words: ask.words,
        request: ask.request,
        reason,
        before: ask.before?.lines ?? [],
        after: after.lines,
        faults: faults.map((f) => `${f.id}: ${f.why}`),
        tries: ask.tries,
      },
    );
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
    /** Made again as asked: its check says what came of it, not a film line. */
    asked = false,
  ): Promise<void> {
    const episodeId = episode.id;
    const rows = await this.studio.listScenes(episodeId);
    if (rows.some((r) => r.status === 'making' || r.status === 'writing'))
      return;
    const made = rows.filter((r) => r.status === 'made' && r.sceneKey);
    const settled = settledEpisode(rows);
    const durationMs = settled.durationMs ?? 0;
    if (made.length && !asked)
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
    await this.studio.updateEpisode(episodeId, { busy: null, ...settled });
  }

  /** Something that happened, recorded in the thread, once for its key: never in the way of the work. */
  private async log(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    event: StudioEventRecord,
    key?: string,
    check?: Parameters<typeof logEvent>[4],
  ): Promise<void> {
    await logEvent(
      this.studio,
      { showId: show.id, episodeId: episode.id },
      event,
      key,
      check,
    ).catch((error: Error) =>
      this.logger.warn(`studio ${episode.id}: not recorded: ${error.message}`),
    );
  }

  private async record(
    episodeId: string,
    usage: LlmUsage,
    task: LlmTask = 'studio_write',
  ): Promise<void> {
    await this.calls.record({
      documentId: episodeId,
      task,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      tokensCached: usage.tokensCached ?? null,
      latencyMs: usage.latencyMs,
      outcome: 'ok',
    });
  }
}
