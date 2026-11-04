import { sql } from 'drizzle-orm';

import { db } from '../config/db.js';

/**
 * One-off schema migration for the 2026-11-02 coordinator design (ADR-17).
 *
 * The deployed Render database is promoted with scripts, matching the
 * 2026-10-28 departments migration; `drizzle-kit push` is the local/test path.
 * This script is idempotent and safe to re-run.
 *
 * Postgres cannot USE a new enum value in the transaction that added it
 * (`unsafe use of new value of enum type`). The two statements below therefore
 * run as separate autocommit statements — enum first, constraint/index second —
 * rather than inside one `db.transaction`.
 *
 *   pnpm --filter @thesistrack/api exec tsx src/scripts/migrate-coordinator-role.ts
 */

type Row = Record<string, unknown>;

async function main(): Promise<void> {
  // Guard against running on a database that never received the departments
  // feature: the check constraint cannot reference a missing column.
  const column = (
    await db.execute(sql`
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'users'
        and column_name = 'department_id'
    `)
  ).rows as Row[];
  if (column.length === 0) {
    throw new Error(
      'users.department_id is missing — apply the 2026-10-28 departments migration first',
    );
  }

  // 1. Enum member. Its own statement → its own transaction → committed before
  //    the constraint below can reference the value.
  await db.execute(sql`alter type user_role add value if not exists 'coordinator'`);

  // 2. Invariant + scoped-list index.
  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'users_coordinator_department'
          and conrelid = 'users'::regclass
      ) then
        alter table users
          add constraint users_coordinator_department
          check (role <> 'coordinator' or department_id is not null);
      end if;
    end
    $$
  `);
  await db.execute(sql`
    create index if not exists idx_users_department_role
      on users (department_id, role)
  `);

  const summary = (
    await db.execute(sql`
      select
        (select count(*)::int from users where role = 'coordinator') as coordinators,
        (select count(*)::int from pg_constraint
          where conname = 'users_coordinator_department') as constraints,
        (select count(*)::int from pg_indexes
          where indexname = 'idx_users_department_role') as indexes
    `)
  ).rows as Array<{ coordinators: number; constraints: number; indexes: number }>;

  console.log(
    `migrate-coordinator-role: enum ready; ${summary[0]?.constraints ?? 0} constraint, ` +
      `${summary[0]?.indexes ?? 0} index; ${summary[0]?.coordinators ?? 0} coordinator row(s)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
