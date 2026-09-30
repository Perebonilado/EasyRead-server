/**
 * A film's shape (studio-vertical-plan §1.3): every episode is made in
 * exactly one, wide (16:9) or tall (9:16, for phones), kept on it; every
 * episode made so far is wide. An episode can have a twin in the other
 * shape (§1.4): its `twin_of` is the episode whose script and voice it
 * shares, and each of its scenes' `twin_of` the scene of that episode it
 * is the same scene of, composed again for its own frame.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('studio_episodes', 'shape', {
    type: DataTypes.STRING(8),
    allowNull: false,
    defaultValue: 'wide',
  });
  await context.addColumn('studio_episodes', 'twin_of', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  await context.addIndex('studio_episodes', ['twin_of'], {
    name: 'studio_episodes_twin',
  });
  await context.addColumn('studio_scenes', 'twin_of', {
    type: DataTypes.UUID,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('studio_scenes', 'twin_of');
  await context.removeIndex('studio_episodes', 'studio_episodes_twin');
  await context.removeColumn('studio_episodes', 'twin_of');
  await context.removeColumn('studio_episodes', 'shape');
};
