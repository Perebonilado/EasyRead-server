/**
 * The item bank: questions as rows, and one row per encounter with one.
 *
 * AI Examiner stores a whole question set as a single JSON blob, which
 * makes four things impossible at once: per-item history, a review queue,
 * cross-set deduplication, and item statistics. Splitting items out is what
 * unlocks all four, and the review table is what turns a test you take once
 * into a schedule you keep.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('items', {
    id: { type: DataTypes.UUID, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    topic_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'topics', key: 'id' },
      onDelete: 'SET NULL',
    },
    kind: { type: DataTypes.STRING(16), allowNull: false },
    stem: { type: DataTypes.TEXT, allowNull: false },
    options: { type: DataTypes.JSON, allowNull: false },
    correct_index: { type: DataTypes.INTEGER, allowNull: false },
    explanation: { type: DataTypes.TEXT, allowNull: false },
    hint: { type: DataTypes.TEXT, allowNull: true },
    /** Verbatim source sentence the verifier matched. Shown on review. */
    grounding_quote: { type: DataTypes.TEXT, allowNull: true },
    source_page: { type: DataTypes.INTEGER, allowNull: true },
    /** Which generator wrote it, so a bad batch can be found and retired. */
    generator_version: { type: DataTypes.STRING(32), allowNull: false },
    /** Measured from responses, never asserted by the generator. */
    p_value: { type: DataTypes.FLOAT, allowNull: true },
    discrimination: { type: DataTypes.FLOAT, allowNull: true },
    times_answered: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    /** Set when statistics show the item misleads. Never served again. */
    retired_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await context.addIndex('items', ['document_id', 'topic_id']);
  await context.addIndex('items', ['document_id', 'retired_at']);

  await context.createTable('item_reviews', {
    id: { type: DataTypes.UUID, primaryKey: true },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    item_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'items', key: 'id' },
      onDelete: 'CASCADE',
    },
    // FSRS state. Kept per user per item: the same question is easy for one
    // reader and hard for another, and that is the point.
    stability: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    difficulty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    state: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'new',
    },
    reps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lapses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    due_at: { type: DataTypes.DATE, allowNull: false },
    last_reviewed_at: { type: DataTypes.DATE, allowNull: true },
    /** Rolling record of the most recent answer, for the results screen. */
    last_correct: { type: DataTypes.BOOLEAN, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  // One schedule per person per item.
  await context.addIndex('item_reviews', {
    fields: ['user_id', 'item_id'],
    unique: true,
    name: 'item_reviews_user_item',
  });
  // The query the review queue makes on every load.
  await context.addIndex('item_reviews', ['user_id', 'due_at']);
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('item_reviews');
  await context.dropTable('items');
};
