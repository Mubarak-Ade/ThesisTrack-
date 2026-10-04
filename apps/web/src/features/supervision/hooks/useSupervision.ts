import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  advanceStage,
  changeMilestoneStatus,
  createMilestone,
  deleteFeedback,
  deleteMilestone,
  getProject,
  getStageTracker,
  getSubmissionBundle,
  getSupervisorDashboard,
  listCaseload,
  listMilestones,
  listProjectFeedback,
  listSubmissions,
  patchFeedback,
  patchMilestone,
  postFeedback,
  postSubmissionFeedback,
  reorderMilestones,
  reviewSubmission,
} from '../data/supervisionRepo';
import type { MilestoneInput } from '../data/supervisionRepo';
import type { Milestone, ReviewDecision } from '../data/types';

/**
 * §10.4 — TanStack Query everywhere; `useEffect` fetching is REJECTED.
 * Every write invalidates the feature root: a milestone move, an advance or
 * a decision is felt by the dashboard, the caseload and the detail screens
 * at once, and the queries that are on screen refetch.
 */
function invalidateSupervision(client: ReturnType<typeof useQueryClient>): void {
  void client.invalidateQueries({ queryKey: ['supervision'] });
}

/* ------------------------------------------------------------------ reads */

export function useCaseload() {
  return useQuery({
    queryKey: ['supervision', 'caseload'],
    queryFn: listCaseload,
    staleTime: 15_000,
  });
}

export function useSupervisorDashboard() {
  return useQuery({
    queryKey: ['supervision', 'dashboard'],
    queryFn: getSupervisorDashboard,
    staleTime: 15_000,
  });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: ['supervision', 'project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useStageTracker(projectId: string | null) {
  return useQuery({
    queryKey: ['supervision', 'stages', projectId],
    queryFn: () => getStageTracker(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useMilestones(projectId: string | null) {
  return useQuery({
    queryKey: ['supervision', 'milestones', projectId],
    queryFn: () => listMilestones(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useSubmissions(projectId: string | null) {
  return useQuery({
    queryKey: ['supervision', 'submissions', projectId],
    queryFn: () => listSubmissions(projectId!),
    enabled: Boolean(projectId),
  });
}

export function useSubmissionBundle(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['supervision', 'submission', submissionId],
    queryFn: () => getSubmissionBundle(submissionId!),
    enabled: Boolean(submissionId),
  });
}

export function useProjectFeedback(projectId: string | null) {
  return useQuery({
    queryKey: ['supervision', 'feedback', projectId],
    queryFn: () => listProjectFeedback(projectId!),
    enabled: Boolean(projectId),
  });
}

/* ----------------------------------------------------------------- writes */

/** §11.14 advance — a 422 `unmet[]` comes back through the thrown error. */
export function useAdvanceStage(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => advanceStage(projectId),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function useCreateMilestone(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MilestoneInput) => createMilestone(projectId, input),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function usePatchMilestone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, input }: { milestoneId: string; input: Partial<MilestoneInput> }) =>
      patchMilestone(milestoneId, input),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function useDeleteMilestone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (milestoneId: string) => deleteMilestone(milestoneId),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function useReorderMilestones(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (order: string[]) => reorderMilestones(projectId, order),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function useMilestoneStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      milestoneId,
      status,
    }: {
      milestoneId: string;
      status: Milestone['status'];
    }) => changeMilestoneStatus(milestoneId, status),
    onSuccess: () => invalidateSupervision(client),
  });
}

/** §11.6 — the formal decision; on approved the tied milestone completes. */
export function useReviewSubmission(submissionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { decision: ReviewDecision; comment?: string }) =>
      reviewSubmission(submissionId, input),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function usePostFeedback(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postFeedback(projectId, body),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function usePostSubmissionFeedback(submissionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postSubmissionFeedback(submissionId, body),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function usePatchFeedback() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ feedbackId, body }: { feedbackId: string; body: string }) =>
      patchFeedback(feedbackId, body),
    onSuccess: () => invalidateSupervision(client),
  });
}

export function useDeleteFeedback() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (feedbackId: string) => deleteFeedback(feedbackId),
    onSuccess: () => invalidateSupervision(client),
  });
}
