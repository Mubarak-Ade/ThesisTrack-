/**
 * My Project repository (§11.2/§11.4/§11.5/§11.7/§11.13/§11.14, §10.4):
 *  - reads → live first; the Overview bundle falls back to a fixture with
 *    `usedFallback`, individual lists degrade to empty on shape drift only
 *    after trying the live path;
 *  - writes → always surface errors (Rule 3: never fake success).
 */
import { ApiError, api } from '@/lib/api/http';
import { uploadFile, downloadFile, type UploadProgress } from '@/lib/api/files';
import {
  mapActivity,
  mapFeedback,
  mapMilestone,
  mapProject,
  mapStageTracker,
  mapSubmission,
  mapVersion,
} from './mappers';
import { PROJECT_FIXTURE } from './mock/fixtures';
import type {
  ActivityEntry,
  CreateSubmissionInput,
  FeedbackEntry,
  Milestone,
  ProjectBundle,
  ProjectStage,
  ProjectSummary,
  StageTracker,
  Submission,
  SubmissionVersion,
  SupervisorAssignment,
} from './types';

function warn(scope: string, error: unknown): void {
  console.warn(`[projectRepo] ${scope}: using sample data —`, error);
}

/** Strict envelope → rows (throws on drift so callers can fall back). */
function rows<T>(payload: unknown, key: string, map: (value: unknown) => T | null): T[] {
  const list = (payload as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(list)) throw new Error(`${key} envelope missing`);
  return list.map(map).filter((row): row is T => row !== null);
}

/* ------------------------------------------------------------------ reads */

/** §11.2 scoped list — a student's own projects; first active row wins. */
export async function listMyProjects(): Promise<ProjectSummary[]> {
  const payload = await api.get<{ projects?: unknown }>('/projects?page=1&limit=50');
  return rows(payload, 'projects', mapProject);
}

export async function getProject(projectId: string): Promise<ProjectSummary> {
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

/** §11.1 `GET /projects/:projectId/supervisor` — bare `{active, history}`. */
export async function getSupervisor(projectId: string): Promise<SupervisorAssignment | null> {
  try {
    const payload = (await api.get<{ active?: unknown }>(
      `/projects/${projectId}/supervisor`,
    )) as Record<string, unknown>;
    const active = payload?.active;
    if (!active || typeof active !== 'object') return null;
    const supervisor = (active as Record<string, unknown>).supervisor;
    const person = supervisor as Record<string, unknown> | undefined;
    if (!person || typeof person.id !== 'string') return null;
    return {
      assignedAt: String((active as Record<string, unknown>).assignedAt ?? ''),
      supervisor: {
        id: person.id,
        firstName: String(person.firstName ?? ''),
        lastName: String(person.lastName ?? ''),
        email: String(person.email ?? ''),
      },
    };
  } catch {
    return null;
  }
}

export interface OverviewBundleArgs {
  /** When true (and only on failure) a fixture answers with `usedFallback`. */
  allowFallback?: boolean;
}

/** Overview's four reads in one call — extras degrade, the project does not. */
export async function getOverviewBundle(
  projectId: string,
  args: OverviewBundleArgs = {},
): Promise<ProjectBundle> {
  try {
    const [project, tracker, milestones, supervisor] = await Promise.all([
      getProject(projectId),
      getStageTracker(projectId),
      listMilestones(projectId),
      getSupervisor(projectId),
    ]);
    return { project, tracker, milestones, supervisor, usedFallback: false };
  } catch (error) {
    if (!args.allowFallback) throw error;
    warn('getOverviewBundle', error);
    return PROJECT_FIXTURE;
  }
}

export async function listSubmissions(
  projectId: string,
  filter: { milestoneId?: string; status?: string } = {},
): Promise<Submission[]> {
  const params = new URLSearchParams();
  if (filter.milestoneId) params.set('milestoneId', filter.milestoneId);
  if (filter.status) params.set('status', filter.status);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const payload = await api.get<{ submissions?: unknown }>(
    `/projects/${projectId}/submissions${suffix}`,
  );
  return rows(payload, 'submissions', mapSubmission);
}

export async function getSubmission(submissionId: string): Promise<Submission | null> {
  try {
    const payload = await api.get<{ submission?: unknown }>(`/submissions/${submissionId}`);
    return mapSubmission(payload?.submission);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** §11.5 immutable history — newest first, never editable (I7). */
export async function listVersions(submissionId: string): Promise<SubmissionVersion[]> {
  const payload = await api.get<{ versions?: unknown }>(`/submissions/${submissionId}/versions`);
  return rows(payload, 'versions', mapVersion);
}

export async function listProjectFeedback(projectId: string): Promise<FeedbackEntry[]> {
  const payload = await api.get<{ feedback?: unknown }>(`/projects/${projectId}/feedback`);
  return rows(payload, 'feedback', mapFeedback);
}

export async function listSubmissionFeedback(submissionId: string): Promise<FeedbackEntry[]> {
  const payload = await api.get<{ feedback?: unknown }>(`/submissions/${submissionId}/feedback`);
  return rows(payload, 'feedback', mapFeedback);
}

/** §11.6 the formal decision on a submission (supervisor's review). */
export async function listSubmissionReviews(
  submissionId: string,
): Promise<Array<{ id: string; decision: string; comment: string | null; createdAt: string }>> {
  try {
    const payload = await api.get<{ reviews?: unknown }>(`/submissions/${submissionId}/reviews`);
    const list = (payload as Record<string, unknown>)?.reviews;
    if (!Array.isArray(list)) return [];
    return list
      .map((entry) => {
        const r = (entry ?? {}) as Record<string, unknown>;
        if (typeof r.id !== 'string' || typeof r.decision !== 'string') return null;
        return {
          id: r.id,
          decision: r.decision,
          comment: typeof r.comment === 'string' ? r.comment : null,
          createdAt: String(r.createdAt ?? ''),
        };
      })
      .filter((entry): entry is { id: string; decision: string; comment: string | null; createdAt: string } => entry !== null);
  } catch {
    return [];
  }
}

export async function getActivity(projectId: string): Promise<ActivityEntry[]> {
  const payload = await api.get<{ activity?: unknown }>(`/projects/${projectId}/activity`);
  return rows(payload, 'activity', mapActivity);
}

/* ----------------------------------------------------------------- writes */

/** §11.5 — JSON (`body`) or multipart (`file`); progress for task 11.4. */
export async function createSubmission(
  input: CreateSubmissionInput,
  file?: File,
  onProgress?: UploadProgress,
): Promise<Submission> {
  let payload: { submission?: unknown };
  if (file) {
    const form = new FormData();
    form.append('projectId', input.projectId);
    form.append('title', input.title);
    if (input.milestoneId) form.append('milestoneId', input.milestoneId);
    form.append('file', file);
    payload = await uploadFile<{ submission?: unknown }>('/submissions', form, onProgress);
  } else {
    payload = await api.post<{ submission?: unknown }>('/submissions', {
      projectId: input.projectId,
      title: input.title,
      ...(input.body ? { body: input.body } : {}),
      ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
    });
  }
  const submission = mapSubmission(payload?.submission);
  if (!submission) throw new Error('Malformed create-submission response');
  return submission;
}

export async function patchSubmission(
  submissionId: string,
  input: { title?: string; body?: string; milestoneId?: string | null },
): Promise<Submission> {
  const payload = await api.patch<{ submission?: unknown }>(`/submissions/${submissionId}`, input);
  const submission = mapSubmission(payload?.submission);
  if (!submission) throw new Error('Malformed patch-submission response');
  return submission;
}

export async function submitSubmission(submissionId: string): Promise<Submission> {
  const payload = await api.post<{ submission?: unknown }>(`/submissions/${submissionId}/submit`);
  const submission = mapSubmission(payload?.submission);
  if (!submission) throw new Error('Malformed submit-submission response');
  return submission;
}

/** §11.5 append a new immutable version — multipart file or text body. */
export async function appendVersion(
  submissionId: string,
  input: { body?: string; file?: File },
  onProgress?: UploadProgress,
): Promise<SubmissionVersion> {
  let payload: { version?: unknown };
  if (input.file) {
    const form = new FormData();
    form.append('file', input.file);
    payload = await uploadFile<{ version?: unknown }>(
      `/submissions/${submissionId}/versions`,
      form,
      onProgress,
    );
  } else {
    payload = await api.post<{ version?: unknown }>(`/submissions/${submissionId}/versions`, {
      body: input.body ?? '',
    });
  }
  const version = mapVersion(payload?.version);
  if (!version) throw new Error('Malformed append-version response');
  return version;
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  await api.delete(`/submissions/${submissionId}`);
}

/** §11.4 student path: pending → in_progress → submitted (server-enforced). */
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

export async function postFeedback(projectId: string, body: string): Promise<FeedbackEntry> {
  const payload = await api.post<{ feedback?: unknown }>(`/projects/${projectId}/feedback`, {
    body,
  });
  const entry = mapFeedback(payload?.feedback);
  if (!entry) throw new Error('Malformed feedback response');
  return entry;
}

/** §11.7 submission-scoped discussion (the thread on a submission detail). */
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

export type { ProjectStage };
