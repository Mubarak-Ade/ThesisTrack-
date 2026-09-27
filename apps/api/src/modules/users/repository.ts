import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { users } from '../../schema/index.js';
import type { ListUsersFilters, ListUsersPage, UserRow } from './types.js';

/**
 * A repository function may run against the pool or inside a caller's
 * transaction — the optional executor (default: the shared pool) is how
 * multi-statement units stay atomic.
 */
export type InsertExecutor = Pick<typeof db, 'insert'>;

/** Fields PATCH /users/:userId may write (no email — identity field). */
export type UserPatch = Partial<
  Pick<typeof users.$inferInsert, 'firstName' | 'lastName' | 'role' | 'isActive' | 'registrationNumber'>
>;

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

/** Multi-row insert — used by the atomic bulk import. */
export async function insertUsers(
  values: (typeof users.$inferInsert)[],
  executor: InsertExecutor = db,
): Promise<UserRow[]> {
  return executor.insert(users).values(values).returning();
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

/** Partial profile/state update (PATCH). Only keys present are written. */
export async function updateUser(
  userId: string,
  values: Partial<typeof users.$inferInsert>,
): Promise<UserRow | undefined> {
  const [updated] = await db
    .update(users)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

/** `%`/`_`/`\` in the search term are matched literally, not as wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Filtered, paginated listing plus the total match count (for the UI). */
export async function listUsers(filters: ListUsersFilters): Promise<ListUsersPage> {
  const conditions: SQL[] = [];

  if (filters.role) {
    conditions.push(eq(users.role, filters.role));
  }
  if (filters.isActive !== undefined) {
    conditions.push(eq(users.isActive, filters.isActive));
  }
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    const match = or(
      ilike(users.firstName, pattern),
      ilike(users.lastName, pattern),
      ilike(users.email, pattern),
    );
    if (match) conditions.push(match);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, counted] = await Promise.all([
    db.query.users.findMany({
      where,
      orderBy: [desc(users.createdAt), desc(users.id)],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
    }),
    db.select({ total: sql<string>`count(*)` }).from(users).where(where),
  ]);

  return { rows, total: Number(counted[0]?.total ?? 0) };
}

/** Active administrators other than the given user (last-admin guard). */
export async function countOtherActiveAdministrators(userId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`count(*)` })
    .from(users)
    .where(
      and(
        eq(users.role, 'administrator'),
        eq(users.isActive, true),
        ne(users.id, userId),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** Which of the given (already lowercased) emails exist — bulk import pre-check. */
export async function findExistingEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) {
    return new Set();
  }
  const rows = await db.select({ email: users.email }).from(users).where(inArray(users.email, emails));
  return new Set(rows.map((row) => row.email));
}
