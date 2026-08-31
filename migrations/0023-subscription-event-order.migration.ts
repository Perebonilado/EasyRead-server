/**
 * Two changes that the move to Stripe forces, both provider-agnostic.
 *
 * `last_event_at` records when the gateway event that last wrote this row
 * happened. Stripe does not guarantee delivery order, so a late-arriving
 * `subscription.created` (status incomplete) could otherwise overwrite the
 * `subscription.updated` (status active) that already landed — silently
 * taking Pro away from someone who just paid. With this, an event older
 * than the one already applied is ignored.
 *
 * `provider` stops being an ENUM for the same reason `metric` did: adding a
 * gateway should not mean a schema migration, and MySQL silently mangles a
 * value outside the enum rather than refusing it loudly.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('subscriptions', 'last_event_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await context.changeColumn('subscriptions', 'provider', {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'stripe',
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('subscriptions', 'last_event_at');
  await context.changeColumn('subscriptions', 'provider', {
    type: DataTypes.ENUM('paddle', 'stripe', 'paystack', 'fake'),
    allowNull: false,
    defaultValue: 'paddle',
  });
};
