/**
 * Visuals by page: a scene is one page of a document as a short tutorial,
 * keyed by page rather than chapter, and prepared ahead of the learner
 * the way the lecture is. The chapter's plan (goal, key terms, beats) is
 * kept once per chapter so every page's tutorial knows where it sits.
 * The scenes made by chapter are dropped; pages are made afresh.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.sequelize.query('DELETE FROM visual_scenes');
  await context.addColumn('visual_scenes', 'page_number', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await context.removeIndex('visual_scenes', 'visual_scenes_key');
  await context.addIndex(
    'visual_scenes',
    ['document_id', 'content_version', 'page_number', 'generator_version'],
    { name: 'visual_scenes_page_key', unique: true },
  );
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
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('visual_plans');
  await context.sequelize.query('DELETE FROM visual_scenes');
  await context.removeIndex('visual_scenes', 'visual_scenes_page_key');
  await context.removeColumn('visual_scenes', 'page_number');
  await context.addIndex(
    'visual_scenes',
    ['document_id', 'content_version', 'topic_id', 'generator_version'],
    { name: 'visual_scenes_key', unique: true },
  );
};
