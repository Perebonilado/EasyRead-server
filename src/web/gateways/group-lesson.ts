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
import {
  dialInstructions,
  tutorById,
} from '../../business/domain/values/tutors';
import { ServerRealtime } from './server-realtime';

/** How long one held turn may run before the floor auto-releases. */
export const MAX_FLOOR_MS = 45_000;
/** A check closes when everyone answered, or after this window. */
const CHECK_WINDOW_MS = 35_000;
/** The lesson never reads more than this much chapter text. */
const CONTEXT_CHAR_BUDGET = 18_000;
/** A committed turn needs real VOICE; silence and stray taps drop out. */
const MIN_VOICED_BYTES = 48 * 150; // 150ms of 24kHz pcm16
/**
 * Mean absolute sample value above which a chunk counts as voice. A muted
 * or idle microphone hovers well under this; speech sits far above it. This
 * is what stops the tutor answering silence (a muted mic still produces
 * perfectly valid zero-filled audio).
 */
const VOICE_FLOOR = 300;
/** Client jitter cushion + network: how far behind the room's ears run. */
const AUDIO_LEAD_MS = 350;
/** A dropped tutor connection retries this many times before giving up. */
const MAX_RECONNECTS = 3;
/**
 * Dead air (classroom feel): when the tutor finishes and nobody takes the
 * floor within this window, it carries on by itself — checking in if it had
 * asked something, simply teaching the next idea if it had not. Without
 * this, push-to-talk turns every pause into a stall.
 */
const DEAD_AIR_MS = 7_000;
/**
 * How many times the tutor may carry on into silence before it stops
 * driving itself: past this it asks once whether the group is still there,
 * then waits for a human turn. An open tab in an empty kitchen must not
 * teach all night.
 */
const MAX_AUTO_CONTINUES = 6;
/** How much recent transcript a reconnected tutor is reminded of. */
const RESUME_TRANSCRIPT_CHARS = 2_500;

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
    name: 'write_note',
    description:
      'Write a short note on the shared board: the key point you are about to explain, a term with its meaning, or the plan for the session. This is your blackboard writing; use it constantly, before you explain each new idea.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Two to five words' },
        text: {
          type: 'string',
          description:
            'One or two short sentences, the way a teacher writes on a board',
        },
      },
      required: ['title', 'text'],
    },
  },
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
  /** True from response.created to response.done: the model is generating. */
  private generating = false;
  /**
   * When the room finishes HEARING the tutor. Audio generates several times
   * faster than it plays, so response.done lands while clients still hold
   * many seconds of queued sound. Every "speak again" trigger (dead air,
   * tool follow-ups, queued responds) must wait on this clock, not on
   * response.done — firing early makes every client reset its player, and
   * the tutor audibly cuts itself off mid-sentence.
   */
  private audioEndAt = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * True from an interruption until the next response begins. The
   * cancelled response's in-flight deltas keep arriving for a moment;
   * forwarding them replayed fragments of dead tutor speech over the
   * interrupter's voice — the "broken record".
   */
  private tutorAudioMuted = false;
  /**
   * The current response's chunks, stamped with when the room finishes
   * hearing each. A member who joins mid-response missed the original
   * fan-out burst (audio generates far faster than it plays), so without
   * this tail they would sit in silence until the next response.
   */
  private pendingAudio: { chunk: string; endsAt: number }[] = [];
  /** The caption line currently on screen, for the same late joiners. */
  private liveCaption = '';
  private seq = 0;
  /** Decoded VOICED audio bytes appended during the current hold. */
  private voicedBytes = 0;
  /** Rolling transcript of the tutor's speech, for resuming after a drop. */
  private transcript = '';
  private reconnects = 0;
  private closedForGood = false;
  private continueTimer: ReturnType<typeof setTimeout> | null = null;
  private autoContinues = 0;
  /** A respond asked for while the tutor was mid-response; fired on done. */
  private respondQueued = false;

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
    await this.connect();
    const names = this.roster().map((m) => m.name);
    this.realtime?.inject(
      `(The session is starting. Present now: ${names.join(', ') || 'nobody yet'}, and nobody else. Write the session plan on the board with write_note, greet the people present briefly by name, then start teaching the first idea from the top, assuming nobody has read anything.)`,
    );
    this.respondNow();
  }

  private async connect() {
    this.realtime = new ServerRealtime({
      apiKey: this.deps.apiKey,
      model: this.deps.model,
      voice: this.deps.voice,
      instructions: this.deps.instructions,
      tools: TOOLS,
      callbacks: {
        onAudio: (chunk) => {
          // Stragglers from a cancelled response, or anything arriving
          // while a member holds the floor, must not reach the room.
          if (this.tutorAudioMuted || this.floorHolder) return;
          // Advance the room's playback clock: 24kHz pcm16 is 48 bytes/ms.
          const ms = (chunk.length * 3) / 4 / 48;
          const now = Date.now();
          this.audioEndAt = Math.max(this.audioEndAt, now + AUDIO_LEAD_MS) + ms;
          this.pendingAudio.push({ chunk, endsAt: this.audioEndAt });
          while (this.pendingAudio.length && this.pendingAudio[0].endsAt < now)
            this.pendingAudio.shift();
          this.events.onAudio(chunk);
        },
        onCaption: (delta, done) => {
          if (done) {
            this.liveCaption = '';
          } else {
            this.transcript = (this.transcript + delta).slice(
              -RESUME_TRANSCRIPT_CHARS,
            );
            this.liveCaption = (this.liveCaption + delta).slice(-280);
          }
          this.events.onCaption(delta, done);
        },
        onSpeaking: (speaking) => {
          if (speaking) {
            if (this.floorHolder && this.realtime) {
              // The response.create raced the floor grab: cancel it
              // before anyone hears it, and leave the room's state (a
              // member speaking, tutor quiet) untouched.
              this.generating = true;
              this.tutorAudioMuted = true;
              this.realtime.cancelResponse();
              return;
            }
            this.tutorAudioMuted = false;
            this.generating = true;
            this.tutorSpeaking = true;
            if (this.drainTimer) clearTimeout(this.drainTimer);
            this.drainTimer = null;
            this.pendingAudio = [];
            this.clearContinue();
            this.events.onSpeaking(true);
            return;
          }
          // response.done means generation finished, not that the room has
          // heard it. Nothing may speak until the playback clock runs out.
          this.generating = false;
          if (this.drainTimer) clearTimeout(this.drainTimer);
          this.drainTimer = setTimeout(
            () => {
              this.drainTimer = null;
              this.audioDrained();
            },
            Math.max(0, this.audioEndAt - Date.now()),
          );
        },
        onToolCall: (call) => this.onToolCall(call),
        onError: (message) => {
          // Plumbing noise (an empty commit, a transient event error) is a
          // log line; the room only hears about a tutor that actually died.
          this.logger.warn(`Realtime: ${message}`);
        },
        onClose: () => void this.onDropped(),
      },
    });
    await this.realtime.connect();
  }

  /**
   * The provider closed the socket under us (a blip, an idle cut, a rotated
   * connection). The classroom does not end for that: reconnect with a
   * fresh session, remind the tutor what it had covered, and carry on. The
   * room hears about it only when every retry fails.
   */
  private async onDropped() {
    if (this.closedForGood) return;
    this.tutorSpeaking = false;
    this.generating = false;
    this.tutorAudioMuted = false;
    this.audioEndAt = 0;
    this.pendingAudio = [];
    this.liveCaption = '';
    this.respondQueued = false;
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
    this.events.onSpeaking(false);
    // A vanished connection cannot hold the floor's commit path hostage.
    if (this.floorHolder) {
      if (this.floorTimer) clearTimeout(this.floorTimer);
      this.floorTimer = null;
      this.floorHolder = null;
    }

    while (this.reconnects < MAX_RECONNECTS && !this.closedForGood) {
      this.reconnects += 1;
      await new Promise((resolve) =>
        setTimeout(resolve, 1500 * this.reconnects),
      );
      try {
        await this.connect();
        const names = this.roster().map((m) => m.name);
        this.realtime?.inject(
          `(Your connection dropped and was restored mid-session. Present: ${names.join(', ') || 'nobody'}. The tail of what you had said so far: "...${this.transcript.slice(-RESUME_TRANSCRIPT_CHARS)}". Pick up exactly where you left off in one smooth breath. Do not re-greet, do not restart the lesson, do not mention the drop.)`,
        );
        this.tutorSpeaking = false;
        this.respondQueued = false;
        this.respondNow();
        this.logger.log(`Realtime reconnected (attempt ${this.reconnects})`);
        // A stable stretch earns the budget back, so a long session can
        // survive more than three drops spread over an hour.
        setTimeout(() => {
          this.reconnects = 0;
        }, 120_000);
        return;
      } catch (error) {
        this.logger.warn(
          `Realtime reconnect ${this.reconnects} failed: ${(error as Error).message}`,
        );
      }
    }
    if (!this.closedForGood) {
      this.events.onError(
        'The tutor lost its connection. The room still works; the owner can end and restart the session',
      );
    }
  }

  /**
   * Every "tutor, say something" goes through here: while a response is
   * generating, or its audio is still playing out in the room, the ask is
   * queued and fired the moment the room actually goes quiet.
   */
  private respondNow() {
    if (this.tutorSpeaking || this.floorHolder) {
      this.respondQueued = true;
      return;
    }
    this.respondQueued = false;
    this.realtime?.respond();
    // Watchdog: if the provider swallows this ask (it happens), the
    // dead-air engine revives the room; response.created clears it.
    this.armContinue();
  }

  /** The room has genuinely gone quiet: only now may the tutor speak again. */
  private audioDrained() {
    if (this.closedForGood || this.generating) return;
    if (this.tutorSpeaking) {
      this.tutorSpeaking = false;
      this.events.onSpeaking(false);
    }
    // Somebody is speaking: whatever wants saying waits for the release.
    if (this.floorHolder) return;
    if (this.respondQueued) {
      this.respondQueued = false;
      this.realtime?.respond();
      this.armContinue();
    } else {
      this.armContinue();
    }
  }

  // ── Dead air: the conversation must not stall on politeness ──────────────

  private clearContinue() {
    if (this.continueTimer) clearTimeout(this.continueTimer);
    this.continueTimer = null;
  }

  private armContinue() {
    this.clearContinue();
    if (this.closedForGood) return;
    this.continueTimer = setTimeout(() => {
      this.continueTimer = null;
      if (
        this.closedForGood ||
        this.tutorSpeaking ||
        this.floorHolder ||
        this.check ||
        this.roster().length === 0
      ) {
        return;
      }
      // Restated on every nudge: "by name" must always have the live
      // names beside it, or a long lesson drifts into invented students.
      const names = this.roster().map((member) => member.name);
      const present = names.length
        ? `In the room right now: ${names.join(', ')}, and nobody else.`
        : 'The room is empty right now.';
      if (this.autoContinues >= MAX_AUTO_CONTINUES) {
        if (this.autoContinues === MAX_AUTO_CONTINUES) {
          this.autoContinues += 1;
          this.realtime?.inject(
            `(Nobody has responded for a while. ${present} Ask once, warmly, whether they are still with you, say you will wait, and then stay quiet.)`,
          );
          this.respondNow();
        }
        return;
      }
      this.autoContinues += 1;
      this.realtime?.inject(
        `(Nobody spoke. ${present} If your last words asked someone a question, check in warmly by name with one of these people, or offer to move on. If you were not waiting on anyone, do not comment on the pause at all; simply continue teaching the next idea.)`,
      );
      this.respondNow();
    }, DEAD_AIR_MS);
  }

  // ── Floor control (plan §7.2) ─────────────────────────────────────────────

  /**
   * True if granted. First press wins; only ANOTHER member blocks. The tutor
   * mid-sentence does not: taking the floor interrupts it, the way raising
   * a voice does in a real room.
   */
  requestFloor(userId: string, name: string): boolean {
    // A re-press by the current holder (a quick release-and-hold) keeps the
    // floor rather than being refused by their own earlier grant.
    if (this.floorHolder?.userId === userId) return true;
    if (this.floorHolder || !this.realtime) return false;
    // An interruption supersedes anything the tutor was about to say.
    this.respondQueued = false;
    if (this.generating) {
      this.realtime.cancelResponse();
      this.tutorAudioMuted = true;
    }
    if (this.tutorSpeaking) {
      // Clients cut the tutor's queued audio the moment the floor changes
      // hands, so the room is quiet right now; say so before the grant.
      this.audioEndAt = 0;
      this.pendingAudio = [];
      if (this.drainTimer) clearTimeout(this.drainTimer);
      this.drainTimer = null;
      this.tutorSpeaking = false;
      this.events.onSpeaking(false);
    }
    this.autoContinues = 0;
    this.floorHolder = { userId, name };
    this.clearContinue();
    this.voicedBytes = 0;
    this.realtime.inject(`(${name} is speaking next)`);
    this.floorTimer = setTimeout(() => this.releaseFloor(userId), MAX_FLOOR_MS);
    return true;
  }

  holder(): { userId: string; name: string } | null {
    return this.floorHolder;
  }

  /**
   * Everything a late joiner needs to land mid-lecture instead of in
   * silence: the tutor's state, the caption on screen, and the audio the
   * room has not finished hearing yet, as one chunk their player can start
   * on immediately.
   */
  catchUp(): { speaking: boolean; caption: string; audio: string | null } {
    const now = Date.now();
    while (this.pendingAudio.length && this.pendingAudio[0].endsAt < now)
      this.pendingAudio.shift();
    // The provider sends multi-second deltas, so the head chunk is usually
    // mid-play: slice off what the room already heard, or the joiner lands
    // seconds behind everyone and hears it twice.
    const parts: Buffer[] = [];
    for (const { chunk, endsAt } of this.pendingAudio) {
      const buf = Buffer.from(chunk, 'base64');
      const startsAt = endsAt - buf.byteLength / 48;
      if (startsAt >= now) {
        parts.push(buf);
        continue;
      }
      let skip = Math.floor((now - startsAt) * 48);
      skip -= skip % 2; // whole pcm16 samples only
      if (skip < buf.byteLength) parts.push(buf.subarray(skip));
    }
    const audio = parts.length ? Buffer.concat(parts).toString('base64') : null;
    return { speaking: this.tutorSpeaking, caption: this.liveCaption, audio };
  }

  appendAudio(userId: string, base64Pcm16: string) {
    if (this.floorHolder?.userId !== userId) return;
    // Only chunks that carry actual voice count toward a committable turn.
    const pcm = Buffer.from(base64Pcm16, 'base64');
    const samples = new Int16Array(
      pcm.buffer,
      pcm.byteOffset,
      pcm.byteLength >> 1,
    );
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += Math.abs(samples[i]);
    if (samples.length && sum / samples.length > VOICE_FLOOR) {
      this.voicedBytes += pcm.byteLength;
    }
    this.realtime?.appendAudio(base64Pcm16);
  }

  releaseFloor(userId: string) {
    if (this.floorHolder?.userId !== userId) return;
    if (this.floorTimer) clearTimeout(this.floorTimer);
    this.floorTimer = null;
    this.floorHolder = null;
    // A hold that carried no real voice (a muted mic, a stray tap, an
    // accidental spacebar) commits nothing: the tutor never answers silence.
    if (this.voicedBytes < MIN_VOICED_BYTES) {
      this.realtime?.clearInput();
      if (this.respondQueued) {
        // Something queued up during the hold (a check closing, say):
        // the floor is free again, so let it speak.
        this.respondNow();
      } else if (!this.tutorSpeaking) {
        // An empty hold asked the tutor nothing: make sure the dead-air
        // engine is armed so the lesson still moves on its own.
        this.armContinue();
      }
    } else {
      this.realtime?.commitTurn();
      this.respondNow();
    }
    this.voicedBytes = 0;
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
    this.autoContinues = 0;
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
          topicIds: this.session.topicIds,
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
      false,
    );
    this.respondNow();
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

    if (call.name === 'write_note') {
      const item: StageBoardItem = {
        id: `b${++this.seq}`,
        kind: 'note',
        title: str(args.title, 'Note'),
        body: str(args.text, ''),
      };
      this.events.onBoard(item);
      this.realtime?.toolResult(
        call.callId,
        'On the board. Keep teaching; never announce that you wrote it.',
        false,
      );
      this.respondNow();
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
        false,
      );
      this.respondNow();
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
      this.clearContinue();
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

    this.realtime?.toolResult(call.callId, `Unknown tool ${call.name}.`, false);
    this.respondNow();
  }

  close() {
    this.closedForGood = true;
    this.clearContinue();
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
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

    // The material: the picked chapters in document order, otherwise the
    // document from the top, inside a hard character budget.
    const all = await this.topics.listWithReadState(session.documentId, hostId);
    const picked = session.topicIds.length
      ? all
          .filter((topic) => session.topicIds.includes(topic.id))
          .sort((a, b) => a.startPage - b.startPage)
      : [];
    const ranges = picked.length
      ? picked.map((topic) => ({ from: topic.startPage, to: topic.endPage }))
      : [{ from: 1, to: 8 }];
    const chapterTitle = picked.length
      ? picked.map((topic) => topic.title).join('", then "')
      : null;

    const pageRows: Awaited<ReturnType<SimplifiedPageRepository['findRange']>> =
      [];
    for (const range of ranges) {
      pageRows.push(
        ...(await this.pages.findRange(
          session.documentId,
          'standard',
          range.from,
          range.to,
        )),
      );
    }
    const prose = pageRows
      .filter((page) => page.status === 'done' && page.blocks?.length)
      .map(
        (page) =>
          `Page ${page.pageNumber}:\n${blocksToProse(page.blocks ?? [])}`,
      )
      .join('\n\n')
      .slice(0, CONTEXT_CHAR_BUDGET);
    const summary = await this.summaries.find(session.documentId);

    const instructions = [
      `You are giving a live spoken lesson on "${chapterTitle ?? 'this material'}" to a small GROUP of students, together in one room.`,
      `${tutor.persona}\n\nYour teaching style:\n${dialInstructions(tutor.dials)}`,
      [
        'How to run the lesson (this works exactly like your one-to-one',
        'lessons, with a group in the room instead of one student):',
        '- ASSUME NOBODY HAS READ THE MATERIAL. You are not reviewing; you',
        '  are teaching it from the beginning. Walk the group through the',
        '  pages in order, one idea at a time, landed before the next. Never',
        '  pile up material, never sprint to be finished.',
        '- The board is your blackboard and the tools are your chalk, and',
        '  chalk is silent. Before you explain each new idea, put it up:',
        "  write_note for the key point in a teacher's short words,",
        '  draw_diagram the moment an idea has shape (a process, a',
        '  hierarchy, a comparison). Open the session by writing the plan on',
        '  the board. Never teach for more than a minute without adding to',
        '  the board, and never announce that you are writing or drawing;',
        '  teach, and let the board follow your voice.',
        '- Never read the board aloud as written. Your voice adds what the',
        '  board cannot: plainer words, a concrete example, why it matters.',
        '- Teach in short spoken stretches, under a minute, then hand the',
        '  room a reason to speak: ask someone by name to say it back, ask',
        '  the group what they expect comes next, or ask if anyone wants it',
        '  slower. Questions from students are welcome at any moment; when',
        '  one is asked, answer it fully before returning to the thread.',
        '- Students can interrupt you mid-sentence; that is normal here.',
        '  When your speech gets cut off and someone speaks, answer them',
        '  first, then pick your thread back up only if it still matters.',
        '- NEVER leave dead air. End a turn either by asking a specific',
        '  person a specific question, or by carrying straight on to the',
        '  next idea yourself. Statements do not need replies; do not stop',
        '  and wait after one. Only wait when you have explicitly asked',
        '  someone to answer, and if they stay quiet, check in gently or',
        '  move on rather than sitting in silence.',
        '- Lines in parentheses, like (Ada is speaking next) or (Bola',
        '  joined the session), are stage directions from the room. Never',
        '  read them aloud or mention them. When someone speaks, you know',
        '  exactly who it was: answer them by name. Ada and Bola are only',
        '  examples of the form; the real names come from the room.',
        '- THE ROSTER IS LAW. The only people in this room are the ones',
        '  the stage directions have announced: present at the start,',
        '  joined, left, or speaking next. When you address anyone by',
        '  name, it must be a name from that list and no other. Never',
        '  invent, guess or borrow a name. People named inside the',
        '  document are characters in the material, not students in the',
        '  room; never call on them.',
        '- When one student is present, this is a private lesson: speak',
        '  to them by their name or as "you". Do not conjure classmates,',
        '  and never put a question to someone who is not in the room.',
        '- Spread your attention deliberately. If someone has not spoken in',
        '  a while, invite them in warmly by name with an easy question.',
        '  Never point out that someone has been quiet, and never scold.',
        '- When one student misses an idea, reteach it to the whole group',
        '  without dwelling on who missed it. Name ideas, never failings.',
        '- Every few minutes, take the group pulse with group_check: one',
        '  multiple-choice question everyone answers privately. You get the',
        '  anonymous spread back; teach to it. If most missed it, take the',
        '  idea again from a different angle before moving on.',
        '- Greet people who join mid-session in one short breath, tell them',
        '  in one sentence where the lesson is, and carry on.',
        '- Plain language always. Keep technical terms, names and numbers',
        '  exactly as the document writes them. Never use em dashes in',
        '  anything you write on the board.',
        '- When the material is covered, or the group asks to stop, close',
        '  like a real teacher: a short spoken recap, a word of',
        '  encouragement, goodbye. Then call end_lesson.',
      ].join('\n'),
      summary ? `What the document covers:\n${summary}` : '',
      chapterTitle
        ? `Today's focus, in this order: "${chapterTitle}". Teach these chapters and only these; mention neighbouring material only when a chapter genuinely leans on it.`
        : '',
      '',
      'The material, page by page. Teach it in this order:',
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
