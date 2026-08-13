import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import type {
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../../business/repositories/refresh-token.repository';
import { RefreshTokenModel } from '../database/models';
import { newId } from '../database/uuid';

const toRecord = (row: RefreshTokenModel): StoredRefreshToken => ({
  id: row.id,
  userId: row.userId,
  familyId: row.familyId,
  tokenHash: row.tokenHash,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
});

@Injectable()
export class SequelizeRefreshTokenRepository implements RefreshTokenRepository {
  constructor(
    @InjectModel(RefreshTokenModel)
    private readonly model: typeof RefreshTokenModel,
  ) {}

  async issue(input: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  }): Promise<StoredRefreshToken> {
    const row = await this.model.create({ id: newId(), ...input } as any);
    return toRecord(row);
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const row = await this.model.findOne({ where: { tokenHash } });
    return row ? toRecord(row) : null;
  }

  async rotate(id: string, replacedById: string, now: Date): Promise<void> {
    await this.model.update(
      { revokedAt: now, replacedById },
      { where: { id } },
    );
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.model.update(
      { revokedAt: now },
      { where: { familyId, revokedAt: { [Op.is]: null } } },
    );
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.model.update(
      { revokedAt: now },
      { where: { userId, revokedAt: { [Op.is]: null } } },
    );
  }
}
