import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TEACH_TOOLS,
  type Block,
  type DiagramResponse,
  type Level,
  type VoiceMode,
  type VoiceSessionResponse,
} from '../../../contracts';
import {
  DocumentNotReadyError,
  NotFoundError,
} from '../../domain/errors/errors';
import { UsageMetric } from '../../domain/values';
import { computeMastery, WEAK_THRESHOLD } from '../../domain/learning';
import {
  DEFAULT_LEARNER_PROFILE,
  type AssessmentRepository,
  type LearnerProfileRecord,
  type LearnerProfileRepository,
} from '../../repositories/learning.repository';
import {
  dialInstructions,
  tutorById,
  type Tutor,
} from '../../domain/values/tutors';
import {
  LLM_GATEWAY,
  REALTIME,
  SPEECH,
  STORAGE,
  VECTOR_STORE,
} from '../../ports/tokens';
import type {
  RealtimePort,
  RealtimeTool,
  SpeechPort,
} from '../../ports/voice.port';
import type { LlmGatewayPort } from '../../ports/llm.port';
import type { VectorStorePort } from '../../ports/vector-store.port';
import type { StoragePort } from '../../ports/storage.port';
import {
  AI_CALL_LOG_REPOSITORY,
  ASSESSMENT_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type {
  SummaryRepository,
  TopicRepository,
} from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';

export type AudioLevel = 'original' | Level;

export interface PageAudioRequest {
  userId: string;
  documentId: string;
  level: AudioLevel;
  pageNumber: number;
}

/**
 * Reads one page aloud (original text or a simplified level).
 *
 * Synthesised once per (document version, level, page, voice, model) and kept
 * in storage — audio costs roughly forty times the model call that wrote the
 * text, so a page must never be voiced twice. The cache key carries the voice
 * and model so changing either in config regenerates rather than serving the
 * old voice forever.
 */
@Injectable()
export class PageAudioHandler extends AbstractRequestHandlerTemplate<
  PageAudioRequest,
  { fileRef: string; mimeType: string }
> {
  constructor(
    @Inject(DOCUMENT_PAGE_REPOSITORY)
    private readonly pages: DocumentPageRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(SPEECH) private readonly speech: SpeechPort,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: PageAudioRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    const text = await this.textFor(cmd);
    const voice = this.config.get<string>('AI_TTS_VOICE', 'alloy');
    const model = this.config.get<string>('AI_TTS_MODEL', 'gpt-4o-mini-tts');
    const key =
      `documents/${doc.id}/audio/v${doc.contentVersion}/` +
      `${cmd.level}/${cmd.pageNumber}-${voice}-${model}.mp3`;

    // Cache hit: the file already exists for this exact configuration.
    const cached = await this.storage.size(key).catch(() => null);
    if (cached) {
      return CommandResponse.of({ fileRef: key, mimeType: 'audio/mpeg' });
    }

    const result = await this.speech.synthesize({ text, voice });
    await this.storage.put({
      key,
      body: result.audio,
      mimeType: result.mimeType,
    });

    await this.calls.record({
      documentId: doc.id,
      task: `tts_${cmd.level}`,
      model: `openai:${result.model}`,
      // Speech is priced per character, not per token; recording the input
      // length here keeps the cost ledger answerable for audio too.
      tokensIn: text.length,
      tokensOut: null,
      latencyMs: null,
      outcome: 'ok',
    });

    return CommandResponse.of({ fileRef: key, mimeType: 'audio/mpeg' });
  }

  /** The page's text at the requested level, refusing when there is none. */
  private async textFor(cmd: PageAudioRequest): Promise<string> {
    if (cmd.level === 'original') {
      const page = await this.pages.findOne(cmd.documentId, cmd.pageNumber);
      if (!page) throw new NotFoundError('Page');
      if (page.isEmpty) {
        throw new NotFoundError('Readable text on this page');
      }
      return page.text;
    }

    const page = await this.simplified.find(
      cmd.documentId,
      cmd.level,
      cmd.pageNumber,
    );
    if (!page) throw new NotFoundError('Page');
    if (page.status !== 'done') {
      throw new DocumentNotReadyError(
        "This page hasn't been simplified yet — it can be read aloud once it has",
      );
    }
    if (!page.blocks?.length) {
      // A figure-only page: recorded done with nothing to say.
      throw new NotFoundError('Readable text on this page');
    }
    return blocksToProse(page.blocks);
  }
}

/**
 * Blocks are written for the eye; this rewrites them for the ear. Headings get
 * a beat after them and bullets become plain sentences — reading "bullet"
 * punctuation aloud is what makes TTS sound like a screen reader.
 */
export function blocksToProse(blocks: Block[]): string {
  return blocks
    .map((block) => {
      const text = block.text.trim().replace(/\s+/g, ' ');
      if (!text) return '';
      const ended = /[.!?:]$/.test(text) ? text : `${text}.`;
      return block.type === 'headingOne' || block.type === 'headingTwo'
        ? `${ended}\n`
        : ended;
    })
    .filter(Boolean)
    .join('\n');
}

export interface VoiceSessionRequest {
  userId: string;
  documentId: string;
  pageNumber: number;
  mode: VoiceMode;
  /** Which tutor runs the lesson; defaults to the roster's first. */
  tutorId?: string;
}

/**
 * The teach-mode toolbox. Parameters are JSON Schema; execution happens in the
 * browser, because every one of these is a UI action.
 */
const TEACHING_TOOLS: RealtimeTool[] = [
  {
    name: TEACH_TOOLS.GO_TO_PAGE,
    description:
      "Turn the student's reader to a page. Use it every time you move to " +
      'material on a different page, so they always see what you are teaching.',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, description: 'The page number' },
      },
      required: ['page'],
    },
  },
  {
    name: TEACH_TOOLS.SHOW_IMAGES,
    description:
      'Search the web for a diagram or illustration and show it to the ' +
      'student. Use for anatomy, apparatus, structures — things words are bad at.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Short image search query, at most 8 words',
        },
      },
      required: ['query'],
    },
  },
  {
    name: TEACH_TOOLS.DRAW_DIAGRAM,
    description:
      "Sketch a flowchart on the student's board to lay out a process, " +
      'pathway, cycle or hierarchy from the document. One concept per diagram.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'What to draw, in one sentence, e.g. "thyroid hormone synthesis as a flowchart"',
        },
      },
      required: ['description'],
    },
  },
  {
    name: TEACH_TOOLS.FOCUS_BOARD,
    description:
      'Expand a board item to fill the screen while you teach from it, or ' +
      'put it away again. A newly drawn diagram expands on its own; call ' +
      "this with action 'close' when you finish walking through it, or with " +
      "action 'expand' and a title to bring back something from earlier.",
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['expand', 'close'] },
        title: {
          type: 'string',
          description:
            'Which item, by (part of) its title. Omit for the newest one.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: TEACH_TOOLS.ASK_QUIZ,
    description:
      'Put a multiple-choice question on the screen and wait for the tap. ' +
      'Use it to check understanding right after teaching something. The tool ' +
      'result is the authoritative answer — if the student answers aloud ' +
      'first, acknowledge it but wait for the result before judging.',
    parameters: {
      type: 'object',
      properties: {
        topicId: {
          type: 'string',
          description: 'The lesson-plan id of the topic this checks',
        },
        question: { type: 'string' },
        options: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: 'Answer choices, one correct',
        },
        correctIndex: { type: 'integer', minimum: 0 },
        explanation: {
          type: 'string',
          description: 'One sentence on why the right answer is right',
        },
      },
      required: ['question', 'options', 'correctIndex'],
    },
  },
  {
    name: TEACH_TOOLS.ASK_FLASHCARD,
    description:
      'Put a flashcard on the screen: a prompt on the front, the answer on ' +
      'the back. The student recalls, flips, and grades themself. Good for ' +
      'terms and definitions.',
    parameters: {
      type: 'object',
      properties: {
        topicId: { type: 'string' },
        front: { type: 'string', description: 'The prompt side' },
        back: { type: 'string', description: 'The answer side' },
      },
      required: ['front', 'back'],
    },
  },
  {
    name: TEACH_TOOLS.REPORT_UNDERSTANDING,
    description:
      'Record your own read of how well the student understands the current ' +
      'topic, from what they say and how they answer. Call it at least once ' +
      'per topic, before marking it complete.',
    parameters: {
      type: 'object',
      properties: {
        topicId: { type: 'string' },
        rating: {
          type: 'integer',
          minimum: 1,
          maximum: 5,
          description: '1 = lost, 5 = solid',
        },
        note: {
          type: 'string',
          description: 'One short observation, under 120 characters',
        },
      },
      required: ['topicId', 'rating'],
    },
  },
  {
    name: TEACH_TOOLS.UPDATE_LEARNER_PROFILE,
    description:
      'Adjust how you teach this student — permanently, across sessions. ' +
      'Call it when you notice a mismatch: they need it slower or faster, ' +
      'broken down more, more or less interactive, or you learn what works ' +
      'for them. Changes take effect within this lesson.',
    parameters: {
      type: 'object',
      properties: {
        pace: { type: 'string', enum: ['slower', 'steady', 'faster'] },
        depth: { type: 'string', enum: ['lighter', 'standard', 'deeper'] },
        interactivity: { type: 'string', enum: ['less', 'standard', 'more'] },
        note: {
          type: 'string',
          description:
            'What you learned about how they learn, under 200 characters',
        },
      },
    },
  },
  {
    name: TEACH_TOOLS.MARK_TOPIC_COMPLETE,
    description:
      'Record that the current topic has been taught and understood, before ' +
      'moving to the next one.',
    parameters: {
      type: 'object',
      properties: {
        topicId: {
          type: 'string',
          description: 'The id of the finished topic',
        },
      },
      required: ['topicId'],
    },
  },
];

/**
 * Starts a live voice conversation about the document (§8, spoken).
 *
 * The server's part is deliberately small: check access, spend the allowance,
 * compose the tutor's instructions, and mint a short-lived key. The audio
 * itself flows browser ↔ provider directly over WebRTC, so a conversation
 * costs this server nothing in bandwidth and the real API key never leaves it.
 *
 * The base instructions come back to the client too: page context is appended
 * client-side as the reader moves, and a `session.update` replaces the whole
 * instruction string, so the client must be able to reconstruct it.
 */
@Injectable()
export class StartVoiceSessionHandler extends AbstractRequestHandlerTemplate<
  VoiceSessionRequest,
  VoiceSessionResponse
> {
  constructor(
    @Inject(REALTIME) private readonly realtime: RealtimePort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
  ) {
    super();
  }

  protected async handleRequest(cmd: VoiceSessionRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    // A conversation is a run of highlight-grade model calls, so it draws on
    // the same daily allowance — one unit per session, not per exchange.
    await this.entitlements.consume(
      cmd.userId,
      UsageMetric.HIGHLIGHT_ACTIONS,
      (e) => e.assertCanUseHighlight(),
    );

    const summary = await this.summaries.find(doc.id);
    const tutor = tutorById(cmd.tutorId);
    const baseInstructions =
      cmd.mode === 'teach'
        ? await this.teachInstructions(
            doc.id,
            doc.props.title,
            summary,
            cmd.userId,
            tutor,
          )
        : this.chatInstructions(doc.props.title, summary);

    const session = await this.realtime.createSession({
      instructions: baseInstructions,
      tools: cmd.mode === 'teach' ? TEACHING_TOOLS : undefined,
      // The tutor's voice; chat mode keeps the configured default.
      voice: cmd.mode === 'teach' ? tutor.voice : undefined,
    });

    await this.calls.record({
      documentId: doc.id,
      task: cmd.mode === 'teach' ? 'teach_session' : 'voice_session',
      model: `openai:${session.model}`,
      tokensIn: null,
      tokensOut: null,
      latencyMs: null,
      outcome: 'ok',
    });

    return CommandResponse.of({
      clientSecret: session.clientSecret,
      model: session.model,
      expiresAt: session.expiresAt,
      baseInstructions,
    });
  }

  private chatInstructions(title: string, summary: string | null): string {
    return [
      `You are a patient study tutor discussing the document "${title}" with a student, out loud.`,
      summary ? `What the document covers:\n${summary}` : null,
      'Ground every answer in this document. If it does not cover something, say so plainly rather than answering from general knowledge.',
      'Keep technical terms, names and numbers exactly as the document uses them — the student is being examined on them — and explain them in plain words alongside.',
      'This is speech: answer in short, plain sentences, a few at a time. No lists, no headings, no markdown. Pause naturally rather than lecturing.',
      'The text of the page the student is currently reading is appended below. When they say "this page" or "here", that is what they mean.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * The lesson plan is the topics table: ordered, titled, page-ranged. Read
   * state is included so a dropped or resumed session picks up at the first
   * untaught topic instead of starting the lecture over — progress lives in
   * the database, not in the session.
   */
  private async teachInstructions(
    documentId: string,
    title: string,
    summary: string | null,
    userId: string,
    tutor: Tutor,
  ): Promise<string> {
    const [topics, events, profile] = await Promise.all([
      this.topics.listWithReadState(documentId, userId),
      this.assessments.recent(userId, documentId, 200),
      this.profiles.find(userId),
    ]);

    const mastery = computeMastery(
      events,
      topics.map((topic) => topic.id),
    );
    const masteryById = new Map(mastery.map((entry) => [entry.topicId, entry]));

    const syllabus = topics.length
      ? topics
          .map((topic, index) => {
            const entry = masteryById.get(topic.id);
            const score =
              entry?.score != null
                ? entry.score < WEAK_THRESHOLD
                  ? ` (scored ${entry.score}% — RE-TEACH this from a different angle than before)`
                  : ` (understood: ${entry.score}%)`
                : '';
            const taught = topic.isRead ? ' (already taught)' : '';
            return `${index + 1}. [id: ${topic.id}] "${topic.title}" — pages ${topic.startPage}-${topic.endPage}${taught}${score}`;
          })
          .join('\n')
      : '(No topic outline exists; teach the document page by page instead.)';

    return [
      `You are giving a live spoken lesson on the document "${title}". The student sees their reader; you are in control of it.`,
      `${tutor.persona}\n\nYour teaching style:\n${dialInstructions(tutor.dials)}`,
      summary ? `What the document covers:\n${summary}` : null,
      `The lesson plan, in order:\n${syllabus}`,
      [
        'How to run the lesson:',
        '- Start with a one-breath overview of where you are in the plan, then teach the first topic not marked "already taught".',
        `- When you begin a topic, call ${TEACH_TOOLS.GO_TO_PAGE} with its first page. As you move through its material, keep turning pages with ${TEACH_TOOLS.GO_TO_PAGE} so the student is always looking at what you are explaining.`,
        '- Teach in short spoken stretches — under a minute — then ask the student something: to say it back, to guess the next step, whether it makes sense. This is a conversation, not a lecture.',
        `- When a structure or apparatus is easier seen than said, call ${TEACH_TOOLS.SHOW_IMAGES}. When a process, pathway or hierarchy needs laying out, call ${TEACH_TOOLS.DRAW_DIAGRAM} and then talk the student through what is on the board.`,
        `- A newly drawn diagram fills the screen on its own. Teach from it node by node while it is large, then call ${TEACH_TOOLS.FOCUS_BOARD} with action "close" before moving on. Turning the page also puts it away. Bring anything back later with action "expand" and its title.`,
        `- When the student has understood a topic, call ${TEACH_TOOLS.MARK_TOPIC_COMPLETE} with its id, then move to the next.`,
        '- If the student asks to skip, slow down, go back, or dig into something, follow them — the plan serves the student.',
        '- After every tool call, keep talking; never leave silence while something appears on screen.',
        `- Check understanding with ${TEACH_TOOLS.ASK_QUIZ} after each concept cluster and ${TEACH_TOOLS.ASK_FLASHCARD} for key terms. The tool result is the authoritative answer. When they get one wrong, re-teach that piece before moving on.`,
        `- Before ${TEACH_TOOLS.MARK_TOPIC_COMPLETE}, call ${TEACH_TOOLS.REPORT_UNDERSTANDING} with your honest 1-5 read of the student on that topic.`,
        `- When you notice how this student learns — too fast, needs smaller steps, lights up at examples — call ${TEACH_TOOLS.UPDATE_LEARNER_PROFILE}. It changes how every future lesson is taught, including the rest of this one.`,
      ].join('\n'),
      profileInstructions(profile ?? DEFAULT_LEARNER_PROFILE),
      'Ground everything in this document. Keep technical terms, names and numbers exactly as it writes them — the student is examined on them — and explain each in plain words when it first appears.',
      'This is speech: short, plain sentences. No lists, no headings, no markdown in what you say.',
      'The text of the page currently on screen is appended below and refreshes as pages turn.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}

export interface DrawDiagramRequest {
  userId: string;
  documentId: string;
  description: string;
}

/**
 * A grounded diagram for the lesson board.
 *
 * The voice model only says what to draw; the drawing itself is done here by a
 * cheap text model over retrieved passages. That split is deliberate: realtime
 * tokens cost an order of magnitude more than text tokens, and a diagram built
 * from the document's own passages can't invent steps the way one built from
 * the voice model's memory of the conversation could.
 */
@Injectable()
export class DrawDiagramHandler extends AbstractRequestHandlerTemplate<
  DrawDiagramRequest,
  DiagramResponse
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(VECTOR_STORE) private readonly vectors: VectorStorePort,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: DrawDiagramRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const summary = await this.summaries.find(cmd.documentId);

    // Same retrieval as the highlight actions: passages near the concept.
    const [embedding] = (await this.llm.embed({ texts: [cmd.description] }))
      .value;
    const chunks = await this.vectors.query({
      documentId: cmd.documentId,
      embedding,
      topK: 6,
    });
    const context = chunks
      .map((chunk) => `[p.${chunk.pageNumber}] ${chunk.text}`)
      .join('\n\n');

    const result = await this.llm.drawDiagram({
      description: cmd.description,
      context,
      summary,
    });

    await this.calls.record({
      documentId: cmd.documentId,
      task: 'diagram',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });

    return CommandResponse.of(result.value);
  }
}

/**
 * The learner profile, written as standing orders. This block is what the
 * adaptive loop actually changes: the tutor's own tool calls and the
 * auto-adjust reflex both end up here, on the next session and — because the
 * client re-sends instructions on every page turn — within the current one.
 */
export function profileInstructions(profile: LearnerProfileRecord): string {
  const pace = {
    slower:
      'Go slower than you naturally would: smaller pieces, one at a time, repeat the key point in different words.',
    steady: 'Keep a steady, natural pace.',
    faster: 'This student moves quickly — keep it tight and skip the padding.',
  }[profile.pace];

  const depth = {
    lighter: 'Stay at main ideas; only unpack when they ask.',
    standard: 'Unpack concepts normally.',
    deeper:
      'Break everything further down than feels necessary; assume gaps in the foundations.',
  }[profile.depth];

  const interactivity = {
    less: 'Check in sparingly — this student prefers to listen.',
    standard: 'Check in regularly.',
    more: 'Quiz and question constantly — this student learns by doing.',
  }[profile.interactivity];

  return [
    'How THIS student learns (apply it, it overrides your default style):',
    `- ${pace}`,
    `- ${depth}`,
    `- ${interactivity}`,
    profile.styleNotes ? `- Observed: ${profile.styleNotes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
