import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import type { StoragePort } from '../../business/ports/storage.port';
import { VisualsController } from './visuals.controller';

/** A response that records what was sent. */
function recorder() {
  const sent = {
    status: 200,
    headers: {} as Record<string, unknown>,
    body: '',
    ended: false,
  };
  const response = {
    setHeader: (name: string, value: unknown) => {
      sent.headers[name] = value;
    },
    status: (code: number) => {
      sent.status = code;
      return response;
    },
    end: () => {
      sent.ended = true;
    },
    write: (chunk: Buffer) => {
      sent.body += chunk.toString();
      return true;
    },
    on: () => response,
    once: () => response,
    emit: () => true,
  };
  return { sent, response: response as unknown as Response };
}

describe("a page's audio", () => {
  let audioKey = 'documents/d/visuals/v1/p1-scene-2-am_puck.mp3';
  const storage = {
    stream: jest.fn(() =>
      Promise.resolve({ stream: Readable.from(['mp3']), size: 3 }),
    ),
  } as unknown as StoragePort;
  const scene = {
    handle: jest.fn(() => Promise.resolve({ data: { audioKey } })),
  };
  const controller = new VisualsController(
    {} as never,
    {} as never,
    scene as never,
    {} as never,
    {} as never,
    storage,
  );
  const ask = async (etag?: string) => {
    const { sent, response } = recorder();
    const request = {
      headers: etag ? { 'if-none-match': etag } : {},
    } as unknown as Request;
    const piped = jest
      .spyOn(Readable.prototype, 'pipe')
      .mockImplementation(function (this: Readable) {
        return this as never;
      });
    await controller.audio('user', 'd', 1, request, response);
    piped.mockRestore();
    return sent;
  };

  it('is checked each time against the file the page is made from now', async () => {
    const first = await ask();
    expect(first.status).toBe(200);
    expect(first.headers['Cache-Control']).toBe('private, no-cache');
    const tag = first.headers.ETag as string;
    expect(tag).toMatch(/^"[0-9a-f]{16}"$/);
    // Unchanged: nothing sent again.
    const again = await ask(tag);
    expect(again.status).toBe(304);
    expect(again.ended).toBe(true);
    // Made again: its new voice, under a new tag.
    audioKey = 'documents/d/visuals/v1/p1-scene-2-rmufc9ugi-am_puck.mp3';
    const remade = await ask(tag);
    expect(remade.status).toBe(200);
    expect(remade.headers.ETag).not.toBe(tag);
  });
});
