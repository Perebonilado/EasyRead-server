import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  estimateWordTimes,
  wordTimesFromAligned,
  type WordTimes,
} from '../../business/domain/board';
import { noteProse } from '../../business/domain/follow';
import { mp3DurationMs } from '../../business/domain/speech';
import { spokenForm, type Pronunciations } from '../../business/domain/spoken';
import {
  VISUAL_GENERATOR_VERSION,
  layoutProblems,
  materialPool,
  repairVisual,
  sceneSpoken,
  timeVisual,
  visualProblems,
  visualWarnings,
  type VisualPlan,
  type VisualScript,
} from '../../business/domain/visual';
import {
  layoutScene,
  type VisualStructure,
} from '../../business/domain/visual-layout';
import type { AlignerPort } from '../../business/ports/aligner.port';
import type { LlmGatewayPort } from '../../business/ports/llm.port';
import type { StoragePort } from '../../business/ports/storage.port';
import {
  ALIGNER,
  LECTURE_SPEECH,
  LLM_GATEWAY,
  SPEECH,
  STORAGE,
} from '../../business/ports/tokens';
import type { SpeechPort } from '../../business/ports/voice.port';
import type { AiCallLogRepository } from '../../business/repositories/ai-call-log.repository';
import type {
  PageText,
  DocumentPageRepository,
} from '../../business/repositories/document-page.repository';
import type { DocumentRepository } from '../../business/repositories/document.repository';
import type { TopicRepository } from '../../business/repositories/misc.repository';
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
import type { JobContext } from './base.processor';

/** The most of a chapter the planner and the scripter read. */
const MATERIAL_CHARS = 14_000;
/** How many times the model is asked to mend a script that still has problems. */
const REPAIR_ROUNDS = 2;
/** Silence between sentences when the voice takes pieces, in seconds. */
const SENTENCE_PAUSE_S = 0.35;

/**
 * Makes one chapter's scene: plans it, has the script written and mended
 * until it is sound, voices it with the lecture's voice, measures the
 * words with the lecture's aligner, and puts every cue on the audio.
 * A chapter the planner judges unsuited is recorded as such, with the
 * reason, and never drawn weakly. Nothing here is shared with another
 * chapter, so a failure is the row's alone.
 */
@Injectable()
export class VisualSceneProcessor {
  private readonly logger = new Logger(VisualSceneProcessor.name);

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
    @Inject(LECTURE_SPEECH) private readonly catalogueSpeech: SpeechPort,
    @Inject(SPEECH) private readonly speech: SpeechPort,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(ALIGNER) private readonly aligner: AlignerPort,
  ) {}

  async process(job: VisualSceneJobData, context: JobContext): Promise<void> {
    const { documentId, topicId, contentVersion } = job;
    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== contentVersion) return;
    const record = await this.visuals.find(
      documentId,
      contentVersion,
      topicId,
      VISUAL_GENERATOR_VERSION,
    );
    if (!record || record.status === 'done') return;
    const topic = (await this.topics.listByDocument(documentId)).find(
      (candidate) => candidate.id === topicId,
    );
    if (!topic) {
      await this.visuals.update(record.id, {
        status: 'failed',
        error: 'The chapter no longer exists',
      });
      return;
    }

    try {
      await this.visuals.update(record.id, {
        status: 'making',
        step: 'planning',
        error: null,
        attempts: record.attempts + 1,
      });
      const material = await this.material(
        documentId,
        topic.startPage,
        topic.endPage,
      );

      // Plan, and the fit: a chapter with nothing to draw says so.
      const planned = await this.llm.visualPlan({
        title: doc.props.title,
        topicTitle: topic.title,
        material,
      });
      await this.record(documentId, 'visual_plan', planned.usage);
      const plan = planned.value;
      if (plan.fit === 'poor') {
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: plan.fit,
          fitReason:
            plan.fitReason ?? 'This chapter has no shape a picture can show.',
        });
        return;
      }

      // Script, mended until sound: the deterministic fixes first, the
      // model only for what they cannot solve.
      await this.visuals.update(record.id, { step: 'drawing', fit: plan.fit });
      this.logger.log(
        `${documentId} ${topicId}: centre "${plan.centre.what}" as ${plan.centre.how}; ${plan.diagramConcept}`,
      );
      const pool = materialPool(material);
      const written = await this.llm.visualScript({
        plan,
        topicTitle: topic.title,
        material,
      });
      await this.record(documentId, 'visual_script', written.usage);
      // The model gave the structure; the app places it, then mends what
      // placing alone cannot settle.
      let structure: VisualStructure = written.value;
      let script: VisualScript = repairVisual(layoutScene(structure));
      let problems = this.problemsOf(script, pool, plan.centre);
      for (
        let round = 0;
        problems.length && round < REPAIR_ROUNDS;
        round += 1
      ) {
        const mended = await this.llm.visualScript({
          plan,
          topicTitle: topic.title,
          material,
          previous: structure,
          // The warnings ride along as advice; only the problems must go.
          problems: [...problems, ...visualWarnings(script)],
        });
        await this.record(documentId, 'visual_repair', mended.usage);
        structure = mended.value;
        script = repairVisual(layoutScene(structure));
        problems = this.problemsOf(script, pool, plan.centre);
      }
      if (problems.length) {
        this.logger.warn(
          `${documentId} ${topicId}: ${problems.length} problems left after ${REPAIR_ROUNDS} repairs:\n- ${problems.join('\n- ')}`,
        );
        throw new Error(
          `The scene could not be made sound: ${problems.slice(0, 3).join(' ')}`,
        );
      }

      // Voice: the lecture's voice for this document, the sentences as
      // pieces with a breath between them, one file.
      await this.visuals.update(record.id, { step: 'recording' });
      const kept: Pronunciations = doc.props.institutionId
        ? await this.pronunciations.kept(doc.props.institutionId)
        : new Map();
      const forms = script.segments.map((segment) =>
        spokenForm(segment.text, kept),
      );
      const spoken = sceneSpoken(forms);
      const speech = doc.props.institutionId
        ? this.catalogueSpeech
        : this.speech;
      const { model, voice } = speech.label();
      const result = await speech.synthesize({
        text: spoken.text,
        voice,
        speed: 1,
        pieces: forms.map((form, index) => ({
          text: form.text,
          speed: 1,
          pauseAfter: index === forms.length - 1 ? 0 : SENTENCE_PAUSE_S,
        })),
      });
      const audioKey = `documents/${doc.id}/visuals/v${contentVersion}/${topicId}-${VISUAL_GENERATOR_VERSION}-${voice}-${model}.mp3`;
      await this.storage.put({
        key: audioKey,
        body: result.audio,
        mimeType: result.mimeType,
      });
      const durationMs =
        result.durationMs ?? mp3DurationMs(result.audio.length);
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
        costUsd: null,
      });

      // Timing: the words measured on the audio, or estimated from it.
      await this.visuals.update(record.id, { step: 'timing' });
      let times: WordTimes | null = null;
      if (this.aligner.enabled()) {
        try {
          const aligned = await this.aligner.align({
            audio: result.audio,
            mimeType: result.mimeType,
            text: spoken.text,
          });
          if (aligned) {
            times = wordTimesFromAligned(
              aligned.words,
              spoken.text,
              durationMs,
              audioKey,
              `echogarden-${aligned.engine}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `${documentId} ${topicId}: alignment failed, timing on the estimate: ${(error as Error).message}`,
          );
        }
      }
      const timing = times ? 'aligned' : 'estimated';
      if (!times) times = estimateWordTimes(spoken.text, durationMs, audioKey);
      const timeline = timeVisual({ script, forms, times, durationMs, timing });

      await this.visuals.update(record.id, {
        status: 'done',
        step: null,
        title: script.title,
        timeline,
        audioKey,
        durationMs,
        error: null,
      });
      this.logger.log(
        `${documentId} ${topicId}: scene made, ${script.elements.length} elements, ${script.segments.length} sentences, ${Math.round(durationMs / 1000)}s, ${timing}`,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${documentId} ${topicId}: scene failed: ${message}`);
      if (!context.isFinalAttempt) {
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

  private problemsOf(
    script: VisualScript,
    pool: Set<string>,
    centre?: VisualPlan['centre'],
  ): string[] {
    const warnings = visualWarnings(script);
    if (warnings.length) this.logger.log(warnings.join(' '));
    // The plan asked for a picture at the centre: a scene that boxed it
    // instead is sent back to use the library.
    const drawn = script.elements.some(
      (e) => e.type === 'shape' && e.kind !== 'roundRect' && e.kind !== 'rect',
    );
    const wanted =
      centre?.how === 'picture' && centre.picture && !drawn
        ? [
            `The plan puts "${centre.what}" at the centre as the picture "${centre.picture}" from the library, but the centre item is not a picture. Make the centre item kind "picture" with picture "${centre.picture}".`,
          ]
        : [];
    return [
      ...wanted,
      ...visualProblems(script, pool),
      ...layoutProblems(script),
    ];
  }

  /** The chapter's pages, each its simplified note when written, else its own text. */
  private async material(
    documentId: string,
    from: number,
    to: number,
  ): Promise<string> {
    const pages: PageText[] = await this.pages.findRange(documentId, from, to);
    const parts: string[] = [];
    for (let page = from; page <= to; page += 1) {
      const note = await this.simplified.find(documentId, page);
      if (note?.status === 'done' && note.blocks?.length) {
        parts.push(noteProse(note.blocks));
        continue;
      }
      const own = pages.find((row) => row.pageNumber === page);
      if (own?.text) parts.push(own.text);
    }
    return parts.join('\n\n').slice(0, MATERIAL_CHARS);
  }

  private async record(
    documentId: string,
    task: 'visual_plan' | 'visual_script' | 'visual_repair',
    usage: {
      model: string;
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    },
  ): Promise<void> {
    await this.calls.record({
      documentId,
      task,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      latencyMs: usage.latencyMs,
      outcome: 'ok',
    });
  }
}
