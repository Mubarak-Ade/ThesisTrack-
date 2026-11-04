import type { Role } from './types';

/** API-valid roles (§A) — the only values the create form may submit. */
export const ROLES: readonly Role[] = ['student', 'supervisor', 'coordinator', 'administrator'];

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  administrator: 'Super Admin',
};
