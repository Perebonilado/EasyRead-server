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
        type: z.enum(['headingOne', 'headingTwo', 'paragraph', 'bullet']),
        text: z.string().min(1),
      }),
    )
    .min(1),
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
