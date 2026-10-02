import { Controller, Get, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { TerrainTilesService } from '../../business/handlers/studio/terrain-tiles.service';
import { Public } from '../security/public.decorator';

/**
 * Map tiles the player's map draws from (explainer-animation-plan §6.1):
 * the terrain its hillshade and its tilted land are made of, kept in our
 * own storage. Open to anyone, the render page included, as a map's tiles
 * are; a page of a film asks for a few hundred, so the limit is generous.
 * A tile never changes, so a browser keeps it for a year.
 */
@Controller('tiles')
export class TilesController {
  constructor(private readonly terrain: TerrainTilesService) {}

  @Public()
  @Get('terrain/:z/:x/:y.png')
  @Throttle({ default: { limit: 2000, ttl: 60_000 } })
  async terrainTile(
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Res() response: Response,
  ): Promise<void> {
    const png = await this.terrain.tile(z, x, y);
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', png.length);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.end(png);
  }
}
