/**
 * Chapter previews for guided reading (guided-reading plan, Phase 0).
 *
 * The skim ritual's material, written by a model for comprehension rather
 * than extracted mechanically. Stored because it derives from the document
 * alone — the same preview serves every reader of the document, so it is
 * generated once and then free, exactly like page audio.
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
    'topic_previews',
    {
      id,
      document_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('documents'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      topic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('topics'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      /** TopicPreviewBody: about, outline, keyTerms, howItEnds. */
      body: { type: DataTypes.JSON, allowNull: false },
      created_at: { type: DataTypes.DATE(6), allowNull: false },
      updated_at: { type: DataTypes.DATE(6), allowNull: false },
    },
    TABLE_OPTS,
  );

  // One preview per topic — the cache key.
  await context.addIndex('topic_previews', {
    name: 'uq_topic_previews_topic',
    fields: ['topic_id'],
    unique: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('topic_previews');
};
