/**
 * API shape → internal model (Rule 2): known fields picked explicitly, unknown
 * fields ignored, missing fields defaulted. Structure-level drift throws so the
 * repo can surface an error instead of guessing.
 */
import type { Department, DepartmentRef, DepartmentsPage } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** ISO string for both the DTO's string and a Date (tests feed Date rows). */
function when(value: unknown): string {
  return value instanceof Date ? value.toISOString() : str(value);
}

/**
 * A nested `department` field on any user payload. A non-object, or a row
 * without an id, is `null` (unaffiliated) — never an invented reference.
 */
export function mapDepartmentRef(value: unknown): DepartmentRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = asRecord(value);
  const id = str(r.id);
  if (!id) return null;
  return { id, name: str(r.name), code: nullableStr(r.code) };
}

export function mapDepartment(raw: unknown): Department {
  const r = asRecord(raw);
  const workflow = asRecord(r.activeWorkflow);
  const workflowId = str(workflow.id);
  return {
    id: str(r.id),
    name: str(r.name),
    code: nullableStr(r.code),
    archived: bool(r.archived, r.archivedAt !== null),
    archivedAt: nullableStr(r.archivedAt),
    activeWorkflow: workflowId ? { id: workflowId, name: str(workflow.name) } : null,
    studentCount: num(r.studentCount),
    createdAt: when(r.createdAt),
    updatedAt: when(r.updatedAt),
  };
}

export function mapDepartmentDetail(value: unknown): Department {
  const r = asRecord(value);
  if (!r.department) {
    throw new Error('GET /departments/:id: `department` missing — response shape changed');
  }
  return mapDepartment(r.department);
}

export function mapDepartmentsPage(value: unknown): DepartmentsPage {
  const r = asRecord(value);
  if (!Array.isArray(r.departments)) {
    throw new Error('GET /departments: `departments` array missing — response shape changed');
  }
  const p = asRecord(r.pagination);
  const count = r.departments.length;
  return {
    items: r.departments.map(mapDepartment),
    total: typeof p.total === 'number' ? p.total : count,
    page: typeof p.page === 'number' ? p.page : 1,
    limit: typeof p.limit === 'number' ? p.limit : count || 20,
  };
}
