/**
 * No free document: a school's files are read on Pro, while the school is
 * free until a date, or with a pass. The two columns that remembered the
 * one free open go.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.removeColumn('school_passes', 'free_document_at');
  await context.removeColumn('school_passes', 'free_document_id');
};

export const down: Migration = async ({ context }) => {
  await context.addColumn('school_passes', 'free_document_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'documents', key: 'id' },
    onDelete: 'SET NULL',
  });
  await context.addColumn('school_passes', 'free_document_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
};
