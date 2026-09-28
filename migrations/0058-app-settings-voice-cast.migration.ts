/**
 * The admin's voices for Visualize, beside its engine: the narrator's and
 * each kind of character's (a girl, an old man, a creature…), by engine,
 * as JSON. ElevenLabs first, whose account has a list of voices to choose
 * from; null keeps each engine's own palette, as before.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('app_settings', 'voice_cast', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('app_settings', 'voice_cast');
};
