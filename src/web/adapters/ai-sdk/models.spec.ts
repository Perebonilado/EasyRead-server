import { ConfigService } from '@nestjs/config';
import { ModelRegistry } from './models';

const registry = (env: Record<string, string>) =>
  new ModelRegistry(new ConfigService(env));

describe('which model a task goes to', () => {
  const keys = {
    OPENAI_API_KEY: 'o',
    DEEPSEEK_API_KEY: 'd',
  };

  it("draws on Gemini where Google's key is set", () => {
    const models = registry({ ...keys, GOOGLE_GENERATIVE_AI_API_KEY: 'g' });
    expect(models.refFor('cast_draw').provider).toBe('google');
    expect(models.refFor('set_paint').provider).toBe('google');
    expect(models.refFor('drawing_judge').provider).toBe('google');
  });

  it('draws on DeepSeek and judges on gpt-4.1 where it is not, and still starts', () => {
    const models = registry(keys);
    expect(models.refFor('cast_draw')).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-flash',
    });
    expect(models.refFor('set_paint').provider).toBe('deepseek');
    expect(models.refFor('drawing_judge')).toEqual({
      provider: 'openai',
      modelId: 'gpt-4.1',
    });
    expect(() => models.assertConfigured()).not.toThrow();
  });

  it("uses a task's own setting as it is, key or not", () => {
    const models = registry({
      ...keys,
      AI_MODEL_CAST_DRAW: 'google:gemini-3.8-flash',
    });
    expect(models.refFor('cast_draw').provider).toBe('google');
    expect(() => models.assertConfigured()).toThrow(/GOOGLE/);
  });
});
