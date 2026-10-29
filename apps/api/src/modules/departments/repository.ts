import { and, asc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';

import { db } from '../../config/db.js';
import { departments, users, workflows } from '../../schema/index.js';

/**
 * Drizzle queries only — no Express, no business rules (§9.3, ADR-02).
 *
 * `workflows` and `users` are read here because the department table reports
 * the FR-CW-08 slot holder and its student count; importing another module's
 * repository would be the violation, reading its table as data is the §5.4
 * precedent (same as the workflows module reading project_stages).
 */

export type DepartmentRow = typeof departments.$inferSelect;

/** Multi-statement units run inside the caller's transaction (§9.1). */
export type WriteExecutor = Pick<typeof db, 'insert' | 'update'>;

export interface DepartmentListFilters {
  includeArchived: boolean;
  missingCode: boolean;
  page: number;
  limit: number;
}

export interface DepartmentStats {
  /** The one ACTIVE workflow holding this department's slot, if any. */
  activeWorkflow: { id: string; name: string } | null;
  /** Students whose account is attached to this department. */
  studentCount: number;
}

export async function listDepartments(
  filters: DepartmentListFilters,
): Promise<{ rows: DepartmentRow[]; total: number }> {
  const conditions: SQL[] = [];

  if (!filters.includeArchived) {
    conditions.push(sql`archived_at is null`);
  }
  if (filters.missingCode) {
    conditions.push(sql`code is null`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, counted] = await Promise.all([
    db.query.departments.findMany({
      where,
      orderBy: [asc(departments.name), asc(departments.id)],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
    }),
    db.select({ total: sql<string>`count(*)` }).from(departments).where(where),
  ]);

  return { rows, total: Number(counted[0]?.total ?? 0) };
}

export function findDepartmentById(id: string): Promise<DepartmentRow | undefined> {
  return db.query.departments.findFirst({ where: eq(departments.id, id) });
}

/**
 * Case-insensitive clash check against ACTIVE rows only — the same predicate
 * the `departments_active_name` partial index enforces, so the pre-check
 * agrees with the database. `excludeId` lets an edit ignore itself.
 */
export function findActiveDepartmentByName(
  name: string,
  excludeId: string | null,
): Promise<DepartmentRow | undefined> {
  return db.query.departments.findFirst({
    where: and(
      isNull(departments.archivedAt),
      sql`lower(${departments.name}) = lower(${name})`,
      excludeId ? ne(departments.id, excludeId) : undefined,
    ),
    orderBy: [asc(departments.id)],
  });
}

export function findActiveDepartmentByCode(
  code: string,
  excludeId: string | null,
): Promise<DepartmentRow | undefined> {
  return db.query.departments.findFirst({
    where: and(
      isNull(departments.archivedAt),
      sql`upper(${departments.code}) = upper(${code})`,
      excludeId ? ne(departments.id, excludeId) : undefined,
    ),
    orderBy: [asc(departments.id)],
  });
}

/**
 * The active workflow holding this department's FR-CW-08 slot. Archiving a
 * department while this exists is refused (409) so the one-active-workflow
 * invariant is never silently broken (design §3).
 */
export async function findActiveWorkflowForDepartment(
  departmentId: string,
): Promise<{ id: string; name: string } | undefined> {
  const rows = await db
    .select({ id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(and(eq(workflows.departmentId, departmentId), isNull(workflows.archivedAt)))
    .orderBy(asc(workflows.createdAt), asc(workflows.id))
    .limit(1);
  return rows[0];
}

/** Slot holders for a page of departments, in one query. */
export async function listActiveWorkflowsForDepartments(
  departmentIds: string[],
): Promise<{ departmentId: string; id: string; name: string }[]> {
  if (departmentIds.length === 0) return [];
  const rows = await db
    .select({ departmentId: workflows.departmentId, id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(and(inArray(workflows.departmentId, departmentIds), isNull(workflows.archivedAt)))
    .orderBy(asc(workflows.createdAt), asc(workflows.id));
  return rows.flatMap((row) =>
    row.departmentId ? [{ departmentId: row.departmentId, id: row.id, name: row.name }] : [],
  );
}

/** Attached students per department, in one grouped query. */
export async function countStudentsByDepartment(
  departmentIds: string[],
): Promise<{ departmentId: string; total: number }[]> {
  if (departmentIds.length === 0) return [];
  const rows = await db
    .select({ departmentId: users.departmentId, total: sql<string>`count(*)` })
    .from(users)
    .where(and(inArray(users.departmentId, departmentIds), eq(users.role, 'student')))
    .groupBy(users.departmentId);
  return rows.flatMap((row) =>
    row.departmentId ? [{ departmentId: row.departmentId, total: Number(row.total) }] : [],
  );
}

/* ---------------------------------------------------------------- writes */

export async function insertDepartment(
  values: typeof departments.$inferInsert,
  executor: WriteExecutor = db,
): Promise<DepartmentRow> {
  const [created] = await executor.insert(departments).values(values).returning();
  return created;
}

export async function updateDepartment(
  id: string,
  values: Partial<typeof departments.$inferInsert>,
  executor: WriteExecutor = db,
): Promise<DepartmentRow | undefined> {
  const [updated] = await executor
    .update(departments)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(departments.id, id))
    .returning();
  return updated;
}
