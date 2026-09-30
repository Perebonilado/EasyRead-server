/**
 * Each voice's own rate, measured once (npm run voice:calibrate): words a
 * minute at speed 1 and, for Gemini, in each of its pace words, by engine
 * and voice, as JSON. The pace step asks a voice for a scene's target by
 * it; null keeps each engine's own guess (scene-pace DEFAULT_RATES).
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('app_settings', 'voice_rates', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('app_settings', 'voice_rates');
};
