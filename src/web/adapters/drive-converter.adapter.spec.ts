import { UnsupportedFormatError } from '../../business/domain/errors/errors';
import { DriveConverterAdapter } from './drive-converter.adapter';
import type { GoogleDriveClient } from './google-drive.client';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Records what the adapter asked Drive to do, without calling Google. */
function fakeDrive(
  overrides: Partial<{ exportBody: Buffer; createError: Error }> = {},
) {
  const calls = {
    created: [] as { mimeType?: string; media?: string }[],
    exported: [] as { fileId?: string; mimeType?: string }[],
    deleted: [] as string[],
  };

  const drive = {
    files: {
      create: jest.fn(async (args: any) => {
        if (overrides.createError) throw overrides.createError;
        calls.created.push({
          mimeType: args.requestBody?.mimeType,
          media: args.media?.mimeType,
        });
        return { data: { id: 'drive-file-1' } };
      }),
      export: jest.fn(async (args: any) => {
        calls.exported.push({ fileId: args.fileId, mimeType: args.mimeType });
        const body = overrides.exportBody ?? Buffer.from('%PDF-1.7 converted');
        return {
          data: body.buffer.slice(
            body.byteOffset,
            body.byteOffset + body.length,
          ),
        };
      }),
      delete: jest.fn(async (args: any) => {
        calls.deleted.push(args.fileId);
        return {};
      }),
    },
  };

  const client = {
    drive: () => drive,
    folderId: () => undefined,
    isConfigured: () => true,
  } as unknown as GoogleDriveClient;

  return { client, drive, calls };
}

describe('DriveConverterAdapter', () => {
  it('passes PDFs through without touching Drive', async () => {
    const { client, drive } = fakeDrive();
    const adapter = new DriveConverterAdapter(client);
    const pdf = Buffer.from('%PDF-1.4 original');

    const result = await adapter.toPdf({
      buffer: pdf,
      mimeType: 'application/pdf',
      filename: 'lecture.pdf',
    });

    expect(result).toBe(pdf);
    expect(drive.files.create).not.toHaveBeenCalled();
  });

  it('converts DOCX through Google Docs', async () => {
    const { client, calls } = fakeDrive();
    const adapter = new DriveConverterAdapter(client);

    await adapter.toPdf({
      buffer: Buffer.from('docx bytes'),
      mimeType: DOCX,
      filename: 'notes.docx',
    });

    // Asking Drive to STORE it as a Google type is what triggers the free
    // conversion; the media keeps the original type.
    expect(calls.created[0].mimeType).toBe(
      'application/vnd.google-apps.document',
    );
    expect(calls.created[0].media).toBe(DOCX);
    expect(calls.exported[0].mimeType).toBe('application/pdf');
  });

  it('converts PPTX through Google Slides', async () => {
    const { client, calls } = fakeDrive();
    const adapter = new DriveConverterAdapter(client);

    await adapter.toPdf({
      buffer: Buffer.from('pptx bytes'),
      mimeType: PPTX,
      filename: 'deck.pptx',
    });

    expect(calls.created[0].mimeType).toBe(
      'application/vnd.google-apps.presentation',
    );
  });

  it('deletes the intermediate Google file so Drive does not grow unbounded', async () => {
    const { client, calls } = fakeDrive();
    const adapter = new DriveConverterAdapter(client);

    await adapter.toPdf({
      buffer: Buffer.from('pptx'),
      mimeType: PPTX,
      filename: 'deck.pptx',
    });

    expect(calls.deleted).toEqual(['drive-file-1']);
  });

  it('never makes the uploaded file publicly readable', async () => {
    const { client, drive } = fakeDrive();
    const adapter = new DriveConverterAdapter(client);

    await adapter.toPdf({
      buffer: Buffer.from('docx'),
      mimeType: DOCX,
      filename: 'private-notes.docx',
    });

    // AI Examiner grants `anyone: reader` here. Study documents must not be
    // world-readable — bytes are served through our authenticated endpoint.
    expect((drive.files as any).permissions).toBeUndefined();
    expect(JSON.stringify(drive.files.create.mock.calls)).not.toContain(
      'anyone',
    );
  });

  it('rejects formats Drive cannot import', async () => {
    const { client } = fakeDrive();
    const adapter = new DriveConverterAdapter(client);

    await expect(
      adapter.toPdf({
        buffer: Buffer.from('epub'),
        mimeType: 'application/epub+zip',
        filename: 'book.epub',
      }),
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it('reports a quota failure as retryable, and still cleans up', async () => {
    const { client } = fakeDrive({
      createError: new Error(
        'storageQuotaExceeded: service accounts do not have storage',
      ),
    });
    const adapter = new DriveConverterAdapter(client);

    await expect(
      adapter.toPdf({
        buffer: Buffer.from('x'),
        mimeType: DOCX,
        filename: 'a.docx',
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('reports a rejected file as unsupported, not retryable', async () => {
    // Drive read the bytes and refused them: the file is damaged or isn't the
    // format its name claims. Three retries would only delay saying so.
    const { client } = fakeDrive({
      createError: new Error('Bad Request'),
    });
    const adapter = new DriveConverterAdapter(client);

    await expect(
      adapter.toPdf({
        buffer: Buffer.from('not really a deck'),
        mimeType: PPTX,
        filename: 'broken.pptx',
      }),
    ).rejects.toMatchObject({ status: 415 });
  });

  it('names the offending file when Drive rejects it', async () => {
    const { client } = fakeDrive({ createError: new Error('Bad Request') });
    const adapter = new DriveConverterAdapter(client);

    await expect(
      adapter.toPdf({
        buffer: Buffer.from('x'),
        mimeType: PPTX,
        filename: 'lecture-3.pptx',
      }),
    ).rejects.toThrow(/lecture-3\.pptx/);
  });

  it('supports() covers PDF and every convertible Office type', () => {
    const { client } = fakeDrive();
    const adapter = new DriveConverterAdapter(client);

    expect(adapter.supports('application/pdf')).toBe(true);
    expect(adapter.supports(DOCX)).toBe(true);
    expect(adapter.supports(PPTX)).toBe(true);
    expect(adapter.supports('application/epub+zip')).toBe(false);
  });
});
