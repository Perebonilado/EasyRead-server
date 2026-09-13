/**
 * Richard's account runs the schools: an admin wherever this runs. A no-op
 * on a database the account has not signed up on yet, and umzug records it
 * as applied either way, so on such a database sign up first, or set the
 * role by hand afterwards.
 */
import type { Migration } from './umzug';

const EMAIL = 'perebonilado@gmail.com';

export const up: Migration = async ({ context }) => {
  await context.sequelize.query(
    "UPDATE users SET role = 'admin', updated_at = NOW() WHERE LOWER(email) = :email AND deleted_at IS NULL",
    { replacements: { email: EMAIL } },
  );
};

export const down: Migration = async ({ context }) => {
  await context.sequelize.query(
    "UPDATE users SET role = 'learner', updated_at = NOW() WHERE LOWER(email) = :email",
    { replacements: { email: EMAIL } },
  );
};
