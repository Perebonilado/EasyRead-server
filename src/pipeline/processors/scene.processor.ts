import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SceneTiming } from '../../contracts';
import { wordTimesFromAligned } from '../../business/domain/board';
import { catalogueSpeechCost } from '../../business/domain/cost';
import { noteProse } from '../../business/domain/follow';
import {
  composeScene,
  describeStep,
  fullestStep,
  thumbSvg,
} from '../../business/domain/scene-compose';
import { rasterise } from '../../business/domain/scene-raster';
import {
  PAUSE_SECONDS,
  SCENE_GENERATOR_VERSION,
  mendScript,
  quietStretches,
  wordsOf,
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
import { mp3DurationMs } from '../../business/domain/speech';
import { spokenForm, type Pronunciations } from '../../business/domain/spoken';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { LlmGatewayPort, LlmUsage } from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  ALIGNER,
  LLM_GATEWAY,
  STORAGE,
  UPLOAD_SPEECH,
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
    @Inject(UPLOAD_SPEECH) private readonly speech: SpeechPort,
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

      const script = await this.write({
        documentTitle: doc.props.title,
        topic,
        material,
        context: await this.where(
          documentId,
          contentVersion,
          topic,
          pageNumber,
        ),
        documentId,
        who,
      });
      if (script.fit === 'poor') {
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: 'poor',
          fitReason: script.fitReason ?? 'This page does not suit a video.',
        });
        return;
      }

      // Drawing and voicing need only the script, so they run together.
      await this.visuals.update(record.id, { step: 'drawing' });
      const kept: Pronunciations = doc.props.institutionId
        ? await this.pronunciations.kept(doc.props.institutionId)
        : new Map();
      const base = `documents/${doc.id}/visuals/v${contentVersion}/p${pageNumber}-${SCENE_GENERATOR_VERSION}`;
      let voiced = false;
      // A voice that fails stops the drawing: nothing more is asked for,
      // and both branches have settled before the catch below touches the
      // row, so neither writes to it afterwards.
      const stop = new AbortController();
      const [drawing, spoken] = await Promise.allSettled([
        this.drawAll(script, topic.title, documentId, who, stop.signal).then(
          async (made) => {
            if (!voiced && !stop.signal.aborted)
              await this.visuals.update(record.id, { step: 'voicing' });
            return made;
          },
        ),
        this.voice(script, kept, base, documentId, who)
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

      await this.visuals.update(record.id, { step: 'composing' });
      const { scene, filled } = composeScene({
        script,
        drawings,
        beats: voice.beats,
        durationMs: voice.durationMs,
        timing: voice.timing,
        generator: SCENE_GENERATOR_VERSION,
      });
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
   * The script and storyboard: written, mended, and written once more when
   * the mend leaves problems. The better of the two is kept; a storyboard
   * that never puts anything on the stage fails the page.
   */
  private async write(input: {
    documentTitle: string;
    topic: TopicRecord;
    material: string;
    context: string;
    documentId: string;
    who: string;
  }): Promise<SceneScript> {
    const ask = {
      documentTitle: input.documentTitle,
      topicTitle: input.topic.title,
      material: input.material,
      context: input.context,
    };
    const first = await this.llm.sceneScript(ask);
    await this.record(input.documentId, 'scene_write', first.usage);
    let mended = mendScript(first.value);
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
      const second = mendScript(again.value);
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
    documentId: string,
    who: string,
    signal: AbortSignal,
  ): Promise<Map<string, GatedDrawing | null>> {
    const drawings = script.cast.filter(
      (thing): thing is DrawingThing => thing.kind === 'drawing',
    );
    const names = new Map(
      script.cast.map((thing) => [
        thing.id,
        thing.kind === 'drawing'
          ? thing.name
          : thing.kind === 'stat'
            ? thing.caption
            : thing.text,
      ]),
    );
    const out = new Map<string, GatedDrawing | null>();
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
    documentId: string,
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
    documentId: string,
    who: string,
  ): Promise<{
    beats: TimedBeat[];
    durationMs: number;
    audioKey: string;
    timing: SceneTiming;
  }> {
    const forms = script.beats.map((beat) => spokenForm(beat.say, kept));
    const pausesS = script.beats.map((beat) => PAUSE_SECONDS[beat.pause]);
    const spoken = sceneSpoken(forms);
    const { model, voice } = this.speech.label();
    const result = await this.speech.synthesize({
      text: spoken.text,
      voice,
      speed: 1,
      timestamps: true,
      pieces: forms.map((form, i) => ({
        text: form.text,
        speed: 1,
        pauseAfter: pausesS[i],
      })),
    });
    const audioKey = `${base}-${voice}-${model}.mp3`;
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
      // A voice of our own is priced by the audio it made, at its rate.
      costUsd: result.model.startsWith('kokoro:')
        ? catalogueSpeechCost(
            durationMs,
            Number(this.config.get<string>('KOKORO_USD_PER_AUDIO_HOUR', '0')),
          )
        : result.model.startsWith('modal:')
          ? catalogueSpeechCost(
              durationMs,
              Number(this.config.get<string>('MODAL_USD_PER_AUDIO_HOUR', '0')),
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

  /** The page: its simplified note when written, else its own text. */
  private async material(
    documentId: string,
    pageNumber: number,
  ): Promise<string> {
    const note = await this.simplified.find(documentId, pageNumber);
    if (note?.status === 'done' && note.blocks?.length)
      return noteProse(note.blocks).slice(0, MATERIAL_CHARS);
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
    documentId: string,
    task: 'scene_write' | 'scene_draw',
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
