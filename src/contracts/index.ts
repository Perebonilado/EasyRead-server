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
