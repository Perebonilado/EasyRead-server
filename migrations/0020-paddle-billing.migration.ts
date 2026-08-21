/**
 * Billing goes live on Paddle, and the subscriptions table stops speaking
 * Paystack.
 *
 * The gateway ids become opaque `provider_*` columns, the status set is
 * normalised across providers (Paystack's `non_renewing` becomes the
 * `cancel_at_period_end` flag, which is what Paddle and Stripe both model),
 * and `interval` records monthly against yearly. Nothing has ever been
 * billed, so the rename needs no data backfill.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.renameColumn(
    'subscriptions',
    'subscription_code',
    'provider_subscription_id',
  );
  await context.renameColumn(
    'subscriptions',
    'customer_code',
    'provider_customer_id',
  );

  await context.addColumn('subscriptions', 'interval', {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: true,
  });
  await context.addColumn('subscriptions', 'cancel_at_period_end', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  await context.changeColumn('subscriptions', 'provider', {
    type: DataTypes.ENUM('paddle', 'stripe', 'paystack', 'fake'),
    allowNull: false,
    defaultValue: 'paddle',
  });
  await context.changeColumn('subscriptions', 'status', {
    type: DataTypes.ENUM(
      'active',
      'trialing',
      'past_due',
      'paused',
      'cancelled',
      'expired',
    ),
    allowNull: false,
  });
};

export const down: Migration = async ({ context }) => {
  await context.changeColumn('subscriptions', 'status', {
    type: DataTypes.ENUM(
      'active',
      'non_renewing',
      'attention',
      'cancelled',
      'expired',
    ),
    allowNull: false,
  });
  await context.changeColumn('subscriptions', 'provider', {
    type: DataTypes.ENUM('paystack'),
    allowNull: false,
    defaultValue: 'paystack',
  });
  await context.removeColumn('subscriptions', 'cancel_at_period_end');
  await context.removeColumn('subscriptions', 'interval');
  await context.renameColumn(
    'subscriptions',
    'provider_customer_id',
    'customer_code',
  );
  await context.renameColumn(
    'subscriptions',
    'provider_subscription_id',
    'subscription_code',
  );
};
