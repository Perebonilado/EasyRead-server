/**
 * The API's public shape: request/response DTOs and the SSE event catalogue.
 *
 * This is the one place the frontend and backend must agree. It has no imports
 * so it can be copied into the web app verbatim (or published as a package
 * later) without dragging server dependencies along.
 */

// ── Shared vocabulary ────────────────────────────────────────────────────────

export type Level = 'standard' | 'easiest';
/** `code` is verbatim source — never simplified, rendered monospace. */
/**
 * `code` is verbatim source, rendered monospace. `table` is tabular data:
 * one row per line, cells separated by " | ", first line the header row.
 */
export type BlockType =
  | 'headingOne'
  | 'headingTwo'
  | 'paragraph'
  | 'bullet'
  | 'code'
  | 'table'
  /** Display-mode LaTeX, no $$ delimiters. */
  | 'math';
export type Block = { type: BlockType; text: string };

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export type PageStatus = 'pending' | 'processing' | 'done' | 'failed';
export type PipelineStep =
  | 'convert'
  | 'extract'
  | 'ocr'
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
  EMAIL_UNVERIFIED: 'EMAIL_UNVERIFIED',
  STORAGE_BUSY: 'STORAGE_BUSY',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ── Auth ─────────────────────────────────────────────────────────────────────

export type RegisterRequest = { email: string; password: string; name: string };
export type LoginRequest = { email: string; password: string };
export type LoginResponse = {
  accessToken: string;
  expiresIn: number;
  /**
   * Also handed to the client directly: iPhones block the cross-site
   * cookie wholesale (railway subdomains are separate sites), so clients
   * keep this in local storage and present it in the refresh body. The
   * httpOnly cookie still rides along for browsers that accept it.
   */
  refreshToken: string;
};
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
  pages: {
    pageNumber: number;
    status: PageStatus;
    blocks: Block[];
    /** True when this page's source text was read from a scan by a model. */
    ocr: boolean;
  }[];
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
export type NoteSource =
  | 'typed'
  | 'highlight'
  | 'chat'
  | 'lesson'
  | 'recap'
  /** A question the student posed before the material — answered at the topic's end. */
  | 'question'
  /** A board saved from the lecture, with the moment it was saved. */
  | 'board';

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

// ── Page figures ─────────────────────────────────────────────────────────────

/**
 * A figure belonging to a page — extracted from an uploaded PDF or carried
 * over from an imported web page. Figures travel beside the text: the
 * simplified pane shows a page's figures under its blocks.
 */
export type PageAssetDto = {
  id: string;
  pageNumber: number;
  width: number;
  height: number;
  caption: string | null;
};

// ── Import from the web ──────────────────────────────────────────────────────

/** One page of a docs site, as the import wizard's picker shows it. */
export type ImportPageDto = {
  url: string;
  title: string;
  /** Nesting depth in the site's own nav; the picker indents by it. */
  depth: number;
};

export type ImportDiscoverResponse = {
  /** The entry URL after redirects — what the import will be scoped to. */
  url: string;
  /** The site's own title, for the wizard heading and the document title. */
  title: string;
  /** Docs framework recognised, or null. Shown as a small badge. */
  framework: string | null;
  /** The nav in reading order. Empty means only the entry page was found. */
  pages: ImportPageDto[];
};

/**
 * What an imported document was built from: the pages the reader chose, in
 * the site's own nav order, and — once typeset — the chapter page ranges the
 * topics step should use instead of inferring structure.
 */
export type ImportManifest = {
  url: string;
  pages: ImportPageDto[];
  chapters: { title: string; startPage: number; endPage: number }[] | null;
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

/** Uploaded by the reader, written by the model, or imported from the web. */
export type DocumentSource = 'uploaded' | 'generated' | 'imported' | 'starter';

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

/** Pro is sold monthly or yearly; the yearly price is the discounted one. */
export type BillingInterval = 'monthly' | 'yearly';

/**
 * Normalised across gateways. Every provider names these differently; the
 * server maps into this set so nothing downstream has to know which one is
 * bound.
 */
export type SubscriptionStatus =
  'active' | 'trialing' | 'past_due' | 'paused' | 'cancelled' | 'expired';

export type PlanDto = {
  code: PlanCode;
  name: string;
  /** Whole US dollars. Pricing is USD everywhere, by design. */
  priceUsdMonthly: number;
  priceUsdYearly: number;
  limits: {
    documentsPerMonth: number | null;
    /** Daily active-study allowance in minutes; null is unlimited. */
    studyMinutesPerDay: number | null;
    /** Monthly voice allowance in minutes; purchased credits stack on top. */
    voiceMinutesPerMonth: number | null;
    watermarkedExports: boolean;
  };
};

/** The study clock, as the heartbeat answers it. */
export type StudyClockDto = {
  usedSeconds: number;
  limitSeconds: number | null;
  remainingSeconds: number | null;
};

/** The voice wallet: allowance remainder plus purchased credits. */
export type VoiceBalanceDto = {
  remainingSeconds: number | null;
  allowanceSeconds: number | null;
  usedThisMonthSeconds: number;
  creditSeconds: number;
};

/** The purchasable credit bundles; ids are contract with the client. */
export type CreditBundleId = 'min30' | 'min90' | 'min220';

export type SubscriptionResponse = {
  plan: PlanCode;
  status: SubscriptionStatus | null;
  interval: BillingInterval | null;
  currentPeriodEnd: string | null;
  /** True once cancelled: Pro runs to the end of the paid period, then stops. */
  cancelAtPeriodEnd: boolean;
  /** Which gateway holds the card, for the "manage payment" affordance. */
  provider: string | null;
  usage: {
    documentsThisMonth: number;
  };
  studyTime: StudyClockDto;
  voice: VoiceBalanceDto;
};

/**
 * Where to send the customer to pay.
 *
 * Always a hosted page on the gateway's own domain, so no payment script
 * and no card field ever loads in our client.
 */
export type CheckoutResponse = { url: string };

/** The gateway's own billing management page, for cards and invoices. */
export type PortalResponse = { url: string | null };

// ── Voice ────────────────────────────────────────────────────────────────────

/** `chat` answers questions; `teach` runs the lesson and drives the reader. */
export type VoiceMode = 'chat' | 'teach' | 'lecture';

/** What the student said they want from today's session. */
export type LessonIntent = 'quick' | 'thorough' | 'gentle';

// ── Lectures ────────────────────────────────────────────────────────────────

/** A scripted lecture segment's life: written, voiced, or given up on. */
export type LectureSegmentStatus =
  | 'pending'
  | 'writing'
  /** The script exists; its audio has not been made yet. */
  | 'voicing'
  | 'done'
  | 'failed';

/**
 * How the lecture teaches: how much hand-holding, how much haste. The same
 * plan is written three ways; a learner can switch between them mid-idea.
 */
export type LectureStyle = 'gentle' | 'steady' | 'brisk';
export const LECTURE_STYLE_KEYS: readonly LectureStyle[] = [
  'gentle',
  'steady',
  'brisk',
];

/**
 * What a lecture row is. A page is the lecture proper; a part is the
 * second piece of a page voiced as two (a slow learner's long page, cut at
 * an idea). The others sit around a chapter: the words a slow learner
 * hears before it (terms), the check of what stuck after it (check), and
 * the review a returning learner hears before carrying on (review). All
 * share their page's number and play in the order review, terms, page,
 * part, check.
 */
export type SegmentKind =
  'page' | 'part' | 'map' | 'terms' | 'check' | 'review';
export const SEGMENT_KIND_KEYS: readonly SegmentKind[] = [
  'review',
  'terms',
  'page',
  'part',
  'check',
];

/**
 * The board's own life. A page plays whether or not its board exists:
 * `none` is a row from before boards, `pending` has its words but not its
 * times yet, `skipped` is a row with nothing to write (a bridge).
 */
export type BoardStatus = 'none' | 'pending' | 'done' | 'failed' | 'skipped';

/** The follow-along track's own life: none until the row is voiced, done once it points into the note. */
export type FollowStatus = 'none' | 'pending' | 'done' | 'failed';

export interface LectureSegmentDto {
  pageNumber: number;
  kind: SegmentKind;
  status: LectureSegmentStatus;
  boardStatus: BoardStatus;
  /** Whether the row's follow-along track exists; absent on older servers. */
  followStatus?: FollowStatus;
  /** Playback length, known only once the audio exists. */
  durationMs: number | null;
  /** A one-line crossing of a page with nothing to teach. */
  bridge: boolean;
  /**
   * Character offsets where each idea (move) of the page begins in the
   * spoken script, so a position can be mapped to an idea and back when
   * the learner switches style. One entry per move; empty until written.
   */
  moveOffsets: number[];
  /** Length of the spoken script in characters; null until written. */
  scriptLength: number | null;
}

export interface LectureTopicDto {
  topicId: string;
  title: string;
  segments: LectureSegmentDto[];
  /** The chapter's map as the learner reads it while the map plays; absent until the map is written. */
  map?: {
    about: string;
    stops: { name: string; line: string }[];
    landing: string;
  };
}

/** Where the student stopped listening, so any device can resume there. */
export interface LecturePosition {
  pageNumber: number;
  offsetMs: number;
  style: LectureStyle;
  /** When it was last saved; absent on a position just written by the client. */
  updatedAt?: string | null;
}

/** How much of one style of the lecture exists. */
/** What the client fetches for one row's board: the timeline and the word times it was timed on. */
export interface LectureBoardResponse {
  board: unknown;
  wordTimes: unknown;
}

/** What the client fetches for one row's follow-along: the track into the note. */
export interface LectureFollowResponse {
  track: unknown;
}

export interface LectureStyleSummary {
  total: number;
  ready: number;
}

export interface LectureStatusResponse {
  /** True once any lecture row exists for the document's current version. */
  generated: boolean;
  /** The style the segments below belong to. */
  style: LectureStyle;
  totalSegments: number;
  readySegments: number;
  failedSegments: number;
  topics: LectureTopicDto[];
  position: LecturePosition | null;
  /** What exists in every style, so the picker knows what a switch costs. */
  styles: Record<LectureStyle, LectureStyleSummary>;
  /** The style the learner chose for this document or for every document; null when the bar should ask. */
  chosenStyle: LectureStyle | null;
  styleSource: 'document' | 'account' | 'none';
  /** Whether the lecture runs its beats around each chapter: chosen for this document, for every document, or off. */
  interactive: boolean;
  interactiveSource: 'document' | 'account' | 'none';
}

/**
 * The functions a teach-mode session may call. Declared server-side, executed
 * client-side — every one of them is a UI action, and the browser is where the
 * UI lives. Names are contract: both sides match on them.
 */
export const TEACH_TOOLS = {
  REVEAL_POINT: 'reveal_point',
  GO_TO_PAGE: 'go_to_page',
  END_LESSON: 'end_lesson',
  SHOW_IMAGES: 'show_images',
  DRAW_DIAGRAM: 'draw_diagram',
  SKETCH: 'draw_sketch',
  SAVE_QUESTION: 'save_question',
  RECALL: 'recall_page',
  ASK_DIAGRAM: 'ask_diagram_check',
  COMPUTE: 'compute',
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

/**
 * What a tutor answering a question mid-lecture may do to the whiteboard.
 * Executed client-side, like the teaching tools; the board the learner is
 * looking at is the one the tutor draws on.
 */
export const LECTURE_TOOLS = {
  SHOW: 'board_show',
  WRITE: 'board_write',
  ARROW: 'board_arrow',
  CUE: 'board_cue',
  NEW: 'board_new',
  DIAGRAM: 'board_diagram',
  REST: 'board_rest',
  FIND: 'book_find',
  RESUME: 'lecture_resume',
  /** The interactive session: the tutor files each verdict, and can put an item on the sheet. */
  VERDICT: 'lecture_verdict',
  CHOICES: 'lecture_show_choices',
  BLANK: 'lecture_show_blank',
} as const;
export type LectureToolName =
  (typeof LECTURE_TOOLS)[keyof typeof LECTURE_TOOLS];

/** Passages of the book found for the tutor mid-conversation, with the page each is on. */
export interface LectureBookFindResponse {
  passages: { pageNumber: number; text: string }[];
}

/** A pen-drawn diagram for the live board: geometry in the space the client asked for (the region it will draw into, in board units), and the order to draw it in. */
export interface LectureBoardDiagramResponse {
  geometry: {
    id: string;
    title: string;
    kind: 'process' | 'structure' | 'comparison';
    space: { w: number; h: number };
    nodes: {
      id: string;
      label: string;
      shape: 'box' | 'ellipse' | 'diamond' | 'cylinder' | 'note';
      x: number;
      y: number;
      w: number;
      h: number;
      anchor: { charStart: number; charEnd: number };
    }[];
    edges: {
      id: string;
      from: string;
      to: string;
      label: string | null;
      points: [number, number][];
      arrow: 'end' | 'both' | 'none';
      anchor: { charStart: number; charEnd: number };
    }[];
    groups: {
      id: string;
      label: string;
      memberIds: string[];
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
    /** The marks of a figure with a shape (a ring, a line, a grid); empty for a graph. Angles in degrees, 0 at the top, clockwise. */
    marks?: {
      id: string;
      kind: 'circle' | 'dot' | 'arc' | 'line' | 'bar' | 'text';
      cx?: number;
      cy?: number;
      r?: number;
      from?: number;
      to?: number;
      x1?: number;
      y1?: number;
      x2?: number;
      y2?: number;
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      cells?: number;
      arrow?: boolean;
      label: string | null;
      lx?: number;
      ly?: number;
      size?: number;
    }[];
    /** What a reader sees, in one sentence. */
    caption?: string | null;
  };
  elementOrder: string[];
  /** The same sentence, for the tutor's landing line. */
  caption: string;
}

export type DiagramResponse = { title: string; mermaid: string };
export type SketchResponse = { title: string; svg: string };
export type DiagramCheckResponse = {
  title: string;
  /** Mermaid with exactly one node labeled "?". */
  mermaid: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};
// ── Understanding report ─────────────────────────────────────────────────────

/**
 * One idea a recall failed to produce, and whether it has since come back.
 * `resolvedAt` is set by a later grade reporting the idea covered.
 */
export type MissedIdeaDto = {
  text: string;
  timesMissed: number;
  firstMissedAt: string;
  resolvedAt: string | null;
};

/** A question the reader posed before reading, and how answering it went. */
export type OwnQuestionDto = {
  question: string;
  verdict: 'correct' | 'partial' | 'incorrect';
  explanation: string | null;
  page: number | null;
  answeredAt: string;
};

/** Something the tutor said out loud about how a chapter went. */
export type TutorNoteDto = {
  note: string;
  /** The tutor's 1–5 reading, when it recorded one. */
  rating: number | null;
  at: string;
};

/**
 * One check, as it happened: the per-chapter drill-in's row.
 *
 * The aggregates above answer "how is this chapter going"; these answer
 * "what actually happened, and what did I say at the time" — which is the
 * only view that can show confidence against outcome question by question.
 */
export type CheckDto = {
  at: string;
  kind: AssessmentKind;
  /** 0..1 as recorded. For an MCQ this is simply right or wrong. */
  score: number;
  /** Which pass this belongs to, 1-based. Rereads start a new one. */
  pass: number;
  /** The question asked, the flashcard's front, or null when neither. */
  prompt: string | null;
  /** How sure the reader said they were, before any answer was revealed. */
  confidence: number | null;
  /** Where the check came from, so the row can say so plainly. */
  source: 'guided' | 'tutor' | 'solo';
  /** Set on the reader's own pre-reading questions. */
  verdict: 'correct' | 'partial' | 'incorrect' | null;
  /** True for the visual (diagram) checks. */
  diagram: boolean;
  /** Recall grades only: what the grader said at that moment. */
  recall: {
    nailed: string[];
    missed: string[];
    focus: string[];
    resolved: string[];
  } | null;
  /** The correction, when it was persisted (checks from Aug 2026 on). */
  explanation: string | null;
  correctAnswer: string | null;
  yourAnswer: string | null;
};

export type TopicReportDto = {
  topicId: string;
  title: string;
  startPage: number;
  endPage: number;
  /** The latest pass's score, 0–100; null when evidence is too thin. */
  score: number | null;
  /** Every scored pass, oldest first. Length > 1 means it was reread. */
  passScores: number[];
  /** Latest pass minus the one before, when both scored. */
  delta: number | null;
  passes: number;
  events: number;
  lastEvidenceAt: string | null;
  /** Evidence exists but has gone cold. A label, never a penalty. */
  stale: boolean;
  needsRevisit: boolean;
  missedIdeas: MissedIdeaDto[];
  ownQuestions: OwnQuestionDto[];
  tutorNotes: TutorNoteDto[];
  /** Every check on this chapter, newest first — the drill-in. */
  checks: CheckDto[];
  band: TopicBand | null;
  /**
   * What a reread of this chapter should watch for, at most three: open
   * missed ideas first, then the latest recall's focus pointers, deduped.
   */
  nextStepPointers: string[];
};

/**
 * The chapter's standing as a word, so the verdict arrives pre-interpreted
 * and the raw score can stay small. Null when there is nothing to say.
 */
export type TopicBand = 'revisit' | 'settling' | 'solid' | 'unverified';

/**
 * How the reading actually went, per document: composed from assessment
 * events at read time, never stored. Every number here traces to events.
 */
export type DocumentReportResponse = {
  topics: TopicReportDto[];
  /** Topic ids worth another pass, weakest and stalest first. */
  revisitQueue: string[];
  /** Topic ids that are strong *and* have enough evidence to say so. */
  strengths: string[];
  /** Chapters marked read with no checks in their latest pass. */
  unverified: string[];
  /** Confidence versus competence; null bias means too little rated evidence. */
  calibration: { bias: number | null; n: number };
  /** Totals for the header line. */
  totals: { checks: number; chaptersWithEvidence: number; reread: number };
};

// ── Guided reading ───────────────────────────────────────────────────────────

/**
 * The skim ritual's material (guided reading): a chapter preview written for
 * comprehension rather than extracted mechanically. One per topic — it
 * derives from the document alone, so it is generated once and cached.
 */
export type TopicPreviewBody = {
  /** What the chapter is about and why it matters here, in plain sentences. */
  about: string;
  /** The argument's movements in order, one short line each. */
  outline: string[];
  /** Terms the reader will meet, each with a one-line gloss. */
  keyTerms: { term: string; gloss: string }[];
  /** Where the chapter lands — its conclusion stated plainly, no teasing. */
  howItEnds: string;
  /**
   * Prompts that guide a from-memory retelling by pointing at the
   * chapter's shape — openings, comparisons, examples, landings — while
   * revealing none of its content.
   */
  recallCues: string[];
};

export type TopicPreviewResponse = {
  topicId: string;
  body: TopicPreviewBody;
  /** True when served from the cache rather than freshly generated. */
  cached: boolean;
};

/**
 * The system's independent grade of a book-closed recall, judged against the
 * chapter itself. Feedback names ideas from the text, never the person.
 */
export type RecallGradeResponse = {
  /** 0–1: how much of the chapter's substance the recall carried. */
  score: number;
  /**
   * Ideas from earlier attempts that this recall finally covered, in the
   * grader's original wording so the report can close them.
   */
  resolved: string[];
  /** Ideas the recall stated correctly. */
  nailed: string[];
  /** Load-bearing ideas the recall did not mention. */
  missed: string[];
  /** What a re-read should focus on, phrased as pointers. */
  focus: string[];
};

/** Verdict on a reader answering their own pre-reading question. */
export type QuestionCheckResponse = {
  verdict: 'correct' | 'partial' | 'incorrect';
  /** One or two sentences: what's right, what's missing, per the document. */
  explanation: string;
  /** Page where the document answers it, or null when unplaceable. */
  page: number | null;
};

export type TranscribeResponse = { text: string };

export type ComputeResponse =
  | { ok: true; result: string; tex: string | null }
  | { ok: false; error: string };

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
  /**
   * Confidence vs competence, from rated checks: positive = overconfident,
   * negative = underconfident, null = not enough rated evidence (n < 5).
   */
  calibrationBias: number | null;
  calibrationN: number;
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
  /** A studio-grade voice that costs more to run — marked in the picker. */
  premiumVoice: boolean;
  dials: {
    pace: 'brisk' | 'measured' | 'unhurried';
    breakdown: 'light' | 'thorough' | 'maximal';
    interactivity: 'low' | 'medium' | 'high';
  };
};

/**
 * What the browser needs to open its own realtime connection — shaped by the
 * provider the chosen tutor's voice lives on.
 *
 * `baseInstructions` is common: the tutor's standing instructions, which the
 * client combines with the current page's text as the reader moves (OpenAI:
 * `session.update`; ElevenLabs: a prompt override at connect, then
 * contextual updates).
 */
export type VoiceSessionResponse =
  | {
      provider: 'openai';
      clientSecret: string;
      model: string;
      expiresAt: string | null;
      baseInstructions: string;
    }
  | {
      provider: 'elevenlabs';
      conversationToken: string;
      agentId: string;
      /** The tutor's ElevenLabs voice, applied as a TTS override. */
      voiceId: string;
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
  /** An import fetching its pages; fires per batch while status=uploading. */
  | { type: 'import.progress'; fetched: number; total: number }
  | { type: 'document.failed'; step: PipelineStep; reason: string }
  /** A lecture page finished its audio and can be played now. */
  | {
      type: 'lecture.segment_ready';
      pageNumber: number;
      style: LectureStyle;
      /** Omitted means the page itself. */
      kind?: SegmentKind;
    }
  | {
      type: 'lecture.segment_failed';
      pageNumber: number;
      style: LectureStyle;
      kind?: SegmentKind;
    }
  /** A row's board is timed and can be fetched. */
  | {
      type: 'lecture.board_ready';
      pageNumber: number;
      style: LectureStyle;
      kind?: SegmentKind;
    }
  /** A row's follow-along track points into the note and can be fetched. */
  | {
      type: 'lecture.follow_ready';
      pageNumber: number;
      style: LectureStyle;
      kind?: SegmentKind;
    }
  | {
      type: 'lecture.board_failed';
      pageNumber: number;
      style: LectureStyle;
      kind?: SegmentKind;
    }
  /** Replayed on connect so a reconnecting client never misses state. */
  | { type: 'snapshot'; document: DocumentDetail };

export type SseEventName = SseEvent['type'];

// ── Study groups (classroom plan) ────────────────────────────────────────────

export type GroupMemberDto = {
  userId: string;
  name: string;
  role: 'owner' | 'member';
};

export type GroupSummaryDto = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  /** First names for the card face; full roster lives in the detail. */
  memberNames: string[];
  /** Every member may share their own room, so the list carries the code. */
  inviteCode: string;
  liveSessionId: string | null;
  /** Enough to say who is teaching and for how long, without a second call. */
  liveSession: {
    id: string;
    tutorId: string;
    startedAt: string;
  } | null;
};

export type StudySessionDto = {
  id: string;
  groupId: string;
  hostId: string;
  documentId: string;
  /** Chapter scope; empty means the whole document. */
  topicIds: string[];
  tutorId: string;
  status: 'live' | 'ended';
  startedAt: string;
};

export type GroupPlanDto = {
  /** Null until the owner picks one; nothing is preselected. */
  documentId: string | null;
  topicIds: string[];
  tutorId: string | null;
};

export type GroupDetailDto = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  inviteCode: string;
  members: GroupMemberDto[];
  /** What the next session will study; it persists between visits. */
  plan: GroupPlanDto;
  liveSession: StudySessionDto | null;
};

// ── Testing engine ───────────────────────────────────────────────────────────

export type ItemKindDto =
  'mcq' | 'flashcard' | 'cloze' | 'true_false' | 'short';

/**
 * One question as the client sees it — stem and options only.
 *
 * The answer key is deliberately absent: it arrives with the response to an
 * answer, so no amount of reading the page reveals it beforehand.
 */
export type QueuedItemDto = {
  id: string;
  documentId: string;
  documentTitle: string;
  topicId: string | null;
  kind: ItemKindDto;
  stem: string;
  options: string[];
  hint: string | null;
  /** True the first time this reader meets the item. */
  isNew: boolean;
};

export type ReviewQueueResponse = {
  items: QueuedItemDto[];
  due: number;
  documents: number;
  /** Across the whole due set, not just the page of items returned. */
  newCount: number;
  byDocument: { title: string; count: number }[];
  nextDueAt: string | null;
  estimatedMinutes: number;
};

export type GenerateItemsResponse = {
  created: number;
  discarded: number;
  /** The questions just written, ready to be taken as their own test. */
  items: QueuedItemDto[];
};

export type AnswerItemResponse = {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  /** The sentence the verifier matched, for "where did this come from". */
  groundingQuote: string | null;
  sourcePage: number | null;
  dueAt: string;
  intervalDays: number;
};
