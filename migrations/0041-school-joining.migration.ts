/**
 * Joining a school from the dashboard. A school may ask for a school
 * email and a code sent to it (`verify_students`); a member who proved one
 * keeps it on the membership; and the codes themselves live in a table of
 * their own, hashed, short-lived and counted.
 */
import { DataTypes, type ModelAttributeColumnOptions } from 'sequelize';
import type { Migration } from './umzug';

const id: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  primaryKey: true,
  allowNull: false,
};

export const up: Migration = async ({ context }) => {
  await context.addColumn('institutions', 'verify_students', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
  await context.addColumn('institution_members', 'school_email', {
    type: DataTypes.STRING(320),
    allowNull: true,
  });
  await context.addColumn('institution_members', 'verified_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await context.createTable('institution_join_codes', {
    id,
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    institution_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'institutions', key: 'id' },
      onDelete: 'CASCADE',
    },
    email: { type: DataTypes.STRING(320), allowNull: false },
    code_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    consumed_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('institution_join_codes', [
    'user_id',
    'institution_id',
    'created_at',
  ]);
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('institution_join_codes');
  await context.removeColumn('institution_members', 'verified_at');
  await context.removeColumn('institution_members', 'school_email');
  await context.removeColumn('institutions', 'verify_students');
};
