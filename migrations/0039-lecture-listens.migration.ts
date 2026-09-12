/**
 * How far learners get: one row each time a learner's saved place in a
 * lecture moves to another page. Read later as the share of chapters
 * played to the end, before and after a change to the voice or the
 * writing: the last page each listener reached per document per day,
 * against the chapters' last pages.
 */
import { DataTypes, type ModelAttributeColumnOptions } from 'sequelize';
import type { Migration } from './umzug';

const id: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
};

export const up: Migration = async ({ context }) => {
  await context.createTable('lecture_listens', {
    id,
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    page_number: { type: DataTypes.INTEGER, allowNull: false },
    style: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'steady',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('lecture_listens', [
    'document_id',
    'user_id',
    'created_at',
  ]);
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('lecture_listens');
};
