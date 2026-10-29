import { asc, eq, sql } from 'drizzle-orm';

import { db } from '../config/db.js';
import { departments, users } from '../schema/index.js';

/**
 * Seeds the starter department list (design 2026-10-28, PROPOSED ADR-11
 * reversal). This is the list the web form used to suggest as free text
 * (`features/users/data/constants.ts`), promoted to real rows with codes so a
 * student's `FAC/YY/DEPT/NNNNN` number can be cross-checked immediately.
 *
 * Idempotent, like the other seeds: a department is matched case-insensitively
 * by name among ACTIVE rows. An existing row without a code gets the seed code
 * only when that code is free; a clashing code (or an archived row) is
 * reported and left alone — the seed never breaks a database.
 *
 *   pnpm --filter @thesistrack/api seed:departments
 */

type SeedDepartment = { name: string; code: string };

const SEEDS: SeedDepartment[] = [
  { name: 'Informatics', code: 'INF' },
  { name: 'Cyber Security', code: 'CYB' },
  { name: 'Institutional Affairs', code: 'IAF' },
  { name: 'Architecture', code: 'ARC' },
  { name: 'Data Science', code: 'DAT' },
  { name: 'Electrical Engineering', code: 'EEE' },
];

async function main(): Promise<void> {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@thesistrack.local').trim().toLowerCase();
  const admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  const createdBy = admin?.id ?? null; // created_by is nullable

  const summary: Record<string, string> = {};
  const notes: string[] = [];

  for (const seed of SEEDS) {
    const existing = await db.query.departments.findFirst({
      where: sql`lower(${departments.name}) = lower(${seed.name}) and archived_at is null`,
      orderBy: [asc(departments.createdAt), asc(departments.id)],
    });

    if (existing) {
      if (existing.code) {
        summary[seed.name] = existing.id;
        continue;
      }
      // Legacy/backfill row without a code: complete it when the code is free.
      const codeHolder = await db.query.departments.findFirst({
        where: sql`upper(${departments.code}) = upper(${seed.code}) and archived_at is null`,
      });
      if (codeHolder) {
        notes.push(
          `${seed.name}: code "${seed.code}" is already used by "${codeHolder.name}" — left without a code`,
        );
        summary[seed.name] = existing.id;
        continue;
      }
      const [updated] = await db
        .update(departments)
        .set({ code: seed.code, updatedAt: new Date() })
        .where(eq(departments.id, existing.id))
        .returning({ id: departments.id });
      summary[seed.name] = updated!.id;
      continue;
    }

    const [created] = await db
      .insert(departments)
      .values({ name: seed.name, code: seed.code, createdBy })
      .returning({ id: departments.id });
    summary[seed.name] = created!.id;
  }

  console.log(
    JSON.stringify(
      {
        departments: Object.keys(summary).length,
        createdBy: createdBy ?? 'anonymous (no admin yet)',
        notes,
        ...summary,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
