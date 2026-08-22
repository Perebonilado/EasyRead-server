/**
 * The usage metric column stops being an ENUM.
 *
 * The metered-paywall model adds study_seconds and voice_seconds, and a
 * MySQL enum means a schema migration every time a metric is born. A plain
 * varchar with the same values ends that; validity lives in the TypeScript
 * UsageMetric union, which is where it was really enforced anyway.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.changeColumn('usage_counters', 'metric', {
    type: DataTypes.STRING(32),
    allowNull: false,
  });
};

export const down: Migration = async ({ context }) => {
  await context.changeColumn('usage_counters', 'metric', {
    type: DataTypes.ENUM(
      'documents_uploaded',
      'easiest_conversions',
      'highlight_actions',
    ),
    allowNull: false,
  });
};
