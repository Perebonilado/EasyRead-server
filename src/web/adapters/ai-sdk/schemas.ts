import { z } from 'zod';
import { VISUAL_MOTIONS } from '../../../business/domain/visual';
import {
  FIGURE_MANNERS,
  FIGURE_OUTLINES,
  FIGURE_PARTS,
} from '../../../business/domain/visual-figures';
import { MECHANISM_KINDS } from '../../../business/domain/visual-mechanisms';

/**
 * Structured output contracts.
 *
 * The AI SDK enforces these at the provider level (JSON schema mode) and
 * validates the result before it reaches us, which is what removes the
 * hand-rolled "find the JSON in the prose" recovery the previous gateway
 * needed. A response that doesn't fit the schema raises rather than silently
 * degrading into an empty page.
 */

export const blocksSchema = z.object({
  blocks: z
    .array(
      z.object({
        type: z
          .enum([
            'headingOne',
            'headingTwo',
            'paragraph',
            'bullet',
            'code',
            'table',
            'math',
          ])
          .describe(
            'Pipe-separated rows (header first) are "table", not "code"; ' +
              '"code" is for program source, commands, and config; "math" is ' +
              'display-mode LaTeX without $$ delimiters, never prose.',
          ),
        text: z.string().min(1),
      }),
    )
    .min(1),
});

/**
 * OCR of one scanned page. Unlike simplification, an empty result is a valid
 * answer here — a page can genuinely hold nothing readable — so `blocks` has
 * no minimum.
 */
export const ocrPageSchema = z.object({
  blocks: z.array(
    z.object({
      type: z
        .enum([
          'headingOne',
          'headingTwo',
          'paragraph',
          'bullet',
          'code',
          'table',
          'math',
        ])
        .describe(
          'Pipe-separated rows (header first) are "table", not "code"; ' +
            '"code" is for program source, commands, and config; "math" is ' +
            'display-mode LaTeX without $$ delimiters, never prose.',
        ),
      text: z.string().min(1),
    }),
  ),
  handwritten: z
    .boolean()
    .describe('true when most of the page is handwriting'),
});

export const topicsSchema = z.object({
  topics: z.array(
    z.object({
      title: z.string().min(1).max(500),
      shortDescription: z.string().max(500).nullable(),
      startPage: z.number().int().min(1),
      endPage: z.number().int().min(1),
    }),
  ),
});

export const diagramSchema = z.object({
  title: z.string().min(1).max(120),
  /** Mermaid source, no code fences. */
  mermaid: z.string().min(10),
});

export const sketchSchema = z.object({
  title: z.string().min(1).max(120),
  /** Constrained SVG per PROMPTS.sketch; sanitized again on the client. */
  svg: z.string().min(10),
});

/**
 * A diagram with one load-bearing node blanked to "?" — the visual-scaffold
 * check (scaffolding plan P6). The student names the missing part.
 */
export const diagramClozeSchema = z.object({
  title: z.string().min(1).max(120),
  /** Mermaid source containing exactly one node labeled "?". */
  mermaid: z.string().min(10),
  options: z.array(z.string().min(1).max(120)).min(3).max(4),
  correctIndex: z.number().int().min(0),
  explanation: z.string().min(1).max(300),
});

/**
 * Solo-study checks (scaffolding plan P7): 2-3 MCQs on one topic, one detail
 * question and one higher-order question, in the source study's own item
 * design (§3.2.3).
 */
export const topicQuizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        options: z.array(z.string().min(1).max(160)).min(3).max(4),
        correctIndex: z.number().int().min(0),
        explanation: z.string().min(1).max(300),
      }),
    )
    .min(2)
    .max(3),
});

/**
 * A chapter preview written for comprehension (guided reading) — the skim
 * ritual's material, generated once per topic and cached.
 */
/** A check answered aloud: a flashcard with one answer said back, or true or false. */
export const spokenQuizSchema = z.object({
  questions: z
    .array(
      z.object({
        kind: z.enum(['flashcard', 'true_false', 'mcq']),
        question: z.string().min(1).max(300),
        /** The answer in a sentence for a flashcard; "True" or "False"; for mcq, the right option word for word. */
        answer: z.string().min(1).max(300),
        /** For mcq only: three or four options, the answer among them. */
        options: z.array(z.string().min(1).max(160)).max(4).optional(),
        explanation: z.string().min(1).max(300),
      }),
    )
    .min(2)
    .max(3),
});

/**
 * A generated batch. Wider than `topicQuizSchema` because these items are
 * banked and scheduled rather than shown once: they carry a hint, a topic
 * label, and the source sentence the writer worked from.
 */
export const itemBatchSchema = z.object({
  items: z
    .array(
      z.object({
        kind: z.enum(['mcq', 'flashcard', 'cloze', 'true_false']),
        stem: z.string().min(1).max(400),
        options: z.array(z.string().min(1).max(200)).min(1).max(4),
        correctIndex: z.number().int().min(0),
        explanation: z.string().min(1).max(400),
        hint: z.string().max(200).nullable(),
        topicTitle: z.string().max(120).nullable(),
        sourceQuote: z.string().max(400).nullable(),
      }),
    )
    .min(1)
    .max(12),
});

/**
 * The verifier's answer, produced WITHOUT being told the intended one.
 *
 * `answerIndex` is the option the verifier believes is correct reading only
 * the source; `quote` must be copied verbatim from that source. An item is
 * banked only when this answer matches its author's and a quote came back,
 * which is what stops a hallucinated question reaching a student.
 */
export const itemVerdictSchema = z.object({
  answerIndex: z.number().int().min(-1),
  quote: z.string().max(400).nullable(),
  supported: z.boolean(),
});

export const previewSchema = z.object({
  about: z.string().min(1).max(600),
  outline: z.array(z.string().min(1).max(200)).min(2).max(10),
  keyTerms: z
    .array(
      z.object({
        term: z.string().min(1).max(120),
        gloss: z.string().min(1).max(200),
      }),
    )
    .max(8),
  howItEnds: z.string().min(1).max(400),
  /** Shape-only retelling prompts; the recall stage's "Need a nudge?". */
  recallCues: z.array(z.string().min(1).max(160)).min(3).max(5),
});

/**
 * The system's grade of a book-closed recall (guided reading). Every key
 * required; an empty array is a valid answer ("nothing missed").
 */
export const recallGradeSchema = z.object({
  /**
   * Which of the `previouslyMissed` ideas this recall finally covered, by
   * index. Indices rather than strings so an idea can never be silently
   * re-worded on the way back, which would break the fold that closes it.
   */
  nowCovered: z
    .array(z.number().int().min(0))
    .describe(
      'Indices into the previously-missed list that this recall now covers.',
    ),
  score: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Fraction of the chapter's load-bearing ideas the recall carries.",
    ),
  nailed: z.array(z.string().min(1).max(240)).max(6),
  missed: z.array(z.string().min(1).max(240)).max(6),
  focus: z.array(z.string().min(1).max(240)).max(4),
});

/** Verdict on a reader answering their own question (guided reading). */
export const questionCheckSchema = z.object({
  verdict: z.enum(['correct', 'partial', 'incorrect']),
  explanation: z.string().min(1).max(500),
  page: z
    .number()
    .int()
    .min(0)
    .describe('Page (from the [p.N] markers) answering it; 0 when none does.'),
});

/** Up to three questions, each with a small ordered set of answers. */
export const interviewSchema = z.object({
  topic: z.string().min(1).max(200),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        question: z.string().min(1).max(300),
        options: z.array(z.string().min(1).max(120)).min(2).max(4),
      }),
    )
    .max(3),
});

export const outlineSchema = z.object({
  title: z.string().min(1).max(200),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().min(1).max(600),
        pages: z.number().int().min(1).max(12),
      }),
    )
    .min(1)
    .max(40),
  /**
   * Real topics this document does not cover at this length; empty when it
   * covers the subject properly. Required rather than optional because
   * structured output rejects a schema whose keys aren't all required.
   */
  furtherTopics: z.array(z.string().min(1).max(160)).max(8),
});

/**
 * Flat rather than nested per chapter: structured output requires every key
 * required, and a flat list makes "no prerequisites for chapter 2" the
 * natural absence of rows instead of an awkward empty object.
 */
export const prerequisitesSchema = z.object({
  prerequisites: z
    .array(
      z.object({
        chapter: z.number().int().min(1),
        concept: z.string().min(1).max(300),
        why: z.string().min(1).max(600),
        coveredByChapter: z.number().int().min(0),
      }),
    )
    .max(60),
});

/**
 * A session recap.
 *
 * Every key is required — OpenAI's structured output rejects optional ones —
 * so "nothing looked shaky" is an empty array, and a page the model cannot
 * place is 0 rather than a missing field.
 */
export const recapSchema = z.object({
  headline: z.string().min(1).max(400),
  covered: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        gist: z.string().min(1).max(400),
        page: z.number().int().min(0),
      }),
    )
    .max(8),
  keyTerms: z
    .array(
      z.object({
        term: z.string().min(1).max(120),
        meaning: z.string().min(1).max(300),
      }),
    )
    .max(8),
  shaky: z
    .array(
      z.object({
        what: z.string().min(1).max(200),
        why: z.string().min(1).max(300),
        page: z.number().int().min(0),
      }),
    )
    .max(5),
  nextStep: z.string().min(1).max(300),
});

/**
 * A topic's lecture plan. Beats are capped generously: a chapter longer
 * than this is planned in one pass anyway, and the segment writer falls
 * back to the arc for any page the plan skipped.
 */
export const lectureOutlineSchema = z.object({
  hook: z.string().min(1).max(900),
  arc: z.string().min(1).max(600),
  /** The one case or question the chapter follows, page by page. */
  thread: z.string().min(1).max(300),
  points: z.array(z.string().min(1).max(200)).min(1).max(4),
  payoff: z.string().min(1).max(400),
  terms: z
    .array(
      z.object({
        term: z.string().min(1).max(80),
        meaning: z.string().min(1).max(200),
      }),
    )
    .max(12),
  problem: z.string().max(300).nullable(),
  beats: z
    .array(
      z.object({
        pageNumber: z.number().int().min(1),
        goal: z.string().min(1).max(300),
        point: z.number().int().min(0).max(3),
        ask: z.string().max(240).nullable(),
        callback: z.string().max(300).nullable(),
        foreshadow: z.string().max(300).nullable(),
        newHere: z.string().max(200),
        skip: z.string().max(300).nullable(),
        weight: z.enum(['full', 'light']),
        moves: z.array(z.string().min(1).max(80)).min(1).max(4),
        // Every key must be required for the provider's strict schemas; a
        // plan with no note answers null.
        moveBlocks: z
          .array(z.array(z.number().int().min(0).max(200)).nullable())
          .max(4)
          .nullable(),
        /** The paragraphs no move teaches, each with why; null when the page came without numbers. */
        skipBlocks: z
          .array(
            z.object({
              block: z.number().int().min(0).max(200),
              reason: z.enum(['repeat', 'caption', 'reference', 'decoration']),
            }),
          )
          .max(40)
          .nullable(),
        pitfall: z.string().max(240).nullable(),
        turn: z.boolean(),
        /** The question this page leaves open, which the next page's first sentence answers; null on the last. */
        handoff: z.string().max(240).nullable(),
        figure: z.object({
          kind: z.enum(['process', 'structure', 'comparison', 'none']),
          shows: z.string().max(200).nullable(),
        }),
      }),
    )
    .max(80),
});

/** The board writer's draft: a heading and a few anchored items. */
export const lectureBoardSchema = z.object({
  heading: z.string().max(80).nullable(),
  items: z
    .array(
      z.object({
        kind: z.enum(['term', 'point', 'figure', 'relation', 'cue']),
        text: z.string().max(80).nullable(),
        meaning: z.string().max(120).nullable(),
        from: z.string().max(80).nullable(),
        to: z.string().max(80).nullable(),
        label: z.string().max(40).nullable(),
        target: z.string().max(80).nullable(),
        shape: z.enum(['underline', 'circle', 'box', 'highlight']).nullable(),
        level: z.union([z.literal(1), z.literal(2)]).nullable(),
        important: z.boolean().nullable(),
        sentence: z.number().int().min(1).max(400),
        anchor: z.string().max(160).nullable(),
      }),
    )
    .max(30),
});

/** A figure before layout. */
export const lectureDiagramSchema = z.object({
  title: z.string().min(1).max(80),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(24),
        label: z.string().min(1).max(60),
        shape: z
          .enum(['box', 'ellipse', 'diamond', 'cylinder', 'note'])
          .nullable(),
        anchor: z.string().min(1).max(160),
      }),
    )
    .min(1)
    .max(14),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(24),
        to: z.string().min(1).max(24),
        label: z.string().max(40).nullable(),
        anchor: z.string().min(1).max(160),
      }),
    )
    .max(20),
  groups: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        memberIds: z.array(z.string().min(1).max(24)).max(14),
      }),
    )
    .max(4),
});

const sketchLabel = z.string().min(1).max(40);
const fraction = z.number().min(0).max(1);

/** The plan for a visual: what one chapter's scene teaches and whether the chapter suits a picture. */
export const visualPlanSchema = z.object({
  learningGoal: z.string().min(1).max(200),
  keyTerms: z.array(z.string().min(1).max(40)).max(8),
  diagramConcept: z.string().min(1).max(240),
  centre: z.object({
    what: z.string().min(1).max(80),
    how: z.enum(['picture', 'shape']),
    /** The preset's name from the catalogue when how is picture; else null. */
    picture: z.string().max(32).nullable(),
  }),
  beats: z.array(z.string().min(1).max(160)).min(3).max(10),
  fit: z.enum(['good', 'partial', 'poor']),
  fitReason: z.string().max(200).nullable(),
});

const visualColor = z
  .enum(['green', 'amber', 'blue', 'violet', 'orange', 'red', 'ink', 'muted'])
  .nullable();
/** Short enough that the name label the layout adds under a picture still fits the id rule. */

/** A card's named thing: its words, and a picture from the library or null. */
const cardItem = z.object({
  text: z.string().min(1).max(40),
  picture: z.string().max(32).nullable(),
});
/** One side of a compare card. */
const cardSide = z.object({
  label: z.string().min(1).max(22),
  picture: z.string().max(32).nullable(),
  items: z.array(z.string().min(1).max(22)).max(4).nullable(),
});

/** A card's fields: which card, and what it carries; fields a card does not use are null. */
const momentFields = {
  card: z.enum([
    'title',
    'statement',
    'number',
    'chips',
    'list',
    'picture',
    'term',
    'compare',
    'flow',
    'hub',
    'chart',
    'scene',
    'timeline',
    'table',
    'rings',
    'overlap',
    'count',
    'mechanism',
  ]),
  color: visualColor,
  eyebrow: z.string().max(30).nullable(),
  heading: z.string().max(40).nullable(),
  text: z.string().max(120).nullable(),
  emphasis: z.array(z.string().min(1).max(24)).max(3).nullable(),
  figure: z.string().max(12).nullable(),
  caption: z.string().max(40).nullable(),
  bar: z
    .object({
      value: z.number().min(0).max(1),
      left: z.string().max(30).nullable(),
      right: z.string().max(30).nullable(),
      markers: z
        .array(
          z.object({
            at: z.number().min(0).max(1),
            text: z.string().min(1).max(14),
          }),
        )
        .max(4)
        .nullable(),
    })
    .nullable(),
  items: z.array(cardItem).max(5).nullable(),
  picture: z.string().max(32).nullable(),
  /** For a picture card: the shape the thing takes, when no drawing of it exists. */
  shape: z
    .object({
      outline: z.enum(FIGURE_OUTLINES),
      parts: z.array(z.enum(FIGURE_PARTS)).max(5),
      manner: z.enum(FIGURE_MANNERS),
    })
    .nullable(),
  /** For a picture card: how the drawn thing moves once shown. */
  motion: z.enum(VISUAL_MOTIONS).nullable(),
  /** For a picture or mechanism card: short lines that point at a part and follow it. */
  callouts: z
    .array(
      z.object({
        part: z.string().min(1).max(16),
        text: z.string().min(1).max(30),
      }),
    )
    .max(3)
    .nullable(),
  /** For a mechanism card: the machine, the page's numbers, and the stages to show in order. */
  mechanism: z
    .object({
      kind: z.enum(MECHANISM_KINDS),
      params: z
        .object({
          capacity: z.number().nullable(),
          rate: z.number().nullable(),
          requests: z.number().nullable(),
          perRequest: z.number().nullable(),
          arrivals: z.number().nullable(),
          servers: z.number().nullable(),
          service: z.number().nullable(),
          stages: z.number().nullable(),
          slow: z.number().nullable(),
          stations: z.number().nullable(),
          speed: z.number().nullable(),
          left: z.number().nullable(),
          right: z.number().nullable(),
          size: z.number().nullable(),
          contacts: z.number().nullable(),
          beats: z.number().nullable(),
        })
        .nullable(),
      phases: z
        .array(
          z.object({
            stage: z.string().min(1).max(12),
            text: z.string().min(1).max(24),
          }),
        )
        .max(4)
        .nullable(),
    })
    .nullable(),
  name: z.string().max(24).nullable(),
  bubble: z.string().max(36).nullable(),
  term: z.string().max(24).nullable(),
  meaning: z.string().max(96).nullable(),
  left: cardSide.nullable(),
  right: cardSide.nullable(),
  centre: cardItem.nullable(),
  inputs: z.array(cardItem).max(4).nullable(),
  outputs: z.array(cardItem).max(4).nullable(),
  chart: z
    .object({
      kind: z.enum(['bars', 'line', 'shares', 'pair']),
      series: z
        .array(
          z.object({
            label: z.string().min(1).max(18),
            value: z.number(),
          }),
        )
        .min(1)
        .max(6),
      unit: z.string().max(10).nullable(),
    })
    .nullable(),
  pictures: z
    .array(
      z.object({
        picture: z.string().min(1).max(32),
        name: z.string().min(1).max(24),
        size: z.enum(['big', 'small']).nullable(),
        motion: z.enum(VISUAL_MOTIONS).nullable(),
      }),
    )
    .max(4)
    .nullable(),
  points: z
    .array(
      z.object({
        label: z.string().min(1).max(14),
        text: z.string().min(1).max(40),
      }),
    )
    .max(6)
    .nullable(),
  columns: z.array(z.string().min(1).max(16)).max(3).nullable(),
  rows: z
    .array(z.array(z.string().min(1).max(16)).max(3))
    .max(4)
    .nullable(),
  layers: z.array(z.string().min(1).max(18)).max(5).nullable(),
  shared: z.array(z.string().min(1).max(18)).max(3).nullable(),
  reveals: z
    .array(
      z.object({
        part: z.number().int().min(0),
        sentence: z.number().int().min(0),
        /** The app finds the word the part is named by; this is only a hint. */
        word: z.number().int().min(0).nullable(),
      }),
    )
    .max(8)
    .nullable(),
};

/** The tutorial: the narration, and the moments that cut it, each one card with its fields. Fields a card does not use are null. */
export const visualTutorialSchema = z.object({
  title: z.string().min(1).max(60),
  /** Poor when the page has too little to teach; then the reason, for the student. */
  fit: z.enum(['good', 'poor']),
  fitReason: z.string().max(160).nullable(),
  sentences: z.array(z.string().min(1).max(300)).min(8).max(48),
  moments: z
    .array(
      z.object({
        from: z.number().int().min(0),
        to: z.number().int().min(0),
        ...momentFields,
      }),
    )
    .min(3)
    .max(40),
});

/** The tutor's live sketch: one template, and the fields that template reads; the rest null. */
export const lectureSketchSchema = z.object({
  template: z.enum(['graph', 'ring', 'line', 'layers', 'grid']),
  title: z.string().min(1).max(80),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(24),
        label: sketchLabel,
        shape: z
          .enum(['box', 'ellipse', 'diamond', 'cylinder', 'note'])
          .nullable(),
        anchor: z.string().max(160).nullable(),
      }),
    )
    .max(10)
    .nullable(),
  edges: z
    .array(
      z.object({
        from: z.string().min(1).max(24),
        to: z.string().min(1).max(24),
        label: z.string().max(40).nullable(),
        anchor: z.string().max(160).nullable(),
      }),
    )
    .max(12)
    .nullable(),
  groups: z
    .array(
      z.object({
        label: sketchLabel,
        memberIds: z.array(z.string().min(1).max(24)).max(10),
      }),
    )
    .max(2)
    .nullable(),
  points: z
    .array(z.object({ label: sketchLabel, at: fraction.nullable() }))
    .max(8)
    .nullable(),
  markers: z
    .array(z.object({ label: sketchLabel, at: fraction.nullable() }))
    .max(6)
    .nullable(),
  arrowsClockwise: z.boolean().nullable(),
  join: z.object({ left: sketchLabel, right: sketchLabel }).nullable(),
  cells: z.number().int().min(0).max(40).nullable(),
  ends: z.object({ left: sketchLabel, right: sketchLabel }).nullable(),
  ticks: z
    .array(z.object({ label: sketchLabel, at: fraction }))
    .max(6)
    .nullable(),
  brackets: z
    .array(z.object({ label: sketchLabel, from: fraction, to: fraction }))
    .max(2)
    .nullable(),
  layers: z.array(sketchLabel).max(6).nullable(),
  layerArrows: z.boolean().nullable(),
  rowLabels: z.array(sketchLabel).max(6).nullable(),
  colLabels: z.array(sketchLabel).max(6).nullable(),
  cellText: z
    .array(z.array(z.string().max(20)).max(6))
    .max(6)
    .nullable(),
});

export const sketchJudgeSchema = z.object({
  shows: z.boolean(),
  wrong: z.string().max(300).nullable(),
});

/** The judge's word on a page's stills: each drawing by name, and each moment as a whole. */
export const visualJudgeSchema = z.object({
  moments: z
    .array(
      z.object({
        moment: z.number().int().min(1),
        drawings: z
          .array(
            z.object({
              name: z.string().min(1).max(40),
              looksRight: z.boolean(),
              wrong: z.string().max(160).nullable(),
            }),
          )
          .max(8),
        textTrouble: z.string().max(160).nullable(),
        crowded: z.boolean(),
        showsBrief: z.boolean(),
        verdict: z.enum(['go', 'redo']),
        note: z.string().max(200).nullable(),
      }),
    )
    .max(40),
});

/** A short segment around a chapter: its words, its check, or the review. */
export const lectureExtraSchema = z.object({
  script: z.string().min(1).max(4000),
});

/** One page of spoken lecture, one section per move of the beat. */
export const lectureSegmentSchema = z.object({
  sections: z
    .array(
      z.object({
        move: z.number().int().min(0).max(8),
        text: z.string().min(1).max(4000),
        /** The note sentences this section explains, as "block.sentence" or "block"; empty for the writer's own words. */
        teaches: z.array(z.string().min(1).max(12)).max(12),
        /** The words a listener should hear land, up to five, copied exactly from this section's text; null for most sections. */
        catch: z.string().max(60).nullable(),
      }),
    )
    .min(1)
    .max(6),
});

/** The board planned for a page before its speech. */
export const lectureBoardPlanSchema = z.object({
  heading: z.string().min(1).max(60),
  lines: z
    .array(
      z.object({
        move: z.number().int().min(0).max(8),
        kind: z.enum(['term', 'point', 'figure']),
        text: z.string().min(1).max(96),
        meaning: z.string().max(120).nullable(),
        level: z.union([z.literal(1), z.literal(2)]).nullable(),
        important: z.boolean().nullable(),
      }),
    )
    .max(24),
});

/** The grounding check: is every claim in the script on the page? */
export const lectureVerifySchema = z.object({
  grounded: z.boolean(),
  problems: z.array(z.string().max(300)).max(8),
});

/** A respelling per term, in the order asked. */
export const pronunciationsSchema = z.object({
  entries: z
    .array(
      z.object({
        term: z.string().min(1).max(120),
        spoken: z.string().min(1).max(200),
      }),
    )
    .max(80),
});

/** The narration alone: the sentences, cut into moments, each with its intent. */
export const visualNarrationSchema = z.object({
  title: z.string().min(1).max(60),
  fit: z.enum(['good', 'poor']),
  fitReason: z.string().max(160).nullable(),
  sentences: z.array(z.string().min(1).max(300)).min(8).max(48),
  moments: z
    .array(
      z.object({
        from: z.number().int().min(0),
        to: z.number().int().min(0),
        intent: z.string().min(1).max(120),
      }),
    )
    .min(3)
    .max(40),
});

/** The director's decisions: one entry per moment, the reasoning written before the card. */
export const visualDecisionsSchema = z.object({
  moments: z
    .array(
      z.object({
        index: z.number().int().min(0),
        reasoning: z.string().min(1).max(600),
        shouldSee: z.string().min(1).max(160),
        confidence: z.enum(['high', 'low']),
        ...momentFields,
      }),
    )
    .min(1)
    .max(40),
});
