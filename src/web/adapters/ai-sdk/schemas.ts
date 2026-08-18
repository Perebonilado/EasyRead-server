import { z } from 'zod';

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
});

/**
 * The system's grade of a book-closed recall (guided reading). Every key
 * required; an empty array is a valid answer ("nothing missed").
 */
export const recallGradeSchema = z.object({
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
