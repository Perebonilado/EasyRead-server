/**
 * Where a learner stopped in a document's visuals: the page and the
 * time, one row per learner and document, saved as the tutorial plays
 * and read back when the pane opens, the way the lecture remembers.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('visual_positions', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    document_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    page_number: { type: DataTypes.INTEGER, allowNull: false },
    offset_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('visual_positions', ['document_id', 'user_id'], {
    name: 'visual_positions_key',
    unique: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('visual_positions');
};
