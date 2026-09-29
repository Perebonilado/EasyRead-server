/**
 * The API's public shape: request/response DTOs and the SSE event catalogue.
 *
 * This is the one place the frontend and backend must agree. It has no imports
 * so it can be copied into the web app verbatim (or published as a package
 * later) without dragging server dependencies along.
 */

// ── Shared vocabulary ────────────────────────────────────────────────────────

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
  | 'math'
  /** A calculation worked through: `text` says the problem in words; `working` is the working. */
  | 'working';
export type Block = {
  type: BlockType;
  text: string;
  /** A "working" block's working, every line checked by code. */
  working?: WorkedSolutionDto;
};

/**
 * A calculation worked through, step by step: what the problem gives and
 * wants, each step's line and what is done to get it, and the answer with
 * its units. Every line was checked by code before it was kept.
 */
/** Visualize's voice engines, as the admin page offers them. */
export type SceneVoiceEngineDto =
  'gemini' | 'kokoro' | 'openai' | 'elevenlabs' | 'cartesia';

/** The engines with a list of voices to choose from. */
export type ListedVoiceEngineDto = 'elevenlabs' | 'cartesia';

/** Who may be given a voice of their own: the narrator, and each kind of character. */
export type VoiceRoleDto =
  | 'narrator'
  | 'girl'
  | 'boy'
  | 'woman'
  | 'man'
  | 'old woman'
  | 'old man'
  | 'creature'
  | 'divine'
  | 'crowd';

/** A voice ElevenLabs or Cartesia offers, as the admin page lists it. */
export interface VoiceOptionDto {
  id: string;
  name: string;
  /** Its own words for itself, and its gender, age and accent. */
  description: string;
  /**
   * A sample of it to play, where the engine has one: a URL anyone may
   * play (ElevenLabs'), or a path on this API, starting with `/`, fetched
   * signed in (Cartesia's samples ask for the key, so the server fetches them).
   */
  previewUrl: string | null;
}

/** Which engine voices Visualize, and which could. */
export interface SceneVoiceStatusDto {
  /** The admin's choice; null for the deployment's own. */
  chosen: SceneVoiceEngineDto | null;
  /** What the next page is voiced by. */
  current: SceneVoiceEngineDto;
  /** The deployment's own, from SCENE_VOICE_ENGINE. */
  deployment: SceneVoiceEngineDto;
  options: {
    value: SceneVoiceEngineDto;
    label: string;
    /** Set up here: a key, or a server. */
    ready: boolean;
    model: string;
    voice: string;
  }[];
  /**
   * The voices the narrator and each kind of character speak in, on an
   * engine with a list to choose from (ElevenLabs, Cartesia): the one
   * speaking, else the first set up; null where there is none set up.
   */
  cast: {
    engine: ListedVoiceEngineDto;
    roles: {
      value: VoiceRoleDto;
      label: string;
      /** The admin's voice; null keeps the default. */
      chosen: string | null;
      /** The voice it speaks in when none is chosen. */
      default: string;
    }[];
  } | null;
  changedAt: string | null;
}

export interface WorkedSolutionDto {
  /** What the problem gives, each a line of LaTeX ("u = 5\,\text{m/s}"). */
  given: string[];
  /** What it asks for, in words. */
  wanted: string | null;
  steps: WorkedStepDto[];
  /** The answer, LaTeX, with its units. */
  answer: string | null;
  /** The answer put back in, LaTeX. */
  check: string | null;
  /** The working stops at the last line code could stand behind; the answer is code's. */
  cut?: true;
}

/** One step of a worked solution. */
export interface WorkedStepDto {
  /** The line after this step, display LaTeX. */
  latex: string;
  /** What is done to get it: "subtract 3 from both sides". */
  does: string;
  /** Why it is allowed or why it helps; null when what is done says it. */
  why: string | null;
  /** The parts of the line this step changes, as LaTeX pieces of it. */
  changes: string[];
  /** What the voice says for it. */
  says: string;
}

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
  /** The rented voice is asleep or down: nothing was queued. */
  VOICE_UNAVAILABLE: 'VOICE_UNAVAILABLE',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_UNVERIFIED: 'EMAIL_UNVERIFIED',
  STORAGE_BUSY: 'STORAGE_BUSY',
  /** A school's document opened by a member without a pass; the client offers one. */
  SCHOOL_PASS_REQUIRED: 'SCHOOL_PASS_REQUIRED',
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
export type UserRole = 'learner' | 'admin';

export type MeResponse = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  plan: PlanCode;
  /** The platform role; `admin` runs the schools. */
  role: UserRole;
  /** The school this person belongs to, or null. */
  membership: MembershipDto | null;
};

// ── Institutions ─────────────────────────────────────────────────────────────

/** A school as a member or a visitor sees it. */
export interface InstitutionDto {
  id: string;
  name: string;
  /** The school's address: easiread.com/<slug>. */
  slug: string;
  country: string | null;
  /** What the school calls a level: "Year", "Level", "Semester". */
  levelWord: string;
  /** Whether joining needs the school's code; an email on one of its domains also admits. */
  needsInviteCode: boolean;
  emailDomains: string[];
  /** Whether joining asks for a school email and the code sent to it. */
  verifyStudents: boolean;
  /** Free for students until this date while the school onboards; null otherwise. */
  passFreeUntil?: string | null;
}

/** A school on the list a person picks from. */
export interface InstitutionListItemDto {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  verifyStudents: boolean;
}

/** A school as the admin sees it: the code included. */
export interface InstitutionAdminDto extends InstitutionDto {
  inviteCode: string | null;
  memberCount: number;
  documentCount: number;
}

export interface DepartmentDto {
  id: string;
  name: string;
  slug: string;
  orderIndex: number;
}

export interface LevelDto {
  id: string;
  name: string;
  orderIndex: number;
}

export interface CourseDto {
  id: string;
  departmentId: string;
  levelId: string | null;
  name: string;
  code: string | null;
  orderIndex: number;
}

/** A person's place in their school. */
export interface MembershipDto {
  institution: InstitutionDto;
  departmentId: string | null;
  levelId: string | null;
  role: 'student' | 'staff' | 'admin';
  /** The school email the member proved; null when the school did not ask. */
  schoolEmail: string | null;
  /** Why the member may read the school's documents; on the account's own shape only. */
  access?: SchoolAccess;
  /** The school pass, once one was ever bought. */
  pass?: SchoolPassDto | null;
}

/**
 * Why a member may read the school's documents: the first that applies.
 * `locked` means the pass, or Pro, is needed before any file opens.
 */
export type SchoolAccess = 'pro' | 'school_free' | 'pass' | 'locked';

export interface SchoolPassDto {
  status: SubscriptionStatus;
  /** When it renews, or ends if it is cancelling. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** The school's front door: enough to sign up into it and to choose a department and level. */
export interface InstitutionPublicDto {
  institution: InstitutionDto;
  departments: DepartmentDto[];
  levels: LevelDto[];
}

/** The admin's view of one school: everything in it. */
export interface InstitutionDetailDto {
  institution: InstitutionAdminDto;
  departments: DepartmentDto[];
  levels: LevelDto[];
  courses: CourseDto[];
}

export interface CatalogueDocumentDto extends DocumentListItem {
  departmentId: string | null;
  levelId: string | null;
  courseId: string | null;
  /** How far this member has read, 0 to 1; 0 when never opened. */
  read: number;
  /** When this member last read it, and the page they were on; null when never opened. */
  lastReadAt: string | null;
  lastPage: number | null;
  /** Whether any lecture audio exists yet, in any style. */
  audio: boolean;
}

/** The school's catalogue for a member: every file with where it sits, the member's own place first. */
export interface CatalogueDto {
  institution: InstitutionDto;
  departments: DepartmentDto[];
  levels: LevelDto[];
  courses: CourseDto[];
  documents: CatalogueDocumentDto[];
  membership: { departmentId: string | null; levelId: string | null };
}

export interface JoinInstitutionRequest {
  /** The school email and the code sent to it, when the school asks for them. */
  email?: string;
  code?: string;
  departmentId?: string;
  levelId?: string;
}

export interface SetMembershipRequest {
  departmentId: string | null;
  levelId: string | null;
}

/** A school's document as the admin sees it: where it sits and how far its processing has got. */
export interface MaterialDto {
  document: DocumentListItem;
  departmentId: string | null;
  levelId: string | null;
  courseId: string | null;
  orderIndex: number;
  contentHash: string | null;
  steps: { step: PipelineStep; status: PipelineStatus; error: string | null }[];
  /** The simplified note, page by page: how many are written, failed, and there are. */
  simplified: { done: number; failed: number; total: number };
  /** Lecture rows per style, the segments around a chapter included: how many exist, have their words, are being voiced, have audio, failed. */
  lecture: Record<LectureStyle, LectureTally>;
  /** Pages with a visual tutorial, or a reason there is none, over the pages. */
  visuals: { done: number; total: number };
  /** What the model calls on this document have cost so far, summed from the ledger. */
  costUsd: number;
  /** Where the document stands, as the card draws it: three bars and one word. */
  progress: MaterialProgress;
  /** The admin's drop this file arrived in; null for files uploaded before batches existed. */
  batchId: string | null;
  /** When the admin published it to the school's students; null is hidden. */
  publishedAt: string | null;
}

export interface LectureTally {
  total: number;
  scripted: number;
  /** Rows whose audio is being made right now. */
  voicing: number;
  ready: number;
  failed: number;
}

export type MaterialState =
  | 'uploading'
  | 'preparing'
  | 'writing'
  /** Every page has its words and no audio has been asked for: the admin's Voice is next. */
  | 'written'
  | 'voicing'
  | 'ready'
  | 'attention'
  | 'failed';

/** One drop of files onto the admin page, seen as a whole. */
export interface BatchDto {
  id: string;
  /** When the first file of the drop arrived. */
  createdAt: string;
  files: number;
  /** Files the admin has published. */
  published: number;
  /** Files whose text pipeline is through. */
  text: { done: number; total: number };
  /** Lecture rows with their words, all styles, over the rows seeded. */
  scripts: { done: number; total: number };
  /** Lecture rows with their audio, all styles. */
  audio: { done: number; total: number };
  /** Pages with a visual tutorial, or a reason there is none, over the pages. */
  visuals: { done: number; total: number };
  failed: number;
  untaught: number;
  costUsd: number;
  state: BatchState;
  /** The files, for the strip to filter the list by. */
  documentIds: string[];
}

export type BatchState =
  'preparing' | 'writing' | 'written' | 'voicing' | 'voiced' | 'attention';

/** The admin sending a batch, a selection, or one file to the voice. */
export interface VoiceRequest {
  batchId?: string;
  documentIds?: string[];
  /** Omitted means every style. */
  styles?: LectureStyle[];
  /** Voice every page again, keeping the words: after a pronunciation was added or fixed. */
  revoice?: boolean;
}

export interface VoiceResponse {
  documents: number;
  /** Rows sent to the voice. */
  queued: number;
  audioUsd: number;
}

/** Publish or hide a batch, a selection, or one file. */
export interface PublishRequest {
  batchId?: string;
  documentIds?: string[];
  published: boolean;
}

export interface MaterialProgress {
  /** Percent of the text pipeline done. */
  text: number;
  /** Percent of lecture pages, all styles, with their words. */
  scripts: number;
  /** Percent of lecture pages, all styles, with their audio. */
  audio: number;
  /** Pages failed, all styles, kinds included. */
  failed: number;
  /** Paragraphs the written pages left untaught, all styles, as counted when they were written. */
  untaught: number;
  state: MaterialState;
}

/** One lecture row of a document, for the admin's detail panel. */
export interface MaterialPageDto {
  pageNumber: number;
  kind: SegmentKind;
  style: LectureStyle;
  status: LectureSegmentStatus;
  error: string | null;
  /** Paragraphs of the page this row left untaught; null on rows written before it was counted. */
  untaught: number | null;
}

export interface PrepareRequest {
  /** Named documents, or a department at a level, or a course, or the whole school when none is given. */
  documentIds?: string[];
  departmentId?: string;
  levelId?: string;
  courseId?: string;
  /** Which lecture styles to write ahead. */
  styles: LectureStyle[];
  /**
   * Write: the words only, which is what Prepare does now; the audio is
   * asked for through the voice route once a batch has its words. The
   * field is kept so a client can say it and the other value is refused.
   */
  stage?: 'write';
}

export interface PrepareEstimateDto {
  documents: number;
  pages: number;
  textUsd: number;
  audioUsd: number;
  totalUsd: number;
}

export interface PrepareResponse extends PrepareEstimateDto {
  /** Documents given work. */
  queued: number;
  /** Documents with nothing left to do, or not yet through their upload. */
  skipped: number;
}

/** The admin's upload into a department at a level: the hash first, so a duplicate never sends its bytes. */
export interface AdminUploadIntentRequest extends UploadIntentRequest {
  contentHash: string;
  departmentId: string;
  levelId: string | null;
  /** An optional label within the placement. */
  courseId?: string | null;
  orderIndex?: number;
  /** The drop this file is part of: one id per drop, made by the client, so the batch can be voiced and published whole. */
  batchId?: string;
}

export type AdminUploadIntentResponse =
  UploadIntentResponse | { duplicateOf: string; title: string };

export interface MoveMaterialRequest {
  departmentId?: string;
  levelId?: string | null;
  courseId?: string | null;
  orderIndex?: number;
  title?: string;
  /** Publish to the school's students, or hide from them. */
  published?: boolean;
}

export interface CreateInstitutionRequest {
  name: string;
  /** Omitted means made from the name. */
  slug?: string;
  country?: string | null;
  levelWord?: string;
  emailDomains?: string[];
  /** True to mint a code; false for none. */
  inviteCode?: boolean;
}

export interface UpdateInstitutionRequest {
  name?: string;
  slug?: string;
  country?: string | null;
  levelWord?: string;
  emailDomains?: string[];
  /** 'rotate' mints a fresh code, 'none' removes it. */
  inviteCode?: 'rotate' | 'none';
  verifyStudents?: boolean;
}

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
  simplified: { done: number; failed: number; total: number };
  topicsReady: boolean;
  position: {
    lastPage: number;
    furthestPage: number;
    level: 'original' | 'standard';
  } | null;
  /** The school this file belongs to and its course there, for the reader's header. */
  school: {
    name: string;
    course: { id: string; name: string; code: string | null } | null;
  } | null;
};

export type PageTextResponse = {
  pages: { pageNumber: number; text: string; isEmpty: boolean }[];
};

export type SimplifiedPagesResponse = {
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
  reading: { lastPage: number; level: 'original' | 'standard' };
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
    /** Minutes of film the Studio makes a month; null is unlimited. */
    studioMinutesPerMonth: number | null;
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

/** A visual page's life: queued, being made, made, given up on, or not suited to a video. */
export type VisualSceneStatus =
  'pending' | 'making' | 'done' | 'failed' | 'not_suitable';

/** One page of a document's visuals, as the picker and the pane read it. */
export interface VisualPageDto {
  page: number;
  /** The chapter the page is in, for grouping; null for a page outside every chapter. */
  topicId: string | null;
  chapterTitle: string | null;
  /** The video's own title, once made. */
  title: string | null;
  status: VisualSceneStatus | 'none';
  /** Where a page being made is: writing, drawing, voicing, composing. */
  step: string | null;
  /** Why the page does not suit a video, or why it failed. */
  reason: string | null;
  durationMs: number | null;
  /** Set when the scene is done: fetched by the pane when it plays. */
  hasScene: boolean;
  /** How the words were timed: by the voice itself, measured on the audio, or estimated. */
  timing: SceneTiming | null;
}

/** The document's visuals: every page, in order, with its chapter. */
export interface VisualSetDto {
  documentId: string;
  pageCount: number;
  pages: VisualPageDto[];
}

export type SceneTiming = 'voice' | 'aligned' | 'estimated';
export type SceneLayoutName =
  'one' | 'row' | 'grid' | 'compare' | 'hub' | 'cycle' | 'focus' | 'stack';
export type SceneEffectName =
  'point' | 'show' | 'hide' | 'pulse' | 'zoom' | 'say';
export type SceneEnterName = 'pop' | 'fade' | 'slide' | 'wipe' | 'grow';
/** The page's feeling: how the voice sounds, and the music on a page made before the score. */
export type SceneMoodName =
  'calm' | 'bright' | 'curious' | 'serious' | 'playful';
/** What the score plays from a sentence on; "none" is quiet. */
export type SceneMusicName =
  | 'none'
  | 'calm'
  | 'curious'
  | 'bright'
  | 'playful'
  | 'motion'
  | 'solemn'
  | 'tense';
/** The score changes here, on the voice's clock: the bar line nearest it. */
export interface SceneMusicCueDto {
  atMs: number;
  state: SceneMusicName;
  /** Running high: a chase, a rush, danger close. */
  energy?: 'high';
}
/** Which family of instruments plays a document's score. */
export type SceneMusicPalette = 'lesson' | 'story' | 'verse';
/** What a drawn thing sounds like while it is on the stage. */
export type SceneAmbienceName =
  | 'heartbeat'
  | 'bubbles'
  | 'water'
  | 'wind'
  | 'rain'
  | 'fire'
  | 'electric'
  | 'machine'
  | 'clock';

/**
 * One part of a kit drawing that swings (rig 2), as the player springs it.
 * Its segments are groups of classes `dg-<id>-0` (at the root) to
 * `dg-<id>-<segments - 1>`, each nested in the one before and turning
 * about its own joint (written in the drawing) by the CSS variable
 * `--dg-<id>-<k>`, in degrees; unset, 0, as drawn.
 */
export interface SceneDangleDto {
  id: string;
  /** Where its first segment turns, in the drawing's own viewBox units (not shares of its box). */
  root: [number, number];
  segments: number;
  /** From its root to its tip, in viewBox units. */
  length: number;
  /**
   * Which way it goes from its root to its tip as drawn: a unit vector in
   * viewBox units, y down (absent on a drawing made before it was said:
   * hanging straight down). How a push or the wind turns it.
   */
  dir?: [number, number];
  /** Each segment's spring: its natural frequency, radians a second. */
  stiff: number;
  /** And its damping ratio: below 1 it overshoots and swings back. */
  damp: number;
  /** The angle each segment rests at, degrees (0: as drawn). */
  rest: number;
  /** How far each segment turns from rest at most, degrees. */
  limit: number;
  /** How much the wind moves it, 0 to 1. */
  wind: number;
  /**
   * On a person drawn from every side (rig 3): where its root is and which
   * way it hangs in each view it is seen in, by the view's name ("front",
   * "3q", "profile", "back3q", "back"). The same springs swing it in each.
   */
  views?: Record<string, { root: [number, number]; dir: [number, number] }>;
}

/** One layer of a story's place: sky, far, back, ground, stage, floor or foreground. */
export interface SceneSetLayerDto {
  id: string;
  /** How it follows the camera: 1 the people's own plane, less farther off, more nearer the camera. */
  depth: number;
  svg: string;
  /** On the floor with the people: where its things' feet stand, in the set's units. */
  feet?: number;
}

/** How a kit drawing goes when it goes somewhere. */
export type SceneGait =
  'walk' | 'waddle' | 'hop' | 'swim' | 'slither' | 'float';

/** One thing that can stand on the stage. */
export type SceneThingDto =
  | {
      id: string;
      kind: 'drawing';
      /** The drawing, sanitised, with its own CSS or SMIL animation. */
      svg: string;
      /** Width over height. */
      aspect: number;
      caption: string | null;
      /** Part name to the id of its group in the drawing. */
      parts: Record<string, string>;
      /** Part name to the id of its label's group. */
      labels: Record<string, string>;
      /** State name to the id of its overlay group. */
      states: Record<string, string>;
      /** Ids of groups hidden until an effect shows them: labels pointed at later, and states. */
      hidden: string[];
      /** Whether it animates itself; a still one gets a gentle float. */
      moves: boolean;
      /** The sound it makes while it is on the stage; absent or null for none. */
      ambience?: SceneAmbienceName | null;
      /**
       * Labels the stage sets itself beside the drawing, by part: what each
       * says. Placed per step (ScenePlaceDto.labels); absent on a drawing
       * whose labels are drawn in it.
       */
      callouts?: Record<string, string>;
      /** Of those, the parts whose label waits until the voice points at the part. */
      calloutsLater?: string[];
      /** Drawn by code, not by the artist: working, a graph, the text's own words, a timeline or a chart. */
      source?: 'math' | 'plot' | 'quote' | 'timeline' | 'chart';
      /** A story's place: the scene behind the stage, never in a slot. */
      backdrop?: true;
      /**
       * A story's place built by code, as layers at their depths, back to
       * front (studio-scenery-plan §2): each drawn at the set's width × 900
       * and moved by the camera as far as its depth says (a pan of Δx moves
       * it depth·Δx; a zoom of s scales it 1 + (s − 1)·depth). "floor" stands
       * among the people, drawn in the order of their feet (`feet`, in the
       * set's units). Absent, the player splits `svg` by its groups.
       */
      layers?: SceneSetLayerDto[];
      /**
       * How wide the set is drawn, in its units: 1600, or wider for a
       * camera that pans (1.5 or 2 times). The frame the stagings are laid
       * out in is its middle 1600: the layers' viewBox is that frame, and
       * what runs past it either side is drawn outside it, for a pan.
       */
      setWidth?: number;
      /** Where the action is on a wide set, as a share of the frame across: the wide shot centres on it, and a scene's opening pan ends there. */
      focal?: number;
      /** The floor people stand on, in the set's units: the y of its back and front edges. What stands on it follows the camera by its depth (0.8 at the back to 1.05 at the front). */
      floor?: [number, number];
      /** Drawn by the figure kit: it moves its eyes, face, head, arms and mouth as it acts. */
      rig?: true;
      /** Where its head is, as shares of its box across and down: where it looks from. */
      head?: [number, number];
      /**
       * One person drawn by the kit: each arm's shoulder, elbow and hand as
       * drawn, as shares of its box: the joints the player turns the arm
       * and forearm about, so a hand can be put where it means to go.
       */
      joints?: Record<'r' | 'l', [number, number][]>;
      /**
       * And each leg's hip, knee and foot as drawn, as shares of its box:
       * the knees bend by them, so the body sinks as far as the legs fold
       * (a crouch, sitting down) and the feet stay on the ground.
       */
      legs?: Record<'r' | 'l', [number, number][]>;
      /** A story's minor character: a little smaller and quieter than those the story follows. */
      minor?: true;
      /** One drawn by the artist (an animal): where its mouth is, as shares of its box, so what it carries rides there. */
      mouth?: [number, number];
      /** One the artist drew, rigged: where its head turns about (to lick, sniff, chew), as shares of its box, and how far it turns at most, in degrees. */
      neck?: [number, number];
      dip?: number;
      /** How far its body sinks on its legs lying down, as a share of its box's height. */
      sinks?: number;
      /** Which way one the artist drew faces as drawn: its head to the left (-1) or right (1); absent, the viewer. It is turned to face where it goes. */
      faces?: -1 | 1;
      /** One the artist drew whose mouth code drew: the stage moves it by the voice's mouth shapes as a kit figure's (lipsync, v0 to v5, talking), and it does not bob as it speaks. */
      lips?: true;
      /** One the artist drew whose rig turns its arms (--ar, --al, degrees as the kit's) and nods its head (--nod), each as far as its sheet proved. */
      limbs?: true;
      /** One the artist drew in one piece, with nothing to move but the whole: it squashes and stretches as it speaks, and leans and hops for a gesture. */
      onePiece?: true;
      /** One who stands with people: how tall its frame is in the figure kit's units, so a thing it holds is drawn at the kit's size. */
      units?: number;
      /** A person the kit drew in a pose for the whole scene, not standing: in bed (the bed part of the drawing), or lying. Absent, standing. */
      drawnAs?: 'in bed' | 'lying';
      /** What a person the kit drew wears, in words: as the scene opens, then in each of their dress states in turn ("dress-1", …). Absent on a scene made before it was said. */
      wears?: string[];
      /**
       * Drawn by a kit (people, animals, creatures) with rig 2: what swings
       * is drawn as chains of segments the player turns by `--dg-<id>-<k>`
       * (degrees, 0 at rest). Absent, rig 1: an older drawing, as it was.
       */
      rigVersion?: 2 | 3;
      /**
       * On rig 3 (studio-views-plan §1.2), a person drawn from every side:
       * the ids of the view groups, front first ("view-front", "view-3q",
       * "view-profile", "view-back3q", "view-back"). The player shows one
       * at a time by a class on the drawing ("vw-3q"; none, the front);
       * each view's groups are the front's ids with "--<view>" after them,
       * so a face or a sign is shown in all of them at once.
       */
      views?: string[];
      /**
       * On rig 3, each view's arms as drawn (shoulder, elbow and hand, as
       * shares of its box), as `joints` is the front's: so a hand is aimed
       * (a reach, a point, a hug, a thing handled) from where the arm is
       * in the view that shows. Facing left, mirrored. Absent, the front's.
       */
      viewJoints?: Partial<
        Record<SceneView, Record<'r' | 'l', [number, number][]>>
      >;
      /** On rig 2, each part that swings: hair behind, a cloak or cape, a scarf's end, a ribbon, wings, a tail, ears, a mane. */
      dangles?: SceneDangleDto[];
      /** On rig 2, one who walks: how far one full stride (both feet) carries them, in the drawing's viewBox units, and how they go. */
      stride?: { length: number; gait: SceneGait };
    }
  | { id: string; kind: 'stat'; value: string; caption: string }
  | {
      id: string;
      kind: 'words';
      text: string;
      /** A card stands in for a drawing that could not be made. */
      style: 'title' | 'keyword' | 'card';
    };

export interface SceneArrowDto {
  id: string;
  from: string;
  to: string;
  label: string | null;
  /** Dashes march along it. */
  flow: boolean;
}

/** What stands on the stage from `atMs` until the next step. */
export interface SceneStepDto {
  atMs: number;
  layout: SceneLayoutName;
  show: string[];
  arrows: SceneArrowDto[];
  /**
   * How each newcomer arrives; `from` is the thing a growing one comes out
   * of. One who walks on comes from `side` of the stage, or out of the
   * feature `via` (the gate, the danfo's door).
   */
  enter: Record<
    string,
    {
      how: SceneEnterName;
      from?: string;
      side?: 'left' | 'right';
      via?: string;
    }
  >;
  /**
   * How each one who goes off at this step goes: off by `side`, or out
   * through the feature `via`, where they are gone; at a run, or bent low
   * squeezing under it. Absent, off by the nearer side at a walk.
   */
  exit?: Record<
    string,
    { side: 'left' | 'right'; via?: string; how?: 'walk' | 'run' | 'squeeze' }
  >;
  /** Who goes at a run at this step, on, off or across: faster than a walk. */
  pace?: Record<string, 'run'>;
  /** Who walks briskly across at this step, and how much quicker than a walk (up to a run's): hurried to be there in time for what they do next. */
  hurry?: Record<string, number>;
  /** Who stands behind a feature at this step, by the feature: it is drawn over them. */
  behind?: Record<string, string>;
  /** Who is in a bed at this step, by the bed: its cover is drawn over them, and only while they are in it. */
  abed?: Record<string, string>;
  /** The thing the camera leans toward. */
  focus: string | null;
  /** The scene behind the stage: a place's drawing, by id; absent for none. */
  backdrop?: string;
  /**
   * The stage changes whole, a cut: who leaves fades out and who comes fades
   * in, where people would otherwise walk. Absent on a change that is walked.
   */
  cut?: true;
}

export interface SceneEffectDto {
  atMs: number;
  target: string;
  /** A part or state of a drawing, by name; null for the whole thing. */
  part: string | null;
  do: SceneEffectName;
  /** A pulse added only because nothing else happened for a while: seen, not heard. */
  filler?: boolean;
  /** A shot of the camera on a story's page: held until then, then back to the whole stage. Absent, a zoom holds until the stage next changes. */
  untilMs?: number;
  /**
   * How a shot of the camera comes in: by a cut, or by a move from where
   * the camera was. Absent, as the player plays the page (a film's cut, a
   * book's move). And its grammar (studio-views-plan §3), on today's
   * front-on sets:
   *
   *  - `kind`: "ots", over the shoulder of `part` (the listener, cheated
   *    near the camera, big, at the frame's edge, seen from behind and a
   *    little soft) onto `target` speaking, turned three-quarter to us;
   *    "profile", the two face to face, both in profile (a two-shot);
   *    "deep", `target` cheated near and big, partly off the frame's edge,
   *    the others behind at their places; "crowd", over the people
   *    watching before the camera onto `target`, who speaks to them (they
   *    are not cheated out of it). Absent, a close or a two-shot.
   *  - `angle`: "low", the camera low looking up (a hero, a big entrance);
   *    "high", high looking down (on someone small or sad): on a flat set
   *    a cheat, the horizon down or up and the people a little larger or
   *    smaller.
   */
  shot?: {
    enter: 'cut' | 'move';
    kind?: SceneShotKind;
    angle?: SceneShotAngle;
  };
  /** How the camera moves in a shot (studio-scenery-plan §6.2): "push", in harder on a feeling. The player tracks walkers and pans a wide set by its own rules. */
  pan?: 'track' | 'pan' | 'push';
  /**
   * A character speaking: their words, in a bubble at their head until
   * `untilMs`; their mouth moves until `saidUntilMs`, when the voice has
   * said the words (absent in older scenes).
   */
  say?: {
    id: string;
    text: string;
    untilMs: number;
    saidUntilMs?: number;
    /** Its line goes on in the next bubble, across a change of stage: it does not close. */
    carried?: true;
    /** It carries on a line from the bubble before: it does not open. */
    continues?: true;
    /**
     * Where the line comes from when not from someone on the stage: then
     * no mouth moves for it, and its bubble shows where it comes from.
     */
    from?: SceneLineFrom;
  };
}

/**
 * Where a line comes from, when not from someone on the stage: just off
 * it; from above (heaven, the sky: light falls from the top of the stage
 * and everyone looks up); down a phone; from a letter read out; a thought
 * (a cloud, no mouth moving); a dream or a memory.
 */
export type SceneLineFrom =
  'off' | 'above' | 'phone' | 'letter' | 'thought' | 'dream' | 'crowd';

/**
 * A story page's setting as the stage shows it: the set at full strength
 * behind a story (a lesson's is faded, like paper, under its labels); the
 * light of its time of day and its weather over the set; and a crowd
 * behind the story's own people, who breathe, look at whoever speaks, and
 * cheer or gasp together at the moments given.
 */
export interface SceneSettingDto {
  full?: true;
  /** A Studio film's scene: drawn as a clip of a film, whole from its first frame and alive before and after its voice, its shots cut rather than moved. */
  film?: true;
  time?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: 'clear' | 'rain' | 'storm' | 'wind' | 'snow' | 'fog';
  crowd?: {
    /** The crowd's drawing, by its thing's id. */
    id: string;
    /** The place it stands in, by its set's thing id: seen only while that set is, and faded with it. */
    place?: string;
    /**
     * 'set': drawn in its set's own frame, laid over it as the set is laid
     * (covering the stage) and moved with the set's camera; absent on a
     * scene stored before, a band across the stage behind the people.
     */
    frame?: 'set';
    /** When they react: the moment, how, and for how long. */
    moves?: [number, 'cheer' | 'gasp', number][];
  };
  /** A Studio set's fixed things its story acts on: a gate, a bench, a goalpost, a danfo. */
  features?: SceneFeatureDto[];
  /** The place its people ride in is on the move (a danfo on the road): the stage rattles it gently, and what is outside it slides past. */
  moving?: true;
  /** When a feature opens or shuts: the moment, which, and how it is left. */
  featureStates?: [number, string, 'open' | 'shut'][];
  /**
   * A thing of the set faded while it would hide someone who matters:
   * from, to, its group in the set's foreground or floor layer, and how
   * faint (absent, 40%, as while a face behind it speaks; 0, gone for a
   * shot's length, as a film cheats a near thing out of the frame).
   */
  fades?: [number, number, string, number?][];
}

/**
 * A fixed thing of a Studio set that its story acts on, stood among the
 * people: drawn by the stage (a gate that swings shut, a bench, a danfo)
 * behind them, and over them while someone goes through or under it; or
 * the painter's own, only where it is. Looks, points and leans aimed at it
 * name it "f:<id>".
 */
export interface SceneFeatureDto {
  id: string;
  name: string;
  kind: string;
  /** The stage's drawing of it, in the figure kit's units; absent for one only painted. */
  svg?: string;
  /** The part that opens, by its group's id: turned about its hinge (its width closing toward it), or slid `slide` along. */
  leaf?: { id: string; hinge: [number, number]; slide?: number };
  /** Where it stands at each staging: the box its drawing fills. */
  at: Record<'box' | 'wide', { x: number; y: number; w: number; h: number }>;
  /** Where its feet stand at each staging: the people nearer the camera than that are drawn over it, and those farther off under it. Absent, at the foot of its box. */
  feet?: Record<'box' | 'wide', number>;
  /** Where one goes in or out by it, or stands at it: the middle of its way, the ground there, and how big someone there is beside the people (less than 1 farther back). */
  way: Record<'box' | 'wide', { x: number; y: number; k: number }>;
  /** The painted set's own group for it, hidden while the stage's drawing stands in for it. */
  painted?: string;
  /** Open as the scene opens. */
  open?: true;
  /** Open only a little as the scene opens: "open a crack". */
  ajar?: true;
  /** It stands low before the people by it, drawn over them: a show's own canoe, a drum. */
  front?: true;
  /** Someone going by it goes in and is gone, as at a door: a show's own that opens (a hut). */
  enters?: true;
  /** Where something caught up in it rests, at each staging: a kite in a palm's crown. Absent, nothing is. */
  up?: Record<'box' | 'wide', { x: number; y: number }>;
  /** The group of its drawing that covers whoever is in it (a bed's duvet), drawn over them while they are; absent, it has none. */
  cover?: string;
  /** How high someone sitting on it sits, at each staging: the y of its seat. Absent, it is not sat on. */
  seat?: Record<'box' | 'wide', number>;
  /** Where one lying on it lies, at each staging: along its top (y), from its foot to its head (x). */
  lies?: Record<'box' | 'wide', { y: number; foot: number; head: number }>;
  /**
   * Where one who climbs it or leaps up onto it stands, at each staging:
   * `y` their feet's, and `x` beside where things catch, one standing there
   * with their middle three tenths of their width short of it (the stage's
   * "up:<id>" station). Absent, no one stands up it: a gate, a bench.
   */
  perch?: Record<'box' | 'wide', { x: number; y: number }>;
}

/**
 * A move someone makes as they act: a nod, a gesture with the right or
 * left arm, brows up, a lean back, a reach, a point (at someone, or up at
 * the sky), a hug, a wave, a shake of the head, a laugh, a hop for joy, a
 * clap, a sob, a shrug; and on a Studio story's stage the body's own: a
 * jump, a crouch, sitting and lying down (held until they get up),
 * getting up, a fall, a spin, a bow, a kick, and an animal's wag, lick,
 * chew, sniff, dig, wriggle, bark, roll over and shake; and the action
 * moves: a leap (onto a feature: "f:wall"), a landing, a burst into a
 * sprint, a dodge, a punch that never lands (whoever it is at staggers),
 * a hard fall, getting up off the ground, and a hero's pose.
 */
export type SceneActingMove =
  | 'jump'
  | 'crouch'
  | 'sit'
  | 'stand'
  | 'lie'
  | 'fall'
  | 'spin'
  | 'bow'
  | 'kick'
  | 'wag'
  | 'lick'
  | 'chew'
  | 'sniff'
  | 'dig'
  | 'wriggle'
  | 'bark'
  | 'roll'
  | 'shake-off'
  | 'nod'
  | 'gesture'
  | 'gesture-left'
  | 'brows'
  | 'lean'
  | 'reach'
  | 'point'
  | 'point-up'
  | 'hug'
  | 'wave'
  | 'shake'
  | 'laugh'
  | 'hop'
  | 'clap'
  | 'sob'
  | 'shrug'
  | 'lean-in'
  // The action moves (studio-world-plan §4.5): each a clip the player
  // plays with a wind-up, the act, a follow-through and a settle.
  | 'leap'
  | 'land'
  | 'run-fast'
  | 'dodge'
  | 'punch'
  | 'fall-hard'
  | 'get-up'
  | 'hero';

/**
 * How someone acts on a page: planned by the server from who says what
 * and when, played by the stage on the voice's clock.
 */
/**
 * What people do with a thing on a story's stage: and on a Studio
 * story's, besides, thrown, caught, dropped, kicked and chewed.
 */
export type ScenePropAction =
  | 'take'
  | 'raise'
  | 'break'
  | 'give'
  | 'eat'
  | 'drink'
  | 'dip'
  | 'put'
  | 'throw'
  | 'catch'
  | 'drop'
  | 'kick'
  | 'chew'
  /** Put on: from its moment it is gone into what they wear. */
  | 'wear'
  /** Taken off: from its moment it is in their hand. */
  | 'doff';

/**
 * A thing on a story's stage that people handle: bread on the table, a
 * cup, a ball. Drawn in the figure kit's own units, its base resting on a
 * surface at y = 0; on the table (or the ground) near whoever first
 * handles it, until then and after they put it down; or from the start
 * in someone's hand or mouth. Thrown, dropped or kicked, it flies, and
 * lands in a hand, a mouth or on the ground, and lies where it lands.
 */
/** One of a thing's looks at rest: its drawing and frame in its own units, and the point that stands where it rests. */
export interface ScenePropRestDto {
  svg: string;
  viewBox: [number, number, number, number];
  anchor: [number, number];
}

export interface ScenePropDto {
  id: string;
  svg: string;
  viewBox: [number, number, number, number];
  /** Where a hand holds it, and the part that goes to the mouth, in its own units. */
  grip: [number, number];
  mouth: [number, number];
  /** Where an animal's mouth holds it: a ball's middle, a bag's handle; absent, its grip. */
  bite?: [number, number];
  /** Broken, each hand holds a half: the left half; the right is its mirror. */
  half?: string;
  /**
   * Clothes' looks when set down, neither worn nor held: folded (on the
   * floor, a table, or where they fell) and, in a room, on a hanger on
   * the wall. Each in its own units, `anchor` the point that stands where
   * it rests. Absent for anything not worn: it rests as it is drawn.
   */
  rest?: { folded: ScenePropRestDto; hung?: ScenePropRestDto };
  /** Near whom it rests. */
  near: string | null;
  /** Who holds it as the scene opens, and in what: a hand, or the mouth. Absent, it rests near `near`. */
  held?: { by: string; in: 'r' | 'l' | 'mouth' };
  /** Caught up in a feature of the set as the scene opens, by its id: the kite in the palm. */
  in?: string;
  /** It flies on a string once raised: a kite, a balloon. */
  flies?: true;
  /** Loose, how often it bounces where it lands (a ball twice); absent, it does not. */
  bounce?: number;
  /** It rolls on where it lands, and turns over in the air. */
  rolls?: true;
  spins?: true;
  /** Carried hanging at the side, not held up before them: a bag. */
  hangs?: true;
  /**
   * What is done with it, in order: when (its moment: the hand closing,
   * the release, the landing), who, what, and toward whom or where: given
   * or thrown to someone, by id; toward a side of the stage, "@left" or
   * "@right"; onto the ground at a point, as a share of the stage's
   * width, "@0.82"; or before a feature of the set, "f:gate", wherever
   * each staging stands it. A catch comes when a thing thrown to someone
   * reaches them.
   */
  does: [number, string, ScenePropAction, string?][];
}

export interface SceneActingDto {
  /**
   * Where they look from each moment on: another thing's id, or null for
   * the viewer, or "@up" or "@down" (the sky, the ground), or "@left" or
   * "@right" (a voice off the stage on that side); and how far their face
   * turns toward it, 0 to 1.
   */
  look?: [number, string | null, number][];
  /** Their mouth as they speak: each line's first word, and its shapes at 30 a second, one digit each, 0 to 5. */
  mouth?: [number, string][];
  /** Moves: when, which, how long, and toward whom. */
  moves?: [number, SceneActingMove, number, string?][];
  /** They walk on, off and between places, rather than pop or slide. */
  walks?: true;
  /** How big their moves are, from what they are like: a shy one's smaller, a bold one's bigger; absent, as drawn. */
  size?: number;
  /**
   * One drawn from every side (rig 3): which view shows from each moment
   * on, and whether it is mirrored (-1, facing left) or not (1). Absent,
   * the front all along.
   */
  view?: [number, SceneView, 1 | -1][];
}

/** A view of someone drawn from every side, as the camera sees them. */
export type SceneView = 'front' | '3q' | 'profile' | 'back3q' | 'back';

/** A shot's grammar on a front-on set (studio-views-plan §3.1): over the shoulder, a profile two-shot, deep staging, over the crowd. */
export type SceneShotKind = 'ots' | 'profile' | 'deep' | 'crowd';
/** A camera low looking up, or high looking down (studio-views-plan §4.4). */
export type SceneShotAngle = 'low' | 'high';

/** A speech bubble as the stage sets it: its box, its words, and the point its tail reaches toward. */
export interface SceneBubbleDto {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  size: number;
  tail: [number, number];
  /**
   * A line with no room by its speaker's head, set in a strip across the
   * top of the stage instead: who says it, written before the words.
   */
  who?: string;
  /**
   * Where the line comes from, when not from someone on the stage: its
   * shape shows it. From above, off the stage, or a dream, it keeps its
   * place in the frame; a phone's or a letter's is by whoever hears or
   * holds it, a thought's by the thinker.
   */
  from?: SceneLineFrom;
  /** Whose head it is by, when not its speaker's: whoever hears the phone, or holds the letter. */
  by?: string;
}

/** Where a thing stands at one step, in the staging's design units. */
export interface ScenePlaceDto {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The size its main text is set at: a stat's number, words, a card. */
  size?: number;
  caption?: { x: number; y: number; w: number; size: number; lines: string[] };
  /** A drawing's labels at this step, set beside it by the stage. */
  labels?: SceneLabelDto[];
  /** A Studio story's person: how far back they stand on the floor, 0 at its back to 1 at its front, 0.5 where people have always stood. Absent, 0.5. */
  d?: number;
}

/** One label set by the stage: its words' box, which edge they hang from, and its leader to the part. */
export interface SceneLabelDto {
  part: string;
  lines: string[];
  size: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which edge the words hang from: the drawing's side in a column, the middle in a band. */
  align: 'start' | 'middle' | 'end';
  /** From the words to the point on the part: x1, y1, x2, y2; null when they sit on it. */
  leader: [number, number, number, number] | null;
}

/** An arrow's label: how far along the arrow, which side of it, and its box's size. */
export interface ScenePillDto {
  t: number;
  /** 1 above an arrow that runs across or right of one that runs down; -1 the other side. */
  side: 1 | -1;
  w: number;
  h: number;
  size: number;
}

/** A page as an animated video: the voice's sentences, the things, and when each happens. */
export interface SceneDto {
  /** 4 adds the sound; a 3 plays the same, in silence but for the voice. */
  version: 3 | 4;
  generator: string;
  title: string;
  durationMs: number;
  /** When everything the scene plans has finished: its last line, its last walk and move. Can be after `durationMs`, where the voice has ended; absent on an older scene, and on a book's page. */
  settledMs?: number;
  /**
   * How long a walker takes to cross the whole stage, and the least and
   * most a walk takes, in ms, as this scene was timed. Absent on a scene
   * made before walks were slowed: 4000, 1100 and 3400.
   */
  walk?: { stageMs: number; minMs: number; maxMs: number };
  timing: SceneTiming;
  /** Whom the document is taught for, read from it; absent when it could not be told, or on an older page. */
  stage?: 'early' | 'middle' | 'higher' | 'professional';
  /**
   * One per spoken sentence; one word entry per whitespace word of `text`:
   * [charStart, charEnd, startMs, endMs]. `delivery` when it is not plain
   * explaining: a key point's music thins so the point lands.
   */
  beats: {
    text: string;
    startMs: number;
    endMs: number;
    words: number[][];
    delivery?: 'hook' | 'key' | 'aside' | 'question' | 'recap';
    /** On a story's page, a line a character says: who says it, for the caption. */
    who?: string;
  }[];
  things: SceneThingDto[];
  steps: SceneStepDto[];
  effects: SceneEffectDto[];
  /**
   * The music under the voice; absent on a scene made before there was any.
   * `music` places the score's states on the page (absent before the score:
   * one state from the mood); `palette` is the document's instruments;
   * `motif` plays the story's own few notes as the page opens.
   */
  sound?: {
    mood: SceneMoodName;
    music?: SceneMusicCueDto[];
    palette?: SceneMusicPalette;
    motif?: true;
  };
  /** How each character acts, by id; absent on a page no one acts on, or an older one. */
  acting?: Record<string, SceneActingDto>;
  /** The things on a story's stage that people handle; absent when there are none. */
  props?: ScenePropDto[];
  /** A story page's setting: its set at full strength, its light and weather, a crowd; absent on a lesson's page, but for a Studio film's (`film` alone). */
  setting?: SceneSettingDto;
  /** The same steps placed for the pane's box and the full screen's wide stage. */
  stagings: Record<
    'box' | 'wide',
    {
      w: number;
      h: number;
      places: Record<string, ScenePlaceDto>[];
      /**
       * Each step's arrow labels, by arrow id: where each goes, or null for
       * one with nowhere clear to go, which is not shown. Absent on a scene
       * made before they were placed.
       */
      pills?: Record<string, ScenePillDto | null>[];
      /**
       * Each speech bubble, by its say's id: where it goes at the step it is
       * said in, or null where there is no room, and it is not shown.
       */
      bubbles?: Record<string, SceneBubbleDto | null>;
    }
  >;
}

export interface VisualSceneDto {
  page: number;
  title: string;
  durationMs: number;
  scene: SceneDto;
}

/** Ahead of a page, the way the lecture prepares, or pages by number. */
export interface RequestVisualsRequest {
  fromPage?: number;
  pages?: number[];
  /**
   * page: the one press, this chapter from the page and the next when
   * the runway is short; ahead: the runway topping itself up, the next
   * chapter only; whole: every page. Omitted means page.
   */
  mode?: 'page' | 'ahead' | 'whole';
}

/** Where a learner stopped in a document's visuals. */
export interface VisualPositionDto {
  page: number;
  offsetMs: number;
  updatedAt: string | null;
}

/** The admin sending a batch, a selection, or one file to be drawn whole. */
export interface VisualsRequest {
  batchId?: string;
  documentIds?: string[];
}

export interface VisualsResponse {
  documents: number;
  /** Pages sent to be drawn. */
  queued: number;
  /** Pages that had a video, or one on its way, already. */
  existing: number;
  /** Ready files with no chapters to draw from, left out. */
  skipped: number;
}

export interface RequestVisualsResponse extends VisualSetDto {
  queued: number;
  /** Chapters that were already made or being made. */
  existing: number;
}

export type LectureSegmentStatus =
  | 'pending'
  | 'writing'
  /** The script exists; its audio has not been made yet. */
  | 'voicing'
  /** The script exists and nobody has asked for its audio: a school's document written at upload, voiced on Prepare. */
  | 'scripted'
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
  /** Which of the chapter's points this page serves, by index; absent on older plans. */
  point?: number;
}

export interface LectureTopicDto {
  topicId: string;
  title: string;
  segments: LectureSegmentDto[];
  /** The three or four things the chapter settles, from its plan; absent on older plans. */
  points?: string[];
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
  /** A problem worked through, step by step, every step checked by code. */
  WORK_THROUGH: 'work_through',
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
  /** A problem worked through on the board, every step checked by code. */
  WORK: 'board_work',
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

/**
 * A problem the tutor asked to have worked through: the worked solution,
 * every line checked by code (cut at the last line code could stand
 * behind), and each line as the board writes it and the voice says it.
 */
export type WorkThroughResponse =
  | {
      ok: true;
      working: WorkedSolutionDto;
      /** The lines to write, in order: what the problem gives, each step, the answer, the check. */
      lines: WorkLineDto[];
    }
  | { ok: false; error: string };

/** One line of worked maths, for a board and a voice. */
export interface WorkLineDto {
  /** Display LaTeX: shown typeset. */
  latex: string;
  /** The same in plain characters, as a pen writes it: "2x + 3 = 11". */
  plain: string;
  /** The same said aloud: "2 x plus 3 equals 11". */
  said: string;
  /** What is done to get it; null for the problem and the answer. */
  does: string | null;
  why: string | null;
  role: 'problem' | 'step' | 'answer' | 'check';
}

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
    }
  | {
      /** Our own line: a LiveKit room the tutor agent is dispatched into. */
      provider: 'livekit';
      url: string;
      token: string;
      room: string;
      baseInstructions: string;
    };

// ── SSE ──────────────────────────────────────────────────────────────────────

/** Event names on `GET /documents/:id/events` (technical design §5). */
export type SseEvent =
  | { type: 'document.status'; status: DocumentStatus }
  | { type: 'document.converted'; pageCount: number }
  | { type: 'document.extracted'; pageCount: number }
  | { type: 'document.topics_ready'; topicCount: number }
  | { type: 'page.simplified'; pageNumber: number }
  | { type: 'page.simplify_failed'; pageNumber: number; attempts: number }
  | { type: 'document.simplified' }
  | { type: 'export.ready'; exportId: string }
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

// ── The Studio ─────────────────────────────────────────────────────────────
// Animated episodes made from a conversation: shows, their episodes and
// each episode's scenes, decided in full before anything is drawn.

export type StudioFormatName = 'story' | 'explainer';
export type StudioPhase = 'brief' | 'outline' | 'cast' | 'script' | 'made';
export type StudioBusyName = 'bible' | 'outline' | 'script' | 'scene' | 'make';
export type StudioSceneStatusName =
  'writing' | 'ready' | 'making' | 'made' | 'failed';

export interface StudioBriefDto {
  format: StudioFormatName | null;
  idea: string;
  audience: 'young children' | 'children' | 'teens' | 'adults' | null;
  minutes: number | null;
  tone: 'funny' | 'gentle' | 'exciting' | 'serious' | 'calm' | null;
  setting: string | null;
  characters: string | null;
  include: string | null;
  /** How much of their own text the maker gave, in characters; 0 for none. */
  sourceChars: number;
}

export interface StudioCharacterDto {
  id: string;
  name: string;
  kind: 'person' | 'animal' | 'creature';
  role: 'main' | 'supporting' | 'minor';
  look: string;
  /** A person's look, as the kit draws them. */
  figure: Record<string, string | number | string[]> | null;
  /** An animal's look, as the animal kit draws it; absent, the artist draws it. */
  animal?: StudioAnimalDto;
  /** A creature's look, as the creature kit draws it; absent, the artist draws it. */
  creature?: StudioCreatureDto;
  size: 'small' | 'medium' | 'large' | null;
  voice: string;
  voicePick: number;
  traits: string[];
  carries: string | null;
  /** How they are drawn: an SVG, for a person now; for anyone else once they have been drawn. */
  drawing: string | null;
  /** One the artist draws, being drawn now: for the first time, or again as the maker asked. */
  drawingNow?: boolean;
  /**
   * New drawings of them waiting beside the one they have, up to three,
   * the likeliest first, and what the maker asked for: one replaces
   * theirs only when chosen. `first`: a first drawing's takes, the first
   * the one they have now.
   */
  candidates?: StudioOptionsDto | null;
}

/** New drawings of a character to choose from. */
export interface StudioOptionsDto {
  /** What the maker asked for; empty for a first drawing's takes. */
  words: string;
  first?: boolean;
  options: { id: string; drawing: string }[];
}

/** An animal as the animal kit draws it: its species, build, colours and markings, and what it wears. */
export interface StudioAnimalDto {
  species: string;
  build: 'slim' | 'average' | 'stout';
  size: 'small' | 'medium' | 'large';
  coat: string;
  second: string | null;
  pattern: string;
  /** Null: the species' own. */
  ears: string | null;
  tail: string | null;
  mane: string | null;
  horns: string | null;
  wear: { neck?: string; back?: string; head?: string; feet?: string };
  wearColour: string | null;
}

/** A creature as the creature kit draws it: its body, colours and texture, its face, limbs, wings and tail, and what it wears. */
export interface StudioCreatureDto {
  body: string;
  build: 'slim' | 'average' | 'stout';
  size: 'small' | 'medium' | 'large';
  bodyColour: string;
  texture: string;
  /** Null: the kit's own for its texture. */
  textureColour: string | null;
  eyes: 1 | 2 | 3;
  nose: string;
  head: string;
  top: string;
  arms: string;
  legs: string;
  /** Null: its body's, or ink for sticks. */
  limbColour: string | null;
  wings: string;
  tail: string;
  wear: { neck?: string; body?: string; face?: string };
  wearColour: string | null;
}

export interface StudioSetDto {
  id: string;
  name: string;
  look: string;
  kind: 'outdoor' | 'indoor' | 'vessel';
  stand: 'on' | 'in';
  front: string | null;
  sound: string | null;
  /** Once painted, the backdrop as an SVG. */
  drawing: string | null;
}

export interface StudioBibleDto {
  characters: StudioCharacterDto[];
  sets: StudioSetDto[];
  world: {
    era: string;
    region: string;
    culture: string;
    landscape: string;
    homes: string;
  } | null;
  subject: string;
  maths: boolean;
  pictures: { name: string; is: string; draw: string }[];
  /** The show's own things its scenes handle, drawn for it (a kite, a drum), by id; absent, none yet. */
  things?: string[];
}

export interface StudioOutlineSceneDto {
  title: string;
  summary: string;
  set: string | null;
  cast: string[];
  seconds: number;
  teach: string | null;
  points: string[];
}

export interface StudioOutlineDto {
  title: string;
  logline: string;
  scenes: StudioOutlineSceneDto[];
}

export interface StudioProblemDto {
  rule: string;
  message: string;
  beat: number | null;
  level: 'error' | 'warning';
}

/** One beat of a story's scene, as its card shows and edits it. */
export interface StudioBeatDto {
  kind: 'line' | 'narration' | 'action' | 'business' | 'reaction' | 'pause';
  who: string | null;
  to: string | null;
  say: string;
  feeling: string | null;
  sign: string | null;
  do: string | null;
  prop: string | null;
  spot: string | null;
  from: string | null;
  pace: string | null;
  seconds: number | null;
  /** Toward whom or what: a character, a feature of the set, a thing, or a side ("@left"). */
  target?: string;
  /** The thing handled or named. */
  thing?: string;
  /** The feature someone goes in or out by. */
  via?: string;
  /** What the writer asked for that is none of the doings, as they wrote it. */
  doSaid?: string;
}

export interface StudioStorySheetDto {
  kind: 'story';
  title: string;
  set: string;
  time: string;
  weather: string;
  crowd: string;
  mood: string;
  music: string;
  transition: 'cut' | 'fade';
  onStage: {
    who: string;
    spot: string;
    pose: string;
    face: string;
    holding: string | null;
  }[];
  props: { prop: string; near: string | null }[];
  beats: StudioBeatDto[];
  camera: {
    beat: number;
    shot: string;
    on: string | null;
    with: string | null;
  }[];
}

/** An explainer's scene as its card shows it: each sentence, and what comes on the stage with it. */
export interface StudioExplainerSheetDto {
  kind: 'explainer';
  title: string;
  transition: 'cut' | 'fade';
  lines: { say: string; shows: string[] }[];
}

export type StudioSheetDto = StudioStorySheetDto | StudioExplainerSheetDto;

export interface StudioSceneDto {
  id: string;
  position: number;
  title: string;
  status: StudioSceneStatusName;
  /** While being made: drawing, voicing or composing. */
  step: string | null;
  error: string | null;
  sheet: StudioSheetDto | null;
  problems: StudioProblemDto[];
  /** Changed since it was made: made again when the episode is. */
  stale: boolean;
  /** Made, and playable. */
  made: boolean;
  /** How long it runs: made, or reckoned from its words. */
  seconds: number;
  durationMs: number | null;
  /** A change to undo. */
  canUndo: boolean;
}

export interface StudioEpisodeDto {
  id: string;
  showId: string;
  number: number;
  title: string;
  logline: string | null;
  phase: StudioPhase;
  busy: StudioBusyName | null;
  error: string | null;
  outline: StudioOutlineDto | null;
  scenes: StudioSceneDto[];
  durationMs: number | null;
  shareToken: string | null;
  /** Seconds of film making it now would take from the month's allowance. */
  toMakeSeconds: number;
  /** Why it cannot be made now, in plain words; empty when it can. */
  blockers: string[];
  hasThumb: boolean;
}

/**
 * What happened, as the thread records it: a result come (the outline,
 * the cast, the scenes, a scene, the film), a step taken with a button
 * (approved, asked for, changed by hand, making, shared, a new episode),
 * or work that did not go through.
 */
export type StudioEventName =
  | 'outline'
  | 'cast'
  | 'scenes'
  | 'scene'
  | 'made'
  | 'approved'
  | 'asked'
  | 'edited'
  | 'make'
  | 'shared'
  | 'episode'
  | 'failed'
  /** A scene made again as the maker asked, and looked at: whether what they asked for shows. */
  | 'checked';

export interface StudioEventDto {
  what: StudioEventName;
  /** The step it belongs to: where its card opens the panel. */
  step: StudioPhase;
  sceneId?: string;
  /** The character it is about: their new drawings, to choose from in the thread while they wait. */
  characterId?: string;
  /** Which writing of it this is, from 1: the outline's, the cast's or a scene's. */
  version?: number;
  /** What happened, in a line. */
  line: string;
}

export interface StudioMessageDto {
  id: string;
  role: 'user' | 'assistant';
  /** The episode it was said in or happened to; null for one kept from before episodes were noted. */
  episodeId: string | null;
  /** Said by the maker or the producer, or an event the Studio recorded. */
  kind: 'say' | 'event';
  event: StudioEventDto | null;
  content: string;
  choices: string[];
  refused: boolean;
  createdAt: string;
}

/** Earlier messages of a show's thread, the oldest first, and whether there are earlier still. */
export interface StudioMessagePageDto {
  messages: StudioMessageDto[];
  more: boolean;
}

export interface StudioBalanceDto {
  remainingSeconds: number | null;
  allowanceSeconds: number | null;
  usedThisMonthSeconds: number;
  watermarked: boolean;
}

export interface StudioShowDto {
  id: string;
  title: string;
  format: StudioFormatName | null;
  brief: StudioBriefDto;
  /** What the brief still needs before an outline can be written. */
  briefMissing: string[];
  bible: StudioBibleDto | null;
  episodes: {
    id: string;
    number: number;
    title: string;
    phase: StudioPhase;
    durationMs: number | null;
    hasThumb: boolean;
  }[];
  /** The latest of the thread, the oldest first. */
  messages: StudioMessageDto[];
  /** Whether the thread goes back further than `messages`. */
  moreMessages: boolean;
  balance: StudioBalanceDto;
}

export interface StudioShowCardDto {
  id: string;
  title: string;
  format: StudioFormatName | null;
  episodes: number;
  /** The episode whose still stands for the show, if one is made. */
  thumbEpisodeId: string | null;
  phase: StudioPhase;
  updatedAt: string;
  /** What is being written or made in the show now, if anything: the card says so as it goes. */
  busy?: StudioBusyName | null;
  /** The film the still stands for: how long its scenes run, and how many there are. */
  durationMs?: number | null;
  scenes?: number | null;
}

/** An episode as a player plays it: its scenes in order, each fetched on its own. */
export interface StudioPlayDto {
  episodeId: string;
  title: string;
  showTitle: string;
  number: number;
  /** Free-plan film carries the Studio's name on its end card. */
  watermark: boolean;
  madeWith: string;
  scenes: {
    id: string;
    title: string;
    durationMs: number;
    transition: 'cut' | 'fade';
    /** How the film joins this scene to the one before: a cut (the same place, time running on), a dissolve (a new place) or a dip to black (time has passed). The first comes up from black. */
    join: 'cut' | 'dissolve' | 'dip';
  }[];
}

/** A line of the producer's streamed turn: a piece of the reply, then the whole outcome. */
export type StudioTurnLine =
  | { token: string }
  | {
      done: true;
      message: StudioMessageDto;
      show: StudioShowDto;
      episode: StudioEpisodeDto;
    }
  | { error: string };
