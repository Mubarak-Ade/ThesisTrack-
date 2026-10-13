/**
 * Single source of truth for the API mount prefix (spec §18, ADR-08 cleanup —
 * plan 15.6). Everything that reasons about full request paths derives from
 * this constant: the mount in `routes.ts`, the public-path allowlist in
 * `middleware/auth.ts`, and the nginx/compose deployments that proxy `/api`.
 *
 * The bash system suites and the vite dev proxy both assume `/api/v1`; it is
 * deliberately a constant, not an env var, so those contracts cannot drift.
 */
export const API_PREFIX = '/api/v1';
