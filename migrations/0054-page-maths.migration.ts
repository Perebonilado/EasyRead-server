/**
 * Whether a page is maths: its text works a calculation, an equation or a
 * derivation. Found at extraction from the text layer, before anything
 * tidies it: a maths page is read again from its image, where the fraction
 * bars, powers and symbols a text layer loses are still there, and it is
 * simplified by a stronger model that keeps every step, checked by code.
 * Every page extracted before this is not marked, and is simplified as it
 * was; a document extracted again is marked.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('document_pages', 'has_maths', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('document_pages', 'has_maths');
};
