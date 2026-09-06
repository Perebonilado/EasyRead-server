/**
 * How the learner learns, chosen per document and, when they ask for it,
 * for every document on the account. Null means not chosen yet: the
 * lecture bar asks once.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('document_learning_state', 'lecture_style', {
    type: DataTypes.STRING(16),
    allowNull: true,
  });
  await context.addColumn('learner_profiles', 'lecture_style', {
    type: DataTypes.STRING(16),
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('learner_profiles', 'lecture_style');
  await context.removeColumn('document_learning_state', 'lecture_style');
};
