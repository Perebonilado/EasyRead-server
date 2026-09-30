/**
 * The model each engine with more than one speaks with, as the admin
 * chose it, as JSON ({"elevenlabs":"eleven_v3"}): ElevenLabs' v4 or v3.
 * Null keeps each engine's own (ELEVENLABS_SCENE_MODEL, else v4).
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('app_settings', 'voice_models', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('app_settings', 'voice_models');
};
