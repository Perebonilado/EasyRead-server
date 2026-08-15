/**
 * Page assets: figures that belong to a page but travel beside the text.
 *
 * The simplify model never sees an image — it rewrites text. Figures ride in
 * their own table, keyed by (document, page), and every reading surface that
 * shows a page's simplified text also shows its figures. `content_version`
 * scopes them the same way the pipeline scopes everything else: a rewrite
 * orphans the old version's rows rather than mixing figures across versions.
 */
import { DataTypes, type ModelAttributeColumnOptions } from 'sequelize';
import type { Migration } from './umzug';

const TABLE_OPTS = { charset: 'utf8mb4' };
const fk = (table: string) => ({ model: table, key: 'id' });

const id: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
};

export const up: Migration = async ({ context }) => {
  await context.createTable(
    'page_assets',
    {
      id,
      document_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('documents'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      content_version: { type: DataTypes.INTEGER, allowNull: false },
      page_number: { type: DataTypes.INTEGER, allowNull: false },
      kind: {
        type: DataTypes.ENUM('figure'),
        allowNull: false,
        defaultValue: 'figure',
      },
      file_ref: { type: DataTypes.STRING(512), allowNull: false },
      mime_type: { type: DataTypes.STRING(64), allowNull: false },
      width: { type: DataTypes.INTEGER, allowNull: false },
      height: { type: DataTypes.INTEGER, allowNull: false },
      /** Alt text or figure caption, when the source had one. */
      caption: { type: DataTypes.TEXT, allowNull: true },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    TABLE_OPTS,
  );

  await context.addIndex('page_assets', {
    name: 'idx_page_assets_document',
    fields: ['document_id', 'content_version', 'page_number', 'order_index'],
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('page_assets');
};
