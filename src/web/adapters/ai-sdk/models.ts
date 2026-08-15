import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EmbeddingModel, LanguageModel } from 'ai';
import type { LlmTask } from '../../../business/ports/llm.port';

export const PROVIDERS = ['openai', 'anthropic', 'google'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

/** Which env var carries each provider's key. */
const API_KEY_VAR: Record<ProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

/**
 * Per-task model overrides. Falls back to `AI_MODEL_DEFAULT`, so a deployment
 * can start with one model everywhere and later move only the expensive tasks —
 * simplification is 300 calls a document, a highlight is one.
 */
const TASK_VAR: Record<LlmTask, string> = {
  summarize: 'AI_MODEL_SUMMARIZE',
  topics_outline: 'AI_MODEL_TOPICS',
  topics_page_tag: 'AI_MODEL_TOPICS',
  topics_prereqs: 'AI_MODEL_TOPICS',
  simplify_standard: 'AI_MODEL_SIMPLIFY_STANDARD',
  simplify_easiest: 'AI_MODEL_SIMPLIFY_EASIEST',
  highlight_explain: 'AI_MODEL_HIGHLIGHT',
  highlight_simplify: 'AI_MODEL_HIGHLIGHT',
  highlight_define: 'AI_MODEL_HIGHLIGHT',
  chat_document: 'AI_MODEL_CHAT',
  session_recap: 'AI_MODEL_CHAT',
  learn_interview: 'AI_MODEL_LEARN',
  learn_outline: 'AI_MODEL_LEARN',
  learn_write: 'AI_MODEL_LEARN',
  visualize_query: 'AI_MODEL_VISUALIZE_QUERY',
  diagram: 'AI_MODEL_DIAGRAM',
  embed: 'AI_EMBED_MODEL',
};

const DEFAULT_MODEL = 'openai:gpt-4o-mini';
const DEFAULT_EMBED_MODEL = 'openai:text-embedding-3-small';

export interface ModelRef {
  provider: ProviderName;
  modelId: string;
}

/** `openai:gpt-4o-mini` → `{ provider: 'openai', modelId: 'gpt-4o-mini' }`. */
export function parseModelRef(spec: string): ModelRef {
  const separator = spec.indexOf(':');
  if (separator === -1) {
    throw new Error(
      `Model "${spec}" is missing its provider. Use one of ${PROVIDERS.join('|')}:<model-id>, e.g. ${DEFAULT_MODEL}`,
    );
  }

  const provider = spec.slice(0, separator).trim() as ProviderName;
  const modelId = spec.slice(separator + 1).trim();

  if (!PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown model provider "${provider}". Expected ${PROVIDERS.join(', ')}`,
    );
  }
  if (!modelId) throw new Error(`Model "${spec}" is missing a model id`);

  return { provider, modelId };
}

type Providers = Record<ProviderName, unknown>;

/**
 * An empty `*_BASE_URL` is not the same as an unset one to the AI SDK.
 *
 * The provider factories read these variables from `process.env` themselves,
 * and an empty string is treated as set-but-invalid — it throws
 * `baseURL must be a non-empty string` before a single request is made. A
 * blank line in `.env` (the natural way to write "I'm not overriding this")
 * would otherwise break every model call, so blanks are removed here and read
 * as what they plainly mean: unset.
 */
export function normaliseBaseUrlVars(
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of Object.keys(env)) {
    if (
      key.endsWith('_BASE_URL') &&
      env[key] !== undefined &&
      !env[key].trim()
    ) {
      delete env[key];
    }
  }
}

/**
 * Resolves task → model, and caches the provider clients.
 *
 * Only providers actually named by the configuration are constructed, so
 * running entirely on OpenAI never requires an Anthropic key to exist.
 */
export class ModelRegistry {
  private readonly logger = new Logger(ModelRegistry.name);
  private readonly clients = new Map<ProviderName, Providers[ProviderName]>();
  private sdk: Promise<typeof import('ai')> | null = null;

  constructor(private readonly config: ConfigService) {
    normaliseBaseUrlVars();
  }

  /** The AI SDK is ESM-only; this server compiles to CommonJS. */
  modules(): Promise<typeof import('ai')> {
    this.sdk ??= import('ai');
    return this.sdk;
  }

  refFor(task: LlmTask): ModelRef {
    const fallback =
      task === 'embed' ? this.defaultEmbedSpec() : this.defaultSpec();
    return parseModelRef(this.config.get<string>(TASK_VAR[task]) || fallback);
  }

  async languageModel(
    task: LlmTask,
  ): Promise<{ model: LanguageModel; ref: ModelRef }> {
    const ref = this.refFor(task);
    const provider = await this.client(ref.provider);

    // OpenAI's own default is the Responses API, but most OpenAI-compatible
    // gateways (OpenRouter, Groq, a local server) only speak chat completions.
    // `OPENAI_API_MODE=chat` targets those without changing anything else.
    const useChat =
      ref.provider === 'openai' &&
      this.config.get<string>('OPENAI_API_MODE') === 'chat';

    const model =
      useChat && provider.chat
        ? provider.chat(ref.modelId)
        : provider.languageModel(ref.modelId);
    return { model: model as LanguageModel, ref };
  }

  async embeddingModel(): Promise<{ model: EmbeddingModel; ref: ModelRef }> {
    const ref = this.refFor('embed');
    const provider = await this.client(ref.provider);

    if (!provider.textEmbeddingModel) {
      throw new Error(`${ref.provider} does not provide embedding models`);
    }
    return {
      model: provider.textEmbeddingModel(ref.modelId) as EmbeddingModel,
      ref,
    };
  }

  /**
   * Checked at boot rather than on the first upload: a missing key should stop
   * the process starting, not surface as a failed document an hour later.
   */
  assertConfigured(): void {
    const required = new Set<ProviderName>();
    for (const task of Object.keys(TASK_VAR) as LlmTask[]) {
      required.add(this.refFor(task).provider);
    }

    const missing = [...required].filter(
      (provider) => !this.config.get(API_KEY_VAR[provider]),
    );
    if (missing.length) {
      throw new Error(
        `Missing API key(s) for configured model provider(s): ${missing
          .map((provider) => API_KEY_VAR[provider])
          .join(', ')}`,
      );
    }

    this.logger.log(
      `Models: ${[
        ...new Set(
          (Object.keys(TASK_VAR) as LlmTask[]).map((task) => {
            const ref = this.refFor(task);
            return `${ref.provider}:${ref.modelId}`;
          }),
        ),
      ].join(', ')}`,
    );
  }

  private defaultSpec(): string {
    return this.config.get<string>('AI_MODEL_DEFAULT') || DEFAULT_MODEL;
  }

  private defaultEmbedSpec(): string {
    return this.config.get<string>('AI_EMBED_MODEL') || DEFAULT_EMBED_MODEL;
  }

  private async client(name: ProviderName): Promise<{
    languageModel(id: string): unknown;
    chat?(id: string): unknown;
    textEmbeddingModel?(id: string): unknown;
  }> {
    const cached = this.clients.get(name);
    if (cached) return cached as never;

    const apiKey = this.config.get<string>(API_KEY_VAR[name]);
    if (!apiKey) throw new Error(`${API_KEY_VAR[name]} is not set`);

    const baseURL =
      this.config.get<string>(`${name.toUpperCase()}_BASE_URL`) || undefined;
    const created = await this.create(name, apiKey, baseURL);

    this.clients.set(name, created);
    return created;
  }

  private async create(name: ProviderName, apiKey: string, baseURL?: string) {
    switch (name) {
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({ apiKey, baseURL });
      }
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({ apiKey, baseURL });
      }
      case 'google': {
        const { createGoogle } = await import('@ai-sdk/google');
        return createGoogle({ apiKey, baseURL });
      }
    }
  }
}
