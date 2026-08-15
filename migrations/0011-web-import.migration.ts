/**
 * Import from the web: documentation fetched from a URL, typeset into a PDF,
 * and run through the normal pipeline.
 *
 * `source` gains `imported`; `source_url` records where the document came
 * from; `import_manifest` keeps the pages the reader chose (in the site's own
 * nav order) and, once typeset, the true chapter page ranges — which is what
 * lets the topics step use the docs' real structure instead of inferring one.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.changeColumn('documents', 'source', {
    type: DataTypes.ENUM('uploaded', 'generated', 'imported'),
    allowNull: false,
    defaultValue: 'uploaded',
  });
  await context.addColumn('documents', 'source_url', {
    type: DataTypes.STRING(2048),
    allowNull: true,
  });
  await context.addColumn('documents', 'import_manifest', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('documents', 'import_manifest');
  await context.removeColumn('documents', 'source_url');
  await context.changeColumn('documents', 'source', {
    type: DataTypes.ENUM('uploaded', 'generated'),
    allowNull: false,
    defaultValue: 'uploaded',
  });
};
