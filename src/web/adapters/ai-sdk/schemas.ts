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
