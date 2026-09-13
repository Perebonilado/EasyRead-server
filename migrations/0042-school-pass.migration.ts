/**
 * The school pass. A person's standing with one school's library lives in
 * `school_passes`: the one free document they opened, and the yearly
 * subscription once bought, kept the way `subscriptions` keeps Pro. It is
 * not the membership row, so leaving and rejoining loses nothing, and not
 * the subscriptions table, whose one row per person is Pro's. A school may
 * be free for its students until a date while it onboards.
 */
import { DataTypes, type ModelAttributeColumnOptions } from 'sequelize';
import type { Migration } from './umzug';

const id: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
};

export const up: Migration = async ({ context }) => {
  await context.createTable('school_passes', {
    id,
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    institution_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'institutions', key: 'id' },
      onDelete: 'CASCADE',
    },
    free_document_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'documents', key: 'id' },
      onDelete: 'SET NULL',
    },
    free_document_at: { type: DataTypes.DATE, allowNull: true },
    provider: { type: DataTypes.STRING(32), allowNull: true },
    provider_subscription_id: { type: DataTypes.STRING(128), allowNull: true },
    provider_customer_id: { type: DataTypes.STRING(128), allowNull: true },
    status: {
      type: DataTypes.ENUM(
        'active',
        'trialing',
        'past_due',
        'paused',
        'cancelled',
        'expired',
      ),
      allowNull: true,
    },
    current_period_end: { type: DataTypes.DATE, allowNull: true },
    cancel_at_period_end: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    raw: { type: DataTypes.JSON, allowNull: true },
    last_event_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('school_passes', ['user_id', 'institution_id'], {
    unique: true,
  });
  await context.addIndex('school_passes', ['provider_subscription_id']);
  await context.addColumn('institutions', 'pass_free_until', {
    type: DataTypes.DATE,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('institutions', 'pass_free_until');
  await context.dropTable('school_passes');
};
