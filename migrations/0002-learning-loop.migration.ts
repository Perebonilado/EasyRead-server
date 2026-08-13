/**
 * The learning loop's memory (adaptive tutoring, phases 2–4):
 *
 *  - `assessment_events` — every answered quiz, flashcard and the tutor's own
 *    verbal ratings. Raw events, never aggregated in place: mastery is
 *    computed at read time so the scoring formula can change without a
 *    backfill.
 *  - `learner_profiles` — one row per user: how this person learns, shared
 *    across documents. The tutor reads it, and rewrites it as it teaches.
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
    'assessment_events',
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
      // Nullable: a quiz can be about the document at large, and a deleted
      // topic must not erase the evidence the student answered something.
      topic_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('topics'),
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      kind: {
        type: DataTypes.ENUM('mcq', 'flashcard', 'verbal'),
        allowNull: false,
      },
      // 0..1. MCQs are 0 or 1; flashcard self-grades and verbal ratings land
      // in between.
      score: { type: DataTypes.FLOAT, allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: true },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('assessment_events', {
    name: 'idx_assessment_user_doc_time',
    fields: ['user_id', 'document_id', 'created_at'],
  });
  await context.addIndex('assessment_events', {
    name: 'idx_assessment_topic',
    fields: ['topic_id'],
  });

  await context.createTable(
    'learner_profiles',
    {
      id,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: fk('users'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      pace: {
        type: DataTypes.ENUM('slower', 'steady', 'faster'),
        allowNull: false,
        defaultValue: 'steady',
      },
      depth: {
        type: DataTypes.ENUM('lighter', 'standard', 'deeper'),
        allowNull: false,
        defaultValue: 'standard',
      },
      interactivity: {
        type: DataTypes.ENUM('less', 'standard', 'more'),
        allowNull: false,
        defaultValue: 'standard',
      },
      // The tutor's own accumulated observations ("analogies land; long
      // definitions lose them"). Length-capped at the API, not here.
      style_notes: { type: DataTypes.TEXT, allowNull: true },
      ...timestamps,
    },
    TABLE_OPTS,
  );
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('learner_profiles');
  await context.dropTable('assessment_events');
};
