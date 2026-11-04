import { describe, expect, it } from 'vitest';

import { ROLES, type Role } from '../../src/lib/roles.js';

/**
 * Role union — design 2026-11-02 (ADR-17).
 *
 * The API, JWT verifier and every guard import this list, so it is the one
 * place the fourth role has to appear before anything else can compile.
 */
describe('ROLES', () => {
  it('exposes the four role values exactly once', () => {
    expect(ROLES).toEqual(['student', 'supervisor', 'coordinator', 'administrator']);
    expect(new Set(ROLES).size).toBe(ROLES.length);
  });

  it('accepts coordinator as a Role', () => {
    const role: Role = 'coordinator';
    expect(ROLES).toContain(role);
  });
});
