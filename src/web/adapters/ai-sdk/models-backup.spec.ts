import { backedBy, type BackedModel } from './models';

type Part = { type: string; delta?: string };

/** A stream of parts; with `stall`, it opens (its start sent) and then says nothing until cancelled. */
function streamOf(parts: Part[], stall = false): ReadableStream<Part> {
  let k = 0;
  return new ReadableStream<Part>({
    pull(controller) {
      if (k < parts.length) {
        controller.enqueue(parts[k]);
        k += 1;
        return;
      }
      if (stall) return new Promise<void>(() => undefined);
      controller.close();
    },
  });
}

async function textOf(result: unknown): Promise<string> {
  const reader = (
    result as { stream: ReadableStream<Part> }
  ).stream.getReader();
  let text = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) return text;
    if (part.value.type === 'text-delta') text += part.value.delta ?? '';
  }
}

/** A model whose calls answer, fail, never answer, or (streaming) open and go silent. */
function fake(
  name: string,
  does: 'answer' | 'fail' | 'hang' | 'silent',
): BackedModel & { asked: number; modelId: string } {
  const pending = (options: { abortSignal?: AbortSignal }) =>
    new Promise((_, reject) =>
      options.abortSignal?.addEventListener('abort', () =>
        reject(new Error('aborted')),
      ),
    );
  const model = {
    asked: 0,
    modelId: name,
    doGenerate: (options: { abortSignal?: AbortSignal }) => {
      model.asked += 1;
      if (does === 'answer') return Promise.resolve({ by: name });
      if (does === 'fail')
        return Promise.reject(new Error('Invalid JSON response'));
      return pending(options);
    },
    doStream: (options: { abortSignal?: AbortSignal }) => {
      model.asked += 1;
      if (does === 'fail')
        return Promise.reject(new Error('Invalid JSON response'));
      if (does === 'hang') return pending(options);
      return Promise.resolve({
        stream: streamOf(
          does === 'silent'
            ? [{ type: 'stream-start' }]
            : [{ type: 'stream-start' }, { type: 'text-delta', delta: name }],
          does === 'silent',
        ),
      });
    },
  };
  return model;
}

describe('a model with a backup (DeepSeek, then GPT mini)', () => {
  it('keeps the first when it answers, and never asks the backup', async () => {
    const first = fake('deepseek', 'answer');
    const backup = fake('mini', 'answer');
    const backed = backedBy(first, backup, 1_000);
    await expect(backed.doGenerate({})).resolves.toEqual({ by: 'deepseek' });
    expect(await textOf(await backed.doStream({}))).toBe('deepseek');
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
    await expect(backed.doGenerate({})).resolves.toEqual({ by: 'mini' });
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

  it('streams from the backup when the first opens a stream and says nothing', async () => {
    const why: string[] = [];
    const backed = backedBy(
      fake('deepseek', 'silent'),
      fake('mini', 'answer'),
      5_000,
      (w) => why.push(w),
      50,
    );
    expect(await textOf(await backed.doStream({}))).toBe('mini');
    expect(why[0]).toMatch(/gave no answer/);
  });

  it('never cuts off an answer once it is coming', async () => {
    // The stream's first words come in time; what follows is passed on whole, however long it takes.
    const backed = backedBy(
      fake('deepseek', 'answer'),
      fake('mini', 'answer'),
      5_000,
      () => undefined,
      50,
    );
    const result = await backed.doStream({});
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await textOf(result)).toBe('deepseek');
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
