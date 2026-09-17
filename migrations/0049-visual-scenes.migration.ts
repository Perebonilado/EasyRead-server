/**
 * Visual scenes: one chapter of a document as a short timed scene, asked
 * for by a student from the reader, made once per document version and
 * chapter, and played by every reader of the document. The script (the
 * elements, the sentences and every cue on the audio) is stored as JSON
 * beside the keys of its audio and its measured words.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('visual_scenes', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    document_id: { type: DataTypes.UUID, allowNull: false },
    topic_id: { type: DataTypes.UUID, allowNull: false },
    content_version: { type: DataTypes.INTEGER, allowNull: false },
    generator_version: { type: DataTypes.STRING(32), allowNull: false },
    status: {
      type: DataTypes.ENUM(
        'pending',
        'making',
        'done',
        'failed',
        'not_suitable',
      ),
      allowNull: false,
      defaultValue: 'pending',
    },
    /** The step being worked on while making: planning, drawing, recording, timing. */
    step: { type: DataTypes.STRING(16), allowNull: true },
    fit: { type: DataTypes.STRING(8), allowNull: true },
    fit_reason: { type: DataTypes.TEXT, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    title: { type: DataTypes.STRING(80), allowNull: true },
    timeline: { type: DataTypes.JSON, allowNull: true },
    audio_key: { type: DataTypes.STRING(512), allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    requested_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex(
    'visual_scenes',
    ['document_id', 'content_version', 'topic_id', 'generator_version'],
    { name: 'visual_scenes_key', unique: true },
  );
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('visual_scenes');
};
