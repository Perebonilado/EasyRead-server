/**
 * The Studio: animated episodes made from a conversation, kept apart from
 * the library. A show holds its brief and its bible (the cast and the
 * places, the same in every episode); an episode its outline and where it
 * has got to; a scene its sheet, checked before anything is drawn, and
 * the files it was made into; and the conversation with the producer,
 * message by message. Sheets and outlines are JSON in medium text: a
 * scene's sheet runs to a few kilobytes, a show's bible to more.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('studio_shows', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    format: { type: DataTypes.STRING(16), allowNull: true },
    brief: { type: DataTypes.TEXT('medium'), allowNull: false },
    bible: { type: DataTypes.TEXT('medium'), allowNull: true },
    deleted_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('studio_shows', ['user_id', 'updated_at'], {
    name: 'studio_shows_user',
  });

  await context.createTable('studio_episodes', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    show_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    number: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    logline: { type: DataTypes.TEXT, allowNull: true },
    phase: { type: DataTypes.STRING(16), allowNull: false },
    busy: { type: DataTypes.STRING(24), allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    outline: { type: DataTypes.TEXT('medium'), allowNull: true },
    share_token: { type: DataTypes.STRING(40), allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    thumb_key: { type: DataTypes.STRING(512), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('studio_episodes', ['show_id', 'number'], {
    name: 'studio_episodes_show',
  });
  await context.addIndex('studio_episodes', ['share_token'], {
    name: 'studio_episodes_share',
    unique: true,
  });

  await context.createTable('studio_scenes', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    episode_id: { type: DataTypes.UUID, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false },
    sheet: { type: DataTypes.TEXT('medium'), allowNull: true },
    sheet_hash: { type: DataTypes.STRING(32), allowNull: true },
    problems: { type: DataTypes.TEXT, allowNull: true },
    previous_sheet: { type: DataTypes.TEXT('medium'), allowNull: true },
    status: { type: DataTypes.STRING(16), allowNull: false },
    step: { type: DataTypes.STRING(16), allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    scene_key: { type: DataTypes.STRING(512), allowNull: true },
    audio_key: { type: DataTypes.STRING(512), allowNull: true },
    thumb_key: { type: DataTypes.STRING(512), allowNull: true },
    made_hash: { type: DataTypes.STRING(32), allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('studio_scenes', ['episode_id', 'position'], {
    name: 'studio_scenes_episode',
  });

  await context.createTable('studio_messages', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    show_id: { type: DataTypes.UUID, allowNull: false },
    episode_id: { type: DataTypes.UUID, allowNull: true },
    role: { type: DataTypes.STRING(16), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    meta: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('studio_messages', ['show_id', 'created_at'], {
    name: 'studio_messages_show',
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('studio_messages');
  await context.dropTable('studio_scenes');
  await context.dropTable('studio_episodes');
  await context.dropTable('studio_shows');
};
