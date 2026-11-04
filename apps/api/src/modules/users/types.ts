import { users } from '../../schema/index.js';
import type { Role } from '../../lib/roles.js';

export type UserRow = typeof users.$inferSelect;

/** The department fields every user view carries (design 2026-10-28). */
export interface DepartmentRef {
  id: string;
  name: string;
  code: string | null;
}

/**
 * A user row with its managed department joined. `toPublicUser` requires this
 * shape so a department can never be silently rendered as null: repositories
 * that return users add `with: { department: true }` (or the service enriches
 * a freshly written row), and the type system enforces it.
 */
export type UserWithDepartment = UserRow & { department: DepartmentRef | null };

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
  /** Managed department (design 2026-10-28); NULL = unaffiliated. */
  department: DepartmentRef | null;
  status: UserStatus;
  createdAt: Date;
}

export interface ProvisionInput {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** Required for students; optional for supervisors (enforced in schema). */
  registrationNumber?: string | null;
  /** Managed department; must be active. NULL = unaffiliated. */
  departmentId?: string | null;
}

/** Fresh activation token issued for an (inactive) account. */
export interface IssuedInvitation {
  activationToken: string;
  activationExpiresAt: Date;
}

export interface ProvisionedAccount extends IssuedInvitation {
  user: UserWithDepartment;
  reinvited: boolean;
}

/** POST /users/:userId/invite result. */
export interface InvitedAccount extends IssuedInvitation {
  user: UserWithDepartment;
}

export interface ListUsersFilters {
  q?: string;
  role?: Role;
  /** Bounded role set (coordinators: student + supervisor only). */
  allowedRoles?: Role[];
  isActive?: boolean;
  /** Managed department filter (design 2026-10-28). */
  departmentId?: string;
  /** Grandfathering banner: students with no registration number. */
  missingRegistrationNumber?: boolean;
  page: number;
  limit: number;
}

export interface ListUsersPage {
  rows: UserWithDepartment[];
  total: number;
}

/** POST /users/import result — users created and their invitations. */
export interface ImportResult {
  users: UserWithDepartment[];
  invitations: Array<{ email: string } & IssuedInvitation>;
}
