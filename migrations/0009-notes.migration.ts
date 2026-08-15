/**
 * Notes: what the reader writes down for themselves.
 *
 * Unlike every other table here, nothing in this one is generated — the body
 * is the reader's own words, so the write path never touches a model and a
 * note can be saved while offline work is still catching up.
 *
 * `page_number` is nullable on purpose. A note usually belongs to the page it
 * was taken on, and keeping that lets the panel jump back to it; but a note
 * taken during a lesson, or a thought about the document as a whole, has no
 * page and must not be forced to invent one. `topic_id` is the same idea one
 * level up, and is SET NULL rather than CASCADE: re-running the topics step
 * replaces topic rows, and that must never delete someone's writing.
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
    'notes',
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
      body: { type: DataTypes.TEXT('long'), allowNull: false },
      // The page the reader was on when they wrote it, when there was one.
      page_number: { type: DataTypes.INTEGER, allowNull: true },
      topic_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('topics'),
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      // The passage this note was written against, when it came from a
      // highlight or a saved answer — kept whole so the card can quote it.
      quoted_text: { type: DataTypes.TEXT, allowNull: true },
      // Where the note came from. Not decoration: the panel styles a quoted
      // note differently from a typed one, and the export groups by it.
      source: {
        type: DataTypes.ENUM('typed', 'highlight', 'chat', 'lesson', 'recap'),
        allowNull: false,
        defaultValue: 'typed',
      },
      // Microsecond precision, as with chat: several notes can be saved
      // inside the same second and the panel orders by this.
      created_at: { type: DataTypes.DATE(6), allowNull: false },
      updated_at: { type: DataTypes.DATE(6), allowNull: false },
    },
    TABLE_OPTS,
  );

  // The panel's read: one document, one reader, newest first.
  await context.addIndex('notes', {
    name: 'idx_notes_document',
    fields: ['document_id', 'user_id', 'created_at'],
  });

  // "Notes on this page" as the reader turns pages.
  await context.addIndex('notes', {
    name: 'idx_notes_page',
    fields: ['document_id', 'user_id', 'page_number'],
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('notes');
};
