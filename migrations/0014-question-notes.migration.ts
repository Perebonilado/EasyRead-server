/**
 * Ask-yourself questions (scaffolding plan, Phase 1).
 *
 * The student's own questions become first-class notes: posed before the
 * material (per Brann & Sidi 2025, the active ingredient of the scaffold),
 * filed by the tutor or the composer, and answered by the student at the
 * topic's end. A new `source` value keeps them distinguishable from ordinary
 * notes without a new table — a question is a note with a job.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

const WITH_QUESTION = [
  'typed',
  'highlight',
  'chat',
  'lesson',
  'recap',
  'question',
];

export const up: Migration = async ({ context }) => {
  await context.changeColumn('notes', 'source', {
    type: DataTypes.ENUM(...WITH_QUESTION),
    allowNull: false,
    defaultValue: 'typed',
  });
};

export const down: Migration = async ({ context }) => {
  // Narrowing an enum with live rows would fail — fold questions back into
  // plain notes first.
  await context.sequelize.query(
    "UPDATE notes SET source = 'typed' WHERE source = 'question'",
  );
  await context.changeColumn('notes', 'source', {
    type: DataTypes.ENUM('typed', 'highlight', 'chat', 'lesson', 'recap'),
    allowNull: false,
    defaultValue: 'typed',
  });
};
