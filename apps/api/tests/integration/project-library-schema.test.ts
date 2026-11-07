import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { db } from '../../src/config/db.js';
import { ensureTrigramExtension } from '../../src/scripts/migrate-project-library.js';

/**
 * Project library schema — design 2026-11-05 (ADR-18).
 *
 * The corpus is derived at read time, so the only schema change is the
 * `pg_trgm` extension (created by an idempotent script) plus five GIN trigram
 * indexes declared in the Drizzle schema. These assertions inspect the live
 * test database, not the TypeScript source: they catch a schema declaration
 * that never reached the database, and a `db:push` that silently dropped an
 * index as drift.
 */

const TRIGRAM_INDEXES = [
  'idx_projects_title_trgm',
  'idx_projects_description_trgm',
  'idx_proposals_title_trgm',
  'idx_proposals_abstract_trgm',
  'idx_proposals_body_trgm',
] as const;

describe('project library schema (ADR-18)', () => {
  it('has the pg_trgm extension installed', async () => {
    const rows = (
      await db.execute(sql`
        select extversion
        from pg_extension
        where extname = 'pg_trgm'
      `)
    ).rows as Array<{ extversion: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.extversion).toMatch(/^\d+\.\d+/);
  });

  it.each(TRIGRAM_INDEXES)('declares %s as a GIN trigram index', async (name) => {
    const rows = (
      await db.execute(sql`
        select indexdef
        from pg_indexes
        where schemaname = 'public'
          and indexname = ${name}
      `)
    ).rows as Array<{ indexdef: string }>;

    expect(rows, `${name} is missing — run db:push after migrate:library`).toHaveLength(1);
    const definition = rows[0]!.indexdef.toLowerCase();
    expect(definition).toContain('using gin');
    expect(definition).toContain('gin_trgm_ops');
  });

  it('ensureTrigramExtension is idempotent', async () => {
    await ensureTrigramExtension();
    await ensureTrigramExtension();

    const rows = (
      await db.execute(sql`
        select count(*)::int as extensions
        from pg_extension
        where extname = 'pg_trgm'
      `)
    ).rows as Array<{ extensions: number }>;

    expect(rows[0]?.extensions).toBe(1);
  });
});
