import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DocumentProfile } from '../../business/domain/scene-profile';
import { progressNow } from '../../business/domain/work-progress';
import {
  pagesWords,
  scenePages,
} from '../../business/domain/studio/studio-document';
import { StudioMaterialService } from './studio-material';
import {
  checksAt,
  describeAudience,
  profileOf,
  recipeFor,
  stageOf,
} from '../../business/domain/studio/studio-audience';
import {
  plainExplainer,
  rideAlong,
} from '../../business/domain/studio/studio-plain';
import {
  bibleOf,
  explainerSheetOf,
  outlineOf,
  secondsOf,
  FULLEST,
  TEACH_WORDS_A_SECOND,
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
  wearFrom,
  withFound,
  type EndState,
  type SheetProblem,
} from '../../business/domain/studio/studio-check';
import {
  narratorRuleOf,
  type NarratorRule,
} from '../../business/domain/studio/studio-narrator';
import {
  describeStory,
  keptPersonas,
  withPersonas,
  type StudioStory,
} from '../../business/domain/studio/studio-story';
import { developStory } from '../../business/handlers/studio/studio-develop';
import { studioPaceBrief } from '../../business/domain/studio/studio-pace';
import {
  worse,
  writeStorySheet,
} from '../../business/handlers/studio/studio-scenes';
import {
  scriptSettings,
  writeStoryScript,
  type ScriptSettings,
} from '../../business/handlers/studio/studio-script-writer';
import { followStudioJob } from '../../business/handlers/studio/studio-progress';
import { tableRead } from '../../business/handlers/studio/studio-tableread';
import {
  energyOf,
  leanedMusic,
  setLookOf,
} from '../../business/domain/studio/studio-style';
import type { SceneScript } from '../../business/domain/scene-script';
import {
  auditMoves,
  auditScene,
  describeAudit,
  describeMoves,
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
  withOptions,
} from '../../business/domain/studio/studio-drawings';
import {
  WAYS_OF,
  lookOf,
  readingsOf,
} from '../../business/domain/studio/studio-options';
import {
  describeFigure,
  type FigureSpec,
} from '../../business/domain/scene-figure';
import { TAKES } from './scene-artist';
import {
  describeAnimal,
  type AnimalSpec,
} from '../../business/domain/scene-animal';
import {
  describeCreature,
  type CreatureSpec,
} from '../../business/domain/scene-creature';
import { animalSheet, creatureSheet } from '../../business/domain/scene-sheet';
import {
  askedMoments,
  claimsText,
  namedAsDrawn,
  pictureClaims,
  pictureMoments,
  pictureProblems,
  type PictureVerdict,
} from '../../business/domain/scene-picture-check';
import { rasterise } from '../../business/domain/scene-raster';
import { renderStill } from '../../business/domain/scene-still';
import {
  CLIP_CARD,
  clipBible,
  clipBrief,
  clipCardDrawing,
  clipFreeze,
  clipLook,
  gateClips,
  hookFirst,
  hookOf,
  isClip,
  withClipCard,
  withPresets,
  withStill,
} from '../../business/domain/studio/studio-clip';
import {
  coldOpen,
  keepCheckpoint,
} from '../../business/domain/studio/studio-checkpoint';
import {
  hostIn,
  hostLooks,
  hostOn,
  withHost,
} from '../../business/domain/studio/studio-host';
import { ideaStarts } from '../../business/domain/scene-checkpoint';
import { writeClipSheet } from '../../business/handlers/studio/studio-clip-writer';
import { showTheme } from '../../business/domain/studio/studio-look';
import { studioReading } from '../../business/domain/studio/studio-motion';

/** A kit's spec for a character: a person's, an animal's, or a creature's. */
type KitSpec = FigureSpec | AnimalSpec | CreatureSpec;
import { QUEUE_SETTINGS, type StudioJobData } from '../queues';
import { createHash } from 'node:crypto';
import {
  buildScript,
  picturesIn,
  sectionOf,
  sharedDrawings,
} from '../../business/domain/studio/studio-build';
import type { DrawingThing } from '../../business/domain/scene-script';
import type { GatedDrawing } from '../../business/domain/scene-svg';
import { isPermanentFailure, type JobContext } from './base.processor';
import { SceneProcessor } from './scene.processor';

/** How wide a still the picture check looks at is: enough to tell a bus from an ark, at about 0.4 cents a look. */
const STILL_PX = 960;

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
 * An explainer's scenes as the stage plays them, by position: each sheet
 * put right and checked as it is made. Null where a scene is not written.
 */
export function explainerScripts(
  show: StudioShowRecord,
  episode: StudioEpisodeRecord,
  rows: readonly StudioSceneRecord[],
  bible: StudioBible,
): (position: number) => SceneScript | null {
  const stage = stageOf(show.brief);
  const known = new Map<number, SceneScript | null>();
  return (position) => {
    if (known.has(position)) return known.get(position)!;
    const row = rows.find((r) => r.position === position);
    const lesson = {
      teach: episode.outline?.scenes[position]?.teach ?? null,
      source: show.brief.source,
      stage,
      maths: bible.maths,
      planned: null,
    };
    const script =
      row?.sheet?.kind === 'explainer'
        ? checkExplainer(repairExplainer(row.sheet, lesson), lesson).script
        : null;
    known.set(position, script);
    return script;
  };
}

/**
 * Where a continuous build's drawing is kept for its show, drawn once and
 * shown alike by every scene of its section: by its id and what it is, so
 * a drawing asked for differently is drawn anew.
 */
export const studioBoardKey = (showId: string, thing: DrawingThing) =>
  `studio/${showId}/board/${thing.id.slice(0, 40)}-${createHash('sha1')
    .update(
      JSON.stringify([
        thing.name,
        thing.brief,
        thing.motion,
        thing.shape,
        thing.parts,
        thing.states,
      ]),
    )
    .digest('hex')
    .slice(0, 12)}.json`;

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
  // A story's scene in an explainer is one of its story clips (studio-clip):
  // staged as a story is, with a light narrator in the lesson's voice.
  const clip = story && show.brief.format === 'explainer';
  const stage = stageOf(show.brief);
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
  const narrator = narratorRuleOf(
    clip ? clipBrief(show.brief) : show.brief,
    bible,
  );
  const sheet = story
    ? repairSheet(row.sheet as StorySheet, bible, before, narrator)
    : null;
  const painted = sheet ? paintedAt(sets?.[sheet.set]) : {};
  // The maker's controls on the film: one of the cast telling it says the
  // narration in their voice; the style and the pace set the camera's
  // energy; the style leans the music.
  const energy = energyOf(show.brief);
  const styled = (staged: SceneScript): SceneScript => ({
    ...staged,
    beats: show.brief.style
      ? staged.beats.map((beat) =>
          beat.music
            ? { ...beat, music: leanedMusic(beat.music, show.brief.style) }
            : beat,
        )
      : staged.beats,
    ...(narrator?.mode === 'character' && narrator.character
      ? { narrator: narrator.character }
      : {}),
    ...(energy ? { energy: { cut: energy.cut, push: energy.push } } : {}),
  });
  // A clip's set in the explainer's look; a story's in its style.
  const look = clip
    ? clipLook(showTheme(show.brief, bible))
    : story
      ? setLookOf(show.brief)
      : null;
  const staged = sheet
    ? withFound(bible, sheet.set, mendSheet(sheet, bible, before))
    : bible;
  // The lesson after a clip opens on it as a card (studio-clip): the
  // clip's last frame, shrunk onto its stage, the diagram built round it.
  const clipBefore = !story
    ? rows.find(
        (r) => r.position === row.position - 1 && r.sheet?.kind === 'story',
      )
    : undefined;
  // An explainer's scene in a continuous build is laid out on the board
  // the scenes of its section before it left (studio-build).
  const lessons = sheet ? null : explainerScripts(show, episode, rows, bible);
  const built = lessons
    ? buildScript(episode.outline?.scenes ?? [], row.position, lessons)
    : null;
  const lessonScript = sheet
    ? null
    : (built?.script ??
      checkExplainer(
        repairExplainer(row.sheet as ExplainerSheet, lesson),
        lesson,
      ).script);
  const script = sheet
    ? styled(stageStory(sheet, staged, { before, painted, gestures }))
    : clipBefore
      ? withClipCard(lessonScript!, clipBefore.sheet!.title)
      : lessonScript!;
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
        // How its action moves play: each phase its least, the feet down
        // where it lands, no one through anyone; logged for us.
        const moveNotes = describeMoves(auditMoves(scene));
        const faults = stagedFaults(sheet, scene, staged);
        const rise = new Set(
          faults.flatMap((f) =>
            f.id === 'furniture-moves' && f.beat !== null ? [f.beat] : [],
          ),
        );
        return {
          notes: [
            ...(notes.length ? [`audit: ${notes.join('; ')}`] : []),
            ...(moveNotes.length ? [`moves: ${moveNotes.join('; ')}`] : []),
            ...(faults.length
              ? [
                  `staging: ${faults.map((f) => `${f.id}${f.beat !== null ? ` b${f.beat}` : ''} ${f.why}`).join('; ')}`,
                ]
              : []),
          ],
          script:
            unseen.length || rise.size
              ? styled(
                  stageStory(sheet, staged, {
                    before,
                    painted,
                    gestures,
                    plain: new Set(unseen.map((one) => one.beat)),
                    ...(rise.size ? { rise } : {}),
                  }),
                )
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
          // A clip's places from code's layouts where it has them.
          bible: clip
            ? withPresets(storyBibleFor(bible, sheets, show.title))
            : storyBibleFor(bible, sheets, show.title),
          page: row.position + 1,
          castKey: studioCastKey(show.id),
          setsKey: studioSetsKey(show.id),
          ownKey: studioOwnKey(show.id),
          bookTitle: show.title,
          ...(look ? { look } : {}),
        }
      : null,
    script,
    kept: new Map(),
    ...(recheck ? { recheck } : {}),
    // An explainer's voice at its audience's rate and the maker's pace.
    ...(story ? {} : { pace: studioPaceBrief(show.brief) }),
    // A clip holds still at its idea, its label set; the lesson after it
    // has its card, drawn by code, told which scene it is a still of.
    ...(clip && sheet
      ? {
          finish: (scene: SceneDto) => {
            const freeze = clipFreeze(scene, sheet.title);
            return freeze ? { ...scene, freeze } : scene;
          },
        }
      : {}),
    ...(clipBefore ? { drawn: new Map([[CLIP_CARD, clipCardDrawing()]]) } : {}),
    // A lesson's ideas marked where each starts (scene-checkpoint), for the
    // scrubber's ticks and "back one idea"; after a clip, its card told
    // which scene it is a still of.
    ...(!story
      ? {
          finish: (scene: SceneDto) => {
            const ideas = ideaStarts(
              script.beats,
              episode.outline?.scenes[row.position]?.points ?? [],
              row.sheet?.title ?? '',
            ).filter((idea) => idea.beat < (scene.beats?.length ?? 0));
            const marked = ideas.length ? { ...scene, ideas } : scene;
            return clipBefore ? withStill(marked, clipBefore.id) : marked;
          },
        }
      : {}),
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

/** An outline without its story, as its writer is shown it again. */
function outlineOnly(outline: StudioOutline | null): StudioOutline | null {
  if (!outline) return null;
  return {
    title: outline.title,
    logline: outline.logline,
    scenes: outline.scenes,
    ...(outline.next?.length ? { next: outline.next } : {}),
  };
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
    @Optional() private readonly config?: ConfigService,
    /** An explainer made from a document: its pages, as notes or as they are (studio-material). */
    @Optional() private readonly material?: StudioMaterialService,
  ) {}

  /** How a story's script is written and read (studio-script-writer): fast and cheap unless a setting says otherwise. */
  private scriptSettings(): ScriptSettings {
    return scriptSettings(
      (name) => this.config?.get<string>(name) ?? process.env[name],
    );
  }

  /**
   * A job, followed (studio-progress): what it is doing, and any call it
   * is trying again, kept on its rows for the maker's page as it goes.
   */
  async process(job: StudioJobData, context: JobContext): Promise<void> {
    const { attempts, backoffMs } = QUEUE_SETTINGS.studio;
    return followStudioJob(
      this.studio,
      {
        episodeId: job.episodeId,
        sceneId:
          job.kind === 'scene' || job.kind === 'make' ? job.sceneId : null,
        kind: job.kind,
        picture: Boolean(job.ask?.picture),
        attempt: context.attemptsMade,
        attempts,
        backoffMs: backoffMs * 2 ** Math.max(0, context.attemptsMade - 1),
      },
      () => this.work(job, context),
    );
  }

  private async work(job: StudioJobData, context: JobContext): Promise<void> {
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
        await this.writeOutline(
          show,
          episode,
          job.request,
          key,
          job.story === true,
        );
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
      else if (job.kind === 'repace' && job.pace)
        await this.repace(show, episode, job.pace, key);
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
      // A pace that could not be changed leaves the film as it was.
      if (job.kind === 'repace') {
        if (!last) throw error;
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
        // The picture check's own try again: the film made first stands, quietly.
        if (job.ask.picture) {
          this.logger.log(
            `studio ${episode.id}: picture: could not be written again (${message}); the film stands`,
          );
          await this.settle(show, episode, true);
          return;
        }
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
    // An explainer's people and places are its story clips' (studio-clip):
    // three the kits draw at most, two places, one painted.
    if (!story) {
      const held = clipBible(bible);
      if (held.dropped.length)
        this.logger.log(
          `studio ${episode.id}: clips' cast held: ${held.dropped.join(', ')} left out`,
        );
      bible = held.bible;
    }
    // An explainer's host (studio-host): kept as the show had them, new
    // when on and none, gone when off. Drawn by the kits, so free.
    const hosted = withHost(bible, before, hostOn(show.brief), show.id);
    bible = hosted.bible;
    // Which drawing the maker chose of anyone still as they were, kept;
    // and whoever the artist drew is drawn so until the maker chooses a
    // drawing of the kit's for them.
    bible = keptPersonas(keptDrawn(keptKits(bible, before), before), before);
    await this.studio.updateShow(show.id, { bible });
    if (before) await this.cast.forgetChanged(show.id, before, bible);
    if (hosted.fresh) await this.offerHost({ ...show, bible }, episode, key);
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

  /**
   * A new host's three looks offered on the thread's choosing card: a
   * person (in use until the maker picks), an owl and one more animal,
   * all drawn by the kits, nothing spent.
   */
  private async offerHost(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    key?: string,
  ): Promise<void> {
    const host = hostIn(show.bible);
    if (!host) return;
    try {
      await this.cast.changeWork(show.id, (work) =>
        withOptions(
          work,
          host.id,
          hostLooks(show.id).map((one) => ({
            ...(one.figure ? { figure: one.figure } : {}),
            ...(one.animal ? { animal: one.animal } : {}),
            look: one.look,
          })),
          '',
          Date.now(),
          true,
        ),
      );
      await this.log(
        show,
        episode,
        {
          what: 'cast',
          step: 'cast',
          characterId: host.id,
          line: `${host.name} will host the show: they open each film and ask its questions. Pick how they look.`,
        },
        key && `${key}:host`,
      );
    } catch (error) {
      this.logger.warn(
        `studio ${episode.id}: the host's looks could not be offered: ${(error as Error).message}`,
      );
    }
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
    const cast: Cast = await this.cast.cast(show.id).catch(() => ({}));
    // Each drawn in takes side by side: the best is in use, and the other
    // takes wait beside it, to choose instead (three to choose from).
    const offered: StudioCharacter[] = [];
    for (const c of bible.characters) {
      if (!wanted.has(c.id) || !cast[c.id]) continue;
      const others = await this.cast.otherTakes(show.id, c.id);
      if (!others.length) continue;
      await this.cast.changeWork(show.id, (work) =>
        withOptions(
          work,
          c.id,
          [cast[c.id], ...others].map((sheet) => ({ sheet })),
          '',
          Date.now(),
          true,
        ),
      );
      offered.push(c);
    }
    const drawn = bible.characters
      .filter((c) => wanted.has(c.id) && c.id in cast && !offered.includes(c))
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
    for (const c of offered) {
      const ways =
        (await this.cast.work(show.id)).candidates[c.id]?.options.length ?? 1;
      await this.log(
        show,
        episode,
        {
          what: 'cast',
          step: 'cast',
          characterId: c.id,
          line: EVENT_LINES.takes(c.name, ways),
        },
        key && `${key}:takes:${c.id}`,
      );
    }
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
   * have: the new drawings (up to three, the artist's takes side by side)
   * kept beside it for the maker to choose from, never in its place. One
   * never drawn before is simply drawn, for their card, its other takes
   * offered beside it.
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
    // A person, an animal or a creature the kits draw: its look changed by
    // the cast's writer as a change to its spec, the kit drawing it (and
    // two other readings of the words) at once. One the artist drew whose
    // species the kit has is offered as the kit's this way too; for any
    // other, the artist draws it again.
    const done = await this.respec(show, episode, who, words, key);
    if (done) return;
    const now = (await this.cast.cast(show.id).catch((): Cast => ({})))[who.id];
    const story = storyBibleFor(bible, [], show.title);
    let sheets: CharacterSheet[];
    try {
      // Three takes side by side, as a new character's: three to choose from.
      sheets = await this.scenes.drawCandidates(
        { bible: story, bookTitle: show.title },
        who.id,
        words,
        now ?? null,
        episode.id,
        `studio ${episode.id} (redraw ${who.id})`,
        { takes: TAKES.character },
      );
    } finally {
      await this.cast.changeWork(show.id, (work) =>
        doneDrawing(work, [who.id]),
      );
    }
    if (!sheets.length) {
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
      // Never drawn: the best is their drawing, as the make step's would
      // be, and the other takes wait beside it.
      await this.scenes.keepSheet(studioCastKey(show.id), who.id, sheets[0]);
      const work = await this.cast.changeWork(show.id, (work) =>
        withOptions(
          work,
          who.id,
          sheets.map((sheet) => ({ sheet })),
          '',
          Date.now(),
          true,
        ),
      );
      const ways = work.candidates[who.id]?.options.length ?? 1;
      await this.log(
        show,
        episode,
        ways > 1
          ? {
              what: 'cast',
              step: 'cast',
              characterId: who.id,
              line: EVENT_LINES.takes(who.name, ways),
            }
          : { what: 'cast', step: 'cast', line: EVENT_LINES.drawn([who.name]) },
        key,
      );
      return;
    }
    const work = await this.cast.changeWork(show.id, (work) =>
      withOptions(
        work,
        who.id,
        sheets.map((sheet) => ({ sheet })),
        words,
        Date.now(),
      ),
    );
    await this.log(
      show,
      episode,
      {
        what: 'cast',
        step: 'cast',
        characterId: who.id,
        line: EVENT_LINES.redrawn(
          who.name,
          work.candidates[who.id]?.options.length ?? 1,
        ),
      },
      key,
    );
  }

  /**
   * A person's, an animal's or a creature's look changed as the maker
   * asks, as a change to its spec: the cast's writer is asked for that one
   * character alone, and the kit's drawing of what it says waits on their
   * card beside the one they have, with up to two other readings of the
   * same words (studio-options), to be chosen from as any new drawings
   * are. Whether it was: false when the writer gave no spec for it (an
   * animal or a creature the kits do not draw), so the artist draws it. A
   * spec that comes back as it was is asked for once more, told so.
   */
  private async respec(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    who: StudioCharacter,
    words: string,
    key?: string,
  ): Promise<boolean> {
    const bible = show.bible!;
    const kind = who.kind;
    // Which kit: the figure kit's spec, the animal kit's, or the creature kit's.
    const specOf = (
      one:
        | {
            animal?: AnimalSpec | null;
            creature?: CreatureSpec | null;
            figure?: FigureSpec | null;
          }
        | null
        | undefined,
    ): KitSpec | null =>
      (kind === 'person'
        ? one?.figure
        : kind === 'creature'
          ? one?.creature
          : one?.animal) ?? null;
    const describe = (spec: KitSpec) =>
      kind === 'person'
        ? describeFigure(spec as FigureSpec)
        : kind === 'creature'
          ? describeCreature(spec as CreatureSpec)
          : describeAnimal(spec as AnimalSpec);
    const work = await this.cast.work(show.id).catch(() => null);
    const last = work?.candidates[who.id]?.options[0];
    const tried = specOf(
      last?.sheet ?? (last ? { figure: last.figure } : null),
    );
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
          `That came back as it was: change ${who.name}'s ${kind === 'person' ? 'figure' : kind} so it shows what they ask.`,
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
    // The writer's reading, and up to two others of the same words.
    const ways = WAYS_OF[kind];
    const readings = readingsOf<KitSpec>(now, changed, ways, words);
    const options = await Promise.all(
      readings.map(async (spec, k) => {
        const look =
          k === 0
            ? got.look || undefined
            : lookOf(got.look || who.look, changed, spec, ways, describe);
        if (kind === 'person')
          return { figure: spec as FigureSpec, ...(look ? { look } : {}) };
        const sheet =
          kind === 'creature'
            ? await creatureSheet(spec as CreatureSpec, who.id)
            : await animalSheet(spec as AnimalSpec, who.id);
        return { sheet, ...(look ? { look } : {}) };
      }),
    );
    this.logger.log(
      `studio ${episode.id}: ${who.name} drawn again by the kit as asked, ${options.length} way${options.length === 1 ? '' : 's'}: ${readings.map(describe).join(' | ')}`,
    );
    const kept = await this.cast.changeWork(show.id, (work) =>
      withOptions(
        doneDrawing(work, [who.id]),
        who.id,
        options,
        words,
        Date.now(),
      ),
    );
    await this.log(
      show,
      episode,
      {
        what: 'cast',
        step: 'cast',
        characterId: who.id,
        line: EVENT_LINES.redrawn(
          who.name,
          kept.candidates[who.id]?.options.length ?? 1,
        ),
      },
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
    /** The request is for the story itself (the Story step): it is developed again. */
    storyAsked = false,
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
    // An explainer made from pages of a document: those pages, as their
    // own text or as their teacher's notes, are what it is written from.
    const pages = story ? null : await this.pagesFor(show, episode);
    const ask = {
      brief: pages?.brief ?? describeBrief(show.brief),
      bible: describeBible(bible, story),
      ...(earlier.length ? { before: describeEarlier(earlier) } : {}),
    };
    const minutes = show.brief.minutes ?? 1;
    const revising = Boolean(request && episode.outline);
    // A story's outline is built from its story, developed in steps first
    // (studio-story-plan §1): a first outline, one written afresh, and a
    // change asked of the story itself. A change asked of the outline
    // alone changes the outline, the story kept.
    const develop = story && (storyAsked || !request || !episode.outline);
    const kept = episode.outline?.story ?? null;
    if (develop) {
      const developed = await this.developStory(
        show,
        episode,
        bible,
        ask.before,
        request,
        storyAsked ? kept : null,
        key,
      );
      await this.finishOutline(
        show,
        episode,
        developed.outline,
        developed.problems,
        Boolean(request && episode.outline),
        key,
      );
      return;
    }
    const first = await this.llm.studioOutline({
      ...ask,
      // The story it keeps to, where it has one.
      ...(kept ? { bible: `${ask.bible}\n\n${describeStory(kept)}` } : {}),
      ...(revising ? { previous: outlineOnly(episode.outline), request } : {}),
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
    // An explainer's story clips held to their limits, silently: one too
    // many is a lesson scene (studio-clip).
    if (!story) {
      const gated = gateClips(outline, bible);
      if (gated.fixed.length)
        this.logger.log(
          `studio ${episode.id}: clips put right: ${gated.fixed.join('; ')}`,
        );
      outline = gated.outline;
    }
    if (kept) outline = { ...outline, story: kept };
    // Each scene tied to the pages it teaches.
    if (pages) {
      const tied = scenePages(outline.scenes, pages.ranges);
      outline = {
        ...outline,
        scenes: outline.scenes.map((scene, k) => ({
          ...scene,
          pages: tied[k],
        })),
      };
    }
    await this.finishOutline(show, episode, outline, problems, revising, key);
    if (pages) await this.nextOfSeries(show, episode);
  }

  /**
   * The brief an explainer made from a document's pages is outlined from:
   * the pages this episode teaches, and their text (short) or their
   * teacher's notes (long). Null for an episode with no pages, or when
   * they cannot be read: it is outlined from the brief alone.
   */
  private async pagesFor(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<{ brief: string; ranges: [number, number][] } | null> {
    const document = show.brief.document;
    const pick = episode.pages;
    if (!this.material || !document || !pick) return null;
    try {
      const who = profileOf(show.brief);
      const material = await this.material.forOutline({
        documentId: document.documentId,
        pick,
        minutes: show.brief.minutes ?? 2,
        about: [
          `A short animated explainer made from "${document.title}".`,
          who ? `Whom it teaches:\n${describeAudience(who)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        record: (usage) => this.record(episode.id, usage, 'scene_notes'),
      });
      if (!material) return null;
      this.logger.log(
        `studio ${episode.id}: outlined from ${pick.label} (${pagesWords(pick.ranges)}), ${material.condensed ? "as teacher's notes" : 'as its pages'}, ${material.text.length} characters`,
      );
      return {
        brief: [
          describeBrief({ ...show.brief, document: { ...document, ...pick } }),
          `This episode teaches ${pick.label} (${pagesWords(pick.ranges)}).`,
          material.condensed
            ? `Teacher's notes on those pages, each page marked:\n${material.text}`
            : `Those pages, as the document has them:\n${material.text}`,
        ].join('\n\n'),
        ranges: pick.ranges,
      };
    } catch (error) {
      this.logger.warn(
        `studio ${episode.id}: its pages could not be read; outlined from the brief: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * A series made from a document is outlined one episode after another:
   * the next, waiting with its pages and no outline, is set writing.
   */
  private async nextOfSeries(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
  ): Promise<void> {
    const next = (await this.studio.listEpisodes(show.id)).find(
      (e) => e.number === episode.number + 1,
    );
    if (
      !next ||
      !next.pages ||
      next.outline ||
      next.busy ||
      next.phase !== 'brief' ||
      !(await this.studio.claimEpisode(next.id, 'outline'))
    )
      return;
    await this.queue.enqueueStudio([
      {
        kind: 'outline',
        showId: show.id,
        episodeId: next.id,
        userId: show.userId,
      },
    ]);
  }

  // ── The story ───────────────────────────────────────────────────────────

  /**
   * A story developed in steps (studio-story-plan §1.1–1.4, studio-develop):
   * the premise, the characters' personalities (kept in the bible with
   * their looks as they were), the beat sheet for the film's length, and
   * the scene plan the outline is built from. With `previous` and a
   * request, the story is changed as asked and the rest kept.
   */
  private async developStory(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    given: StudioBible,
    before: string | undefined,
    request: string | undefined,
    previous: StudioStory | null,
    key?: string,
  ): Promise<{ outline: StudioOutline; problems: string[] }> {
    const who = `studio ${episode.id}: story`;
    await this.studio.updateEpisode(episode.id, { busy: 'story' });
    const developed = await developStory(this.llm, {
      brief: show.brief,
      briefWords: describeBrief(show.brief),
      bible: given,
      ...(before ? { before } : {}),
      ...(request ? { request } : {}),
      previous,
      first: episode.number === 1,
      sendBacks: this.scriptSettings().storySendBacks,
      record: (usage) => this.record(episode.id, usage),
      onStep: (report) => {
        if (report.fixed?.length)
          this.logger.log(
            `${who} ${report.step} put right by code: ${report.fixed.join('; ')}`,
          );
        if (report.left)
          this.logger.log(
            `${who} ${report.step} went back: ${(report.hard ?? []).join(' ')}`,
          );
        const noted = report.first.filter((p) => !report.hard?.includes(p));
        if (noted.length || (report.hard?.length && !report.left))
          this.logger.log(
            `${who} ${report.step} noted: ${[...(report.left ? [] : (report.hard ?? [])), ...noted].join(' ')}`,
          );
      },
    });
    // Who everyone is, kept on the show as it is now (a drawing chosen
    // meanwhile stays).
    const now = (await this.studio.findShow(show.id))?.bible ?? given;
    await this.studio.updateShow(show.id, {
      bible: withPersonas(now, developed.personas),
    });
    const { story } = developed;
    this.logger.log(
      `${who}: "${story.premise.title}", ${story.beats.template}, ${story.beats.beats.length} beats (tension ${story.beats.beats.map((b) => b.intensity).join(' ')}), ${story.plan.scenes.length} scenes${developed.problems.length ? `; left: ${developed.problems.join(' ')}` : ''}`,
    );
    await this.log(
      show,
      episode,
      {
        what: 'story',
        step: 'story',
        line: `Story ${previous ? 'changed' : 'developed'}: “${story.premise.title}”`,
      },
      key && `${key}:story`,
    );
    await this.studio.updateEpisode(episode.id, { busy: 'outline' });
    // What the outline's own check finds is the outline's to say.
    const outlineProblems = checkOutline(
      developed.outline,
      developed.bible,
      show.brief.minutes ?? 1,
      true,
      episode.number === 1,
    );
    return { outline: developed.outline, problems: outlineProblems };
  }

  /** An outline written: said in the thread, kept on the episode, and written again if the brief moved meanwhile. */
  private async finishOutline(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    outline: StudioOutline,
    problems: string[],
    revising: boolean,
    key?: string,
  ): Promise<void> {
    const story = show.brief.format !== 'explainer';
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
          // A story's is developed again with it.
          ...(story && outline.story ? { story: true } : {}),
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

  /**
   * Every scene of the outline written and checked, a few at once: an
   * explainer's each its own lesson page, a story's each from its plan and
   * then carried on from one to the next by code (writeStoryScript). The
   * script is ready as soon as it is written; the table read then only
   * scores it, for the log, unless STUDIO_TABLEREAD_ROUNDS asks for
   * rewrites below the bar.
   */
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
      // Each scene as what it is: a lesson page, or a story clip.
      await inBatches(rows, WRITERS, async (row, k) => {
        if (isClip(outline.scenes[k]))
          await this.writeClipScene(show, episode, outline, bible, row, k);
        else
          await this.writeExplainerScene(show, episode, outline, bible, row, k);
      });
    else {
      const settings = this.scriptSettings();
      const sheets = await this.writeStoryScenes(
        show,
        episode,
        outline,
        bible,
        rows,
        settings.writers,
      );
      // The table read (S4) with rewrites below the bar, where a setting
      // asks for them: the script is read before it is ready.
      if (settings.tableRead && settings.rounds > 0)
        await this.readScript(show, episode, outline, bible, rows, sheets);
      await this.scriptWritten(show, episode, rows.length, key);
      // Else only scored, for the log, once the script is ready: nothing
      // it finds changes the script.
      if (settings.tableRead && settings.rounds === 0)
        await this.readScript(show, episode, outline, bible, rows, sheets);
      return;
    }
    await this.scriptWritten(show, episode, rows.length, key);
  }

  /** The script said written in the thread, and the episode free. */
  private async scriptWritten(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    count: number,
    key?: string,
  ): Promise<void> {
    await this.log(
      show,
      episode,
      { what: 'scenes', step: 'script', line: EVENT_LINES.scenes(count) },
      key,
    );
    await this.studio.updateEpisode(episode.id, { busy: null, error: null });
  }

  /**
   * A story's scenes written a few at once (writeStoryScript), each kept
   * on its row as its writer's answer comes back, then every scene kept
   * again as carried on from the one before, and the show grown with what
   * their words named. Returns the sheets, in order.
   */
  private async writeStoryScenes(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    outline: StudioOutline,
    bible: StudioBible,
    rows: StudioSceneRecord[],
    writers: number,
  ): Promise<StorySheet[]> {
    const started = Date.now();
    const script = await writeStoryScript(this.llm, {
      brief: show.brief,
      bible,
      outline,
      writers,
      record: (usage) => this.record(episode.id, usage),
      log: (k, line) =>
        this.logger.log(`studio ${episode.id} s${k + 1}: ${line}`),
      onWritten: async (k, written) => {
        if (!rows[k]) return;
        await this.studio.updateScene(rows[k].id, {
          sheet: written.sheet,
          sheetHash: sceneFingerprint(written.sheet, bible, show.brief, []),
          problems: written.problems,
          status: 'ready',
          error: null,
        });
      },
    });
    // A feature the words name joins its set for good, and a thing of the
    // show's own the show, as new places and people join the cast.
    const grown =
      JSON.stringify([script.bible.sets, script.bible.things]) !==
      JSON.stringify([bible.sets, bible.things]);
    if (grown) {
      await this.studio.updateShow(show.id, { bible: script.bible });
      bible.sets.splice(0, bible.sets.length, ...script.bible.sets);
      if (script.bible.things) bible.things = script.bible.things;
    }
    // Each scene as it carries on from the one before; one changed
    // meanwhile by someone else is left as they left it.
    for (const [k, scene] of script.scenes.entries()) {
      const row = rows[k];
      if (!row) continue;
      const now = await this.studio.findScene(row.id);
      if (
        now?.sheet &&
        JSON.stringify(now.sheet) !== JSON.stringify(script.drafts[k].sheet)
      )
        continue;
      await this.studio.updateScene(row.id, {
        sheet: scene.sheet,
        sheetHash: sceneFingerprint(
          scene.sheet,
          script.bible,
          show.brief,
          scene.before?.wears ?? [],
        ),
        problems: scene.problems,
        status: 'ready',
        error: null,
      });
    }
    this.logger.log(
      `studio ${episode.id}: ${rows.length} scenes written, ${writers} at once, in ${Math.round((Date.now() - started) / 1000)}s`,
    );
    return script.scenes.map((scene) => scene.sheet);
  }

  /**
   * The table read of a story's script (studio-tableread): scored against
   * the rubric, its score logged, "story: table read 7.8". Only with
   * STUDIO_TABLEREAD_ROUNDS are its failing scenes then written again
   * below the bar, the best-read script kept. Silent to the maker. A read
   * that cannot run leaves the script as it was written.
   */
  private async readScript(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    outline: StudioOutline,
    bible: StudioBible,
    rows: StudioSceneRecord[],
    sheets: StorySheet[],
  ): Promise<void> {
    const who = `studio ${episode.id}: story`;
    const settings = this.scriptSettings();
    try {
      const result = await tableRead(this.llm, {
        brief: show.brief,
        bible,
        outline,
        sheets,
        rounds: settings.rounds,
        retell: settings.retell,
        record: (usage, task) => this.record(episode.id, usage, task),
        log: (line) => this.logger.log(`${who}: ${line}`),
      });
      const first = result.rounds[0].read;
      const kept = result.rounds[result.best].read;
      const again = result.rounds.flatMap((r) => r.rewritten).length;
      this.logger.log(
        `${who}: table read ${kept.overall}${result.rounds.length > 1 ? ` (first read ${first.overall}; ${again} scene rewrites in ${result.rounds.length - 1} round${result.rounds.length > 2 ? 's' : ''}; read ${result.best + 1} kept)` : ''}${kept.verdict ? `: ${kept.verdict}` : ''}`,
      );
      if (!result.changed.size) return;
      const grown =
        JSON.stringify([result.bible.sets, result.bible.things]) !==
        JSON.stringify([bible.sets, bible.things]);
      if (grown) await this.studio.updateShow(show.id, { bible: result.bible });
      let before: EndState | null = null;
      for (const [k, sheet] of result.sheets.entries()) {
        const problems = result.changed.get(k);
        if (problems && rows[k])
          await this.studio.updateScene(rows[k].id, {
            sheet,
            sheetHash: sceneFingerprint(
              sheet,
              result.bible,
              show.brief,
              before?.wears ?? [],
            ),
            problems,
          });
        before = endStateOf(sheet, result.bible, before);
      }
    } catch (error) {
      this.logger.warn(
        `${who}: the table read could not run (${(error as Error).message}); the script stands as written`,
      );
    }
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
        ? await this.filmInWords(
            row,
            bible,
            episode.id,
            narratorRuleOf(show.brief, bible),
          )
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
          isClip(outline.scenes[k])
            ? await this.writeClipScene(
                show,
                episode,
                outline,
                bible,
                row,
                k,
                request,
              )
            : await this.writeExplainerScene(
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
    narrator: NarratorRule | null = null,
  ): Promise<{ key: string; lines: string[] } | null> {
    if (!row.sceneKey || row.sheet?.kind !== 'story') return null;
    const scene = await this.storedScene(row.sceneKey);
    if (!scene) return null;
    const rows = await this.studio.listScenes(episodeId);
    const before = endBefore(rows, row.position, bible);
    const sheet = repairSheet(row.sheet, bible, before, narrator);
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
    const best = await writeStorySheet(this.llm, {
      brief: show.brief,
      bible,
      outline,
      k,
      before,
      planned,
      old,
      ...(request ? { request } : {}),
      record: (usage) => this.record(episode.id, usage),
      log: (line) => this.logger.log(`studio ${episode.id} s${k + 1}: ${line}`),
    });
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
   * One story clip of an explainer (studio-clip): written as a story's
   * scene with the clip profile (no thinking, no table read), held to the
   * profile by code, and kept on its row. Its call is the Studio writer's
   * (studio_write), as a story's scene is.
   */
  private async writeClipScene(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    outline: StudioOutline,
    bible: StudioBible,
    row: StudioSceneRecord,
    k: number,
    request?: string,
  ): Promise<StorySheet> {
    const old = row.sheet?.kind === 'story' ? row.sheet : null;
    const best = await writeClipSheet(this.llm, {
      brief: show.brief,
      bible,
      outline,
      k,
      old,
      ...(request ? { request } : {}),
      record: (usage) => this.record(episode.id, usage, 'studio_write'),
      log: (line) => this.logger.log(`studio ${episode.id} s${k + 1}: ${line}`),
    });
    // A feature its words name joins its set for good, as a story's does.
    const found = mendSheet(best.sheet, bible, null);
    if (found.features.length || found.things.length) {
      const grown = withFound(bible, best.sheet.set, found);
      await this.studio.updateShow(show.id, { bible: grown });
      bible.sets.splice(0, bible.sets.length, ...grown.sets);
      if (grown.things) bible.things = grown.things;
    }
    await this.studio.updateScene(row.id, {
      sheet: best.sheet,
      sheetHash: sceneFingerprint(best.sheet, bible, show.brief, []),
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
    const stage = stageOf(show.brief);
    // Whom it teaches, as their recipe has it, and whether this scene is
    // one that asks them a question.
    const who = profileOf(show.brief);
    const recipe = who ? recipeFor(who) : null;
    const check = recipe
      ? (checksAt(outline.scenes, recipe, who)[k] ?? false)
      : false;
    const teach = scene?.teach ?? scene?.summary ?? show.brief.idea;
    // Made from a document: the scene's own pages, for its terms and
    // examples exactly as the document has them.
    const own =
      scene?.pages && show.brief.document && this.material
        ? await this.material.forScene(
            show.brief.document.documentId,
            scene.pages,
          )
        : '';
    // A page fuller than the seconds can say: the writer keeps to its main
    // ideas, and does not run long to say them all.
    const fuller =
      teach.split(/\s+/).length >
      (scene?.seconds ?? 30) * TEACH_WORDS_A_SECOND * FULLEST;
    // A story clip either side (studio-clip): what it shows, and after
    // one, the line that points back to it first.
    const prior = outline.scenes[k - 1];
    const following = outline.scenes[k + 1];
    const around = [
      prior && isClip(prior)
        ? `The scene before is a short acted story clip showing: ${prior.teach ?? prior.summary} This scene explains it: open with this line, or one very like it, pointing back to what was just seen: "${hookOf(prior)}"`
        : prior
          ? `The scene before taught: ${prior.summary}`
          : 'It is the first scene: open with a hook.',
      following && isClip(following)
        ? `The scene after is a short acted story clip showing: ${following.teach ?? following.summary}`
        : following
          ? `The scene after will teach: ${following.summary}`
          : 'It is the last scene: end with a short recap.',
    ].join(' ');
    // A scene of a continuous build (part C): its things kept, and added to.
    const shared = scene?.build
      ? picturesIn(scene, bible.pictures).filter((name) =>
          outline.scenes[k + (scene.build === 'continue' ? -1 : 1)]
            ? picturesIn(
                outline.scenes[k + (scene.build === 'continue' ? -1 : 1)],
                bible.pictures,
              ).includes(name)
            : false,
        )
      : [];
    const build =
      scene?.build === 'continue'
        ? ` This scene continues the diagram: keep its things, add yours. The scene before drew${shared.length ? ` ${shared.join(', ')} and` : ''} what it taught on one board; show only what is new, name anything kept exactly as it was named, and link what you add to it with arrows.`
        : scene?.build === 'start'
          ? ' This scene starts a diagram the scenes after it add to: give each thing a short name, and link them with arrows.'
          : '';
    const ask = {
      documentTitle: show.title,
      topicTitle: outline.title,
      material: own
        ? `${teach}\n\nThe document's own pages for this scene (${pagesWords([scene.pages!])}), to keep its terms, numbers and examples exact; teach only what the scene above says:\n${own}`
        : teach,
      context: `This is scene ${k + 1} of ${outline.scenes.length} of the animated lesson "${outline.title}": "${scene?.title ?? ''}", about ${scene?.seconds ?? 30} seconds. ${around} Teach only what this scene says; the scenes either side teach the rest.${build}${fuller ? ` The page is fuller than ${scene?.seconds ?? 30} seconds can say: keep to its main ideas and leave out the detail.` : ''}`,
      profile: [
        describeScene(
          stage,
          scene?.seconds ?? 30,
          recipe
            ? { recipe, check, ...(who?.said ? { said: who.said } : {}) }
            : null,
        ),
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
    // The lesson writer's own task, as a book's page records it: its model is scene_write's.
    await this.record(episode.id, first.usage, 'scene_write');
    const options = {
      teach,
      source: show.brief.source,
      stage,
      maths: bible.maths,
      planned: scene?.seconds ?? null,
    };
    // Its words held to its audience by code: too-long sentences split and
    // stiff words made plain; what is still too hard rides along on the
    // one send-back, if there is one, and is otherwise only logged.
    // Its checkpoint (studio-checkpoint): answers kept on a check scene's
    // one question and on no other; and the first scene's cold open. What
    // is missing of either rides along on the one send-back, if any.
    const plainOf = (draft: unknown) => {
      const written = explainerSheetOf({
        kind: 'explainer',
        title: scene?.title,
        transition: 'cut',
        draft,
      });
      const asked = keepCheckpoint(written, check);
      const plain = recipe
        ? plainExplainer(asked.sheet, {
            recipe,
            material: teach,
            terms: bible.pictures.map((p) => p.name),
            check,
          })
        : { sheet: asked.sheet, fixes: [], problems: [], measure: null };
      const cold =
        k === 0 ? coldOpen(plain.sheet.draft.beats, recipe?.wpm ?? 150) : null;
      return {
        ...plain,
        problems: [
          ...plain.problems,
          ...(asked.problem ? [asked.problem] : []),
          ...(cold ? [cold] : []),
        ],
      };
    };
    let plain = plainOf(first.value);
    let sheet = plain.sheet;
    let problems: SheetProblem[] = checkExplainer(sheet, options).problems;
    // A picture that is not what its label says rides along too; the
    // make sets it in type whatever comes back (repairExplainer).
    const reasons = rideAlong(sentBackFor(problems), [
      ...plain.problems,
      ...problems.filter((p) => p.rule === 'picture'),
    ]);
    if (reasons.length) {
      this.logger.log(
        `studio ${episode.id} s${k + 1}: goes back: ${reasons.map((p) => p.message).join(' ')}`,
      );
      const again = await this.llm.sceneScript({
        ...ask,
        previous: first.value,
        problems: reasons.map((p) => p.message),
      });
      await this.record(episode.id, again.usage, 'scene_write');
      const next = plainOf(again.value);
      const left = checkExplainer(next.sheet, options).problems;
      if (worse(left, problems) <= 0)
        [sheet, problems, plain] = [next.sheet, left, next];
    }
    if (plain.measure && (plain.fixes.length || plain.problems.length))
      this.logger.log(
        `studio ${episode.id} s${k + 1}: plain words: grade ${plain.measure.grade} (bar ${recipe?.grade}), longest ${plain.measure.longest}${plain.fixes.length ? `; fixed: ${plain.fixes.join('; ')}` : ''}${plain.problems.length ? `; left: ${plain.problems.map((p) => p.message).join(' ')}` : ''}`,
      );
    // A picture the writer still got wrong is set in type, not handed to
    // the maker to put right.
    if (errorsIn(problems).length) {
      sheet = repairExplainer(sheet, options);
      problems = checkExplainer(sheet, options).problems;
    }
    // After a clip, its first line points back to it: said first if not.
    if (prior && isClip(prior)) {
      const hooked = hookFirst(sheet, hookOf(prior));
      if (hooked.fixed) {
        this.logger.log(
          `studio ${episode.id} s${k + 1}: opens on the clip's hook, by code`,
        );
        sheet = hooked.sheet;
        problems = checkExplainer(sheet, options).problems;
      }
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

  // ── Pace ────────────────────────────────────────────────────────────────

  /**
   * An explainer's made scenes played at the maker's new pace: each one's
   * voice stretched from the pace it was made at to `pace`, and the scene
   * timed again on it (SceneProcessor.repace). Nothing voiced, nothing
   * drawn, nothing spent: a scene still to be made is voiced at the new
   * pace when it is.
   */
  private async repace(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    pace: number,
    key?: string,
  ): Promise<void> {
    const rows = await this.studio.listScenes(episode.id);
    let changed = 0;
    let faster: boolean | null = null;
    for (const row of rows) {
      if (
        row.sheet?.kind !== 'explainer' ||
        row.status !== 'made' ||
        !row.sceneKey ||
        !row.audioKey
      )
        continue;
      const scene = await this.storedScene(row.sceneKey);
      if (!scene) continue;
      const tempo = pace / (scene.voicePace ?? 1);
      if (Math.abs(tempo - 1) < 0.01) continue;
      const who = `studio ${episode.id} s${row.position + 1}`;
      const done = await this.scenes
        .repace({
          scene,
          audio: await this.storage.get(row.audioKey),
          tempo,
          base: `studio/${show.id}/${episode.id}/${row.id}-${(row.madeHash ?? 'paced').slice(0, 8)}-${Date.now().toString(36)}`,
          who,
        })
        .catch((error: Error) => {
          this.logger.warn(`${who}: not paced again: ${error.message}`);
          return null;
        });
      if (!done) continue;
      // Made as it was: its fingerprint is the same, only its timing moved.
      await this.studio.updateScene(row.id, {
        sceneKey: done.sceneKey,
        audioKey: done.audioKey,
        durationMs: done.durationMs,
      });
      for (const old of [row.sceneKey, row.audioKey])
        if (![done.sceneKey, done.audioKey].includes(old))
          await this.storage.delete(old).catch(() => undefined);
      changed += 1;
      faster = tempo > 1;
    }
    if (!changed) return;
    await this.settle(show, episode, true);
    await this.log(
      show,
      episode,
      {
        what: 'edited',
        step: 'made',
        line: `The voice is ${faster ? 'quicker' : 'slower'} now: ${changed === 1 ? 'one scene' : `${changed} scenes`} timed again to it.`,
      },
      key,
    );
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
      // An explainer's are its story clips' (studio-clip): their places
      // from code's layouts where it has them, in the explainer's look.
      const clips = show.brief.format === 'explainer';
      const look = clips ? clipLook(showTheme(show.brief, bible)) : null;
      await this.scenes.prepareStory(
        {
          bible: clips
            ? withPresets(storyBibleFor(bible, sheets, show.title))
            : storyBibleFor(bible, sheets, show.title),
          page: 1,
          castKey: studioCastKey(show.id),
          setsKey: studioSetsKey(show.id),
          ownKey: studioOwnKey(show.id),
          bookTitle: show.title,
          ...(look ? { look } : {}),
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
    // An explainer's builds: each drawing its scenes share drawn once,
    // before they are made side by side, so every scene shows it alike.
    if (bible && show.brief.format === 'explainer')
      await this.prepareBoards(show, episode, rows, bible, wanted).catch(
        (error: Error) =>
          this.logger.warn(
            `studio ${episode.id}: the builds' drawings were not drawn ahead (${error.message}); each scene draws its own`,
          ),
      );
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

  /**
   * A story clip's still made its last frame, as it settles (studio-clip):
   * the next lesson's card shows it. Kept as it was when it cannot be.
   */
  private async clipStill(
    scene: SceneDto,
    thumbKey: string,
    who: string,
  ): Promise<void> {
    try {
      const t = Math.max(0, (scene.settledMs ?? scene.durationMs) - 40);
      const { png } = await renderStill(scene, t, rasterise, STILL_PX);
      await this.storage.put({
        key: thumbKey,
        body: png,
        mimeType: 'image/png',
      });
    } catch (error) {
      this.logger.log(
        `${who}: its last frame was not kept as its still (${(error as Error).message})`,
      );
    }
  }

  /**
   * A continuous build's shared drawings, drawn once for the show and kept
   * (studioBoardKey): those not kept yet, of the sections the scenes to be
   * made are in.
   */
  private async prepareBoards(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    rows: StudioSceneRecord[],
    bible: StudioBible,
    wanted: StudioSceneRecord[],
  ): Promise<void> {
    const scenes = episode.outline?.scenes ?? [];
    if (!wanted.some((row) => sectionOf(scenes, row.position))) return;
    const shared = sharedDrawings(
      scenes,
      explainerScripts(show, episode, rows, bible),
    );
    const kept = await this.boardDrawings(show.id, shared);
    const missing = shared.filter((thing) => !kept.has(thing.id));
    if (!missing.length) return;
    for (const row of wanted)
      await this.studio.updateScene(row.id, { step: 'drawing' });
    const who = `studio ${episode.id} (build)`;
    const drawn = await this.scenes.drawThings(
      missing,
      episode.outline?.title ?? episode.title,
      episode.id,
      who,
    );
    await this.keepBoardDrawings(show.id, missing, drawn);
    this.logger.log(
      `${who}: ${missing.length} drawing${missing.length === 1 ? '' : 's'} its scenes share drawn once: ${missing.map((t) => t.id).join(', ')}`,
    );
  }

  /** A build's shared drawings as kept for the show, by the thing's id: those not kept are left out. */
  private async boardDrawings(
    showId: string,
    things: readonly DrawingThing[],
  ): Promise<Map<string, GatedDrawing>> {
    const out = new Map<string, GatedDrawing>();
    await Promise.all(
      things.map(async (thing) => {
        try {
          const kept = await this.storage.get(studioBoardKey(showId, thing));
          out.set(thing.id, JSON.parse(kept.toString('utf8')) as GatedDrawing);
        } catch {
          // Not drawn yet.
        }
      }),
    );
    return out;
  }

  /** A build's shared drawings kept for the show: those that came through. */
  private async keepBoardDrawings(
    showId: string,
    things: readonly DrawingThing[],
    drawn: ReadonlyMap<string, GatedDrawing | null>,
  ): Promise<void> {
    await Promise.all(
      things.map(async (thing) => {
        const drawing = drawn.get(thing.id);
        if (!drawing) return;
        await this.storage.put({
          key: studioBoardKey(showId, thing),
          body: Buffer.from(JSON.stringify(drawing)),
          mimeType: 'application/json',
        });
      }),
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
    // A continuous build's drawings its scenes share, as drawn once for
    // them: this scene draws none of them again (studio-build).
    const shared =
      row.sheet.kind === 'explainer' &&
      sectionOf(episode.outline?.scenes ?? [], row.position) &&
      of.script
        ? sharedDrawings(
            episode.outline?.scenes ?? [],
            explainerScripts(show, episode, rows, bible),
          ).filter((thing) =>
            of.script!.cast.some((one) => one.id === thing.id),
          )
        : [];
    const drawn = shared.length
      ? await this.boardDrawings(show.id, shared)
      : new Map<string, GatedDrawing>();
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
            // An explainer's look, for its still: the player shows the
            // show's look now, whatever it was when this was made.
            // And how its text is read and its picture moves, for whom
            // it is made (studio-motion): paced by code as it is composed.
            ...(row.sheet.kind === 'explainer'
              ? {
                  theme: showTheme(show.brief, bible) ?? undefined,
                  reading: studioReading(show.brief),
                  // With the card of a clip before it, where it has one.
                  ...(drawn.size
                    ? { drawn: new Map([...(of.drawn ?? []), ...drawn]) }
                    : {}),
                }
              : {}),
          });
    if (made.fit === 'poor') throw new Error(made.reason);
    // One its section shares that was not drawn ahead, as this scene drew
    // it: kept, so the scenes after it show the same.
    const late = shared.filter((thing) => !drawn.has(thing.id));
    if (late.length && 'drawings' in made)
      await this.keepBoardDrawings(
        show.id,
        late,
        made.drawings as ReadonlyMap<string, GatedDrawing | null>,
      ).catch((error: Error) =>
        this.logger.warn(`${who}: build drawings not kept: ${error.message}`),
      );
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
    // A clip's still is its last frame: the card the next lesson opens on.
    if (row.sheet.kind === 'story' && show.brief.format === 'explainer')
      await this.clipStill(scene, thumbKey, who);
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
    // Its pictures looked at beside what its sheet says (studio-scenery-
    // plan §8.6): what is wrong is written again once, free.
    const pictures = await this.lookAtPictures(
      episode,
      row,
      scene,
      bible,
      ask,
      who,
    ).catch((error: Error) => {
      this.logger.log(`${who}: picture: not looked at (${error.message})`);
      return [] as string[];
    });
    // The film is made and spent: the check of it, however it goes, never
    // makes it again, nor spends it twice.
    let again = false;
    if (ask && !ask.picture)
      try {
        again = await this.checkAsk(
          show,
          episode,
          (await this.studio.findScene(row.id)) ?? row,
          scene,
          ask,
          bible,
          pictures,
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
    // Its one free try again, where nothing else has taken it.
    if (!again && pictures.length && (ask?.tries ?? 1) === 1)
      await this.againForPictures(show, episode, row, pictures, who);
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
    /** What the picture check found wrong: told the writer too, if it writes again. */
    pictures: readonly string[] = [],
  ): Promise<boolean> {
    if (row.sheet?.kind !== 'story') return false;
    const who = `studio ${episode.id} s${row.position + 1}`;
    const key = askKey(ask, row.id);
    const rows = await this.studio.listScenes(episode.id);
    const before = endBefore(rows, row.position, bible);
    const sheet = repairSheet(
      row.sheet,
      bible,
      before,
      narratorRuleOf(show.brief, bible),
    );
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
        return false;
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
      return false;
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
          ...(pictures.length
            ? [
                `What its pictures show wrong:\n${pictures.map((p) => `- ${p}`).join('\n')}`,
              ]
            : []),
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
      return true;
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
    return false;
  }

  /**
   * A made story scene looked at as the viewer sees it (studio-scenery-plan
   * §8.6): two to four stills of its film (the fullest moment, each moment
   * an asked change is seen, its last frame) rendered from its layers, its
   * people at their depths and the camera then, and set beside what its
   * sheet says is there for the drawing judge to look at; and what code
   * sees wrong in its things for itself. The problems found, for the
   * writer; none when it all matches. With no judge to ask (no key, no
   * credit) only code's, quietly. Each said as a "picture:" line.
   */
  private async lookAtPictures(
    episode: StudioEpisodeRecord,
    row: StudioSceneRecord,
    scene: SceneDto,
    bible: StudioBible,
    ask: StudioAsk | undefined,
    who: string,
  ): Promise<string[]> {
    if (row.sheet?.kind !== 'story' || !scene.setting?.film) return [];
    const cast = bible.characters.map((one) => ({
      id: one.id,
      name: one.name,
      look: one.look,
    }));
    const request = ask && !ask.picture ? ask.request || ask.words : null;
    const moments = pictureMoments(
      scene,
      request ? askedMoments(scene, request) : [],
    );
    const code = namedAsDrawn(scene);
    let looked: { why: string; verdict: PictureVerdict }[] = [];
    // A gateway with no judge at all: code's own look is all there is.
    if (typeof this.llm.pictureCheck !== 'function') {
      this.logger.log(
        `${who}: picture: no judge to look; ${code.length ? `wrong: ${code.join(' | ')}` : 'code sees nothing wrong'}`,
      );
      return code;
    }
    try {
      const stills: { png: Buffer; claims: string; why: string }[] = [];
      for (const moment of moments) {
        const { png } = await renderStill(scene, moment.t, rasterise, STILL_PX);
        const claims = pictureClaims(
          scene,
          moment.t,
          cast,
          moment.why.startsWith('the asked') ? request : null,
        );
        stills.push({
          png,
          claims: claimsText(claims, moment.why),
          why: moment.why,
        });
      }
      progressNow({
        says: `Checking the pictures of scene ${row.position + 1}`,
        short: 'Checking',
      });
      const judged = await this.llm.pictureCheck({
        stills: stills.map(({ png, claims }) => ({ png, claims })),
      });
      await this.record(episode.id, judged.usage, 'drawing_judge');
      looked = stills.map((still, i) => ({
        why: still.why,
        verdict: judged.value.stills[i] ?? { matches: true, wrong: [] },
      }));
    } catch (error) {
      // No judge to ask: code's own look is all there is.
      this.logger.log(
        `${who}: picture: not looked at by the judge (${(error as Error).message.slice(0, 160)})`,
      );
    }
    const problems = pictureProblems(code, looked);
    this.logger.log(
      `${who}: picture: ${looked.length} of ${moments.length} stills looked at (${moments.map((m) => `${m.why} at ${m.t}ms`).join(', ')}); ${problems.length ? `wrong: ${problems.join(' | ')}` : 'as the sheet says'}`,
    );
    return problems;
  }

  /**
   * A scene whose pictures do not show what its sheet says, written again
   * once, free and quietly (studio-scenery-plan §8.6): its words kept, its
   * staging changed for what the check found; made again on its own
   * voice, nothing spent.
   */
  private async againForPictures(
    show: StudioShowRecord,
    episode: StudioEpisodeRecord,
    row: StudioSceneRecord,
    problems: readonly string[],
    who: string,
  ): Promise<void> {
    this.logger.log(
      `${who}: picture: written again, free, for what it shows wrong`,
    );
    const request =
      'Make the film show what the sheet says: every named thing drawn as what it is, everyone on the stage seen whole and big enough to know.';
    const again: StudioAsk = {
      id: `picture-${row.id}-${Date.now().toString(36)}`,
      words: '',
      request,
      tries: 2,
      free: true,
      picture: true,
      problems: [
        `The film as made does not show what the sheet says. What its pictures show wrong:\n${problems.map((p) => `- ${p}`).join('\n')}`,
        'Keep every line and every word of narration exactly as it is; change only the staging (where people stand, near or far, and what is held) and what each thing of the place is called and is, so each is drawn as what it is.',
      ],
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
        request,
        ask: again,
      },
    ]);
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
