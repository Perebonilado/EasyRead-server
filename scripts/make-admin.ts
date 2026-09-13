/**
 * Makes an account an admin, by email, in whatever database DATABASE_URL
 * names. Safe to run twice: the second run says the account already is one.
 * The role is read from the database on every request, so it takes effect
 * at once, with no sign-out.
 *
 *   npm run make-admin -- someone@example.com       # compiled, production
 *   npm run make-admin:dev -- someone@example.com   # from source, locally
 */
import 'dotenv/config';
import { QueryTypes, Sequelize } from 'sequelize';

interface Row {
  id: string;
  role: string;
  deleted_at: Date | null;
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Usage: npm run make-admin -- someone@example.com');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: false,
  });
  try {
    const rows = await sequelize.query<Row>(
      'SELECT id, role, deleted_at FROM users WHERE LOWER(email) = :email',
      { replacements: { email }, type: QueryTypes.SELECT },
    );
    const user = rows[0];
    if (!user) {
      console.error(
        `No account has the email ${email}. Sign up first, then run this again.`,
      );
      process.exit(1);
    }
    if (user.deleted_at) {
      console.error(`The account ${email} is deleted.`);
      process.exit(1);
    }
    if (user.role === 'admin') {
      console.log(`${email} is already an admin.`);
      return;
    }
    await sequelize.query(
      'UPDATE users SET role = :role, updated_at = NOW() WHERE id = :id',
      { replacements: { role: 'admin', id: user.id }, type: QueryTypes.UPDATE },
    );
    console.log(`${email} is now an admin.`);
  } finally {
    await sequelize.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
