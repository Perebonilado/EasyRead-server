import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SceneDto, SceneTiming } from '../../contracts';
import { wordTimesFromAligned } from '../../business/domain/board';
import {
  catalogueSpeechCost,
  geminiSpeechCost,
} from '../../business/domain/cost';
import { sceneProse } from '../../business/domain/follow';
import { drawByCode } from '../../business/domain/scene-code';
import {
  DEFAULT_PROFILE,
  describeProfile,
  profileKey,
  profileOf,
  type DocumentProfile,
} from '../../business/domain/scene-profile';
import {
  composeScene,
  describeStep,
  fullestStep,
  thumbSvg,
} from '../../business/domain/scene-compose';
import { rasterise } from '../../business/domain/scene-raster';
import {
  SCENE_GENERATOR_VERSION,
  mendScript,
  quietStretches,
  wordsOf,
  type CodeThing,
  type DrawingThing,
  type SceneScript,
} from '../../business/domain/scene-script';
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
  deliveryPieces,
  voiceSlug,
  voiceStyle,
} from '../../business/domain/scene-voice';
import { mp3DurationMs } from '../../business/domain/speech';
import { spokenForm, type Pronunciations } from '../../business/domain/spoken';
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
/** The card's still, in pixels across. */
export const THUMB_WIDTH = 480;
/** Tries at one drawing: the first, and one more with the gate's notes. */
const DRAW_TRIES = 2;

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
@Injectable()
export class SceneProcessor {
  private readonly logger = new Logger(SceneProcessor.name);

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
    if (!record || record.status === 'done') return;
    const topics = await this.topics.listByDocument(documentId);
    const topic =
      topics.find((candidate) => candidate.id === record.topicId) ??
      topics.find(
        (candidate) =>
          pageNumber >= candidate.startPage && pageNumber <= candidate.endPage,
      );
    if (!topic) {
      await this.visuals.update(record.id, {
        status: 'failed',
        error: 'The page is outside every chapter',
      });
      return;
    }
    const who = `${documentId} p${pageNumber}`;
    const started = Date.now();

    try {
      await this.visuals.update(record.id, {
        status: 'making',
        step: 'writing',
        error: null,
        attempts: record.attempts + 1,
      });
      const material = await this.material(documentId, pageNumber);
      if (wordsOf(material).length < THIN_PAGE_WORDS) {
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
        context: await this.where(
          documentId,
          contentVersion,
          topic,
          pageNumber,
        ),
        profile: await this.profileFor(documentId, contentVersion),
        kept: doc.props.institutionId
          ? await this.pronunciations.kept(doc.props.institutionId)
          : new Map(),
        base: `documents/${doc.id}/visuals/v${contentVersion}/p${pageNumber}-${SCENE_GENERATOR_VERSION}`,
        who,
        keepAs: `${documentId}-p${pageNumber}`,
        step: (step) => this.visuals.update(record.id, { step }),
      });
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
      const drawn = [...drawings.values()].filter(Boolean).length;
      this.logger.log(
        `${who}: made in ${Math.round((Date.now() - started) / 1000)}s: ${script.beats.length} sentences, ${Math.round(voice.durationMs / 1000)}s of audio timed by ${voice.timing}, ${scene.steps.length} stage changes, ${scene.effects.length} effects (${filled} filled), ${drawn} of ${drawings.size} drawings`,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${who}: scene failed: ${message}`);
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
    context: string;
    profile: DocumentProfile;
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
    const script = await this.write({
      documentTitle: input.documentTitle,
      topic,
      material: input.material,
      context: input.context,
      profile: input.profile,
      documentId,
      who,
    });
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
      this.drawAll(script, topic.title, documentId, who, stop.signal).then(
        async (made) => {
          if (!voiced && !stop.signal.aborted) await input.step?.('voicing');
          return made;
        },
      ),
      this.voice(script, input.kept, base, documentId, who)
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
      profile: await this.profileFor(documentId, doc.contentVersion),
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
    context: string;
    profile: DocumentProfile;
    documentId: string | null;
    who: string;
  }): Promise<SceneScript> {
    const ask = {
      documentTitle: input.documentTitle,
      topicTitle: input.topic.title,
      material: input.material,
      context: input.context,
      profile: describeProfile(input.profile),
    };
    // The page, to hold a quotation to, and the formats the book may use.
    const checks = { material: input.material, formats: input.profile.formats };
    const first = await this.llm.sceneScript(ask);
    await this.record(input.documentId, 'scene_write', first.usage);
    let mended = mendScript(first.value, checks);
    if (mended.mended.length)
      this.logger.log(
        `${input.who}: mended: ${mended.mended.slice(0, 8).join('; ')}`,
      );
    if (mended.problems.length && mended.script.fit !== 'poor') {
      this.logger.warn(
        `${input.who}: the storyboard goes back: ${mended.problems.join(' ')}`,
      );
      const again = await this.llm.sceneScript({
        ...ask,
        previous: first.value,
        problems: [...mended.problems, ...quietStretches(mended.script)],
      });
      await this.record(input.documentId, 'scene_write', again.usage);
      const second = mendScript(again.value, checks);
      if (second.problems.length <= mended.problems.length) mended = second;
    }
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

  /** Every drawing the storyboard needs, all at once; a null is one that could not be made. */
  private async drawAll(
    script: SceneScript,
    topic: string,
    documentId: string | null,
    who: string,
    signal: AbortSignal,
  ): Promise<Map<string, GatedDrawing | null>> {
    const drawings = script.cast.filter(
      (thing): thing is DrawingThing => thing.kind === 'drawing',
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
    // What code draws itself: working, graphs, the text's own words. No
    // model is asked, and one that cannot be set is a card, as a drawing is.
    const coded = script.cast.filter(
      (thing): thing is CodeThing =>
        thing.kind === 'math' ||
        thing.kind === 'plot' ||
        thing.kind === 'quote',
    );
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
    await Promise.all(
      drawings.map(async (thing) => {
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
    );
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
  ): Promise<{
    beats: TimedBeat[];
    durationMs: number;
    audioKey: string;
    timing: SceneTiming;
  }> {
    const forms = script.beats.map((beat) => spokenForm(beat.say, kept));
    // Each sentence at its own pace, with its own silence after it.
    const delivered = deliveryPieces(script.beats);
    const pausesS = delivered.map((piece) => piece.pauseAfter);
    const spoken = sceneSpoken(forms);
    const { model } = this.speech.label();
    // Visualize may speak in a voice of its own; lectures keep theirs.
    const voice =
      this.config.get<string>('SCENE_VOICE')?.trim() ||
      this.speech.label().voice;
    const result = await this.speech.synthesize({
      text: spoken.text,
      voice,
      speed: 1,
      timestamps: true,
      pieces: forms.map((form, i) => ({
        text: form.text,
        speed: delivered[i].speed,
        pauseAfter: pausesS[i],
        // For a voice that takes direction; Kokoro goes by pace and silence.
        style: voiceStyle(script.mood, script.beats[i].delivery),
      })),
    });
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
            result.pieceStartsMs,
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
      pieceStartsMs: result.pieceStartsMs,
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
    for (const id of step?.show ?? []) {
      const thing = scene.things.find((t) => t.id === id);
      const place = scene.stagings.box.places[index]?.[id];
      if (thing?.kind !== 'drawing' || !place) continue;
      const hide = thing.hidden.length
        ? `<style>${thing.hidden.map((h) => `[id="${h.replace(/"/g, '')}"]`).join(',')}{display:none}</style>`
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
    try {
      const kept = JSON.parse(
        (await this.storage.get(key)).toString('utf8'),
      ) as Parameters<typeof profileOf>[0];
      return profileOf(kept);
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
      const profile = profileOf(made.value);
      await this.storage.put({
        key,
        body: Buffer.from(JSON.stringify(profile)),
        mimeType: 'application/json',
      });
      this.logger.log(`${documentId}: ${describeProfile(profile)}`);
      return profile;
    } catch (error) {
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
    task: 'scene_write' | 'scene_draw' | 'scene_profile',
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
