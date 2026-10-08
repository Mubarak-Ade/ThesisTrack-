/**
 * Administrator oversight models (spec §16.3 — Projects · Assignments ·
 * Workflows · Monitoring · Reports).
 *
 * All live-backed: these screens sit on write paths (archive, assign, set
 * default), so their repos are deliberately LIVE-ONLY — a fixture row under an
 * archive button would 404 on click. Structure drift throws; the screen shows
 * ErrorState + retry (§10.4 allows the fallback, it does not require it —
 * the no-fallback choice is listed in the Phase 13 record).
 */

/* ------------------------------------------------------------- Projects §11.2 */

export type ProjectStatus = 'active' | 'completed' | 'archived';

export interface AdminProjectRow {
  id: string;
  title: string;
  studentName: string;
  studentEmail: string;
  status: ProjectStatus;
  workflowId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsPageArgs {
  page: number;
  limit: number;
  /** `?status` — omit for every status. */
  status?: ProjectStatus | 'all';
  /** `?q` — title search. */
  q?: string;
}

export interface ProjectsPage {
  items: AdminProjectRow[];
  total: number;
  page: number;
  limit: number;
}

/* ---------------------------------------------------------- Assignments §11.1 */

export interface AssignmentSupervisor {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

/** One `supervisor_assignments` row as `toView` answers it. */
export interface AssignmentEntry {
  id: string;
  projectId: string | null;
  isPrimary: boolean;
  assignedAt: string | null;
  endedAt: string | null;
  supervisor: AssignmentSupervisor;
}

/** GET /students/:studentId/supervisor → `{active, history}`. */
export interface StudentAssignment {
  active: AssignmentEntry | null;
  history: AssignmentEntry[];
}

export interface DirectoryStudent {
  id: string;
  name: string;
  email: string;
  program: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DirectorySupervisor {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

export interface DirectoryPageArgs {
  page: number;
  limit: number;
  q?: string;
}

export interface DirectoryPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/* ----------------------------------------------------------- Workflows §11.14 */

export type ResponsibleRole = 'student' | 'supervisor' | 'administrator';

export interface WorkflowSummary {
  id: string;
  name: string;
  program: string | null;
  academicSession: string | null;
  description: string | null;
  /** ADR-16 fallback target — §16.3's "set default" affordance. */
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One definition row — `position` is server-owned on write (FR-CW-02). */
export interface WorkflowStage {
  id: string;
  position: number;
  name: string;
  description: string | null;
  dueOffsetDays: number | null;
  deliverable: string | null;
  responsibleRole: ResponsibleRole | null;
  requiresSubmission: boolean;
  requiresReview: boolean;
  requiresApproval: boolean;
}

export interface WorkflowDetail {
  workflow: WorkflowSummary;
  stages: WorkflowStage[];
}

/** Editable stage shape: `id` present = update in place, absent = new (§11.14). */
export interface StageInput {
  id?: string;
  name: string;
  description?: string | null;
  dueOffsetDays?: number | null;
  deliverable?: string | null;
  responsibleRole?: ResponsibleRole | null;
  requiresSubmission?: boolean;
  requiresReview?: boolean;
  requiresApproval?: boolean;
}

export interface CreateWorkflowInput {
  name: string;
  program?: string | null;
  academicSession?: string | null;
  description?: string | null;
  stages: StageInput[];
}

/** PATCH /workflows/:workflowId — metadata and/or stages and/or isDefault. */
export interface PatchWorkflowInput {
  name?: string;
  program?: string | null;
  academicSession?: string | null;
  description?: string | null;
  archived?: boolean;
  /** PROPOSED delta 2026-10-04 — §16.3 "set default" (flips LOCKED Phase 16). */
  isDefault?: boolean;
  stages?: StageInput[];
}

export interface WorkflowsPageArgs {
  page: number;
  limit: number;
  program?: string;
  includeArchived?: boolean;
}

export interface WorkflowsPage {
  items: WorkflowSummary[];
  total: number;
  page: number;
  limit: number;
}

/* ------------------------------------------------- Monitoring §4.6 (read-only) */

/** §11.13 derived feed entry — assembled at read time, never an event row. */
export interface ActivityItem {
  id: string;
  at: string;
  kind: string;
  actorName: string | null;
  summary: string;
}

export interface MonitoringProjectRow {
  id: string;
  title: string;
  studentName: string;
  status: ProjectStatus;
  /** Current stage name; null = no workflow materialised or all completed. */
  currentStage: string | null;
  /** Position of the current stage, null when there is none. */
  currentStagePosition: number | null;
}

export interface MonitoringSummary {
  counts: { total: number; active: number; completed: number; archived: number };
  /** First page of projects, each with its live tracker + activity (§4.6). */
  projects: MonitoringProjectRow[];
  /** Merged `stage.*` feed across those projects, newest first (capped). */
  feed: ActivityItem[];
}

/* ------------------------------------------------------------- Reports §16.3 */

export interface ReportCounts {
  students: number;
  faculty: number;
  projectsTotal: number;
  projectsActive: number;
  projectsCompleted: number;
  projectsArchived: number;
  proposalsTotal: number;
  proposalsDraft: number;
  proposalsSubmitted: number;
  proposalsUnderReview: number;
  proposalsRevisionRequired: number;
  proposalsApproved: number;
  proposalsRejected: number;
}

export type ReportKey = 'projects' | 'students' | 'faculty' | 'proposals' | 'assignments';

/** A ready-to-serialize CSV payload (built on click — `lib/csv.ts`, §16.3). */
export interface ReportDataset {
  key: ReportKey;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  /** Honest caveat when the dataset is capped or partial. */
  note?: string;
}
