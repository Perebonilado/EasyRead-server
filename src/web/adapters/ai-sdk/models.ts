import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EmbeddingModel, LanguageModel } from 'ai';
import type { LlmTask } from '../../../business/ports/llm.port';
import { noticingFetch } from './noticing-fetch';

export const PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

/**
 * Which env var carries each provider's key. Google's may be given as
 * GEMINI_API_KEY instead, as the Gemini voice takes it (ALSO_KEY_VAR).
 */
const API_KEY_VAR: Record<ProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  // Text only: no speech, no embeddings, no vision. Cheap on output and
  // on a repeated prompt prefix, which every writer here has.
  deepseek: 'DEEPSEEK_API_KEY',
};

/** A second name a provider's key may be set under. */
const ALSO_KEY_VAR: Partial<Record<ProviderName, string>> = {
  google: 'GEMINI_API_KEY',
};

/**
 * Per-task model overrides. Falls back to `AI_MODEL_DEFAULT`, so a deployment
 * can start with one model everywhere and later move only the expensive tasks —
 * simplification is 300 calls a document, a highlight is one.
 */
const TASK_VAR: Record<LlmTask, string> = {
  lecture_outline: 'AI_MODEL_LECTURE_OUTLINE',
  lecture_segment: 'AI_MODEL_LECTURE_SEGMENT',
  lecture_verify: 'AI_MODEL_LECTURE_VERIFY',
  // The board writer is a cheap call per page; the rules are in code. The
  // diagram is the one place a stronger model pays, and there is at most
  // one every two pages.
  lecture_board: 'AI_MODEL_LECTURE_BOARD',
  lecture_diagram: 'AI_MODEL_LECTURE_DIAGRAM',
  // The tutor's live sketch fills a template; the small default model
  // cannot, so a deployment points this at a stronger one.
  lecture_sketch: 'AI_MODEL_LECTURE_SKETCH',
  sketch_judge: 'AI_MODEL_SKETCH_JUDGE',
  // The eyes of the see-and-fix loop and the drawing bench: a picture in,
  // a scored verdict out, one call a drawing looked at.
  drawing_judge: 'AI_MODEL_DRAWING_JUDGE',
  ocr_page: 'AI_MODEL_OCR',
  summarize: 'AI_MODEL_SUMMARIZE',
  topics_outline: 'AI_MODEL_TOPICS',
  topics_page_tag: 'AI_MODEL_TOPICS',
  topics_prereqs: 'AI_MODEL_TOPICS',
  simplify_standard: 'AI_MODEL_SIMPLIFY_STANDARD',
  // Maths pages need their steps exact and in order; the small model drops
  // and reorders them. One page in a few, at most.
  simplify_maths: 'AI_MODEL_SIMPLIFY_MATHS',
  // The tutor's worked problems: the maths page's writer, one call a
  // problem, while the learner waits.
  work_through: 'AI_MODEL_WORK_THROUGH',
  highlight_explain: 'AI_MODEL_HIGHLIGHT',
  highlight_simplify: 'AI_MODEL_HIGHLIGHT',
  highlight_define: 'AI_MODEL_HIGHLIGHT',
  chat_document: 'AI_MODEL_CHAT',
  // Re-explaining is the hardest thing asked of the chat model: it must
  // change approach rather than vocabulary. Routable on its own so a
  // deployment can spend a better model here without paying for it on
  // every ordinary turn.
  chat_clarify: 'AI_MODEL_CHAT_CLARIFY',
  session_recap: 'AI_MODEL_CHAT',
  learn_interview: 'AI_MODEL_LEARN',
  learn_outline: 'AI_MODEL_LEARN',
  learn_write: 'AI_MODEL_LEARN',
  visualize_query: 'AI_MODEL_VISUALIZE_QUERY',
  diagram: 'AI_MODEL_DIAGRAM',
  // Writing bankable items is the most quality-sensitive generation in the
  // app: a bad item is scheduled and reseen for months. Verification is
  // routed separately so it can run on a different (ideally stronger)
  // model than the writer — two passes from one model agree too easily.
  item_write: 'AI_MODEL_ITEM_WRITE',
  item_verify: 'AI_MODEL_ITEM_VERIFY',
  // Drawing quality is the weak point of small models; sketches get their
  // own knob so a deployment can route them to a stronger model without
  // paying for it on diagrams.
  sketch: 'AI_MODEL_SKETCH',
  // A page as an animated explainer. The writer is one call a page and
  // plans everything; the artist draws each picture and is DeepSeek by
  // design.
  scene_write: 'AI_MODEL_SCENE_WRITE',
  scene_draw: 'AI_MODEL_SCENE_DRAW',
  // A show's characters and own things, and its places: each drawn once a
  // show and kept, so a stronger artist than the explainer's is worth it.
  cast_draw: 'AI_MODEL_CAST_DRAW',
  set_paint: 'AI_MODEL_SET_PAINT',
  scene_profile: 'AI_MODEL_SCENE_PROFILE',
  scene_notes: 'AI_MODEL_SCENE_NOTES',
  scene_story: 'AI_MODEL_SCENE_STORY',
  // The Studio: the producer is a quick call a turn; the writers plan a
  // show, an episode and each scene, and are worth a careful model.
  studio_chat: 'AI_MODEL_STUDIO_CHAT',
  studio_write: 'AI_MODEL_STUDIO_WRITE',
  // Whether a scene made again as asked shows it: a small read, a make.
  studio_check: 'AI_MODEL_STUDIO_CHECK',
  // "Now you explain it": a viewer's words against an explainer's points.
  studio_teach_back: 'AI_MODEL_STUDIO_TEACH_BACK',
  topic_quiz: 'AI_MODEL_QUIZ',
  // Guided reading: the preview is one call per chapter ever (cached), the
  // graders run once per checkpoint — all three default to the cheap model
  // but stay routable on their own.
  preview: 'AI_MODEL_PREVIEW',
  recall_grade: 'AI_MODEL_RECALL_GRADE',
  question_check: 'AI_MODEL_QUESTION_CHECK',
  embed: 'AI_EMBED_MODEL',
};

/**
 * Tasks whose default is not the global one. The artist in particular:
 * with no setting of its own it once fell to AI_MODEL_DEFAULT, and every
 * "DeepSeek" drawing was drawn by gpt-4o-mini (2161504).
 */
const TASK_DEFAULT: Partial<Record<LlmTask, string>> = {
  // The maths note and the tutor's working: gpt-4o-mini by Richard's
  // choice (2026-09-25), for cost; gpt-4.1 again with AI_MODEL_SIMPLIFY_MATHS
  // and AI_MODEL_WORK_THROUGH.
  simplify_maths: 'openai:gpt-4o-mini',
  work_through: 'openai:gpt-4o-mini',
  // The video writer on DeepSeek, Richard's choice (2026-09-25): gpt-4.1
  // spent the credit too fast, and on gpt-4o-mini a page kept one drawing
  // for a minute and a half, sent back or not. deepseek-flash costs about
  // what gpt-4o-mini does and keeps the picture moving (still for ten
  // seconds at most on the page tried). Thinking: SCENE_WRITE_THINKING.
  scene_write: 'deepseek:deepseek-flash',
  scene_draw: 'deepseek:deepseek-flash',
  // A show's characters, own things and places on DeepSeek, Richard's
  // choice (2026-09-27): Google for the voice only. The drawing bench's
  // bake-off scored Gemini 3.8 Flash higher (median 6.67 against DeepSeek
  // Flash's 4.33, one blind draw each, at 1.2 cents against 0.26): set
  // AI_MODEL_CAST_DRAW and AI_MODEL_SET_PAINT to google:gemini-3.8-flash
  // to draw on it. The see-and-fix loop and three takes apply either way.
  cast_draw: 'deepseek:deepseek-flash',
  set_paint: 'deepseek:deepseek-flash',
  // What a document is: one small call a document.
  scene_profile: 'openai:gpt-4.1-mini',
  // A chapter's teacher's notes: one careful read a chapter, before any
  // of its videos, on DeepSeek for its price. Thinking: SCENE_NOTES_THINKING.
  scene_notes: 'deepseek:deepseek-flash',
  // A story's characters, places and pages: one small call a stretch of
  // it, once a book. gpt-4.1 says more reliably where each person is when
  // some are apart (the small model put the boy who stayed with Sally in
  // the cave with her two readings in three), at about five times the
  // cost: the small model by choice, 4.1 by setting AI_MODEL_SCENE_STORY.
  scene_story: 'openai:gpt-4.1-mini',
  // The Studio on DeepSeek, as the video writer is: never gpt-4.1 for the
  // writer (Richard, 2026-09-25). Thinking: STUDIO_WRITE_THINKING.
  studio_chat: 'deepseek:deepseek-flash',
  studio_write: 'deepseek:deepseek-flash',
  // The check of a scene made again as asked: a few thousand tokens in, a
  // verdict out, thinking off (STUDIO_CHECK_THINKING).
  studio_check: 'deepseek:deepseek-flash',
  // "Now you explain it" at an explainer's end: a few hundred tokens each
  // way, thinking off, about a tenth of a cent a use (never gpt-4.1).
  studio_teach_back: 'deepseek:deepseek-flash',
  // A drawing judged from its picture: DeepSeek cannot see. Gemini 3.8
  // Flash, Richard's choice (2026-09-27; never gpt-4.1): it named every
  // flaw he found in Clover, Dot and Eggbert (a blanket drawn as a scarf, a
  // beak beside the face, a face on the belly), at about 0.4 cents a look.
  drawing_judge: 'google:gemini-3.8-flash',
};

/**
 * Tasks a deployment may go without. With no key for its provider the
 * process still starts: a drawing is then checked by code alone, not
 * judged from its picture.
 */
const OPTIONAL_TASKS = new Set<LlmTask>(['drawing_judge']);

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
    return parseModelRef(
      this.config.get<string>(TASK_VAR[task]) || TASK_DEFAULT[task] || fallback,
    );
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
      const { provider } = this.refFor(task);
      if (OPTIONAL_TASKS.has(task) && !this.keyOf(provider)) {
        this.logger.warn(
          `${task}: no ${API_KEY_VAR[provider]}, so it is skipped: drawings are checked by code alone`,
        );
        continue;
      }
      required.add(provider);
    }

    const missing = [...required].filter((provider) => !this.keyOf(provider));
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

  /** A provider's key, under its own name or the other it may be set under. */
  private keyOf(name: ProviderName): string | undefined {
    const also = ALSO_KEY_VAR[name];
    return (
      this.config.get<string>(API_KEY_VAR[name])?.trim() ||
      (also ? this.config.get<string>(also)?.trim() : undefined) ||
      undefined
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

    const apiKey = this.keyOf(name);
    if (!apiKey) throw new Error(`${API_KEY_VAR[name]} is not set`);

    const baseURL =
      this.config.get<string>(`${name.toUpperCase()}_BASE_URL`) || undefined;
    const created = await this.create(name, apiKey, baseURL);

    this.clients.set(name, created);
    return created;
  }

  private async create(name: ProviderName, apiKey: string, baseURL?: string) {
    // Each try the SDK makes, and each it gives up on, told to whoever
    // follows the work (a Studio job's page): AI_MAX_RETRIES as the adapter reads it.
    const tries =
      Number(this.config.get<string>('AI_MAX_RETRIES', '2') ?? 2) + 1;
    // Google's text model only judges pictures here; the rest write (and draw).
    const fetch = noticingFetch(name === 'google' ? 'judge' : 'writer', tries);
    switch (name) {
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({ apiKey, baseURL, fetch });
      }
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({ apiKey, baseURL, fetch });
      }
      case 'google': {
        const { createGoogle } = await import('@ai-sdk/google');
        return createGoogle({ apiKey, baseURL, fetch });
      }
      case 'deepseek': {
        const { createDeepSeek } = await import('@ai-sdk/deepseek');
        return createDeepSeek({ apiKey, baseURL, fetch });
      }
    }
  }
}
