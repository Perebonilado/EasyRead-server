import { Injectable } from '@nestjs/common';
import type { BatchDto } from '../contracts';
import { batchShown, batchesOf } from '../business/domain/batches';
import { MaterialsQuery } from './materials.query';

/**
 * The admin's drops for one school, each as a row: built from the same
 * per-document tallies the cards use, so a batch and its files agree.
 */
@Injectable()
export class BatchesQuery {
  constructor(private readonly materials: MaterialsQuery) {}

  async execute(institutionId: string): Promise<BatchDto[]> {
    const materials = await this.materials.execute({ institutionId });
    const now = new Date();
    return batchesOf(materials).filter((batch) => batchShown(batch, now));
  }
}
