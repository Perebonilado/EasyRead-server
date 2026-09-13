/**
 * Institutions: a school, its departments, levels and courses, the students
 * who belong to it, and the documents it shares with them.
 *
 * A shared document is one row in `documents` with an institution on it;
 * everything a student does with it is already keyed by user and document
 * in the tables that hold it. The platform role on `users` is what lets an
 * admin create all of this.
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
  await context.addColumn('users', 'role', {
    type: DataTypes.ENUM('learner', 'admin'),
    allowNull: false,
    defaultValue: 'learner',
  });

  await context.createTable(
    'institutions',
    {
      id,
      name: { type: DataTypes.STRING(200), allowNull: false },
      /** The school's address: easiread.com/<slug>. */
      slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      country: { type: DataTypes.STRING(2), allowNull: true },
      /** Email domains that admit a member on sign-up; empty means none. */
      email_domains: { type: DataTypes.JSON, allowNull: false },
      /** A short code that admits a member; null means none is needed. */
      invite_code: { type: DataTypes.STRING(16), allowNull: true },
      /** What the school calls a level: "Year", "Level", "Semester". */
      level_word: { type: DataTypes.STRING(40), allowNull: false },
      ...timestamps,
    },
    TABLE_OPTS,
  );

  await context.createTable(
    'departments',
    {
      id,
      institution_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('institutions'),
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(200), allowNull: false },
      slug: { type: DataTypes.STRING(80), allowNull: false },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('departments', ['institution_id', 'slug'], {
    unique: true,
    name: 'departments_institution_slug',
  });

  await context.createTable(
    'levels',
    {
      id,
      institution_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('institutions'),
        onDelete: 'CASCADE',
      },
      name: { type: DataTypes.STRING(80), allowNull: false },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('levels', ['institution_id', 'order_index'], {
    name: 'levels_institution_order',
  });

  await context.createTable(
    'courses',
    {
      id,
      department_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('departments'),
        onDelete: 'CASCADE',
      },
      level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('levels'),
        onDelete: 'SET NULL',
      },
      name: { type: DataTypes.STRING(200), allowNull: false },
      code: { type: DataTypes.STRING(40), allowNull: true },
      order_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  await context.addIndex('courses', ['department_id', 'level_id'], {
    name: 'courses_department_level',
  });

  await context.createTable(
    'institution_members',
    {
      id,
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('users'),
        onDelete: 'CASCADE',
      },
      institution_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: fk('institutions'),
        onDelete: 'CASCADE',
      },
      department_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('departments'),
        onDelete: 'SET NULL',
      },
      level_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: fk('levels'),
        onDelete: 'SET NULL',
      },
      role: {
        type: DataTypes.ENUM('student', 'staff', 'admin'),
        allowNull: false,
        defaultValue: 'student',
      },
      ...timestamps,
    },
    TABLE_OPTS,
  );
  // One institution per user, for now: the unique index says so.
  await context.addIndex('institution_members', ['user_id'], {
    unique: true,
    name: 'institution_members_user',
  });
  await context.addIndex('institution_members', ['institution_id'], {
    name: 'institution_members_institution',
  });

  await context.addColumn('documents', 'institution_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: fk('institutions'),
    onDelete: 'SET NULL',
  });
  await context.addColumn('documents', 'course_id', {
    type: DataTypes.UUID,
    allowNull: true,
    references: fk('courses'),
    onDelete: 'SET NULL',
  });
  /** SHA-256 of the uploaded bytes, so the same file is never processed twice for a school. */
  await context.addColumn('documents', 'content_hash', {
    type: DataTypes.CHAR(64),
    allowNull: true,
  });
  await context.addColumn('documents', 'order_index', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await context.addIndex('documents', ['institution_id', 'content_hash'], {
    name: 'documents_institution_hash',
  });
  await context.addIndex('documents', ['course_id', 'order_index'], {
    name: 'documents_course_order',
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeIndex('documents', 'documents_course_order');
  await context.removeIndex('documents', 'documents_institution_hash');
  await context.removeColumn('documents', 'order_index');
  await context.removeColumn('documents', 'content_hash');
  await context.removeColumn('documents', 'course_id');
  await context.removeColumn('documents', 'institution_id');
  await context.dropTable('institution_members');
  await context.dropTable('courses');
  await context.dropTable('levels');
  await context.dropTable('departments');
  await context.dropTable('institutions');
  await context.removeColumn('users', 'role');
};
