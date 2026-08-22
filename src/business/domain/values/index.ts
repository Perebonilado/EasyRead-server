/**
 * The metered-paywall model: every feature is open on Free, and what is
 * bounded is time on the core value. Study time is the daily meter, voice
 * minutes are the monthly wallet allowance, and uploads stay capped only
 * because each one spends real pipeline money before any reading happens.
 * Page counts are deliberately unlimited on every plan.
 */
export const PLAN_LIMITS = {
  free: {
    documentsPerMonth: 3,
    studyMinutesPerDay: 20,
    voiceMinutesPerMonth: 15,
    watermarkedExports: true,
    priceUsdMonthly: 0,
    priceUsdYearly: 0,
    name: 'Free',
  },
  pro: {
    documentsPerMonth: null,
    studyMinutesPerDay: null,
    voiceMinutesPerMonth: 120,
    watermarkedExports: false,
    priceUsdMonthly: 14,
    priceUsdYearly: 100,
    name: 'Pro',
  },
} as const;

export interface PlanLimits {
  documentsPerMonth: number | null;
  /** Daily active-study allowance; null is unlimited. */
  studyMinutesPerDay: number | null;
  /** The monthly voice allowance; purchased credits sit on top of this. */
  voiceMinutesPerMonth: number | null;
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
  | 'studyMinutesPerDay'
  | 'voiceMinutesPerMonth'
  | 'watermarkedExports'
> = {
  documentsPerMonth: null,
  studyMinutesPerDay: null,
  voiceMinutesPerMonth: null,
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

/**
 * The purchasable voice bundles. Sold as one-time Paddle transactions; the
 * webhook credits the wallet. Bigger bundles are cheaper per minute, and
 * nothing here expires.
 */
export const CREDIT_BUNDLES = {
  min30: { minutes: 30, usd: 5 },
  min90: { minutes: 90, usd: 12 },
  min220: { minutes: 220, usd: 25 },
} as const;
export type CreditBundle = keyof typeof CREDIT_BUNDLES;

export const UsageMetric = {
  DOCUMENTS_UPLOADED: 'documents_uploaded',
  /** Active seconds in the reader, banked by the study clock heartbeat. */
  STUDY_SECONDS: 'study_seconds',
  /** Seconds of live voice, across the tutor and group sessions. */
  VOICE_SECONDS: 'voice_seconds',
} as const;
export type UsageMetric = (typeof UsageMetric)[keyof typeof UsageMetric];
