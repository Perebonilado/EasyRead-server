export const PLAN_LIMITS = {
  free: {
    documentsPerMonth: 3,
    maxPages: 50,
    easiestPerMonth: 1,
    highlightsPerDay: 20,
    watermarkedExports: true,
    priceUsdMonthly: 0,
    priceUsdYearly: 0,
    name: 'Free',
  },
  pro: {
    documentsPerMonth: null,
    maxPages: 300,
    easiestPerMonth: null,
    highlightsPerDay: null,
    watermarkedExports: false,
    priceUsdMonthly: 20,
    priceUsdYearly: 150,
    name: 'Pro',
  },
} as const;

export interface PlanLimits {
  documentsPerMonth: number | null;
  maxPages: number;
  easiestPerMonth: number | null;
  highlightsPerDay: number | null;
  watermarkedExports: boolean;
  /** Whole US dollars. Paddle bills in USD everywhere; there is no naira tier. */
  priceUsdMonthly: number;
  priceUsdYearly: number;
  name: string;
}

/**
 * Every gate lifted, for testing the product without the plan getting in the
 * way. Applied by `FREE_PLAN_UNLIMITED`; see `EntitlementsService`.
 *
 * `null` means "no ceiling" everywhere in this codebase, which is why lifting a
 * limit is a value change rather than a branch at each call site.
 */
export const UNLIMITED_LIMITS: Pick<
  PlanLimits,
  | 'documentsPerMonth'
  | 'maxPages'
  | 'easiestPerMonth'
  | 'highlightsPerDay'
  | 'watermarkedExports'
> = {
  documentsPerMonth: null,
  maxPages: PLAN_LIMITS.pro.maxPages,
  easiestPerMonth: null,
  highlightsPerDay: null,
  watermarkedExports: false,
};

/**
 * PRD FR-1.1 — accepted intake formats.
 *
 * Everything other than PDF reaches the reader through Drive's free
 * import-convert-then-export-as-PDF path, so adding a format here costs
 * nothing as long as Drive can import it.
 */
export const ACCEPTED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/msword': 'doc',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'text/plain': 'txt',
  'text/rtf': 'rtf',
  'application/rtf': 'rtf',
};

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** A page with less text than this is treated as figure-only (§4.3). */
export const EMPTY_PAGE_CHAR_THRESHOLD = 40;

/** Above this share of empty pages the document is a scan. */
export const SCANNED_EMPTY_PAGE_RATIO = 0.6;

/** Page images wider than this are box-downsampled before the vision call. */
export const OCR_MAX_IMAGE_WIDTH = 1600;

export const UsageMetric = {
  DOCUMENTS_UPLOADED: 'documents_uploaded',
  EASIEST_CONVERSIONS: 'easiest_conversions',
  HIGHLIGHT_ACTIONS: 'highlight_actions',
} as const;
export type UsageMetric = (typeof UsageMetric)[keyof typeof UsageMetric];
