import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { Pronunciations } from '../../business/domain/spoken';
import type {
  PronunciationRecord,
  PronunciationRepository,
  PronunciationStatus,
} from '../../business/repositories/pronunciation.repository';
import { PronunciationModel } from '../database/models/institution.model';
import { newId } from '../database/uuid';

const normalise = (term: string) =>
  term
    .trim()
    .replace(/^[("'“‘[]+/, '')
    .replace(/[)"'”’\].,;:!?]+$/, '')
    .toLowerCase();

@Injectable()
export class SequelizePronunciationRepository implements PronunciationRepository {
  constructor(
    @InjectModel(PronunciationModel)
    private readonly model: typeof PronunciationModel,
  ) {}

  async list(institutionId: string): Promise<PronunciationRecord[]> {
    const rows = await this.model.findAll({
      where: { institutionId },
      order: [
        ['status', 'ASC'],
        ['term', 'ASC'],
      ],
    });
    return rows.map(toRecord);
  }

  async kept(institutionId: string): Promise<Pronunciations> {
    const rows = await this.model.findAll({
      where: { institutionId, status: 'kept' },
      attributes: ['term', 'spoken'],
    });
    return new Map(rows.map((row) => [row.term, row.spoken]));
  }

  async propose(
    institutionId: string,
    documentId: string,
    proposals: { term: string; spoken: string }[],
  ): Promise<number> {
    const known = new Set(
      (
        await this.model.findAll({
          where: { institutionId },
          attributes: ['term'],
        })
      ).map((row) => row.term),
    );
    const fresh = new Map<string, string>();
    for (const proposal of proposals) {
      const term = normalise(proposal.term);
      const spoken = proposal.spoken.trim();
      if (!term || !spoken || known.has(term) || fresh.has(term)) continue;
      fresh.set(term, spoken);
    }
    if (!fresh.size) return 0;
    await this.model.bulkCreate(
      [...fresh.entries()].map(([term, spoken]) => ({
        id: newId(),
        institutionId,
        documentId,
        term,
        spoken,
        status: 'proposed' as const,
        source: 'seeded' as const,
      })),
      { ignoreDuplicates: true },
    );
    return fresh.size;
  }

  async add(
    institutionId: string,
    term: string,
    spoken: string,
  ): Promise<PronunciationRecord> {
    const key = normalise(term);
    const existing = await this.model.findOne({
      where: { institutionId, term: key },
    });
    if (existing) {
      await existing.update({
        spoken: spoken.trim(),
        status: 'kept',
        source: 'admin',
      });
      return toRecord(existing);
    }
    const row = await this.model.create({
      id: newId(),
      institutionId,
      documentId: null,
      term: key,
      spoken: spoken.trim(),
      status: 'kept',
      source: 'admin',
    });
    return toRecord(row);
  }

  async update(
    institutionId: string,
    id: string,
    patch: { spoken?: string; status?: PronunciationStatus },
  ): Promise<PronunciationRecord | null> {
    const row = await this.model.findOne({ where: { id, institutionId } });
    if (!row) return null;
    await row.update({
      ...(patch.spoken !== undefined ? { spoken: patch.spoken.trim() } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });
    return toRecord(row);
  }
}

const toRecord = (row: PronunciationModel): PronunciationRecord => ({
  id: row.id,
  institutionId: row.institutionId,
  documentId: row.documentId ?? null,
  term: row.term,
  spoken: row.spoken,
  status: row.status,
  source: row.source,
  updatedAt: row.get('updatedAt') as Date,
});
