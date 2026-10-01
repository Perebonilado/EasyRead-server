/**
 * How the editor's desk calls its models (infographic-editor-plan §3), the
 * parts the adapter shares with nothing else: OpenAI's reasoning effort
 * per task (as writerThinking is DeepSeek's), the web search's pages and
 * how many searches it made (each billed), and a prompt asked again with
 * its last answer and what to change.
 */
import type { LanguageModelUsage } from 'ai';
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

/** What a search call's steps hold that is counted: its sources and its tool calls. */
interface Searched {
  steps?: readonly {
    sources?: readonly { sourceType?: string; url?: string; title?: string }[];
    toolCalls?: readonly { toolName?: string }[];
  }[];
  sources?: readonly { sourceType?: string; url?: string; title?: string }[];
  toolCalls?: readonly { toolName?: string }[];
}

/** The pages a search call found, each once: the only ones a claim may cite. */
export function foundOf(result: Searched): EditorFound[] {
  const all = [
    ...(result.steps ?? []).flatMap((step) => step.sources ?? []),
    ...(result.sources ?? []),
  ];
  const seen = new Set<string>();
  return all.flatMap((source) => {
    if (source.sourceType && source.sourceType !== 'url') return [];
    if (!source.url) return [];
    const key = urlKey(source.url);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ url: source.url, title: source.title ?? '' }];
  });
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
