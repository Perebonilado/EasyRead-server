import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SceneDto, SceneTiming } from '../../contracts';
import { wordTimesFromAligned } from '../../business/domain/board';
import {
  catalogueSpeechCost,
  geminiSpeechCost,
} from '../../business/domain/cost';
import { NotFoundError } from '../../business/domain/errors/errors';
import { sceneProse } from '../../business/domain/follow';
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
  composeScene,
  describeStep,
  fullestStep,
  hiddenAt,
  thumbSvg,
} from '../../business/domain/scene-compose';
import {
  mendScreenplay,
  type ScreenplayDraft,
} from '../../business/domain/scene-screenplay';
import { rasterise } from '../../business/domain/scene-raster';
import {
  SCENE_GENERATOR_VERSION,
  isCodeThing,
  mendScript,
  type MendedScript,
  quietStretches,
  quotedSpans,
  signsShown,
  wordsOf,
  type CharacterThing,
  type PersonThing,
  type PlaceThing,
  type DrawingThing,
  type LineFrom,
  type SceneScript,
  type SceneScriptDraft,
} from '../../business/domain/scene-script';
import {
  PLAIN_FIGURE,
  describeFigure,
  figureOf,
  type FigureSpec,
  oldWorld,
} from '../../business/domain/scene-figure';
import {
  SET_VERSION,
  SIZE_UNITS,
  castOf,
  figureDrawing,
  figureSheet,
  lightDrawing,
  measureSheet,
  setsOf,
  type Cast,
  type CharacterSheet,
  type SetSheet,
  type Sets,
} from '../../business/domain/scene-sheet';
import {
  EMPTY_STORY,
  MAX_STORY_PIECES,
  OPENING_LEAD_S,
  bibleOf,
  SET_CANVAS,
  castKey,
  castStory,
  crowdOn,
  describeStory,
  mergeStory,
  setThing,
  setsKey,
  sheetThing,
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
  type TimedBeat,
} from '../../business/domain/scene-timing';
import {
  characterVoice,
  deliveryPieces,
  sentenceStarts,
  voiceSlug,
  voiceStyle,
  voicedPieces,
} from '../../business/domain/scene-voice';
import { mp3DurationMs } from '../../business/domain/speech';
import { spokenForm, type Pronunciations } from '../../business/domain/spoken';
import { startMathsSpeech } from '../../business/domain/maths-speech';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  ALIGNER,
  LLM_GATEWAY,
  SCENE_SPEECH,
  STORAGE,
} from '../../business/ports/tokens';
import type { SpeechPort } from '../../business/ports/voice.port';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  DocumentPageRepository,
  PageText,
} from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type {
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
  TOPIC_REPOSITORY,
  VISUAL_SCENE_REPOSITORY,
} from '../../business/repositories/tokens';
import type { VisualSceneRepository } from '../../business/repositories/visual.repository';
import type { VisualSceneJobData } from '../queues';
import { isPermanentFailure, type JobContext } from './base.processor';

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
/** Tries at one drawing: the first, and one more with the gate's notes. */
const DRAW_TRIES = 2;
/** Stretches of a story read at once. */
const STORY_READERS = 4;
/** The most stretches (about 20 pages each) a story read the old way is read again in, unasked. */
const REREAD_MOST_STRETCHES = 6;
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

/** A person no model could describe: plainly dressed, as old as their voice. */
function figureByVoice(voice: StoryCharacter['voice']): FigureSpec {
  const age =
    voice === 'girl' || voice === 'boy'
      ? 'child'
      : voice === 'old woman' || voice === 'old man'
        ? 'elder'
        : 'adult';
  return {
    ...PLAIN_FIGURE,
    age,
    hairColour: age === 'elder' ? 'grey' : PLAIN_FIGURE.hairColour,
  };
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

@Injectable()
export class SceneProcessor {
  private readonly logger = new Logger(SceneProcessor.name);
  /** Work others wait on rather than repeat: a book's story, a character's drawing. */
  private readonly running = new Map<string, Promise<unknown>>();
  /** Writes to one file, each after the last. */
  private readonly writing = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
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
    @Inject(SCENE_SPEECH) private readonly speech: SpeechPort,
    private readonly config: ConfigService,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(ALIGNER) private readonly aligner: AlignerPort,
  ) {}

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
        ),
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
      const drawn = [...drawings.values()].filter(Boolean).length;
      this.logger.log(
        `${who}: made in ${Math.round((Date.now() - started) / 1000)}s: ${script.beats.length} sentences, ${Math.round(voice.durationMs / 1000)}s of audio timed by ${voice.timing}, ${scene.steps.length} stage changes, ${scene.effects.length} effects (${filled} filled), ${drawn} of ${drawings.size} drawings`,
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
    const script: SceneScript =
      input.script ??
      (await this.write({
        documentTitle: input.documentTitle,
        topic,
        material: input.material,
        plain: input.plain ?? null,
        before: input.before ?? null,
        context: input.context,
        profile: input.profile,
        story,
        documentId,
        who,
      }).then((written) =>
        story ? castStory(written, story.bible, story.page) : written,
      ));
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
      this.drawAll(
        script,
        topic.title,
        documentId,
        who,
        stop.signal,
        story,
      ).then(async (made) => {
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
        // and while what happens before the first word happens.
        Math.min(
          3,
          (script.opening?.show.length ? OPENING_LEAD_S : 0) +
            (script.lead ?? 0),
        ),
        input.profile.stage ?? null,
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
    const { scene, filled, audit } = composeScene({
      script,
      drawings,
      beats: voice.beats,
      durationMs: voice.durationMs,
      timing: voice.timing,
      generator: SCENE_GENERATOR_VERSION,
      profile: input.profile,
    });
    // For working on the layout without the models: everything compose
    // was given, kept where SCENE_KEEP_PARTS says (scripts/scene-recompose).
    const keep = this.config.get<string>('SCENE_KEEP_PARTS')?.trim();
    if (keep)
      try {
        const { mkdirSync, writeFileSync } = await import('node:fs');
        mkdirSync(keep, { recursive: true });
        writeFileSync(
          `${keep}/${input.keepAs ?? 'page'}-parts.json`,
          JSON.stringify({
            script,
            drawings: [...drawings],
            beats: voice.beats,
            durationMs: voice.durationMs,
            timing: voice.timing,
            profile: input.profile,
          }),
        );
      } catch (error) {
        this.logger.warn(`${who}: parts not kept: ${(error as Error).message}`);
      }
    // What no layout promises by construction: nothing set on anything.
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
    return this.write({
      documentTitle: doc.props.title,
      topic,
      material: await this.material(documentId, pageNumber),
      context: await this.where(
        documentId,
        doc.contentVersion,
        topic,
        pageNumber,
      ),
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
  ): Promise<MendedScript> {
    const first = await call(ask);
    await this.record(input.documentId, 'scene_write', first.usage);
    let mended = mend(first.value);
    if (mended.mended.length)
      this.logger.log(
        `${input.who}: mended: ${mended.mended.slice(0, 8).join('; ')}`,
      );
    if (mended.problems.length && mended.script.fit !== 'poor') {
      this.logger.warn(
        `${input.who}: the storyboard goes back: ${mended.problems.join(' ')}`,
      );
      const again = await call({
        ...ask,
        previous: first.value,
        problems: [
          ...mended.problems,
          ...(quiet ? quietStretches(mended.script) : []),
        ],
      });
      await this.record(input.documentId, 'scene_write', again.usage);
      const second = mend(again.value);
      if (second.mended.length)
        this.logger.log(
          `${input.who}: mended: ${second.mended.slice(0, 8).join('; ')}`,
        );
      if (second.problems.length <= mended.problems.length) mended = second;
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
          old: oldWorld(story?.bible.world?.era),
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
      const onPage = sheet?.figure
        ? await figureDrawing(sheet.figure, thing.ref, {
            pose: thing.pose,
            holding: thing.holding,
            signs,
            old: oldWorld(story?.bible.world?.era),
          })
        : null;
      const { anchors: pageAnchors, ...posed } = onPage ?? { anchors: null };
      const drawing = onPage ? (posed as GatedDrawing) : sheet?.drawing;
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
            )
          : null;
      out.set(thing.id, set?.drawing ?? null);
    });
    await Promise.all([
      ...cast,
      ...sets,
      ...drawings.map(async (thing) => {
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
  ): Promise<{
    beats: TimedBeat[];
    durationMs: number;
    audioKey: string;
    timing: SceneTiming;
  }> {
    // Maths said as a teacher says it, not as its signs.
    await startMathsSpeech();
    const forms = script.beats.map((beat) => spokenForm(beat.say, kept));
    // Each sentence at its own pace, with its own silence after it.
    const delivered = deliveryPieces(
      script.beats,
      stage ? STAGE_RECIPES[stage] : undefined,
    );
    const pausesS = delivered.map((piece) => piece.pauseAfter);
    const spoken = sceneSpoken(forms);
    const { model } = this.speech.label();
    // Visualize may speak in a voice of its own; lectures keep theirs.
    const voice =
      this.config.get<string>('SCENE_VOICE')?.trim() ||
      this.speech.label().voice;
    // A story's characters say their own lines, in voices of their own.
    const engine = model.startsWith('gemini')
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
        ? characterVoice(story.bible, character, engine, voice)
        : null;
    };
    const lines = script.beats.map((beat, k) => {
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
      styles: script.beats.map((beat) =>
        voiceStyle(script.mood, beat.delivery),
      ),
      lines,
    });
    const result = await this.speech.synthesize({
      text: spoken.text,
      voice,
      speed: 1,
      timestamps: true,
      pieces: pieces.map((piece) => ({
        text: piece.text,
        speed: piece.speed,
        pauseAfter: piece.pauseAfter,
        ...(piece.style ? { style: piece.style } : {}),
        ...(piece.voice ? { voice: piece.voice } : {}),
      })),
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
    await this.storage.put({
      key: audioKey,
      body: result.audio,
      mimeType: result.mimeType,
    });
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
        const times = aligned
          ? wordTimesFromAligned(
              aligned.words,
              spoken.text,
              durationMs,
              audioKey,
              `echogarden-${aligned.engine}`,
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
    return {
      beats: timeBeats(script.beats, forms, words),
      durationMs,
      audioKey,
      timing,
    };
  }

  /**
   * The card's still: the fullest step of the box staging, each drawing
   * rendered alone, with what it hides until later hidden, so no two
   * drawings' ids or styles ever share a document.
   */
  private async thumb(scene: Parameters<typeof thumbSvg>[0]): Promise<Buffer> {
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
            scenery.svg,
            Math.round(scene.stagings.box.w * scale),
          ),
        );
      } catch {
        // A still with no scene behind it.
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
        if (kept) return kept;
      } catch (error) {
        this.logger.warn(
          `${who}: the cast could not be read: ${(error as Error).message}`,
        );
        return null;
      }
      const sheet = await this.drawCharacter(
        character,
        bookTitle,
        documentId,
        who,
      );
      if (!sheet) return null;
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
      return sheet;
    });
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
  ): Promise<CharacterSheet | null> {
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
      const spec = figure ?? figureByVoice(character.voice);
      const sheet = await figureSheet(spec, character.id);
      this.logger.log(
        `${who}: ${character.name} drawn by the kit: ${describeFigure(spec)}`,
      );
      return sheet;
    }
    const sheet = await this.drawSheet(
      { ...character, kind, size },
      bookTitle,
      documentId,
      who,
    );
    return sheet ? { ...sheet, size: size ?? 'medium' } : null;
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
  ): Promise<SetSheet | null> {
    return this.once(`${key}#${place.id}`, async () => {
      try {
        const kept = (await this.setsAt(key))[place.id];
        if (kept) return kept;
      } catch (error) {
        this.logger.warn(
          `${who}: the sets could not be read: ${(error as Error).message}`,
        );
        return null;
      }
      const set = await this.paintSet(place, bookTitle, documentId, who, world);
      if (!set) return null;
      await this.inTurn(key, async () => {
        const sets = await this.setsAt(key);
        sets[place.id] = set;
        await this.storage.put({
          key,
          body: Buffer.from(JSON.stringify(sets)),
          mimeType: 'application/json',
        });
      }).catch((error: unknown) =>
        this.logger.warn(
          `${who}: ${place.name} was painted but not kept: ${(error as Error).message}`,
        ),
      );
      return set;
    });
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

  /** A place painted for the book: asked for as a set, gated as one, and asked for once more when it falls short. */
  private async paintSet(
    place: StoryPlace,
    bookTitle: string,
    documentId: string | null,
    who: string,
    world: StoryWorld | null = null,
  ): Promise<SetSheet | null> {
    const thing = setThing(place, bookTitle, world);
    let best: GateResult | null = null;
    let notes: string[] | undefined;
    for (let attempt = 1; attempt <= DRAW_TRIES; attempt += 1) {
      let reply: string;
      try {
        const made = await this.llm.sceneDrawing({
          thing,
          viewBox: SET_CANVAS,
          topic: bookTitle,
          neighbours: [],
          notes,
          backdrop: true,
        });
        await this.record(documentId, 'scene_draw', made.usage);
        reply = made.value;
      } catch (error) {
        this.logger.warn(
          `${who}: ${place.name} could not be asked for: ${(error as Error).message}`,
        );
        continue;
      }
      const gated = await gateDrawing(reply, thing, { backdrop: true });
      if (gated.drawing && (!best?.drawing || gated.score > best.score))
        best = gated;
      if (gated.drawing && !gated.retry) break;
      notes = gated.notes;
    }
    if (!best?.drawing) {
      this.logger.warn(`${who}: ${place.name} could not be painted`);
      return null;
    }
    this.logger.log(`${who}: ${place.name} painted for the whole book`);
    return { version: SET_VERSION, drawing: best.drawing };
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
   * A character drawn for the book: asked for, gated, measured as a sheet
   * (every face on the head), and asked for once more with what fell
   * short; the better kept.
   */
  private async drawSheet(
    character: StoryCharacter,
    bookTitle: string,
    documentId: string | null,
    who: string,
  ): Promise<CharacterSheet | null> {
    const thing = sheetThing(character, bookTitle);
    const viewBox = CANVAS[thing.shape];
    let best: { sheet: CharacterSheet; faults: number } | null = null;
    let notes: string[] | undefined;
    for (let attempt = 1; attempt <= DRAW_TRIES; attempt += 1) {
      let reply: string;
      try {
        const made = await this.llm.sceneDrawing({
          thing,
          viewBox,
          topic: bookTitle,
          neighbours: [],
          notes,
        });
        await this.record(documentId, 'scene_draw', made.usage);
        reply = made.value;
      } catch (error) {
        this.logger.warn(
          `${who}: ${character.name} could not be asked for: ${(error as Error).message}`,
        );
        continue;
      }
      const gated = await gateDrawing(reply, thing);
      if (!gated.drawing) {
        notes = gated.notes;
        continue;
      }
      const measured = await measureSheet(gated.drawing).catch(
        (error: unknown) => ({
          sheet: null,
          notes: [`It could not be measured: ${(error as Error).message}`],
        }),
      );
      const faults = (gated.retry ? 1 : 0) + measured.notes.length;
      if (measured.sheet && (!best || faults < best.faults))
        best = { sheet: measured.sheet, faults };
      if (measured.sheet && !faults) break;
      notes = [...gated.notes, ...measured.notes];
      this.logger.log(
        `${who}: ${character.name} try ${attempt} fell short: ${notes.join(' ')}`,
      );
    }
    if (best)
      this.logger.log(`${who}: ${character.name} drawn for the whole book`);
    else this.logger.warn(`${who}: ${character.name} could not be drawn`);
    return best?.sheet ?? null;
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
  ): Promise<string> {
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
      `This is page ${pageNumber} of the chapter "${topic.title}", which runs from page ${topic.startPage} to ${topic.endPage}.`,
      earlier.length
        ? `The videos before it in the chapter covered: ${earlier.join('; ')}. Do not introduce those again; build on them.`
        : 'It is the first video of the chapter.',
    ].join(' ');
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
    task: 'scene_write' | 'scene_draw' | 'scene_profile' | 'scene_story',
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
