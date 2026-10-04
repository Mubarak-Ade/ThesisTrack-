/**
 * One mapper per API shape (§10.4 Rule 2): rows pick fields explicitly, the
 * list envelope is strict (drift throws → repo falls back), the detail
 * package tolerates failing extras the same way the dashboard does.
 */
import type {
  Proposal,
  ProposalAttachment,
  ProposalAuthor,
  ProposalReview,
  ProposalStatus,
} from './types';

const STATUSES: readonly string[] = [
  'draft',
  'submitted',
  'under_review',
  'revision_required',
  'approved',
  'rejected',
];

const DECISIONS: readonly string[] = ['approved', 'revision_required', 'rejected'];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStatus(value: unknown): ProposalStatus | null {
  return typeof value === 'string' && STATUSES.includes(value)
    ? (value as ProposalStatus)
    : null;
}

function mapAuthor(value: unknown): ProposalAuthor {
  const r = asRecord(value);
  return {
    id: str(r.id),
    firstName: str(r.firstName),
    lastName: str(r.lastName),
    email: str(r.email),
  };
}

/** Row → Proposal. Missing id/status/title → null (skipped by callers). */
export function mapProposal(value: unknown): Proposal | null {
  const r = asRecord(value);
  const status = asStatus(r.status);
  if (typeof r.id !== 'string' || !status || typeof r.title !== 'string') return null;
  return {
    id: r.id,
    studentId: str(r.studentId),
    projectId: nullableStr(r.projectId),
    version: typeof r.version === 'number' ? r.version : 1,
    title: r.title,
    abstract: str(r.abstract),
    body: nullableStr(r.body),
    status,
    submittedAt: nullableStr(r.submittedAt),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
    student: mapAuthor(r.student),
  };
}

export function mapAttachment(value: unknown): ProposalAttachment | null {
  const r = asRecord(value);
  if (typeof r.id !== 'string' || typeof r.originalFilename !== 'string') return null;
  return {
    id: r.id,
    proposalId: str(r.proposalId),
    proposalVersion: typeof r.proposalVersion === 'number' ? r.proposalVersion : 1,
    originalFilename: r.originalFilename,
    mimeType: str(r.mimeType, 'application/octet-stream'),
    sizeBytes: typeof r.sizeBytes === 'number' ? r.sizeBytes : 0,
    uploadedBy: str(r.uploadedBy),
    createdAt: str(r.createdAt),
  };
}

export function mapReview(value: unknown): ProposalReview | null {
  const r = asRecord(value);
  const decision = typeof r.decision === 'string' && DECISIONS.includes(r.decision)
    ? (r.decision as ProposalReview['decision'])
    : null;
  if (typeof r.id !== 'string' || !decision) return null;
  return {
    id: r.id,
    decision,
    comment: nullableStr(r.comment),
    createdAt: str(r.createdAt),
    reviewer: mapAuthor(r.reviewer),
  };
}

/** `{proposals, pagination}` → page. Structure drift throws (repo falls back). */
export function mapProposalsPage(
  payload: unknown,
  args: { page: number; limit: number },
): { items: Proposal[]; total: number; page: number; limit: number } {
  const r = asRecord(payload);
  const list = r.proposals;
  if (!Array.isArray(list)) throw new Error('proposals envelope missing');
  const items = list.map(mapProposal).filter((row): row is Proposal => row !== null);
  const pagination = asRecord(r.pagination);
  return {
    items,
    total: typeof pagination.total === 'number' ? pagination.total : items.length,
    page: typeof pagination.page === 'number' ? pagination.page : args.page,
    limit: typeof pagination.limit === 'number' ? pagination.limit : args.limit,
  };
}
