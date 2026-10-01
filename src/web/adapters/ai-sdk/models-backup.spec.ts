import { backedBy, type BackedModel } from './models';

/** A model whose calls answer, fail or never answer, recording what it was asked. */
function fake(
  name: string,
  does: 'answer' | 'fail' | 'hang',
): BackedModel & {
  asked: number;
  modelId: string;
} {
  const call = (options: { abortSignal?: AbortSignal }) => {
    model.asked += 1;
    if (does === 'answer') return Promise.resolve({ by: name });
    if (does === 'fail')
      return Promise.reject(new Error('Invalid JSON response'));
    return new Promise((_, reject) =>
      options.abortSignal?.addEventListener('abort', () =>
        reject(new Error('aborted')),
      ),
    );
  };
  const model = { asked: 0, modelId: name, doGenerate: call, doStream: call };
  return model;
}

describe('a model with a backup (DeepSeek, then GPT mini)', () => {
  it('keeps the first when it answers, and never asks the backup', async () => {
    const first = fake('deepseek', 'answer');
    const backup = fake('mini', 'answer');
    const backed = backedBy(first, backup, 1_000);
    await expect(backed.doGenerate({})).resolves.toEqual({ by: 'deepseek' });
    expect(backup.asked).toBe(0);
    // Everything else is the first's own.
    expect((backed as unknown as { modelId: string }).modelId).toBe('deepseek');
  });

  it('asks the backup when the first fails (an outage answering in pieces)', async () => {
    const why: string[] = [];
    const backed = backedBy(
      fake('deepseek', 'fail'),
      fake('mini', 'answer'),
      1_000,
      (w) => why.push(w),
    );
    await expect(backed.doStream({})).resolves.toEqual({ by: 'mini' });
    expect(why[0]).toMatch(/failed \(Invalid JSON response\)/);
  });

  it('asks the backup when the first gives no answer in time', async () => {
    const why: string[] = [];
    const backed = backedBy(
      fake('deepseek', 'hang'),
      fake('mini', 'answer'),
      50,
      (w) => why.push(w),
    );
    await expect(backed.doGenerate({})).resolves.toEqual({ by: 'mini' });
    expect(why[0]).toMatch(/gave no answer/);
  });

  it('never asks again a call the caller cancelled', async () => {
    const backup = fake('mini', 'answer');
    const backed = backedBy(fake('deepseek', 'hang'), backup, 5_000);
    const stop = new AbortController();
    const pending = backed.doGenerate({ abortSignal: stop.signal });
    stop.abort();
    await expect(pending).rejects.toThrow('aborted');
    expect(backup.asked).toBe(0);
  });
});
