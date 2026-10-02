import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { PixelBox } from '../../business/domain/pictures/types';
import type {
  PictureCacheInput,
  PictureCacheRepository,
  PictureCacheRow,
} from '../../business/repositories/picture-cache.repository';
import { PictureCacheModel } from '../database/models';
import { newId } from '../database/uuid';

/** A JSON column read back, or null for anything that is not what it should be. */
function parsed<T>(
  text: string | null,
  check: (value: unknown) => value is T,
): T | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return check(value) ? value : null;
  } catch {
    return null;
  }
}

const isBox = (value: unknown): value is PixelBox =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class SequelizePictureCacheRepository implements PictureCacheRepository {
  constructor(
    @InjectModel(PictureCacheModel)
    private readonly pictures: typeof PictureCacheModel,
  ) {}

  private row(model: PictureCacheModel): PictureCacheRow {
    return {
      id: model.id,
      qid: model.qid,
      source: model.source,
      sourceId: model.sourceId,
      kind: model.kind,
      subject: model.subject,
      url: model.url,
      sourceUrl: model.sourceUrl,
      licence: model.licence,
      credit: model.credit,
      chip: model.chip,
      width: model.width === null ? null : Number(model.width),
      height: model.height === null ? null : Number(model.height),
      focal: parsed(model.focal, isBox),
      sha1: model.sha1,
      mime: model.mime,
      storageKey: model.storageKey,
      depthKey: model.depthKey,
      meta: parsed(model.meta, isRecord),
      checkedAt: model.checkedAt,
      refusedReason: model.refusedReason,
    };
  }

  async find(id: string): Promise<PictureCacheRow | null> {
    const found = await this.pictures.findByPk(id);
    return found ? this.row(found) : null;
  }

  async bySource(
    source: string,
    sourceId: string,
  ): Promise<PictureCacheRow | null> {
    const found = await this.pictures.findOne({ where: { source, sourceId } });
    return found ? this.row(found) : null;
  }

  async bySha1(sha1: string): Promise<PictureCacheRow | null> {
    const found = await this.pictures.findOne({
      where: { sha1 },
      order: [['createdAt', 'ASC']],
    });
    return found ? this.row(found) : null;
  }

  async save(input: PictureCacheInput): Promise<PictureCacheRow> {
    const values = {
      qid: input.qid,
      source: input.source,
      sourceId: input.sourceId,
      kind: input.kind,
      subject: input.subject,
      url: input.url,
      sourceUrl: input.sourceUrl,
      licence: input.licence,
      credit: input.credit,
      chip: input.chip,
      width: input.width,
      height: input.height,
      focal: input.focal ? JSON.stringify(input.focal) : null,
      sha1: input.sha1,
      mime: input.mime,
      storageKey: input.storageKey,
      depthKey: input.depthKey,
      meta: input.meta ? JSON.stringify(input.meta) : null,
      checkedAt: input.checkedAt,
      refusedReason: input.refusedReason,
    };
    const had =
      (input.id ? await this.pictures.findByPk(input.id) : null) ??
      (await this.pictures.findOne({
        where: { source: input.source, sourceId: input.sourceId },
      }));
    if (had) {
      await had.update(values);
      return this.row(had);
    }
    return this.row(
      await this.pictures.create({ id: input.id ?? newId(), ...values }),
    );
  }
}
