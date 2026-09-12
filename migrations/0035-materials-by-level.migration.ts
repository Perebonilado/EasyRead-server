/**
 * A school's files sit under a department and a level directly. A course
 * is an optional label on a file, not a step on the way to uploading it.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

const fk = (table: string) => ({ model: table, key: 'id' });

export const up: Migration = async ({ context }) => {
  await context.addColumn('documents', 'department_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: fk('departments'),
    onDelete: 'SET NULL',
  });
  await context.addColumn('documents', 'level_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: fk('levels'),
    onDelete: 'SET NULL',
  });
  await context.addIndex(
    'documents',
    ['institution_id', 'department_id', 'level_id'],
    {
      name: 'documents_placement',
    },
  );
  // Files placed through a course inherit its department and level.
  await context.sequelize.query(`
    UPDATE documents d
    JOIN courses c ON c.id = d.course_id
    SET d.department_id = c.department_id, d.level_id = c.level_id
    WHERE d.course_id IS NOT NULL
  `);
};

export const down: Migration = async ({ context }) => {
  await context.removeIndex('documents', 'documents_placement');
  await context.removeColumn('documents', 'level_id');
  await context.removeColumn('documents', 'department_id');
};
