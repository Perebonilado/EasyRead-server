/**
 * Session recaps: what one sitting with a document actually covered.
 *
 * Stored rather than regenerated, for two reasons. A recap is evidence —
 * "this is what you did on Tuesday" — and re-deriving it later from a moved
 * reading position would quietly rewrite that history. And it costs a model
 * call, so re-opening one should be free.
 *
 * The window is kept alongside the text (`from_page`, `to_page`, `since`) so
 * a recap can say what it looked at, and so a later recap can start where the
 * last one ended.
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
    'session_recaps',
    {
      id,
      document_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('documents'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      from_page: { type: DataTypes.INTEGER, allowNull: false },
      to_page: { type: DataTypes.INTEGER, allowNull: false },
      /** Start of the window this recap describes. */
      since: { type: DataTypes.DATE(6), allowNull: true },
      /**
       * The recap itself: what was covered, the terms that carried it, what
       * looked shaky, and one thing to do next. JSON rather than columns —
       * it is written once, read whole, and never queried into.
       */
      body: { type: DataTypes.JSON, allowNull: false },
      created_at: { type: DataTypes.DATE(6), allowNull: false },
      updated_at: { type: DataTypes.DATE(6), allowNull: false },
    },
    TABLE_OPTS,
  );

  await context.addIndex('session_recaps', {
    name: 'idx_recaps_document',
    fields: ['document_id', 'user_id', 'created_at'],
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('session_recaps');
};
