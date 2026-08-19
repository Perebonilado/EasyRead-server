/**
 * Starter documents (onboarding): every new account receives a snapshot copy
 * of one canonical walkthrough document. The copy is a real document in every
 * way; `source = 'starter'` only lets the library label it "Start here".
 */
import type { Migration } from './umzug';

export const up: Migration = async ({ context }) => {
  await context.sequelize.query(
    "ALTER TABLE documents MODIFY COLUMN source ENUM('uploaded','generated','imported','starter') NOT NULL DEFAULT 'uploaded'",
  );
};

export const down: Migration = async ({ context }) => {
  await context.sequelize.query(
    "UPDATE documents SET source = 'uploaded' WHERE source = 'starter'",
  );
  await context.sequelize.query(
    "ALTER TABLE documents MODIFY COLUMN source ENUM('uploaded','generated','imported') NOT NULL DEFAULT 'uploaded'",
  );
};
