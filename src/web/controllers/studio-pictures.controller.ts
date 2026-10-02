import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { PictureDesk } from '../../business/domain/pictures/desk';
import type { StoragePort } from '../../business/ports/storage.port';
import { PICTURE_DESK, STORAGE } from '../../business/ports/tokens';
import { Public } from '../security/public.decorator';

/** A cache row's id: a uuid (v7, as every table's). */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The pictures the desk cleared, as the shot stage draws them: our copy of
 * an archive photo or a portrait, and its depth map (explainer-animation-
 * tech §4.3). Open without an account, as a film shared by its link is:
 * the stage draws them with <img>, which cannot send a token (the player,
 * the render page and a shared film all load them the same way); every
 * one is a file its archive shows the world, credited in the film and its
 * description (under the licence switch, PICTURE_LICENCE, a public-domain,
 * CC0 or CC BY one only), found at an id nobody can guess. A refused
 * picture, or one with no copy, is not found. A picture never changes once
 * kept, so browsers keep it for good.
 */
@Controller('studio/pictures')
export class StudioPicturesController {
  constructor(
    @Inject(PICTURE_DESK) private readonly desk: PictureDesk,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  @Public()
  @Get(':id')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async picture(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const row = ID.test(id) ? await this.desk.record(id) : null;
    if (!row?.storageKey) {
      response.status(404).end();
      return;
    }
    await this.pipe(row.storageKey, row.mime ?? 'image/jpeg', response);
  }

  @Public()
  @Get(':id/depth')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async depth(
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const row = ID.test(id) ? await this.desk.record(id) : null;
    if (!row?.depthKey) {
      response.status(404).end();
      return;
    }
    await this.pipe(row.depthKey, 'image/png', response);
  }

  private async pipe(
    key: string,
    type: string,
    response: Response,
  ): Promise<void> {
    try {
      const { stream, size } = await this.storage.stream(key);
      response.setHeader('Content-Type', type);
      response.setHeader('Content-Length', size);
      response.setHeader(
        'Cache-Control',
        'public, max-age=31536000, immutable',
      );
      stream.pipe(response);
    } catch {
      response.status(404).end();
    }
  }
}
