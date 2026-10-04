import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createProposal,
  getProposal,
  listProposals,
  patchProposal,
  removeAttachment,
  reviewProposal,
  startProposalReview,
  submitProposal,
  uploadAttachment,
} from '../data/proposalsRepo';
import type {
  CreateProposalInput,
  EditProposalInput,
  ProposalListArgs,
  ReviewProposalInput,
} from '../data/types';
import type { UploadProgress } from '@/lib/api/files';

/**
 * §10.4 — TanStack Query everywhere; `useEffect` fetching is REJECTED.
 * Writes invalidate three roots because a proposal move is felt in three
 * places: the list/detail, the §16.2 dashboard state, and the shell's
 * "My Project ▾" nav condition.
 */
function invalidateProjectState(client: ReturnType<typeof useQueryClient>): void {
  void client.invalidateQueries({ queryKey: ['proposals'] });
  void client.invalidateQueries({ queryKey: ['studentDashboard'] });
  void client.invalidateQueries({ queryKey: ['shell'] });
}

export function useProposals(args: ProposalListArgs) {
  return useQuery({
    queryKey: ['proposals', 'list', args.page, args.limit, args.status ?? 'all'],
    queryFn: () => listProposals(args),
    staleTime: 15_000,
  });
}

export function useProposal(proposalId: string | undefined) {
  return useQuery({
    queryKey: ['proposals', 'detail', proposalId],
    queryFn: async () => {
      if (!proposalId) throw new Error('missing proposal id');
      return getProposal(proposalId);
    },
    enabled: !!proposalId,
    staleTime: 10_000,
  });
}

export function useCreateProposal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProposalInput) => createProposal(input),
    onSuccess: () => invalidateProjectState(client),
  });
}

export function usePatchProposal(proposalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: EditProposalInput) => patchProposal(proposalId, input),
    onSuccess: () => invalidateProjectState(client),
  });
}

export function useSubmitProposal(proposalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => submitProposal(proposalId),
    onSuccess: () => invalidateProjectState(client),
  });
}

export function useUploadAttachment(proposalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: UploadProgress }) =>
      uploadAttachment(proposalId, file, onProgress),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['proposals'] }),
  });
}

export function useRemoveAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => removeAttachment(attachmentId),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['proposals'] }),
  });
}

/**
 * §5.4 review writes — felt in four places: the proposal itself, the
 * supervisor's caseload/dashboard (work left the queue), the §16.2 student
 * dashboard state, and the shell nav condition.
 */
function invalidateReviewState(client: ReturnType<typeof useQueryClient>): void {
  invalidateProjectState(client);
  void client.invalidateQueries({ queryKey: ['supervision'] });
}

/** POST start-review — `submitted` → `under_review` (the decision's door). */
export function useStartReview(proposalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => startProposalReview(proposalId),
    onSuccess: () => invalidateReviewState(client),
  });
}

/** POST review — approval creates the project in one transaction (§5.4). */
export function useReviewProposal(proposalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewProposalInput) => reviewProposal(proposalId, input),
    onSuccess: () => invalidateReviewState(client),
  });
}
