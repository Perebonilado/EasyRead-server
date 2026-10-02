import { NotFoundError } from '../../domain/errors/errors';
import type { StoragePort } from '../../ports/storage.port';
import { TerrainTilesService, type TileFetch } from './terrain-tiles.service';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

/** Storage in memory: what was put, by key. */
function memoryStorage() {
  const kept = new Map<string, Buffer>();
  const put = jest.fn(({ key, body }: { key: string; body: Buffer }) => {
    kept.set(key, body);
    return Promise.resolve({
      ref: key,
      sizeBytes: body.length,
      mimeType: 'image/png',
    });
  });
  const get = jest.fn((ref: string) => {
    const found = kept.get(ref);
    return found
      ? Promise.resolve(found)
      : Promise.reject(new NotFoundError('File'));
  });
  return { kept, put, get, storage: { put, get } as unknown as StoragePort };
}

/** A source that answers every tile with these bytes (or this status), counting what it is asked. */
function fakeSource(bytes: Buffer = PNG, status = 200) {
  const asked: string[] = [];
  const fetcher: TileFetch = async (url) => {
    asked.push(url);
    await new Promise((done) => setTimeout(done, 5));
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: () =>
        Promise.resolve(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.length,
          ) as ArrayBuffer,
        ),
    };
  };
  return { asked, fetcher };
}

describe('the terrain-tile proxy', () => {
  it('fetches a tile it has not kept from Terrain Tiles, keeps it, and gives it from storage after', async () => {
    const { kept, storage } = memoryStorage();
    const source = fakeSource();
    const tiles = new TerrainTilesService(storage, source.fetcher);
    expect(await tiles.tile('7', '66', '60')).toEqual(PNG);
    expect(source.asked).toEqual([
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/7/66/60.png',
    ]);
    expect([...kept.keys()]).toEqual(['tiles/terrarium/7/66/60.png']);
    expect(await tiles.tile('7', '66', '60')).toEqual(PNG);
    expect(source.asked).toHaveLength(1);
  });

  it('fetches a tile asked for twice at once only once', async () => {
    const { storage, put } = memoryStorage();
    const source = fakeSource();
    const tiles = new TerrainTilesService(storage, source.fetcher);
    const [a, b] = await Promise.all([
      tiles.tile('3', '4', '3'),
      tiles.tile('3', '4', '3'),
    ]);
    expect(a).toEqual(PNG);
    expect(b).toEqual(PNG);
    expect(source.asked).toHaveLength(1);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('refuses a tile there is not, without asking anyone', async () => {
    const { storage, get } = memoryStorage();
    const source = fakeSource();
    const tiles = new TerrainTilesService(storage, source.fetcher);
    await expect(tiles.tile('13', '0', '0')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(tiles.tile('2', '9', '0')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(source.asked).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps nothing the source does not give as a PNG, and says the tile is not there', async () => {
    const { kept, storage } = memoryStorage();
    const missing = new TerrainTilesService(
      storage,
      fakeSource(PNG, 404).fetcher,
    );
    await expect(missing.tile('4', '8', '7')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const wrong = new TerrainTilesService(
      storage,
      fakeSource(Buffer.from('<Error/>')).fetcher,
    );
    await expect(wrong.tile('4', '8', '7')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    const down = new TerrainTilesService(storage, () =>
      Promise.reject(new Error('ECONNRESET')),
    );
    await expect(down.tile('4', '8', '7')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(kept.size).toBe(0);
  });

  it('still gives a tile it could not keep', async () => {
    const { storage, put } = memoryStorage();
    put.mockRejectedValueOnce(new Error('bucket full'));
    const tiles = new TerrainTilesService(storage, fakeSource().fetcher);
    expect(await tiles.tile('1', '1', '1')).toEqual(PNG);
  });
});
