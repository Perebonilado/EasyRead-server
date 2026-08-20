/**
 * The group's session plan persists on the group (owner feedback: the
 * picked document kept reverting). Null document means the owner has not
 * chosen yet — nothing is preselected for them.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('study_groups', 'planned_document_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  await context.addColumn('study_groups', 'planned_topic_ids', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await context.addColumn('study_groups', 'planned_tutor_id', {
    type: DataTypes.STRING(40),
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('study_groups', 'planned_document_id');
  await context.removeColumn('study_groups', 'planned_topic_ids');
  await context.removeColumn('study_groups', 'planned_tutor_id');
};
