/**
 * Document chat: the conversation a reader has with one document.
 *
 * There is no conversation table — a thread *is* every `chat_messages` row
 * sharing a (document, user) pair, in creation order. One thread per document
 * per reader, which is what the reader UI shows and all a study session needs.
 *
 * A message that started as a highlight keeps its origin as columns rather
 * than as a prefix baked into the text: the action, the quoted passage and
 * the page it came from. That is what lets the bubble render a real quote
 * block, and what lets a reader jump back to the page they asked about.
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
    'chat_messages',
    {
      id,
      document_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('documents'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      role: {
        type: DataTypes.ENUM('user', 'assistant'),
        allowNull: false,
      },
      text: { type: DataTypes.TEXT('long'), allowNull: false },
      // Set when the message began as a highlight action rather than typing.
      highlight_action: {
        type: DataTypes.ENUM('explain', 'simplify', 'define'),
        allowNull: true,
      },
      // The passage the reader highlighted, kept whole and separate from the
      // question so the bubble can quote it.
      quoted_text: { type: DataTypes.TEXT, allowNull: true },
      page_number: { type: DataTypes.INTEGER, allowNull: true },
      // The passages retrieved to answer, kept beside the reply rather than
      // buried in it — replayed into later turns and citable in the UI.
      sources: { type: DataTypes.JSON, allowNull: true },
      // Microsecond precision: a question and its answer can land inside the
      // same second, and a thread ordered by a second-precision timestamp
      // interleaves turns wrongly.
      created_at: { type: DataTypes.DATE(6), allowNull: false },
      updated_at: { type: DataTypes.DATE(6), allowNull: false },
    },
    TABLE_OPTS,
  );

  // The thread read: one document, one reader, oldest to newest — and the
  // keyset page-back the panel scrolls through.
  await context.addIndex('chat_messages', {
    name: 'idx_chat_thread',
    fields: ['document_id', 'user_id', 'created_at'],
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('chat_messages');
};
