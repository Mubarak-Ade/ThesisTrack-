/**
 * One mapper per API shape (§10.4 Rule 2), the features/project discipline:
 * fields picked explicitly, list envelopes strict (drift throws → repo falls
 * back or the screen shows an honest error).
 */
import type { FeedbackEntry } from '@/components/project/FeedbackThread';
import type {
  AwaitingProposal,
  AwaitingSubmission,
  CaseloadStudent,
  DashboardDeadline,
  Milestone,
  Person,
  ProjectStage,
  ReviewDecision,
  StageTracker,
  Submission,
  SubmissionReview,
  SubmissionVersion,
  SupervisedProject,
} from './types';

const MILESTONE_STATES = ['pending', 'in_progress', 'submitted', 'approved', 'overdue'];
const MILESTONE_STATUSES = ['pending', 'in_progress', 'submitted', 'approved'];
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
const REVIEW_DECISIONS = ['approved', 'revision_required', 'rejected'];
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

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function mapPerson(value: unknown): Person | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    email: str(r.email),
  };
}

/** `{students: CaseloadEntry[]}` (§11.1) — one row per active assignment. */
export function mapCaseloadStudent(value: unknown): CaseloadStudent | null {
  const r = asRecord(value);
  const student = mapPerson(r.student);
  if (typeof r.id !== 'string' || !student) return null;
  return {
    assignmentId: r.id,
    projectId: nullableStr(r.projectId),
    assignedAt: str(r.assignedAt),
    isPrimary: r.isPrimary === true,
    student,
  };
}

export function mapProject(value: unknown): SupervisedProject | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  const status = str(r.status, 'active');
  return {
    id: r.id,
    title: r.title,
    description: str(r.description),
    status: (PROJECT_STATUSES.includes(status)
      ? status
      : 'active') as SupervisedProject['status'],
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
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
    status: (MILESTONE_STATUSES.includes(status)
      ? status
      : 'pending') as Milestone['status'],
    state: (MILESTONE_STATES.includes(state) ? state : 'pending') as Milestone['state'],
    completedAt: nullableStr(r.completedAt),
  };
}

export function mapSubmission(value: unknown): Submission | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  const status = str(r.status, 'draft');
  const submitter = mapPerson(r.submitter);
  if (!submitter) return null;
  return {
    id: r.id,
    projectId: str(r.projectId),
    milestoneId: nullableStr(r.milestoneId),
    title: r.title,
    status: (SUBMISSION_STATUSES.includes(status)
      ? status
      : 'draft') as Submission['status'],
    submittedAt: nullableStr(r.submittedAt),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    submitter,
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

export function mapReview(value: unknown): SubmissionReview | null {
  const r = asRecord(value);
  const decision = str(r.decision);
  const reviewer = mapPerson(r.reviewer);
  if (typeof r.id !== 'string' || !REVIEW_DECISIONS.includes(decision) || !reviewer) return null;
  return {
    id: r.id,
    decision: decision as ReviewDecision,
    comment: nullableStr(r.comment),
    createdAt: str(r.createdAt),
    reviewer,
  };
}

/** §11.7 discussion row (never a decision). */
export function mapFeedback(value: unknown): FeedbackEntry | null {
  const r = asRecord(value);
  const author = mapPerson(r.author);
  if (typeof r.id !== 'string' || typeof r.body !== 'string' || !author) return null;
  return {
    id: r.id,
    projectId: str(r.projectId),
    submissionId: nullableStr(r.submissionId),
    body: r.body,
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    author,
  };
}

/** §8.11/§11.14 one materialised stage (snapshot + computed dueAt/overdue). */
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
    requiresSubmission: r.requiresSubmission === true,
    requiresReview: r.requiresReview === true,
    requiresApproval: r.requiresApproval === true,
    startedAt: nullableStr(r.startedAt),
    completedAt: nullableStr(r.completedAt),
    dueOffsetDays: typeof r.dueOffsetDays === 'number' ? r.dueOffsetDays : null,
    dueAt: nullableStr(r.dueAt),
    overdue: r.overdue === true,
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

/* --------------------------------------------------------- dashboard glue */

/** One proposal row from `GET /proposals`, kept only when it awaits review. */
export function mapAwaitingProposal(value: unknown): AwaitingProposal | null {
  const r = asRecord(value);
  const status = str(r.status);
  const student = mapPerson(r.student);
  if (typeof r.id !== 'string' || typeof r.title !== 'string' || !student) return null;
  if (status !== 'submitted' && status !== 'under_review') return null;
  return {
    id: r.id,
    title: r.title,
    version: num(r.version, 1),
    status,
    student,
    submittedAt: nullableStr(r.submittedAt),
  };
}

/**
 * Build one awaiting-submission row; returns null when the join keys are
 * missing (a submission whose student left the caseload would be a lie).
 */
export function buildAwaitingSubmission(
  submission: Submission,
  studentId: string,
  studentName: string,
): AwaitingSubmission {
  return {
    id: submission.id,
    projectId: submission.projectId,
    studentId,
    studentName,
    title: submission.title,
    submittedAt: submission.submittedAt,
  };
}

/** One upcoming deadline, sorted by `dueAt` at the call site. */
export function buildDeadline(
  milestone: Milestone,
  studentId: string,
  studentName: string,
  now: number,
): DashboardDeadline | null {
  if (!milestone.dueAt) return null;
  const due = Date.parse(milestone.dueAt);
  if (Number.isNaN(due)) return null;
  return {
    milestoneId: milestone.id,
    projectId: milestone.projectId,
    studentId,
    studentName,
    title: milestone.title,
    dueAt: milestone.dueAt,
    overdue: due < now,
  };
}
