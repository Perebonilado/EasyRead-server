import {
  effortOptions,
  filled,
  foundOf,
  lenient,
  misshapen,
  revisedPrompt,
  searchesOf,
  usageOf,
} from './editor-calls';
import {
  editorAnglesSchema,
  editorBeatsSchema,
  editorFactsSchema,
  editorHooksSchema,
  editorPackageSchema,
  editorPlanSchema,
  editorReadSchema,
  editorResearchSchema,
  editorScriptSchema,
  editorWorldSchema,
} from './editor-schemas';
import { fakeEditorAnswer } from '../fake-editor';
import { boardIllustratedPrompt, boardLessonPrompt } from '../editor-prompts';

describe("the editor's calls", () => {
  it("say OpenAI's reasoning effort, DeepSeek's thinking, and nothing else", () => {
    expect(effortOptions('openai', undefined, 'medium')).toEqual({
      providerOptions: { openai: { reasoningEffort: 'medium' } },
    });
    expect(effortOptions('openai', 'high', 'medium')).toEqual({
      providerOptions: { openai: { reasoningEffort: 'high' } },
    });
    expect(effortOptions('openai', 'loud', 'low')).toEqual({
      providerOptions: { openai: { reasoningEffort: 'low' } },
    });
    expect(effortOptions('deepseek', 'low', 'medium')).toEqual({
      providerOptions: { deepseek: { thinking: { type: 'disabled' } } },
    });
    expect(effortOptions('google', 'high', 'medium')).toEqual({});
  });

  it('count the searches made and keep the pages found, each once', () => {
    const result = {
      steps: [
        {
          toolCalls: [{ toolName: 'web_search' }, { toolName: 'web_search' }],
          sources: [
            {
              sourceType: 'url',
              url: 'https://a.example.com/x?utm_source=openai',
              title: 'A',
            },
            {
              sourceType: 'url',
              url: 'https://www.a.example.com/x',
              title: 'A again',
            },
            { sourceType: 'document', url: 'nope', title: 'B' },
          ],
        },
        { toolCalls: [{ toolName: 'web_search' }, { toolName: 'other' }] },
      ],
    };
    expect(searchesOf(result)).toBe(3);
    expect(foundOf(result)).toEqual([
      { url: 'https://a.example.com/x?utm_source=openai', title: 'A' },
    ]);
  });

  it('ask again with the last answer, the change and what to put right', () => {
    const prompt = revisedPrompt(['Part one', '', 'Part two'], {
      previous: { a: 1 },
      request: 'shorter',
      problems: ['Row 1 is long'],
    });
    expect(prompt).toBe(
      [
        'Part one',
        'Part two',
        'Your last answer:\n{"a":1}',
        'The maker asks for this change; make it, and keep the rest as it was:\nshorter',
        'Put these right and answer again in full:\n- Row 1 is long',
      ].join('\n\n'),
    );
  });

  it('add two calls’ usage, and tell a misshapen answer from a failed call', () => {
    const one = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      inputTokenDetails: { cacheReadTokens: 2 },
    } as never;
    expect(usageOf(one, one)).toMatchObject({
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      inputTokenDetails: { cacheReadTokens: 4 },
    });
    expect(misshapen({ name: 'AI_NoObjectGeneratedError' })).toBe(true);
    expect(misshapen({ name: 'AI_APICallError' })).toBe(false);
  });
});

describe("the editor's schemas", () => {
  const parts = ['The brief:\nIdea: leap years'];
  it.each([
    ['angles', editorAnglesSchema],
    ['research', editorResearchSchema],
    ['facts', editorFactsSchema],
    ['plan', editorPlanSchema],
    ['world', editorWorldSchema],
    ['beats', editorBeatsSchema],
    ['hooks', editorHooksSchema],
    ['script', editorScriptSchema],
    ['read', editorReadSchema],
    ['package', editorPackageSchema],
  ] as const)('take the %s answer whole', (step, schema) => {
    const answer = fakeEditorAnswer(step, parts);
    const parsed = schema.parse(answer) as Record<string, unknown>;
    for (const key of Object.keys(answer)) expect(parsed[key]).toBeDefined();
  });

  it('lose one bad item, never its list', () => {
    const parsed = editorResearchSchema.parse({
      claims: [
        { id: 'c1', text: 'Good.', kind: 'date' },
        { id: 7, text: null, kind: 'nonsense', sources: 'none' },
      ],
    });
    expect(parsed.claims).toHaveLength(2);
    expect(parsed.claims[1]).toMatchObject({ id: '', text: '', kind: 'claim' });
  });
});

describe("the boards' prompts", () => {
  it('build on the lesson writer’s own craft, and never invite dialogue in a shot', () => {
    expect(boardLessonPrompt()).toMatch(/narration\s+is written/);
    expect(boardLessonPrompt().length).toBeGreaterThan(2000);
    expect(boardIllustratedPrompt()).toMatch(/No one speaks/);
    expect(boardIllustratedPrompt()).toMatch(/violence is never shown/);
  });
});

describe("a board's answer read leniently", () => {
  it('takes an answer that leaves out the keys a thing does not use, and fills them as the schema would', () => {
    const { sceneScriptSchema } =
      jest.requireActual<typeof import('./schemas')>('./schemas');
    const answer = {
      title: 'A scene',
      beats: [{ say: 'One line.' }],
      cast: [{ id: 'loop', kind: 'drawing', name: 'Loop', brief: 'a loop' }],
      steps: [{ beat: 0, phrase: 'One', show: ['loop'] }],
    };
    expect(() => sceneScriptSchema.parse(answer)).toThrow();
    const read = lenient(sceneScriptSchema).parse(answer);
    const sound = filled(read, sceneScriptSchema) as {
      fit: string;
      fitReason: unknown;
      mood: string;
      beats: { pause: string; delivery: string; speaker: unknown }[];
      cast: { plot: unknown; parts: unknown; kind: string }[];
      steps: { arrows: unknown; effects: unknown }[];
    };
    expect(sound.fit).toBe('good');
    expect(sound.fitReason).toBeNull();
    expect(sound.mood).toBe('calm');
    expect(sound.beats[0]).toMatchObject({
      pause: 'short',
      delivery: 'explain',
      speaker: null,
    });
    expect(sound.cast[0]).toMatchObject({
      kind: 'drawing',
      plot: null,
      parts: null,
    });
    expect(sound.steps[0]).toMatchObject({ arrows: null, effects: null });
    // Filled, the answer is the full schema's.
    expect(() => sceneScriptSchema.parse(sound)).not.toThrow();
  });
});

describe('the pages a search found', () => {
  it('are those each search consulted or opened too, not only those the answer cited', () => {
    const found = foundOf({
      steps: [
        {
          sources: [],
          toolCalls: [{ toolName: 'web_search' }],
          toolResults: [
            {
              toolName: 'web_search',
              output: {
                action: { type: 'search', query: 'leap years' },
                sources: [
                  {
                    type: 'url',
                    url: 'https://a.example.com/leap?utm_source=openai',
                  },
                  { type: 'url', url: 'https://b.example.org/calendar' },
                ],
              },
            },
            {
              toolName: 'web_search',
              output: {
                action: { type: 'openPage', url: 'https://c.example.net/x' },
              },
            },
            {
              toolName: 'other',
              output: { sources: [{ url: 'https://d.example.com' }] },
            },
          ],
        },
      ],
      sources: [
        { sourceType: 'url', url: 'https://a.example.com/leap', title: 'Leap' },
      ],
    });
    expect(found).toEqual([
      { url: 'https://a.example.com/leap', title: 'Leap' },
      { url: 'https://b.example.org/calendar', title: '' },
      { url: 'https://c.example.net/x', title: '' },
    ]);
  });
});
