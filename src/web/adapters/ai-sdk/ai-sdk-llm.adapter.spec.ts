import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { ConfigService } from '@nestjs/config';
import { AiSdkLlmAdapter } from './ai-sdk-llm.adapter';
import { parseModelRef } from './models';

/**
 * Drives the adapter over real HTTP against a stand-in OpenAI-compatible
 * server, so the request/response mapping, structured output, streaming and
 * usage accounting are all exercised without spending anything.
 */

/** The slice of an OpenAI request this stand-in cares about. */
interface ProviderRequest {
  model: string;
  stream?: boolean;
  input?: string[];
  messages?: { role: string; content: string }[];
  response_format?: { type: string; json_schema?: { name?: string } };
}

interface Recorded {
  path: string;
  body: ProviderRequest;
  auth: string | undefined;
}

function mockProvider(): Promise<{
  url: string;
  calls: Recorded[];
  reply: (body: unknown) => void;
  server: Server;
}> {
  const calls: Recorded[] = [];
  let nextContent = '';

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = (raw ? JSON.parse(raw) : {}) as ProviderRequest;
      calls.push({
        path: req.url ?? '',
        body,
        auth: req.headers.authorization,
      });

      if (req.url?.includes('/embeddings')) {
        const values = body.input ?? [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            model: body.model,
            data: values.map((_, index) => ({
              object: 'embedding',
              index,
              embedding: [0.1, 0.2, 0.3],
            })),
            usage: { prompt_tokens: 7, total_tokens: 7 },
          }),
        );
        return;
      }

      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        for (const piece of [
          'Vaso',
          'pressin ',
          'raises ',
          'water ',
          'reabsorption.',
        ]) {
          res.write(
            `data: ${JSON.stringify({
              id: 'x',
              object: 'chat.completion.chunk',
              model: body.model,
              choices: [
                { index: 0, delta: { content: piece }, finish_reason: null },
              ],
            })}\n\n`,
          );
        }
        res.write(
          `data: ${JSON.stringify({
            id: 'x',
            object: 'chat.completion.chunk',
            model: body.model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 5,
              total_tokens: 16,
            },
          })}\n\n`,
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          model: body.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: nextContent },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 42, completion_tokens: 13, total_tokens: 55 },
        }),
      );
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        reply: (value: unknown) => {
          nextContent =
            typeof value === 'string' ? value : JSON.stringify(value);
        },
        server,
      });
    });
  });
}

describe('parseModelRef', () => {
  it('splits provider from model id', () => {
    expect(parseModelRef('openai:gpt-4o-mini')).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o-mini',
    });
  });

  it('keeps colons inside the model id', () => {
    expect(parseModelRef('openai:ft:gpt-4o-mini:acme:1')).toEqual({
      provider: 'openai',
      modelId: 'ft:gpt-4o-mini:acme:1',
    });
  });

  it('rejects a spec with no provider', () => {
    expect(() => parseModelRef('gpt-4o-mini')).toThrow(/missing its provider/);
  });

  it('rejects an unknown provider', () => {
    expect(() => parseModelRef('cohere:command')).toThrow(
      /Unknown model provider/,
    );
  });
});

describe('AiSdkLlmAdapter', () => {
  let mock: Awaited<ReturnType<typeof mockProvider>>;
  let adapter: AiSdkLlmAdapter;

  const configure = (overrides: Record<string, string> = {}) => {
    const env: Record<string, string> = {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: mock.url,
      OPENAI_API_MODE: 'chat',
      AI_MODEL_DEFAULT: 'openai:gpt-4o-mini',
      AI_EMBED_MODEL: 'openai:text-embedding-3-small',
      AI_MAX_RETRIES: '0',
      ...overrides,
    };
    return new AiSdkLlmAdapter({
      get: (key: string, fallback?: string) => env[key] ?? fallback,
      getOrThrow: (key: string) => env[key],
    } as unknown as ConfigService);
  };

  beforeAll(async () => {
    mock = await mockProvider();
  });

  afterAll(() => {
    mock.server.close();
  });

  beforeEach(() => {
    mock.calls.length = 0;
    adapter = configure();
  });

  it('summarises and reports token usage', async () => {
    mock.reply(
      'A physiology lecture on the posterior pituitary and thyroid gland.',
    );

    const result = await adapter.summarize({
      title: 'Pituitary',
      text: 'Long text',
    });

    expect(result.value).toContain('posterior pituitary');
    expect(result.usage).toMatchObject({
      model: 'openai:gpt-4o-mini',
      tokensIn: 42,
      tokensOut: 13,
    });
    expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mock.calls[0].auth).toBe('Bearer test-key');
  });

  it('returns schema-validated blocks when simplifying a page', async () => {
    mock.reply({
      blocks: [
        { type: 'headingOne', text: 'The thyroid gland' },
        { type: 'bullet', text: 'It sits in the neck.' },
      ],
    });

    const result = await adapter.simplifyPage({
      task: 'simplify_standard',
      pageText: 'The thyroid gland is a butterfly-shaped organ.',
      summary: 'A physiology lecture.',
      pageNumber: 4,
    });

    expect(result.value).toEqual([
      { type: 'headingOne', text: 'The thyroid gland' },
      { type: 'bullet', text: 'It sits in the neck.' },
    ]);
    // The page's own text and the document summary both reach the model.
    const prompt = JSON.stringify(mock.calls[0].body.messages);
    expect(prompt).toContain('butterfly-shaped');
    expect(prompt).toContain('A physiology lecture.');
  });

  it('rejects blocks with an invented type rather than passing them through', async () => {
    mock.reply({
      blocks: [{ type: 'quote', text: 'Not a block type we render' }],
    });

    await expect(
      adapter.simplifyPage({
        task: 'simplify_standard',
        pageText: 'Some text',
        summary: null,
        pageNumber: 1,
      }),
    ).rejects.toBeDefined();
  });

  it('parses topic outlines', async () => {
    mock.reply({
      topics: [
        {
          title: 'Posterior pituitary',
          shortDescription: null,
          startPage: 1,
          endPage: 12,
        },
        {
          title: 'Thyroid gland',
          shortDescription: 'Hormones',
          startPage: 13,
          endPage: 50,
        },
      ],
    });

    const result = await adapter.outlineTopics({
      digest: '[p.1] ...',
      pageCount: 50,
    });

    expect(result.value).toHaveLength(2);
    expect(result.value[1]).toMatchObject({
      title: 'Thyroid gland',
      startPage: 13,
    });
  });

  it('streams the highlight answer token by token', async () => {
    const tokens: string[] = [];
    const result = await adapter.answerHighlight({
      task: 'highlight_explain',
      selection: 'ADH',
      context: '[p.6] Antidiuretic hormone',
      summary: null,
      onToken: (chunk) => tokens.push(chunk),
    });

    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens.join('')).toBe('Vasopressin raises water reabsorption.');
    expect(result.value).toBe('Vasopressin raises water reabsorption.');
    expect(mock.calls[0].body.stream).toBe(true);
  });

  it('does not stream when no token handler is given', async () => {
    mock.reply('Antidiuretic hormone.');

    const result = await adapter.answerHighlight({
      task: 'highlight_define',
      selection: 'ADH',
      context: '',
      summary: null,
    });

    expect(result.value).toBe('Antidiuretic hormone.');
    expect(mock.calls[0].body.stream).toBeFalsy();
  });

  it('strips quotes from a rewritten image query', async () => {
    mock.reply('"thyroid hormone synthesis diagram"');

    const result = await adapter.rewriteImageQuery({
      selection: 'thyroid hormone synthesis',
      summary: 'A physiology lecture.',
    });

    expect(result.value).toBe('thyroid hormone synthesis diagram');
  });

  it('embeds in one batched call', async () => {
    const result = await adapter.embed({ texts: ['one', 'two', 'three'] });

    expect(result.value).toHaveLength(3);
    expect(result.value[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result.usage.model).toBe('openai:text-embedding-3-small');
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].path).toContain('/embeddings');
  });

  it("tells the lecture writer the chapter has already opened, in the planner's words", async () => {
    mock.reply({ script: 'Because they guess, and they are usually right.' });

    const result = await adapter.lectureSegment({
      topicTitle: 'Caches',
      hook: 'Why do caches lie?',
      arc: 'From a guess to a bet',
      beat: {
        goal: 'Teach eviction',
        callback: null,
        foreshadow: null,
        newHere: 'Eviction is a bet about the future',
        skip: 'What a cache is',
        weight: 'light',
      },
      pageText: 'Caches evict.',
      prevTail: '',
      isFirstOfTopic: true,
      isLastOfTopic: false,
      bridge: false,
      payoff: 'You can size a cache.',
      opening: 'Why do caches lie?',
      taughtSoFar: ['What a cache is'],
      comingLater: ['Write-through versus write-back'],
      list: { items: 5 },
    });

    expect(result.value).toContain('usually right');
    const prompt = JSON.stringify(mock.calls[0].body.messages);
    expect(prompt).toContain('has just opened with these exact words');
    expect(prompt).toContain('Why do caches lie?');
    expect(prompt).not.toContain('Deliver this hook');
    expect(prompt).toContain('New on this page');
    expect(prompt).toContain('LIGHT page');
    expect(prompt).toContain('Already taught in this lecture');
    expect(prompt).toContain('Still to come in this chapter');
    expect(prompt).toContain('list of 5 items');
  });

  it('shows the planner the example of its opening shape, what was taught, and why its last plan failed', async () => {
    mock.reply({
      hook: 'A cache is not a faster database.',
      arc: 'From a guess to a bet',
      payoff: 'You can size a cache.',
      beats: [
        {
          pageNumber: 1,
          goal: 'g',
          callback: null,
          foreshadow: null,
          newHere: 'n',
          skip: null,
          weight: 'full',
        },
      ],
    });

    const result = await adapter.lectureOutline({
      title: 'Systems',
      topicTitle: 'Caches',
      pages: [{ pageNumber: 1, text: 'Caches evict.' }],
      priorTopics: ['Queues (already lectured)'],
      priorOpenings: ['What happens to a request after send?'],
      suggestedShape: {
        name: 'a definition turned over',
        direction: 'State the definition, then what it means.',
        example: 'A lock is not a wall. It is a promise.',
      },
      taughtEarlier: ['You can drain a queue.'],
      correction: 'The hook opens with "Imagine", which is a banned opener',
    });

    expect(result.value.beats[0].weight).toBe('full');
    const prompt = JSON.stringify(mock.calls[0].body.messages);
    expect(prompt).toContain('A lock is not a wall.');
    expect(prompt).toContain('Match the move, not the words');
    expect(prompt).toContain('You can drain a queue.');
    expect(prompt).toContain('Your previous plan was rejected');
    expect(prompt).toContain('banned opener');
    expect(prompt).toContain('What happens to a request after send?');
  });

  it('routes a task to its own model when one is configured', async () => {
    adapter = configure({ AI_MODEL_SIMPLIFY_EASIEST: 'openai:gpt-4o' });
    mock.reply({ blocks: [{ type: 'paragraph', text: 'Short and simple.' }] });

    const result = await adapter.simplifyPage({
      task: 'simplify_easiest',
      pageText: 'Dense prose',
      summary: null,
      pageNumber: 1,
    });

    expect(mock.calls[0].body.model).toBe('gpt-4o');
    expect(result.usage.model).toBe('openai:gpt-4o');
  });

  it('falls back to the default model for tasks with no override', async () => {
    adapter = configure({ AI_MODEL_SIMPLIFY_EASIEST: 'openai:gpt-4o' });
    mock.reply('A summary.');

    await adapter.summarize({ title: 'T', text: 'Text' });

    expect(mock.calls[0].body.model).toBe('gpt-4o-mini');
  });

  it('refuses to boot when a configured provider has no key', () => {
    const adapterWithoutKey = new AiSdkLlmAdapter({
      get: (key: string, fallback?: string) =>
        ({ AI_MODEL_DEFAULT: 'anthropic:claude-sonnet-4-5' })[key] ?? fallback,
    } as unknown as ConfigService);

    expect(() => adapterWithoutKey.onModuleInit()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
