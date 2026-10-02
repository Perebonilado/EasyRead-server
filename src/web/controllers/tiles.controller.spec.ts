import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NotFoundError } from '../../business/domain/errors/errors';
import { TerrainTilesService } from '../../business/handlers/studio/terrain-tiles.service';
import { DomainExceptionFilter } from '../filters/domain-exception.filter';
import { TilesController } from './tiles.controller';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);

describe('the terrain tiles, over HTTP', () => {
  let app: INestApplication;
  const tile = jest.fn((z: string, x: string, y: string) =>
    z === '5' && x === '16' && y === '15'
      ? Promise.resolve(PNG)
      : Promise.reject(new NotFoundError('Tile')),
  );

  beforeAll(async () => {
    const made = await Test.createTestingModule({
      controllers: [TilesController],
      providers: [
        { provide: TerrainTilesService, useValue: { tile } },
        { provide: APP_FILTER, useClass: DomainExceptionFilter },
      ],
    }).compile();
    app = made.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app.close());

  it('serves a tile as a PNG a browser keeps for a year', async () => {
    const response = await request(app.getHttpServer() as never)
      .get('/api/v1/tiles/terrain/5/16/15.png')
      .expect(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(Buffer.from(response.body as Buffer)).toEqual(PNG);
    expect(tile).toHaveBeenCalledWith('5', '16', '15');
  });

  it('says a tile there is not is not found', async () => {
    await request(app.getHttpServer() as never)
      .get('/api/v1/tiles/terrain/13/0/0.png')
      .expect(404);
  });
});
