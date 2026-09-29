import type { supervisorAssignments } from '../../schema/index.js';
import type { PublicUser, UserRow } from '../users/types.js';

export type SupervisorAssignmentRow = typeof supervisorAssignments.$inferSelect;

/** Assignment row joined with its supervisor (for responses). */
export type AssignmentWithSupervisor = SupervisorAssignmentRow & { supervisor: UserRow };

/** The API shape of an assignment — history's answer to who/when/by whom. */
export interface AssignmentView {
  id: string;
  /**
   * Nullable to mirror the row: since spec §8.2 an assignment can exist
   * BEFORE its project (ADR-13 — supervisor assigned, proposal submitted to
   * them afterwards). Every endpoint in this module is project-scoped, so the
   * value is always set on these responses.
   */
  projectId: string | null;
  isPrimary: boolean;
  assignedAt: Date;
  endedAt: Date | null;
  /** Admin who created this assignment (null = system/seed). */
  assignedBy: string | null;
  supervisor: PublicUser;
}

export interface AssignmentOverview {
  /** The single active relationship, or null when the project is unassigned. */
  active: AssignmentView | null;
  /** Ended relationships, most recent first — the preserved history. */
  history: AssignmentView[];
}

/**
 * One row of a supervisor's caseload (`GET /supervisors/me/students`).
 *
 * There is deliberately no "active: false" member: the endpoint returns active
 * rows only, and **one row per student** — I13 makes dedup unnecessary, N
 * students simply yield N rows.
 */
export interface CaseloadEntry {
  /** The assignment row's id. */
  id: string;
  /** Null while the student's assignment predates their project (ADR-13). */
  projectId: string | null;
  assignedAt: Date;
  isPrimary: boolean;
  student: PublicUser;
}
