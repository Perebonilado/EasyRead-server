/**
 * A Studio conversation in the order it was said: each message's time kept
 * to the millisecond, so a maker's message and the producer's reply saved
 * in the same second read in the order they came, not by their ids.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.changeColumn('studio_messages', 'created_at', {
    type: DataTypes.DATE(3),
    allowNull: false,
  });
};

export const down: Migration = async ({ context }) => {
  await context.changeColumn('studio_messages', 'created_at', {
    type: DataTypes.DATE,
    allowNull: false,
  });
};
