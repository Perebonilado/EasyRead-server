import type { SetLook } from '../../business/domain/scene-set-layout';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { SceneDto, SceneTiming } from '../../contracts';
import { wordTimesFromAligned } from '../../business/domain/board';
import {
  catalogueSpeechCost,
  characterSpeechCost,
  geminiSpeechCost,
} from '../../business/domain/cost';
import { NotFoundError } from '../../business/domain/errors/errors';
import { sceneProse } from '../../business/domain/follow';
import {
  NOTES_PAGE_CHARS,
  NOTES_VERSION,
  carryOver,
  describeNotes,
  drawnAsTheyAre,
  endingKey,
  endingOf,
  firstSaid,
  joinDrafts,
  mendNotes,
  notesKey,
  notesParts,
  notesProblems,
  pageSign,
  wordsPerMinute,
  type ChapterNotes,
  type PageEnding,
  type PageNotes,
  type PageSign,
} from '../../business/domain/lesson-notes';
import { pageEnd, storyText } from '../../business/domain/story-text';
import { drawByCode } from '../../business/domain/scene-code';
import {
  DEFAULT_PROFILE,
  describeProfile,
  profileKey,
  profileOf,
  surenessOf,
  type DocumentProfile,
} from '../../business/domain/scene-profile';
import {
  STAGE_RECIPES,
  describeStage,
  levelIn,
  settleStage,
  type LearningStage,
} from '../../business/domain/scene-stage';
import {
  CROWD_ID,
  composeScene,
  crowdShown,
  describeStep,
  featureStill,
  featureSvgAt,
  fullestStep,
  hiddenAt,
  rhythmOf,
  thumbSvg,
  withoutStandIns,
} from '../../business/domain/scene-compose';
import {
  conventionGround,
  measureGround,
} from '../../business/domain/scene-ground';
import {
  mendScreenplay,
  type ScreenplayDraft,
} from '../../business/domain/scene-screenplay';
import { rasterise } from '../../business/domain/scene-raster';
import { pictureMoments } from '../../business/domain/scene-picture-check';
import { renderStill } from '../../business/domain/scene-still';
import {
  SCENE_GENERATOR_VERSION,
  isCodeThing,
  mendScript,
  type MendedScript,
  sendBack,
  quotedSpans,
  facesShown,
  signsShown,
  wordsOf,
  type CharacterThing,
  type PersonThing,
  type PlaceThing,
  type DrawingThing,
  type LineFrom,
  type LinePace,
  type SceneScript,
  type SceneScriptDraft,
} from '../../business/domain/scene-script';
import {
  PLAIN_FIGURE,
  figureFor,
  describeFigure,
  figureOf,
  signsOver,
  type FigureSpec,
  oldWorld,
} from '../../business/domain/scene-figure';
import { animalFor, describeAnimal } from '../../business/domain/scene-animal';
import {
  creatureFor,
  describeCreature,
} from '../../business/domain/scene-creature';
import {
  OWN_VERSION,
  SIZE_UNITS,
  animalDrawing,
  animalSheet,
  castOf,
  creatureDrawing,
  creatureSheet,
  failedLately,
  figureDrawing,
  figureSheet,
  lightDrawing,
  measureOwnFeature,
  measureOwnThing,
  mouthOf,
  optionsKey,
  ownFeatureScale,
  ownThingScale,
  missingByCode,
  notDrawnYet,
  ownSheetsOf,
  setsOf,
  type Cast,
  type CharacterSheet,
  type OwnSheets,
  type RealSize,
  type SetSheet,
  type Sets,
} from '../../business/domain/scene-sheet';
import { DANGLE_RIG } from '../../business/domain/scene-dangles';
import { VIEW_RIG } from '../../business/domain/scene-figure-views';
import { DRAWN } from '../../business/domain/scene-own';
import type { OwnPropDrawing } from '../../business/domain/scene-props';
import type { SetPiece } from '../../business/domain/scene-set-pieces';
import { buildSet, reverseSet } from '../../business/domain/scene-set-layout';
import { RIG_VERSION, rigSheet } from '../../business/domain/scene-sheet-rig';
import { withMouths } from '../../business/domain/studio/studio-audit';
import { withFace } from '../../business/domain/scene-sheet-face';
import {
  EMPTY_STORY,
  MAX_STORY_PIECES,
  OPENING_LEAD_S,
  OWN_FEATURE_CANVAS,
  OWN_THING_CANVAS,
  bibleOf,
  ownFeatureBrief,
  ownThingBrief,
  castKey,
  castStory,
  crowdOn,
  describeStory,
  mergeStory,
  setsKey,
  standsOnStage,
  STORY_VERSION,
  storyKey,
  whereaboutsOn,
  outsideStory,
  titleCard,
  storyPieces,
  withVoices,
  type StoryBible,
  type StoryCharacter,
  type StoryKind,
  type StoryPlace,
  type StorySize,
  type StoryWorld,
} from '../../business/domain/scene-story';
import {
  CANVAS,
  gateDrawing,
  type GateResult,
  type GatedDrawing,
} from '../../business/domain/scene-svg';
import {
  estimateSpokenWords,
  pinSpokenWords,
  sceneSpoken,
  spokenWordsFromVoice,
  timeBeats,
  type SpokenWords,
  outOfSilence,
  type TimedBeat,
} from '../../business/domain/scene-timing';
import {
  HOLD_LIMIT_S,
  characterVoice,
  narratingSpeaker,
  deliveryPieces,
  sentenceStarts,
  voiceSlug,
  voiceStyle,
  voicedPieces,
} from '../../business/domain/scene-voice';
import { mp3DurationMs } from '../../business/domain/speech';
import {
  bandOfStage,
  lessonPace,
  makerRate,
  paceReport,
  paceWordFor,
  voiceRate,
  type PaceBrief,
  type PaceReport,
} from '../../business/domain/scene-pace';
import {
  applyPaceEdits,
  paceWanted,
  planPaceEdits,
  retimeBeats,
  retimeScene,
  timeMapOf,
  type PaceNotes,
} from '../../business/domain/scene-pace-audio';
import type { Pcm } from '../../business/domain/wav';
import type { AudioCodecPort } from '../../business/ports/audio-codec.port';
import { spokenForm, type Pronunciations } from '../../business/domain/spoken';
import { startMathsSpeech } from '../../business/domain/maths-speech';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  ALIGNER,
  AUDIO_CODEC,
  LLM_GATEWAY,
  STORAGE,
} from '../../business/ports/tokens';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  DocumentPageRepository,
  PageText,
} from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type {
  SummaryRepository,
  TopicRecord,
  TopicRepository,
} from '../../business/repositories/misc.repository';
import type { PronunciationRepository } from '../../business/repositories/pronunciation.repository';
import type { SimplifiedPageRepository } from '../../business/repositories/simplified-page.repository';
import {
  AI_CALL_LOG_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_REPOSITORY,
  PRONUNCIATION_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
  TOPIC_REPOSITORY,
  VISUAL_SCENE_REPOSITORY,
} from '../../business/repositories/tokens';
import type { VisualSceneRepository } from '../../business/repositories/visual.repository';
import type { VisualSceneJobData } from '../queues';
import { isPermanentFailure, type JobContext } from './base.processor';
import {
  DRAW_TRIES,
  SceneArtist,
  referenceOf,
  type ArtistOptions,
  type DrawAgain,
} from './scene-artist';
import { KIT_LINE } from '../../business/domain/scene-ink';
import { SceneVoiceService } from '../../business/handlers/admin/scene-voice.service';

/** The most of a page the writer reads. */
const MATERIAL_CHARS = 14_000;
/** How much of a document's pages the profile is made from. */
const PROFILE_SAMPLE_CHARS = 6_000;
/** A page with fewer words than this has too little to teach. */
const THIN_PAGE_WORDS = 40;
/** A story page's own text with fewer words than this is too little to write from: its note is used. */
const STORY_OWN_WORDS = 20;
/** A story's page is a scene with this many of its own words: a picture book's page has few. */
const THIN_STORY_WORDS = 12;
/** The card's still, in pixels across. */
export const THUMB_WIDTH = 480;
/** Seconds of quiet after the sentence that first says a new term: room for it to land. */
const TERM_LANDS_S = 0.7;
/** Parts of a chapter read for its notes at once. */
const NOTES_READERS = 3;
/** A silence ending this close to the end of the audio is the quiet it ends on. */
const QUIET_END_SLACK_MS = 100;
/** Stretches of a story read at once. */
const STORY_READERS = 4;
/** The most stretches (about 20 pages each) a story read the old way is read again in, unasked. */
const REREAD_MOST_STRETCHES = 6;
/** A line's pace that is a tone of voice, not a speed: for a voice that takes tags (ElevenLabs) or a volume (Cartesia). */
const TONE_OF: Partial<Record<LinePace, 'whisper' | 'shout'>> = {
  whisper: 'whisper',
  shout: 'shout',
};

/** How a line from somewhere else is said, for a voice that takes direction. */
const FROM_STYLE: Partial<Record<LineFrom, string>> = {
  thought: 'thinking it quietly to themselves, not aloud',
  above: 'from above, unhurried',
  phone: 'down a phone line',
  letter: 'reading out the words they wrote',
  dream: 'as if remembered, soft and far away',
};

/** A story's page: the book's bible, the page's number in it, and where the book's characters are kept. */
export interface PageStory {
  bible: StoryBible;
  page: number;
  castKey: string;
  /** Where the book's places, painted once, are kept. */
  setsKey: string;
  bookTitle: string;
  /**
   * Where a Studio show's own things and features, each drawn once by the
   * artist, are kept (a kite, a signpost). A book's pages have none.
   */
  ownKey?: string;
  /** A Studio show's animation style on its sets: a tint over their palette, and their ink (studio-style.ts). */
  look?: SetLook;
}

/** An explainer page's part of its chapter's teacher's notes, and how the page before it ended. */
interface Lesson {
  notes: ChapterNotes;
  here: PageNotes;
  ending: PageEnding | null;
  /** The notes as the writer reads them. */
  text: string;
}

/** Each item through `work`, at most `limit` at a time, in order. */
async function inBatches<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const at = next++;
      out[at] = await work(items[at]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
  return out;
}

/** A person no model could describe: plainly dressed, as old as their voice, their skin and hair chosen by who they are. */
function figureByVoice(
  voice: StoryCharacter['voice'],
  seed: string,
): FigureSpec {
  const age =
    voice === 'girl' || voice === 'boy'
      ? 'child'
      : voice === 'old woman' || voice === 'old man'
        ? 'elder'
        : 'adult';
  return figureFor(seed, { age, top: PLAIN_FIGURE.top });
}

/**
 * One page as an animated video.
 *
 * The writer (OpenAI) scripts the narration and the storyboard in one
 * call; code mends what it can and asks once more if it must. The artist
 * (DeepSeek) draws every picture the storyboard needs, all at once, each
 * through the gate and redrawn once when it falls short. Beside the
 * drawing, the voice (Kokoro on Railway) speaks the sentences and says
 * when it spoke each word. Then every step is put on its words, placed for
 * both stagings, and stored beside its audio and a still for its card.
 *
 * A page fails only when the writer or the voice does; a drawing that
 * cannot be made is set as a card with its name, never a reason to lose
 * the page.
 */
/** What the writer is asked about a page, before any answer to put right. */
type WriteAsk = Omit<
  Parameters<LlmGatewayPort['sceneScript']>[0],
  'previous' | 'problems'
>;

/**
 * A set built by code before it was kept as layers, as layers too: built
 * again from its own layout, with nothing asked of a model, when nothing
 * in it was drawn apart by the artist (whose drawings are not kept with
 * it). Its flat picture stays as it was kept. And one kept as layers
 * before it had another side is given one from its layout, likewise
 * (studio-views-plan §4.2), what the artist drew for it left out; a set
 * painted whole has no layout, and no other side.
 */
function withLayers(
  set: SetSheet | undefined,
  place: StoryPlace,
): SetSheet | undefined {
  if (!set || !set.layout) return set;
  if (set.layered) {
    if (set.layered.reverse) return set;
    const reverse = reverseSet(set.layout, place);
    return reverse
      ? { ...set, layered: { ...set.layered, reverse: reverse.layered } }
      : set;
  }
  if (set.layout.own.length) return set;
  try {
    return { ...set, layered: buildSet(set.layout, place).layered };
  } catch {
    return set;
  }
}

@Injectable()
export class SceneProcessor {
  private readonly logger = new Logger(SceneProcessor.name);
  /** Work others wait on rather than repeat: a book's story, a character's drawing. */
  private readonly running = new Map<string, Promise<unknown>>();
  /** Writes to one file, each after the last. */
  private readonly writing = new Map<string, Promise<unknown>>();
  /** A kept drawing that would not rig, by book and character: not tried again here. */
  private readonly unrigged = new Map<string, string>();
  /** The artist: every character, place and thing of a show's own the model draws. */
  private readonly artist: SceneArtist;

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(VISUAL_SCENE_REPOSITORY)
    private readonly visuals: VisualSceneRepository,
    @Inject(PRONUNCIATION_REPOSITORY)
    private readonly pronunciations: PronunciationRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    private readonly voices: SceneVoiceService,
    private readonly config: ConfigService,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(ALIGNER) private readonly aligner: AlignerPort,
    /** Audio to samples and back, for the pace step; without it, the voice is kept as it came. */
    @Optional()
    @Inject(AUDIO_CODEC)
    private readonly codec?: AudioCodecPort,
  ) {
    this.artist = new SceneArtist(
      this.llm,
      (documentId, task, usage) => this.record(documentId, task, usage),
      this.logger,
    );
  }

  /**
   * Whether a book's animals are drawn by the kit when their species is
   * one it has (SCENE_ANIMAL_KIT_BOOKS=on): off until wanted, so books are
   * as they were. A Studio show's animals are the kit's whenever its
   * writer gives them a spec.
   */
  private get bookAnimals(): boolean {
    return /^(?:on|1|true|yes)$/i.test(
      this.config.get<string>('SCENE_ANIMAL_KIT_BOOKS')?.trim() ?? '',
    );
  }

  async process(job: VisualSceneJobData, context: JobContext): Promise<void> {
    const { documentId, pageNumber, contentVersion } = job;
    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== contentVersion) return;
    // A job for another generator's row finds none, and ends quietly.
    const record = await this.visuals.find(
      documentId,
      contentVersion,
      pageNumber,
      SCENE_GENERATOR_VERSION,
    );
    // A page made already is made again only when asked to remake it: it
    // stays as it was, playable, until the new one takes its place.
    const remaking = Boolean(job.remake) && record?.status === 'done';
    if (!record || (record.status === 'done' && !remaking)) return;
    const topics = await this.topics.listByDocument(documentId);
    const topic =
      topics.find((candidate) => candidate.id === record.topicId) ??
      topics.find(
        (candidate) =>
          pageNumber >= candidate.startPage && pageNumber <= candidate.endPage,
      );
    if (!topic) {
      if (remaking) return;
      await this.visuals.update(record.id, {
        status: 'failed',
        error: 'The page is outside every chapter',
      });
      return;
    }
    const who = `${documentId} p${pageNumber}${remaking ? ' (remade)' : ''}`;
    const started = Date.now();

    try {
      if (!remaking)
        await this.visuals.update(record.id, {
          status: 'making',
          step: 'writing',
          error: null,
          attempts: record.attempts + 1,
        });
      const profile = await this.profileFor(documentId, contentVersion);
      const story = await this.pageStory(
        profile.story,
        documentId,
        contentVersion,
        doc.props.title,
        pageNumber,
      );
      // A story book's pages before its story or after it are not played
      // as story: the first is a title card, the rest are not made.
      let premade: SceneScript | null = null;
      if (story && outsideStory(story.bible, pageNumber)) {
        if (pageNumber === 1) premade = titleCard(story.bible, doc.props.title);
        else {
          // Made again or not: a video of what is not the story was the
          // wrong thing, and does not stay.
          await this.visuals.update(record.id, {
            status: 'not_suitable',
            step: null,
            fit: 'poor',
            fitReason: 'This page is not part of the story.',
          });
          return;
        }
      }
      // A story's page is written from the book's own words, its note
      // beside them for plainer wording; any other page from its note.
      const { material, plain, before } = profile.story
        ? await this.storyMaterial(documentId, pageNumber)
        : {
            material: await this.material(documentId, pageNumber),
            plain: null,
            before: null,
          };
      if (
        !premade &&
        wordsOf(material).length <
          (profile.story ? THIN_STORY_WORDS : THIN_PAGE_WORDS)
      ) {
        if (remaking) return;
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: 'poor',
          fitReason: 'Too little on this page to teach.',
        });
        return;
      }

      // An explainer's page is one part of its chapter's lesson: written
      // from the teacher's notes, carrying on from the page before.
      const lesson =
        profile.story || premade
          ? null
          : await this.lessonFor(
              documentId,
              contentVersion,
              topic,
              pageNumber,
              doc.props.title,
              profile,
            );
      if (lesson?.here.relation === 'skip') {
        if (remaking) return;
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: 'poor',
          fitReason: `Not a page to teach: ${lesson.here.evidence}.`,
        });
        return;
      }

      const made = await this.make({
        documentId,
        documentTitle: doc.props.title,
        topic,
        material,
        plain,
        before,
        context: await this.where(
          documentId,
          contentVersion,
          topic,
          pageNumber,
          Boolean(lesson),
        ),
        lesson,
        profile,
        story: premade ? null : story,
        ...(premade ? { script: premade } : {}),
        kept: doc.props.institutionId
          ? await this.pronunciations.kept(doc.props.institutionId)
          : new Map(),
        // Remade, under its own names: the page made before plays on
        // from its own files until the row points at the new ones.
        base: `documents/${doc.id}/visuals/v${contentVersion}/p${pageNumber}-${SCENE_GENERATOR_VERSION}${remaking ? `-r${Date.now().toString(36)}` : ''}`,
        who,
        keepAs: `${documentId}-p${pageNumber}`,
        step: remaking
          ? undefined
          : (step) => this.visuals.update(record.id, { step }),
      });
      if (made.fit === 'poor' && remaking) {
        this.logger.warn(
          `${who}: judged unsuited this time; the page made before stays`,
        );
        return;
      }
      if (made.fit === 'poor') {
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: 'poor',
          fitReason: made.reason,
        });
        return;
      }
      const { scene, sceneKey, thumbKey, voice, script, drawings, filled } =
        made;

      await this.visuals.update(record.id, {
        status: 'done',
        step: null,
        title: scene.title.slice(0, 80),
        sceneKey,
        audioKey: voice.audioKey,
        thumbKey,
        timing: voice.timing,
        durationMs: voice.durationMs,
        error: null,
      });
      // The files the page was made from before, now no one's: a learner
      // who has the page open has its audio already (it is fetched whole,
      // through the row), and a purge knows only the row's own files.
      if (remaking)
        for (const key of [record.sceneKey, record.audioKey, record.thumbKey])
          if (key && ![sceneKey, voice.audioKey, thumbKey].includes(key))
            await this.storage.delete(key).catch(() => undefined);
      // How it ended, for the page after it to carry on from.
      if (!profile.story)
        await this.keepEnding(
          documentId,
          contentVersion,
          pageNumber,
          script,
          drawings,
        );
      const drawn = [...drawings.values()].filter(Boolean).length;
      const rhythm = rhythmOf(scene);
      const held = lesson
        ? notesProblems(script, lesson.notes, pageNumber, material)
        : null;
      this.logger.log(
        `${who}: made in ${Math.round((Date.now() - started) / 1000)}s: ${script.beats.length} sentences, ${Math.round(voice.durationMs / 1000)}s of audio timed by ${voice.timing}, ${wordsPerMinute(scene.beats)} words a minute, ${scene.steps.length} stage changes, ${scene.effects.length} effects (${filled} filled), ${drawn} of ${drawings.size} drawings; still at most ${Math.round(rhythm.stillMs / 1000)}s, ${rhythm.perMinute} changes a minute, ${rhythm.stagesPerMinute} of the stage${lesson && held ? `; a ${lesson.here.relation} page, ${held.shown} of ${held.points} planned ideas shown` : ''}`,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${who}: scene failed: ${message}`);
      // A remake that fails leaves the page as it was made before.
      if (remaking) {
        if (!context.isFinalAttempt && !isPermanentFailure(error)) throw error;
        return;
      }
      // A refusal cannot come right on a retry; nor can the last attempt.
      // Either way the row says so, and can be asked for again.
      if (!context.isFinalAttempt && !isPermanentFailure(error)) {
        await this.visuals.update(record.id, { step: null });
        throw error;
      }
      await this.visuals.update(record.id, {
        status: 'failed',
        step: null,
        error: message,
      });
    }
  }

  /**
   * A page made from its material: written, drawn and voiced together,
   * put on its words, audited, and stored under `base` with a still for
   * its card. The page's row is the caller's: `step` says where the
   * making is. A page not fit to teach comes back as such, with nothing
   * stored. `documentId` is null for a page made from any text at all
   * (scripts/scene-try): its costs are logged against no document.
   */
  async make(input: {
    documentId: string | null;
    documentTitle: string;
    topic: TopicRecord;
    material: string;
    /** The page's note, when the material is the book's own words. */
    plain?: string | null;
    /** How a story's page before ends, in the book's own words. */
    before?: string | null;
    context: string;
    /** An explainer page's teacher's notes, and how the page before ended. */
    lesson?: Lesson | null;
    profile: DocumentProfile;
    /** A story's page: its characters are the book's own. */
    story?: PageStory | null;
    /** A script made by code (a story book's title card): no writer. */
    script?: SceneScript;
    kept: Pronunciations;
    base: string;
    who: string;
    /** What SCENE_KEEP_PARTS names the page's parts file. */
    keepAs?: string;
    step?: (step: 'drawing' | 'voicing' | 'composing') => Promise<void>;
    /**
     * A look at the scene as composed (the Studio's check that every beat
     * shows): what it found, for the log, and a script to compose again
     * from the same drawings and voice, or null when it is sound.
     */
    recheck?: (scene: SceneDto) => {
      notes: string[];
      script: SceneScript | null;
    };
    /** A lesson's audience and the maker's pace, for its voice; the stage's when absent. */
    pace?: PaceBrief | null;
  }): Promise<
    | { fit: 'poor'; reason: string }
    | {
        fit: 'good';
        scene: SceneDto;
        sceneKey: string;
        thumbKey: string;
        voice: Awaited<ReturnType<SceneProcessor['voice']>>;
        script: SceneScript;
        drawings: Map<string, GatedDrawing | null>;
        filled: number;
      }
  > {
    const { documentId, topic, who, base } = input;
    // A story's page, with any voice its words bring in that the book's
    // reader did not list: a voice from heaven, a crowd that speaks.
    const story = input.story
      ? {
          ...input.story,
          bible: withVoices(
            input.story.bible,
            input.story.page,
            input.material,
          ),
        }
      : null;
    // A script code made (a story book's title card) needs no writer.
    const written: SceneScript =
      input.script ??
      (await this.write({
        documentTitle: input.documentTitle,
        topic,
        material: input.material,
        plain: input.plain ?? null,
        before: input.before ?? null,
        context: input.context,
        lesson: input.lesson ?? null,
        profile: input.profile,
        story,
        documentId,
        who,
      }).then((written) =>
        story ? castStory(written, story.bible, story.page) : written,
      ));
    // Each thing drawn as the notes say it really is: a client in a
    // system's design is a computer, never a person.
    const truly = drawnAsTheyAre(written, input.lesson?.notes ?? null);
    if (truly.mended.length)
      this.logger.log(`${who}: ${truly.mended.slice(0, 4).join('; ')}`);
    // What the page before left on the stage, brought back: drawn once.
    const carried = carryOver(truly.script, input.lesson?.ending ?? null);
    if (carried.mended.length)
      this.logger.log(`${who}: ${carried.mended.slice(0, 4).join('; ')}`);
    let script = carried.script;
    if (script.fit === 'poor')
      return {
        fit: 'poor',
        reason: script.fitReason ?? 'This page does not suit a video.',
      };

    // Drawing and voicing need only the script, so they run together.
    await input.step?.('drawing');
    let voiced = false;
    // A voice that fails stops the drawing: nothing more is asked for,
    // and both branches have settled before the catch below touches the
    // row, so neither writes to it afterwards.
    const stop = new AbortController();
    const [drawing, spoken] = await Promise.allSettled([
      Promise.all([
        this.drawAll(
          script,
          topic.title,
          documentId,
          who,
          stop.signal,
          story,
          carried.reuse,
        ),
        this.drawOwn(script, story, documentId, who, stop.signal),
      ]).then(async ([made, own]) => {
        // The show's own, as drawn: the stage holds and stands them.
        if (own) script = { ...script, drawn: own };
        if (!voiced && !stop.signal.aborted) await input.step?.('voicing');
        return made;
      }),
      this.voice(
        script,
        input.kept,
        base,
        documentId,
        who,
        story,
        // The voice waits while a "previously" brings the last page back,
        // and while what happens before the first word happens: a film's
        // opening as long as its quiet may be, under its music.
        Math.min(
          (input.profile as { film?: boolean }).film ? HOLD_LIMIT_S : 3,
          (script.opening?.show.length ? OPENING_LEAD_S : 0) +
            (script.lead ?? 0),
        ),
        input.profile.stage ?? null,
        input.lesson?.here.newHere ?? [],
        input.pace ?? null,
      )
        .catch((error: unknown) => {
          stop.abort();
          throw error;
        })
        .finally(() => {
          voiced = true;
        }),
    ]);
    if (spoken.status === 'rejected') throw spoken.reason;
    if (drawing.status === 'rejected') throw drawing.reason;
    const drawings = drawing.value;
    const voice = spoken.value;

    await input.step?.('composing');
    const compose = (from: SceneScript) =>
      composeScene({
        script: from,
        drawings,
        beats: voice.beats,
        durationMs: voice.durationMs,
        timing: voice.timing,
        generator: SCENE_GENERATOR_VERSION,
        profile: input.profile,
        // The book's or the show's own: each place keeps its regulars.
        key: story?.setsKey ?? null,
      });
    let composed = compose(script);
    // Looked at as made: anything it asks to play again is composed again
    // on the same drawings and voice, its words and quiet unchanged.
    const again = input.recheck?.(composed.scene);
    for (const note of again?.notes ?? []) this.logger.log(`${who}: ${note}`);
    if (again?.script) {
      // On the same drawings: the show's own as drawn too.
      script = {
        ...again.script,
        ...(script.drawn ? { drawn: script.drawn } : {}),
      };
      composed = compose(script);
    }
    const { filled, audit } = composed;
    // Every line said on the stage moves its speaker's mouth; a lesson
    // keeps the pace its voice was made at, for a later change to it.
    const { scene: mouthed, mended: mouths } = withMouths(composed.scene);
    const scene: SceneDto =
      voice.voicePace !== undefined
        ? { ...mouthed, voicePace: voice.voicePace }
        : mouthed;
    for (const note of mouths) this.logger.log(`${who}: ${note}`);
    await this.keepParts(input.keepAs ?? 'page', who, {
      script,
      drawings: [...drawings],
      beats: voice.beats,
      durationMs: voice.durationMs,
      timing: voice.timing,
      profile: input.profile,
      key: story?.setsKey ?? null,
    });
    this.logAudit(who, audit);
    for (const note of composed.staging) this.logger.log(`${who}: ${note}`);
    const { sceneKey, thumbKey } = await this.store(base, scene, who);
    return {
      fit: 'good',
      scene,
      sceneKey,
      thumbKey,
      voice,
      script,
      drawings,
      filled,
    };
  }

  /**
   * A scene composed again from what it was made from (its script, and
   * its voice's words and times), on the show's drawings as they are now:
   * its cast, its sets and its own things, as kept. No model is asked and
   * nothing is voiced; one not drawn yet is not drawn here, and the scene
   * is not composed. Stored as a make stores it, with its still, beside
   * the voice it was made with.
   */
  async recompose(input: {
    script: SceneScript;
    /** The drawings it was composed with: a drawing of its own is used again as it was. */
    kept: ReadonlyMap<string, GatedDrawing | null>;
    beats: TimedBeat[];
    durationMs: number;
    timing: SceneTiming;
    profile: DocumentProfile;
    story: PageStory;
    base: string;
    who: string;
    keepAs?: string;
    recheck?: (scene: SceneDto) => {
      notes: string[];
      script: SceneScript | null;
    };
  }): Promise<{
    scene: SceneDto;
    sceneKey: string;
    thumbKey: string;
    script: SceneScript;
  }> {
    const { story, who } = input;
    const [kept, sets, own] = await Promise.all([
      this.castAt(story.castKey),
      this.setsAt(story.setsKey),
      story.ownKey ? this.ownAt(story.ownKey) : null,
    ]);
    // Whoever code can draw and the cast has not kept (an animal of the
    // kit's, drawn before kit drawings were kept) is drawn and kept now,
    // rather than the scene failing for them.
    const heal = missingByCode(
      input.script,
      story.bible,
      kept,
      this.bookAnimals,
    );
    if (heal.length)
      await Promise.all(
        heal.map((c) =>
          this.sheetFor(story.castKey, c, story.bookTitle, null, who),
        ),
      );
    const cast = heal.length ? await this.castAt(story.castKey) : kept;
    let script = input.script;
    const reuse = new Map(
      [...input.kept].flatMap(([id, drawing]): [string, GatedDrawing][] =>
        drawing &&
        script.cast.some((thing) => thing.id === id && thing.kind === 'drawing')
          ? [[id, drawing]]
          : [],
      ),
    );
    const missing = [
      ...notDrawnYet(script, story.bible, cast, sets, own),
      ...script.cast.flatMap((thing) =>
        thing.kind === 'drawing' && !reuse.has(thing.id) ? [thing.name] : [],
      ),
    ];
    if (missing.length)
      throw new Error(
        `Not drawn for the show yet, so not composed: ${missing.join(', ')}`,
      );
    const [drawings, drawn] = await Promise.all([
      this.drawAll(
        script,
        script.title,
        null,
        who,
        new AbortController().signal,
        story,
        reuse,
      ),
      this.drawOwn(script, story, null, who),
    ]);
    if (drawn) script = { ...script, drawn };
    const compose = (from: SceneScript) =>
      composeScene({
        script: from,
        drawings,
        beats: input.beats,
        durationMs: input.durationMs,
        timing: input.timing,
        generator: SCENE_GENERATOR_VERSION,
        profile: input.profile,
        key: story.setsKey,
      });
    let composed = compose(script);
    const again = input.recheck?.(composed.scene);
    for (const note of again?.notes ?? []) this.logger.log(`${who}: ${note}`);
    if (again?.script) {
      script = { ...again.script, ...(drawn ? { drawn } : {}) };
      composed = compose(script);
    }
    await this.keepParts(input.keepAs ?? 'page', who, {
      script,
      drawings: [...drawings],
      beats: input.beats,
      durationMs: input.durationMs,
      timing: input.timing,
      profile: input.profile,
      key: story.setsKey,
    });
    this.logAudit(who, composed.audit);
    for (const note of composed.staging) this.logger.log(`${who}: ${note}`);
    // Every line said on the stage moves its speaker's mouth.
    const { scene, mended: mouths } = withMouths(composed.scene);
    for (const note of mouths) this.logger.log(`${who}: ${note}`);
    const { sceneKey, thumbKey } = await this.store(input.base, scene, who);
    return { scene, sceneKey, thumbKey, script };
  }

  /**
   * A made lesson scene's voice played quicker or slower by `tempo` (the
   * maker changed its pace), its silences kept as they were, and the scene
   * timed again on it: nothing voiced, nothing drawn, CPU only
   * (studio-explainer-plan, Ask 1 §6 "repace"). Stored beside the scene it
   * was, its still kept. Null for a scene it cannot be done to: a story's,
   * or with no codec here.
   */
  async repace(input: {
    scene: SceneDto;
    audio: Buffer;
    tempo: number;
    base: string;
    who: string;
  }): Promise<{
    scene: SceneDto;
    sceneKey: string;
    audioKey: string;
    durationMs: number;
  } | null> {
    const { scene, who } = input;
    if (!this.codec || Math.abs(input.tempo - 1) < 0.005) return null;
    if (scene.acting || scene.props?.length || scene.setting?.full) return null;
    const pcm = await this.codec.decode(input.audio, 'audio/mpeg');
    const { edits } = planPaceEdits({
      pcm,
      beats: scene.beats,
      targets: scene.beats.map(() => null),
      pauses: scene.beats.map(() => null),
      trimInside: false,
      tempo: input.tempo,
    });
    if (!edits.length) return null;
    const edited = applyPaceEdits(pcm, edits);
    const durationMs = Math.round(
      (edited.samples.length / edited.sampleRate) * 1000,
    );
    const timed = retimeScene(
      scene,
      timeMapOf(edits, pcm.sampleRate),
      durationMs,
    );
    if (!timed) return null;
    const again: SceneDto = {
      ...timed,
      voicePace: Math.round((scene.voicePace ?? 1) * input.tempo * 1000) / 1000,
    };
    const audioKey = `${input.base}-voice.mp3`;
    await this.storage.put({
      key: audioKey,
      body: await this.codec.encode(edited),
      mimeType: 'audio/mpeg',
    });
    const sceneKey = `${input.base}-scene.json`;
    await this.storage.put({
      key: sceneKey,
      body: Buffer.from(JSON.stringify(again)),
      mimeType: 'application/json',
    });
    const before = paceReport(scene.beats);
    const after = paceReport(again.beats);
    this.logger.log(
      `${who}: paced again ×${input.tempo.toFixed(3)}: ${before.wpm}→${after.wpm} wpm, ${Math.round(scene.durationMs / 1000)}s→${Math.round(durationMs / 1000)}s, nothing voiced`,
    );
    return { scene: again, sceneKey, audioKey, durationMs };
  }

  /**
   * A place painted again for its book or show, with the painter's brief
   * as it is now, its ground and groups measured, and kept in place of
   * the painting before (which the caller keeps a copy of first). Null
   * when no painting came through: the one before is left as it was.
   */
  async repaintSet(
    story: Pick<PageStory, 'bible' | 'setsKey' | 'bookTitle'>,
    placeId: string,
    documentId: string | null,
    who: string,
    /** How it is made: a Studio set is built from a layout (D1) unless this says the artist paints it whole. */
    painter?: 'layout' | 'artist',
  ): Promise<SetSheet | null> {
    const place = story.bible.places.find((p) => p.id === placeId);
    if (!place) throw new Error(`No place ${placeId}`);
    const set = await this.artist.paintSet(
      place,
      story.bookTitle,
      documentId,
      who,
      story.bible.world ?? null,
      painter ? { painter } : {},
    );
    if (!set) return null;
    await this.inTurn(story.setsKey, async () => {
      const sets = await this.setsAt(story.setsKey);
      sets[place.id] = set;
      await this.storage.put({
        key: story.setsKey,
        body: Buffer.from(JSON.stringify(sets)),
        mimeType: 'application/json',
      });
    });
    return set;
  }

  /**
   * A character the artist drew, drawn again with the brief as it is now,
   * rigged by code, and kept in place of the drawing before (which the
   * caller keeps a copy of first). A person is the kit's, never redrawn
   * here. Null when no drawing came through: the one before is kept.
   */
  async redrawCharacter(
    story: Pick<PageStory, 'bible' | 'castKey' | 'bookTitle'>,
    characterId: string,
    documentId: string | null,
    who: string,
  ): Promise<CharacterSheet | null> {
    const character = story.bible.characters.find((c) => c.id === characterId);
    if (!character) throw new Error(`No character ${characterId}`);
    if (!character.kind || character.kind === 'person')
      throw new Error(`${character.name} is drawn by the kit, not the artist`);
    const drawn = await this.drawCharacter(
      character,
      story.bookTitle,
      documentId,
      who,
    );
    if (!drawn) return null;
    const { sheet } = drawn;
    await this.inTurn(story.castKey, async () => {
      const cast = await this.castAt(story.castKey);
      cast[character.id] = sheet;
      await this.storage.put({
        key: story.castKey,
        body: Buffer.from(JSON.stringify(cast)),
        mimeType: 'application/json',
      });
    });
    await this.keepOthers(story.castKey, character.id, drawn.others, who);
    return sheet;
  }

  /**
   * A character the artist drew, drawn again as the maker asks, from the
   * drawing they have now: gated, joined, given its face and rigged as
   * any is, and kept by no one here. The maker sees it beside the one
   * they have, and keeps whichever they like. Null when none came through.
   */
  async drawCandidate(
    story: Pick<PageStory, 'bible' | 'bookTitle'>,
    characterId: string,
    words: string,
    /** How they are drawn now, for the artist to draw from; null when they were never drawn. */
    now: CharacterSheet | null,
    documentId: string | null,
    who: string,
  ): Promise<CharacterSheet | null> {
    const drawn = await this.drawCandidates(
      story,
      characterId,
      words,
      now,
      documentId,
      who,
    );
    return drawn[0] ?? null;
  }

  /**
   * A character drawn again as the maker asks, every take's best, better
   * first: the first is the one drawCandidate gives; the rest are there to
   * be offered beside it. None when nothing came through.
   */
  async drawCandidates(
    story: Pick<PageStory, 'bible' | 'bookTitle'>,
    characterId: string,
    words: string,
    now: CharacterSheet | null,
    documentId: string | null,
    who: string,
    options: ArtistOptions = {},
  ): Promise<CharacterSheet[]> {
    const character = story.bible.characters.find((c) => c.id === characterId);
    if (!character) throw new Error(`No character ${characterId}`);
    if (!character.kind || character.kind === 'person')
      throw new Error(`${character.name} is drawn by the kit, not the artist`);
    const drawn = await this.drawCharacter(
      character,
      story.bookTitle,
      documentId,
      who,
      { words, reference: now ? referenceOf(now) : null, before: now },
      options,
    );
    return drawn ? [drawn.sheet, ...drawn.others] : [];
  }

  /**
   * A character's other drawings, the takes not chosen, kept beside the
   * cast (cast-options.json beside cast.json) to be offered later: none
   * kept lets go of any kept for an earlier drawing of them, so another
   * drawing's takes are never offered beside this one. What cannot be
   * kept is only logged.
   */
  private async keepOthers(
    castKey: string,
    characterId: string,
    others: CharacterSheet[],
    who: string,
  ): Promise<void> {
    const key = optionsKey(castKey);
    await this.inTurn(key, async () => {
      let kept: Record<string, CharacterSheet[]> = {};
      try {
        kept = JSON.parse(
          (await this.storage.get(key)).toString('utf8'),
        ) as Record<string, CharacterSheet[]>;
      } catch (error) {
        if (
          !(error instanceof NotFoundError) &&
          !(error instanceof SyntaxError)
        )
          throw error;
      }
      if (!others.length) {
        if (!(characterId in kept)) return;
        delete kept[characterId];
      } else kept[characterId] = others;
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(kept)),
        mimeType: 'application/json',
      });
    }).catch((error: unknown) =>
      this.logger.warn(
        `${who}: the other drawings were not kept: ${(error as Error).message}`,
      ),
    );
  }

  /** A character's sheet kept in a book's or a show's cast, in place of any before it. */
  async keepSheet(
    key: string,
    characterId: string,
    sheet: CharacterSheet,
  ): Promise<void> {
    await this.inTurn(key, async () => {
      const cast = await this.castAt(key);
      cast[characterId] = sheet;
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(cast)),
        mimeType: 'application/json',
      });
    });
  }

  /**
   * For working on the layout without the models: everything compose was
   * given, kept where SCENE_KEEP_PARTS says (scripts/studio-recompose).
   */
  private async keepParts(
    keepAs: string,
    who: string,
    parts: {
      script: SceneScript;
      drawings: [string, GatedDrawing | null][];
      beats: TimedBeat[];
      durationMs: number;
      timing: SceneTiming;
      profile: DocumentProfile;
      key: string | null;
    },
  ): Promise<void> {
    const keep = this.config.get<string>('SCENE_KEEP_PARTS')?.trim();
    if (!keep) return;
    try {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync(keep, { recursive: true });
      writeFileSync(`${keep}/${keepAs}-parts.json`, JSON.stringify(parts));
    } catch (error) {
      this.logger.warn(`${who}: parts not kept: ${(error as Error).message}`);
    }
  }

  /** What no layout promises by construction, logged: nothing set on anything. */
  private logAudit(
    who: string,
    audit: ReturnType<typeof composeScene>['audit'],
  ): void {
    const found = [...audit.box.flat(), ...audit.wide.flat()];
    const counted = new Map<string, number>();
    for (const one of found)
      counted.set(
        `${one.kind} ${one.a} / ${one.b}`,
        (counted.get(`${one.kind} ${one.a} / ${one.b}`) ?? 0) + 1,
      );
    this.logger.log(
      `${who}: frame audit: ${audit.box.flat().length} in the box, ${audit.wide.flat().length} wide${
        counted.size
          ? `: ${[...counted]
              .slice(0, 6)
              .map(([what, n]) => `${what}${n > 1 ? ` ×${n}` : ''}`)
              .join('; ')}`
          : ''
      }`,
    );
  }

  /** A scene stored, and its still beside it. */
  private async store(
    base: string,
    scene: SceneDto,
    who: string,
  ): Promise<{ sceneKey: string; thumbKey: string }> {
    const sceneKey = `${base}-scene.json`;
    await this.storage.put({
      key: sceneKey,
      body: Buffer.from(JSON.stringify(scene)),
      mimeType: 'application/json',
    });
    const thumbKey = `${base}-thumb.png`;
    try {
      await this.storage.put({
        key: thumbKey,
        body: await this.thumb(scene),
        mimeType: 'image/png',
      });
    } catch (error) {
      // A card without its still is a card; the video is what matters.
      this.logger.warn(
        `${who}: no still for the card: ${(error as Error).message}`,
      );
    }
    return { sceneKey, thumbKey };
  }

  /**
   * A page's script alone, written exactly as a page's is, for the tools
   * that voice or study it (the voice line-up) without making the page.
   */
  async scriptFor(
    documentId: string,
    pageNumber: number,
  ): Promise<SceneScript> {
    const doc = await this.documents.findById(documentId);
    if (!doc) throw new Error(`No document ${documentId}`);
    const topic = (await this.topics.listByDocument(documentId)).find(
      (t) => pageNumber >= t.startPage && pageNumber <= t.endPage,
    );
    if (!topic) throw new Error(`Page ${pageNumber} is outside every chapter`);
    const profile = await this.profileFor(documentId, doc.contentVersion);
    const lesson = profile.story
      ? null
      : await this.lessonFor(
          documentId,
          doc.contentVersion,
          topic,
          pageNumber,
          doc.props.title,
          profile,
        );
    return this.write({
      documentTitle: doc.props.title,
      topic,
      material: await this.material(documentId, pageNumber),
      context: await this.where(
        documentId,
        doc.contentVersion,
        topic,
        pageNumber,
        Boolean(lesson),
      ),
      lesson,
      profile,
      story: await this.pageStory(
        profile.story,
        documentId,
        doc.contentVersion,
        doc.props.title,
        pageNumber,
      ),
      documentId,
      who: `${documentId} p${pageNumber}`,
    });
  }

  /**
   * The script and storyboard: written, mended, and written once more when
   * the mend leaves problems. The better of the two is kept; a storyboard
   * that never puts anything on the stage fails the page.
   */
  private async write(input: {
    documentTitle: string;
    topic: TopicRecord;
    material: string;
    plain?: string | null;
    before?: string | null;
    context: string;
    lesson?: Lesson | null;
    profile: DocumentProfile;
    story?: PageStory | null;
    documentId: string | null;
    who: string;
  }): Promise<SceneScript> {
    const told = input.story
      ? describeStory(input.story.bible, input.story.page)
      : '';
    const ask = {
      documentTitle: input.documentTitle,
      topicTitle: input.topic.title,
      material: input.material,
      context: input.context,
      // The book, and whom it is for with how to teach them.
      profile: [
        describeProfile(input.profile),
        describeStage(input.profile.stage ?? null),
      ]
        .filter(Boolean)
        .join('\n'),
      ...(told ? { story: told } : {}),
      ...(input.plain ? { plain: input.plain } : {}),
      ...(input.story && input.before ? { before: input.before } : {}),
      ...(input.lesson ? { notes: input.lesson.text } : {}),
    };
    // The page, to hold a quotation to, the formats the book may use, and
    // who the story's characters are.
    const checks = {
      material: input.material,
      formats: input.profile.formats,
      stage: input.profile.stage ?? null,
      ...(input.story
        ? {
            characters: input.story.bible.characters,
            places: input.story.bible.places,
            // A group speaks from the crowd behind the stage, if there is one.
            crowd: ['few', 'many'].includes(
              crowdOn(input.story.bible, input.story.page) ?? '',
            ),
            // Who is apart from the rest, and where: Sally in the cave.
            whereabouts: whereaboutsOn(input.story.bible, input.story.page),
          }
        : {}),
    };
    // A story's page is a screenplay its characters play; any other page
    // a lesson, narrated.
    const mended = input.story
      ? await this.written<ScreenplayDraft>(
          ask,
          (asked) => this.llm.sceneScreenplay(asked),
          (draft) => mendScreenplay(draft, checks),
          input,
          false,
        )
      : await this.written<SceneScriptDraft>(
          ask,
          (asked) => this.llm.sceneScript(asked),
          (draft) => mendScript(draft, checks),
          input,
          true,
          // What the teacher's notes planned, held to.
          input.lesson
            ? (drafted) =>
                notesProblems(
                  drafted.script,
                  input.lesson!.notes,
                  input.lesson!.here.page,
                  input.material,
                ).problems
            : undefined,
        );
    const { script } = mended;
    if (
      script.fit !== 'poor' &&
      (!script.beats.length || !script.steps.some((s) => s.stage))
    )
      throw new Error(
        `The storyboard could not be made sound: ${mended.problems.slice(0, 3).join(' ')}`,
      );
    this.logger.log(
      `${input.who}: "${script.title}", ${script.beats.length} sentences, ${script.cast.length} things:\n${script.steps.map(describeStep).join('\n')}`,
    );
    return script;
  }

  /**
   * A draft written and mended, and written once more when the mend
   * leaves problems: the better of the two kept.
   */
  private async written<D>(
    ask: WriteAsk,
    call: (
      asked: WriteAsk & { previous?: D; problems?: string[] },
    ) => Promise<{ value: D; usage: LlmUsage }>,
    mend: (draft: D) => MendedScript,
    input: { documentId: string | null; who: string },
    /** Whether a quiet stretch is a problem too: a lesson's is; a story's quiet holds its actions. */
    quiet: boolean,
    /** What else sends a draft back: what the teacher's notes planned and it missed. */
    extra?: (mended: MendedScript) => string[],
  ): Promise<MendedScript> {
    const first = await call(ask);
    await this.record(input.documentId, 'scene_write', first.usage);
    let mended = mend(first.value);
    if (mended.mended.length)
      this.logger.log(
        `${input.who}: mended: ${mended.mended.slice(0, 8).join('; ')}`,
      );
    // A lesson's picture that sits still too long goes back on its own,
    // as does one that leaves out what its notes planned.
    const faults = (one: MendedScript) =>
      one.script.fit === 'poor'
        ? []
        : [...sendBack(one, quiet), ...(extra?.(one) ?? [])];
    const reasons = faults(mended);
    if (reasons.length) {
      this.logger.warn(
        `${input.who}: the storyboard goes back: ${reasons.join(' ')}`,
      );
      const again = await call({
        ...ask,
        previous: first.value,
        problems: reasons,
      });
      await this.record(input.documentId, 'scene_write', again.usage);
      const second = mend(again.value);
      if (second.mended.length)
        this.logger.log(
          `${input.who}: mended: ${second.mended.slice(0, 8).join('; ')}`,
        );
      // The second, unless it is worse.
      if (faults(second).length <= reasons.length) mended = second;
    }
    return mended;
  }

  /** Every drawing the storyboard needs, all at once; a null is one that could not be made. */
  private async drawAll(
    script: SceneScript,
    topic: string,
    documentId: string | null,
    who: string,
    signal: AbortSignal,
    story: PageStory | null = null,
    /** Drawings the page before made, carried on: not drawn again. */
    reuse: ReadonlyMap<string, GatedDrawing> = new Map(),
  ): Promise<Map<string, GatedDrawing | null>> {
    const drawings = script.cast.filter(
      (thing): thing is DrawingThing => thing.kind === 'drawing',
    );
    const characters = script.cast.filter(
      (thing): thing is CharacterThing => thing.kind === 'character',
    );
    const places = script.cast.filter(
      (thing): thing is PlaceThing => thing.kind === 'place',
    );
    const people = script.cast.filter(
      (thing): thing is PersonThing => thing.kind === 'person',
    );
    const names = new Map(
      script.cast.map((thing) => [
        thing.id,
        thing.kind === 'stat'
          ? thing.caption
          : thing.kind === 'words'
            ? thing.text
            : thing.name || thing.kind,
      ]),
    );
    const out = new Map<string, GatedDrawing | null>();
    // What code draws itself: working, graphs, the text's own words,
    // timelines and charts. No model is asked, and one that cannot be set
    // is a card, as a drawing is.
    const coded = script.cast.filter(isCodeThing);
    for (const thing of coded)
      out.set(
        thing.id,
        await drawByCode(thing).catch((error: unknown) => {
          this.logger.warn(
            `${who}: "${thing.id}" (${thing.kind}) is set as a card: ${(error as Error).message}`,
          );
          return null;
        }),
      );
    // People the page shows, drawn by the kit: no model is asked. Each
    // carries the signs the page shows on them, and no others.
    for (const thing of people)
      out.set(
        thing.id,
        await figureDrawing(thing.figure, thing.id, {
          count: thing.count,
          pose: thing.pose,
          holding: thing.holding,
          signs: signsShown(script, thing.id),
          faces: facesShown(script, thing.id),
          old: oldWorld(story?.bible.world?.era),
          // Drawn new for the page, with what swings and from every side: rig 3.
          rig: VIEW_RIG,
          // And a face of moving parts (scene-face-rig).
          faceRig: true,
        }).catch((error: unknown) => {
          this.logger.warn(
            `${who}: "${thing.id}" (a person) is set as a card: ${(error as Error).message}`,
          );
          return null;
        }),
      );
    // The story's characters, each drawn once for the whole book; the
    // first time the book meets one, what they are like beside them.
    const cast = characters.map(async (thing) => {
      const character = story?.bible.characters.find((c) => c.id === thing.ref);
      // A voice is never drawn; someone the text's tradition never shows
      // is a light where they stand.
      if (character && !standsOnStage(character)) {
        out.set(thing.id, null);
        return;
      }
      if (character?.presence === 'light') {
        out.set(thing.id, lightDrawing(thing.ref));
        return;
      }
      const sheet =
        story && character
          ? await this.sheetFor(
              story.castKey,
              character,
              story.bookTitle,
              documentId,
              who,
            )
          : null;
      // A person is drawn by the kit afresh on every page, from their
      // figure: doing what the page has them do (in bed, holding a
      // lantern, shaking), with the signs it shows on them, and with the
      // kit's rig as it is now, so they act. Anyone else, the book's sheet.
      const signs = signsShown(script, thing.id);
      // And the faces drawn only when shown: eyes closed.
      const faces = facesShown(script, thing.id);
      // In what they wear as it opens (a Studio story's pyjamas), and the
      // clothes they change into, each shown as its state is.
      // An animal the kit drew, likewise from its spec (the story's, as
      // it looks now), with the signs the page shows on it: on the artist's
      // path, as an animal the artist drew plays.
      const kitAnimal = sheet?.animal
        ? ((character ? animalFor(character, this.bookAnimals) : null) ??
          sheet.animal)
        : null;
      // And a creature the kit drew, from its spec.
      const kitCreature = sheet?.creature
        ? ((character ? creatureFor(character) : null) ?? sheet.creature)
        : null;
      const onPage = sheet?.figure
        ? await figureDrawing(thing.wears ?? sheet.figure, thing.ref, {
            pose: thing.pose,
            holding: thing.holding,
            signs,
            faces,
            old: oldWorld(story?.bible.world?.era),
            ...(thing.dress?.length ? { dress: thing.dress } : {}),
            // Drawn new for the page, with what swings and from every
            // side: rig 3. A sheet the book keeps is as it was drawn.
            rig: VIEW_RIG,
            faceRig: true,
          })
        : kitAnimal
          ? await animalDrawing(kitAnimal, thing.ref, {
              signs,
              faces,
              rig: DANGLE_RIG,
            })
          : kitCreature
            ? await creatureDrawing(kitCreature, thing.ref, {
                signs,
                faces,
                rig: DANGLE_RIG,
              })
            : null;
      const { anchors: pageAnchors, ...posed } = onPage ?? { anchors: null };
      let drawing = onPage ? (posed as GatedDrawing) : sheet?.drawing;
      // One the artist drew with no mouth speaks with the kit's, and blinks.
      if (!onPage && drawing && sheet?.face)
        drawing = withFace(drawing, sheet.face, thing.ref);
      // Someone the artist drew (a dog, a dragon) shows the signs the page
      // gives them as the kit's people do: a Z over the head asleep, a
      // bulb for an idea, a question mark puzzled.
      const head = sheet?.anchors.head;
      if (!onPage && drawing && head && signs.length) {
        const units =
          drawing.stands?.units ??
          SIZE_UNITS[sheet?.size ?? character?.size ?? 'medium'];
        const over = signsOver(
          head,
          drawing.viewBox[3] / units,
          signs,
          `${thing.ref}-sign`,
        );
        if (over.markup)
          drawing = {
            ...drawing,
            svg: drawing.svg.replace(
              /<\/svg>\s*$/i,
              `<style>${over.css}</style>${over.markup}</svg>`,
            ),
            states: { ...drawing.states, ...over.states },
          };
      }
      out.set(
        thing.id,
        sheet && drawing
          ? {
              ...drawing,
              // Nothing is set beside a story's people: what they are
              // like is in how they move.
              callouts: [],
              ...((pageAnchors ?? sheet.anchors).head
                ? { head: (pageAnchors ?? sheet.anchors).head! }
                : {}),
              // What one the artist drew carries rides at its mouth.
              ...(!onPage && sheet.anchors.mouth
                ? { mouth: sheet.anchors.mouth }
                : {}),
              // Where its rig turns its head, and which way it faces as
              // drawn: the stage dips the head, and turns it to face
              // where it goes.
              ...(!onPage && sheet.rig?.dip && sheet.rig.joints.head
                ? { neck: sheet.rig.joints.head, dip: sheet.rig.dip }
                : {}),
              ...(!onPage && sheet.rig?.sinks
                ? { sinks: sheet.rig.sinks }
                : {}),
              ...(!onPage && sheet.rig?.faces
                ? { faces: sheet.rig.faces }
                : {}),
              // Its mouth code's, moving with the voice; its arms and its
              // nod acted as the kit's are; or, in one piece, all of it.
              ...(!onPage && sheet.face ? { lips: true as const } : {}),
              ...(!onPage && (sheet.rig?.arms || sheet.rig?.nods)
                ? { limbs: true as const }
                : {}),
              ...(!onPage && sheet.rig?.onePiece
                ? { onePiece: true as const }
                : {}),
              // A person stands at the kit's scale, in the frame they are
              // drawn in on the page; an animal or a creature at its size
              // beside them.
              stands: drawing.stands ?? {
                units: SIZE_UNITS[sheet.size ?? character?.size ?? 'medium'],
              },
            }
          : null,
      );
    });
    // The story's places, each painted once for the whole book.
    const sets = places.map(async (thing) => {
      const place = story?.bible.places.find((p) => p.id === thing.ref);
      const set =
        story && place
          ? await this.setFor(
              story.setsKey,
              place,
              story.bookTitle,
              documentId,
              who,
              story.bible.world ?? null,
              story.look ?? null,
            )
          : null;
      out.set(
        thing.id,
        set
          ? {
              ...set.drawing,
              ...(set.ground ? { ground: set.ground } : {}),
              ...(set.layered ? { layered: set.layered } : {}),
            }
          : null,
      );
    });
    await Promise.all([
      ...cast,
      ...sets,
      ...drawings.map(async (thing) => {
        const kept = reuse.get(thing.id);
        if (kept) {
          out.set(thing.id, kept);
          return;
        }
        // What it shares the stage with, so its scale and style agree with theirs.
        const neighbours = new Set<string>();
        for (const step of script.steps)
          if (step.stage?.show.includes(thing.id))
            for (const id of step.stage.show)
              if (id !== thing.id) neighbours.add(names.get(id) ?? id);
        out.set(
          thing.id,
          await this.drawOne(
            thing,
            topic,
            [...neighbours].slice(0, 5),
            documentId,
            who,
            signal,
          ),
        );
      }),
    ]);
    return out;
  }

  /** One drawing: asked for, gated, and asked for once more with the notes when it falls short; the better kept. */
  private async drawOne(
    thing: DrawingThing,
    topic: string,
    neighbours: string[],
    documentId: string | null,
    who: string,
    signal: AbortSignal,
  ): Promise<GatedDrawing | null> {
    const viewBox = CANVAS[thing.shape];
    let best: GateResult | null = null;
    let notes: string[] | undefined;
    for (let attempt = 1; attempt <= DRAW_TRIES; attempt += 1) {
      if (signal.aborted) return null;
      let reply: string;
      try {
        const made = await this.llm.sceneDrawing({
          thing,
          viewBox,
          topic,
          neighbours,
          notes,
          signal,
        });
        await this.record(documentId, 'scene_draw', made.usage);
        reply = made.value;
      } catch (error) {
        this.logger.warn(
          `${who}: "${thing.name}" could not be asked for: ${(error as Error).message}`,
        );
        continue;
      }
      const gated = await gateDrawing(reply, thing);
      if (gated.mended.length)
        this.logger.log(
          `${who}: "${thing.name}": ${gated.mended.slice(0, 6).join('; ')}`,
        );
      if (gated.drawing && (!best?.drawing || gated.score > best.score))
        best = gated;
      if (gated.drawing && !gated.retry) break;
      notes = gated.notes;
      this.logger.log(
        `${who}: "${thing.name}" try ${attempt} fell short: ${gated.notes.join(' ')}`,
      );
    }
    if (!best?.drawing)
      this.logger.warn(
        `${who}: "${thing.name}" is set as a card: no drawing came through`,
      );
    return best?.drawing ?? null;
  }

  /**
   * The narration spoken and timed: one piece a sentence with its pause,
   * the voice's own word times when it gives them, else the aligner's,
   * else an estimate inside each sentence.
   */
  private async voice(
    script: SceneScript,
    kept: Pronunciations,
    base: string,
    documentId: string | null,
    who: string,
    story: PageStory | null = null,
    /** Seconds of quiet before the first word, for an opening on the stage alone. */
    leadS = 0,
    /** Whom the document is for: its pace and pauses. */
    stage: LearningStage | null = null,
    /** The terms the page teaches first: given weight, and room after, where first said. */
    terms: readonly string[] = [],
    /** Whom a lesson is for, finer than its stage, and the maker's pace: its target rates (scene-pace). */
    pace: PaceBrief | null = null,
  ): Promise<{
    beats: TimedBeat[];
    durationMs: number;
    audioKey: string;
    timing: SceneTiming;
    /** How the voice came out once put right: a lesson's. */
    report?: PaceReport;
    /** The maker's pace the voice was made at (scene-pace makerRate): a lesson's. */
    voicePace?: number;
  }> {
    // Maths said as a teacher says it, not as its signs.
    await startMathsSpeech();
    const forms = script.beats.map((beat) => spokenForm(beat.say, kept));
    // Each sentence at its own pace, with its own silence after it.
    // A new term lands: a little weight where it is first said, and a
    // moment after the sentence for it to sink in.
    const first = firstSaid(script.beats, terms);
    // Whichever engine the admin has Visualize speak in now.
    const {
      speech,
      voice,
      engine: speaking,
      cast,
      rates,
    } = await this.voices.current();
    // A lesson (every sentence the narrator's own) is said at a target
    // rate a sentence, for whom it is for and what it holds, its pauses
    // shaped within a budget; the voice is asked for it by its own
    // measured rate, and put right after voicing. A story keeps its
    // delivery: its actors' lines go at their own pace.
    const lesson = !story && script.beats.every((beat) => !beat.kind);
    const brief: PaceBrief | null = lesson
      ? (pace ?? { band: bandOfStage(stage) })
      : null;
    const rate = voiceRate(rates, speaking, voice);
    const paced = brief
      ? lessonPace(script.beats, brief, {
          terms: first,
          naturalWpm: rate.wpm,
          holdLimitS: HOLD_LIMIT_S,
        })
      : null;
    const delivered = paced
      ? paced.map(({ speed, pauseAfter }) => ({ speed, pauseAfter }))
      : deliveryPieces(
          script.beats,
          stage ? STAGE_RECIPES[stage] : undefined,
        ).map((piece, k) =>
          first.has(k)
            ? {
                ...piece,
                pauseAfter: Math.max(piece.pauseAfter, TERM_LANDS_S),
              }
            : piece,
        );
    const pausesS = delivered.map((piece) => piece.pauseAfter);
    // A voice that takes its pace in words (Gemini) is asked in the one
    // whose measured rate is nearest the lesson's.
    const paceWord = paced
      ? paceWordFor(
          rate,
          paced.reduce(
            (n, p, k) => n + p.targetWpm * wordsOf(script.beats[k].say).length,
            0,
          ) /
            Math.max(
              1,
              script.beats.reduce((n, b) => n + wordsOf(b.say).length, 0),
            ),
        )
      : undefined;
    const spoken = sceneSpoken(forms);
    const { model } = speech.label();
    // A story's characters say their own lines, in voices of their own.
    const engine =
      speaking === 'elevenlabs' || speaking === 'cartesia'
        ? speaking
        : model.startsWith('gemini')
          ? 'gemini'
          : model.startsWith('kokoro')
            ? 'kokoro'
            : null;
    // Each line a character says, in their own voice: its place in the
    // spoken text is its quote's, the i-th quote of the sentence there.
    /** The voice a character in the cast speaks in: none for someone the story does not name. */
    const voiceOf = (id: string) => {
      const thing = script.cast.find((t) => t.id === id);
      const character =
        story && thing?.kind === 'character'
          ? story.bible.characters.find((c) => c.id === thing.ref)
          : undefined;
      return story && character
        ? characterVoice(story.bible, character, engine, voice, cast)
        : null;
    };
    // One of the cast telling it: the narration in their voice, whole.
    const teller =
      story && script.narrator
        ? narratingSpeaker(voiceOf(script.narrator))
        : null;
    const lines = script.beats.map((beat, k) => {
      if (teller && beat.kind === 'narration' && !beat.lines?.length)
        return [
          {
            span: [0, forms[k].text.length] as [number, number],
            speaker: teller,
          },
        ];
      if (!story || !beat.lines?.length) return [];
      // A screenplay's line is all theirs: the whole sentence in their voice.
      if (beat.kind === 'line') {
        const speaker = voiceOf(beat.lines[0].speaker);
        const style = FROM_STYLE[beat.from ?? 'here'];
        return speaker
          ? [
              {
                span: [0, forms[k].text.length] as [number, number],
                speaker: style
                  ? { ...speaker, style: `${speaker.style}, ${style}` }
                  : speaker,
              },
            ]
          : [];
      }
      const written = quotedSpans(beat.say);
      const spoken = quotedSpans(forms[k].text);
      if (written.length !== spoken.length) return [];
      return beat.lines.flatMap((line) => {
        const at = written.findIndex(
          ([a, b]) => a === line.span[0] && b === line.span[1],
        );
        const speaker = voiceOf(line.speaker);
        return at >= 0 && speaker ? [{ span: spoken[at], speaker }] : [];
      });
    });
    const pieces = voicedPieces({
      texts: forms.map((form) => form.text),
      delivered,
      // For a voice that takes direction; Kokoro goes by pace and silence.
      styles: script.beats.map((beat, k) =>
        voiceStyle(script.mood, beat.delivery, first.get(k) ?? [], paceWord),
      ),
      lines,
    });
    /** A screenplay line whispered or shouted in its speaker's voice, for a voice that takes it as a tag. */
    const toneOf = (piece: (typeof pieces)[number]) => {
      const beat = script.beats[piece.beat];
      return piece.voice && beat?.kind === 'line'
        ? TONE_OF[beat.pace ?? 'calm']
        : undefined;
    };
    const result = await speech.synthesize({
      text: spoken.text,
      voice,
      speed: 1,
      timestamps: true,
      pieces: pieces.map((piece) => {
        const tone = toneOf(piece);
        return {
          text: piece.text,
          speed: piece.speed,
          pauseAfter: piece.pauseAfter,
          ...(piece.style ? { style: piece.style } : {}),
          ...(piece.voice ? { voice: piece.voice } : {}),
          ...(tone ? { tone } : {}),
        };
      }),
      ...(leadS > 0 ? { lead: leadS } : {}),
    });
    const voices = new Set(pieces.map((p) => p.voice).filter(Boolean));
    if (voices.size)
      this.logger.log(`${who}: characters speak in ${[...voices].join(', ')}`);
    // Each sentence starts where its first piece does.
    const starts = sentenceStarts(
      pieces,
      result.pieceStartsMs,
      script.beats.length,
    );
    const audioKey = `${base}-${voiceSlug(voice)}-${model}.mp3`;
    const durationMs = result.durationMs ?? mp3DurationMs(result.audio.length);
    await this.calls.record({
      documentId,
      task: 'tts_visual',
      model: result.model.includes(':')
        ? result.model
        : `openai:${result.model}`,
      tokensIn: spoken.text.length,
      tokensOut: null,
      latencyMs: null,
      outcome: 'ok',
      // A voice of our own is priced by the audio it made, at its rate;
      // Gemini by its tokens.
      costUsd: result.model.startsWith('gemini:')
        ? geminiSpeechCost({
            model: result.model,
            audioMs: durationMs,
            textChars: spoken.text.length,
            tokensIn: result.usage?.tokensIn,
            tokensOut: result.usage?.tokensOut,
          })
        : result.model.startsWith('kokoro:')
          ? catalogueSpeechCost(
              durationMs,
              Number(this.config.get<string>('KOKORO_USD_PER_AUDIO_HOUR', '0')),
            )
          : result.model.startsWith('modal:')
            ? catalogueSpeechCost(
                durationMs,
                Number(
                  this.config.get<string>('MODAL_USD_PER_AUDIO_HOUR', '0'),
                ),
              )
            : result.model.startsWith('elevenlabs:')
              ? characterSpeechCost(
                  result.characters ?? spoken.text.length,
                  Number(
                    this.config.get<string>(
                      'ELEVENLABS_USD_PER_1K_CHARS',
                      '0.1',
                    ),
                  ),
                )
              : result.model.startsWith('cartesia:')
                ? characterSpeechCost(
                    result.characters ?? spoken.text.length,
                    Number(
                      this.config.get<string>(
                        'CARTESIA_USD_PER_1K_CHARS',
                        '0.05',
                      ),
                    ),
                  )
                : null,
    });

    let words: SpokenWords | null = null;
    let timing: SceneTiming = 'estimated';
    if (result.words?.length) {
      words = spokenWordsFromVoice(result.words, spoken.text);
      if (words) timing = 'voice';
      else
        this.logger.warn(
          `${who}: the voice's word times did not match its words; measuring instead`,
        );
    }
    if (!words && this.aligner.enabled()) {
      try {
        const aligned = await this.aligner.align({
          audio: result.audio,
          mimeType: result.mimeType,
          text: spoken.text,
        });
        // The quiet the voice ends on (a scene's last moments play in
        // it): no words are there, and the words end before it.
        const quietEnd = (result.silencesMs ?? []).reduce(
          (most, [a, b]) =>
            b >= durationMs - QUIET_END_SLACK_MS ? Math.max(most, b - a) : most,
          0,
        );
        const times = aligned
          ? wordTimesFromAligned(
              aligned.words,
              spoken.text,
              durationMs,
              audioKey,
              `echogarden-${aligned.engine}`,
              quietEnd,
            )
          : null;
        if (times) {
          words = pinSpokenWords(
            times.words,
            forms,
            pausesS,
            durationMs,
            starts,
          );
          timing = 'aligned';
        }
      } catch (error) {
        this.logger.warn(
          `${who}: alignment failed, timing on the estimate: ${(error as Error).message}`,
        );
      }
    }
    words ??= estimateSpokenWords({
      forms,
      pausesS,
      durationMs,
      pieceStartsMs: starts,
    });
    // A word measured in a silence the voice made is where the voice
    // speaks again: a line's bubble opens as its voice does.
    if (timing !== 'voice' && result.silencesMs?.length)
      words = outOfSilence(words, result.silencesMs, spoken.starts);
    // Put right, never voiced again: each lesson sentence at its target,
    // a long hesitation cut to a breath, every silence as planned.
    const timed = timeBeats(script.beats, forms, words);
    const settled = await this.paceVoice({
      beats: timed,
      durationMs,
      audio: result.audio,
      mimeType: result.mimeType,
      pcm: result.pcm ?? null,
      timing,
      targets: paced?.map((p) => p.targetWpm) ?? timed.map(() => null),
      said: forms.map((form) => form.text),
      pauses: pausesS,
      lesson,
      leadMs: leadS * 1000,
      who,
      label: brief
        ? `${brief.band}${paceWord ? `, "${paceWord}"` : ''}, ${speaking} ${rate.wpm} wpm at speed 1`
        : null,
    });
    await this.storage.put({
      key: audioKey,
      body: settled.audio,
      mimeType: settled.mimeType,
    });
    return {
      beats: settled.beats,
      durationMs: settled.durationMs,
      audioKey,
      timing,
      ...(settled.report ? { report: settled.report } : {}),
      ...(brief ? { voicePace: makerRate(brief) } : {}),
    };
  }

  /**
   * A voiced scene put right (scene-pace-audio): a lesson's sentences
   * stretched to their targets, its hesitations trimmed and its silences
   * made as planned; a story's silences only made up where the voice gave
   * less than asked (an older Kokoro holds three seconds at most). Its
   * audio decoded only when its times say something is off, and kept as
   * it came when anything fails. Logged: the rate, the silence and the
   * longest pause, before and after.
   */
  private async paceVoice(input: {
    beats: TimedBeat[];
    durationMs: number;
    audio: Buffer;
    mimeType: string;
    pcm: Pcm | null;
    timing: SceneTiming;
    targets: (number | null)[];
    /** What each sentence said: its rate is measured on it. */
    said: string[];
    pauses: number[];
    lesson: boolean;
    leadMs: number;
    who: string;
    /** For the log: whom it is for and how the voice was asked. */
    label: string | null;
  }): Promise<{
    beats: TimedBeat[];
    durationMs: number;
    audio: Buffer;
    mimeType: string;
    report?: PaceReport;
  }> {
    const kept = {
      beats: input.beats,
      durationMs: input.durationMs,
      audio: input.audio,
      mimeType: input.mimeType,
    };
    const before = input.lesson ? paceReport(input.beats, input.said) : null;
    const plan = {
      beats: input.beats,
      said: input.said,
      targets: input.targets,
      pauses: input.pauses,
      trimInside: input.lesson,
      shorten: input.lesson,
      leadMs: input.leadMs,
    };
    let notes: PaceNotes | null = null;
    let out = kept;
    // An estimate's times are guesses: nothing is measured on them.
    if (
      input.timing !== 'estimated' &&
      this.codec &&
      paceWanted({ ...plan, durationMs: input.durationMs })
    )
      try {
        const pcm =
          input.pcm ?? (await this.codec.decode(input.audio, input.mimeType));
        const planned = planPaceEdits({ pcm, ...plan });
        if (planned.edits.length) {
          const edited = applyPaceEdits(pcm, planned.edits);
          const map = timeMapOf(planned.edits, pcm.sampleRate);
          out = {
            beats: retimeBeats(input.beats, map),
            durationMs: Math.round(
              (edited.samples.length / edited.sampleRate) * 1000,
            ),
            audio: await this.codec.encode(edited),
            mimeType: 'audio/mpeg',
          };
          notes = planned.notes;
        }
      } catch (error) {
        this.logger.warn(
          `${input.who}: pace: the voice is kept as it came (${(error as Error).message})`,
        );
        out = kept;
      }
    if (!before) return out;
    const after = paceReport(out.beats, input.said);
    const targets = input.targets.filter((t): t is number => Boolean(t));
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    this.logger.log(
      `${input.who}: pace ${before.wpm}→${after.wpm} wpm (target about ${targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : '?'}), silence ${pct(before.silenceShare)}→${pct(after.silenceShare)}, longest pause ${(before.longestPauseMs / 1000).toFixed(1)}s→${(after.longestPauseMs / 1000).toFixed(1)}s${notes ? `; ${notes.stretched} of ${input.beats.length} sentences stretched${notes.beyond ? ` (${notes.beyond} further than the stretch goes)` : ''}, ${notes.trimmed} hesitations trimmed, ${notes.added} pauses made up, ${notes.shortened} cut back` : '; as it came'}${input.label ? ` [${input.label}]` : ''}`,
    );
    return { ...out, report: after };
  }

  /**
   * The card's still: the fullest step of the box staging, each drawing
   * rendered alone, with what it hides until later hidden, so no two
   * drawings' ids or styles ever share a document. A film's scene is a
   * still of its film instead (scene-still).
   */
  private async thumb(scene: Parameters<typeof thumbSvg>[0]): Promise<Buffer> {
    // A film's scene: a still of the film at its fullest moment, its set's
    // layers where the camera has them then and its people at their
    // depths (studio-scenery-plan §8.6); as below where that fails.
    if (scene.setting?.film)
      try {
        const fullest = pictureMoments(scene).find(
          (moment) => moment.why === 'the fullest moment',
        );
        if (fullest)
          return (await renderStill(scene, fullest.t, rasterise, THUMB_WIDTH))
            .png;
      } catch {
        // The card's still as a book's page has it.
      }
    const index = fullestStep(scene);
    const step = scene.steps[index];
    const pngs = new Map<string, Buffer>();
    const scale = THUMB_WIDTH / scene.stagings.box.w;
    // As the step stands at its end: its states shown, a character's face on.
    const until = (scene.steps[index + 1]?.atMs ?? scene.durationMs) - 1;
    const scenery = step?.backdrop
      ? scene.things.find((t) => t.id === step.backdrop)
      : undefined;
    if (scenery?.kind === 'drawing')
      try {
        pngs.set(
          scenery.id,
          await rasterise(
            withoutStandIns(scene, scenery.svg),
            Math.round(scene.stagings.box.w * scale),
          ),
        );
      } catch {
        // A still with no scene behind it.
      }
    // The set's features the stage draws, as open as they are then.
    for (const feature of scene.setting?.features ?? []) {
      const svg = featureSvgAt(scene, feature, until);
      if (!svg) continue;
      try {
        pngs.set(
          featureStill(feature.id),
          await rasterise(
            svg,
            Math.max(48, Math.round(feature.at.box.w * scale * 2)),
          ),
        );
      } catch {
        // Left out of the still; the video has it.
      }
    }
    // Its crowd, at the set's size, laid over it as the set is.
    const crowd = crowdShown(scene, index)
      ? scene.things.find((t) => t.id === CROWD_ID)
      : undefined;
    if (crowd?.kind === 'drawing')
      try {
        pngs.set(
          CROWD_ID,
          await rasterise(crowd.svg, Math.round(scene.stagings.box.w * scale)),
        );
      } catch {
        // A still with no crowd; the video has it.
      }
    for (const id of step?.show ?? []) {
      const thing = scene.things.find((t) => t.id === id);
      const place = scene.stagings.box.places[index]?.[id];
      if (thing?.kind !== 'drawing' || !place) continue;
      const hidden = hiddenAt(scene, thing, until);
      const hide = hidden.length
        ? `<style>${hidden.map((h) => `[id="${h.replace(/"/g, '')}"]`).join(',')}{display:none}</style>`
        : '';
      const svg = hide
        ? thing.svg.replace(/(<svg\b[^>]*>)/i, `$1${hide}`)
        : thing.svg;
      try {
        pngs.set(
          id,
          await rasterise(svg, Math.max(48, Math.round(place.w * scale * 2))),
        );
      } catch {
        // Left out of the still; the video has it.
      }
    }
    return rasterise(thumbSvg(scene, pngs), THUMB_WIDTH);
  }

  /** A story's page, when the book is a story and its story could be read. */
  private async pageStory(
    isStory: boolean,
    documentId: string,
    contentVersion: number,
    bookTitle: string,
    page: number,
  ): Promise<PageStory | null> {
    if (!isStory) return null;
    const bible = await this.storyFor(documentId, contentVersion, bookTitle);
    return bible?.characters.length
      ? {
          bible,
          page,
          castKey: castKey(documentId, contentVersion),
          setsKey: setsKey(documentId, contentVersion),
          bookTitle,
        }
      : null;
  }

  /**
   * A story's bible, kept beside its videos: read, or made once from the
   * whole book when the first of its pages is asked for, every page made
   * meanwhile waiting on the one making it. Null when it cannot be made:
   * the pages are then made as any page is, and it is tried again with
   * the next.
   */
  private storyFor(
    documentId: string,
    contentVersion: number,
    title: string,
  ): Promise<StoryBible | null> {
    const key = storyKey(documentId, contentVersion);
    return this.once(key, async () => {
      let kept: Buffer | null = null;
      try {
        kept = await this.storage.get(key);
      } catch (error) {
        // Not made yet; a store that cannot say is asked again next page.
        if (!(error instanceof NotFoundError)) {
          this.logger.warn(
            `${documentId}: the story could not be read back: ${(error as Error).message}`,
          );
          return null;
        }
      }
      let older: StoryBible | null = null;
      if (kept)
        try {
          const bible = bibleOf(
            JSON.parse(kept.toString('utf8')) as Partial<StoryBible> | null,
          );
          if ((bible.version ?? 1) >= STORY_VERSION) return bible;
          older = bible;
        } catch {
          // Kept but unreadable: read from the book again.
        }
      try {
        const pages = await this.storyPages(documentId);
        // A story read the old way is read once more, for its world and
        // where each page happens; a very long one is left as it was
        // until someone asks for it (scripts/scene-recast).
        if (older) {
          const stretches = storyPieces(pages).length;
          if (stretches > REREAD_MOST_STRETCHES) {
            this.logger.log(
              `${documentId}: the story was read the old way; at ${stretches} stretches it is not read again unasked`,
            );
            return older;
          }
          this.logger.log(
            `${documentId}: the story was read the old way; reading it once more`,
          );
        }
        return await this.keepStory(
          key,
          await this.readStory({ documentId, title, pages, who: documentId }),
        );
      } catch (error) {
        this.logger.warn(
          `${documentId}: ${older ? 'the story could not be read again; kept as it was' : 'no story, its pages made without one'}: ${(error as Error).message}`,
        );
        return older;
      }
    });
  }

  /**
   * A book's story read again from its pages as they are now, and kept in
   * place of the one before: for a book whose pages were read again
   * (scripts/reread-document). Null, and nothing read, for a book with no
   * story kept: whether it is one is its next page's to find.
   */
  async rereadStory(documentId: string): Promise<StoryBible | null> {
    const doc = await this.documents.findById(documentId);
    if (!doc) return null;
    const key = storyKey(documentId, doc.contentVersion);
    try {
      await this.storage.get(key);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
    return this.keepStory(
      key,
      await this.readStory({
        documentId,
        title: doc.props.title,
        pages: await this.storyPages(documentId),
        who: documentId,
      }),
    );
  }

  /** The story's own words, page by page: no notes, verse numbers or running heads. */
  private async storyPages(
    documentId: string,
  ): Promise<{ page: number; text: string }[]> {
    const doc = await this.documents.findById(documentId);
    const pages = await this.pages.findRange(
      documentId,
      1,
      Math.max(1, doc?.props.pageCount ?? 1),
    );
    return pages
      .filter((page) => !page.isEmpty)
      .map((page) => ({ page: page.pageNumber, text: storyText(page.text) }));
  }

  private async keepStory(key: string, bible: StoryBible): Promise<StoryBible> {
    await this.storage.put({
      key,
      body: Buffer.from(JSON.stringify(bible)),
      mimeType: 'application/json',
    });
    return bible;
  }

  /**
   * A story read from its pages by the model, a stretch at a time: the
   * first stretch alone, so the rest call its people by the same names,
   * then the rest a few at once; merged into one bible by code. A stretch
   * that cannot be read is left out.
   */
  async readStory(input: {
    documentId: string | null;
    title: string;
    pages: { page: number; text: string }[];
    who: string;
  }): Promise<StoryBible> {
    const pieces = storyPieces(input.pages).slice(0, MAX_STORY_PIECES);
    if (!pieces.length) return EMPTY_STORY;
    const read = async (
      piece: (typeof pieces)[number],
      known: string[],
      knownPlaces: string[] = [],
    ) => {
      try {
        const made = await this.llm.sceneStory({
          documentTitle: input.title,
          from: piece.from,
          to: piece.to,
          text: piece.text,
          known,
          knownPlaces,
        });
        await this.record(input.documentId, 'scene_story', made.usage);
        return { from: piece.from, to: piece.to, draft: made.value };
      } catch (error) {
        this.logger.warn(
          `${input.who}: pages ${piece.from} to ${piece.to} of the story could not be read: ${(error as Error).message}`,
        );
        return null;
      }
    };
    const first = await read(pieces[0], []);
    const known = first?.draft.characters.map((c) => c.name) ?? [];
    const knownPlaces = first?.draft.places.map((p) => p.name) ?? [];
    const rest = await inBatches(pieces.slice(1), STORY_READERS, (piece) =>
      read(piece, known, knownPlaces),
    );
    const parts = [first, ...rest].filter(
      (part): part is NonNullable<typeof part> => Boolean(part),
    );
    if (!parts.length) throw new Error('no stretch of it could be read');
    const bible = mergeStory(parts);
    this.logger.log(
      `${input.who}: story read in ${parts.length} of ${pieces.length} stretches: ${bible.characters.length} characters (${bible.characters
        .slice(0, 8)
        .map((c) => `${c.name} p${c.firstPage}`)
        .join(
          ', ',
        )}), ${bible.places.length} places, ${bible.pages.length} pages`,
    );
    return bible;
  }

  /**
   * A character's drawing for the whole book: from the book's cast, or
   * drawn once and added to it, every page that needs them meanwhile
   * waiting on the one drawing. Null when no drawing comes through: they
   * are a card with their name on this page, and drawn again for the next.
   */
  private sheetFor(
    key: string,
    character: StoryCharacter,
    bookTitle: string,
    documentId: string | null,
    who: string,
  ): Promise<CharacterSheet | null> {
    return this.once(`${key}#${character.id}`, async () => {
      try {
        const kept = (await this.castAt(key))[character.id];
        // A person is drawn again from their figure: code, and the kit as
        // it is now. The story's figure wins over the one kept, so a look
        // set apart or a well-known figure's reaches a book drawn before.
        if (kept?.figure)
          return figureSheet(character.figure ?? kept.figure, character.id);
        // An animal the kit drew, likewise, from its spec: the story's
        // (the look it has now) over the one kept.
        // One the kit draws that the cast has not kept yet is kept now, as a
        // person is, so a scene composed again from the cast finds them.
        const animal = animalFor(character, this.bookAnimals) ?? kept?.animal;
        if (animal && (kept?.animal || !kept)) {
          const sheet = await animalSheet(animal, character.id);
          if (!kept) await this.keepKitSheet(key, character, sheet, who);
          return sheet;
        }
        // And a creature the kit drew.
        const creature = creatureFor(character) ?? kept?.creature;
        if (creature && (kept?.creature || !kept)) {
          const sheet = await creatureSheet(creature, character.id);
          if (!kept) await this.keepKitSheet(key, character, sheet, who);
          return sheet;
        }
        // Drawn before code moved what the artist draws: rigged now, with
        // no model asked, and kept so, the same drawing with its parts
        // joined and its motion code's.
        if (kept && kept.rig?.version !== RIG_VERSION)
          return this.mouthed(
            key,
            await this.rigKept(key, kept, character, who),
            character,
            who,
          );
        if (kept) return this.mouthed(key, kept, character, who);
      } catch (error) {
        this.logger.warn(
          `${who}: the cast could not be read: ${(error as Error).message}`,
        );
        return null;
      }
      const drawn = await this.drawCharacter(
        character,
        bookTitle,
        documentId,
        who,
      );
      if (!drawn) return null;
      const { sheet } = drawn;
      // Added to the cast as it stands now: others may have been drawn meanwhile.
      await this.inTurn(key, async () => {
        const cast = await this.castAt(key);
        cast[character.id] = sheet;
        await this.storage.put({
          key,
          body: Buffer.from(JSON.stringify(cast)),
          mimeType: 'application/json',
        });
      }).catch((error: unknown) =>
        this.logger.warn(
          `${who}: ${character.name} was drawn but not kept: ${(error as Error).message}`,
        ),
      );
      await this.keepOthers(key, character.id, drawn.others, who);
      return sheet;
    });
  }

  /**
   * A sheet the kit drew, kept in the cast where the cast has none for
   * them yet (never over one kept meanwhile). What cannot be kept is only
   * logged: the scene has its drawing either way.
   */
  private async keepKitSheet(
    key: string,
    character: StoryCharacter,
    sheet: CharacterSheet,
    who: string,
  ): Promise<void> {
    await this.inTurn(key, async () => {
      const cast = await this.castAt(key);
      if (cast[character.id]) return;
      cast[character.id] = sheet;
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(cast)),
        mimeType: 'application/json',
      });
      this.logger.log(`${who}: ${character.name} drawn by the kit and kept`);
    }).catch((error: unknown) =>
      this.logger.warn(
        `${who}: ${character.name} was drawn but not kept: ${(error as Error).message}`,
      ),
    );
  }

  /**
   * A kept sheet the artist drew, with its mouth measured if it was kept
   * before mouths were (where what it carries rides), and kept so. The
   * sheet as it was when it cannot be measured.
   */
  private async mouthed(
    key: string,
    sheet: CharacterSheet,
    character: StoryCharacter,
    who: string,
  ): Promise<CharacterSheet> {
    if (
      sheet.figure ||
      sheet.animal ||
      sheet.creature ||
      sheet.anchors.mouth !== undefined
    )
      return sheet;
    let mouth: [number, number] | null;
    try {
      mouth = await mouthOf(sheet.drawing);
    } catch (error) {
      this.logger.warn(
        `${who}: ${character.name}'s mouth could not be measured: ${(error as Error).message}`,
      );
      return sheet;
    }
    const measured = { ...sheet, anchors: { ...sheet.anchors, mouth } };
    await this.inTurn(key, async () => {
      const cast = await this.castAt(key);
      // Only over the drawing it measured.
      if (cast[character.id]?.drawing.svg !== sheet.drawing.svg) return;
      cast[character.id] = measured;
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(cast)),
        mimeType: 'application/json',
      });
    }).catch((error: unknown) =>
      this.logger.warn(
        `${who}: ${character.name}'s mouth was measured but not kept: ${(error as Error).message}`,
      ),
    );
    return measured;
  }

  /**
   * A kept sheet the artist drew, rigged by code and written back to the
   * cast as it stands now. The sheet as kept when it cannot be.
   */
  private async rigKept(
    key: string,
    kept: CharacterSheet,
    character: StoryCharacter,
    who: string,
  ): Promise<CharacterSheet> {
    const tried = `${key}#${character.id}`;
    if (this.unrigged.get(tried) === kept.drawing.svg) return kept;
    let sheet: CharacterSheet;
    try {
      const rigged = await rigSheet(kept);
      sheet = rigged.sheet;
      this.logger.log(
        `${who}: ${character.name} rigged${sheet.rig?.mended.length ? `, ${sheet.rig.mended.map((m) => `${m.part} moved in by (${m.dx}, ${m.dy})`).join(', ')}` : ''}${rigged.notes.length ? `: ${rigged.notes.join(' ')}` : ''}`,
      );
    } catch (error) {
      this.unrigged.set(tried, kept.drawing.svg);
      this.logger.warn(
        `${who}: ${character.name} could not be rigged: ${(error as Error).message}`,
      );
      return kept;
    }
    await this.inTurn(key, async () => {
      const cast = await this.castAt(key);
      // Only over the drawing it rigged: one forgotten meanwhile (its look
      // changed in the Studio) or rigged already is left as it is.
      if (cast[character.id]?.drawing.svg !== kept.drawing.svg) return;
      cast[character.id] = sheet;
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(cast)),
        mimeType: 'application/json',
      });
    }).catch((error: unknown) =>
      this.logger.warn(
        `${who}: ${character.name} was rigged but not kept: ${(error as Error).message}`,
      ),
    );
    return sheet;
  }

  /**
   * A character drawn for the book: a person by the kit, from their
   * figure, with no model asked; an animal or a creature by the artist,
   * in the kit's style. A book read before characters had kinds is asked
   * what each is once, from the look kept for them.
   */
  private async drawCharacter(
    character: StoryCharacter,
    bookTitle: string,
    documentId: string | null,
    who: string,
    /** Drawn again as the maker asks, from how they are drawn now. */
    again?: DrawAgain,
    options: ArtistOptions = {},
  ): Promise<{ sheet: CharacterSheet; others: CharacterSheet[] } | null> {
    let kind: StoryKind | null = character.kind ?? null;
    let size: StorySize | null = character.size ?? null;
    let figure: FigureSpec | null = character.figure ?? null;
    if (!kind) {
      try {
        const made = await this.llm.sceneFigure({
          bookTitle,
          name: character.name,
          look: character.look,
          voice: character.voice,
        });
        await this.record(documentId, 'scene_story', made.usage);
        kind = made.value.kind;
        size = made.value.size;
        figure =
          kind === 'person' && made.value.figure
            ? figureOf(made.value.figure)
            : null;
      } catch (error) {
        // Unasked, anyone who speaks as a creature is one; anyone else a
        // person, as old as their voice.
        this.logger.warn(
          `${who}: what ${character.name} is could not be asked: ${(error as Error).message}`,
        );
        kind = character.voice === 'creature' ? 'creature' : 'person';
      }
    }
    if (kind === 'person') {
      const spec = figure ?? figureByVoice(character.voice, character.id);
      const sheet = await figureSheet(spec, character.id);
      this.logger.log(
        `${who}: ${character.name} drawn by the kit: ${describeFigure(spec)}`,
      );
      return { sheet, others: [] };
    }
    // An animal whose species the kit has: drawn by code, no model asked.
    const animal = animalFor({ ...character, kind }, this.bookAnimals);
    if (animal) {
      const sheet = await animalSheet(animal, character.id);
      this.logger.log(
        `${who}: ${character.name} drawn by the kit: ${describeAnimal(animal)}`,
      );
      return { sheet, others: [] };
    }
    // A creature the writer gave a spec: drawn by code, no model asked.
    const creature = kind === 'creature' ? creatureFor(character) : null;
    if (creature) {
      const sheet = await creatureSheet(creature, character.id);
      this.logger.log(
        `${who}: ${character.name} drawn by the kit: ${describeCreature(creature)}`,
      );
      return { sheet, others: [] };
    }
    const drawn = await this.artist.drawSheet(
      { ...character, kind, size },
      bookTitle,
      documentId,
      who,
      again,
      options,
    );
    const sized = (sheet: CharacterSheet): CharacterSheet => ({
      ...sheet,
      size: size ?? 'medium',
    });
    return drawn
      ? { sheet: sized(drawn.sheet), others: drawn.others.map(sized) }
      : null;
  }

  /**
   * A place's set for the whole book: from the book's sets, or painted once
   * and added to them, as a character is drawn once. Null when none comes
   * through: the page has no scene behind it.
   */
  private setFor(
    key: string,
    place: StoryPlace,
    bookTitle: string,
    documentId: string | null,
    who: string,
    world: StoryWorld | null = null,
    look: SetLook | null = null,
  ): Promise<SetSheet | null> {
    return this.once(`${key}#${place.id}`, async () => {
      const keep = (set: SetSheet, what: string) =>
        this.inTurn(key, async () => {
          const sets = await this.setsAt(key);
          sets[place.id] = set;
          await this.storage.put({
            key,
            body: Buffer.from(JSON.stringify(sets)),
            mimeType: 'application/json',
          });
        }).catch((error: unknown) =>
          this.logger.warn(
            `${who}: ${place.name} was ${what} but not kept: ${(error as Error).message}`,
          ),
        );
      try {
        const kept = withLayers((await this.setsAt(key))[place.id], place);
        if (kept?.ground) return kept;
        if (kept) {
          // Kept before its ground was measured: measured now, once, and
          // kept with it. No model is asked and nothing is painted again.
          // A render that failed keeps nothing: the convention this once.
          const ground = await measureGround(kept.drawing);
          if (!ground) {
            this.logger.warn(
              `${who}: ${place.name}'s ground could not be measured; measured again next time`,
            );
            return { ...kept, ground: conventionGround() };
          }
          const measured = { ...kept, ground };
          await keep(measured, 'measured');
          return measured;
        }
      } catch (error) {
        this.logger.warn(
          `${who}: the sets could not be read: ${(error as Error).message}`,
        );
        return null;
      }
      const set = await this.artist.paintSet(
        place,
        bookTitle,
        documentId,
        who,
        world,
        look ? { look } : {},
      );
      if (!set) return null;
      await keep(set, 'painted');
      return set;
    });
  }

  /**
   * The show's own things and features a scene stands on its stage, each
   * drawn once for the show and kept: null for a scene with none, and for
   * a book's page, which has none. One that cannot be drawn is left out,
   * and the stage stands something in for it (a parcel, something under a
   * cloth); it is drawn again for a scene made a while later. Nothing more
   * is asked for once `stop` says so.
   */
  private async drawOwn(
    script: SceneScript,
    story: PageStory | null,
    documentId: string | null,
    who: string,
    stop?: AbortSignal,
  ): Promise<NonNullable<SceneScript['drawn']> | null> {
    const key = story?.ownKey;
    const things = script.ownThings ?? [];
    const features = (script.features ?? []).filter((f) => f.kind === DRAWN);
    if (!story || !key || (!things.length && !features.length)) return null;
    const out: {
      things: Record<string, OwnPropDrawing>;
      features: Record<string, SetPiece>;
    } = { things: {}, features: {} };
    await Promise.all([
      ...things.map(async (thing) => {
        const drawn = await this.ownThingFor(
          key,
          thing,
          story,
          documentId,
          who,
          stop,
        );
        if (drawn) out.things[thing.id] = drawn;
      }),
      ...features.map(async (feature) => {
        const drawn = await this.ownFeatureFor(
          key,
          feature,
          story,
          documentId,
          who,
          stop,
        );
        if (drawn) out.features[feature.id] = drawn;
      }),
    ]);
    return out;
  }

  /**
   * A thing of the show's own (a kite, a drum) for the whole show: kept,
   * or drawn once by the artist, measured, and kept. One the words have
   * since said a look for ("red") is drawn again so. Null when no drawing
   * comes through and none is kept.
   */
  private ownThingFor(
    key: string,
    thing: { id: string; name: string; look?: string },
    story: Pick<PageStory, 'bookTitle' | 'bible'>,
    documentId: string | null,
    who: string,
    stop?: AbortSignal,
  ): Promise<OwnPropDrawing | null> {
    return this.once(`${key}#thing:${thing.id}`, async () => {
      const mark = `thing:${thing.id}`;
      let own: OwnSheets;
      try {
        own = await this.ownAt(key);
      } catch (error) {
        this.logger.warn(
          `${who}: the show's own could not be read: ${(error as Error).message}`,
        );
        return null;
      }
      const kept = own.things[thing.id];
      if (kept && (!thing.look || kept.look === thing.look)) return kept;
      if (stop?.aborted || failedLately(own, mark)) return kept ?? null;
      const size = await this.ownSize(
        own,
        mark,
        thing.name,
        story,
        documentId,
        who,
      );
      const drawn = await this.artist.drawOwn(
        ownThingBrief(thing, story.bookTitle, story.bible.world ?? null),
        OWN_THING_CANVAS,
        (drawing) => measureOwnThing(drawing, thing.id, size),
        story.bookTitle,
        documentId,
        who,
        stop,
        {
          // The kit's line at the size it will stand at among the people.
          line: (ink) => KIT_LINE / ownThingScale(ink, size),
          about: {
            kind: 'thing',
            brief: `a ${thing.look ? `${thing.look} ` : ''}${thing.name}`,
          },
        },
      );
      if (!drawn) {
        await this.ownFailed(key, who, thing.name, mark, size, stop);
        return kept ?? null;
      }
      if (thing.look) drawn.look = thing.look;
      this.logger.log(
        `${who}: the ${thing.name} drawn for the whole show, ${drawn.size} (${Math.round(-drawn.viewBox[1])} tall)${drawn.loose.hangs ? ', hanging from its grip' : ''}${drawn.loose.rolls ? ', rolling' : ''}`,
      );
      await this.keepOwn(key, who, thing.name, (own) => {
        own.things[thing.id] = drawn;
        delete own.failed?.[mark];
      });
      return drawn;
    });
  }

  /**
   * A feature of the show's own (a bicycle, a signpost) for the whole
   * show: kept, or drawn once by the artist, measured, and kept. One the
   * words have since opened, drawn when nothing opened, is drawn again
   * with what opens. Null when no drawing comes through and none is kept.
   */
  private ownFeatureFor(
    key: string,
    feature: { id: string; name: string; opens: boolean },
    story: Pick<PageStory, 'bookTitle' | 'bible'>,
    documentId: string | null,
    who: string,
    stop?: AbortSignal,
  ): Promise<SetPiece | null> {
    return this.once(`${key}#feature:${feature.id}`, async () => {
      const mark = `feature:${feature.id}`;
      let own: OwnSheets;
      try {
        own = await this.ownAt(key);
      } catch (error) {
        this.logger.warn(
          `${who}: the show's own could not be read: ${(error as Error).message}`,
        );
        return null;
      }
      const kept = own.features[feature.id];
      if (kept && (kept.opens || !feature.opens)) return kept.piece;
      // Not drawn again: the one kept, which does not open, is better than none.
      if (stop?.aborted || failedLately(own, mark)) return kept?.piece ?? null;
      const size = await this.ownSize(
        own,
        mark,
        feature.name,
        story,
        documentId,
        who,
      );
      const piece = await this.artist.drawOwn(
        ownFeatureBrief(feature, story.bookTitle, story.bible.world ?? null),
        OWN_FEATURE_CANVAS,
        (drawing) => measureOwnFeature(drawing, feature.id, size),
        story.bookTitle,
        documentId,
        who,
        stop,
        {
          line: (ink) => KIT_LINE / ownFeatureScale(ink, size),
          about: { kind: 'feature', brief: `a ${feature.name}` },
        },
      );
      if (!piece) {
        await this.ownFailed(key, who, feature.name, mark, size, stop);
        return kept?.piece ?? null;
      }
      this.logger.log(
        `${who}: the ${feature.name} drawn for the whole show, ${Math.round(piece.viewBox[2])} by ${Math.round(-piece.viewBox[1])}${piece.leaf ? ', opening' : ''}${piece.seat ? `, a seat ${piece.seat} high` : ''}${piece.opening ? ', a way through' : ''}${piece.front ? ', before the people' : ''}`,
      );
      await this.keepOwn(key, who, feature.name, (own) => {
        own.features[feature.id] = { piece, opens: feature.opens };
        delete own.failed?.[mark];
      });
      return piece;
    });
  }

  /** How big one of the show's own really is: as asked before, kept, or asked now. */
  private async ownSize(
    own: OwnSheets,
    mark: string,
    name: string,
    story: Pick<PageStory, 'bible'>,
    documentId: string | null,
    who: string,
  ): Promise<RealSize | null> {
    const asked = own.sizes?.[mark];
    return asked ?? (await this.sizeOf(name, story, documentId, who));
  }

  /**
   * One of the show's own that could not be drawn, marked so: scenes made
   * soon after stand something in for it without asking again. Its size,
   * if it was asked, is kept for when it is. Nothing is marked for a make
   * stopped on the way.
   */
  private async ownFailed(
    key: string,
    who: string,
    name: string,
    mark: string,
    size: RealSize | null,
    stop?: AbortSignal,
  ): Promise<void> {
    if (stop?.aborted) return;
    await this.keepOwn(key, who, name, (own) => {
      own.failed = { ...own.failed, [mark]: Date.now() };
      if (size) own.sizes = { ...own.sizes, [mark]: size };
    });
  }

  /**
   * How big one of the show's own really is, in its story's world, for it
   * to stand among the people at their scale: the artist draws to fill its
   * canvas, whatever the size. Null when it cannot be asked: it is drawn
   * at the size it was drawn at.
   */
  private async sizeOf(
    name: string,
    story: Pick<PageStory, 'bible'>,
    documentId: string | null,
    who: string,
  ): Promise<RealSize | null> {
    const world = story.bible.world;
    try {
      const made = await this.llm.sceneSize({
        name,
        world: world
          ? [world.region, world.era].filter(Boolean).join(', ') || null
          : null,
      });
      await this.record(documentId, 'scene_draw', made.usage);
      return made.value;
    } catch (error) {
      this.logger.warn(
        `${who}: how big the ${name} is could not be asked: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** The show's own drawings as kept: none yet, or none that can be read, is none; a store that cannot say throws. */
  private async ownAt(key: string): Promise<OwnSheets> {
    let kept: Buffer;
    try {
      kept = await this.storage.get(key);
    } catch (error) {
      if (error instanceof NotFoundError)
        return { version: OWN_VERSION, things: {}, features: {} };
      throw error;
    }
    try {
      return ownSheetsOf(JSON.parse(kept.toString('utf8')));
    } catch {
      return { version: OWN_VERSION, things: {}, features: {} };
    }
  }

  /** One of the show's own added to what is kept as it stands now: others may have been drawn meanwhile. */
  private async keepOwn(
    key: string,
    who: string,
    name: string,
    change: (own: OwnSheets) => void,
  ): Promise<void> {
    await this.inTurn(key, async () => {
      const own = await this.ownAt(key);
      change(own);
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(own)),
        mimeType: 'application/json',
      });
    }).catch((error: unknown) =>
      this.logger.warn(
        `${who}: the ${name} was drawn but not kept: ${(error as Error).message}`,
      ),
    );
  }

  /** The book's sets as kept, read as the cast is. */
  private async setsAt(key: string): Promise<Sets> {
    let kept: Buffer;
    try {
      kept = await this.storage.get(key);
    } catch (error) {
      if (error instanceof NotFoundError) return {};
      throw error;
    }
    try {
      return setsOf(JSON.parse(kept.toString('utf8')));
    } catch {
      return {};
    }
  }

  /**
   * The book's cast as kept: none yet, or none that can be read, is an
   * empty one, whose characters are drawn again; a store that cannot say
   * throws, so nothing kept is written over.
   */
  private async castAt(key: string): Promise<Cast> {
    let kept: Buffer;
    try {
      kept = await this.storage.get(key);
    } catch (error) {
      if (error instanceof NotFoundError) return {};
      throw error;
    }
    try {
      return castOf(JSON.parse(kept.toString('utf8')));
    } catch {
      return {};
    }
  }

  /**
   * A story's people and places drawn and painted ahead of its pages, once
   * each, and kept: a film's scenes are then made side by side (and on
   * more than one worker) from the same drawings, never each its own.
   */
  async prepareStory(
    story: PageStory,
    documentId: string | null,
    who: string,
    only?: { characters: ReadonlySet<string>; places: ReadonlySet<string> },
    /** A show's own things and features its scenes stand on their stages, drawn once each too. */
    own: {
      things: { id: string; name: string }[];
      features: { id: string; name: string; opens: boolean }[];
    } = { things: [], features: [] },
  ): Promise<void> {
    const characters = story.bible.characters.filter(
      (c) =>
        standsOnStage(c) &&
        c.presence !== 'light' &&
        (!only || only.characters.has(c.id)),
    );
    const places = story.bible.places.filter(
      (p) => !only || only.places.has(p.id),
    );
    await Promise.all([
      ...characters.map((c) =>
        this.sheetFor(story.castKey, c, story.bookTitle, documentId, who),
      ),
      ...places.map((p) =>
        this.setFor(
          story.setsKey,
          p,
          story.bookTitle,
          documentId,
          who,
          story.bible.world ?? null,
          story.look ?? null,
        ),
      ),
      ...(story.ownKey
        ? [
            ...own.things.map((thing) =>
              this.ownThingFor(story.ownKey!, thing, story, documentId, who),
            ),
            ...own.features.map((feature) =>
              this.ownFeatureFor(
                story.ownKey!,
                feature,
                story,
                documentId,
                who,
              ),
            ),
          ]
        : []),
    ]);
  }

  /** Work keyed by a name: a second caller while it runs waits on the first rather than doing it again. */
  private once<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = this.running.get(key);
    if (running) return running as Promise<T>;
    const started = work().finally(() => this.running.delete(key));
    this.running.set(key, started);
    return started;
  }

  /** Work on one file, after whatever work on it is under way. */
  private inTurn<T>(key: string, work: () => Promise<T>): Promise<T> {
    const before = this.writing.get(key) ?? Promise.resolve();
    const mine = before.catch(() => undefined).then(work);
    this.writing.set(key, mine);
    const done = () => {
      if (this.writing.get(key) === mine) this.writing.delete(key);
    };
    mine.then(done, done);
    return mine;
  }

  /** Where the page sits: its chapter, and what the pages before it already taught. */
  private async where(
    documentId: string,
    contentVersion: number,
    topic: TopicRecord,
    pageNumber: number,
    /** The teacher's notes say what came before: only where the page is. */
    notes = false,
  ): Promise<string> {
    const where = `This is page ${pageNumber} of the chapter "${topic.title}", which runs from page ${topic.startPage} to ${topic.endPage}.`;
    if (notes) return where;
    const earlier = (
      await this.visuals.listByDocument(
        documentId,
        contentVersion,
        SCENE_GENERATOR_VERSION,
      )
    )
      .filter(
        (row) =>
          row.topicId === topic.id &&
          row.pageNumber < pageNumber &&
          row.status === 'done' &&
          row.title,
      )
      .slice(-6)
      .map((row) => `page ${row.pageNumber}: ${row.title}`);
    return [
      where,
      earlier.length
        ? `The videos before it in the chapter covered: ${earlier.join('; ')}. Do not introduce those again; build on them.`
        : 'It is the first video of the chapter.',
    ].join(' ');
  }

  /**
   * The teacher's notes of the chapter a page is in, made if they are not
   * yet, or made again: for looking them over (scripts/scene-notes).
   */
  async chapterNotes(
    documentId: string,
    pageNumber: number,
    again = false,
  ): Promise<{ topic: TopicRecord; notes: ChapterNotes | null }> {
    const doc = await this.documents.findById(documentId);
    if (!doc) throw new Error(`No document ${documentId}`);
    const topic = (await this.topics.listByDocument(documentId)).find(
      (t) => pageNumber >= t.startPage && pageNumber <= t.endPage,
    );
    if (!topic) throw new Error(`Page ${pageNumber} is outside every chapter`);
    if (again)
      await this.storage
        .delete(notesKey(documentId, doc.contentVersion, topic.id))
        .catch(() => undefined);
    const profile = await this.profileFor(documentId, doc.contentVersion);
    return {
      topic,
      notes: await this.notesFor(
        documentId,
        doc.contentVersion,
        topic,
        doc.props.title,
        profile,
      ),
    };
  }

  /**
   * A page's part of its chapter's teacher's notes, with how the page
   * before it ended when it carries on from it. Null when the notes could
   * not be made: the page is written alone, as pages were before notes.
   */
  private async lessonFor(
    documentId: string,
    contentVersion: number,
    topic: TopicRecord,
    pageNumber: number,
    documentTitle: string,
    profile: DocumentProfile,
  ): Promise<Lesson | null> {
    const notes = await this.notesFor(
      documentId,
      contentVersion,
      topic,
      documentTitle,
      profile,
    );
    const here = notes?.pages.find((one) => one.page === pageNumber);
    if (!notes || !here) return null;
    const ending =
      here.relation !== 'fresh' &&
      here.relation !== 'skip' &&
      pageNumber > topic.startPage
        ? await this.endingBefore(documentId, contentVersion, pageNumber)
        : null;
    return {
      notes,
      here,
      ending,
      text: describeNotes(notes, pageNumber, ending),
    };
  }

  /**
   * A chapter's teacher's notes: kept beside its videos, made once, the
   * first time any of its pages is wanted, from every page's note. Pages
   * asked for together wait on the one reading. Null when they cannot be
   * made; the next page asked for tries again.
   */
  private async notesFor(
    documentId: string,
    contentVersion: number,
    topic: TopicRecord,
    documentTitle: string,
    profile: DocumentProfile,
  ): Promise<ChapterNotes | null> {
    const key = notesKey(documentId, contentVersion, topic.id);
    try {
      const kept = JSON.parse(
        (await this.storage.get(key)).toString('utf8'),
      ) as ChapterNotes;
      if (
        kept.version === NOTES_VERSION &&
        kept.from === topic.startPage &&
        kept.to === topic.endPage
      )
        return kept;
    } catch {
      // Not made yet.
    }
    return this.once(key, () =>
      this.readChapter(key, documentId, topic, documentTitle, profile),
    );
  }

  /** The chapter read whole, in parts, and its notes kept. */
  private async readChapter(
    key: string,
    documentId: string,
    topic: TopicRecord,
    documentTitle: string,
    profile: DocumentProfile,
  ): Promise<ChapterNotes | null> {
    const from = topic.startPage;
    const to = topic.endPage;
    const who = `${documentId} "${topic.title}"`;
    try {
      const [written, raw, summary] = await Promise.all([
        this.simplified.findRange(documentId, from, to),
        this.pages.findRange(documentId, Math.max(1, from - 1), to),
        this.summaries.find(documentId).catch(() => null),
      ]);
      const own = new Map(raw.map((row) => [row.pageNumber, row.text ?? '']));
      const noteOf = (page: number) => {
        const row = written.find((one) => one.pageNumber === page);
        return (
          row?.status === 'done' && row.blocks?.length
            ? sceneProse(row.blocks)
            : (own.get(page) ?? '')
        ).slice(0, NOTES_PAGE_CHARS);
      };
      // What the pages' own text shows: a page begun mid-sentence.
      const signs = new Map<number, PageSign>();
      for (let page = from + 1; page <= to; page += 1)
        signs.set(
          page,
          pageSign(own.get(page - 1) ?? null, own.get(page) ?? ''),
        );
      const about = [
        summary ? `The book in brief: ${summary}` : '',
        describeProfile(profile),
        describeStage(profile.stage ?? null),
      ]
        .filter(Boolean)
        .join('\n');
      const drafts = await inBatches(
        notesParts(from, to),
        NOTES_READERS,
        async (part) => {
          const pages: string[] = [];
          for (let page = part.from; page <= part.to; page += 1)
            pages.push(`[page ${page}]\n${noteOf(page) || '(nothing on it)'}`);
          const made = await this.llm.sceneNotes({
            documentTitle,
            topicTitle: topic.title,
            about,
            from: part.from,
            to: part.to,
            text: pages.join('\n\n'),
            ...(part.from > from
              ? { before: noteOf(part.from - 1).slice(-800) }
              : {}),
          });
          await this.record(documentId, 'scene_notes', made.usage);
          return made.value;
        },
      );
      const { notes, mended } = mendNotes(
        joinDrafts(drafts),
        { topicId: topic.id, from, to },
        signs,
      );
      if (mended.length)
        this.logger.log(
          `${who}: notes mended: ${mended.slice(0, 8).join('; ')}`,
        );
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(notes)),
        mimeType: 'application/json',
      });
      const count = (relation: string) =>
        notes.pages.filter((one) => one.relation === relation).length;
      this.logger.log(
        `${who}: teacher's notes for pages ${from}-${to}: ${count('fresh')} fresh, ${count('continues')} carrying on, ${count('example') + count('recap') + count('exercise')} examples, recaps or exercises, ${count('skip')} not taught; ${notes.pages.reduce((n, one) => n + one.points.length, 0)} small ideas`,
      );
      return notes;
    } catch (error) {
      this.logger.warn(
        `${who}: no teacher's notes, pages written alone: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** How the page before this one ended, when it has been made. */
  private async endingBefore(
    documentId: string,
    contentVersion: number,
    pageNumber: number,
  ): Promise<PageEnding | null> {
    try {
      return JSON.parse(
        (
          await this.storage.get(
            endingKey(
              documentId,
              contentVersion,
              pageNumber - 1,
              SCENE_GENERATOR_VERSION,
            ),
          )
        ).toString('utf8'),
      ) as PageEnding;
    } catch {
      return null;
    }
  }

  /** How a page ended, kept for the page after it; a page is made without it. */
  private async keepEnding(
    documentId: string,
    contentVersion: number,
    pageNumber: number,
    script: SceneScript,
    drawings: ReadonlyMap<string, GatedDrawing | null>,
  ): Promise<void> {
    try {
      await this.storage.put({
        key: endingKey(
          documentId,
          contentVersion,
          pageNumber,
          SCENE_GENERATOR_VERSION,
        ),
        body: Buffer.from(
          JSON.stringify(endingOf(script, pageNumber, drawings)),
        ),
        mimeType: 'application/json',
      });
    } catch (error) {
      this.logger.warn(
        `${documentId} p${pageNumber}: its ending not kept: ${(error as Error).message}`,
      );
    }
  }

  /**
   * What the document is, for teaching it: kept beside its videos, made
   * once from its title, its chapters and a sample of its pages. When it
   * cannot be made, the page is taught as an explainer, as every page has
   * been.
   */
  private async profileFor(
    documentId: string,
    contentVersion: number,
  ): Promise<DocumentProfile> {
    const key = profileKey(documentId, contentVersion);
    let kept: DocumentProfile | null = null;
    try {
      kept = profileOf(
        JSON.parse(
          (await this.storage.get(key)).toString('utf8'),
        ) as Parameters<typeof profileOf>[0],
      );
      // Made before stages were asked about: read once more for its stage.
      if ('stage' in kept) return kept;
    } catch {
      // Not made yet.
    }
    try {
      const doc = await this.documents.findById(documentId);
      const topics = await this.topics.listByDocument(documentId);
      const sample = await this.sampleOf(documentId, doc?.props.pageCount ?? 0);
      const made = await this.llm.sceneProfile({
        documentTitle: doc?.props.title ?? '',
        chapters: topics.map((topic) => topic.title),
        sample,
      });
      await this.record(documentId, 'scene_profile', made.usage);
      // The level the document names in its own words wins over a
      // reading that says otherwise; an unsure reading is no stage.
      const settled = settleStage(
        {
          stage: made.value.stage ?? null,
          sure: surenessOf(made.value.stageSure),
          why: made.value.stageWhy ?? '',
        },
        levelIn(
          [doc?.props.title ?? '', ...topics.map((t) => t.title), sample].join(
            '\n',
          ),
        ),
      );
      const read = profileOf(made.value);
      // A profile kept before keeps all it said; only its stage is new.
      const profile: DocumentProfile = {
        ...(kept ?? read),
        stage: settled.stage,
        stageWhy: settled.why.slice(0, 200),
      };
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(profile)),
        mimeType: 'application/json',
      });
      this.logger.log(`${documentId}: ${describeProfile(profile)}`);
      return profile;
    } catch (error) {
      // A profile kept before stages stands as it was.
      if (kept) return kept;
      this.logger.warn(
        `${documentId}: no profile, taught as an explainer: ${(error as Error).message}`,
      );
      return DEFAULT_PROFILE;
    }
  }

  /** A few of a document's pages, to tell what it is: its first pages with words on them, and two from further in. */
  private async sampleOf(
    documentId: string,
    pageCount: number,
  ): Promise<string> {
    const wanted = [
      1,
      2,
      3,
      4,
      5,
      Math.round(pageCount / 2),
      Math.round((pageCount * 3) / 4),
    ].filter(
      (page, i, all) =>
        page >= 1 && page <= Math.max(1, pageCount) && all.indexOf(page) === i,
    );
    const parts: string[] = [];
    let length = 0;
    for (const page of wanted) {
      if (length > PROFILE_SAMPLE_CHARS) break;
      const text = (await this.material(documentId, page)).slice(0, 1600);
      if (wordsOf(text).length < 20) continue;
      parts.push(`[page ${page}] ${text}`);
      length += text.length;
    }
    return parts.join('\n\n').slice(0, PROFILE_SAMPLE_CHARS);
  }

  /**
   * A story's page for its writer: the book's own words, cleaned and in
   * reading order, the authority for what happens and who says what; and
   * its note, for plainer wording. The note alone where the page's own
   * text has too little in it to read (a scan the OCR could not).
   */
  private async storyMaterial(
    documentId: string,
    pageNumber: number,
  ): Promise<{
    material: string;
    plain: string | null;
    before: string | null;
  }> {
    const note = await this.simplified.find(documentId, pageNumber);
    const plain =
      note?.status === 'done' && note.blocks?.length
        ? sceneProse(note.blocks).slice(0, MATERIAL_CHARS)
        : null;
    const pages: PageText[] = await this.pages.findRange(
      documentId,
      Math.max(1, pageNumber - 1),
      pageNumber,
    );
    const own = storyText(
      pages.find((row) => row.pageNumber === pageNumber)?.text ?? '',
    ).slice(0, MATERIAL_CHARS);
    // How the page before ends: whom a line at the top of this one follows.
    const before =
      pageEnd(
        storyText(
          pages.find((row) => row.pageNumber === pageNumber - 1)?.text ?? '',
        ),
      ) || null;
    if (wordsOf(own).length >= STORY_OWN_WORDS)
      return { material: own, plain, before };
    return { material: plain ?? own, plain: null, before };
  }

  /** The page: its simplified note when written, else its own text. */
  private async material(
    documentId: string,
    pageNumber: number,
  ): Promise<string> {
    const note = await this.simplified.find(documentId, pageNumber);
    if (note?.status === 'done' && note.blocks?.length)
      return sceneProse(note.blocks).slice(0, MATERIAL_CHARS);
    const pages: PageText[] = await this.pages.findRange(
      documentId,
      pageNumber,
      pageNumber,
    );
    return (
      pages.find((row) => row.pageNumber === pageNumber)?.text ?? ''
    ).slice(0, MATERIAL_CHARS);
  }

  private async record(
    documentId: string | null,
    task:
      | 'scene_write'
      | 'scene_draw'
      | 'cast_draw'
      | 'set_paint'
      | 'drawing_judge'
      | 'scene_profile'
      | 'scene_story'
      | 'scene_notes',
    usage: LlmUsage,
  ): Promise<void> {
    await this.calls.record({
      documentId,
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
