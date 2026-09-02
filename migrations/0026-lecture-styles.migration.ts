/**
 * Lecture styles: the same lecture taught three ways.
 *
 * A style is a way of teaching (gentle, steady, brisk). The plan of a
 * chapter is shared by every style, so it stays where it is; the pages are
 * written per style, so a segment now belongs to a page AND a style. Rows
 * written before styles existed are the steady style, which is what they
 * were. Move offsets mark where each idea of a page begins in its script,
 * which is how a learner switching style lands on the same idea.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('lecture_segments', 'style', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'steady',
  });
  await context.addColumn('lecture_segments', 'move_offsets', {
    type: DataTypes.JSON,
    allowNull: true,
  });
  await context.removeIndex(
    'lecture_segments',
    'lecture_segments_doc_page_version',
  );
  // One segment per page per version PER STYLE.
  await context.addIndex('lecture_segments', {
    fields: ['document_id', 'page_number', 'content_version', 'style'],
    unique: true,
    name: 'lecture_segments_doc_page_version_style',
  });

  await context.addColumn('lecture_positions', 'style', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'steady',
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('lecture_positions', 'style');
  await context.removeIndex(
    'lecture_segments',
    'lecture_segments_doc_page_version_style',
  );
  // Keep only the steady rows, which the old unique index can hold.
  await context.sequelize.query(
    "DELETE FROM lecture_segments WHERE style <> 'steady'",
  );
  await context.addIndex('lecture_segments', {
    fields: ['document_id', 'page_number', 'content_version'],
    unique: true,
    name: 'lecture_segments_doc_page_version',
  });
  await context.removeColumn('lecture_segments', 'move_offsets');
  await context.removeColumn('lecture_segments', 'style');
};
