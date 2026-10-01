/**
 * How the editor's desk calls its models (infographic-editor-plan §3), the
 * parts the adapter shares with nothing else: OpenAI's reasoning effort
 * per task (as writerThinking is DeepSeek's), the web search's pages and
 * how many searches it made (each billed), and a prompt asked again with
 * its last answer and what to change.
 */
import type { LanguageModelUsage } from 'ai';
import { z } from 'zod';
import type {
  EditorFound,
  StudioRevision,
} from '../../../business/ports/llm.port';
import { urlKey } from '../../../business/domain/studio/studio-editor';

/** The efforts OpenAI's reasoning models take. */
export const EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const;
export type Effort = (typeof EFFORTS)[number];

/** Options for a provider, as plain JSON. */
export type JsonOptions = Record<
  string,
  Record<string, string | number | boolean | Record<string, string>>
>;

/**
 * A call's reasoning, as its setting says (else `otherwise`): OpenAI's
 * reasoning effort; DeepSeek's thinking, on for anything above low, for a
 * deployment that points the task there; nothing for anyone else.
 */
export function effortOptions(
  provider: string,
  said: string | undefined,
  otherwise: Effort,
): { providerOptions?: JsonOptions } {
  const effort = (EFFORTS as readonly string[]).includes(said ?? '')
    ? (said as Effort)
    : otherwise;
  if (provider === 'openai')
    return { providerOptions: { openai: { reasoningEffort: effort } } };
  if (provider === 'deepseek')
    return {
      providerOptions: {
        deepseek: {
          thinking: {
            type: ['none', 'minimal', 'low'].includes(effort)
              ? 'disabled'
              : 'enabled',
          },
        },
      },
    };
  return {};
}

/** A step's prompt: its parts, and, asked again, its last answer and what to change or put right. */
export function revisedPrompt(
  parts: readonly string[],
  revision: StudioRevision,
): string {
  return [
    ...parts,
    ...(revision.previous
      ? [`Your last answer:\n${JSON.stringify(revision.previous)}`]
      : []),
    ...(revision.request
      ? [
          `The maker asks for this change; make it, and keep the rest as it was:\n${revision.request}`,
        ]
      : []),
    ...(revision.problems?.length
      ? [
          `Put these right and answer again in full:\n- ${revision.problems.join('\n- ')}`,
        ]
      : []),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** What a search's result says of what it found: the pages it consulted, or the one it opened. */
interface SearchOutput {
  sources?: readonly { type?: string; url?: string; title?: string }[];
  action?: { type?: string; url?: string };
}

/** What a search call's steps hold that is counted: its sources, its tool calls and their results. */
interface Searched {
  steps?: readonly {
    sources?: readonly { sourceType?: string; url?: string; title?: string }[];
    toolCalls?: readonly { toolName?: string }[];
    toolResults?: readonly { toolName?: string; output?: unknown }[];
    content?: readonly { type?: string; toolName?: string; output?: unknown }[];
  }[];
  sources?: readonly { sourceType?: string; url?: string; title?: string }[];
  toolCalls?: readonly { toolName?: string }[];
  toolResults?: readonly { toolName?: string; output?: unknown }[];
}

/**
 * The pages a search call found, each once: the only ones a claim may
 * cite. Those the answer cited (its sources), and those each search
 * consulted or opened (its results), which an answer shaped as JSON may
 * cite none of in its text.
 */
export function foundOf(result: Searched): EditorFound[] {
  const cited = [
    ...(result.steps ?? []).flatMap((step) => step.sources ?? []),
    ...(result.sources ?? []),
  ].flatMap((source) =>
    source.sourceType && source.sourceType !== 'url'
      ? []
      : [{ url: source.url, title: source.title }],
  );
  const results = [
    ...(result.steps ?? []).flatMap((step) => [
      ...(step.toolResults ?? []),
      ...(step.content ?? []).filter((part) => part.type === 'tool-result'),
    ]),
    ...(result.toolResults ?? []),
  ].filter((one) => one.toolName === 'web_search');
  const consulted = results.flatMap((one) => {
    const output = (one.output ?? {}) as SearchOutput;
    return [
      ...(output.sources ?? []).map((s) => ({ url: s.url, title: s.title })),
      ...(output.action?.url ? [{ url: output.action.url, title: '' }] : []),
    ];
  });
  const seen = new Map<string, EditorFound>();
  for (const page of [...cited, ...consulted]) {
    if (!page.url || !/^https?:\/\//u.test(page.url)) continue;
    const key = urlKey(page.url);
    const had = seen.get(key);
    if (!had) seen.set(key, { url: page.url, title: page.title ?? '' });
    else if (!had.title && page.title) had.title = page.title;
  }
  return [...seen.values()];
}

/** How many web searches a call made: each one billed. */
export function searchesOf(result: Searched): number {
  const calls = result.steps?.length
    ? result.steps.flatMap((step) => step.toolCalls ?? [])
    : (result.toolCalls ?? []);
  return calls.filter((call) => call.toolName === 'web_search').length;
}

/** Two calls' usage as one. */
export function usageOf(
  a: LanguageModelUsage,
  b: LanguageModelUsage,
): LanguageModelUsage {
  const n = (x: number | undefined, y: number | undefined) =>
    (x ?? 0) + (y ?? 0);
  return {
    ...a,
    inputTokens: n(a.inputTokens, b.inputTokens),
    outputTokens: n(a.outputTokens, b.outputTokens),
    totalTokens: n(a.totalTokens, b.totalTokens),
    inputTokenDetails: {
      ...a.inputTokenDetails,
      cacheReadTokens: n(
        a.inputTokenDetails?.cacheReadTokens,
        b.inputTokenDetails?.cacheReadTokens,
      ),
    },
  };
}

/** Whether a call failed for its answer's shape, not for the service: asked another way. */
export const misshapen = (error: unknown) =>
  /NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse/u.test(
    (error as { name?: string }).name ?? '',
  );

/**
 * A schema whose every key may be left out, all the way down: a board's
 * answer is read whatever it omits (a model that leaves out the fields a
 * thing does not use), and filled() then gives each omitted key what the
 * schema would have. The same schema as the lesson writer's, so what other
 * parts of the Studio add to it flows in.
 */
export function lenient(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema instanceof z.ZodObject ? schema.deepPartial() : schema;
}

/** A schema's own type beneath its wrappers, and whether null is one of its values. */
function unwrapped(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  nullable: boolean;
} {
  let inner = schema;
  let nullable = false;
  for (let k = 0; k < 8; k += 1) {
    if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodTypeAny;
    else if (inner instanceof z.ZodNullable) {
      nullable = true;
      inner = inner.unwrap() as z.ZodTypeAny;
    } else if (inner instanceof z.ZodCatch || inner instanceof z.ZodDefault)
      inner = (inner._def as { innerType: z.ZodTypeAny }).innerType;
    else if (inner instanceof z.ZodEffects)
      inner = (inner._def as { schema: z.ZodTypeAny }).schema;
    else break;
  }
  return { inner, nullable };
}

/**
 * An answer read by a lenient schema, each key it left out given what the
 * full schema would have given it: its catch's value, null where null is
 * allowed, an empty string or list where one is required; down its
 * objects and its lists of objects.
 */
export function filled(value: unknown, schema: z.ZodTypeAny): unknown {
  if (value === undefined) {
    if (schema instanceof z.ZodCatch)
      return (
        schema._def as { catchValue: (ctx: unknown) => unknown }
      ).catchValue({ error: new z.ZodError([]), input: undefined });
    const { inner, nullable } = unwrapped(schema);
    if (nullable) return null;
    if (inner instanceof z.ZodString) return '';
    if (inner instanceof z.ZodArray) return [];
    if (inner instanceof z.ZodBoolean) return false;
    if (inner instanceof z.ZodObject) return filled({}, inner);
    return undefined;
  }
  const { inner } = unwrapped(schema);
  if (
    inner instanceof z.ZodObject &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const said = value as Record<string, unknown>;
    const out: Record<string, unknown> = { ...said };
    for (const [key, part] of Object.entries(
      inner.shape as Record<string, z.ZodTypeAny>,
    ))
      out[key] = filled(said[key], part);
    return out;
  }
  if (inner instanceof z.ZodArray && Array.isArray(value))
    return value.map((one) => filled(one, inner.element as z.ZodTypeAny));
  return value;
}
