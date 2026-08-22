/**
 * The metered-paywall restructure's one new table: purchased voice seconds.
 *
 * Study time and voice usage both live in the existing usage_counters table
 * under new metrics, so the wallet balance is the only new state. One row
 * per user, integer seconds, never expiring.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('voice_credits', {
    id: { type: DataTypes.UUID, primaryKey: true },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    balance_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('voice_credits');
};
