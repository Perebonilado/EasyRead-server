import { ConfigService } from '@nestjs/config';
import { ModelRegistry } from './models';

const registry = (env: Record<string, string>) =>
  new ModelRegistry(new ConfigService(env));

describe('which model a task goes to', () => {
  const keys = { OPENAI_API_KEY: 'o', DEEPSEEK_API_KEY: 'd' };

  it('draws on DeepSeek and judges the pictures on Gemini', () => {
    const models = registry({ ...keys, GOOGLE_GENERATIVE_AI_API_KEY: 'g' });
    expect(models.refFor('cast_draw')).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-flash',
    });
    expect(models.refFor('set_paint').provider).toBe('deepseek');
    expect(models.refFor('drawing_judge')).toEqual({
      provider: 'google',
      modelId: 'gemini-3.8-flash',
    });
    expect(() => models.assertConfigured()).not.toThrow();
  });

  it("still starts without Google's key: the pictures are then not judged", () => {
    expect(() => registry(keys).assertConfigured()).not.toThrow();
  });

  it("uses a task's own setting as it is, and asks for its key", () => {
    const models = registry({
      ...keys,
      AI_MODEL_CAST_DRAW: 'google:gemini-3.8-flash',
    });
    expect(models.refFor('cast_draw').provider).toBe('google');
    expect(() => models.assertConfigured()).toThrow(/GOOGLE/);
  });
});
