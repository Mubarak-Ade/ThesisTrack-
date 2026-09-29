import { describe, expect, it } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '../src/errors/index.js';
import { ROLES, type Role } from '../src/lib/roles.js';

/**
 * Phase 0 smoke test.
 *
 * Its job is not coverage — it exists to prove three things the rest of the
 * build depends on, before any module code is written:
 *
 *   1. `vitest` runs inside apps/api (there was no test runner here before).
 *   2. ESM `NodeNext` specifiers written as `./x.js` resolve to their `.ts`
 *      sources. Every module in this package imports that way, so if this
 *      breaks, every later test breaks with it.
 *   3. Type-only imports (`type Role`) survive the transform.
 */
describe('vitest wiring (Phase 0)', () => {
  it('resolves `.js` specifiers back to TypeScript sources', () => {
    expect(ROLES).toEqual(['student', 'supervisor', 'administrator']);
  });

  it('accepts type-only imports alongside value imports', () => {
    const role: Role = 'supervisor';
    expect(ROLES).toContain<Role>(role);
  });

  it('exposes the error contract the global handler serializes', () => {
    const conflict = new ConflictError('This project already has an active supervisor assignment');
    expect(conflict).toBeInstanceOf(Error);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.code).toBe('RESOURCE_CONFLICT');
    expect(conflict.message).toBe('This project already has an active supervisor assignment');

    expect(new ValidationError().statusCode).toBe(400);
    expect(new NotFoundError('Proposal').message).toBe('Proposal not found');
  });
});
