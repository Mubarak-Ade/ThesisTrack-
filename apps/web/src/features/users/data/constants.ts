import type { Role } from './types';

/** API-valid roles (§A) — the only values the create form may submit. */
export const ROLES: readonly Role[] = ['student', 'supervisor', 'administrator'];

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
};
