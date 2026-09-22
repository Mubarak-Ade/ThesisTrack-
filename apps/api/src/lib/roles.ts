/**
 * Application roles. Mirrors the `user_role` enum in `schema/enums.ts`
 * but kept dependency-free so middleware and validators can import it
 * without pulling in Drizzle.
 */
export const ROLES = ['student', 'supervisor', 'administrator'] as const;

export type Role = (typeof ROLES)[number];
