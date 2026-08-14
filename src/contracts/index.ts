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
  highlightAction: Exclude<HighlightAction, 'visualize'> | null;
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
export type LearnerProfileDto = {
  pace: 'slower' | 'steady' | 'faster';
  depth: 'lighter' | 'standard' | 'deeper';
  interactivity: 'less' | 'standard' | 'more';
  styleNotes: string | null;
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
