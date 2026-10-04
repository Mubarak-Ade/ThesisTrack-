/**
 * Supervisor caseload domain (§6.2 I13, §11.14, §16.3–§16.5) — Phase 12.
 *
 * Feature-isolation lint keeps this feature off `@/features/**`, so the view
 * types it shares with My Project (stages, feedback) are imported from the
 * shared `components/project/` modules, and everything below is the API
 * surface the supervisor's own screens consume.
 */
import type { FeedbackEntry } from '@/components/project/FeedbackThread';
import type { ProjectStage, StageTracker } from '@/components/project/StageTracker';

export type { FeedbackEntry, ProjectStage, StageTracker };

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * §6.2 I13 / ADR-13 — one row per active assignment, one row per student.
 * `projectId` is null while the assignment predates the student's project,
 * so the caseload lists a student long before a proposal is approved.
 */
export interface CaseloadStudent {
  /** The assignment row's id. */
  assignmentId: string;
  projectId: string | null;
  assignedAt: string;
  isPrimary: boolean;
  student: Person;
}

/** §11.2 project row as the supervisor's scoped list/detail returns it. */
export interface SupervisedProject {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export type MilestoneState = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'overdue';

/** §11.4 milestone — stored status + §5.6 computed state (`overdue` never stored). */
export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  position: number;
  dueAt: string | null;
  status: 'pending' | 'in_progress' | 'submitted' | 'approved';
  state: MilestoneState;
  completedAt: string | null;
}

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'revision_required'
  | 'approved'
  | 'rejected';

/** §11.5 submission row plus the author. */
export interface Submission {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  submitter: Person;
}

/** §5.5 immutable version — `body` or the file trio, never both (§14.2). */
export interface SubmissionVersion {
  id: string;
  submissionId: string;
  versionNumber: number;
  body: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export type ReviewDecision = 'approved' | 'revision_required' | 'rejected';

/** §11.6 formal decision — append-only (I8), reviewer named. */
export interface SubmissionReview {
  id: string;
  decision: ReviewDecision;
  comment: string | null;
  createdAt: string;
  reviewer: Person;
}

/* ------------------------------------------------------- dashboard (§16.3) */

export interface DashboardStudent {
  student: Person;
  projectId: string | null;
  projectTitle: string | null;
  /** Current stage name, or null when the tracker is empty/finished. */
  stageName: string | null;
}

export interface AwaitingProposal {
  id: string;
  title: string;
  version: number;
  status: 'submitted' | 'under_review';
  student: Person;
  submittedAt: string | null;
}

export interface AwaitingSubmission {
  id: string;
  projectId: string;
  studentId: string;
  studentName: string;
  title: string;
  submittedAt: string | null;
}

export interface DashboardDeadline {
  milestoneId: string;
  projectId: string;
  studentId: string;
  studentName: string;
  title: string;
  dueAt: string;
  overdue: boolean;
}

export interface SupervisorDashboard {
  students: DashboardStudent[];
  awaitingProposals: AwaitingProposal[];
  awaitingSubmissions: AwaitingSubmission[];
  deadlines: DashboardDeadline[];
  usedFallback: boolean;
}
