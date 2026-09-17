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
  type VisualScript,
} from '../../business/domain/visual';
import {
  layoutTutorial,
  pausesFor,
  tidyTutorial,
  tutorialProblems,
  type VisualTutorial,
} from '../../business/domain/visual-cards';
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
/** A page with fewer words than this has too little to teach. */
const THIN_PAGE_WORDS = 40;

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
    const { documentId, pageNumber, contentVersion } = job;
    const doc = await this.documents.findById(documentId);
    if (!doc || doc.props.deletedAt) return;
    if (doc.contentVersion !== contentVersion) return;
    const record = await this.visuals.find(
      documentId,
      contentVersion,
      pageNumber,
      VISUAL_GENERATOR_VERSION,
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

    try {
      await this.visuals.update(record.id, {
        status: 'making',
        step: 'planning',
        error: null,
        attempts: record.attempts + 1,
      });
      const material = await this.material(documentId, pageNumber, pageNumber);
      if (material.split(/\s+/).filter(Boolean).length < THIN_PAGE_WORDS) {
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: 'poor',
          fitReason: 'Too little on this page to teach.',
        });
        return;
      }

      // The chapter's plan, made once for all of its pages.
      let plan = await this.visuals.findPlan(
        documentId,
        contentVersion,
        topic.id,
        VISUAL_GENERATOR_VERSION,
      );
      if (!plan) {
        const planned = await this.llm.visualPlan({
          title: doc.props.title,
          topicTitle: topic.title,
          material: await this.material(
            documentId,
            topic.startPage,
            topic.endPage,
          ),
        });
        await this.record(documentId, 'visual_plan', planned.usage);
        plan = planned.value;
        await this.visuals.savePlan({
          documentId,
          contentVersion,
          topicId: topic.id,
          generatorVersion: VISUAL_GENERATOR_VERSION,
          plan,
        });
      }
      // Where the page sits, and what the pages before it already taught.
      const earlier = (
        await this.visuals.listByDocument(
          documentId,
          contentVersion,
          VISUAL_GENERATOR_VERSION,
        )
      )
        .filter(
          (row) =>
            row.topicId === topic.id &&
            row.pageNumber < pageNumber &&
            row.status === 'done' &&
            row.title,
        )
        .map((row) => `page ${row.pageNumber}: ${row.title}`);
      const where = [
        `page ${pageNumber} of the chapter "${topic.title}", which runs from page ${topic.startPage} to ${topic.endPage}.`,
        earlier.length
          ? `The pages before it already taught: ${earlier.join('; ')}.`
          : 'It is the first page of the chapter to be taught.',
      ].join(' ');

      // The tutorial, mended until sound: the deterministic fixes first,
      // the model only for what they cannot solve.
      await this.visuals.update(record.id, { step: 'drawing' });
      const pool = materialPool(material);
      const written = await this.llm.visualScript({
        plan,
        topicTitle: topic.title,
        material,
        context: where,
      });
      await this.record(documentId, 'visual_script', written.usage);
      // The model gave the tutorial; the app lays every card out, then
      // mends what laying out alone cannot settle.
      let tutorial: VisualTutorial = tidyTutorial(written.value);
      if (tutorial.fit === 'poor') {
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: 'poor',
          fitReason: tutorial.fitReason ?? 'This page has too little to teach.',
        });
        return;
      }
      let script: VisualScript = repairVisual(layoutTutorial(tutorial));
      let problems = [
        ...tutorialProblems(tutorial, pool),
        ...this.problemsOf(script),
      ];
      for (
        let round = 0;
        problems.length && round < REPAIR_ROUNDS;
        round += 1
      ) {
        const mended = await this.llm.visualScript({
          plan,
          topicTitle: topic.title,
          material,
          context: where,
          previous: tutorial,
          // The warnings ride along as advice; only the problems must go.
          problems: [...problems, ...visualWarnings(script)],
        });
        await this.record(documentId, 'visual_repair', mended.usage);
        tutorial = tidyTutorial(mended.value);
        script = repairVisual(layoutTutorial(tutorial));
        problems = [
          ...tutorialProblems(tutorial, pool),
          ...this.problemsOf(script),
        ];
      }
      if (problems.length) {
        this.logger.warn(
          `${who}: ${problems.length} problems left after ${REPAIR_ROUNDS} repairs:\n- ${problems.join('\n- ')}`,
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
      // The voice breathes between sentences and waits where a card comes in.
      const pauses = pausesFor(tutorial);
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
          pauseAfter: pauses[index],
        })),
      });
      const audioKey = `documents/${doc.id}/visuals/v${contentVersion}/p${pageNumber}-${VISUAL_GENERATOR_VERSION}-${voice}-${model}.mp3`;
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
            `${who}: alignment failed, timing on the estimate: ${(error as Error).message}`,
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
        `${who}: scene made, ${script.elements.length} elements, ${script.segments.length} sentences, ${Math.round(durationMs / 1000)}s, ${timing}`,
      );
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`${who}: scene failed: ${message}`);
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

  /** What is wrong with the laid-out scene; the words were checked on the tutorial itself. */
  private problemsOf(script: VisualScript): string[] {
    const warnings = visualWarnings(script);
    if (warnings.length) this.logger.log(warnings.join(' '));
    return [...visualProblems(script, null), ...layoutProblems(script)];
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
