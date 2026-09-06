/**
 * The interactive lecture: whether Sam runs the chapter's beats (the map,
 * your questions, from memory, your answers, the check) around each
 * chapter. Chosen per document and, when the learner asks for it, for
 * every document on the account. Null means not chosen: off.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('document_learning_state', 'lecture_interactive', {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  });
  await context.addColumn('learner_profiles', 'lecture_interactive', {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('learner_profiles', 'lecture_interactive');
  await context.removeColumn('document_learning_state', 'lecture_interactive');
};
