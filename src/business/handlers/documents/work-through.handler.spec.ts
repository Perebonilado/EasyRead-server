import type { WorkedSolution } from '../../domain/maths-work';
import { ComputeService } from './compute.service';
import { WorkThroughHandler } from './voice.handlers';

const step = (latex: string, does = 'work it out') => ({
  latex,
  does,
  why: null,
  changes: [],
  says: '',
});

const solving = (steps: string[]): WorkedSolution => ({
  given: ['2x + 3 = 11'],
  wanted: 'x',
  steps: steps.map((latex) => step(latex)),
  answer: steps[steps.length - 1] ?? null,
  check: null,
});

describe('WorkThroughHandler', () => {
  function harness(writes: WorkedSolution[]) {
    const asked: { problems?: string[] }[] = [];
    const logged: { task: string; model: string }[] = [];
    const handler = new WorkThroughHandler(
      {
        workThrough: (input: { problems?: string[] }) => {
          asked.push(input);
          const value = writes[Math.min(asked.length - 1, writes.length - 1)];
          return Promise.resolve({
            value,
            usage: { model: 'fake', tokensIn: 10, tokensOut: 20, latencyMs: 5 },
          });
        },
      } as never,
      { find: () => Promise.resolve('For a school student.') } as never,
      { findOne: () => Promise.resolve(null) } as never,
      { find: () => Promise.resolve(null) } as never,
      {
        record: (input: { task: string; model: string }) => {
          logged.push(input);
          return Promise.resolve();
        },
      },
      new ComputeService(),
      { require: () => Promise.resolve({ id: 'doc-1' }) } as never,
    );
    return { handler, asked, logged };
  }
  const request = { userId: 'user-1', documentId: 'doc-1', page: 3 };

  it('gives a working that checks, once', async () => {
    const { handler, asked } = harness([solving(['2x = 8', 'x = 4'])]);
    const { data } = await handler.handle({
      ...request,
      problem: 'solve 2x + 3 = 11',
    });
    expect(asked).toHaveLength(1);
    expect(data.ok).toBe(true);
    if (!data.ok) return;
    expect(data.lines.map((line) => line.plain)).toEqual([
      '2x + 3 = 11',
      '2x = 8',
      'x = 4',
    ]);
    expect(data.working.cut).toBeUndefined();
  });

  it('sends a wrong step back once, and keeps the working put right', async () => {
    const { handler, asked } = harness([
      solving(['2x = 14', 'x = 7']),
      solving(['2x = 8', 'x = 4']),
    ]);
    const { data } = await handler.handle({
      ...request,
      problem: 'solve 2x + 3 = 11',
    });
    expect(asked).toHaveLength(2);
    expect(asked[1].problems?.[0]).toContain('Step 1');
    expect(data.ok && data.working.steps.map((one) => one.latex)).toEqual([
      '2x = 8',
      'x = 4',
    ]);
  });

  it('cuts a working still wrong at its last true line', async () => {
    const { handler } = harness([
      solving(['2x = 8', 'x = 5']),
      solving(['2x = 8', 'x = 5']),
    ]);
    const { data } = await handler.handle({
      ...request,
      problem: 'solve 2x + 3 = 11',
    });
    expect(data.ok).toBe(true);
    if (!data.ok) return;
    expect(data.working.cut).toBe(true);
    expect(data.working.steps.map((one) => one.latex)).toEqual(['2x = 8']);
    // Code gives the answer the cut working no longer reaches.
    expect(data.working.answer).toBe('x = 4');
  });

  it('says so when not one line stands', async () => {
    const { handler } = harness([solving(['2x = 9']), solving(['2x = 9'])]);
    const { data } = await handler.handle({
      ...request,
      problem: 'solve 2x + 3 = 11',
    });
    expect(data).toEqual({
      ok: false,
      error: 'It could not be worked through with every step checked',
    });
  });

  it('works one sum by code alone, with no model', async () => {
    const { handler, asked, logged } = harness([]);
    const { data } = await handler.handle({
      ...request,
      problem: '',
      expression: '0.05 * 200000',
    });
    expect(asked).toHaveLength(0);
    expect(logged[0].model).toBe('mathjs');
    expect(data.ok).toBe(true);
    if (!data.ok) return;
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0].latex).toContain('10000');
  });
});
