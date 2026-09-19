/**
 * What the pages asked to be drawn, and what was found for it. A row a
 * drawing was found for is the answer kept, so the same word looks the
 * same everywhere and a bad match has one place to be put right by
 * hand. A row with no drawing is a miss, and the misses, counted, are
 * the order in which the library should be drawn out: nobody reads the
 * warnings, so nobody has known what it is short of.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('visual_terms', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    /** The page's own words for the thing, lower case. */
    term: { type: DataTypes.STRING(120), allowNull: false },
    /** The drawing found for it, or null when nothing draws it. */
    drawing: { type: DataTypes.STRING(64), allowNull: true },
    /** How it was found: spelling, meaning, or set by hand, which wins over both. */
    found_by: {
      type: DataTypes.ENUM('spelling', 'meaning', 'hand'),
      allowNull: false,
      defaultValue: 'spelling',
    },
    /** How many pages have asked for it, so the misses can be ranked by real demand. */
    times: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    /** The last page that asked, to find an example of it. */
    document_id: { type: DataTypes.UUID, allowNull: true },
    page_number: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('visual_terms', ['term'], {
    name: 'visual_terms_term',
    unique: true,
  });
  await context.addIndex('visual_terms', ['drawing', 'times'], {
    name: 'visual_terms_missing',
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('visual_terms');
};
