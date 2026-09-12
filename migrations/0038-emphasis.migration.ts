/**
 * The phrases the writer says a listener should catch on a page, one per
 * section at most, for the voice to say with weight. Null on rows written
 * before the writer was asked.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('lecture_segments', 'emphasis', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('lecture_segments', 'emphasis');
};
