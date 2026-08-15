/**
 * The API's public shape: request/response DTOs and the SSE event catalogue.
 *
 * This is the one place the frontend and backend must agree. It has no imports
 * so it can be copied into the web app verbatim (or published as a package
 * later) without dragging server dependencies along.
 */

// ── Shared vocabulary ────────────────────────────────────────────────────────

export type Level = 'standard' | 'easiest';
export type BlockType = 'headingOne' | 'headingTwo' | 'paragraph' | 'bullet';
export type Block = { type: BlockType; text: string };

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export type PageStatus = 'pending' | 'processing' | 'done' | 'failed';
export type PipelineStep =
  | 'convert'
  | 'extract'
  | 'summarize'
  | 'topics'
  | 'embed'
  | 'simplify_standard'
  | 'simplify_easiest'
  | 'export';
export type PipelineStatus =
  'queued' | 'running' | 'done' | 'failed' | 'skipped';
export type HighlightAction = 'explain' | 'simplify' | 'define' | 'visualize';
/** What a chat question was about; `prerequisite` = a concept a chapter assumes. */
export type ChatOrigin = Exclude<HighlightAction, 'visualize'> | 'prerequisite';
export type PlanCode = 'free' | 'pro';

// ── Errors ───────────────────────────────────────────────────────────────────

/** Every failure uses this envelope, with a stable machine-readable `code`. */
export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  LIMIT_REACHED: 'LIMIT_REACHED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  DOC_NOT_READY: 'DOC_NOT_READY',
  ALREADY_IN_PROGRESS: 'ALREADY_IN_PROGRESS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  STORAGE_BUSY: 'STORAGE_BUSY',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ── Auth ─────────────────────────────────────────────────────────────────────

export type RegisterRequest = { email: string; password: string; name: string };
export type LoginRequest = { email: string; password: string };
export type LoginResponse = { accessToken: string; expiresIn: number };
export type MeResponse = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  defaultLevel: Level;
  plan: PlanCode;
};

// ── Documents ────────────────────────────────────────────────────────────────

export type UploadIntentRequest = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

export type UploadIntentResponse = {
  documentId: string;
  uploadUrl: string;
  /** `direct` streams straight to storage; `proxy` posts through this API. */
  uploadMode: 'direct' | 'proxy';
};

export type DocumentListItem = {
  id: string;
  title: string;
  /** `generated` documents were written by the model, not uploaded. */
  source: DocumentSource;
  fileName: string;
  format: string;
  status: DocumentStatus;
  pageCount: number | null;
  simplifiedCount: number;
  progress: number;
  failureReason: string | null;
  simplificationUnavailable: boolean;
  createdAt: string;
};

export type DocumentDetail = DocumentListItem & {
  contentVersion: number;
  steps: { step: PipelineStep; status: PipelineStatus; error: string | null }[];
  simplified: Record<Level, { done: number; failed: number; total: number }>;
  topicsReady: boolean;
  easiestState: 'locked' | 'generating' | 'ready';
  position: { lastPage: number; furthestPage: number; level: string } | null;
};

export type PageTextResponse = {
  pages: { pageNumber: number; text: string; isEmpty: boolean }[];
};

export type SimplifiedPagesResponse = {
  level: Level;
  pages: { pageNumber: number; status: PageStatus; blocks: Block[] }[];
};

export type TopicDto = {
  id: string;
  title: string;
  shortDescription: string | null;
  startPage: number;
  endPage: number;
  isRead: boolean;
  /** What this chapter assumes the reader already knows. */
  prerequisites: TopicPrerequisiteDto[];
};

/**
 * One thing a chapter takes for granted, resolved against this reader:
 *  - `covered`   — an earlier chapter explains it and they have read it
 *  - `available` — an earlier chapter explains it; they haven't read it yet
 *  - `unknown`   — the document never explains it
 * External concepts the reader has already been taught are filtered out
 * server-side rather than shown resolved — an emptying list is the point.
 */
export type TopicPrerequisiteDto = {
  id: string;
  concept: string;
  why: string;
  state: 'covered' | 'available' | 'unknown';
  /** Set for internal prerequisites: the chapter to jump back to. */
  coveredByTopicId: string | null;
};

// ── Highlight actions ────────────────────────────────────────────────────────

export type HighlightRequest = {
  action: Exclude<HighlightAction, 'visualize'>;
  selection: string;
  pageNumber: number;
};

export type VisualizeResponse = {
  results: { url: string; thumbnail: string; source: string }[];
};

export type LookupDto = {
  id: string;
  action: HighlightAction;
  selection: string;
  pageNumber: number | null;
  answer: unknown;
  createdAt: string;
};

// ── Document chat ────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

/**
 * One message in a document's chat.
 *
 * A message that began as a highlight keeps its origin: which action was
 * pressed, the passage that was quoted, and the page it came from. Typed
 * messages leave all three null.
 */
export type ChatMessageDto = {
  id: string;
  role: ChatRole;
  text: string;
  highlightAction: ChatOrigin | null;
  quotedText: string | null;
  pageNumber: number | null;
  sources: { pageNumber: number; text: string }[] | null;
  createdAt: string;
};

export type ChatHistoryResponse = {
  /** Oldest first — the order the panel renders. */
  messages: ChatMessageDto[];
  /** True when older messages exist before the first one returned. */
  hasMore: boolean;
};

// ── Notes ────────────────────────────────────────────────────────────────────

/**
 * Where a note came from.
 *
 * `typed` is the reader writing in the panel; `highlight` a passage they
 * selected; `chat` an answer they kept; `lesson` something said during a
 * tutor session; `recap` a wrap-up they saved. The panel and the export both
 * read this, so a kept answer can be shown as a quote rather than as the
 * reader's own words.
 */
export type NoteSource = 'typed' | 'highlight' | 'chat' | 'lesson' | 'recap';

export type NoteDto = {
  id: string;
  body: string;
  /** The page it was taken on, when there was one. */
  pageNumber: number | null;
  topicId: string | null;
  /** The passage it was written against, for highlight and chat notes. */
  quotedText: string | null;
  source: NoteSource;
  createdAt: string;
  updatedAt: string;
};

export type NotesResponse = {
  /** Newest first — the order the panel renders. */
  notes: NoteDto[];
  /** True when older notes exist beyond the ones returned. */
  hasMore: boolean;
};

/** A note read outside its document, where it has to name where it came from. */
export type NoteWithDocumentDto = NoteDto & {
  documentId: string;
  documentTitle: string;
};

export type AllNotesResponse = {
  notes: NoteWithDocumentDto[];
  hasMore: boolean;
};

// ── Session recap ────────────────────────────────────────────────────────────

/**
 * What one sitting with a document covered.
 *
 * Written from what actually happened — the pages read, the questions asked,
 * the checks answered — rather than from the document as a whole, which is
 * what makes it a recap of your session and not a summary of the chapter.
 */
export type RecapBody = {
  /** The through-line, in one or two sentences. */
  headline: string;
  covered: { title: string; gist: string; page: number | null }[];
  /** The terms this stretch of reading turned on. */
  keyTerms: { term: string; meaning: string }[];
  /** Where the evidence says it did not land. */
  shaky: { what: string; why: string; page: number | null }[];
  /** One thing worth doing next, phrased as an action. */
  nextStep: string;
};

export type RecapDto = {
  id: string;
  fromPage: number;
  toPage: number;
  body: RecapBody;
  createdAt: string;
};

// ── Learn a topic ────────────────────────────────────────────────────────────

/** Uploaded by the reader, or written by the model on request. */
export type DocumentSource = 'uploaded' | 'generated';

export type LearnDepth = 'primer' | 'solid' | 'deep' | 'exhaustive';

/**
 * One question in the pre-generation interview, written for the topic rather
 * than drawn from a fixed list — "how much chemistry do you already know?"
 * beats "select your level" when the topic is organic chemistry.
 */
export type LearnQuestion = {
  id: string;
  question: string;
  /** Two to four answers, ordered from least to most prepared. */
  options: string[];
};

export type LearnInterviewResponse = {
  /** Cleaned-up version of what the reader typed, used as the title. */
  topic: string;
  questions: LearnQuestion[];
};

export type LearnGenerateRequest = {
  topic: string;
  depth: LearnDepth;
  /** Answers keyed by question id; unanswered questions are simply absent. */
  answers?: Record<string, string>;
  /** Why they are learning it — exam, work, curiosity. Free text. */
  goal?: string;
};

/** What the reader asked for, kept with the document that came out of it. */
export type DocumentBrief = {
  topic: string;
  depth: LearnDepth;
  answers: Record<string, string>;
  goal: string | null;
  /**
   * What the writer deliberately left out at this depth, listed at the end of
   * the document and offered as the next expansion.
   */
  furtherTopics?: string[];
  /** Folded in by an expansion, so the rewrite must cover them. */
  mustCover?: string[];
};

// ── Continue studying ────────────────────────────────────────────────────────

/**
 * Where the reader left off, across all three things they were doing: reading
 * a page, working through a syllabus, and being tested on it.
 *
 * `understanding` is null until enough questions have been answered to mean
 * anything — an untested document must never show a score, invented or zero.
 */
export type StudySnapshot = {
  document: DocumentListItem;
  lastStudiedAt: string;
  reading: { lastPage: number; level: 'original' | Level };
  lesson: {
    topicsTaught: number;
    topicsTotal: number;
    /** The topic the saved page falls inside, if the document has topics. */
    currentTopic: string | null;
  };
  understanding: {
    /** 0-100 across scored topics, or null when too little evidence. */
    score: number | null;
    testedTopics: number;
    weakTopics: number;
  };
};

// ── Billing ──────────────────────────────────────────────────────────────────

export type PlanDto = {
  code: PlanCode;
  name: string;
  priceNgn: number;
  limits: {
    documentsPerMonth: number | null;
    maxPages: number;
    easiestPerMonth: number | null;
    highlightsPerDay: number | null;
    watermarkedExports: boolean;
  };
};

export type SubscriptionResponse = {
  plan: PlanCode;
  status: string | null;
  currentPeriodEnd: string | null;
  usage: {
    documentsThisMonth: number;
    easiestThisMonth: number;
    highlightsToday: number;
  };
};

// ── Voice ────────────────────────────────────────────────────────────────────

/** `chat` answers questions; `teach` runs the lesson and drives the reader. */
export type VoiceMode = 'chat' | 'teach';

/**
 * The functions a teach-mode session may call. Declared server-side, executed
 * client-side — every one of them is a UI action, and the browser is where the
 * UI lives. Names are contract: both sides match on them.
 */
export const TEACH_TOOLS = {
  GO_TO_PAGE: 'go_to_page',
  REVEAL_POINT: 'reveal_point',
  END_LESSON: 'end_lesson',
  SHOW_IMAGES: 'show_images',
  DRAW_DIAGRAM: 'draw_diagram',
  FOCUS_BOARD: 'focus_board',
  MARK_TOPIC_COMPLETE: 'mark_topic_complete',
  ASK_QUIZ: 'ask_quiz',
  ASK_FLASHCARD: 'ask_flashcard',
  REPORT_UNDERSTANDING: 'report_understanding',
  UPDATE_LEARNER_PROFILE: 'update_learner_profile',
  CHECK_PREREQUISITES: 'check_prerequisites',
  TEACH_PREREQUISITE: 'teach_prerequisite',
} as const;
export type TeachToolName = (typeof TEACH_TOOLS)[keyof typeof TEACH_TOOLS];

export type DiagramResponse = { title: string; mermaid: string };

export type AssessmentKind = 'mcq' | 'flashcard' | 'verbal';

/** Per-topic understanding, computed from assessment events at read time. */
export type MasteryResponse = {
  topics: {
    topicId: string;
    title: string;
    /** 0–100, or null when there isn't enough evidence yet. */
    score: number | null;
    events: number;
    needsRevisit: boolean;
  }[];
  /** A roster id worth trying for the revisit, or null. */
  recommendedTutorId: string | null;
};

/** How this student learns — read into every lesson, rewritten by the loop. */
export type DialSource = 'default' | 'auto' | 'manual';

export type LearnerProfileDto = {
  pace: 'slower' | 'steady' | 'faster';
  depth: 'lighter' | 'standard' | 'deeper';
  interactivity: 'less' | 'standard' | 'more';
  styleNotes: string | null;
  /** Per dial: who set it. `manual` means the reflex may not touch it. */
  paceSource: DialSource;
  depthSource: DialSource;
  interactivitySource: DialSource;
};

/** One recorded change to how the app teaches this reader, with its reason. */
/** An adaptation that applies inside one document only. */
export type LocalAdaptationDto = {
  documentId: string;
  documentTitle: string;
  paceDelta: 'slower' | 'none' | 'faster';
  depthDelta: 'deeper' | 'none' | 'lighter';
  reason: string | null;
};

export type ProfileChangeDto = {
  id: string;
  field: 'pace' | 'depth' | 'interactivity' | 'style_notes';
  fromValue: string | null;
  toValue: string;
  source: 'auto' | 'tutor' | 'manual';
  reason: string | null;
  createdAt: string;
};

/** A tutor as the picker sees it — persona prompts stay server-side. */
export type TutorDto = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  color: string;
  dials: {
    pace: 'brisk' | 'measured' | 'unhurried';
    breakdown: 'light' | 'thorough' | 'maximal';
    interactivity: 'low' | 'medium' | 'high';
  };
};

/** What the browser needs to open its own realtime WebRTC connection. */
export type VoiceSessionResponse = {
  clientSecret: string;
  model: string;
  expiresAt: string | null;
  /**
   * The tutor's standing instructions. The client appends the current page's
   * text and sends the combined string in `session.update` as the reader
   * moves, so it must hold the full base to rebuild from.
   */
  baseInstructions: string;
};

// ── SSE ──────────────────────────────────────────────────────────────────────

/** Event names on `GET /documents/:id/events` (technical design §5). */
export type SseEvent =
  | { type: 'document.status'; status: DocumentStatus }
  | { type: 'document.converted'; pageCount: number }
  | { type: 'document.extracted'; pageCount: number }
  | { type: 'document.topics_ready'; topicCount: number }
  | { type: 'page.simplified'; pageNumber: number; level: Level }
  | {
      type: 'page.simplify_failed';
      pageNumber: number;
      level: Level;
      attempts: number;
    }
  | { type: 'document.simplified'; level: Level }
  | { type: 'export.ready'; exportId: string; level: Level }
  | { type: 'document.failed'; step: PipelineStep; reason: string }
  /** Replayed on connect so a reconnecting client never misses state. */
  | { type: 'snapshot'; document: DocumentDetail };

export type SseEventName = SseEvent['type'];
