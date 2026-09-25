/**
 * What the admin switches while the app runs, without a redeploy: one row.
 * First, Visualize's voice: Gemini, our own Kokoro server, or OpenAI; null
 * leaves it to SCENE_VOICE_ENGINE, as before there was a choice. A new
 * table, not platform_settings again: 0047 dropped that one, and its down
 * still makes it.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('app_settings', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    scene_voice: { type: DataTypes.STRING(16), allowNull: true },
    changed_by: { type: DataTypes.UUID, allowNull: true },
    changed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('app_settings');
};
