/**
 * Per-document adaptation deltas.
 *
 * Readers are not uniformly fast or slow — they are slow in organic
 * chemistry and quick in history. This table holds a *relative* adjustment
 * for one document ("one notch slower than usual here"), which composes with
 * the global profile instead of competing with it.
 *
 * Deltas are the fast loop; promotion into `learner_profiles` is the slow
 * one, and only happens when the same pattern shows up in several documents.
 */
import { DataTypes, type ModelAttributeColumnOptions } from 'sequelize';
import type { Migration } from './umzug';

const TABLE_OPTS = { charset: 'utf8mb4' };
const fk = (table: string) => ({ model: table, key: 'id' });

const id: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
};

export const up: Migration = async ({ context }) => {
  await context.createTable(
    'document_learning_state',
    {
      id,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      document_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('documents'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      pace_delta: {
        type: DataTypes.ENUM('slower', 'none', 'faster'),
        allowNull: false,
        defaultValue: 'none',
      },
      depth_delta: {
        type: DataTypes.ENUM('deeper', 'none', 'lighter'),
        allowNull: false,
        defaultValue: 'none',
      },
      reason: { type: DataTypes.STRING(300), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    TABLE_OPTS,
  );
  await context.addIndex('document_learning_state', {
    name: 'uq_doc_learning_state_user_doc',
    fields: ['user_id', 'document_id'],
    unique: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('document_learning_state');
};
