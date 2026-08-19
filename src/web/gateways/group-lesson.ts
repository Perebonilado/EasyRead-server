import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SIMPLIFIED_PAGE_REPOSITORY,
  SUMMARY_REPOSITORY,
  TOPIC_REPOSITORY,
} from '../../business/repositories/tokens';
import type { SimplifiedPageRepository } from '../../business/repositories/simplified-page.repository';
import type {
  SummaryRepository,
  TopicRepository,
} from '../../business/repositories/misc.repository';
import type { StudySessionRecord } from '../../business/repositories/group.repository';
import { RecordAssessmentHandler } from '../../business/handlers/documents/learning.handlers';
import { blocksToProse } from '../../business/handlers/documents/voice.handlers';
import { tutorById } from '../../business/domain/values/tutors';
import { ServerRealtime } from './server-realtime';

/** How long one held turn may run before the floor auto-releases. */
export const MAX_FLOOR_MS = 45_000;
/** A check closes when everyone answered, or after this window. */
const CHECK_WINDOW_MS = 35_000;
/** The lesson never reads more than this much chapter text. */
const CONTEXT_CHAR_BUDGET = 18_000;

export interface StageBoardItem {
  id: string;
  kind: 'diagram' | 'note';
  title: string;
  /** Mermaid source for diagrams, plain text for notes. */
  body: string;
}

export interface GroupCheckOpen {
  id: string;
  question: string;
  options: string[];
}

export interface GroupCheckResult {
  id: string;
  correctIndex: number;
  explanation: string;
  /** Answer counts by option index — anonymous by design (plan §7.5). */
  spread: number[];
  answered: number;
}

/** What the lesson tells the room; the gateway turns these into socket events. */
export interface LessonEvents {
  onAudio: (base64Pcm16: string) => void;
  onCaption: (delta: string, done: boolean) => void;
  onSpeaking: (speaking: boolean) => void;
  onBoard: (item: StageBoardItem) => void;
  onCheckOpen: (check: GroupCheckOpen) => void;
  onCheckResult: (result: GroupCheckResult) => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

interface OpenCheck {
  id: string;
  callId: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  answers: Map<string, number>;
  timer: ReturnType<typeof setTimeout>;
}

const TOOLS = [
  {
    name: 'draw_diagram',
    description:
      'Draw a small Mermaid diagram on the shared board. Use for structures, flows and relationships — a picture the whole group looks at together.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Three to six words' },
        mermaid: {
          type: 'string',
          description:
            'Mermaid source, e.g. "graph TD; A[Idea]-->B[Consequence]". Keep it under 12 nodes.',
        },
      },
      required: ['title', 'mermaid'],
    },
  },
  {
    name: 'group_check',
    description:
      'Ask the whole group one multiple-choice question at once. Everyone answers privately; you get back how many chose each option, never who chose what. Use this instead of quizzing one person when you want the group pulse.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Three or four options',
        },
        correctIndex: { type: 'integer' },
        explanation: {
          type: 'string',
          description: 'One sentence on why the right answer is right',
        },
      },
      required: ['question', 'options', 'correctIndex', 'explanation'],
    },
  },
  {
    name: 'end_lesson',
    description:
      'End the session after your closing words. Call this only when the group agrees to stop or the material is covered.',
    parameters: { type: 'object', properties: {} },
  },
];

/**
 * One live classroom lesson (classroom plan P2).
 *
 * Owns the realtime connection and the lesson's shared state: the floor,
 * open checks, the board. The gateway feeds it socket traffic; it answers
 * through `LessonEvents`. Everything a member answers is recorded as their
 * own assessment event — the shared stage only ever sees the anonymous
 * spread.
 */
export class GroupLesson {
  private readonly logger = new Logger(GroupLesson.name);
  private realtime: ServerRealtime | null = null;
  private floorHolder: { userId: string; name: string } | null = null;
  private floorTimer: ReturnType<typeof setTimeout> | null = null;
  private check: OpenCheck | null = null;
  private tutorSpeaking = false;
  private seq = 0;

  constructor(
    private readonly session: StudySessionRecord,
    private readonly roster: () => { userId: string; name: string }[],
    private readonly events: LessonEvents,
    private readonly deps: {
      apiKey: string;
      model: string;
      record: RecordAssessmentHandler;
      instructions: string;
      voice: string;
    },
  ) {}

  async start() {
    this.realtime = new ServerRealtime({
      apiKey: this.deps.apiKey,
      model: this.deps.model,
      voice: this.deps.voice,
      instructions: this.deps.instructions,
      tools: TOOLS,
      callbacks: {
        onAudio: (chunk) => this.events.onAudio(chunk),
        onCaption: (delta, done) => this.events.onCaption(delta, done),
        onSpeaking: (speaking) => {
          this.tutorSpeaking = speaking;
          this.events.onSpeaking(speaking);
        },
        onToolCall: (call) => this.onToolCall(call),
        onError: (message) => this.events.onError(message),
        onClose: () => this.events.onError('The tutor lost its connection'),
      },
    });
    await this.realtime.connect();
    const names = this.roster().map((m) => m.name);
    this.realtime.inject(
      `(The session is starting. Present now: ${names.join(', ') || 'nobody yet'}. Greet the group briefly, say what today's material covers, and begin.)`,
      true,
    );
  }

  // ── Floor control (plan §7.2) ─────────────────────────────────────────────

  /** True if granted. First press wins; the tutor mid-sentence blocks. */
  requestFloor(userId: string, name: string): boolean {
    if (this.floorHolder || this.tutorSpeaking || !this.realtime) return false;
    this.floorHolder = { userId, name };
    this.realtime.inject(`(${name} is speaking next)`);
    this.floorTimer = setTimeout(() => this.releaseFloor(userId), MAX_FLOOR_MS);
    return true;
  }

  holder(): { userId: string; name: string } | null {
    return this.floorHolder;
  }

  appendAudio(userId: string, base64Pcm16: string) {
    if (this.floorHolder?.userId !== userId) return;
    this.realtime?.appendAudio(base64Pcm16);
  }

  releaseFloor(userId: string) {
    if (this.floorHolder?.userId !== userId) return;
    if (this.floorTimer) clearTimeout(this.floorTimer);
    this.floorTimer = null;
    this.floorHolder = null;
    this.realtime?.commitTurn();
  }

  /** A member joined or left mid-lesson; the tutor should know. */
  rosterChanged(note: string) {
    this.realtime?.inject(`(${note})`, false);
  }

  // ── Checks (plan §7.5) ────────────────────────────────────────────────────

  answerCheck(userId: string, checkId: string, index: number) {
    const check = this.check;
    if (!check || check.id !== checkId) return;
    if (index < 0 || index >= check.options.length) return;
    if (check.answers.has(userId)) return;
    check.answers.set(userId, index);

    // The member's own record; the stage never shows names on answers.
    void this.deps.record
      .handle({
        userId,
        documentId: this.session.documentId,
        // The topic belongs to the host's document tree; a member's guard
        // would refuse it, so the session carries it in the payload instead.
        topicId: null,
        kind: 'mcq',
        score: index === check.correctIndex ? 1 : 0,
        payload: {
          group: true,
          sessionId: this.session.id,
          topicId: this.session.topicId,
          quiz: true,
          question: check.question,
          yourAnswer: check.options[index],
          correctAnswer: check.options[check.correctIndex],
          explanation: check.explanation,
        },
      })
      .catch((error: Error) =>
        this.logger.warn(`Check record failed: ${error.message}`),
      );

    const connected = this.roster().length;
    if (check.answers.size >= connected) this.closeCheck();
  }

  private closeCheck() {
    const check = this.check;
    if (!check) return;
    clearTimeout(check.timer);
    this.check = null;

    const spread = check.options.map(() => 0);
    for (const index of check.answers.values()) spread[index] += 1;
    const result: GroupCheckResult = {
      id: check.id,
      correctIndex: check.correctIndex,
      explanation: check.explanation,
      spread,
      answered: check.answers.size,
    };
    this.events.onCheckResult(result);

    const right = spread[check.correctIndex];
    const total = check.answers.size;
    this.realtime?.toolResult(
      check.callId,
      `${right} of ${total} chose the right answer (${check.options[check.correctIndex]}). Full spread: ${check.options
        .map((option, i) => `${option}: ${spread[i]}`)
        .join(', ')}. Teach to this without naming anyone.`,
    );
  }

  // ── Tool calls ────────────────────────────────────────────────────────────

  private onToolCall(call: { callId: string; name: string; args: string }) {
    const str = (value: unknown, fallback: string) =>
      typeof value === 'string' ? value : fallback;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.args) as Record<string, unknown>;
    } catch {
      this.realtime?.toolResult(
        call.callId,
        'Arguments did not parse; try again.',
      );
      return;
    }

    if (call.name === 'draw_diagram') {
      const item: StageBoardItem = {
        id: `b${++this.seq}`,
        kind: 'diagram',
        title: str(args.title, 'Diagram'),
        body: str(args.mermaid, ''),
      };
      this.events.onBoard(item);
      this.realtime?.toolResult(
        call.callId,
        'Drawn on the shared board. Walk the group through it briefly.',
      );
      return;
    }

    if (call.name === 'group_check') {
      if (this.check) {
        this.realtime?.toolResult(call.callId, 'A check is already open.');
        return;
      }
      const options = Array.isArray(args.options)
        ? (args.options as unknown[]).map(String).slice(0, 4)
        : [];
      const correctIndex = Math.min(
        Math.max(0, Number(args.correctIndex ?? 0)),
        Math.max(0, options.length - 1),
      );
      if (options.length < 2) {
        this.realtime?.toolResult(call.callId, 'A check needs 2 to 4 options.');
        return;
      }
      const check: OpenCheck = {
        id: `c${++this.seq}`,
        callId: call.callId,
        question: str(args.question, ''),
        options,
        correctIndex,
        explanation: str(args.explanation, ''),
        answers: new Map(),
        timer: setTimeout(() => this.closeCheck(), CHECK_WINDOW_MS),
      };
      this.check = check;
      this.events.onCheckOpen({
        id: check.id,
        question: check.question,
        options: check.options,
      });
      return;
    }

    if (call.name === 'end_lesson') {
      this.realtime?.toolResult(call.callId, 'Session ending.', false);
      this.events.onEnded();
      return;
    }

    this.realtime?.toolResult(call.callId, `Unknown tool ${call.name}.`);
  }

  close() {
    if (this.floorTimer) clearTimeout(this.floorTimer);
    if (this.check) clearTimeout(this.check.timer);
    this.realtime?.close();
    this.realtime = null;
  }
}

/**
 * Builds lessons: gathers the document context, splices the tutor's persona
 * and the group protocol into one instruction block, and hands the lesson
 * its Nest-managed dependencies.
 */
@Injectable()
export class GroupLessonFactory {
  constructor(
    private readonly config: ConfigService,
    @Inject(SIMPLIFIED_PAGE_REPOSITORY)
    private readonly pages: SimplifiedPageRepository,
    @Inject(SUMMARY_REPOSITORY) private readonly summaries: SummaryRepository,
    @Inject(TOPIC_REPOSITORY) private readonly topics: TopicRepository,
    private readonly record: RecordAssessmentHandler,
  ) {}

  async create(
    session: StudySessionRecord,
    hostId: string,
    roster: () => { userId: string; name: string }[],
    events: LessonEvents,
  ): Promise<GroupLesson> {
    const tutor = tutorById(session.tutorId);

    // The material: the scoped chapter when one was picked, otherwise the
    // document from the top, inside a hard character budget.
    let from = 1;
    let to = 8;
    let chapterTitle: string | null = null;
    if (session.topicId) {
      const all = await this.topics.listWithReadState(
        session.documentId,
        hostId,
      );
      const topic = all.find((t) => t.id === session.topicId);
      if (topic) {
        from = topic.startPage;
        to = topic.endPage;
        chapterTitle = topic.title;
      }
    }
    const pages = await this.pages.findRange(
      session.documentId,
      'standard',
      from,
      to,
    );
    const prose = pages
      .filter((page) => page.status === 'done' && page.blocks?.length)
      .map(
        (page) =>
          `Page ${page.pageNumber}:\n${blocksToProse(page.blocks ?? [])}`,
      )
      .join('\n\n')
      .slice(0, CONTEXT_CHAR_BUDGET);
    const summary = await this.summaries.find(session.documentId);

    const instructions = [
      tutor.persona,
      '',
      'You are leading a LIVE GROUP STUDY SESSION with up to six students',
      'in the same room. This changes how you teach:',
      '- Lines in parentheses, like "(Ada is speaking next)" or "(Bola',
      '  joined the session)", are stage directions from the room. Never',
      '  read them aloud or mention them; just use them. When someone',
      '  speaks, you know exactly who it was — answer them by name.',
      '- Keep every speech to two or three sentences, then hand the floor',
      '  back. This is a conversation with turns, not a lecture.',
      '- Spread your attention deliberately. If someone has not spoken in a',
      '  while, invite them in warmly by name with an easy question. Never',
      '  point out that someone has been quiet, and never scold.',
      '- When one student misses an idea, reteach it to the whole group',
      '  without dwelling on who missed it. Name ideas, never failings.',
      '- Use draw_diagram when a structure would land better as a picture.',
      '- Use group_check every few minutes to take the group pulse: one',
      '  multiple-choice question everyone answers privately. You will get',
      '  the anonymous spread back; teach to it.',
      '- Greet people who join mid-session in one short breath and carry on.',
      '- When the material is covered or the group asks to stop, give a one',
      '  breath closing summary and call end_lesson.',
      '- Plain language always. Keep technical terms exact; never use em',
      '  dashes in anything you display.',
      '',
      summary ? `What the document covers: ${summary}` : '',
      chapterTitle ? `Today's chapter: ${chapterTitle}` : '',
      '',
      'The material (the students see these same pages in their reader):',
      prose || '(The pages are still being prepared; teach from the summary.)',
    ].join('\n');

    return new GroupLesson(session, roster, events, {
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      model: this.config.get<string>('AI_REALTIME_MODEL', 'gpt-realtime'),
      record: this.record,
      instructions,
      voice: tutor.voice.openaiFallback,
    });
  }
}
