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
  /** What the next streamed answers say (null: the lecture's line). */
  replyStreamed: (body: unknown) => void;
  /** Models the stand-in refuses, as a provider out of credit does. */
  refused: Set<string>;
  server: Server;
}> {
  const calls: Recorded[] = [];
  const refused = new Set<string>();
  let nextContent = '';
  /** What a streamed answer says, when a test gives one; else the lecture's line. */
  let nextStream: string | null = null;

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

      if (refused.has(body.model)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              message: 'Your prepayment credits are depleted.',
              type: 'insufficient_quota',
            },
          }),
        );
        return;
      }

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
        // A streamed answer in its pieces: the test's own, cut in three.
        const own = nextStream;
        const pieces = own
          ? [0, 1, 2].map((k) =>
              own.slice(
                Math.floor((own.length * k) / 3),
                Math.floor((own.length * (k + 1)) / 3),
              ),
            )
          : ['Vaso', 'pressin ', 'raises ', 'water ', 'reabsorption.'];
        for (const piece of pieces) {
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
        replyStreamed: (value: unknown) => {
          nextStream =
            value === null
              ? null
              : typeof value === 'string'
                ? value
                : JSON.stringify(value);
        },
        refused,
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
    expect(parseModelRef('deepseek:deepseek-chat')).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-chat',
    });
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
    mock.refused.clear();
    adapter = configure();
  });

  it("streams the editor's written steps, so a long one never waits past the client's timeout for its first byte", async () => {
    mock.replyStreamed({ notes: ['Row 3 lectures: say what Bello did.'] });
    try {
      const result = await configure({
        AI_MODEL_EXPLAINER_EDIT: 'openai:gpt-4o-mini',
      }).editorWrite({ step: 'read', parts: ['The script: …'] });
      expect(result.value).toEqual({
        notes: ['Row 3 lectures: say what Bello did.'],
      });
      expect(mock.calls[0].body.stream).toBe(true);
      expect(result.usage).toMatchObject({ tokensIn: 11, tokensOut: 5 });
    } finally {
      mock.replyStreamed(null);
    }
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
    mock.reply({
      sections: [
        {
          move: 0,
          text: 'Because they guess, and they are usually right.',
          catch: null,
          teaches: [],
        },
        {
          move: 1,
          text: 'Eviction is the guess made visible.',
          catch: null,
          teaches: [],
        },
      ],
    });

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
        moves: ['why caches guess', 'what eviction is'],
        pitfall: null,
        turn: false,
        ask: null,
      },
      problem: null,
      previousPayoff: null,
      pageIndex: 0,
      pageCount: 3,
      style: 'brisk',
      styleDirection: 'Say the idea, then stop.',
      budget: { min: 40, max: 80 },
      pageText: 'Caches evict.',
      noteAddressed: null,
      prevTail: '',
      isFirstOfTopic: true,
      isLastOfTopic: false,
      bridge: false,
      payoff: 'You can size a cache.',
      opening: 'Why do caches lie?',
      taughtSoFar: ['What a cache is'],
      comingLater: ['Write-through versus write-back'],
      list: { items: 5 },
      board: {
        heading: 'Eviction',
        lines: [
          {
            number: 1,
            move: 0,
            kind: 'term',
            text: 'eviction',
            meaning: 'a guess thrown away',
          },
        ],
      },
    });

    expect(result.value.sections[0].text).toContain('usually right');
    expect(result.value.sections).toHaveLength(2);
    const prompt = JSON.stringify(mock.calls[0].body.messages);
    expect(prompt).toContain('has just opened with these exact words');
    expect(prompt).toContain('Why do caches lie?');
    expect(prompt).not.toContain('Deliver this hook');
    expect(prompt).toContain('New on this page');
    expect(prompt).toContain('light page');
    expect(prompt).toContain('HOW TO TEACH IT (the brisk style): Say the idea');
    expect(prompt).toContain('Length: 40 to 80 words');
    expect(prompt).toContain('0: why caches guess');
    expect(prompt).toContain('1: what eviction is');
    // The planned board goes to the writer numbered, with its move.
    expect(prompt).toContain('1. (move 0) eviction: a guess thrown away');
    expect(prompt).not.toContain('TERM eviction');
    expect(prompt).toContain(
      'as the first words of the sentence that explains it',
    );
    expect(prompt).toContain('Already taught in this lecture');
    expect(prompt).toContain('Still to come in this chapter');
    expect(prompt).toContain('list of 5 items');
  });

  it('shows the planner the example of its opening shape, what was taught, and why its last plan failed', async () => {
    mock.reply({
      hook: 'A cache is not a faster database.',
      arc: 'From a guess to a bet',
      thread: 'A request that misses the cache.',
      payoff: 'You can size a cache.',
      terms: [{ term: 'Eviction', meaning: 'throwing a guess away' }],
      problem: 'Why do caches lie?',
      points: ['You can size a cache.'],
      beats: [
        {
          pageNumber: 1,
          goal: 'g',
          callback: null,
          foreshadow: null,
          newHere: 'n',
          skip: null,
          weight: 'full',
          moves: ['the guess', 'the bet'],
          moveBlocks: null,
          skipBlocks: null,
          pitfall: null,
          turn: true,
          handoff: null,
          point: 0,
          ask: null,
          figure: { kind: 'none', shows: null },
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
      course: null,
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
    adapter = configure({ AI_MODEL_SIMPLIFY_STANDARD: 'openai:gpt-4o' });
    mock.reply({ blocks: [{ type: 'paragraph', text: 'Short and simple.' }] });

    const result = await adapter.simplifyPage({
      pageText: 'Dense prose',
      summary: null,
      pageNumber: 1,
    });

    expect(mock.calls[0].body.model).toBe('gpt-4o');
    expect(result.usage.model).toBe('openai:gpt-4o');
  });

  it('falls back to the default model for tasks with no override', async () => {
    adapter = configure({ AI_MODEL_SIMPLIFY_STANDARD: 'openai:gpt-4o' });
    mock.reply('A summary.');

    await adapter.summarize({ title: 'T', text: 'Text' });

    expect(mock.calls[0].body.model).toBe('gpt-4o-mini');
  });

  it('draws a show’s character with its own artist in the house style, a place with the painter, and a lesson’s picture as before', async () => {
    adapter = configure({
      AI_MODEL_CAST_DRAW: 'openai:gpt-4.1',
      AI_MODEL_SET_PAINT: 'openai:gpt-4.1-mini',
      AI_MODEL_SCENE_DRAW: 'openai:gpt-4o',
    });
    mock.reply(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"/>',
    );
    const thing = {
      name: 'Clover',
      brief: 'Clover, a brown horse',
      motion: 'none',
      parts: [{ name: 'head', label: false }],
      states: [{ name: 'neutral', look: 'calm' }],
      shape: 'square' as const,
    };
    await adapter.sceneDrawing({
      thing,
      viewBox: { w: 800, h: 800 },
      topic: 'Farm Friends',
      neighbours: [],
      purpose: 'cast',
      asked: { line: 16, eyes: 92, least: 64 },
      hint: 'side view, facing right',
      temperature: 0.8,
      notes: ['Draw her side-on'],
      previous: '<svg>her before</svg>',
    });
    await adapter.sceneDrawing({
      thing: { ...thing, name: 'the stable', states: [], shape: 'wide' },
      viewBox: { w: 1600, h: 900 },
      topic: 'Farm Friends',
      neighbours: [],
      backdrop: true,
      asked: { line: 6.1 },
    });
    await adapter.sceneDrawing({
      thing: { ...thing, name: 'a kidney', states: [] },
      viewBox: { w: 800, h: 800 },
      topic: 'The kidney',
      neighbours: [],
    });
    const [cast, set, lesson] = mock.calls.map(
      (call) => call.body as unknown as Record<string, unknown>,
    );
    const said = (body: Record<string, unknown>) => JSON.stringify(body);
    expect(cast.model).toBe('gpt-4.1');
    expect(cast.temperature).toBe(0.8);
    expect(said(cast)).toContain(
      'the character artist for an animated picture-book show',
    );
    expect(said(cast)).toContain('stroke-width=\\"16\\"');
    expect(said(cast)).toContain('Each eye at least 92 units across.');
    expect(said(cast)).toContain('Framing: side view, facing right.');
    expect(said(cast)).toContain('What to change:\\n- Draw her side-on');
    expect(said(cast)).toContain('<svg>her before</svg>');
    expect(said(cast)).toContain('Context: the show \\"Farm Friends\\".');
    expect(said(cast)).not.toContain('Labels at font-size');
    expect(set.model).toBe('gpt-4.1-mini');
    expect(said(set)).toContain('the set painter for an animated story');
    expect(said(set)).toContain('stroke-width=\\"6.1\\"');
    expect(lesson.model).toBe('gpt-4o');
    expect(said(lesson)).toContain(
      'the illustrator for an animated explainer video',
    );
    expect(lesson.temperature).toBeUndefined();
  });

  it('draws with the explainer’s artist when a show’s artist is refused for want of credit, and only then', async () => {
    adapter = configure({
      AI_MODEL_CAST_DRAW: 'openai:gpt-4.1',
      AI_MODEL_SCENE_DRAW: 'openai:gpt-4o',
    });
    mock.refused.add('gpt-4.1');
    mock.reply(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"/>',
    );
    const thing = {
      name: 'Clover',
      brief: 'Clover, a brown horse',
      motion: 'none',
      parts: [],
      states: [],
      shape: 'square' as const,
    };
    const drawn = await adapter.sceneDrawing({
      thing,
      viewBox: { w: 800, h: 800 },
      topic: 'Farm Friends',
      neighbours: [],
      purpose: 'cast',
    });
    expect(mock.calls.map((call) => call.body.model)).toEqual([
      'gpt-4.1',
      'gpt-4o',
    ]);
    // Priced as what drew it.
    expect(drawn.usage.model).toBe('openai:gpt-4o');
    // An explainer's own artist refused has no one to stand in.
    mock.calls.length = 0;
    mock.refused.add('gpt-4o');
    await expect(
      adapter.sceneDrawing({
        thing,
        viewBox: { w: 800, h: 800 },
        topic: 'The kidney',
        neighbours: [],
      }),
    ).rejects.toThrow(/credits/);
    expect(mock.calls).toHaveLength(1);
  });

  it('judges a drawing from its picture, the one before beside it, and keeps its numbers to the scale', async () => {
    adapter = configure({ AI_MODEL_DRAWING_JUDGE: 'openai:gpt-4.1-mini' });
    mock.reply({
      sees: 'a horse with a scarf',
      recognisable: 12,
      anatomy: 4,
      face: 7,
      change: 3,
      same: 9,
      place: null,
      problems: ['Put the blanket across her back'],
    });
    const judged = await adapter.drawingJudge({
      png: Buffer.from('after'),
      kind: 'animal',
      brief: 'Clover: a brown horse',
      old: { png: Buffer.from('before'), words: 'a red saddle blanket' },
    });
    expect(judged.value.recognisable).toBe(10);
    expect(judged.value.change).toBe(3);
    expect(judged.value.problems).toEqual(['Put the blanket across her back']);
    expect(judged.usage.model).toBe('openai:gpt-4.1-mini');
    const body = JSON.stringify(mock.calls[0].body);
    expect(body).toContain(
      `data:image/png;base64,${Buffer.from('before').toString('base64')}`,
    );
    expect(body).toContain(
      `data:image/png;base64,${Buffer.from('after').toString('base64')}`,
    );
    expect(body).toContain('The maker asked for this change');
    expect(body).toContain('art director of an animated picture-book show');
  });

  it('refuses to boot when a configured provider has no key', () => {
    const adapterWithoutKey = new AiSdkLlmAdapter({
      get: (key: string, fallback?: string) =>
        ({ AI_MODEL_DEFAULT: 'anthropic:claude-sonnet-4-5' })[key] ?? fallback,
    } as unknown as ConfigService);

    expect(() => adapterWithoutKey.onModuleInit()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('takes Google’s key under the name the Gemini voice uses', () => {
    const env: Record<string, string> = {
      AI_MODEL_DEFAULT: 'google:gemini-3.8-flash',
      GEMINI_API_KEY: 'a-key',
      OPENAI_API_KEY: 'x',
      DEEPSEEK_API_KEY: 'x',
    };
    const adapterWithGemini = new AiSdkLlmAdapter({
      get: (key: string, fallback?: string) => env[key] ?? fallback,
    } as unknown as ConfigService);
    expect(() => adapterWithGemini.onModuleInit()).not.toThrow();
  });

  it('writes the segments around a chapter from the plan alone, pitched to the learner', async () => {
    mock.reply({ script: 'That is caches. A check of what stuck.' });

    const result = await adapter.lectureExtra({
      kind: 'check',
      topicTitle: 'Caches',
      style: 'gentle',
      styleDirection: 'Small steps.',
      terms: [],
      taught: ['A cache is a guess', 'Eviction is the guess made visible'],
      payoff: 'You can size a cache.',
      daysAway: null,
      budget: { min: 60, max: 170 },
    });

    expect(result.value.script).toContain('check');
    const prompt = JSON.stringify(mock.calls[0].body.messages);
    expect(prompt).toContain('CHECK segment');
    expect(prompt).toContain('slow learner');
    expect(prompt).toContain('Eviction is the guess made visible');
    expect(prompt).toContain('What the listener can now do');
    expect(prompt).toContain('60 to 170 words');
    expect(prompt).not.toContain('last listened');
  });

  it('writes a mixed check when asked for spoken kinds and choices, and shapes each for the sheet', async () => {
    mock.reply({
      questions: [
        {
          kind: 'flashcard',
          question: 'Why does a plain hash move most keys when a server goes?',
          answer: 'Because every key is placed by modulo of the server count.',
          explanation: 'The modulo changes with the count.',
        },
        {
          kind: 'true_false',
          question: 'True or false: virtual nodes make the ring less even.',
          answer: 'False',
          explanation: 'They make it more even.',
        },
        {
          kind: 'mcq',
          question: 'Which of these is a virtual node?',
          answer: 'A server placed at many points on the ring',
          options: [
            'A spare server kept off',
            'A server placed at many points on the ring',
            'A key with no server',
          ],
          explanation: 'Each server takes many spots.',
        },
      ],
    });
    const result = await adapter.generateTopicQuiz({
      topicTitle: 'Consistent hashing',
      pagesText: 'The ring.',
      summary: null,
      kinds: ['flashcard', 'true_false', 'mcq'],
    });
    const [spoken, tf, mcq] = result.value.questions;
    expect(spoken.options).toEqual([
      'Because every key is placed by modulo of the server count.',
    ]);
    expect(tf.options).toEqual(['True', 'False']);
    expect(tf.correctIndex).toBe(1);
    expect(mcq.kind).toBe('mcq');
    expect(mcq.options).toHaveLength(3);
    expect(mcq.correctIndex).toBe(1);
    const prompt = JSON.stringify(mock.calls[0].body.messages);
    expect(prompt).toContain('Kinds allowed: flashcard, true_false, mcq');
  });

  it('tells the review how long the learner has been away, and the words their meanings', async () => {
    mock.reply({ script: 'It has been a while.' });
    await adapter.lectureExtra({
      kind: 'review',
      topicTitle: 'Caches',
      style: 'steady',
      styleDirection: 'Steady.',
      terms: [],
      taught: ['A cache is a guess'],
      payoff: null,
      daysAway: 3,
      budget: { min: 50, max: 160 },
    });
    expect(JSON.stringify(mock.calls[0].body.messages)).toContain(
      'last listened 3 days ago',
    );

    mock.reply({ script: 'Words you will hear.' });
    await adapter.lectureExtra({
      kind: 'terms',
      topicTitle: 'Caches',
      style: 'gentle',
      styleDirection: 'Small steps.',
      terms: [{ term: 'Eviction', meaning: 'throwing a guess away' }],
      taught: [],
      payoff: 'You can size a cache.',
      daysAway: null,
      budget: { min: 40, max: 130 },
    });
    const prompt = JSON.stringify(mock.calls[1].body.messages);
    expect(prompt).toContain('TERMS segment');
    expect(prompt).toContain('Eviction: throwing a guess away');
    expect(prompt).not.toContain('What the listener can now do');
    // The opening is a teacher easing in, never an announcement of a list.
    expect(prompt).toContain('eases a class in');
    expect(prompt).toContain('a few ideas this chapter leans on');
    expect(prompt).toContain('never say \\"the following\\"');
  });

  it('tells the writer about the pitfall, the turn, the problem and where the page sits', async () => {
    mock.reply({
      sections: [
        {
          move: 0,
          text: 'Why do caches lie? Because they guess.',
          catch: null,
          teaches: [],
        },
      ],
    });

    await adapter.lectureSegment({
      topicTitle: 'Caches',
      hook: 'Why do caches lie?',
      arc: 'From a guess to a bet',
      beat: {
        goal: 'Teach eviction',
        callback: null,
        foreshadow: null,
        newHere: 'Eviction is a bet',
        skip: null,
        weight: 'full',
        moves: ['the guess'],
        pitfall: 'Thinking eviction means the data was wrong',
        turn: true,
        ask: null,
      },
      problem: 'How can a cache be fast and still right?',
      previousPayoff: null,
      pageIndex: 0,
      pageCount: 4,
      style: 'brisk',
      styleDirection: 'Say the idea, then stop.',
      budget: { min: 70, max: 140 },
      pageText: 'Caches evict.',
      noteAddressed: null,
      prevTail: '',
      isFirstOfTopic: true,
      isLastOfTopic: false,
      bridge: false,
      payoff: null,
      opening: null,
      taughtSoFar: [],
      comingLater: [],
      list: null,
      board: null,
    });

    const prompt = JSON.stringify(mock.calls[0].body.messages);
    expect(prompt).toContain('PITFALL');
    expect(prompt).toContain('Thinking eviction means the data was wrong');
    expect(prompt).toContain("chapter's TURN");
    expect(prompt).toContain('[pause]');
    // The quick learner's chapter begins on its first idea: no problem
    // line, no hook, no join to the last chapter.
    expect(prompt).toContain(
      "Begin on the page's first idea in your first sentence",
    );
    expect(prompt).not.toContain('Open on the problem');
    expect(prompt).toContain('page 1 of 4 in the chapter');
    // A brisk page is not told to restate; only a gentle one hears that.
    expect(prompt).not.toContain('restate the idea fully');
  });

  it('tells a gentle writer to restate fully early in the chapter and in a clause late', async () => {
    const base = {
      topicTitle: 'Caches',
      hook: 'h',
      arc: 'a',
      beat: {
        goal: 'g',
        callback: null,
        foreshadow: null,
        newHere: null,
        skip: null,
        weight: 'full' as const,
        moves: ['m'],
        moveBlocks: null,
        skipBlocks: null,
        pitfall: null,
        turn: false,
        ask: null,
      },
      problem: null,
      previousPayoff: null,
      style: 'gentle' as const,
      styleDirection: 'Small steps.',
      budget: { min: 180, max: 300 },
      pageText: 'Caches evict.',
      noteAddressed: null,
      prevTail: 'Earlier words.',
      isFirstOfTopic: false,
      isLastOfTopic: false,
      bridge: false,
      payoff: null,
      opening: null,
      taughtSoFar: [],
      comingLater: [],
      list: null,
      board: null,
    };
    mock.reply({
      sections: [{ move: 0, text: 'Early.', catch: null, teaches: [] }],
    });
    await adapter.lectureSegment({ ...base, pageIndex: 1, pageCount: 6 });
    expect(JSON.stringify(mock.calls[0].body.messages)).toContain(
      'restate the idea fully',
    );
    mock.reply({
      sections: [{ move: 0, text: 'Late.', catch: null, teaches: [] }],
    });
    await adapter.lectureSegment({ ...base, pageIndex: 5, pageCount: 6 });
    expect(JSON.stringify(mock.calls[1].body.messages)).toContain(
      'restate in a clause at most',
    );
  });
});
