import { sql } from 'drizzle-orm';

import { db } from '../config/db.js';

/**
 * One-off migration for the 2026-10-28 departments design.
 *
 * Order is the whole point: create → read legacy labels → link rows → check
 * duplicates → drop the legacy columns → create the final indexes. Running a
 * drizzle push that drops `program`/`department` first would erase every label
 * before this script could read it.
 *
 * Self-contained on purpose: the deployed Render database never runs drizzle
 * push, so this script creates its own table/columns (IF NOT EXISTS) and is
 * idempotent — a second run is a no-op. DDL and data move in one transaction.
 *
 *   pnpm --filter @thesistrack/api exec tsx src/scripts/backfill-departments.ts
 *
 * A fresh database (test-db.sh reset) has no legacy columns; the script then
 * only ensures the indexes exist and seeds nothing — the seed scripts own that.
 */

type Row = Record<string, unknown>;

async function legacyColumns(tx: typeof db): Promise<Set<string>> {
  const result = await tx.execute(sql`
    select table_name, column_name
    from information_schema.columns
    where table_name in ('users', 'workflows')
      and column_name in ('program', 'department')
  `);
  return new Set((result.rows as Row[]).map((row) => `${row.table_name}.${row.column_name}`));
}

async function main(): Promise<void> {
  const summary = await db.transaction(async (tx) => {
    // 1. Additive DDL — the script owns it so it works on databases that never
    //    saw the intermediate drizzle schema.
    await tx.execute(sql`
      create table if not exists departments (
        id uuid primary key default gen_random_uuid(),
        name varchar(255) not null,
        code varchar(8),
        archived_at timestamptz,
        created_by uuid references users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await tx.execute(sql`alter table users add column if not exists department_id uuid`);
    await tx.execute(sql`alter table workflows add column if not exists department_id uuid`);

    // 2. Which legacy columns actually exist? (users.department only ever
    //    existed in the interim free-text attempt.)
    const columns = await legacyColumns(tx as unknown as typeof db);

    const names = new Map<string, string>(); // lower(name) -> first spelling
    const addNames = (rows: Row[], key: string) => {
      for (const row of rows) {
        const value = typeof row[key] === 'string' ? (row[key] as string).trim() : '';
        if (!value) continue;
        const lower = value.toLowerCase();
        if (!names.has(lower)) names.set(lower, value);
      }
    };

    if (columns.has('workflows.program')) {
      addNames(
        (await tx.execute(sql`select distinct program as name from workflows where program is not null`))
          .rows as Row[],
        'name',
      );
    }
    if (columns.has('users.program')) {
      addNames(
        (await tx.execute(sql`select distinct program as name from users where program is not null`)).rows as Row[],
        'name',
      );
    }
    if (columns.has('users.department')) {
      addNames(
        (await tx.execute(sql`select distinct department as name from users where department is not null`))
          .rows as Row[],
        'name',
      );
    }

    // 3. Create one row per merged label. code stays NULL: only an admin can
    //    choose the short code, and the UI banner lists what is missing.
    let created = 0;
    for (const name of names.values()) {
      const inserted = await tx.execute(sql`
        insert into departments (name)
        select ${name}
        where not exists (
          select 1 from departments d
          where lower(d.name) = lower(${name}) and d.archived_at is null
        )
        returning id
      `);
      created += (inserted.rows as Row[]).length;
    }

    // 4. Link users and workflows by case-insensitive name. Users: `department`
    //    (the newer label) wins over `program` (the ADR-16 string).
    let usersLinked = 0;
    let workflowsLinked = 0;

    if (columns.has('users.program')) {
      const result = await tx.execute(sql`
        update users u set department_id = d.id
        from departments d
        where u.department_id is null
          and u.program is not null
          and lower(trim(u.program)) = lower(d.name)
          and d.archived_at is null
      `);
      usersLinked += result.rowCount ?? 0;
    }
    if (columns.has('users.department')) {
      const result = await tx.execute(sql`
        update users u set department_id = d.id
        from departments d
        where u.department is not null
          and lower(trim(u.department)) = lower(d.name)
          and d.archived_at is null
      `);
      usersLinked += result.rowCount ?? 0;
    }
    if (columns.has('workflows.program')) {
      const result = await tx.execute(sql`
        update workflows w set department_id = d.id
        from departments d
        where w.department_id is null
          and w.program is not null
          and lower(trim(w.program)) = lower(d.name)
          and d.archived_at is null
      `);
      workflowsLinked += result.rowCount ?? 0;
    }

    // 5. Duplicate registration numbers would make the unique index fail
    //    midway. Report and abort BEFORE dropping anything — no data is lost,
    //    an admin resolves the clash and reruns.
    const duplicates = (
      await tx.execute(sql`
        select lower(registration_number) as number, count(*)::int as count
        from users
        where registration_number is not null
        group by 1
        having count(*) > 1
      `)
    ).rows as Row[];
    if (duplicates.length > 0) {
      throw new Error(
        `Duplicate registration numbers found — resolve these before migrating: ${duplicates
          .map((row) => `${row.number as string} (${String(row.count)})`)
          .join(', ')}`,
      );
    }

    // 6. Drop the legacy columns (dropping workflows.program also drops the
    //    old one-active-per-program index), then create the final indexes.
    if (columns.has('users.program')) {
      await tx.execute(sql`alter table users drop column if exists program`);
    }
    if (columns.has('users.department')) {
      await tx.execute(sql`alter table users drop column if exists department`);
    }
    if (columns.has('workflows.program')) {
      await tx.execute(sql`alter table workflows drop column if exists program`);
    }

    await tx.execute(sql`
      create unique index if not exists departments_active_name
        on departments (lower(name)) where archived_at is null
    `);
    await tx.execute(sql`
      create unique index if not exists departments_active_code
        on departments (upper(code)) where archived_at is null and code is not null
    `);
    await tx.execute(sql`
      create unique index if not exists users_registration_number_unique
        on users (lower(registration_number)) where registration_number is not null
    `);
    await tx.execute(sql`
      create unique index if not exists workflows_one_active_per_department
        on workflows (department_id) where archived_at is null and department_id is not null
    `);

    return { created, usersLinked, workflowsLinked };
  });

  console.log(
    `backfill-departments: ${summary.created} department(s) created, ` +
      `${summary.usersLinked} user link(s), ${summary.workflowsLinked} workflow link(s)`,
  );

  const unlinked = (
    await db.execute(sql`
      select count(*)::int as count from users
      where department_id is null and role = 'student'
    `)
  ).rows as Row[];
  console.log(
    `backfill-departments: ${String(unlinked[0]?.count ?? 0)} student(s) remain unaffiliated ` +
      '(NULL department — they fall back to the default workflow)',
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
