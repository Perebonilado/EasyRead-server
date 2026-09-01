/**
 * Lectures: a spoken class per document, planned per chapter.
 *
 * Three tables, because the three things have different lifetimes. A plan
 * belongs to a chapter of a document version and is written once. A
 * segment belongs to a page and carries both its script and the audio
 * that was synthesised from it. A position belongs to a person, and
 * outlives every regeneration — where you stopped listening is yours, not
 * the document's.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('lecture_plans', {
    id: { type: DataTypes.UUID, primaryKey: true },
    document_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'documents', key: 'id' },
      onDelete: 'CASCADE',
    },
    topic_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'topics', key: 'id' },
      onDelete: 'CASCADE',
    },
    /** A rewritten document gets a new lecture; the old one is orphaned. */
    content_version: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
    /** The hook, the arc, and a beat per page. */
    plan_json: { type: DataTypes.JSON, allowNull: true },
    generator_version: { type: DataTypes.STRING(32), allowNull: false },
    error: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await context.addIndex('lecture_plans', {
    fields: ['document_id', 'topic_id', 'content_version'],
    unique: true,
    name: 'lecture_plans_doc_topic_version',
  });

  await context.createTable('lecture_segments', {
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
    page_number: { type: DataTypes.INTEGER, allowNull: false },
    content_version: { type: DataTypes.INTEGER, allowNull: false },
    /** Play order across the whole document, so the tape never sorts. */
    seq: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
    /** Never shown to the student: the lecture is heard, not read. */
    script_text: { type: DataTypes.TEXT, allowNull: true },
    audio_key: { type: DataTypes.STRING(512), allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    /** A page with nothing to teach, crossed in one spoken line. */
    bridge: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    generator_version: { type: DataTypes.STRING(32), allowNull: false },
    error: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  // One segment per page per version: enqueuing twice is a no-op.
  await context.addIndex('lecture_segments', {
    fields: ['document_id', 'page_number', 'content_version'],
    unique: true,
    name: 'lecture_segments_doc_page_version',
  });
  // The query the player makes on every open.
  await context.addIndex('lecture_segments', [
    'document_id',
    'content_version',
    'seq',
  ]);

  await context.createTable('lecture_positions', {
    id: { type: DataTypes.UUID, primaryKey: true },
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
    offset_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  // One remembered place per person per document.
  await context.addIndex('lecture_positions', {
    fields: ['user_id', 'document_id'],
    unique: true,
    name: 'lecture_positions_user_doc',
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('lecture_positions');
  await context.dropTable('lecture_segments');
  await context.dropTable('lecture_plans');
};
