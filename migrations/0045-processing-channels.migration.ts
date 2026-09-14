/**
 * Where a school's processing runs, chosen on the admin page: text at
 * OpenAI or on our own model on Modal, audio likewise. One row, read by
 * the worker per job. Seeded to what the deployment does today: text at
 * OpenAI, the catalogue voice on Modal.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
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

export const down: Migration = async ({ context }) => {
  await context.dropTable('platform_settings');
};
