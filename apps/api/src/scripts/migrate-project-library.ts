import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';

import { db } from '../config/db.js';

/**
 * One-off schema migration for the 2026-11-05 project-library design (ADR-18).
 *
 * The library adds no tables. Its five trigram indexes are declared in the
 * Drizzle schema (`schema/projects.ts`, `schema/proposals.ts`) so `db:push`
 * owns them; the `pg_trgm` extension itself is not managed by Drizzle and must
 * exist BEFORE the first push, otherwise the GIN index DDL fails.
 *
 * This script therefore creates only the extension. It is idempotent and safe
 * to re-run, and it deliberately does not duplicate the index DDL — two copies
 * could diverge and `db:push` would then treat one as drift.
 *
 *   pnpm --filter @thesistrack/api migrate:library
 */

const TRIGRAM_INDEXES = [
  'idx_projects_title_trgm',
  'idx_projects_description_trgm',
  'idx_proposals_title_trgm',
  'idx_proposals_abstract_trgm',
  'idx_proposals_body_trgm',
] as const;

/** Creates `pg_trgm` if it is missing. Exported so the schema test can prove idempotency. */
export async function ensureTrigramExtension(): Promise<void> {
  await db.execute(sql`create extension if not exists pg_trgm`);
}

type SummaryRow = {
  version: string | null;
  indexes: number;
};

async function main(): Promise<void> {
  await ensureTrigramExtension();

  const rows = (
    await db.execute(sql`
      select
        (select extversion from pg_extension where extname = 'pg_trgm') as version,
        (select count(*)::int
           from pg_indexes
          where schemaname = 'public'
            and indexname in (
              'idx_projects_title_trgm',
              'idx_projects_description_trgm',
              'idx_proposals_title_trgm',
              'idx_proposals_abstract_trgm',
              'idx_proposals_body_trgm'
            )) as indexes
    `)
  ).rows as SummaryRow[];

  const summary = rows[0];
  const missing = TRIGRAM_INDEXES.length - (summary?.indexes ?? 0);
  console.log(
    `migrate-project-library: pg_trgm ${summary?.version ?? 'unknown'}; ` +
      `${summary?.indexes ?? 0}/${TRIGRAM_INDEXES.length} trigram indexes present` +
      (missing > 0 ? ' (run db:push to create them)' : ''),
  );
}

const isCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
