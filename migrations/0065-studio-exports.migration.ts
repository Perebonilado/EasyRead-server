/**
 * A Studio film made into a video file to post (infographic-editor-plan,
 * stage 9): one episode, or a whole show end to end with chapters, in one
 * shape, with or without captions burned in. A row is the request and how
 * far it has got, then where the file is kept and how big it is.
 * `film_hash` is what the video was made from (studio-export filmPrint): a
 * request for the same film is handed the video already made.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('studio_exports', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    show_id: { type: DataTypes.UUID, allowNull: false },
    episode_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    scope: { type: DataTypes.STRING(16), allowNull: false },
    shape: { type: DataTypes.STRING(8), allowNull: false },
    captions: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    status: { type: DataTypes.STRING(16), allowNull: false },
    progress: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    file_key: { type: DataTypes.STRING(512), allowNull: true },
    bytes: { type: DataTypes.BIGINT, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    film_hash: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('studio_exports', ['episode_id', 'created_at'], {
    name: 'studio_exports_episode',
  });
  await context.addIndex('studio_exports', ['show_id', 'scope', 'created_at'], {
    name: 'studio_exports_show',
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('studio_exports');
};
