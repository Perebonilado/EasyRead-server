/**
 * Chapter prerequisites (comprehension direction, phase 1-3):
 *
 *  - `topic_prerequisites` — what each chapter assumes the reader already
 *    knows, written by the topics pipeline step. `internal` ones point at the
 *    earlier chapter that covers them; `external` ones the document never
 *    explains.
 *  - `concept_knowledge` — the per-user ledger of external concepts: flagged
 *    unclear, then marked taught once the chat or the tutor has explained
 *    them. Only external prerequisites ever land here; internal ones are
 *    answered by topic read state, which already exists.
 *  - chat messages gain a `prerequisite` origin, so "explain this concept my
 *    chapter assumes" is a first-class question with its own prompt.
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
const timestamps = {
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false },
};

export const up: Migration = async ({ context }) => {
  await context.createTable(
    'topic_prerequisites',
    {
      id,
      topic_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('topics'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      order_index: { type: DataTypes.INTEGER, allowNull: false },
      // A specific named concept, never a subject area.
      concept: { type: DataTypes.STRING(300), allowNull: false },
      // One line on what in this chapter needs it.
      why: { type: DataTypes.STRING(600), allowNull: false },
      kind: { type: DataTypes.ENUM('internal', 'external'), allowNull: false },
      // The earlier chapter that covers it, for internal ones.
      covered_by_topic_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('topics'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('topic_prerequisites', {
    name: 'idx_topic_prereq_topic',
    fields: ['topic_id'],
  });

  await context.createTable(
    'concept_knowledge',
    {
      id,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      // Normalised (lower-cased, squashed spaces) — "Osmolality" and
      // "osmolality" are one concept.
      concept: { type: DataTypes.STRING(300), allowNull: false },
      state: { type: DataTypes.ENUM('unclear', 'taught'), allowNull: false },
      // Where it was resolved, for provenance; scope stays same-document.
      resolved_document_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('documents'),
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      first_flagged_at: { type: DataTypes.DATE, allowNull: false },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('concept_knowledge', {
    name: 'idx_concept_user',
    fields: ['user_id', 'concept'],
    unique: true,
  });

  // "Explain this prerequisite" lands in the chat with its own origin.
  await context.changeColumn('chat_messages', 'highlight_action', {
    type: DataTypes.ENUM('explain', 'simplify', 'define', 'prerequisite'),
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.changeColumn('chat_messages', 'highlight_action', {
    type: DataTypes.ENUM('explain', 'simplify', 'define'),
    allowNull: true,
  });
  await context.dropTable('concept_knowledge');
  await context.dropTable('topic_prerequisites');
};
