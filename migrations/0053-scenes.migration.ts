/**
 * Visuals rebuilt: a page is an animated video drawn for it, not cards
 * from a library. A scene lives in the bucket beside its audio and still,
 * so the row keeps their keys and how the words were timed, and drops the
 * timeline. The chapter plans and the library's terms go with the
 * pipeline that used them. Every page made by the old generator is
 * deleted; its files are left as orphans, harmless and regenerable.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.sequelize.query('DELETE FROM visual_scenes');
  await context.removeColumn('visual_scenes', 'timeline');
  await context.addColumn('visual_scenes', 'scene_key', {
    type: DataTypes.STRING(512),
    allowNull: true,
  });
  await context.addColumn('visual_scenes', 'thumb_key', {
    type: DataTypes.STRING(512),
    allowNull: true,
  });
  await context.addColumn('visual_scenes', 'timing', {
    type: DataTypes.STRING(16),
    allowNull: true,
  });
  await context.dropTable('visual_plans');
  await context.dropTable('visual_terms');
};

export const down: Migration = async ({ context }) => {
  await context.createTable('visual_terms', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    term: { type: DataTypes.STRING(120), allowNull: false },
    drawing: { type: DataTypes.STRING(64), allowNull: true },
    found_by: {
      type: DataTypes.ENUM('spelling', 'meaning', 'hand'),
      allowNull: false,
      defaultValue: 'spelling',
    },
    times: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
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
  await context.createTable('visual_plans', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    document_id: { type: DataTypes.UUID, allowNull: false },
    topic_id: { type: DataTypes.UUID, allowNull: false },
    content_version: { type: DataTypes.INTEGER, allowNull: false },
    generator_version: { type: DataTypes.STRING(32), allowNull: false },
    plan: { type: DataTypes.JSON, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex(
    'visual_plans',
    ['document_id', 'content_version', 'topic_id', 'generator_version'],
    { name: 'visual_plans_key', unique: true },
  );
  await context.sequelize.query('DELETE FROM visual_scenes');
  await context.removeColumn('visual_scenes', 'timing');
  await context.removeColumn('visual_scenes', 'thumb_key');
  await context.removeColumn('visual_scenes', 'scene_key');
  await context.addColumn('visual_scenes', 'timeline', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};
