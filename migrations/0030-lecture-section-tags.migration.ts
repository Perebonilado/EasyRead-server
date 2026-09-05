/**
 * Author tags for the follow-along track: for each section of a page's
 * script, the sentences of the simplified note the writer says it
 * teaches, named as it wrote them. Advice to the matcher, never a gate on
 * the script; null for rows written before the writer was asked.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('lecture_segments', 'section_tags', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('lecture_segments', 'section_tags');
};
