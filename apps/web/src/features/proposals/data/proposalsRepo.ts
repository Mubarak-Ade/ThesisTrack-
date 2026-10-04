/**
 * Proposals repository (§11.3, §10.4):
 *  - reads  → live first; list falls back to fixtures (`usedFallback`),
 *             detail falls back only for fixture ids and never turns a
 *             transport error into a fake "not found";
 *  - writes → create/patch/submit/upload/remove/download always surface
 *             errors (Rule 3: never fake success).
 */
import { ApiError, api } from '@/lib/api/http';
import { downloadFile, uploadFile, type UploadProgress } from '@/lib/api/files';
import { mapAttachment, mapProposal, mapProposalsPage, mapReview } from './mappers';
import { PROPOSAL_DETAIL_FIXTURES, PROPOSAL_FIXTURES } from './mock/fixtures';
import type {
  CreateProposalInput,
  EditProposalInput,
  Proposal,
  ProposalAttachment,
  ProposalDetail,
  ProposalListArgs,
  ProposalListPage,
  ProposalReview,
  ReviewProposalInput,
} from './types';

function warn(scope: string, error: unknown): void {
  console.warn(`[proposalsRepo] ${scope}: using sample data —`, error);
}

function listQuery(args: ProposalListArgs): string {
  const params = new URLSearchParams({ page: String(args.page), limit: String(args.limit) });
  if (args.status) params.set('status', args.status);
  return params.toString();
}

/** Same filter, client-side, while the list is fixture-backed. */
function filterMock(args: ProposalListArgs): Proposal[] {
  const rows = args.status ? PROPOSAL_FIXTURES.filter((p) => p.status === args.status) : PROPOSAL_FIXTURES;
  const start = (args.page - 1) * args.limit;
  return rows.slice(start, start + args.limit);
}

export async function listProposals(args: ProposalListArgs): Promise<ProposalListPage> {
  try {
    const page = mapProposalsPage(await api.get<unknown>(`/proposals?${listQuery(args)}`), args);
    return { ...page, usedFallback: false };
  } catch (error) {
    warn('listProposals', error);
    const filtered = filterMock(args);
    return {
      items: filtered,
      total: filtered.length,
      page: args.page,
      limit: args.limit,
      usedFallback: true,
    };
  }
}

async function loadAttachments(proposalId: string): Promise<ProposalAttachment[]> {
  const payload = await api.get<{ attachments?: unknown }>(`/proposals/${proposalId}/attachments`);
  if (!Array.isArray(payload?.attachments)) return [];
  return payload.attachments
    .map(mapAttachment)
    .filter((row): row is ProposalAttachment => row !== null);
}

async function loadReviews(proposalId: string): Promise<ProposalDetail['reviews']> {
  const payload = await api.get<{ reviews?: unknown }>(`/proposals/${proposalId}/reviews`);
  if (!Array.isArray(payload?.reviews)) return [];
  return payload.reviews.map(mapReview).filter((row): row is NonNullable<typeof row> => row !== null);
}

/**
 * `null` = genuinely not found (404). A transport failure with no fixture
 * rethrows so the screen can offer a retry instead of lying (§10.4).
 */
export async function getProposal(proposalId: string): Promise<ProposalDetail | null> {
  try {
    const payload = await api.get<{ proposal?: unknown }>(`/proposals/${proposalId}`);
    const proposal = mapProposal(payload?.proposal);
    if (!proposal) throw new Error('proposal envelope missing');

    const [attachments, reviews] = await Promise.all([
      loadAttachments(proposalId).catch(() => [] as ProposalAttachment[]),
      loadReviews(proposalId).catch(() => [] as ProposalDetail['reviews']),
    ]);
    return { proposal, attachments, reviews, usedFallback: false };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    const fixture = PROPOSAL_DETAIL_FIXTURES[proposalId];
    if (fixture) {
      warn('getProposal', error);
      return fixture;
    }
    throw error;
  }
}

/* --------------------------------------------------------------- writes */

export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  const payload = await api.post<{ proposal?: unknown }>('/proposals', input);
  const proposal = mapProposal(payload?.proposal);
  if (!proposal) throw new Error('Malformed create-proposal response');
  return proposal;
}

export async function patchProposal(
  proposalId: string,
  input: EditProposalInput,
): Promise<Proposal> {
  const payload = await api.patch<{ proposal?: unknown }>(`/proposals/${proposalId}`, input);
  const proposal = mapProposal(payload?.proposal);
  if (!proposal) throw new Error('Malformed patch-proposal response');
  return proposal;
}

/** §11.3 submit — 422 when there is neither body nor attachment; surfaces. */
export async function submitProposal(proposalId: string): Promise<Proposal> {
  const payload = await api.post<{ proposal?: unknown }>(`/proposals/${proposalId}/submit`);
  const proposal = mapProposal(payload?.proposal);
  if (!proposal) throw new Error('Malformed submit-proposal response');
  return proposal;
}

/** Multipart §11.3 — field `file`, upload progress for task 11.4's composer. */
export async function uploadAttachment(
  proposalId: string,
  file: File,
  onProgress?: UploadProgress,
): Promise<ProposalAttachment> {
  const form = new FormData();
  form.append('file', file);
  const payload = await uploadFile<{ attachment?: unknown }>(
    `/proposals/${proposalId}/attachments`,
    form,
    onProgress,
  );
  const attachment = mapAttachment(payload?.attachment);
  if (!attachment) throw new Error('Malformed upload response');
  return attachment;
}

export async function removeAttachment(attachmentId: string): Promise<void> {
  await api.delete(`/proposal-attachments/${attachmentId}`);
}

/* --------------------------------------------------------------- review (§5.4) */

/** POST /proposals/:proposalId/start-review — `submitted` → `under_review`. */
export async function startProposalReview(proposalId: string): Promise<Proposal> {
  const payload = await api.post<{ proposal?: unknown }>(`/proposals/${proposalId}/start-review`);
  const proposal = mapProposal(payload?.proposal);
  if (!proposal) throw new Error('Malformed start-review response');
  return proposal;
}

/**
 * POST /proposals/:proposalId/review — §5.4. `approved` runs approval as one
 * server-side transaction (project creation, milestones, stages, notification,
 * review row), so this write never fakes success (§10.4 Rule 3).
 */
export async function reviewProposal(
  proposalId: string,
  input: ReviewProposalInput,
): Promise<{ proposal: Proposal; review: ProposalReview }> {
  const payload = await api.post<{ proposal?: unknown; review?: unknown }>(
    `/proposals/${proposalId}/review`,
    input,
  );
  const proposal = mapProposal(payload?.proposal);
  const review = mapReview(payload?.review);
  if (!proposal || !review) throw new Error('Malformed review response');
  return { proposal, review };
}

export async function downloadAttachment(
  attachment: ProposalAttachment,
): Promise<void> {
  await downloadFile(
    `/proposal-attachments/${attachment.id}/download`,
    attachment.originalFilename,
  );
}
