/**
 * Stable internal models for the managed department list (design 2026-10-28 —
 * PROPOSED ADR-11 reversal). Screens consume these types only; raw API DTOs
 * never leave `data/`.
 */

/** The `{ id, name, code }` reference every user row embeds. */
export interface DepartmentRef {
  id: string;
  name: string;
  /** `DEPT` in a student registration number; NULL only for legacy rows. */
  code: string | null;
}

export interface Department extends DepartmentRef {
  archived: boolean;
  archivedAt: string | null;
  /** The one ACTIVE workflow holding the FR-CW-08 slot, if any. */
  activeWorkflow: { id: string; name: string } | null;
  /** Students whose account is attached to this department. */
  studentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentsPage {
  items: Department[];
  total: number;
  page: number;
  limit: number;
}

export interface ListDepartmentsArgs {
  /** Administrator-only views; the plain list needs neither. */
  includeArchived?: boolean;
  missingCode?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateDepartmentInput {
  name: string;
  code: string;
}

/** PATCH — archive/reactivate, rename, or complete/replace the code. */
export interface PatchDepartmentInput {
  name?: string;
  code?: string;
  archived?: boolean;
}
