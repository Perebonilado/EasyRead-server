/**
 * Follow-along: where in the simplified note the tutor is, moment by
 * moment. Each lecture row gains a track (audio time to block and
 * sentence) and a status of its own, so a page plays whether or not its
 * track exists yet.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('lecture_segments', 'follow', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await context.addColumn('lecture_segments', 'follow_status', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'none',
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('lecture_segments', 'follow_status');
  await context.removeColumn('lecture_segments', 'follow');
};
