import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  type ErrorDetail,
} from '../../errors/index.js';
import { db } from '../../config/db.js';
import { issueActivationToken, revokeAllSessions } from '../auth/service.js';
import {
  countOtherActiveAdministrators,
  findExistingEmails,
  findUserByEmail as findUserByEmailRow,
  findUserById as findUserByIdRow,
  insertUser,
  insertUsers,
  listUsers as listUsersRows,
  updateUser as updateUserRow,
  updateUserPassword as updateUserPasswordRow,
  type UserPatch,
} from './repository.js';
import type { ImportUsersInput, ListUsersQuery, UpdateUserInput } from './schema.js';
import type {
  ImportResult,
  InvitedAccount,
  ProvisionInput,
  ProvisionedAccount,
  PublicUser,
  UserRow,
  UserStatus,
} from './types.js';

/** Lifecycle state derived from the row (never stored — always truthful). */
function deriveStatus(row: UserRow): UserStatus {
  if (row.isActive) return 'ACTIVE';
  return row.passwordHash ? 'DEACTIVATED' : 'INVITED';
}

/** The only user shape that ever leaves the API — never exposes passwordHash. */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role as PublicUser['role'],
    isActive: row.isActive,
    registrationNumber: row.registrationNumber,
    status: deriveStatus(row),
    createdAt: row.createdAt,
  };
}

export function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return findUserByEmailRow(email);
}

export function findUserById(userId: string): Promise<UserRow | undefined> {
  return findUserByIdRow(userId);
}

/**
 * Password write used by the auth module's activation and password-reset
 * flows. Exposed here so those flows never reach into this module's
 * `repository.ts` (ADR-02 — cross-module calls go through `service.ts`).
 */
export function updateUserPassword(
  userId: string,
  passwordHash: string,
  options: { activate?: boolean } = {},
): Promise<UserRow | undefined> {
  return updateUserPasswordRow(userId, passwordHash, options);
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
  const existing = await findUserByEmailRow(input.email);

  if (existing?.isActive) {
    throw new ConflictError('An account with this email already exists');
  }

  let user: UserRow;
  let reinvited = false;

  if (existing) {
    reinvited = true;
    user = existing;
  } else {
    user = await insertUser({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      role: input.role,
      passwordHash: null, // set during activation
      isActive: false, // INVITED
    });
  }

  const { token, expiresAt } = await issueActivationToken(user.id);

  return { user, activationToken: token, activationExpiresAt: expiresAt, reinvited };
}

/** Single user lookup (admin detail view). */
export async function getUser(userId: string): Promise<UserRow> {
  const user = await findUserByIdRow(userId);
  if (!user) {
    throw new NotFoundError('User');
  }
  return user;
}

/** GET /users — search + filter + paginate, newest accounts first. */
export async function listUsers(
  query: ListUsersQuery,
): Promise<{ users: PublicUser[]; total: number }> {
  const { rows, total } = await listUsersRows(query);
  return { users: rows.map(toPublicUser), total };
}

/**
 * PATCH /users/:userId — profile edits, role changes, activate/deactivate.
 *
 * Guards (in order):
 *   1. 404 unknown user
 *   2. an admin cannot deactivate themselves (lockout protection)
 *   3. the last active administrator cannot be deactivated or demoted
 *   4. an account that never activated cannot be flipped to ACTIVE
 *      directly — it has no password; resend the invitation instead
 *
 * Deactivation revokes every session, so access ends immediately (the same
 * rule password reset already follows).
 */
export async function updateUser(
  userId: string,
  input: UpdateUserInput,
  actorId: string,
): Promise<UserRow> {
  const target = await findUserByIdRow(userId);
  if (!target) {
    throw new NotFoundError('User');
  }

  const deactivating = input.isActive === false;
  const demoting =
    target.role === 'administrator' &&
    input.role !== undefined &&
    input.role !== 'administrator';

  if (deactivating && target.id === actorId) {
    throw new AuthorizationError('You cannot deactivate your own account');
  }

  if ((deactivating || demoting) && target.role === 'administrator' && target.isActive) {
    const others = await countOtherActiveAdministrators(target.id);
    if (others === 0) {
      throw new ConflictError('Cannot demote or deactivate the last active administrator');
    }
  }

  if (input.isActive === true && !target.passwordHash) {
    throw new BusinessRuleError(
      'This account has not been activated yet — resend the invitation instead',
    );
  }

  const fields: UserPatch = {};
  if (input.firstName !== undefined) fields.firstName = input.firstName;
  if (input.lastName !== undefined) fields.lastName = input.lastName;
  if (input.role !== undefined) fields.role = input.role;
  if (input.isActive !== undefined) fields.isActive = input.isActive;
  if (input.registrationNumber !== undefined) fields.registrationNumber = input.registrationNumber;

  const updated = await updateUserRow(userId, fields);
  if (!updated) {
    throw new NotFoundError('User'); // deleted mid-flight
  }

  if (deactivating) {
    await revokeAllSessions(userId); // logged out of every device, now
  }

  return updated;
}

/**
 * POST /users/:userId/invite — resend the invitation to a not-yet-active
 * account. The fresh token supersedes any outstanding one (latest wins).
 * Active accounts are a conflict: they can simply sign in.
 */
export async function resendInvitation(userId: string): Promise<InvitedAccount> {
  const user = await findUserByIdRow(userId);
  if (!user) {
    throw new NotFoundError('User');
  }
  if (user.isActive) {
    throw new ConflictError('Account is already active');
  }

  const { token, expiresAt } = await issueActivationToken(user.id);
  return { user, activationToken: token, activationExpiresAt: expiresAt };
}

/**
 * POST /users/import — bulk provisioning, all-or-nothing:
 *
 *   1. every row is validated (batch-internal duplicates and emails that
 *      already exist are row-level failures) → 422 with ALL row errors,
 *      nothing inserted
 *   2. users + their activation tokens are inserted in ONE transaction —
 *      a failure midway leaves no partial import behind
 *
 * Row *shape* errors are rejected earlier by the schema layer (400).
 */
export async function importUsers(input: ImportUsersInput): Promise<ImportResult> {
  const details: ErrorDetail[] = [];
  const seen = new Set<string>();

  input.users.forEach((user, index) => {
    if (seen.has(user.email)) {
      details.push({ path: `users.${index}.email`, message: 'Duplicate email in this batch' });
    }
    seen.add(user.email);
  });

  const existing = await findExistingEmails([...seen]);
  input.users.forEach((user, index) => {
    if (existing.has(user.email)) {
      details.push({
        path: `users.${index}.email`,
        message: 'An account with this email already exists',
      });
    }
  });

  if (details.length > 0) {
    throw new BusinessRuleError('Import validation failed', details);
  }

  return db.transaction(async (tx) => {
    const rows = await insertUsers(
      input.users.map((user) => ({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        passwordHash: null, // set during activation
        isActive: false, // INVITED
      })),
      tx,
    );

    const invitations: ImportResult['invitations'] = [];
    for (const row of rows) {
      const issued = await issueActivationToken(row.id, tx);
      invitations.push({
        email: row.email,
        activationToken: issued.token,
        activationExpiresAt: issued.expiresAt,
      });
    }

    return { users: rows, invitations };
  });
}
