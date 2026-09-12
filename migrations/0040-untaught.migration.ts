/**
 * The paragraphs a written page left untaught after the writer's
 * attempts, by their number in the note, so the admin's card can count
 * them and Prepare can write those pages again. Null on rows written
 * before the count existed.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('lecture_segments', 'untaught', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('lecture_segments', 'untaught');
};
