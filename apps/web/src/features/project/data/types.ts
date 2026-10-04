import type { ProjectStage, StageTracker } from '@/components/project/StageTracker';

/** §11.2 project row as the scoped list/detail returns it. */
export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  student?: { id: string; firstName: string; lastName: string; email: string };
}

/** §8.11/§11.14 stage view types live with the shared tracker component
 *  (`components/project/StageTracker`) so both the student's My Project and
 *  the supervisor's caseload render one implementation; re-exported here to
 *  keep this feature's data surface complete. */
export type { ProjectStage, StageTracker };

export type MilestoneState = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'overdue';

/** §11.4 milestone view — stored status + §5.6 computed state. */
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

export interface CreateSubmissionInput {
  projectId: string;
  title: string;
  body?: string;
  milestoneId?: string | null;
}

export interface Submission {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  submitter: { id: string; firstName: string; lastName: string; email: string };
}

/** §11.5 immutable version (I7) — exactly one of body/file populated (§14.2). */
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

/** §11.7 discussion — never a decision (type lives with the shared thread). */
export type { FeedbackEntry } from '@/components/project/FeedbackThread';

/** §11.13 derived feed entry. */
export interface ActivityEntry {
  id: string;
  at: string;
  kind: string;
  actor: { id: string; name: string } | null;
  summary: string;
}

export interface SupervisorAssignment {
  assignedAt: string;
  supervisor: { id: string; firstName: string; lastName: string; email: string };
}

export interface ProjectBundle {
  project: ProjectSummary;
  tracker: StageTracker;
  milestones: Milestone[];
  supervisor: SupervisorAssignment | null;
  usedFallback: boolean;
}
