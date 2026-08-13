/**
 * Umzug migration runner.
 *
 * Written in TypeScript but compiled to plain JS by `nest build` (root-level
 * `migrations/` is included in the build, so this lands at
 * `dist/migrations/umzug.js`). Production runs the COMPILED JS with `node` —
 * no ts-node at runtime, so it survives `npm ci --omit=dev`. For local use
 * without a build, `npm run migrate:dev` runs this source directly via ts-node.
 *
 *   npm run migrate          # apply all pending migrations (compiled, prod)
 *   npm run migrate:dev      # same, from TS source via ts-node (local)
 *   npm run migrate:undo     # undo the most recent migration
 *   npm run migrate:status   # list migrations not yet applied
 *
 * Umzug records every applied migration in `SequelizeMeta`, so running `up`
 * repeatedly is a no-op once everything is applied — which is what makes it
 * safe to run on every deploy.
 */
import 'dotenv/config';
import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — cannot run migrations.');
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql',
  logging: false,
  define: { underscored: true, charset: 'utf8mb4' },
});

export const migrator = new Umzug({
  // `*.migration.{js,ts}` matches compiled JS in prod and TS source in dev,
  // while never matching this runner (umzug.ts) itself.
  migrations: { glob: ['*.migration.{js,ts}', { cwd: __dirname }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

// Import this in migration files to type the `context` argument.
export type Migration = typeof migrator._types.migration;

if (require.main === module) {
  migrator.runAsCLI();
}
