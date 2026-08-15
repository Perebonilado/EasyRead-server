import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { RecapBody } from '../../contracts';
import type {
  RecapRecord,
  RecapRepository,
} from '../../business/repositories/recap.repository';
import { SessionRecapModel } from '../database/models/session-recap.model';
import { newId } from '../database/uuid';

const toRecord = (row: SessionRecapModel): RecapRecord => ({
  id: row.id,
  fromPage: row.fromPage,
  toPage: row.toPage,
  since: row.since,
  body: row.body,
  createdAt: row.get('createdAt') as Date,
});

@Injectable()
export class SequelizeRecapRepository implements RecapRepository {
  constructor(
    @InjectModel(SessionRecapModel)
    private readonly model: typeof SessionRecapModel,
  ) {}

  async create(input: {
    documentId: string;
    userId: string;
    fromPage: number;
    toPage: number;
    since: Date | null;
    body: RecapBody;
  }): Promise<RecapRecord> {
    const row = await this.model.create({ id: newId(), ...input } as never);
    return toRecord(row);
  }

  async list(
    documentId: string,
    userId: string,
    limit: number,
  ): Promise<RecapRecord[]> {
    const rows = await this.model.findAll({
      where: { documentId, userId } as never,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ] as never,
      limit,
    });
    return rows.map(toRecord);
  }

  async latest(
    documentId: string,
    userId: string,
  ): Promise<RecapRecord | null> {
    const [row] = await this.list(documentId, userId, 1);
    return row ?? null;
  }
}
