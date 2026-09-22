import { eq } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { users } from '../../schema/index.js';
import type { UserRow } from './types.js';

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export async function insertUser(
  values: typeof users.$inferInsert,
): Promise<UserRow> {
  const [created] = await db.insert(users).values(values).returning();
  return created;
}

/**
 * Sets the password hash (and, for activation, flips the account to ACTIVE).
 * Used by the auth module's activation and password-reset flows.
 */
export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  options: { activate?: boolean } = {},
): Promise<UserRow | undefined> {
  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      ...(options.activate ? { isActive: true } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}
