/**
 * One mapper per API shape (§10.4 Rule 2): fields picked explicitly; every
 * list envelope is strict (drift throws → repo falls back).
 */
import type {
  ActivityEntry,
  FeedbackEntry,
  Milestone,
  ProjectStage,
  ProjectSummary,
  StageTracker,
  Submission,
  SubmissionVersion,
} from './types';

const MILESTONE_STATES = ['pending', 'in_progress', 'submitted', 'approved', 'overdue'];
const SUBMISSION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
];
const STAGE_STATUSES = ['pending', 'active', 'completed'];
const PROJECT_STATUSES = ['active', 'completed', 'archived'];
const ROLES = ['student', 'supervisor', 'administrator'];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mapPerson(value: unknown): {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
} {
  const r = asRecord(value);
  return {
    id: str(r.id),
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    email: str(r.email),
  };
}

export function mapProject(value: unknown): ProjectSummary | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  const status = str(r.status, 'active');
  return {
    id: r.id,
    title: r.title,
    description: str(r.description),
    status: (PROJECT_STATUSES.includes(status) ? status : 'active') as ProjectSummary['status'],
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    student:
      typeof r.student === 'object' && r.student !== null ? mapPerson(r.student) : undefined,
  };
}

export function mapStage(value: unknown): ProjectStage | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const status = str(r.status, 'pending');
  const responsible = nullableStr(r.responsibleRole);
  return {
    id: r.id,
    position: num(r.position),
    status: (STAGE_STATUSES.includes(status) ? status : 'pending') as ProjectStage['status'],
    name: r.name,
    description: nullableStr(r.description),
    deliverable: nullableStr(r.deliverable),
    responsibleRole: (responsible && ROLES.includes(responsible)
      ? responsible
      : null) as ProjectStage['responsibleRole'],
    requiresSubmission: bool(r.requiresSubmission),
    requiresReview: bool(r.requiresReview),
    requiresApproval: bool(r.requiresApproval),
    startedAt: nullableStr(r.startedAt),
    completedAt: nullableStr(r.completedAt),
    dueOffsetDays: typeof r.dueOffsetDays === 'number' ? r.dueOffsetDays : null,
    dueAt: nullableStr(r.dueAt),
    overdue: bool(r.overdue),
  };
}

/** `{stages, current}` — zero stages is a legal 200 (§3.4), not an error. */
export function mapStageTracker(payload: unknown): StageTracker {
  const r = asRecord(payload);
  const raw = r.stages;
  if (!Array.isArray(raw)) throw new Error('stages envelope missing');
  const stages = raw.map(mapStage).filter((row): row is ProjectStage => row !== null);
  if (r.current === null || r.current === undefined) return { stages, current: null };
  const currentBase = mapStage(r.current);
  if (!currentBase) return { stages, current: null };
  const unmetRaw = asRecord(r.current).unmet;
  return {
    stages,
    current: {
      ...currentBase,
      unmet: Array.isArray(unmetRaw)
        ? unmetRaw.filter((entry): entry is string => typeof entry === 'string')
        : [],
    },
  };
}

export function mapMilestone(value: unknown): Milestone | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  const status = str(r.status, 'pending');
  const state = str(r.state ?? r.status, 'pending');
  return {
    id: r.id,
    projectId: str(r.projectId),
    title: r.title,
    description: nullableStr(r.description),
    position: num(r.position),
    dueAt: nullableStr(r.dueAt),
    status: (MILESTONE_STATES.includes(status) && status !== 'overdue'
      ? status
      : 'pending') as Milestone['status'],
    state: (MILESTONE_STATES.includes(state) ? state : 'pending') as Milestone['state'],
    completedAt: nullableStr(r.completedAt),
  };
}

export function mapSubmission(value: unknown): Submission | null {
  const r = asRecord(value);
  const status = str(r.status, 'draft');
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  return {
    id: r.id,
    projectId: str(r.projectId),
    milestoneId: nullableStr(r.milestoneId),
    title: r.title,
    status: (SUBMISSION_STATUSES.includes(status) ? status : 'draft') as Submission['status'],
    submittedAt: nullableStr(r.submittedAt),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    submitter: mapPerson(r.submitter),
  };
}

export function mapVersion(value: unknown): SubmissionVersion | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    submissionId: str(r.submissionId),
    versionNumber: num(r.versionNumber, 1),
    body: nullableStr(r.body),
    originalFilename: nullableStr(r.originalFilename),
    mimeType: nullableStr(r.mimeType),
    sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : null,
    createdAt: str(r.createdAt),
  };
}

export function mapFeedback(value: unknown): FeedbackEntry | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.body !== 'string') return null;
  return {
    id: r.id,
    projectId: str(r.projectId),
    submissionId: nullableStr(r.submissionId),
    body: r.body,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    author: mapPerson(r.author),
  };
}

export function mapActivity(value: unknown): ActivityEntry | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.summary !== 'string') return null;
  const actor = asRecord(r.actor);
  return {
    id: r.id,
    at: str(r.at),
    kind: str(r.kind),
    actor: typeof actor.id === 'string' ? { id: actor.id, name: str(actor.name) } : null,
    summary: r.summary,
  };
}
