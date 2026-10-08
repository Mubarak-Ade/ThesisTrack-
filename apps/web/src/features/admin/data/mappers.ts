/**
 * One mapper per API shape (spec §4, Rule 2) — field-level defence only.
 * Structure-level drift (missing arrays) throws so the screen lands on
 * ErrorState rather than rendering half a table (these repos never fall
 * back to fixtures — see `types.ts`).
 */
import type {
  ActivityItem,
  AssignmentEntry,
  AssignmentSupervisor,
  DirectoryStudent,
  DirectorySupervisor,
  ProjectStatus,
  ReportCounts,
  ReportDataset,
  ReportKey,
  ResponsibleRole,
  WorkflowStage,
  WorkflowSummary,
} from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function requireArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${where}: array missing — response shape changed`);
  return value;
}

function name(r: Record<string, unknown>): string {
  return `${str(r.firstName)} ${str(r.lastName)}`.trim();
}

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'completed', 'archived'];

function projectStatus(value: unknown): ProjectStatus {
  return PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : 'active';
}

const RESPONSIBLE_ROLES: ResponsibleRole[] = ['student', 'supervisor', 'administrator'];

function responsibleRole(value: unknown): ResponsibleRole | null {
  return RESPONSIBLE_ROLES.includes(value as ResponsibleRole) ? (value as ResponsibleRole) : null;
}

/** ISO pass-through; Date objects and drift become strings, never `undefined`. */
function when(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  return '';
}

/* ------------------------------------------------------------- envelope probes */

export interface Envelope<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** `{<key>, pagination:{page,limit,total}}` — the §11.2/§11.0.2 list shape. */
export function mapPaged<T>(
  value: unknown,
  key: string,
  mapRow: (raw: unknown) => T,
): Envelope<T> {
  const r = asRecord(value);
  const items = requireArray(r[key], `GET list \`${key}\``).map(mapRow);
  const p = asRecord(r.pagination);
  return {
    items,
    total: num(p.total, items.length),
    page: num(p.page, 1),
    limit: num(p.limit, items.length || 20),
  };
}

/* ------------------------------------------------------------------ Projects */

export function mapProjectRow(raw: unknown): import('./types').AdminProjectRow {
  const r = asRecord(raw);
  const student = asRecord(r.student);
  return {
    id: str(r.id),
    title: str(r.title),
    studentName: name(student) || 'Unknown student',
    studentEmail: str(student.email),
    status: projectStatus(r.status),
    workflowId: nullableStr(r.workflowId),
    createdAt: when(r.createdAt),
    updatedAt: when(r.updatedAt),
  };
}

/* -------------------------------------------------- users directory (§11.0.2) */

export function mapStudentRow(raw: unknown): DirectoryStudent {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    name: name(r) || 'Unknown',
    email: str(r.email),
    program: nullableStr(r.program),
    isActive: bool(r.isActive),
    createdAt: when(r.createdAt),
  };
}

export function mapSupervisorRow(raw: unknown): DirectorySupervisor {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    name: name(r) || 'Unknown',
    email: str(r.email),
    isActive: bool(r.isActive),
  };
}

/* ------------------------------------------------------ supervisor assignment */

export function mapSupervisor(raw: unknown): AssignmentSupervisor {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    name: name(r) || 'Unknown supervisor',
    email: str(r.email),
    isActive: bool(r.isActive, true),
  };
}

export function mapAssignmentEntry(raw: unknown): AssignmentEntry {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    projectId: nullableStr(r.projectId),
    isPrimary: bool(r.isPrimary),
    assignedAt: nullableStr(r.assignedAt) ?? (r.assignedAt instanceof Date ? r.assignedAt.toISOString() : null),
    endedAt: r.endedAt instanceof Date ? r.endedAt.toISOString() : nullableStr(r.endedAt),
    supervisor: mapSupervisor(r.supervisor),
  };
}

/** GET /students/:id/supervisor → `{active, history}` (§11.1). */
export function mapStudentAssignment(value: unknown): import('./types').StudentAssignment {
  const r = asRecord(value);
  const active = r.active === null || r.active === undefined ? null : mapAssignmentEntry(r.active);
  const history = Array.isArray(r.history) ? r.history.map(mapAssignmentEntry) : [];
  return { active, history };
}

/* --------------------------------------------------------------- workflows */

export function mapWorkflowSummary(raw: unknown): WorkflowSummary {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    name: str(r.name),
    program: nullableStr(r.program),
    academicSession: nullableStr(r.academicSession),
    description: nullableStr(r.description),
    isDefault: bool(r.isDefault),
    archivedAt: r.archivedAt instanceof Date ? r.archivedAt.toISOString() : nullableStr(r.archivedAt),
    createdAt: when(r.createdAt),
    updatedAt: when(r.updatedAt),
  };
}

export function mapWorkflowStage(raw: unknown): WorkflowStage {
  const r = asRecord(raw);
  return {
    id: str(r.id),
    position: num(r.position, 1),
    name: str(r.name),
    description: nullableStr(r.description),
    dueOffsetDays: typeof r.dueOffsetDays === 'number' ? r.dueOffsetDays : null,
    deliverable: nullableStr(r.deliverable),
    responsibleRole: responsibleRole(r.responsibleRole),
    requiresSubmission: bool(r.requiresSubmission),
    requiresReview: bool(r.requiresReview),
    requiresApproval: bool(r.requiresApproval),
  };
}

/** GET /workflows/:workflowId → `{workflow, stages}` (§11.14). */
export function mapWorkflowDetail(value: unknown): import('./types').WorkflowDetail {
  const r = asRecord(value);
  if (!r.workflow) throw new Error('GET /workflows/:id: `workflow` missing — shape changed');
  return {
    workflow: mapWorkflowSummary(r.workflow),
    stages: requireArray(r.stages, 'GET /workflows/:id `stages`').map(mapWorkflowStage),
  };
}

/* -------------------------------------------------- activity feed (§11.13) */

export function mapActivityItem(raw: unknown): ActivityItem {
  const r = asRecord(raw);
  const actor = r.actor === null || r.actor === undefined ? null : asRecord(r.actor);
  return {
    id: str(r.id),
    at: when(r.at),
    kind: str(r.kind),
    actorName: actor ? str(actor.name) : null,
    summary: str(r.summary),
  };
}

/** GET /projects/:id/activity → `{activity}`. */
export function mapActivityFeed(value: unknown): ActivityItem[] {
  return requireArray(asRecord(value).activity, 'GET /projects/:id/activity `activity`').map(
    mapActivityItem,
  );
}

/** GET /projects/:id/stages → `{stages, current}`; `current` may be null. */
export function mapCurrentStage(value: unknown): { name: string; position: number } | null {
  const r = asRecord(value);
  if (r.current === null || r.current === undefined) return null;
  const current = asRecord(r.current);
  return { name: str(current.name, 'Unnamed stage'), position: num(current.position, 1) };
}

/* -------------------------------------------------------------- pagination */

export function mapPagination(value: unknown): { total: number } {
  return { total: num(asRecord(asRecord(value).pagination).total, 0) };
}

/* ----------------------------------------------------------------- reports */

export function mapReportCounts(value: unknown): ReportCounts {
  // Built by the repo from several probe envelopes; here we only defend.
  const r = asRecord(value);
  return {
    students: num(r.students),
    faculty: num(r.faculty),
    projectsTotal: num(r.projectsTotal),
    projectsActive: num(r.projectsActive),
    projectsCompleted: num(r.projectsCompleted),
    projectsArchived: num(r.projectsArchived),
    proposalsTotal: num(r.proposalsTotal),
    proposalsDraft: num(r.proposalsDraft),
    proposalsSubmitted: num(r.proposalsSubmitted),
    proposalsUnderReview: num(r.proposalsUnderReview),
    proposalsRevisionRequired: num(r.proposalsRevisionRequired),
    proposalsApproved: num(r.proposalsApproved),
    proposalsRejected: num(r.proposalsRejected),
  };
}

export type { ReportDataset, ReportKey };
