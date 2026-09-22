import { eq } from 'drizzle-orm';
import { db } from '../config/db.js';
import { ConflictError, NotFoundError } from '../errors/index.js';
import { Role } from '../lib/roles.js';
import { users } from '../schema/index.js';
import { consumeAccountToken, issueAccountToken } from './account-tokens.js';
import { hashPassword } from './password.js';
import { revokeAllSessions } from './sessions.js';

export type UserRow = typeof users.$inferSelect;

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

/** The only user shape that ever leaves the API — never exposes passwordHash. */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role as Role,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export interface ProvisionInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

export interface ProvisionedAccount {
  user: UserRow;
  activationToken: string;
  activationExpiresAt: Date;
  reinvited: boolean;
}

/**
 * Account provisioning (there is no public self-registration):
 *
 *   admin creates user → INVITED → invitation token → user activates → ACTIVE
 *
 * An existing-but-inactive account is re-invited (fresh token); an active
 * account with the same email is a conflict.
 */
export async function provisionUser(input: ProvisionInput): Promise<ProvisionedAccount> {
  const existing = await findUserByEmail(input.email);

  if (existing?.isActive) {
    throw new ConflictError('An account with this email already exists');
  }

  let user: UserRow;
  let reinvited = false;

  if (existing) {
    reinvited = true;
    user = existing;
  } else {
    const [created] = await db
      .insert(users)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        role: input.role,
        passwordHash: null, // set during activation
        isActive: false, // INVITED
      })
      .returning();
    user = created;
  }

  const { token, expiresAt } = await issueAccountToken(user.id, 'activation');

  return { user, activationToken: token, activationExpiresAt: expiresAt, reinvited };
}

/** INVITED → ACTIVE: consumes the activation token and sets the password. */
export async function activateAccount(token: string, password: string): Promise<PublicUser> {
  const { userId } = await consumeAccountToken(token, 'activation');
  const passwordHash = await hashPassword(password);

  const [updated] = await db
    .update(users)
    .set({ passwordHash, isActive: true, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) {
    throw new NotFoundError('User');
  }

  return toPublicUser(updated);
}

/**
 * Consumes the reset token, sets the new password, and revokes every
 * session for that user (they must sign in again everywhere).
 */
export async function resetPassword(token: string, password: string): Promise<void> {
  const { userId } = await consumeAccountToken(token, 'password_reset');
  const passwordHash = await hashPassword(password);

  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (!updated) {
    throw new NotFoundError('User');
  }

  await revokeAllSessions(userId);
}
