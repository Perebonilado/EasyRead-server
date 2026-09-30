import { PipelineOrchestrator } from './orchestrator.service';

/**
 * The Studio's own documents are read lightly: extracted, then straight to
 * their chapters, with no OCR of the whole, no summary, no simplified
 * pages and no embeddings; and ready once their chapters are.
 */
function build(origin: 'reader' | 'studio', done: string[] = []) {
  const steps: string[] = [];
  const saved: string[] = [];
  const doc = {
    id: 'd1',
    props: {
      origin,
      source: 'uploaded',
      status: 'processing',
      sourceMimeType: 'application/pdf',
      institutionId: null,
    },
    markReady: () => {
      doc.props.status = 'ready';
    },
  };
  const orchestrator = new PipelineOrchestrator(
    {
      findById: () => Promise.resolve(doc),
      save: () => {
        saved.push(doc.props.status);
        return Promise.resolve();
      },
    } as never,
    {
      allDone: (_id: string, wanted: string[]) =>
        Promise.resolve(wanted.every((step) => done.includes(step))),
      status: () => Promise.resolve(null),
    } as never,
    {} as never,
    {
      countEmpty: () => Promise.resolve(5),
      countUnreadMaths: () => Promise.resolve(0),
    } as never,
    {
      enqueueStep: (step: string) => {
        steps.push(step);
        return Promise.resolve();
      },
    } as never,
    { publish: () => Promise.resolve() } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { orchestrator, steps, saved };
}

describe("a Studio document's light reading", () => {
  it('goes from extraction straight to its chapters, even with empty pages', async () => {
    const studio = build('studio');
    await studio.orchestrator.afterExtract('d1', 1);
    expect(studio.steps).toEqual(['topics']);
    const reader = build('reader');
    await reader.orchestrator.afterExtract('d1', 1);
    expect(reader.steps).toEqual(['ocr']);
  });

  it('is ready once its chapters are, without a summary or simplified pages', async () => {
    const studio = build('studio', ['convert', 'extract', 'topics']);
    await studio.orchestrator.markReadyIfComplete('d1');
    expect(studio.saved).toEqual(['ready']);
    const reader = build('reader', ['convert', 'extract', 'topics']);
    await reader.orchestrator.markReadyIfComplete('d1');
    expect(reader.saved).toEqual([]);
  });
});
