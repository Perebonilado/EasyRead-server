/**
 * The struggle-signal stream: one table, many producers.
 *
 * Everything that indicates comprehension *effort* — a wrong quiz answer, a
 * question typed while reading, a prerequisite the reader asked to have
 * explained, later a long dwell on a page — is recorded uniformly, so the
 * adaptive loop can read one stream instead of quiz scores alone.
 *
 * These are interpretations, not surveillance: each row is a judgement
 * ("this looked like effort") with a weight, never a raw behavioural feed.
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
    'struggle_signals',
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
      topic_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('topics'),
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      page_number: { type: DataTypes.INTEGER, allowNull: true },
      kind: {
        type: DataTypes.ENUM(
          'quiz_wrong',
          'quiz_right',
          'chat_question',
          'highlight_explain',
          'prereq_requested',
          'reread',
          'long_dwell',
          'still_not_clear',
        ),
        allowNull: false,
      },
      weight: { type: DataTypes.FLOAT, allowNull: false },
      // Payload, never identity — e.g. { ms, expected } for a dwell.
      meta: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    TABLE_OPTS,
  );
  await context.addIndex('struggle_signals', {
    name: 'idx_struggle_user_doc_time',
    fields: ['user_id', 'document_id', 'created_at'],
  });
  await context.addIndex('struggle_signals', {
    name: 'idx_struggle_user_doc_topic',
    fields: ['user_id', 'document_id', 'topic_id'],
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('struggle_signals');
};
