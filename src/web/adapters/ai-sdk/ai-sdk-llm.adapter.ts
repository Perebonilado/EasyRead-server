import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LanguageModelUsage } from 'ai';
import type { Block } from '../../../contracts';
import type {
  LlmGatewayPort,
  LlmResult,
  LlmTask,
  LlmUsage,
  TopicDraft,
} from '../../../business/ports/llm.port';
import { PROMPTS } from '../prompts';
import { ModelRegistry, type ModelRef } from './models';
import { blocksSchema, topicsSchema } from './schemas';

/**
 * The model gateway, on the Vercel AI SDK.
 *
 * Two things the SDK buys us that hand-rolled HTTP did not: provider choice is
 * per task rather than per deployment (`AI_MODEL_SIMPLIFY_STANDARD` can be a
 * cheap model while highlights use a stronger one), and structured output is
 * schema-validated by the SDK instead of parsed out of prose here.
 *
 * Every model call in the product goes through this class, so it stays the one
 * place to add rate limiting, retries and the cost ledger (§6.2).
 */
@Injectable()
export class AiSdkLlmAdapter implements LlmGatewayPort, OnModuleInit {
  private readonly logger = new Logger(AiSdkLlmAdapter.name);
  private readonly registry: ModelRegistry;

  constructor(private readonly config: ConfigService) {
    this.registry = new ModelRegistry(config);
  }

  /** Fail at boot on a missing key, not on the first upload. */
  onModuleInit(): void {
    this.registry.assertConfigured();
  }

  async summarize(input: {
    title: string;
    text: string;
  }): Promise<LlmResult<string>> {
    return this.text(
      'summarize',
      PROMPTS.summarize,
      `Title: ${input.title}\n\n${input.text}`,
    );
  }

  async outlineTopics(input: {
    digest: string;
    pageCount: number;
  }): Promise<LlmResult<TopicDraft[]>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel('topics_outline');

    const result = await generateObject({
      model,
      schema: topicsSchema,
      system: PROMPTS.topics(input.pageCount),
      prompt: input.digest,
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.object.topics,
      usage: this.usage(ref, result.usage, started),
    };
  }

  async simplifyPage(input: {
    task: 'simplify_standard' | 'simplify_easiest';
    pageText: string;
    summary: string | null;
    pageNumber: number;
  }): Promise<LlmResult<Block[]>> {
    const started = Date.now();
    const { generateObject } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel(input.task);

    const context = input.summary
      ? `Document summary:\n${input.summary}\n\n`
      : '';

    const result = await generateObject({
      model,
      schema: blocksSchema,
      system:
        input.task === 'simplify_easiest'
          ? PROMPTS.simplifyEasiest
          : PROMPTS.simplifyStandard,
      prompt: `${context}Page ${input.pageNumber}:\n${input.pageText}`,
      maxRetries: this.maxRetries(),
    });

    // The schema guarantees at least one block, but never trust a page to
    // silently become empty — a page that wasn't simplified still beats a
    // blank one in the reader.
    const blocks = result.object.blocks.length
      ? result.object.blocks
      : this.asParagraphs(input.pageText);

    return { value: blocks, usage: this.usage(ref, result.usage, started) };
  }

  async answerHighlight(input: {
    task: 'highlight_explain' | 'highlight_simplify' | 'highlight_define';
    selection: string;
    context: string;
    summary: string | null;
    onToken?: (chunk: string) => void;
  }): Promise<LlmResult<string>> {
    const prompt = [
      input.summary ? `Document summary:\n${input.summary}` : null,
      input.context ? `Passages from the document:\n${input.context}` : null,
      `Selected text:\n${input.selection}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const system = PROMPTS.highlight[input.task];
    if (!input.onToken) return this.text(input.task, system, prompt);

    const started = Date.now();
    const { streamText } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel(input.task);

    const result = streamText({
      model,
      system,
      prompt,
      maxRetries: this.maxRetries(),
    });

    let answer = '';
    for await (const chunk of result.textStream) {
      answer += chunk;
      input.onToken(chunk);
    }

    return {
      value: answer.trim(),
      usage: this.usage(ref, await result.usage, started),
    };
  }

  async rewriteImageQuery(input: {
    selection: string;
    summary: string | null;
  }): Promise<LlmResult<string>> {
    const result = await this.text(
      'visualize_query',
      PROMPTS.imageQuery,
      [
        input.summary ? `Subject area: ${input.summary.slice(0, 500)}` : null,
        input.selection,
      ]
        .filter(Boolean)
        .join('\n\n'),
    );

    return {
      value: result.value.replace(/^["']|["']$/g, '').slice(0, 200),
      usage: result.usage,
    };
  }

  async embed(input: { texts: string[] }): Promise<LlmResult<number[][]>> {
    const started = Date.now();
    const { embedMany } = await this.registry.modules();
    const { model, ref } = await this.registry.embeddingModel();

    const result = await embedMany({
      model,
      values: input.texts,
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.embeddings,
      usage: {
        model: `${ref.provider}:${ref.modelId}`,
        tokensIn: result.usage.tokens,
        tokensOut: 0,
        latencyMs: Date.now() - started,
      },
    };
  }

  private async text(
    task: LlmTask,
    system: string,
    prompt: string,
  ): Promise<LlmResult<string>> {
    const started = Date.now();
    const { generateText } = await this.registry.modules();
    const { model, ref } = await this.registry.languageModel(task);

    const result = await generateText({
      model,
      system,
      prompt,
      maxRetries: this.maxRetries(),
    });

    return {
      value: result.text.trim(),
      usage: this.usage(ref, result.usage, started),
    };
  }

  /** Recorded per call, so cost is answerable per document and per task. */
  private usage(
    ref: ModelRef,
    usage: LanguageModelUsage,
    startedAt: number,
  ): LlmUsage {
    return {
      model: `${ref.provider}:${ref.modelId}`,
      tokensIn: usage.inputTokens ?? 0,
      tokensOut: usage.outputTokens ?? 0,
      latencyMs: Date.now() - startedAt,
    };
  }

  private maxRetries(): number {
    // The queue already retries the whole job with backoff; a couple of
    // in-call retries only cover transient rate limits.
    return Number(this.config.get<string>('AI_MAX_RETRIES', '2'));
  }

  private asParagraphs(text: string): Block[] {
    this.logger.warn(
      'Model returned no blocks; falling back to the original text',
    );
    return text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => ({ type: 'paragraph' as const, text: paragraph }));
  }
}
