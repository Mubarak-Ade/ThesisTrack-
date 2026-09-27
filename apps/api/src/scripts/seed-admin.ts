import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { users } from '../schema/index.js';
import { hashPassword } from '../modules/auth/service.js';

/**
 * Creates (or repairs) the initial administrator account — the bootstrap
 * identity that provisions everyone else, since there is no public
 * registration.
 *
 *   ADMIN_EMAIL=a@b.c ADMIN_PASSWORD=secret pnpm seed:admin
 *
 * Without ADMIN_PASSWORD a random password is generated and printed once.
 */
async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@thesistrack.local').trim().toLowerCase();
  const firstName = process.env.ADMIN_FIRST_NAME ?? 'Site';
  const lastName = process.env.ADMIN_LAST_NAME ?? 'Administrator';
  const providedPassword = process.env.ADMIN_PASSWORD;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });

  if (existing) {
    const activate = !existing.isActive;
    const needsPassword = Boolean(providedPassword) || (activate && !existing.passwordHash);
    const password = providedPassword ?? randomBytes(12).toString('base64url');

    const updates: Partial<typeof users.$inferInsert> = {
      role: 'administrator',
      updatedAt: new Date(),
    };
    if (needsPassword) {
      updates.passwordHash = await hashPassword(password);
    }
    if (activate) {
      updates.isActive = true;
    }

    await db.update(users).set(updates).where(eq(users.id, existing.id));

    console.log(`Administrator updated: ${email}`);
    if (needsPassword && !providedPassword) {
      console.log(`Password: ${password} (generated — store it now, it will not be shown again)`);
    } else if (providedPassword) {
      console.log('Password reset to the provided ADMIN_PASSWORD.');
    } else {
      console.log('Existing password kept (set ADMIN_PASSWORD to change it).');
    }
    return;
  }

  const password = providedPassword ?? randomBytes(12).toString('base64url');

  await db.insert(users).values({
    email,
    firstName,
    lastName,
    role: 'administrator',
    passwordHash: await hashPassword(password),
    isActive: true,
  });

  console.log(`Administrator created: ${email}`);
  console.log(`Password: ${password}`);
  if (!providedPassword) {
    console.log('(generated — store it now, it will not be shown again)');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
