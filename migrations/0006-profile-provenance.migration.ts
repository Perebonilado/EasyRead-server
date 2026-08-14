/**
 * Who set each profile dial, and a history of every change.
 *
 * Provenance is per dial, not per profile: a reader who pins their pace by
 * hand should still get automatic depth adaptation. `manual` is a promise —
 * the auto-adjust reflex is forbidden from touching a manual dial until the
 * reader releases it.
 *
 * `profile_changes` exists so adaptation is visible: every change carries a
 * plain-English reason, the tutor narrates unspoken ones once at the start of
 * the next lesson, and the settings screen shows the recent history.
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

const source = {
  type: DataTypes.ENUM('default', 'auto', 'manual'),
  allowNull: false,
  defaultValue: 'default',
};

export const up: Migration = async ({ context }) => {
  await context.addColumn('learner_profiles', 'pace_source', { ...source });
  await context.addColumn('learner_profiles', 'depth_source', { ...source });
  await context.addColumn('learner_profiles', 'interactivity_source', {
    ...source,
  });

  await context.createTable(
    'profile_changes',
    {
      id,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      field: {
        type: DataTypes.ENUM('pace', 'depth', 'interactivity', 'style_notes'),
        allowNull: false,
      },
      from_value: { type: DataTypes.STRING(300), allowNull: true },
      to_value: { type: DataTypes.STRING(300), allowNull: false },
      source: {
        type: DataTypes.ENUM('auto', 'tutor', 'manual'),
        allowNull: false,
      },
      // Human-readable: "3 of the last 5 answers were below half marks".
      reason: { type: DataTypes.STRING(300), allowNull: true },
      // Null until the tutor has mentioned it (or it was shown prominently);
      // narration happens once, then never again.
      narrated_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    TABLE_OPTS,
  );
  await context.addIndex('profile_changes', {
    name: 'idx_profile_changes_user_time',
    fields: ['user_id', 'created_at'],
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('profile_changes');
  await context.removeColumn('learner_profiles', 'interactivity_source');
  await context.removeColumn('learner_profiles', 'depth_source');
  await context.removeColumn('learner_profiles', 'pace_source');
};
