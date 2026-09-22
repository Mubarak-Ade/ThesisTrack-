import { ConflictError } from '../../errors/index.js';
import { issueActivationToken } from '../auth/service.js';
import {
  findUserByEmail as findUserByEmailRow,
  findUserById as findUserByIdRow,
  insertUser,
} from './repository.js';
import type { ProvisionInput, ProvisionedAccount, PublicUser, UserRow } from './types.js';

/** The only user shape that ever leaves the API — never exposes passwordHash. */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role as PublicUser['role'],
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return findUserByEmailRow(email);
}

export function findUserById(id: string): Promise<UserRow | undefined> {
  return findUserByIdRow(id);
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
