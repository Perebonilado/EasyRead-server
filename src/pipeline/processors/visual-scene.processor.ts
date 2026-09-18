import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  wordTimesFromAligned,
  type WordTimes,
} from '../../business/domain/board';
import { noteProse } from '../../business/domain/follow';
import { mp3DurationMs } from '../../business/domain/speech';
import { spokenForm, type Pronunciations } from '../../business/domain/spoken';
import {
  STAGES,
  VISUAL_GENERATOR_VERSION,
  layoutProblems,
  materialPool,
  estimateVisualWordTimes,
  pinWordTimes,
  repairVisual,
  sceneSpoken,
  timeVisual,
  visualProblems,
  visualWarnings,
  timingProblems,
  type StagingName,
  type VisualScript,
  type VisualMotion,
} from '../../business/domain/visual';
import {
  assembleTutorial,
  layoutTutorial,
  mergeDecisions,
  momentsNamed,
  pausesFor,
  tidyNarration,
  tidyTutorial,
  tutorialProblems,
  tutorialWarnings,
  type Moment,
  type VisualDecision,
  type VisualTutorial,
} from '../../business/domain/visual-cards';
import { buildMenu } from '../../business/domain/visual-menu';
import {
  MANNER_MEANINGS,
  chipIcon,
  resolveDrawing,
} from '../../business/domain/visual-figures';
import { MOTION_MEANINGS } from '../../business/domain/living.generated/motion';
import { pickPicture } from '../../business/domain/visual-presets';
import {
  THUMB_WIDTH,
  rasterise,
  renderFilm,
  renderThumb,
} from '../../business/domain/visual-render';
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
/** How many times the judge may send a moment back before it ships plain. */
const JUDGE_ROUNDS = 2;
/** The judge's sheet, in pixels across: three stills a row, each readable. */
const SHEET_WIDTH = 1500;

/** A decision's card and fields, without its reasoning, to tell whether a redo changed anything. */
function decisionKey(d: VisualDecision): string {
  const { reasoning, shouldSee, confidence, ...card } = d;
  void reasoning;
  void shouldSee;
  void confidence;
  return JSON.stringify(card);
}

/** What should change from frame to frame in a moment, for the judge; nothing when nothing moves. */
function motionLine(m: Moment): string | undefined {
  const lines: string[] = [];
  const said = (of: string, motion: VisualMotion | null | undefined) => {
    const drawn = resolveDrawing(of, m.shape ?? undefined);
    if (drawn?.kind === 'figure' && drawn.figure.manner !== 'still')
      lines.push(`${of} ${MANNER_MEANINGS[drawn.figure.manner]}`);
    else if (motion) lines.push(`${of} ${MOTION_MEANINGS[motion].what}`);
  };
  if (m.card === 'picture') said(m.picture ?? m.name ?? 'the thing', m.motion);
  for (const p of m.pictures ?? []) said(p.name || p.picture, p.motion);
  if (m.card === 'mechanism')
    lines.push('the machine runs its stages, one on each sentence');
  return lines.length ? lines.join('; ') : undefined;
}

/**
 * What a card claims to draw, for the judge: each thing by the page's
 * word and, in brackets, the library drawing or figure it is drawn as,
 * so a drawing whose name means another thing is caught by name as well
 * as by eye. Chips are listed with their icons; a chip with none is not.
 */
function drawingsOf(m: Moment): string[] {
  const drawnAs = (
    of: string | undefined,
    shape?: Moment['shape'],
  ): string | undefined => {
    if (!of) return undefined;
    const drawn = resolveDrawing(of, shape ?? undefined);
    if (!drawn) return undefined;
    if (drawn.kind === 'figure')
      return `${of} (a ${drawn.figure.outline} figure)`;
    return drawn.name === of ? of : `${of} (drawn as ${drawn.name})`;
  };
  const chip = (item: { text: string; picture?: string | null }) => {
    const icon = chipIcon(item.picture ?? undefined);
    return icon ? `the chip "${item.text}" with the ${icon} icon` : undefined;
  };
  const composed =
    m.card === 'picture' && m.compose
      ? `${m.picture ?? m.name ?? m.compose.base} (a ${pickPicture(m.compose.base) ?? m.compose.base} with a ${pickPicture(m.compose.add) ?? m.compose.add} ${m.compose.place === 'badge' ? 'at its corner' : m.compose.place})`
      : undefined;
  const names = [
    composed ??
      (m.card === 'picture'
        ? drawnAs(m.picture ?? m.name, m.shape)
        : undefined),
    m.card === 'mechanism'
      ? `a ${m.mechanism?.kind ?? 'bucket'} mechanism`
      : undefined,
    ...(m.pictures ?? []).map((p) => drawnAs(p.picture)),
    ...(m.items ?? []).map((i) =>
      m.card === 'chips' ? chip(i) : drawnAs(i.picture),
    ),
    drawnAs(m.left?.picture),
    drawnAs(m.right?.picture),
    drawnAs(m.centre?.picture),
    ...(m.inputs ?? []).map((i) => drawnAs(i.picture)),
    ...(m.outputs ?? []).map((i) => drawnAs(i.picture)),
  ];
  return [...new Set(names.filter((n): n is string => Boolean(n)))];
}
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
      const materialWords = material.split(/\s+/).filter(Boolean).length;
      if (materialWords < THIN_PAGE_WORDS) {
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

      const pool = materialPool(material);
      // Narrate first: the words, cut into moments with an intent each.
      const narrated = await this.llm.visualNarration({
        plan,
        topicTitle: topic.title,
        material,
        context: where,
      });
      await this.record(documentId, 'visual_narration', narrated.usage);
      const narration = tidyNarration(narrated.value);
      if (narration.fit === 'poor') {
        await this.visuals.update(record.id, {
          status: 'not_suitable',
          step: null,
          fit: 'poor',
          fitReason:
            narration.fitReason ?? 'This page has too little to teach.',
        });
        return;
      }
      // Then the director decides how each moment is shown, from the menu
      // of what will draw for this page, reasoning first.
      const menu = buildMenu(
        material,
        narration.sentences,
        `${doc.props.title}, the chapter "${topic.title}"`,
      );
      const directed = await this.llm.visualDirector({
        narration,
        menu: menu.text,
        plan,
        topicTitle: topic.title,
        material,
        context: where,
      });
      await this.record(documentId, 'visual_director', directed.usage);
      let decisions = directed.value;
      const build = async () => {
        const built = tidyTutorial(assembleTutorial(narration, decisions));
        return { tutorial: built, scripts: this.staged(built) };
      };
      let { tutorial, scripts } = await build();
      const problemsNow = () => [
        ...tutorialProblems(tutorial, pool, materialWords, material),
        ...this.problemsOf(scripts),
      ];
      /** The narration's index of each tutorial moment named by position. */
      const originOf = (positions: number[]) =>
        positions
          .map((k) => tutorial.moments[k]?.index)
          .filter((i): i is number => i !== undefined);
      const everyMoment = narration.moments.map((_, i) => i);
      const redoWith = async (only: number[], notes: string[]) => {
        const redo = await this.llm.visualDirector({
          narration,
          menu: menu.text,
          plan,
          topicTitle: topic.title,
          material,
          context: where,
          previous: decisions,
          only,
          notes,
        });
        await this.record(documentId, 'visual_director', redo.usage);
        decisions = mergeDecisions(decisions, redo.value, only);
        ({ tutorial, scripts } = await build());
      };
      /** Moments that cannot be made sound ship plain: their intent in big type. */
      const shipPlain = async (indexes: number[]) => {
        decisions = {
          moments: decisions.moments.filter((d) => !indexes.includes(d.index)),
        };
        ({ tutorial, scripts } = await build());
      };
      let problems = problemsNow();
      for (
        let round = 0;
        problems.length && round < REPAIR_ROUNDS;
        round += 1
      ) {
        const named = originOf(momentsNamed(problems));
        await redoWith(named.length ? named : everyMoment, [
          ...problems,
          ...tutorialWarnings(tutorial),
          ...visualWarnings(scripts.box),
        ]);
        problems = problemsNow();
      }
      if (problems.length) {
        const named = originOf(momentsNamed(problems));
        if (named.length) {
          this.logger.warn(
            `${who}: moments ${named.join(', ')} ship plain after ${REPAIR_ROUNDS} redos: ${problems.slice(0, 3).join(' ')}`,
          );
          await shipPlain(named);
          problems = problemsNow();
        }
      }
      if (problems.length) {
        this.logger.warn(
          `${who}: ${problems.length} problems left after ${REPAIR_ROUNDS} repairs:\n- ${problems.join('\n- ')}`,
        );
        throw new Error(
          `The scene could not be made sound: ${problems.slice(0, 3).join(' ')}`,
        );
      }

      // The judge looks at a filmstrip of every moment against the
      // director's brief. A moment it sends back goes to the director
      // alone, twice at most; then it ships plain.
      let judged = await this.judge(documentId, tutorial, scripts.box, who);
      for (
        let round = 0;
        judged.redo.length && round < JUDGE_ROUNDS;
        round += 1
      ) {
        const only = judged.redo.map((r) => r.index);
        this.logger.log(
          `${who}: the judge sent back ${only.length} moment(s):\n- ${judged.redo.map((r) => `${r.index + 1}: ${r.note}`).join('\n- ')}`,
        );
        const before = new Map(
          decisions.moments.map((d) => [d.index, decisionKey(d)] as const),
        );
        await redoWith(
          only,
          judged.redo.map((r) => `Moment ${r.index + 1}: ${r.note}`),
        );
        // A moment the director stands by, unchanged, is not asked about
        // again: the judge has had its say and the director its reasons.
        const stood = decisions.moments
          .filter(
            (d) =>
              only.includes(d.index) && before.get(d.index) === decisionKey(d),
          )
          .map((d) => d.index);
        if (stood.length)
          this.logger.log(
            `${who}: the director stood by moment(s) ${stood.map((i) => i + 1).join(', ')}.`,
          );
        problems = problemsNow();
        if (problems.length) {
          const named = originOf(momentsNamed(problems));
          await shipPlain(named.length ? named : only);
          problems = problemsNow();
          if (problems.length)
            throw new Error(
              `The scene could not be made sound after the judge: ${problems.slice(0, 3).join(' ')}`,
            );
        }
        const again = only.filter((i) => !stood.includes(i));
        judged = again.length
          ? await this.judge(documentId, tutorial, scripts.box, who, again)
          : { sheet: judged.sheet, redo: [] };
      }
      if (judged.redo.length) {
        this.logger.warn(
          `${who}: moments ${judged.redo.map((r) => r.index + 1).join(', ')} ship plain after the judge said redo ${JUDGE_ROUNDS} times.`,
        );
        await shipPlain(judged.redo.map((r) => r.index));
        problems = problemsNow();
        if (problems.length)
          throw new Error(
            `The scene could not be made sound: ${problems.slice(0, 3).join(' ')}`,
          );
      }
      const sheet = await this.filmOf(tutorial, scripts.box);
      const plainPositions = tutorial.moments
        .map((m, k) => (m.plain ? k : -1))
        .filter((k) => k >= 0);
      if (plainPositions.length)
        this.logger.warn(
          `${who}: ${plainPositions.length} moment(s) shown as words: ${plainPositions.map((k) => k + 1).join(', ')}`,
        );

      // Voice: the lecture's voice for this document, the sentences as
      // pieces with a breath between them, one file.
      await this.visuals.update(record.id, { step: 'recording' });
      const kept: Pronunciations = doc.props.institutionId
        ? await this.pronunciations.kept(doc.props.institutionId)
        : new Map();
      const script = scripts.box;
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
      await this.storage.put({
        key: `documents/${doc.id}/visuals/v${contentVersion}/p${pageNumber}-${VISUAL_GENERATOR_VERSION}-sheet.png`,
        body: sheet,
        mimeType: 'image/png',
      });
      await this.storage.put({
        key: `documents/${doc.id}/visuals/v${contentVersion}/p${pageNumber}-${VISUAL_GENERATOR_VERSION}-thumb.png`,
        body: await rasterise(
          renderThumb(scripts.box, tutorial.moments, {
            w: STAGES.box.W,
            h: STAGES.box.H,
          }),
          THUMB_WIDTH,
        ),
        mimeType: 'image/png',
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
      // The voice said where each sentence starts when it spoke pieces: the
      // measure is pinned to that, and the guess is built on it.
      const starts = result.pieceStartsMs;
      const estimate = () =>
        estimateVisualWordTimes({
          forms,
          pausesS: pauses,
          durationMs,
          audioKey,
          pieceStartsMs: starts,
        });
      let timing: 'aligned' | 'estimated' = times ? 'aligned' : 'estimated';
      if (times) times = pinWordTimes(times, forms, pauses, durationMs, starts);
      else times = estimate();
      const time = (words: WordTimes, how: 'aligned' | 'estimated') =>
        timeVisual({
          script,
          wide: scripts.wide.elements,
          forms,
          times: words,
          durationMs,
          timing: how,
          plain: plainPositions,
        });
      let timeline = time(times, timing);
      let faults = timingProblems(timeline);
      if (faults.length && timing === 'aligned') {
        // The measure put a beat where it cannot be; the guess pinned to
        // the sentences is used when it does better.
        const guessed = time(estimate(), 'estimated');
        const again = timingProblems(guessed);
        if (again.length < faults.length) {
          this.logger.warn(
            `${who}: ${faults.length} timing faults on the measure, ${again.length} on the estimate; the estimate is kept.`,
          );
          timeline = guessed;
          timing = 'estimated';
          faults = again;
        }
      }
      if (faults.length)
        this.logger.warn(
          `${who}: ${faults.length} timing faults left:\n- ${faults.slice(0, 6).join('\n- ')}`,
        );

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
  /** The filmstrip of every moment, the box staging, as the judge and the admin see it. */
  private async filmOf(
    tutorial: VisualTutorial,
    script: VisualScript,
    positions?: number[],
  ): Promise<Buffer> {
    const svg = renderFilm(
      script,
      tutorial.moments,
      { w: STAGES.box.W, h: STAGES.box.H },
      positions,
    );
    // As wide as its frames: five across a moving moment, three across a still one.
    const across = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? 1128);
    return rasterise(svg, Math.round((across / 1128) * SHEET_WIDTH));
  }

  /**
   * The judge's look at the page, or at the moments named by the
   * narration's index: a filmstrip of each against the director's brief.
   * Back come the moments to redo, each with the judge's note; a
   * drawing that does not look like its name, text in trouble or a
   * crowded card make the note when the judge gave none.
   */
  private async judge(
    documentId: string,
    tutorial: VisualTutorial,
    script: VisualScript,
    who: string,
    only?: number[],
  ): Promise<{ sheet: Buffer; redo: { index: number; note: string }[] }> {
    const positions = tutorial.moments
      .map((m, k) => k)
      .filter((k) => !only || only.includes(tutorial.moments[k].index ?? -1));
    const sheet = await this.filmOf(tutorial, script, positions);
    const moments = positions.map((k) => {
      const m = tutorial.moments[k];
      return {
        moment: k + 1,
        card: m.card,
        drawings: drawingsOf(m),
        shouldSee: m.shouldSee ?? m.intent ?? 'what the sentences say',
        motion: motionLine(m),
      };
    });
    try {
      const judged = await this.llm.visualJudge({
        png: sheet,
        title: tutorial.title,
        moments,
      });
      await this.record(documentId, 'visual_judge', judged.usage);
      const redo: { index: number; note: string }[] = [];
      for (const verdict of judged.value.moments) {
        const m = tutorial.moments[verdict.moment - 1];
        if (
          !m ||
          m.index === undefined ||
          !positions.includes(verdict.moment - 1)
        )
          continue;
        // Only drawings the card claims count; the judge sometimes names one that is not there.
        const claimed = drawingsOf(m).map((d) => d.toLowerCase());
        const wrong = verdict.drawings.filter(
          (d) =>
            !d.looksRight &&
            claimed.some(
              (c) =>
                c.includes(d.name.toLowerCase()) ||
                d.name.toLowerCase().includes(c),
            ),
        );
        const faults = [
          ...wrong.map(
            (d) =>
              `the drawing named "${d.name}" does not look like it${d.wrong ? ` (${d.wrong})` : ''}`,
          ),
          ...(verdict.textTrouble ? [verdict.textTrouble] : []),
          ...(verdict.crowded ? ['the card is crowded'] : []),
          ...(!verdict.showsBrief
            ? ['the picture does not show what a learner should see']
            : []),
        ];
        if (verdict.verdict === 'redo' || faults.length)
          redo.push({
            index: m.index,
            note:
              [verdict.note, ...faults].filter(Boolean).join('; ') || 'redo',
          });
      }
      return { sheet, redo };
    } catch (error) {
      this.logger.warn(
        `${who}: the judge could not look: ${(error as Error).message}`,
      );
      return { sheet, redo: [] };
    }
  }

  /** The tutorial laid out and mended for both stagings: the pane's box and the full screen's wide. */
  private staged(tutorial: VisualTutorial): Record<StagingName, VisualScript> {
    return {
      box: repairVisual(layoutTutorial(tutorial, STAGES.box), STAGES.box),
      wide: repairVisual(layoutTutorial(tutorial, STAGES.wide), STAGES.wide),
    };
  }

  /** What is wrong in either staging, each fault once. */
  private problemsOf(scripts: Record<StagingName, VisualScript>): string[] {
    const warnings = visualWarnings(scripts.box);
    if (warnings.length) this.logger.log(warnings.join(' '));
    return [
      ...new Set([
        ...visualProblems(scripts.box, null),
        ...layoutProblems(scripts.box, STAGES.box),
        ...layoutProblems(scripts.wide, STAGES.wide).map(
          (problem) => `In the wide staging: ${problem}`,
        ),
      ]),
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
    task:
      'visual_plan' | 'visual_narration' | 'visual_director' | 'visual_judge',
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
