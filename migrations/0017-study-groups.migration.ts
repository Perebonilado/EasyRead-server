/**
 * Study groups (classroom plan, P0).
 *
 * Groups are the social unit: an owner, up to six members, one shareable
 * invite code. Sessions are the live unit: the owner starts one on a
 * document (optionally scoped to a chapter) and members join mid-flight.
 * No friend graph, no requests — the invite code is the whole social model.
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

const timestamps = {
  created_at: { type: DataTypes.DATE, allowNull: false },
  updated_at: { type: DataTypes.DATE, allowNull: false },
};

export const up: Migration = async ({ context }) => {
  await context.createTable(
    'study_groups',
    {
      id,
      owner_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(80), allowNull: false },
      invite_code: { type: DataTypes.CHAR(8), allowNull: false, unique: true },
      ...timestamps,
    },
    TABLE_OPTS,
  );

  await context.createTable(
    'study_group_members',
    {
      id,
      group_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('study_groups'),
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
      },
      role: {
        type: DataTypes.ENUM('owner', 'member'),
        allowNull: false,
        defaultValue: 'member',
      },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('study_group_members', ['group_id', 'user_id'], {
    unique: true,
    name: 'study_group_members_group_user',
  });

  await context.createTable(
    'study_sessions',
    {
      id,
      group_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('study_groups'),
        onDelete: 'CASCADE',
      },
      host_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
      },
      document_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('documents'),
        onDelete: 'CASCADE',
      },
      topic_id: { type: DataTypes.UUID, allowNull: true },
      tutor_id: { type: DataTypes.STRING(40), allowNull: false },
      status: {
        type: DataTypes.ENUM('live', 'ended'),
        allowNull: false,
        defaultValue: 'live',
      },
      started_at: { type: DataTypes.DATE, allowNull: false },
      ended_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('study_sessions', ['group_id', 'status'], {
    name: 'study_sessions_group_status',
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('study_sessions');
  await context.dropTable('study_group_members');
  await context.dropTable('study_groups');
};
