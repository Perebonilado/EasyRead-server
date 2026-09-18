/**
 * The shared library of pictures drawn anew: a thing the library had no
 * drawing for, drawn once by an image model in the stage's style and
 * kept for every page and document after, by its plain name.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('visual_pictures', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    name_key: { type: DataTypes.STRING(80), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    storage_key: { type: DataTypes.STRING(255), allowNull: false },
    width: { type: DataTypes.INTEGER, allowNull: false },
    height: { type: DataTypes.INTEGER, allowNull: false },
    judged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    model: { type: DataTypes.STRING(80), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await context.addIndex('visual_pictures', ['name_key'], {
    name: 'visual_pictures_name',
    unique: true,
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('visual_pictures');
};
