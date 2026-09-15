/**
 * One simplified note: the Easiest reading level is gone. Its pages,
 * exports and pipeline runs are deleted (they are regenerable content),
 * every enum that named it is narrowed, and a user's default level, with
 * only one level left to choose, is dropped. The column names stay:
 * `standard` is the one note's name in the database.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

const STEPS = [
  'convert',
  'extract',
  'ocr',
  'summarize',
  'topics',
  'embed',
  'simplify_standard',
  'export',
];

export const up: Migration = async ({ context }) => {
  await context.sequelize.query(
    "DELETE FROM simplified_pages WHERE level = 'easiest'",
  );
  await context.sequelize.query("DELETE FROM exports WHERE level = 'easiest'");
  await context.sequelize.query(
    "DELETE FROM pipeline_runs WHERE step = 'simplify_easiest'",
  );
  await context.sequelize.query(
    "UPDATE reading_positions SET level = 'standard' WHERE level = 'easiest'",
  );
  await context.sequelize.query(
    "DELETE FROM usage_counters WHERE metric = 'easiest_conversions'",
  );

  await context.changeColumn('simplified_pages', 'level', {
    type: DataTypes.ENUM('standard'),
    allowNull: false,
  });
  await context.changeColumn('exports', 'level', {
    type: DataTypes.ENUM('standard'),
    allowNull: false,
  });
  await context.changeColumn('reading_positions', 'level', {
    type: DataTypes.ENUM('original', 'standard'),
    allowNull: false,
    defaultValue: 'standard',
  });
  await context.changeColumn('pipeline_runs', 'step', {
    type: DataTypes.ENUM(...STEPS),
    allowNull: false,
  });
  await context.removeColumn('users', 'default_level');
};

export const down: Migration = async ({ context }) => {
  await context.addColumn('users', 'default_level', {
    type: DataTypes.ENUM('standard', 'easiest'),
    allowNull: false,
    defaultValue: 'standard',
  });
  await context.changeColumn('pipeline_runs', 'step', {
    type: DataTypes.ENUM(...STEPS, 'simplify_easiest'),
    allowNull: false,
  });
  await context.changeColumn('reading_positions', 'level', {
    type: DataTypes.ENUM('original', 'standard', 'easiest'),
    allowNull: false,
    defaultValue: 'standard',
  });
  await context.changeColumn('exports', 'level', {
    type: DataTypes.ENUM('standard', 'easiest'),
    allowNull: false,
  });
  await context.changeColumn('simplified_pages', 'level', {
    type: DataTypes.ENUM('standard', 'easiest'),
    allowNull: false,
  });
  // The deleted rows were generated content; they are not restored.
};
