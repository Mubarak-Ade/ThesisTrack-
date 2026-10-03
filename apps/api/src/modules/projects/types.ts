import type { projects } from '../../schema/index.js';

export type ProjectRow = typeof projects.$inferSelect;

/** §11.2 GET /projects — role-driven scoping filters. */
export interface ProjectListFilters {
  /** Student scope: only their own row. */
  studentId?: string;
  /** Supervisor scope: projects of their ACTIVE assignments (§13.3). */
  projectIds?: string[];
  status?: 'active' | 'completed' | 'archived';
  /** Title search (§11.2 `?q`). */
  q?: string;
  page: number;
  limit: number;
}

/** The student summary the scoped list carries (§11.2 — display only). */
export interface ProjectStudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ProjectListItem extends ProjectRow {
  student: ProjectStudentSummary;
}

/* ------------------------------------------------------ activity feed (§11.13) */

/**
 * The nine derived kinds. There is deliberately no event table (§11.13,
 * §8.12, ADR-15): every entry is assembled from an existing row at read time.
 */
export type ActivityKind =
  | 'proposal.submitted'
  | 'proposal.reviewed'
  | 'assignment.changed'
  | 'milestone.completed'
  | 'submission.created'
  | 'submission.reviewed'
  | 'feedback.created'
  | 'stage.started'
  | 'stage.completed';

/**
 * One merged feed entry. `actor` carries the display name alongside the id
 * because §11.0.2's user directory is admin-only — a student could not
 * resolve a bare id. `null` = the source row has no actor column (a
 * milestone completing records who advanced *stages*, not milestones).
 */
export interface ActivityEvent {
  id: string;
  at: Date;
  kind: ActivityKind;
  actor: { id: string; name: string } | null;
  summary: string;
}
