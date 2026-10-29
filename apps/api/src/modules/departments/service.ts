import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from '../../errors/index.js';
import type { Role } from '../../lib/roles.js';
import * as repo from './repository.js';
import type {
  CreateDepartmentInput,
  ListDepartmentsQuery,
  PatchDepartmentInput,
} from './schema.js';
import type { DepartmentRow, DepartmentView } from './types.js';

/*
 * Departments business rules (design 2026-10-28, PROPOSED ADR-11 reversal).
 *
 *   - names and codes are unique among ACTIVE rows only (case-insensitive);
 *   - departments are archived, never deleted — history keeps the label;
 *   - archiving is refused (409) while an ACTIVE workflow holds the
 *     department's one-active-workflow slot (FR-CW-08): archive the workflow
 *     first, so the invariant can never be silently broken;
 *   - reactivation re-checks name/code uniqueness, because the active-only
 *     unique indexes can have accepted a replacement while it was archived.
 */

/** Postgres unique_violation — the race loser answers with the same 409. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

function toView(
  row: DepartmentRow,
  activeWorkflow: { id: string; name: string } | null,
  studentCount: number,
): DepartmentView {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activeWorkflow,
    studentCount,
  };
}

/** One page of views, enriching every row with its slot holder and count. */
async function toViews(rows: DepartmentRow[]): Promise<DepartmentView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [workflows, counts] = await Promise.all([
    repo.listActiveWorkflowsForDepartments(ids),
    repo.countStudentsByDepartment(ids),
  ]);
  const workflowByDepartment = new Map(workflows.map((row) => [row.departmentId, row]));
  const countByDepartment = new Map(counts.map((row) => [row.departmentId, row.total]));
  return rows.map((row) => {
    const workflow = workflowByDepartment.get(row.id);
    return toView(
      row,
      workflow ? { id: workflow.id, name: workflow.name } : null,
      countByDepartment.get(row.id) ?? 0,
    );
  });
}

/* ------------------------------------------------------------------ reads */

export async function listDepartments(
  query: ListDepartmentsQuery,
  actorRole: Role,
): Promise<{ departments: DepartmentView[]; total: number }> {
  const includeArchived = query.includeArchived === 'true';
  const missingCode = query.missingCode === 'true';

  // The list itself is readable by every authenticated account (the user form
  // needs it); the archive and completeness views are administrator-only.
  if ((includeArchived || missingCode) && actorRole !== 'administrator') {
    throw new AuthorizationError(
      'Only administrators can list archived departments or departments missing a code',
    );
  }

  const { rows, total } = await repo.listDepartments({
    includeArchived,
    missingCode,
    page: query.page,
    limit: query.limit,
  });
  return { departments: await toViews(rows), total };
}

export async function getDepartment(id: string): Promise<DepartmentView> {
  const row = await repo.findDepartmentById(id);
  if (!row) throw new NotFoundError('Department');

  const [workflow, counts] = await Promise.all([
    repo.findActiveWorkflowForDepartment(id),
    repo.countStudentsByDepartment([id]),
  ]);
  return toView(row, workflow ?? null, counts[0]?.total ?? 0);
}

/* ----------------------------------------------------------------- writes */

export async function createDepartment(
  actorId: string,
  input: CreateDepartmentInput,
): Promise<DepartmentView> {
  const { name, code } = input;

  const nameClash = await repo.findActiveDepartmentByName(name, null);
  if (nameClash) {
    throw new ConflictError(`An active department named "${nameClash.name}" already exists`);
  }
  const codeClash = await repo.findActiveDepartmentByCode(code, null);
  if (codeClash) {
    throw new ConflictError(
      `Code "${code}" is already used by the active department "${codeClash.name}"`,
    );
  }

  try {
    const created = await repo.insertDepartment({ name, code, createdBy: actorId });
    return toView(created, null, 0);
  } catch (err) {
    // Lost race against the partial unique indexes: identical answer to the
    // pre-check, so the caller cannot tell (or care) which one fired.
    if (isUniqueViolation(err)) {
      throw new ConflictError('A department with this name or code already exists');
    }
    throw err;
  }
}

export async function patchDepartment(
  id: string,
  input: PatchDepartmentInput,
): Promise<DepartmentView> {
  const current = await repo.findDepartmentById(id);
  if (!current) throw new NotFoundError('Department');

  const willBeArchived = input.archived ?? current.archivedAt !== null;
  const name = input.name ?? current.name;
  const code = input.code ?? current.code;

  // Archiving: refuse while an ACTIVE workflow holds the department's slot.
  if (willBeArchived && current.archivedAt === null) {
    const workflow = await repo.findActiveWorkflowForDepartment(id);
    if (workflow) {
      throw new ConflictError(
        `Archive the active workflow "${workflow.name}" before archiving this department`,
      );
    }
  }

  // Uniqueness applies to rows that are (or are becoming) active again.
  if (!willBeArchived) {
    const nameClash = await repo.findActiveDepartmentByName(name, id);
    if (nameClash) {
      throw new ConflictError(`An active department named "${nameClash.name}" already exists`);
    }
    if (code) {
      const codeClash = await repo.findActiveDepartmentByCode(code, id);
      if (codeClash) {
        throw new ConflictError(
          `Code "${code}" is already used by the active department "${codeClash.name}"`,
        );
      }
    }
  }

  const values: Partial<typeof current> = { name };
  if (input.code !== undefined) values.code = input.code;
  if (input.archived !== undefined) {
    values.archivedAt = input.archived ? (current.archivedAt ?? new Date()) : null;
  }

  try {
    const updated = await repo.updateDepartment(id, values);
    if (!updated) throw new NotFoundError('Department');
    const workflow = await repo.findActiveWorkflowForDepartment(id);
    const counts = await repo.countStudentsByDepartment([id]);
    return toView(updated, workflow ?? null, counts[0]?.total ?? 0);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('A department with this name or code already exists');
    }
    throw err;
  }
}
