import type { Role } from './types';

/** API-valid roles (§A) — the only values the create form may submit. */
export const ROLES: readonly Role[] = ['student', 'supervisor', 'administrator'];

/** Department options — no departments endpoint exists, so this is a constant. */
export const DEPARTMENTS = [
  'Informatics',
  'Cyber Security',
  'Institutional Affairs',
  'Architecture',
  'Data Science',
  'Electrical Engineering',
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
};
