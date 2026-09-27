import { eq } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { projects } from '../../schema/index.js';
import type { ProjectRow } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Returns undefined for unknown *and* malformed ids (never reaches Postgres). */
export async function findProjectById(id: string): Promise<ProjectRow | undefined> {
  if (!isValidUuid(id)) return undefined;
  return db.query.projects.findFirst({ where: eq(projects.id, id) });
}
