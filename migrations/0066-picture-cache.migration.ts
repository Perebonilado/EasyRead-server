/**
 * The picture desk's cache (explainer-animation-plan §6.3, research §3.4):
 * every archive photo or portrait the desk has looked at, once. A file
 * that cleared the licence and provenance checks keeps its copy in our
 * storage (by its sha1, so the same picture is stored once however many
 * films show it), its credit, its chip and its focal box; a file that was
 * refused keeps why, so it is never fetched and judged again. A row whose
 * source is 'lookup' is a question the desk answered (a person by name and
 * facts, a place in its years): which picture it picked, or none and why.
 */
import { DataTypes } from 'sequelize';
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.createTable('picture_cache', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    /** Wikidata's id for who or what it shows, when known. */
    qid: { type: DataTypes.STRING(32), allowNull: true },
    /** 'commons', 'nasa', 'met', or 'lookup' for a question answered. */
    source: { type: DataTypes.STRING(16), allowNull: false },
    /** The file's own name at its source (a Commons title, a NASA id, a Met object), or the question's key. */
    source_id: { type: DataTypes.STRING(512), allowNull: false },
    /** What it shows: 'person', 'place', 'object', 'event' or 'document'. */
    kind: { type: DataTypes.STRING(16), allowNull: true },
    /** Who or what it shows, in words. */
    subject: { type: DataTypes.STRING(255), allowNull: true },
    /** The file as its source serves it. */
    url: { type: DataTypes.STRING(1024), allowNull: true },
    /** The file's page at its source, for the credit. */
    source_url: { type: DataTypes.STRING(1024), allowNull: true },
    licence: { type: DataTypes.STRING(64), allowNull: true },
    /** The full credit (title, author, source, licence), for the description. */
    credit: { type: DataTypes.TEXT, allowNull: true },
    /** The words on screen: "<subject> · <source> · <licence>". */
    chip: { type: DataTypes.STRING(255), allowNull: true },
    /** Our copy's size in pixels. */
    width: { type: DataTypes.INTEGER, allowNull: true },
    height: { type: DataTypes.INTEGER, allowNull: true },
    /** The subject's box in our copy's pixels, as JSON [x, y, w, h]. */
    focal: { type: DataTypes.STRING(128), allowNull: true },
    sha1: { type: DataTypes.STRING(40), allowNull: true },
    mime: { type: DataTypes.STRING(64), allowNull: true },
    storage_key: { type: DataTypes.STRING(512), allowNull: true },
    /** Its depth map (8-bit, white near), stored beside it; null when there is none. */
    depth_key: { type: DataTypes.STRING(512), allowNull: true },
    /** What the checks read and found (the licence snapshot, dates, flags, the lookup's answer), as JSON. */
    meta: { type: DataTypes.TEXT('medium'), allowNull: true },
    checked_at: { type: DataTypes.DATE, allowNull: false },
    /** Why the desk will not use it; null for a picture it cleared. */
    refused_reason: { type: DataTypes.STRING(512), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  // Commons titles run long; the index takes their first 191 characters,
  // the most a utf8mb4 key part may hold.
  await context.sequelize.query(
    'CREATE UNIQUE INDEX picture_cache_source ON picture_cache (source, source_id(191))',
  );
  await context.addIndex('picture_cache', ['qid'], {
    name: 'picture_cache_qid',
  });
  await context.addIndex('picture_cache', ['sha1'], {
    name: 'picture_cache_sha1',
  });
};

export const down: Migration = async ({ context }) => {
  await context.dropTable('picture_cache');
};
