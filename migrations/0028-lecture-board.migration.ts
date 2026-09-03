/**
 * The lecture board: what the lecturer writes and draws while speaking.
 *
 * Each lecture row gains a board timeline (the operations the board plays,
 * anchored to the spoken words), the word times the aligner measured on
 * its audio, and a status of its own, so a page always plays whether or
 * not its board exists. Saved boards land in the learner's notes under a
 * source of their own.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

const SOURCES = ['typed', 'highlight', 'chat', 'lesson', 'recap', 'question'];

export const up: Migration = async ({ context }) => {
  await context.addColumn('lecture_segments', 'board', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await context.addColumn('lecture_segments', 'word_times', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await context.addColumn('lecture_segments', 'board_status', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'none',
  });
  await context.addIndex('lecture_segments', {
    fields: ['document_id', 'content_version', 'board_status'],
    name: 'lecture_segments_doc_version_board_status',
  });
  await context.changeColumn('notes', 'source', {
    type: DataTypes.ENUM(...SOURCES, 'board'),
    allowNull: false,
    defaultValue: 'typed',
  });
};

export const down: Migration = async ({ context }) => {
  await context.sequelize.query(
    "UPDATE notes SET source = 'lesson' WHERE source = 'board'",
  );
  await context.changeColumn('notes', 'source', {
    type: DataTypes.ENUM(...SOURCES),
    allowNull: false,
    defaultValue: 'typed',
  });
  await context.removeIndex(
    'lecture_segments',
    'lecture_segments_doc_version_board_status',
  );
  await context.removeColumn('lecture_segments', 'board_status');
  await context.removeColumn('lecture_segments', 'word_times');
  await context.removeColumn('lecture_segments', 'board');
};
