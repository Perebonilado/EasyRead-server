/**
 * The processing channels are gone: text always runs on OpenAI and every
 * lecture is voiced on the rented GPU, so there is nothing for an admin to
 * switch. The one-row table that held the choice is dropped.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.dropTable('platform_settings');
};

export const down: Migration = async ({ context }) => {
  await context.createTable('platform_settings', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    text_channel: {
      type: DataTypes.ENUM('openai', 'modal'),
      allowNull: false,
      defaultValue: 'openai',
    },
    audio_channel: {
      type: DataTypes.ENUM('openai', 'modal'),
      allowNull: false,
      defaultValue: 'modal',
    },
    changed_by: { type: DataTypes.UUID, allowNull: true },
    changed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.sequelize.query(
    "INSERT INTO platform_settings (id, text_channel, audio_channel, created_at, updated_at) VALUES (UUID(), 'openai', 'modal', NOW(), NOW())",
  );
};
