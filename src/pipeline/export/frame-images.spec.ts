import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StillImage } from '../../business/domain/shots/frame-checks';
import { contactSheet, decodePng, encodePng, readStill } from './frame-images';
import { runsOf } from './film-capture';

/** A picture of one colour. */
function plain(
  width: number,
  height: number,
  rgb: [number, number, number],
): StillImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([...rgb, 255], i * 4);
  return { width, height, data };
}

describe('stills as files', () => {
  it('writes pixels as a PNG and reads them back the same', async () => {
    const image = plain(6, 4, [12, 200, 90]);
    image.data.set([255, 0, 0, 255], 0);
    const bytes = encodePng(image);
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    const back = decodePng(bytes);
    expect([back.width, back.height]).toEqual([6, 4]);
    expect([...back.data]).toEqual([...image.data]);
    const dir = mkdtempSync(join(tmpdir(), 'frames-'));
    try {
      writeFileSync(join(dir, 'still.png'), bytes);
      expect((await readStill(join(dir, 'still.png'))).width).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders a contact sheet with its stills in it', async () => {
    const tile = encodePng(plain(48, 27, [220, 40, 40])).toString('base64');
    const sheet = decodePng(
      await contactSheet({
        title: 'A scene',
        subtitle: 'scores',
        shape: 'wide',
        tiles: [
          { png: tile, ms: 1000, codes: [] },
          { png: tile, ms: 3000, codes: ['blank'] },
        ],
      }),
    );
    expect(sheet.width).toBe(18 * 2 + 4 * 480 + 3 * 14);
    // The middle of the first tile is the still's red.
    const at = ((74 + 135) * sheet.width + 18 + 240) * 4;
    expect([...sheet.data.subarray(at, at + 3)]).toEqual([220, 40, 40]);
  }, 30_000);
});

describe('the stills shared among browsers', () => {
  it('cuts the moments into runs in order, none empty', () => {
    expect(runsOf(10, 3)).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: 7 },
      { from: 7, to: 10 },
    ]);
    expect(runsOf(2, 4)).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ]);
    expect(runsOf(0, 2)).toEqual([]);
    expect(runsOf(5, 0)).toEqual([{ from: 0, to: 5 }]);
  });
});
