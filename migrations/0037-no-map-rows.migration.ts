/**
 * The map, a chapter's shape spoken before its first page, is no longer
 * written or played. Rows of that kind from lectures already written are
 * removed so they are not counted, voiced again or served; their audio
 * files are left where they are.
 */
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.bulkDelete('lecture_segments', { kind: 'map' });
};

export const down: Migration = async () => {
  // The rows are gone with their words; there is nothing to put back.
};
