/**
 * A document given to the Studio (studio-explainer-plan, Ask 7): an
 * ordinary documents row, read by the same pipeline, but the Studio's own
 * (`origin` 'studio'), so it never shows among the reader's documents.
 * A show remembers the document it was given, and an episode the pages
 * of it that it teaches. A document's chapters may now come from its own
 * bookmarks or headings, not only from a model's reading of it.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('documents', 'origin', {
    type: DataTypes.ENUM('reader', 'studio'),
    allowNull: false,
    defaultValue: 'reader',
  });
  await context.addIndex('documents', ['user_id', 'origin', 'created_at'], {
    name: 'documents_user_origin',
  });
  await context.addColumn('studio_shows', 'document_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  await context.addColumn('studio_episodes', 'pages', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await context.changeColumn('topics', 'source', {
    type: DataTypes.ENUM(
      'outline_pass',
      'page_tagging',
      'bookmarks',
      'headings',
    ),
    allowNull: false,
  });
};

export const down: Migration = async ({ context }) => {
  await context.changeColumn('topics', 'source', {
    type: DataTypes.ENUM('outline_pass', 'page_tagging'),
    allowNull: false,
  });
  await context.removeColumn('studio_episodes', 'pages');
  await context.removeColumn('studio_shows', 'document_id');
  await context.removeIndex('documents', 'documents_user_origin');
  await context.removeColumn('documents', 'origin');
};
