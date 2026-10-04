/**
 * Supervisor-caseload repository (§11.1/§11.4–§11.7/§11.14, §10.4):
 *  - list reads (caseload, dashboard) live first, fixture fallback with
 *    `usedFallback`;
 *  - detail reads surface honest errors (never a fake "not found");
 *  - writes always surface errors (Rule 3: never fake success).
 */
import { api } from '@/lib/api/http';
import { downloadFile } from '@/lib/api/files';
import {
  buildAwaitingSubmission,
  buildDeadline,
  mapAwaitingProposal,
  mapCaseloadStudent,
  mapFeedback,
  mapMilestone,
  mapProject,
  mapReview,
  mapStageTracker,
  mapSubmission,
  mapVersion,
} from './mappers';
import { CASELOAD_FIXTURES, DASHBOARD_FIXTURE } from './mock/fixtures';
import type {
  AwaitingProposal,
  CaseloadStudent,
  DashboardStudent,
  FeedbackEntry,
  Milestone,
  ReviewDecision,
  StageTracker,
  Submission,
  SubmissionReview,
  SubmissionVersion,
  SupervisedProject,
  SupervisorDashboard,
} from './types';

function warn(scope: string, error: unknown): void {
  console.warn(`[supervisionRepo] ${scope}: using sample data —`, error);
}

/** Strict envelope → rows (throws on drift so callers can fall back). */
function rows<T>(payload: unknown, key: string, map: (value: unknown) => T | null): T[] {
  const list = (payload as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(list)) throw new Error(`${key} envelope missing`);
  return list.map(map).filter((row): row is T => row !== null);
}

/* ------------------------------------------------------------------ reads */

export interface CaseloadPage {
  students: CaseloadStudent[];
  usedFallback: boolean;
}

/** GET /supervisors/me/students — §6.2 I13, one row per active assignment. */
export async function listCaseload(): Promise<CaseloadPage> {
  try {
    const payload = await api.get<{ students?: unknown }>('/supervisors/me/students');
    return { students: rows(payload, 'students', mapCaseloadStudent), usedFallback: false };
  } catch (error) {
    warn('listCaseload', error);
    return { students: CASELOAD_FIXTURES, usedFallback: true };
  }
}

export async function getProject(projectId: string): Promise<SupervisedProject> {
  const payload = await api.get<{ project?: unknown }>(`/projects/${projectId}`);
  const project = mapProject(payload?.project);
  if (!project) throw new Error('project envelope missing');
  return project;
}

export async function getStageTracker(projectId: string): Promise<StageTracker> {
  return mapStageTracker(await api.get<unknown>(`/projects/${projectId}/stages`));
}

export async function listMilestones(projectId: string): Promise<Milestone[]> {
  const payload = await api.get<{ milestones?: unknown }>(`/projects/${projectId}/milestones`);
  return rows(payload, 'milestones', mapMilestone);
}

export async function listSubmissions(projectId: string): Promise<Submission[]> {
  const payload = await api.get<{ submissions?: unknown }>(`/projects/${projectId}/submissions`);
  return rows(payload, 'submissions', mapSubmission);
}

/** The §16.4/§11.6 review screen's four reads — the submission gates them. */
export interface SubmissionBundle {
  submission: Submission;
  versions: SubmissionVersion[];
  reviews: SubmissionReview[];
  feedback: FeedbackEntry[];
}

export async function getSubmissionBundle(
  submissionId: string,
): Promise<SubmissionBundle | null> {
  let submission: Submission | null;
  try {
    const payload = await api.get<{ submission?: unknown }>(`/submissions/${submissionId}`);
    submission = mapSubmission(payload?.submission);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
  if (!submission) return null;

  const [versions, reviews, feedback] = await Promise.all([
    api
      .get<{ versions?: unknown }>(`/submissions/${submissionId}/versions`)
      .then((payload) => rows(payload, 'versions', mapVersion)),
    api
      .get<{ reviews?: unknown }>(`/submissions/${submissionId}/reviews`)
      .then((payload) => rows(payload, 'reviews', mapReview)),
    api
      .get<{ feedback?: unknown }>(`/submissions/${submissionId}/feedback`)
      .then((payload) => rows(payload, 'feedback', mapFeedback)),
  ]);
  return { submission, versions, reviews, feedback };
}

export async function listProjectFeedback(projectId: string): Promise<FeedbackEntry[]> {
  const payload = await api.get<{ feedback?: unknown }>(`/projects/${projectId}/feedback`);
  return rows(payload, 'feedback', mapFeedback);
}

/* ------------------------------------------------------- dashboard (§16.3) */

async function liveDashboard(): Promise<SupervisorDashboard> {
  const [caseload, projectsPayload, proposalsPayload] = await Promise.all([
    api
      .get<{ students?: unknown }>('/supervisors/me/students')
      .then((payload) => rows(payload, 'students', mapCaseloadStudent)),
    api.get<{ projects?: unknown }>('/projects?page=1&limit=50'),
    api.get<{ proposals?: unknown }>('/proposals?page=1&limit=50'),
  ]);

  const projectRows = rows(projectsPayload, 'projects', mapProject);
  const titles = new Map(projectRows.map((project) => [project.id, project.title]));
  const awaitingProposals: AwaitingProposal[] = rows(proposalsPayload, 'proposals', mapAwaitingProposal);

  const withProjects = caseload.filter((entry) => entry.projectId !== null);
  const facts = await Promise.all(
    withProjects.map(async (entry) => {
      const projectId = entry.projectId!;
      const [tracker, milestones, submissions] = await Promise.all([
        getStageTracker(projectId),
        listMilestones(projectId),
        listSubmissions(projectId),
      ]);
      return { entry, projectId, tracker, milestones, submissions };
    }),
  );

  const stageNames = new Map<string, string | null>(
    facts.map((fact) => [fact.projectId, fact.tracker.current?.name ?? null]),
  );

  const students: DashboardStudent[] = caseload.map((entry) => ({
    student: entry.student,
    projectId: entry.projectId,
    projectTitle: entry.projectId ? (titles.get(entry.projectId) ?? null) : null,
    stageName: entry.projectId ? (stageNames.get(entry.projectId) ?? null) : null,
  }));

  const names = new Map(caseload.map((entry) => [entry.student.id, entry.student]));
  const nameOf = (studentId: string): string => {
    const person = names.get(studentId);
    return person ? `${person.firstName} ${person.lastName}` : 'Student';
  };

  const awaitingSubmissions = facts.flatMap((fact) =>
    fact.submissions
      .filter(
        (row) => row.status === 'submitted' || row.status === 'under_review',
      )
      .map((row) => buildAwaitingSubmission(row, fact.entry.student.id, nameOf(fact.entry.student.id))),
  );

  const now = Date.now();
  const deadlines = facts
    .flatMap((fact) =>
      fact.milestones.map((milestone) =>
        buildDeadline(milestone, fact.entry.student.id, nameOf(fact.entry.student.id), now),
      ),
    )
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

  return {
    students,
    awaitingProposals: awaitingProposals.sort((a, b) =>
      String(b.submittedAt).localeCompare(String(a.submittedAt)),
    ),
    awaitingSubmissions: awaitingSubmissions.sort((a, b) =>
      String(b.submittedAt).localeCompare(String(a.submittedAt)),
    ),
    deadlines,
    usedFallback: false,
  };
}

/** §16.3 dashboard aggregate — fixture fallback on any transport/shape failure. */
export async function getSupervisorDashboard(): Promise<SupervisorDashboard> {
  try {
    return await liveDashboard();
  } catch (error) {
    warn('getSupervisorDashboard', error);
    return DASHBOARD_FIXTURE;
  }
}

/* ----------------------------------------------------------------- writes */

/** §11.14 advance — the 422 `unmet[]` surfaces through the error message. */
export async function advanceStage(projectId: string): Promise<StageTracker> {
  return mapStageTracker(await api.post<unknown>(`/projects/${projectId}/stages/advance`));
}

/* Milestones (§11.4) — assigned supervisor / admin. */

export interface MilestoneInput {
  title: string;
  description?: string | null;
  dueAt?: string | null;
}

export async function createMilestone(
  projectId: string,
  input: MilestoneInput,
): Promise<Milestone> {
  const payload = await api.post<{ milestone?: unknown }>(
    `/projects/${projectId}/milestones`,
    input,
  );
  const milestone = mapMilestone(payload?.milestone);
  if (!milestone) throw new Error('Malformed create-milestone response');
  return milestone;
}

export async function patchMilestone(
  milestoneId: string,
  input: Partial<MilestoneInput>,
): Promise<Milestone> {
  const payload = await api.patch<{ milestone?: unknown }>(`/milestones/${milestoneId}`, input);
  const milestone = mapMilestone(payload?.milestone);
  if (!milestone) throw new Error('Malformed patch-milestone response');
  return milestone;
}

export async function deleteMilestone(milestoneId: string): Promise<Milestone> {
  const payload = await api.delete<{ milestone?: unknown }>(`/milestones/${milestoneId}`);
  const milestone = mapMilestone(payload?.milestone);
  if (!milestone) throw new Error('Malformed delete-milestone response');
  return milestone;
}

export async function reorderMilestones(
  projectId: string,
  order: string[],
): Promise<Milestone[]> {
  const payload = await api.put<{ milestones?: unknown }>(
    `/projects/${projectId}/milestones/reorder`,
    { order },
  );
  return rows(payload, 'milestones', mapMilestone);
}

/** §11.4 supervisor may set any target; `approved` stamps completed_at. */
export async function changeMilestoneStatus(
  milestoneId: string,
  status: Milestone['status'],
): Promise<Milestone> {
  const payload = await api.post<{ milestone?: unknown }>(`/milestones/${milestoneId}/status`, {
    status,
  });
  const milestone = mapMilestone(payload?.milestone);
  if (!milestone) throw new Error('Malformed milestone-status response');
  return milestone;
}

/* Submission review (§11.6). */

export async function reviewSubmission(
  submissionId: string,
  input: { decision: ReviewDecision; comment?: string },
): Promise<{ review: SubmissionReview; submission: Submission }> {
  const payload = await api.post<{ review?: unknown; submission?: unknown }>(
    `/submissions/${submissionId}/reviews`,
    input,
  );
  const review = mapReview(payload?.review);
  const submission = mapSubmission(payload?.submission);
  if (!review || !submission) throw new Error('Malformed review-submission response');
  return { review, submission };
}

/* Feedback (§11.7) — messages, never decisions. */

export async function postFeedback(projectId: string, body: string): Promise<FeedbackEntry> {
  const payload = await api.post<{ feedback?: unknown }>(`/projects/${projectId}/feedback`, {
    body,
  });
  const entry = mapFeedback(payload?.feedback);
  if (!entry) throw new Error('Malformed feedback response');
  return entry;
}

export async function postSubmissionFeedback(
  submissionId: string,
  body: string,
): Promise<FeedbackEntry> {
  const payload = await api.post<{ feedback?: unknown }>(`/submissions/${submissionId}/feedback`, {
    body,
  });
  const entry = mapFeedback(payload?.feedback);
  if (!entry) throw new Error('Malformed feedback response');
  return entry;
}

export async function patchFeedback(feedbackId: string, body: string): Promise<FeedbackEntry> {
  const payload = await api.patch<{ feedback?: unknown }>(`/feedback/${feedbackId}`, { body });
  const entry = mapFeedback(payload?.feedback);
  if (!entry) throw new Error('Malformed feedback response');
  return entry;
}

export async function deleteFeedback(feedbackId: string): Promise<void> {
  await api.delete(`/feedback/${feedbackId}`);
}

/** §14.5 — authenticated byte download of a submission version. */
export async function downloadVersion(version: SubmissionVersion): Promise<void> {
  await downloadFile(
    `/submission-versions/${version.id}/download`,
    version.originalFilename ?? `version-${version.versionNumber}.txt`,
  );
}
