/**
 * What the Studio is doing now to an episode or a scene, in plain words
 * ("Reading the whole script", "The writer is busy, trying again (2 of
 * 3)"), as JSON on its row: set while a job runs, cleared when it ends,
 * and read by the maker's page as it follows the work.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('studio_episodes', 'activity', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await context.addColumn('studio_scenes', 'activity', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('studio_scenes', 'activity');
  await context.removeColumn('studio_episodes', 'activity');
};
