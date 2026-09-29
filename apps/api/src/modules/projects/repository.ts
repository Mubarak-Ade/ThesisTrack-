import { eq } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { isValidUuid } from '../../lib/uuid.js';
import { projects } from '../../schema/index.js';
import type { ProjectRow } from './types.js';

// Re-exported so existing importers keep working — the implementation moved to
// lib/ so the authz guards can share it without reaching into a module
// repository (ADR-02).
export { isValidUuid };

/** Returns undefined for unknown *and* malformed ids (never reaches Postgres). */
export async function findProjectById(id: string): Promise<ProjectRow | undefined> {
  if (!isValidUuid(id)) return undefined;
  return db.query.projects.findFirst({ where: eq(projects.id, id) });
}
