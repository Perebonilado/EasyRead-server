/**
 * The editor's desk (infographic-editor-plan §3): an explainer show
 * planned as an editor plans a video keeps its working file on the show
 * (`editor`: the angles, the research, the plan of its episodes, the look
 * of its world), and each episode its own (`editorial`: the beat sheet,
 * the hooks, the two-column script, the fact check, the package). Both
 * JSON; null on every show and episode made before, which keep the path
 * they were made on.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('studio_shows', 'editor', {
    type: DataTypes.TEXT('medium'),
    allowNull: true,
  });
  await context.addColumn('studio_episodes', 'editorial', {
    type: DataTypes.TEXT('medium'),
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('studio_episodes', 'editorial');
  await context.removeColumn('studio_shows', 'editor');
};
