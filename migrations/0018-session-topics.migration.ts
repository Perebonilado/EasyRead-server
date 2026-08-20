/**
 * Group sessions scope to one or many chapters (classroom plan): the single
 * nullable topic_id becomes a JSON list. Null still means the whole
 * document; the old column stays for rows written before this.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('study_sessions', 'topic_ids', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('study_sessions', 'topic_ids');
};
