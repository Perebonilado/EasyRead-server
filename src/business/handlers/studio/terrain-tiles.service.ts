import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { NotFoundError } from '../../domain/errors/errors';
import {
  TERRAIN_MOST_BYTES,
  isPng,
  readTile,
  terrainKey,
  terrainUrl,
} from '../../domain/shots/terrain-tiles';
import type { StoragePort } from '../../ports/storage.port';
import { STORAGE, TERRAIN_TILE_FETCH } from '../../ports/tokens';

/** How a tile is fetched from its source: fetch's own shape, so a test can hand in its own. */
export type TileFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** How long the source may take over one tile. */
const FETCH_MS = 15_000;

/**
 * The player's map's terrain, one tile at a time (terrain-tiles): from our
 * own storage when it has been asked for before, else fetched once from
 * Terrain Tiles, checked to be a PNG, kept, and given. Asked for twice at
 * once, it is fetched once.
 */
@Injectable()
export class TerrainTilesService {
  private readonly logger = new Logger('TerrainTiles');
  private readonly fetching = new Map<string, Promise<Buffer>>();
  private readonly fetcher: TileFetch;

  constructor(
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Optional() @Inject(TERRAIN_TILE_FETCH) fetcher?: TileFetch,
  ) {
    this.fetcher = fetcher ?? ((url, init) => fetch(url, init));
  }

  /** A tile's PNG by its address as the path gives it; NotFound for one there is not. */
  async tile(z: unknown, x: unknown, y: unknown): Promise<Buffer> {
    const tile = readTile(z, x, y);
    if (!tile) throw new NotFoundError('Tile');
    const key = terrainKey(tile);
    try {
      return await this.storage.get(key);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
    const kept = this.fetching.get(key);
    if (kept) return kept;
    const fetching = this.fetchAndKeep(terrainUrl(tile), key).finally(() =>
      this.fetching.delete(key),
    );
    this.fetching.set(key, fetching);
    return fetching;
  }

  private async fetchAndKeep(url: string, key: string): Promise<Buffer> {
    let bytes: Buffer;
    try {
      const response = await this.fetcher(url, {
        signal: AbortSignal.timeout(FETCH_MS),
      });
      if (!response.ok) throw new NotFoundError('Tile');
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (!(error instanceof NotFoundError))
        this.logger.warn(`could not fetch ${url}: ${(error as Error).message}`);
      throw new NotFoundError('Tile');
    }
    if (!isPng(bytes) || bytes.length > TERRAIN_MOST_BYTES)
      throw new NotFoundError('Tile');
    // Kept for next time; a tile that could not be kept is still given.
    await this.storage
      .put({ key, body: bytes, mimeType: 'image/png' })
      .catch((error: unknown) =>
        this.logger.warn(`could not keep ${key}: ${(error as Error).message}`),
      );
    return bytes;
  }
}
