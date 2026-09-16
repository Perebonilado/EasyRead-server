/**
 * The admin's batch and the published switch.
 *
 * A drop of files onto the admin page is one batch: every document in it
 * carries the same `upload_batch_id`, so the page can show the batch as a
 * row and voice or publish it whole. And nothing the admin uploads is seen
 * by a student until it is published: `published_at` null is hidden. Every
 * school document that exists today is marked published, so nothing that
 * students can see disappears when this lands.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.addColumn('documents', 'upload_batch_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });
  await context.addColumn('documents', 'published_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await context.addIndex('documents', ['institution_id', 'upload_batch_id'], {
    name: 'documents_institution_batch',
  });
  await context.sequelize.query(
    'UPDATE documents SET published_at = created_at WHERE institution_id IS NOT NULL AND published_at IS NULL',
  );
};

export const down: Migration = async ({ context }) => {
  await context.removeIndex('documents', 'documents_institution_batch');
  await context.removeColumn('documents', 'published_at');
  await context.removeColumn('documents', 'upload_batch_id');
};
