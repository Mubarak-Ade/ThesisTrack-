import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UploadProgress } from '@/lib/api/files';
import {
  appendVersion,
  changeMilestoneStatus,
  createSubmission,
  deleteFeedback,
  deleteSubmission,
  getActivity,
  getOverviewBundle,
  getStageTracker,
  getSubmission,
  listMilestones,
  listMyProjects,
  listProjectFeedback,
  listSubmissionFeedback,
  listSubmissionReviews,
  listSubmissions,
  listVersions,
  patchFeedback,
  patchSubmission,
  postFeedback,
  postSubmissionFeedback,
  submitSubmission,
} from '../data/projectRepo';
import type { CreateSubmissionInput, Milestone } from '../data/types';

/**
 * §10.4 — TanStack Query is the fetching mechanism for every project read;
 * `useEffect` fetching is REJECTED. Children share one cached project lookup
 * (`['project','mine']`) instead of threading a context through the layout.
 *
 * Writes invalidate the narrowest root that changes:
 *  - `['project', id]` covers stages/milestones/submissions/feedback/activity;
 *  - `['studentDashboard']` + `['shell']` because milestone and submission
 *    moves re-rank the §16.2 state and the §16.5 progress facts.
 */

export function useMyProject() {
  return useQuery({
    queryKey: ['project', 'mine'],
    queryFn: async () => {
      const projects = await listMyProjects();
      return projects.find((row) => row.status === 'active') ?? projects[0] ?? null;
    },
    staleTime: 30_000,
  });
}

function invalidate(client: ReturnType<typeof useQueryClient>, projectId?: string): void {
  void client.invalidateQueries({ queryKey: ['project'] });
  void client.invalidateQueries({ queryKey: ['studentDashboard'] });
  void client.invalidateQueries({ queryKey: ['shell'] });
  if (projectId) void client.invalidateQueries({ queryKey: ['project', projectId] });
}

export function useProjectOverview(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId, 'overview'],
    queryFn: async () => {
      if (!projectId) throw new Error('missing project id');
      return getOverviewBundle(projectId, { allowFallback: true });
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

export function useStageTracker(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId, 'stages'],
    queryFn: async () => {
      if (!projectId) throw new Error('missing project id');
      return getStageTracker(projectId);
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export function useMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId, 'milestones'],
    queryFn: async () => {
      if (!projectId) throw new Error('missing project id');
      return listMilestones(projectId);
    },
    enabled: !!projectId,
    staleTime: 15_000,
  });
}

export function useSubmissions(
  projectId: string | undefined,
  filter: { milestoneId?: string; status?: string } = {},
) {
  return useQuery({
    queryKey: ['project', projectId, 'submissions', filter.milestoneId ?? 'all', filter.status ?? 'all'],
    queryFn: async () => {
      if (!projectId) throw new Error('missing project id');
      return listSubmissions(projectId, filter);
    },
    enabled: !!projectId,
    staleTime: 10_000,
  });
}

export function useSubmission(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'submission', submissionId],
    queryFn: async () => {
      if (!submissionId) throw new Error('missing submission id');
      return getSubmission(submissionId);
    },
    enabled: !!submissionId,
    staleTime: 5_000,
  });
}

export function useSubmissionVersions(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'submission', submissionId, 'versions'],
    queryFn: async () => {
      if (!submissionId) throw new Error('missing submission id');
      return listVersions(submissionId);
    },
    enabled: !!submissionId,
    staleTime: 5_000,
  });
}

export function useSubmissionReviews(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'submission', submissionId, 'reviews'],
    queryFn: async () => {
      if (!submissionId) throw new Error('missing submission id');
      return listSubmissionReviews(submissionId);
    },
    enabled: !!submissionId,
    staleTime: 5_000,
  });
}

export function useSubmissionFeedback(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['project', 'submission', submissionId, 'feedback'],
    queryFn: async () => {
      if (!submissionId) throw new Error('missing submission id');
      return listSubmissionFeedback(submissionId);
    },
    enabled: !!submissionId,
    staleTime: 5_000,
  });
}

export function useProjectFeedback(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId, 'feedback'],
    queryFn: async () => {
      if (!projectId) throw new Error('missing project id');
      return listProjectFeedback(projectId);
    },
    enabled: !!projectId,
    staleTime: 10_000,
  });
}

export function useActivity(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId, 'activity'],
    queryFn: async () => {
      if (!projectId) throw new Error('missing project id');
      return getActivity(projectId);
    },
    enabled: !!projectId,
    staleTime: 10_000,
  });
}

/* --------------------------------------------------------------- mutations */

export function useCreateSubmission(projectId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      file,
      onProgress,
    }: {
      input: CreateSubmissionInput;
      file?: File;
      onProgress?: UploadProgress;
    }) => createSubmission(input, file, onProgress),
    onSuccess: () => invalidate(client, projectId),
  });
}

export function useSubmitSubmission(submissionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => submitSubmission(submissionId ?? ''),
    onSuccess: () => invalidate(client),
  });
}

export function useAppendVersion(submissionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      file,
      onProgress,
    }: {
      body?: string;
      file?: File;
      onProgress?: UploadProgress;
    }) => appendVersion(submissionId ?? '', { body, file }, onProgress),
    onSuccess: () => invalidate(client),
  });
}

export function usePatchSubmission(submissionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; body?: string }) =>
      patchSubmission(submissionId ?? '', input),
    onSuccess: () => invalidate(client),
  });
}

export function useDeleteSubmission() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (submissionId: string) => deleteSubmission(submissionId),
    onSuccess: () => invalidate(client),
  });
}

/** §11.4 student status path — pending → in_progress → submitted. */
export function useMilestoneStatus(projectId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, status }: { milestoneId: string; status: Milestone['status'] }) =>
      changeMilestoneStatus(milestoneId, status),
    onSuccess: () => invalidate(client, projectId),
  });
}

export function usePostFeedback(projectId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postFeedback(projectId ?? '', body),
    onSuccess: () => invalidate(client, projectId),
  });
}

export function usePostSubmissionFeedback(submissionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postSubmissionFeedback(submissionId ?? '', body),
    onSuccess: () => invalidate(client),
  });
}

export function usePatchFeedback(projectId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ feedbackId, body }: { feedbackId: string; body: string }) =>
      patchFeedback(feedbackId, body),
    onSuccess: () => invalidate(client, projectId),
  });
}

export function useDeleteFeedback(projectId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (feedbackId: string) => deleteFeedback(feedbackId),
    onSuccess: () => invalidate(client, projectId),
  });
}
