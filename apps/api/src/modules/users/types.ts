import { users } from '../../schema/index.js';
import type { Role } from '../../lib/roles.js';

export type UserRow = typeof users.$inferSelect;

/**
 * Derived account lifecycle state — the truthful picture for admin UIs:
 *   INVITED     never activated (no password set yet)
 *   ACTIVE      usable account
 *   DEACTIVATED was active, then deactivated by an admin
 */
export type UserStatus = 'INVITED' | 'ACTIVE' | 'DEACTIVATED';

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  registrationNumber: string | null;
  status: UserStatus;
  createdAt: Date;
}

export interface ProvisionInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
}

/** Fresh activation token issued for an (inactive) account. */
export interface IssuedInvitation {
  activationToken: string;
  activationExpiresAt: Date;
}

export interface ProvisionedAccount extends IssuedInvitation {
  user: UserRow;
  reinvited: boolean;
}

/** POST /users/:userId/invite result. */
export interface InvitedAccount extends IssuedInvitation {
  user: UserRow;
}

export interface ListUsersFilters {
  q?: string;
  role?: Role;
  isActive?: boolean;
  page: number;
  limit: number;
}

export interface ListUsersPage {
  rows: UserRow[];
  total: number;
}

/** POST /users/import result — users created and their invitations. */
export interface ImportResult {
  users: UserRow[];
  invitations: Array<{ email: string } & IssuedInvitation>;
}
