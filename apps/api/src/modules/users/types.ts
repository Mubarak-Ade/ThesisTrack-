import { users } from '../../schema/index.js';
import type { Role } from '../../lib/roles.js';

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
