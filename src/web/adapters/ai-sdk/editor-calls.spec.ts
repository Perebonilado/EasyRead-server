import {
  effortOptions,
  foundOf,
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
