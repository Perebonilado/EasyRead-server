/**
 * The rules every explainer film obeys (explainer-animation-plan.md §4;
 * explainer-animation-tech.md §3): the render contract, the look, the pace
 * and the truth. The board's prompt quotes them, the plan checks and the
 * frame checks enforce them, and the critic scores against them, so every
 * number lives here once. Values marked "house" are ours to tune on the
 * bench; the rest cite research (explainer-visual-research.md) or a standard.
 */

/** Bumped when a rule changes what a film may contain, so stored checks can tell which rules they ran. */
export const RULES_VERSION = 1;

/** Pace, in ms (research §3.2). An information event puts a new fact on screen; a sub-step is part of one. */
export const PACE = {
  /** The first change of an episode comes by this (the hook). */
  firstChangeMs: 1500,
  /** Information events at least this far apart. */
  minGapMs: 1200,
  /** No gap longer than this outside a declared hold. */
  maxGapMs: 6000,
  /** The median gap in an explain passage (house, from the playbook's 3–5 s). */
  explainMedianGapMs: [2500, 4000] as const,
  /** The median gap in the open (the first 15–30 s). */
  openMedianGapMs: [1500, 2500] as const,
  /** A hold, with the life layer running. */
  holdMs: [2000, 10000] as const,
  /** The quiet after an ask. */
  askQuietMs: 1500,
  /** A sub-step starts within this of its event. */
  subStepMs: 600,
  /** Where a change settles against its anchor word: a little early, never late (research §3.2's sync). */
  settleLeadMs: [-150, -50] as const,
  settleMaxLeadMs: 1000,
  settleMaxLagMs: 100,
} as const;

/** How long a label, number or picture stays up to be read (research §3.2). */
export function dwellMs(words: number): number {
  return Math.max(1500, 350 * Math.max(0, words) + 500);
}

/** One attention cue at a time; at most two things moving in the information layer. */
export const ATTENTION = { cues: 1, moving: 2 } as const;

/**
 * Text sizes as fractions of the frame's SHORT side (research §3.8, given at
 * 1080 px): its height when wide, its width when tall. So a label is the same
 * size on a phone whichever way the film was made, and holds at any export
 * size. The frame checks and the client's recipes both measure it this way.
 */
export const TEXT = {
  hero: 140 / 1080,
  title: 76 / 1080,
  /** The floor for any text a viewer must read (house, to be checked on real phones). */
  mustRead: 60 / 1080,
  chip: 28 / 1080,
  caption: 64 / 1080,
  /** Words on the stage at once, not counting the chip, the tag and the captions. */
  stageWordsMax: 8,
  labelWordsMax: 3,
} as const;

/**
 * The focal subject's share of the frame (house): in a tall frame it fills
 * at least half the height (research §3.8); in a wide one, at least this
 * share of the height or of the area. The jet engine at 0.7% fails both.
 */
export const FOCAL = {
  tallMinHeight: 0.5,
  wideMinHeight: 0.35,
  wideMinArea: 0.12,
} as const;

/** Contrast floors against what sits behind (WCAG 2.2: 1.4.3 and 1.4.11). */
export const CONTRAST = { text: 4.5, marks: 3 } as const;

/** No more than three flashes a second; flicker under 10% of luminance (WCAG 2.3.1). */
export const SAFETY = { flashesPerSecond: 3, flicker: 0.1 } as const;

/**
 * Safe areas as fractions of the frame (research §3.8): graphics-safe for
 * wide (EBU R95); for tall, the box clear of YouTube's and the platforms'
 * overlays, with the caption band at its foot. Only text, labels, the chip
 * and captions must sit inside; the picture runs full-bleed. In a captioned
 * film the foot of the frame is the captions': a wide frame's foot 18% of
 * its height (house), a tall frame's band from captionY0.
 */
export const SAFE = {
  wide: {
    x0: 96 / 1920,
    x1: 1824 / 1920,
    y0: 54 / 1080,
    y1: 1026 / 1080,
    captionY0: 0.82,
  },
  tall: {
    x0: 48 / 1080,
    x1: 887 / 1080,
    y0: 288 / 1920,
    y1: 1247 / 1920,
    captionY0: 1040 / 1920,
  },
} as const;

/** The life layer's cap (research §3.6): small, slow, never across a label. */
export const LIFE = { maxLuminanceChange: 0.15, maxHz: 1 } as const;

/**
 * The frame checks' own values (shots/frame-checks.ts; house, to be tuned
 * on the bench): how much boxes may overlap, what is blank or tiny, the
 * band of pixels a text is read against, and how fast each axis's score
 * falls, as a share of 10 per share of the scene that fails.
 */
export const FRAME_CHECKS = {
  /** Words on words: overlapping more than this share of the smaller box. */
  overlapShare: 0.1,
  /** A label over this share of its own subject hides it. */
  coverShare: 0.25,
  /** A subject under this share of the frame's area is a strip, not a picture (the jet engine was 0.7%). */
  tinyArea: 0.02,
  /** The band just outside a text's box that its background is read from, in frame pixels. */
  ringPx: [2, 8] as const,
  /** How far off the frame's median a pixel's luma is to count as ink, 0 to 1. */
  inkLuma: 0.06,
  /** A frame with less ink than this share of it is blank. */
  blankInk: 0.005,
  /** Neighbouring stills this close that jump in brightness by SAFETY.flicker and back are a flash. */
  flashWithinMs: 1000,
  /** Text fainter than this is coming or going: its size, contrast and place are judged once it is up. */
  judgedOpacity: 0.6,
  /** How far past its first and last word the voice's span reaches, for a frame that must show something. */
  voicedPadMs: 500,
  /**
   * How much of its axis's 10 each failure takes, times how much of the
   * scene it covers and how badly (words at two-thirds of their floor in
   * every still take half of readability's); each takes its part of what
   * the others leave. A word card a third of the time takes all of truth.
   */
  weights: {
    textSmall: 1.5,
    captionSmall: 1,
    contrast: 1.5,
    overlap: 1,
    safe: 0.5,
    focal: 1.2,
    noPicture: 1,
    blank: 2,
    flash: 0.5,
    gapShort: 1,
    gapLong: 1.5,
    dwell: 1,
    firstLate: 0.5,
    card: 3,
    person: 2,
    tiny: 1,
  },
} as const;

/** What an explainer never shows. The plan check, the frame check and the critic all name these. */
export const BANNED = [
  'word-card',
  'title-on-gradient',
  'fade-everything',
  'generic-particles',
  'glow',
  'corner-labels',
  'frame-border',
  'stacked-layout',
  'stock-figure-for-group',
  'invented-place',
  'audience-on-screen',
  'drawn-likeness',
] as const;
export type BannedThing = (typeof BANNED)[number];

/** The critic's loop (the video's: score, fix the worst three, again until all pass). */
export const LOOP = { rounds: 3, passScore: 8, worst: 3 } as const;

/** What the critic scores, each 1 to 10. */
export const CRITIC_AXES = [
  'clarity',
  'readability',
  'composition',
  'motion',
  'depth',
  'truth',
  'polish',
  'hook',
] as const;
export type CriticAxis = (typeof CRITIC_AXES)[number];

/**
 * The rules in words, for the board's and the critic's prompts. Kept short:
 * a mini model follows a few plain rules better than many.
 */
export const RULES_PROMPT = [
  'Every shot is a set, actors, information, life and one camera, each change on the exact words that cause it.',
  'One subject per beat, and big: it fills its share of the frame. Nothing small on blank paper; never stack pictures.',
  'Something new every 2 to 4 seconds; the first change within 1.5 seconds; never 6 seconds without a change unless it is a declared hold.',
  'One attention cue at a time, and at most two moving things.',
  'At most 8 words on the stage, 3 per label; numbers and labels stay long enough to read.',
  "Truth: a named place only as the map or a verified photo of it; a named person only as a verified portrait or a trace of them (a signature, a document); groups as silhouettes in their side's colour; every number, place, person and photo from the research log.",
  'Never: a word card standing in for a picture, a centred title on a gradient, everything fading in, sparkles or glows, frame borders, a stock figure for a real group, an invented place, the audience on screen.',
  'The camera moves with intent: establish, push in on what is named, pull back to show the whole, travel along what connects. Zoom only on what the voice names.',
].join('\n');
