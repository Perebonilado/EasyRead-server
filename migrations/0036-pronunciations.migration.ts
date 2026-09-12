/**
 * A school's pronunciations: how the rented voice should say the words it
 * gets wrong, one word for one word. Seeded from each document's hard
 * terms as proposals, kept or dropped by an admin who has heard them, and
 * applied to the spoken text only, never to what the reader sees.
 */
import { DataTypes, type ModelAttributeColumnOptions } from 'sequelize';
import type { Migration } from './umzug';

const id: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
};

export const up: Migration = async ({ context }) => {
  await context.createTable(
    'pronunciations',
    {
      id,
      institution_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'institutions', key: 'id' },
        onDelete: 'CASCADE',
      },
      /** The document whose terms proposed it; null for one an admin typed. */
      document_id: { type: DataTypes.UUID, allowNull: true },
      /** The word as written, lower-cased, without punctuation. */
      term: { type: DataTypes.STRING(120), allowNull: false },
      /** How the voice should say it. */
      spoken: { type: DataTypes.STRING(200), allowNull: false },
      status: {
        type: DataTypes.ENUM('proposed', 'kept', 'dropped'),
        allowNull: false,
        defaultValue: 'proposed',
      },
      source: {
        type: DataTypes.ENUM('seeded', 'admin'),
        allowNull: false,
        defaultValue: 'seeded',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { charset: 'utf8mb4' },
  );
  await context.addIndex('pronunciations', ['institution_id', 'term'], {
    unique: true,
    name: 'pronunciations_institution_term',
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('pronunciations');
};
