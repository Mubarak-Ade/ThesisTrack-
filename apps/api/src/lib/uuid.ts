const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared id-shape test.
 *
 * Guards live in `lib/` rather than inside a module (§9.3) precisely because
 * several modules need it: a resource guard that hands a malformed id straight
 * to Postgres turns a 404 into a 500. `authz/resource.ts` relies on this to
 * answer "unknown or malformed" identically, without importing another
 * module's `repository.ts` (ADR-02).
 */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}
