/**
 * What the critic's loop did to a scene of shots (explainer-animation-plan
 * §9.3; WP13): each round's stills sheet (its storage key), what the code
 * checks measured, the critic's scores and verdict, the fixes it asked
 * for and what they came to, and what it cost; how the loop ended, and the
 * last scores. JSON on the scene's row, replaced each time the scene is
 * made; null for a scene the loop has not looked at.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('studio_scenes', 'frames', {
    type: DataTypes.TEXT('medium'),
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('studio_scenes', 'frames');
};
