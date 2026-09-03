/**
 * Lecture segment kinds: the short segments around a chapter.
 *
 * A row was one page of one style. It is now one page of one style of one
 * KIND: the page itself, the words a slow learner hears before the chapter
 * (terms), the check of what stuck after it (check), or the review a
 * returning learner hears before carrying on (review). Extras share their
 * page's number, which keeps play order and the player's page mapping
 * exactly as they were. Every row written before kinds existed is a page.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('lecture_segments', 'kind', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'page',
  });
  await context.removeIndex(
    'lecture_segments',
    'lecture_segments_doc_page_version_style',
  );
  // One segment per page per version per style PER KIND.
  await context.addIndex('lecture_segments', {
    fields: ['document_id', 'page_number', 'content_version', 'style', 'kind'],
    unique: true,
    name: 'lecture_segments_doc_page_version_style_kind',
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeIndex(
    'lecture_segments',
    'lecture_segments_doc_page_version_style_kind',
  );
  // Keep only the pages, which the old unique index can hold.
  await context.sequelize.query(
    "DELETE FROM lecture_segments WHERE kind <> 'page'",
  );
  await context.addIndex('lecture_segments', {
    fields: ['document_id', 'page_number', 'content_version', 'style'],
    unique: true,
    name: 'lecture_segments_doc_page_version_style',
  });
  await context.removeColumn('lecture_segments', 'kind');
};
