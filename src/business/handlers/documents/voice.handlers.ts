import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type LectureStyle,
  TEACH_TOOLS,
  type Block,
  type LessonIntent,
  type ComputeResponse,
  type DiagramCheckResponse,
  type DiagramResponse,
  type Level,
  type SketchResponse,
  type VoiceMode,
  type VoiceSessionResponse,
  LECTURE_TOOLS,
} from '../../../contracts';
import {
  DocumentNotReadyError,
  NotFoundError,
} from '../../domain/errors/errors';
import {
  computeCalibration,
  computeMastery,
  MIN_CALIBRATION_EVENTS,
  openMissedIdeas,
  WEAK_THRESHOLD,
} from '../../domain/learning';
import {
  DEFAULT_LEARNER_PROFILE,
  type DocumentLearningStateRepository,
  type ProfileChangeRecord,
  type ProfileChangeRepository,
  type AssessmentRepository,
  type LearnerProfileRepository,
} from '../../repositories/learning.repository';
import {
  dialInstructions,
  tutorById,
  type Tutor,
} from '../../domain/values/tutors';
import { profileInstructions } from '../../domain/values/learner-profile';
import { effectiveProfile } from '../../domain/learning';
import { describeChange } from '../../domain/values/profile-changes';
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
  LECTURE_REPOSITORY,
  PROFILE_CHANGE_REPOSITORY,
  AI_CALL_LOG_REPOSITORY,
  ASSESSMENT_REPOSITORY,
  DOCUMENT_PAGE_REPOSITORY,
  DOCUMENT_LEARNING_STATE_REPOSITORY,
  LEARNER_PROFILE_REPOSITORY,
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../repositories/tokens';
import type { AiCallLogRepository } from '../../repositories/ai-call-log.repository';
import type {
  LectureRepository,
  LectureSegmentRecord,
} from '../../repositories/lecture.repository';
import type { DocumentPageRepository } from '../../repositories/document-page.repository';
import type {
  SummaryRepository,
  TopicRepository,
} from '../../repositories/misc.repository';
import type { SimplifiedPageRepository } from '../../repositories/simplified-page.repository';
import AbstractRequestHandlerTemplate from '../AbstractRequestHandlerTemplate';
import { CommandResponse } from '../response/CommandResponse';
import { ComputeService } from './compute.service';
import { ElevenLabsRealtimeAdapter } from '../../../web/adapters/elevenlabs-voice.adapters';
import { DocumentAccessService } from './document-access.service';
import { EntitlementsService } from './entitlements.service';
import {
  DEFAULT_LECTURE_STYLE,
  KIND_RANK,
  beatFor,
  scriptForTts,
  type LecturePlan,
} from '../../domain/lecture';
import { noteLevelFor, noteUnits } from '../../domain/follow';
import {
  ASK_HEARD_CHARS,
  askInstructions,
  askSpeed,
  pageFigures,
} from '../../domain/ask';
import { sentenceIndexAtMs, type WordTimes } from '../../domain/board';

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
        "This page hasn't been simplified yet. It can be read aloud once it has",
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
  /** A topic the student asked to go over again; the lesson starts there. */
  revisitTopicId?: string;
  /** What the student said they want from today's session. */
  intent?: LessonIntent;
  /** Where the lecture tape was when the student pressed the mic. */
  lectureContext?: {
    pageNumber: number;
    offsetMs: number;
    /** The style being listened to, so the tutor knows what was said. */
    style?: LectureStyle;
    /** Which piece of the page the offset is in; omitted means the page. */
    kind?: 'page' | 'part';
    /** What the tutor drew on the board in earlier questions, one line each. Ignored now the board is hidden. */
    ink?: string[];
    /** The note block and sentence the highlight was on when the mic was pressed. */
    block?: number;
    sentence?: number | null;
    /** The note level the learner is reading. */
    noteLevel?: Level;
    /** The conversation so far, when a dropped session is being resumed: the tutor must still remember. */
    conversation?: { role: 'learner' | 'tutor'; text: string }[];
    /** What is on the tutor's board for this page, one line per item, when a session is made again or woken. */
    board?: string[];
    /** The client plays a recorded invitation at the press, so the tutor must not speak first. */
    invited?: boolean;
    /** The lecture is interactive: the tutor runs the chapter's beats when told to, and may file the learner's questions. */
    interactive?: boolean;
  };
}

/**
 * The session intents, spoken back to the tutor in the student's own
 * words. Chosen on the lesson screen; each also sets the pace and
 * check-in dials, but the sentence carries the WHY those numbers
 * cannot.
 */
const INTENT_LINES: Record<LessonIntent, string> = {
  quick:
    'Today the student told you how they learn: "I\'m a quick learner." ' +
    'Teach accordingly: pose the problem a topic solves before you give ' +
    'its principle, and give them a beat to attempt it; prompt them to ' +
    'explain a step themselves rather than explaining it to them; fewer, ' +
    'harder checks; never define a term the lesson has already used; a ' +
    'brisk pace, the briefest opening, no detours; and step up the moment ' +
    'they answer fluently.',
  thorough:
    'Today the student told you how they learn: "I learn at a normal ' +
    'pace." Give each idea the room it needs, open with review, check ' +
    'after each point, hint before you tell, and end on retrieval.',
  gentle:
    'Today the student told you how they learn: "I learn slowly." Teach ' +
    'the words first, one step at a time, walk one worked example all the ' +
    'way through, tell them plainly and then have them say it back, say ' +
    'the key idea a second way, check often with questions they can ' +
    'answer, correct at once, and never move past confusion. Warm and ' +
    'patient, but do not praise the person: name what they got right. ' +
    'SPEAK SLOWLY: noticeably slower than everyday speech, a beat of ' +
    'silence after every sentence, and never a rush through a term; they ' +
    'are taking each idea in as you say it.',
};

/**
 * The teach-mode toolbox. Parameters are JSON Schema; execution happens in the
 * browser, because every one of these is a UI action.
 */
/**
 * The interactive session's own tools: every verdict the tutor gives is
 * filed here so the ledger is written; and a check item can be put on
 * the sheet as choices to tap or a sentence with a gap.
 */
export const FILE_VERDICT_TOOL: RealtimeTool = {
  name: LECTURE_TOOLS.VERDICT,
  description:
    'File the verdict you just gave on what the learner said, the moment ' +
    'you give it: once per answer, during the beats only. The client ' +
    'records it; nothing else does.',
  parameters: {
    type: 'object',
    properties: {
      beat: {
        type: 'string',
        enum: ['recall', 'answers', 'check'],
        description: 'Which beat the answer belongs to',
      },
      question: {
        type: 'string',
        description:
          'The question asked, word for word; "recall" for the chapter from memory',
      },
      answer: {
        type: 'string',
        description:
          'What the learner said, as you heard it, a sentence or two',
      },
      verdict: {
        type: 'string',
        enum: ['had it', 'partly', 'missed'],
      },
      missing: {
        type: 'string',
        description:
          'What was left out or wrong, in one line; empty when nothing',
      },
      page: {
        type: 'integer',
        description: 'Where the chapter has it, when you know',
      },
    },
    required: ['beat', 'question', 'answer', 'verdict'],
  },
};

export const SHOW_CHOICES_TOOL: RealtimeTool = {
  name: LECTURE_TOOLS.CHOICES,
  description:
    'Put a check item on the sheet as choices to tap: the question and two ' +
    'to four options. Do not read the options aloud; say nothing until ' +
    'their choice comes back as their turn. During the check only.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 4,
        description: 'Each at most twelve words',
      },
    },
    required: ['question', 'options'],
  },
};

export const SHOW_BLANK_TOOL: RealtimeTool = {
  name: LECTURE_TOOLS.BLANK,
  description:
    'Put a sentence from the chapter on the sheet with one part missing, ' +
    'marked ___; the learner says the missing part aloud and you judge what ' +
    'you hear. During the check only.',
  parameters: {
    type: 'object',
    properties: {
      sentence: {
        type: 'string',
        description: 'The sentence with exactly one ___ where the gap is',
      },
      answer: { type: 'string', description: 'What fills the gap' },
    },
    required: ['sentence', 'answer'],
  },
};

/** The interactive session's tools, beside the board's. */
export const INTERACTIVE_TOOLS: RealtimeTool[] = [
  FILE_VERDICT_TOOL,
  SHOW_CHOICES_TOOL,
  SHOW_BLANK_TOOL,
];

/** The question-filing tool, on its own, for the interactive lecture's beats. */
export const SAVE_QUESTION_TOOL: RealtimeTool = {
  name: TEACH_TOOLS.SAVE_QUESTION,
  description:
    'File one question the learner wants the chapter to answer, in their ' +
    'words, restated as one clear question. Call once per question, the ' +
    'moment they have said it. Only during the beat that asks for their ' +
    'questions.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: "The learner's question, in their own words",
      },
      topicId: {
        type: 'string',
        description: 'The chapter id you were given for this beat',
      },
    },
    required: ['question', 'topicId'],
  },
};

/** What a tutor answering mid-lecture may do to the board; see LECTURE_TOOLS. */
export const LECTURE_BOARD_TOOLS: RealtimeTool[] = [
  {
    name: LECTURE_TOOLS.SHOW,
    description:
      "Bring the whiteboard up on the learner's screen. Call it before the first thing you write; writing brings it up too.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: LECTURE_TOOLS.WRITE,
    description:
      'Write one item on the board. Returns once the pen has finished, with the board as it now stands and the ids of its items.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['heading', 'term', 'point', 'figure'],
          description:
            'heading: four words at the top. term: a technical term, with meaning. point: a short line, six words. figure: a formula or number, twelve words.',
        },
        text: { type: 'string', description: 'What is written' },
        meaning: {
          type: 'string',
          description: 'For a term: its plain meaning in a few words',
        },
        under: {
          type: 'string',
          description:
            'For a point: the id of the item it belongs under, written indented',
        },
      },
      required: ['kind', 'text'],
    },
  },
  {
    name: LECTURE_TOOLS.ARROW,
    description:
      'Join two items on the board with an arrow, optionally labelled. Returns once drawn.',
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'The id of the item it starts at',
        },
        to: { type: 'string', description: 'The id of the item it points to' },
        label: { type: 'string', description: 'Three words at most' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: LECTURE_TOOLS.CUE,
    description:
      'Mark an item the learner should look at, outside a walk-through: an underline, circle, box or highlight. While you explain a board, do not call this; the marking follows your words.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id of the item' },
        shape: {
          type: 'string',
          enum: ['underline', 'circle', 'box', 'highlight'],
        },
      },
      required: ['id', 'shape'],
    },
  },
  {
    name: LECTURE_TOOLS.NEW,
    description:
      'Start a fresh board with a heading, when the thought changes or the board is full. The old board is kept off to the side.',
    parameters: {
      type: 'object',
      properties: {
        heading: { type: 'string', description: 'Four words at most' },
      },
      required: ['heading'],
    },
  },
  {
    name: LECTURE_TOOLS.DIAGRAM,
    description:
      'Draw a diagram from the book: a process, a structure or a comparison, eight parts at most. Returns at once with what to say while it builds; you are told when it is on the board, or that it could not be drawn.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'What the diagram should show, twelve words at most',
        },
      },
      required: ['description'],
    },
  },
  {
    name: LECTURE_TOOLS.REST,
    description:
      'Put the board away, once they have said it is clear and want to keep talking without it. The board is kept and comes back if you draw again.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: LECTURE_TOOLS.FIND,
    description:
      'Search the whole book. Returns up to six passages with their page numbers, for you to read, not to recite. Use it when the question reaches beyond this page, and always before saying the book does not cover something.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to look for, in a few words',
        },
      },
      required: ['query'],
    },
  },
  {
    name: LECTURE_TOOLS.RESUME,
    description:
      'The conversation is over by their say-so: hand back to the lecture. Call it only after your closing line.',
    parameters: { type: 'object', properties: {} },
  },
];

export const TEACHING_TOOLS: RealtimeTool[] = [
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
    name: TEACH_TOOLS.REVEAL_POINT,
    description:
      "Write the next point onto the student's page. Every page starts blank " +
      'for the student; its numbered points appear as you reveal them, ' +
      "building up like writing on a board. Call this with a point's number " +
      'just before you start explaining that point. The screen advances at ' +
      'most ONE point per call, and the RESULT tells you the exact text now ' +
      'showing — trust the result, not your intention: it is the truth of ' +
      'what the student can see. Never explain a point the result has not ' +
      'confirmed, and never announce that you are revealing anything. A ' +
      'call can be REFUSED (an error result) when the last revealed point ' +
      'has not been taught aloud yet — then the screen has NOT moved: ' +
      'keep teaching what is already showing. And a call made while your ' +
      'voice is still playing returns prefetched: the point is fetched ' +
      'for you but NOT on the page yet; stay silent until a note tells ' +
      'you to teach it — it appears on the page just as you introduce it ' +
      'aloud.',
    parameters: {
      type: 'object',
      properties: {
        upTo: {
          type: 'integer',
          minimum: 1,
          description: "Show the page's points 1 through this number",
        },
      },
      required: ['upTo'],
    },
  },
  {
    name: TEACH_TOOLS.END_LESSON,
    description:
      'End the lesson. Call this only after you have wrapped up out loud — ' +
      'recapped what was covered and said goodbye — when every topic is ' +
      'taught, or the session you were asked for is complete, or the ' +
      'student says they are done. The student sees their session report.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: TEACH_TOOLS.CHECK_PREREQUISITES,
    description:
      'What this chapter assumes the student already knows, minus anything ' +
      'already resolved. Call it before starting each topic. Raise what it ' +
      'returns conversationally — one question in passing, never a checklist ' +
      '— and let their answer decide whether to bridge it.',
    parameters: {
      type: 'object',
      properties: {
        topicId: {
          type: 'string',
          description: 'The lesson-plan id of the topic about to start',
        },
      },
      required: ['topicId'],
    },
  },
  {
    name: TEACH_TOOLS.TEACH_PREREQUISITE,
    description:
      'Record that you just taught a missing building block. Call it AFTER ' +
      'the detour, not before — it marks the concept as understood, so it ' +
      'stops being asked about anywhere. A detour is a short bridge of a ' +
      'minute or so that returns to the chapter, never a sub-lesson, and at ' +
      'most two per chapter.',
    parameters: {
      type: 'object',
      properties: {
        concept: {
          type: 'string',
          description: 'The concept exactly as check_prerequisites named it',
        },
      },
      required: ['concept'],
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
      "Draw boxes-and-arrows ideas on the student's board: a flowchart for " +
      'a process, a sequence diagram for interactions between parties, a ' +
      'state diagram for modes and transitions, a timeline for history, a ' +
      "pie for proportions, a mindmap for a concept's parts. One concept " +
      'per diagram. Not for pictures of things — use draw_sketch for those. ' +
      'Draw on your own initiative whenever an idea has shape — never wait ' +
      'to be asked, and never announce that you are about to draw.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'What to draw and the shape that fits, in one sentence, e.g. ' +
            '"the request path from browser to database, as a sequence diagram"',
        },
      },
      required: ['description'],
    },
  },
  {
    name: TEACH_TOOLS.SKETCH,
    description:
      "Draw a picture of a thing on the student's board: anatomy, " +
      'apparatus, spatial layouts, annotated curves, number lines — a ' +
      'labelled sketch of how something looks or is arranged. Not for ' +
      'flows, sequences or hierarchies — use draw_diagram for those. Sketch ' +
      'on your own initiative — never wait to be asked.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'What to sketch and which parts to label, in one sentence, e.g. ' +
            '"the eye in cross-section with the lens and retina labelled"',
        },
      },
      required: ['description'],
    },
  },
  {
    name: TEACH_TOOLS.COMPUTE,
    description:
      'Evaluate a numeric expression exactly. Use for ANY arithmetic you ' +
      'are about to say aloud — never do arithmetic yourself. Returns the ' +
      'verified result; then explain it.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description:
            'The expression in mathjs syntax, e.g. "86400 * 10e6" or ' +
            '"150 ug/kg * 70 kg"',
        },
        scope: {
          type: 'object',
          description:
            'Optional variable values used by the expression, name to number',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['expression'],
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
        action: {
          type: 'string',
          enum: ['expand', 'close'],
          description:
            '"expand" brings an item up large; "close" puts the board away',
        },
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
    name: TEACH_TOOLS.SAVE_QUESTION,
    description:
      'File one question the student just posed about the current topic, in ' +
      'their words. Call once per question, at the moment they ask it. Their ' +
      'questions are the backbone of the topic: return to each at the end ' +
      'and have them answer it.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: "The student's question, in their own words",
        },
        topicId: {
          type: 'string',
          description: 'The lesson-plan id of the topic it belongs to',
        },
      },
      required: ['question', 'topicId'],
    },
  },
  {
    name: TEACH_TOOLS.RECALL,
    description:
      "Take the page away for a memory check ('start'), or bring it back " +
      "('end'). While the page is away the student reconstructs the ideas " +
      'from memory — the strongest form of practice. Never announce the ' +
      'mechanics; just ask for the ideas back.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'end'],
          description:
            '"start" takes the page away; "end" brings it back for correction',
        },
      },
      required: ['action'],
    },
  },
  {
    name: TEACH_TOOLS.ASK_DIAGRAM,
    description:
      'A visual check: the board shows the concept as a diagram with one ' +
      'part missing, and the student names it. Use after teaching something ' +
      'with shape — a process, pathway or hierarchy. The tool result is the ' +
      'authoritative answer; when they miss it, re-teach that piece.',
    parameters: {
      type: 'object',
      properties: {
        topicId: {
          type: 'string',
          description: 'The lesson-plan id of the topic this checks',
        },
        description: {
          type: 'string',
          description:
            'What to diagram and which part to blank, in one sentence',
        },
      },
      required: ['topicId', 'description'],
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
        question: {
          type: 'string',
          description: 'The question, as you would say it aloud',
        },
        options: {
          type: 'array',
          items: { type: 'string', description: 'One answer choice' },
          minItems: 2,
          maxItems: 4,
          description: 'Answer choices, one correct',
        },
        correctIndex: {
          type: 'integer',
          minimum: 0,
          description: 'Zero-based index of the correct option',
        },
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
        topicId: {
          type: 'string',
          description: 'The lesson-plan id of the topic this checks',
        },
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
        topicId: {
          type: 'string',
          description: 'The lesson-plan id of the topic being rated',
        },
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
        pace: {
          type: 'string',
          enum: ['slower', 'steady', 'faster'],
          description: 'How quickly to move through material',
        },
        depth: {
          type: 'string',
          enum: ['lighter', 'standard', 'deeper'],
          description: 'How far to decompose ideas',
        },
        interactivity: {
          type: 'string',
          enum: ['less', 'standard', 'more'],
          description: 'How often to turn the lesson back on the student',
        },
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
    private readonly elevenlabs: ElevenLabsRealtimeAdapter,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(LECTURE_REPOSITORY)
    private readonly lectures: LectureRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessments: AssessmentRepository,
    @Inject(DOCUMENT_LEARNING_STATE_REPOSITORY)
    private readonly docStates: DocumentLearningStateRepository,
    @Inject(LEARNER_PROFILE_REPOSITORY)
    private readonly profiles: LearnerProfileRepository,
    @Inject(PROFILE_CHANGE_REPOSITORY)
    private readonly profileChanges: ProfileChangeRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    private readonly access: DocumentAccessService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  protected async handleRequest(cmd: VoiceSessionRequest) {
    const doc = await this.access.require(cmd.documentId, cmd.userId);

    // Live voice spends the wallet, not the study clock: the client banks
    // the minutes through the voice heartbeat while the call runs.
    const entitlements = await this.entitlements.forUser(cmd.userId);
    entitlements.assertVoiceAvailable(60);

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
            cmd.pageNumber,
            cmd.revisitTopicId,
            cmd.intent,
          )
        : cmd.mode === 'lecture'
          ? await this.lectureInstructions(doc, summary, tutor, cmd)
          : this.chatInstructions(doc.props.title, summary);
    const lectureStyle = cmd.lectureContext?.style ?? DEFAULT_LECTURE_STYLE;

    // Told once: the moment a session carrying the narration exists, the
    // changes are spent. If the model skips the sentence, the settings screen
    // still shows them — we do not build receipt-confirmation for one line.
    if (cmd.mode === 'teach') {
      await this.markNarrated(cmd.userId).catch(() => undefined);
    }

    // The provider rides on the tutor. A tutor voiced by ElevenLabs runs
    // the lesson there; without an API key they fall back to their OpenAI
    // voice so the roster keeps working in dev. Chat mode has no tutor and
    // stays on the configured OpenAI default.
    const wantsElevenLabs =
      cmd.mode === 'teach' && tutor.voice.provider === 'elevenlabs';
    const useElevenLabs = wantsElevenLabs && this.elevenlabs.isConfigured();
    if (wantsElevenLabs && !useElevenLabs) {
      this.logger.warn(
        `Tutor ${tutor.id} is voiced by ElevenLabs but ELEVENLABS_API_KEY is not set — falling back to OpenAI (${tutor.voice.openaiFallback})`,
      );
    }

    const session = useElevenLabs
      ? await this.elevenlabs.createSession({
          instructions: baseInstructions,
          tools: TEACHING_TOOLS,
          voice: tutor.voice.voiceId,
        })
      : await this.realtime.createSession({
          instructions: baseInstructions,
          tools:
            cmd.mode === 'teach'
              ? TEACHING_TOOLS
              : cmd.mode === 'lecture'
                ? cmd.lectureContext?.interactive
                  ? [
                      ...LECTURE_BOARD_TOOLS,
                      SAVE_QUESTION_TOOL,
                      ...INTERACTIVE_TOOLS,
                    ]
                  : LECTURE_BOARD_TOOLS
                : undefined,
          // The tutor's voice; chat mode keeps the configured default. A
          // question asked mid-lecture takes the answering voice, cedar
          // unless configured otherwise: the lecture's own engine has no
          // such voice, so the same teacher is carried by the name on
          // screen and the persona, not by an exact match.
          voice:
            cmd.mode === 'teach'
              ? tutor.voice.provider === 'openai'
                ? tutor.voice.voiceId
                : tutor.voice.openaiFallback
              : cmd.mode === 'lecture'
                ? this.config.get<string>('AI_LECTURE_ASK_VOICE', 'cedar')
                : undefined,
          // Mid-lecture the learner holds the mic: the client commits every
          // turn, the room never ends one, and the pace follows the style.
          ...(cmd.mode === 'lecture'
            ? {
                audio: {
                  // Hold to talk: the learner's release ends a turn and
                  // nothing else does; the client commits and asks.
                  turnDetection: 'off' as const,
                  noiseReduction: 'near_field' as const,
                  speed: askSpeed(lectureStyle),
                },
              }
            : {}),
        });

    await this.calls.record({
      documentId: doc.id,
      task: cmd.mode === 'teach' ? 'teach_session' : 'voice_session',
      model:
        session.provider === 'openai'
          ? `openai:${session.model}`
          : 'elevenlabs:agent',
      tokensIn: null,
      tokensOut: null,
      latencyMs: null,
      outcome: 'ok',
    });

    return CommandResponse.of<VoiceSessionResponse>({
      ...session,
      baseInstructions,
    });
  }

  /**
   * A question asked mid-lecture.
   *
   * The tape is paused and the learner is holding the mic, so this is the
   * same teacher, still mid-class, answering an interruption. The handler
   * gathers where they are: the chapter and the page's place in it, what
   * the chapter is about and what comes next, what has been said so far,
   * the sentence that was being spoken, the note sentence that was lit,
   * and a line about the learner. The words themselves are composed in
   * the ask domain, where a spec can read them.
   */
  private async lectureInstructions(
    doc: Awaited<ReturnType<DocumentAccessService['require']>>,
    summary: string | null,
    tutor: Tutor,
    cmd: VoiceSessionRequest,
  ): Promise<string> {
    const context = cmd.lectureContext;
    const pageNumber = context?.pageNumber ?? cmd.pageNumber;
    const style = context?.style ?? DEFAULT_LECTURE_STYLE;
    const kind = context?.kind ?? 'page';
    const offsetMs = context?.offsetMs ?? 0;
    const segments = await this.lectures
      .listSegments(doc.id, doc.contentVersion, style)
      .catch((): LectureSegmentRecord[] => []);
    const current = segments.find(
      (segment) => segment.pageNumber === pageNumber && segment.kind === kind,
    );

    // The chapter: the row's own, else the one whose range holds the page.
    const topics = await this.topics
      .listByDocument(doc.id)
      .catch((): Awaited<ReturnType<TopicRepository['listByDocument']>> => []);
    const topic =
      (current?.topicId
        ? topics.find((candidate) => candidate.id === current.topicId)
        : undefined) ??
      topics.find(
        (candidate) =>
          pageNumber >= candidate.startPage && pageNumber <= candidate.endPage,
      ) ??
      null;
    const chapterRows = segments.filter(
      (segment) =>
        (segment.kind === 'page' || segment.kind === 'part') &&
        segment.topicId === (current?.topicId ?? topic?.id),
    );
    const chapterPages = [
      ...new Set(chapterRows.map((segment) => segment.pageNumber)),
    ].sort((a, b) => a - b);
    const plan = topic
      ? (((
          await this.lectures
            .findPlan(doc.id, topic.id, doc.contentVersion)
            .catch(() => null)
        )?.plan as LecturePlan | null | undefined) ?? null)
      : null;
    const nextPage = chapterPages.find((page) => page > pageNumber) ?? null;
    const nextBeat = nextPage !== null && plan ? beatFor(plan, nextPage) : null;
    const chapter = topic
      ? {
          title: topic.title,
          pageIndex: Math.max(1, chapterPages.indexOf(pageNumber) + 1),
          pageCount: Math.max(1, chapterPages.length),
          arc: plan?.arc ?? null,
          next: nextBeat ? nextBeat.newHere?.trim() || nextBeat.goal : null,
          beats:
            plan?.beats?.map((beat) => ({
              pageNumber: beat.pageNumber,
              goal: beat.newHere?.trim() || beat.goal,
            })) ?? null,
        }
      : null;

    // What the student has actually heard in this chapter, up to and
    // including the sentence they interrupted. A page cut in two counts
    // its second piece only once the student is in it.
    const heard = chapterRows
      .filter(
        (segment) =>
          (segment.seq < (current?.seq ?? 0) ||
            (segment.seq === (current?.seq ?? 0) &&
              KIND_RANK[segment.kind] <= KIND_RANK[current?.kind ?? 'page'])) &&
          segment.scriptText,
      )
      .map((segment) => scriptForTts(segment.scriptText ?? ''))
      .join('\n\n')
      .slice(-ASK_HEARD_CHARS);

    // The exact moment: the sentence being spoken when the mic was pressed.
    const times = current?.wordTimes as WordTimes | null;
    const spoken = current?.scriptText ? scriptForTts(current.scriptText) : '';
    let moment: string | null = null;
    if (times && times.sentences.length && spoken) {
      const index = sentenceIndexAtMs(times, offsetMs);
      const recent = times.sentences
        .slice(Math.max(0, index - 2), index + 1)
        .map((sentence) => spoken.slice(sentence[0], sentence[1]));
      if (recent.length) {
        moment = `THE SENTENCE YOU WERE SAYING when they pressed the mic (marked >>), with the ones before it:\n${recent
          .map((line, i) => (i === recent.length - 1 ? `>> ${line}` : line))
          .join('\n')}`;
      }
    }

    // The note sentence that was lit on their screen, and any figure or
    // table the page names, which the tutor may offer to draw.
    const noteLevel = context?.noteLevel ?? noteLevelFor(style);
    const page = await this.simplified
      .find(doc.id, noteLevel, pageNumber)
      .catch(() => null);
    const figures = page?.blocks ? pageFigures(page.blocks) : null;
    let highlighted: string | null = null;
    if (context?.block !== undefined) {
      const unit = (page?.blocks ? noteUnits(page.blocks) : []).find(
        (candidate) =>
          candidate.block === context.block &&
          (context.sentence === undefined ||
            context.sentence === null ||
            candidate.sentence === context.sentence),
      );
      highlighted = unit?.text ?? null;
    }

    const profile = await this.profiles.find(cmd.userId).catch(() => null);
    const profileLine = profile?.styleNotes
      ? `ABOUT THIS LEARNER, from earlier lessons: ${profile.styleNotes}`
      : null;

    return askInstructions({
      tutor: { name: tutor.name, askPersona: tutor.askPersona },
      title: doc.props.title,
      summary,
      style,
      noteLevel,
      pageNumber,
      pageCount: doc.props.pageCount ?? null,
      chapter,
      heard,
      moment,
      highlighted,
      profileLine,
      conversation: context?.conversation ?? null,
      board: context?.board ?? null,
      figures,
      invited: context?.invited === true,
      interactive: context?.interactive === true,
    });
  }

  private chatInstructions(title: string, summary: string | null): string {
    return [
      `You are a patient study tutor discussing the document "${title}" with a student, out loud.`,
      summary ? `What the document covers:\n${summary}` : null,
      'Ground every answer in this document. If it does not cover something, say so plainly rather than answering from general knowledge.',
      'Keep technical terms, names and numbers exactly as the document uses them — the student is being examined on them — and explain them in plain words alongside.',
      'This is speech, and the listener is trying to learn: speak at a calm, unhurried rate, in short plain sentences, a few at a time, with natural pauses. Never race. No lists, no headings, no markdown.',
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
    pageNumber: number,
    revisitTopicId?: string,
    intent?: LessonIntent,
  ): Promise<string> {
    const [topics, events, profile, unnarrated, docState] = await Promise.all([
      this.topics.listWithReadState(documentId, userId),
      this.assessments.recent(userId, documentId, 200),
      this.profiles.find(userId),
      // Changes the reader hasn't been told about yet, capped at two — an
      // opening that recites five adjustments is a lecture about the app.
      this.profileChanges
        .unnarrated(userId, 2)
        .catch((): ProfileChangeRecord[] => []),
      this.docStates.find(userId, documentId).catch(() => null),
    ]);

    const mastery = computeMastery(
      events,
      topics.map((topic) => topic.id),
    );
    const masteryById = new Map(mastery.map((entry) => [entry.topicId, entry]));

    // Calibration (P4): the tutor's private read on whether this student's
    // confidence tracks their competence. Thin evidence stays silent.
    // Where to pitch the first questions (Rosenshine's success rate: about
    // eight in ten right is where learning runs fastest). The tutor is told
    // the recent rate and asked to start a step down or up from it.
    const recent = events.slice(0, 12);
    const successRate =
      recent.length >= 4
        ? recent.reduce((sum, event) => sum + event.score, 0) / recent.length
        : null;
    const successLine =
      successRate === null
        ? null
        : successRate < 0.6
          ? `Their last ${recent.length} checks in this document came out ${Math.round(successRate * 100)} percent right, below the seven-to-eight-in-ten band where learning runs fastest. Start one step down: smaller steps, a worked example before a question, easier first questions, and step back up only after two fluent answers.`
          : successRate > 0.9
            ? `Their last ${recent.length} checks in this document came out ${Math.round(successRate * 100)} percent right, above the band. Start one step up: fewer and harder questions, a hint instead of an answer, less restating.`
            : `Their last ${recent.length} checks in this document came out ${Math.round(successRate * 100)} percent right, inside the band. Hold this level and adjust as you go.`;

    const calibration = computeCalibration(events);
    const calibrationLine =
      calibration.n >= MIN_CALIBRATION_EVENTS && calibration.bias !== null
        ? calibration.bias > 0.25
          ? 'This student\'s confidence runs ahead of their scores. Check understanding more often than feels polite, and praise accurate self-assessment — "good call knowing you weren\'t sure" — as warmly as right answers.'
          : calibration.bias < -0.25
            ? 'This student underrates themself. When they are right, say so plainly and point at the evidence; hedged right answers deserve to be named as right.'
            : null
        : null;

    // The lesson starts where the student opened it, not at the plan's
    // first untaught chapter — "teach me" pressed on page 94 means page 94.
    const containing = topics.find(
      (topic) => pageNumber >= topic.startPage && pageNumber <= topic.endPage,
    );
    const startHere = containing
      ? `- The student opened this lesson from page ${pageNumber}, inside "${containing.title}" [id: ${containing.id}]. Start with a one-breath overview of where that sits in the plan, then pick up at page ${pageNumber} and move forward page by page. Never jump to a different chapter to begin: when this topic's pages are done, continue straight into the next topic in plan order. Pages before ${pageNumber} are behind the student — go back only if they ask, or a prerequisite genuinely demands a short bridge.`
      : `- The student opened this lesson from page ${pageNumber}. Start there and move forward page by page.`;

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
      (() => {
        const revisit = topics.find((topic) => topic.id === revisitTopicId);
        if (!revisit) return null;
        // What this student's own recalls kept failing to produce. A revisit
        // that opens on exactly those beats re-teaching the whole chapter,
        // and the evidence for it is already in `events`.
        const stillOpen = openMissedIdeas(
          events.filter((event) => event.topicId === revisit.id),
        )
          .filter((idea) => idea.resolvedAt === null)
          .slice(0, 3)
          .map((idea) => idea.text);

        return (
          `THIS SESSION IS A REVISIT. The student asked to go over "${revisit.title}" again (pages ${revisit.startPage}-${revisit.endPage}). ` +
          'Start there regardless of read state, and re-teach it from a genuinely different angle than a first pass — new examples, new framing. ' +
          (stillOpen.length
            ? `These are the ideas that have not come back when they tried to recall this chapter: ${stillOpen
                .map((idea) => `"${idea}"`)
                .join(
                  '; ',
                )}. Build the revisit around exactly these, and do not imply you are reading a record of their mistakes — you simply know where to start. `
            : '') +
          `Check it landed with ${TEACH_TOOLS.ASK_QUIZ} and record ${TEACH_TOOLS.REPORT_UNDERSTANDING} before anything else. ` +
          `When the student is satisfied, offer to continue with the rest of the plan or wrap up with ${TEACH_TOOLS.END_LESSON}.`
        );
      })(),
      [
        'How to run the lesson:',
        startHere,
        '- The screen is your blackboard and the tools are your chalk — and chalk is silent. NEVER speak about the machinery: no "point", no "reveal", no "tool", no "board", no "lesson plan", no "let me show the next one". You do not announce what the screen is about to do; you teach, and the screen follows your voice. A student should be able to close their eyes and hear only a teacher.',
        "- One idea at a time, landed before the next. This is the whole job: a personal tutor holds the student's hand through material that has already defeated them once. Never pile up material, never sprint to be finished, never move on from an idea the student has not shown they hold.",
        `- Before starting a topic, call ${TEACH_TOOLS.CHECK_PREREQUISITES} with its id. If it returns anything, ask about it in passing — "are you comfortable with X, or should I take a minute on it?" — and if they want it (or clearly need it), give a short bridge and then call ${TEACH_TOOLS.TEACH_PREREQUISITE}. Two bridges per chapter at most; the chapter is the destination.`,
        `- When you begin a topic, call ${TEACH_TOOLS.GO_TO_PAGE} with its first page, then open the way a good teacher does on a good day: two or three natural sentences on what this chapter is about and why it is worth their time, then walk straight into the first idea. No agenda reading, no listing the headings, and do not ask what they want to learn — they came to be taught. If the student volunteers a question at any point, hold it via ${TEACH_TOOLS.SAVE_QUESTION} and fold the answer in where it belongs. Keep turning pages with ${TEACH_TOOLS.GO_TO_PAGE} so the student is always looking at what you are explaining.`,
        [
          '- HOW A TURN WORKS. You speak in short turns: one idea, two to',
          '  five sentences, then stop. Stopping is completely safe: the',
          '  lesson continues by itself after a natural beat, so you never',
          '  need filler to hold the floor, and you never say anything like',
          '  "shall I go on". The rhythm this creates, a thought, a beat,',
          '  the next thought, is how a person actually teaches.',
          '- The reveal turn, which is most turns: call',
          `  ${TEACH_TOOLS.REVEAL_POINT}, read its result (it carries the`,
          '  exact text now on the screen and is your ONLY truth about what',
          '  the student sees), then explain exactly that point in your own',
          '  plainer words, and stop. One point, one turn. The screen and',
          '  your voice cannot drift, because every turn begins at the',
          '  screen. Never read the revealed text aloud as written; your',
          '  voice adds the example, the why, the connection.',
          '- The silent fetch turn: sometimes, while your voice is still',
          '  playing, a note asks you to fetch the next point ahead of',
          '  time. Call the tool and say NOTHING — the result is marked',
          '  prefetched and the point is NOT on the page yet. When your',
          '  words finish playing, a note tells you to teach it: do that at',
          '  once, opening with a short spoken introduction of the idea —',
          '  the point appears on the page just as you introduce it, the',
          '  voice a half-breath ahead of the text. Never mention any of',
          '  this; to the student it is simply seamless.',
          '- A QUESTION ENDS YOUR TURN, MID-AIR. The question mark is the',
          '  last sound of the turn: nothing after it, no "take your time",',
          '  no answering it yourself, no next idea. The silence that',
          '  follows belongs to the student; for them it is thinking, not',
          '  awkwardness. If they truly have nothing, you will be prompted.',
          '  It is never your job to fill that silence.',
          '- ONE THING AT A TIME. The opening minutes of a topic are for',
          '  teaching only: no quizzes, no flashcards, no recall, at most',
          '  one drawing. Never stack actions; never draw and quiz in the',
          '  same breath.',
        ].join('\n'),
        [
          '- HOW YOU SOUND: like a person who loves this subject, not like',
          '  a page being read. Contractions, varied sentence lengths, the',
          '  occasional aside. Never enumerate aloud (no "point one, point',
          '  two", no "firstly") and never lecture in list form; let ideas',
          '  follow each other the way they do in conversation. When the',
          '  student says something, react like a human first, briefly and',
          '  specifically, then continue.',
        ].join('\n'),
        '- The student should be taking notes, like in a real classroom. After you explain an idea, leave a short pause for them to write it down. When a term is exam-critical or easily confused, say that it belongs in their notes — then give them the moment to jot it.',
        `- Visuals are yours to initiate — a good tutor reaches for the board unprompted, and the student should NEVER have to ask for a drawing. The moment an idea has shape, put it up as you begin explaining it: ${TEACH_TOOLS.DRAW_DIAGRAM} for a process, sequence, hierarchy or comparison; ${TEACH_TOOLS.SKETCH} for the thing itself — anatomy, apparatus, a labelled curve; ${TEACH_TOOLS.SHOW_IMAGES} for real photographs; ${TEACH_TOOLS.COMPUTE} for ANY arithmetic before a number leaves your mouth. Aim for at least one visual per topic whenever the material has any shape to show, and simply start describing what the student now sees — never announce that you are about to draw.`,
        `- Drawings take a few seconds. When you call for one, the student sees it being drawn and YOU KEEP TEACHING — never announce it, never wait in silence for it. A note will tell you the moment it is on screen; only from that moment may you refer to it or walk through it. It fills the screen when ready — teach from it part by part while it is large, then call ${TEACH_TOOLS.FOCUS_BOARD} with action "close" before moving on. Bring anything back later with action "expand" and its title.`,
        `- Close every topic with the student doing the work. If they raised questions during the lesson, return to them now: read each back and have them answer it aloud; one they can now answer is the victory lap, one they can't gets a short re-teach. Then run one memory check: first ask "before we check — how solid does this topic feel, one to five?", then call ${TEACH_TOOLS.RECALL} with action "start", ask them to say the main ideas back, listen fully without interrupting, call it with "end", and walk anything they missed. Record ${TEACH_TOOLS.REPORT_UNDERSTANDING} — noting their own one-to-five prediction in the note alongside your read — then call ${TEACH_TOOLS.MARK_TOPIC_COMPLETE} with its id and move to the next. When the profile says brisk and their mastery is already strong, shorten these closings — depth belongs where mastery is weak.`,
        [
          '- OPEN WITH REVIEW. Before any new material, one to three',
          '  minutes on what this student covered last time in this',
          '  document: three or four quick questions on ideas already',
          '  taught (the chapters marked already taught above), answered',
          '  by them and corrected by you. Skip it only when nothing has',
          '  been taught yet.',
          '- CHECK AFTER EVERY POINT. After you explain a revealed point,',
          '  ask one question the student can answer about it before the',
          '  next point. Never ask "any questions?"; ask a specific question',
          '  they must answer. Ask process questions too: "how did you get',
          '  that?", "why does that follow?".',
          '- AIM FOR ABOUT EIGHT IN TEN RIGHT. If they miss two in a row,',
          '  step down: a smaller step, a worked example, the plainest',
          '  words, an easier question. If they answer two easy ones',
          '  fluently, step up: a harder question, a hint instead of an',
          '  answer, less restating. Say nothing about the stepping; do it.',
          '- DIAGNOSE FIRST. When you begin a topic, one question before',
          '  you teach it tells you where to pitch: if they already hold the',
          '  idea, skip the explanation and go straight to using it.',
          '- ANSWER THE STEP. When the student is stuck, respond to the',
          '  step they are on, not the whole idea again. Hint before you',
          '  tell for anyone who is not lost ("what else could it be?",',
          '  "what did the page say happens when the bucket is empty?").',
          '  For a student who is lost, tell them plainly, then have them',
          '  say it back.',
          '- FEEDBACK CARRIES INFORMATION. When they answer, say what was',
          '  right, the one thing that was off and why, and what to do',
          '  next. Correct a wrong answer in the same turn, never later.',
          '  Never praise the person ("great job", "clever"); name what',
          '  was right instead.',
          '- EXPLAIN, THEN HAVE THEM USE IT. An explanation is followed in',
          '  the same exchange by a small application or "say it in your',
          '  own words". Explain the principle, not the surface.',
          '- An analogy is allowed if you call it one and tie it back to',
          '  the term at once. No anecdotes, no colour: whatever the student',
          '  thinks about is what they remember, so make them think about',
          '  the idea.',
          '- END ON RETRIEVAL. When the lesson ends, before the recap: three',
          '  questions from today, answered by them; then one sentence on',
          '  where next time starts.',
        ].join('\n'),
        '- If the student asks to skip, slow down, go back, or dig into something, follow them — the plan serves the student.',
        `- When the whole plan is taught — or the student says they are done — wrap up like a real teacher: a short spoken recap of what was covered, a word of encouragement, goodbye. Then, and only then, call ${TEACH_TOOLS.END_LESSON} to close the session.`,
        '- After every tool call, keep talking; never leave silence while something appears on screen.',
        `- Check understanding with ${TEACH_TOOLS.ASK_QUIZ} and ${TEACH_TOOLS.ASK_FLASHCARD} at the rate the student's check-in setting prescribes below — never sooner, and never in a topic's opening minutes. The tool result is the authoritative answer. When they get one wrong, re-teach that piece before moving on.`,
        `- Before ${TEACH_TOOLS.MARK_TOPIC_COMPLETE}, call ${TEACH_TOOLS.REPORT_UNDERSTANDING} with your honest 1-5 read of the student on that topic.`,
        `- When you notice how this student learns — too fast, needs smaller steps, lights up at examples — call ${TEACH_TOOLS.UPDATE_LEARNER_PROFILE}. It changes how every future lesson is taught, including the rest of this one.`,
      ].join('\n'),
      // Composed with this document's delta, so a reader who is struggling
      // here is taught more slowly here — and nowhere else.
      profileInstructions(
        effectiveProfile(profile ?? DEFAULT_LEARNER_PROFILE, docState),
      ),
      // What the student SAID they want today, in their own words.
      // The dials above set the mechanics; this sets the attitude.
      intent ? INTENT_LINES[intent] : null,
      successLine,
      calibrationLine,
      unnarrated.length
        ? [
            'Changes to how you teach since last time — mention naturally in',
            'your opening, once, briefly, then move on:',
            ...unnarrated.map(
              (change) =>
                `- ${describeChange(change.field, change.toValue)}${change.reason ? ` (${change.reason})` : ''}`,
            ),
          ].join('\n')
        : null,
      'Ground everything in this document. Keep technical terms, names and numbers exactly as it writes them — the student is examined on them — and explain each in plain words when it first appears.',
      'This is speech, and the student is learning as they listen: speak at a calm, unhurried rate, in short plain sentences, and give an important sentence a beat of silence to land before the next. Never race through material, and never sound like you are reading. No lists, no headings, no markdown in what you say.',
      `The text of the page currently on screen is appended below and refreshes as pages turn. The numbers on the simplified points are the ones ${TEACH_TOOLS.REVEAL_POINT} takes.`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async markNarrated(userId: string): Promise<void> {
    const pending = await this.profileChanges.unnarrated(userId, 2);
    await this.profileChanges.markNarrated(pending.map((c) => c.id));
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

export interface DrawSketchRequest {
  userId: string;
  documentId: string;
  description: string;
}

/**
 * A grounded free-form sketch for the lesson board — the same split as
 * DrawDiagramHandler: the voice model says what to draw, a text model draws
 * it from retrieved passages. The SVG that comes back is untrusted; the
 * client sanitizes before rendering.
 */
@Injectable()
export class DrawSketchHandler extends AbstractRequestHandlerTemplate<
  DrawSketchRequest,
  SketchResponse
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

  protected async handleRequest(cmd: DrawSketchRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const summary = await this.summaries.find(cmd.documentId);

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

    const result = await this.llm.drawSketch({
      description: cmd.description,
      context,
      summary,
    });

    await this.calls.record({
      documentId: cmd.documentId,
      task: 'sketch',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });

    return CommandResponse.of(result.value);
  }
}

export interface TopicQuizRequest {
  userId: string;
  documentId: string;
  topicId: string;
  /** Open missed ideas from a revisit — the quiz aims at these first. */
  focus?: string[];
  /**
   * Spoken-friendly kinds, for a check the learner answers aloud: a
   * flashcard (one answer, said back) or true or false. Omitted means
   * multiple choice, for a check on screen.
   */
  kinds?: ('flashcard' | 'true_false' | 'mcq')[];
}

export interface TopicQuizResponse {
  questions: {
    /** Omitted means multiple choice. */
    kind?: 'mcq' | 'flashcard' | 'true_false';
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }[];
}

/**
 * Self-serve checks for the solo study path (scaffolding plan P7): 2-3
 * grounded MCQs on one chapter, generated fresh each run so re-testing asks
 * new questions. Context is the chapter's own simplified text — the same
 * words the student just read.
 */
@Injectable()
export class GenerateTopicQuizHandler extends AbstractRequestHandlerTemplate<
  TopicQuizRequest,
  TopicQuizResponse
> {
  constructor(
    @Inject(LLM_GATEWAY) private readonly llm: LlmGatewayPort,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly simplified: SimplifiedPageRepository,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: TopicQuizRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const topics = await this.topics.listWithReadState(
      cmd.documentId,
      cmd.userId,
    );
    const topic = topics.find((t) => t.id === cmd.topicId);
    if (!topic) throw new NotFoundError('Topic');

    const pages = await this.simplified.findRange(
      cmd.documentId,
      'standard',
      topic.startPage,
      topic.endPage,
    );
    const pagesText = pages
      .filter((page) => page.status === 'done' && page.blocks?.length)
      .map((page) => blocksToProse(page.blocks ?? []))
      .join('\n\n')
      // Quizzes need the chapter, not the whole book at 12 pages a topic.
      .slice(0, 24_000);
    if (!pagesText) {
      throw new DocumentNotReadyError(
        "This chapter hasn't been simplified yet. Try again once it has",
      );
    }

    const summary = await this.summaries.find(cmd.documentId);
    const result = await this.llm.generateTopicQuiz({
      topicTitle: topic.title,
      pagesText,
      summary,
      focus: cmd.focus?.slice(0, 5),
      kinds: cmd.kinds?.length ? cmd.kinds : undefined,
    });

    await this.calls.record({
      documentId: cmd.documentId,
      task: 'topic_quiz',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });

    return CommandResponse.of(result.value);
  }
}

export interface DiagramCheckRequest {
  userId: string;
  documentId: string;
  description: string;
}

/**
 * The visual-scaffold check (scaffolding plan P6): a grounded diagram with
 * one "?" node plus candidate answers — DrawDiagramHandler's shape with a
 * deliberate hole in the result.
 */
@Injectable()
export class AskDiagramCheckHandler extends AbstractRequestHandlerTemplate<
  DiagramCheckRequest,
  DiagramCheckResponse
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

  protected async handleRequest(cmd: DiagramCheckRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const summary = await this.summaries.find(cmd.documentId);
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

    const result = await this.llm.drawDiagramCloze({
      description: cmd.description,
      context,
      summary,
    });

    await this.calls.record({
      documentId: cmd.documentId,
      task: 'diagram_cloze',
      model: result.usage.model,
      tokensIn: result.usage.tokensIn,
      tokensOut: result.usage.tokensOut,
      latencyMs: result.usage.latencyMs,
      outcome: 'ok',
    });

    return CommandResponse.of(result.value);
  }
}

export interface ComputeRequest {
  userId: string;
  documentId: string;
  expression: string;
  scope?: Record<string, number>;
}

/**
 * Verified arithmetic for the tutor. No model call and no retrieval — the
 * point is that the number the tutor says aloud came from an evaluator, not
 * from a language model. Logged to ai_call_logs (tokens 0) so every lesson
 * capability shows up in one ledger.
 */
@Injectable()
export class ComputeHandler extends AbstractRequestHandlerTemplate<
  ComputeRequest,
  ComputeResponse
> {
  constructor(
    @Inject(AI_CALL_LOG_REPOSITORY) private readonly calls: AiCallLogRepository,
    private readonly compute: ComputeService,
    private readonly access: DocumentAccessService,
  ) {
    super();
  }

  protected async handleRequest(cmd: ComputeRequest) {
    await this.access.require(cmd.documentId, cmd.userId);

    const started = Date.now();
    const outcome = this.compute.evaluate(cmd.expression, cmd.scope);

    await this.calls.record({
      documentId: cmd.documentId,
      task: 'compute',
      model: 'mathjs',
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - started,
      outcome: outcome.ok ? 'ok' : 'failed',
    });

    if (!outcome.ok) {
      return CommandResponse.of<ComputeResponse>(outcome);
    }
    return CommandResponse.of<ComputeResponse>({
      ok: true,
      result: outcome.result,
      tex: this.compute.toTex(cmd.expression, outcome.result),
    });
  }
}
