/**
 * Documents the model wrote.
 *
 * A generated document is a document in every other respect — it is rendered
 * to a real PDF and pushed through the same convert/extract/simplify pipeline
 * as an upload, so everything downstream (reader, topics, chat, lessons)
 * works on it untouched. Only two columns distinguish it: where it came from,
 * and what was asked for.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('documents', 'source', {
    type: DataTypes.ENUM('uploaded', 'generated'),
    allowNull: false,
    defaultValue: 'uploaded',
  });

  // The interview answers that produced it: kept so the reader can see what
  // they asked for, and so a regeneration has the same brief to work from.
  await context.addColumn('documents', 'brief', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('documents', 'brief');
  await context.removeColumn('documents', 'source');
};
