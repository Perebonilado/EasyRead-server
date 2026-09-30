import { UploadIntentHandler } from './upload.handlers';

/**
 * A file given to the Studio is uploaded by the library's own path, but
 * as the Studio's own: never one of the library's documents of the month.
 */
function build() {
  const consumed: string[] = [];
  const created: Record<string, unknown>[] = [];
  const handler = new UploadIntentHandler(
    {
      create: (input: Record<string, unknown>) => {
        created.push(input);
        return Promise.resolve({ id: 'd1' });
      },
    } as never,
    {
      createUploadTarget: () =>
        Promise.resolve({
          uploadUrl: '/documents/d1/content',
          uploadMode: 'proxy',
        }),
    } as never,
    {
      consume: (_user: string, metric: string) => {
        consumed.push(metric);
        return Promise.resolve();
      },
      release: () => Promise.resolve(),
    } as never,
  );
  return { handler, consumed, created };
}

const file = {
  userId: 'u1',
  filename: 'cells.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1000,
};

describe('an upload reserved', () => {
  it("is one of the library's documents of the month", async () => {
    const t = build();
    await t.handler.handle(file);
    expect(t.consumed).toHaveLength(1);
    expect(t.created[0]).not.toHaveProperty('origin');
  });

  it("is the Studio's own, and not counted as the library's, when the Studio gives it", async () => {
    const t = build();
    const result = await t.handler.handle({ ...file, origin: 'studio' });
    expect(result.data).toMatchObject({ documentId: 'd1' });
    expect(t.consumed).toEqual([]);
    expect(t.created[0]).toMatchObject({ origin: 'studio', title: 'cells' });
  });

  it('still takes only the accepted types', async () => {
    const t = build();
    await expect(
      t.handler.handle({ ...file, mimeType: 'image/png', origin: 'studio' }),
    ).rejects.toThrow();
  });
});
