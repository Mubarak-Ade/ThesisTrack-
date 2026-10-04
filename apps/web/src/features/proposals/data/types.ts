/** §11.3 `proposal_status` members as the web app sees them. */
export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'revision_required'
  | 'approved'
  | 'rejected';

export interface ProposalAuthor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

/** `GET /proposals*` row — the API's ProposalView, defensively mapped. */
export interface Proposal {
  id: string;
  studentId: string;
  projectId: string | null;
  version: number;
  title: string;
  abstract: string;
  /** Sanitized editor HTML (ADR-14), or null when the document is an upload. */
  body: string | null;
  status: ProposalStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  student: ProposalAuthor;
}

/** §11.3 attachments — I14: frozen to a `proposalVersion` at upload time. */
export interface ProposalAttachment {
  id: string;
  proposalId: string;
  proposalVersion: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

/** §11.6 reviews are append-only (I8) — never edited, never deleted. */
export interface ProposalReview {
  id: string;
  decision: 'approved' | 'revision_required' | 'rejected';
  comment: string | null;
  createdAt: string;
  reviewer: ProposalAuthor;
}

export interface ProposalListArgs {
  page: number;
  limit: number;
  status?: ProposalStatus;
}

export interface ProposalListPage {
  items: Proposal[];
  total: number;
  page: number;
  limit: number;
  usedFallback: boolean;
}

export interface ProposalDetail {
  proposal: Proposal;
  attachments: ProposalAttachment[];
  reviews: ProposalReview[];
  usedFallback: boolean;
}

export interface CreateProposalInput {
  title: string;
  abstract: string;
  body?: string;
}

export interface EditProposalInput {
  title?: string;
  abstract?: string;
  body?: string;
}

/** §11.6 / §5.4 — the three decisions a supervisor (or admin) may record. */
export type ReviewDecision = 'approved' | 'revision_required' | 'rejected';

/**
 * §11.3/§11.6 review body — `comment` is required unless the decision is
 * `Approved` (the same rule the server enforces in `reviewProposalSchema`).
 */
export interface ReviewProposalInput {
  decision: ReviewDecision;
  comment?: string;
}

/**
 * §11.3 / I14 — one predicate for every editable affordance: `draft` and
 * `revision_required` only. Screens use it for the editor, the dropzone and
 * the *disabled + explained* remove buttons (never hiding them).
 */
export function isProposalEditable(status: ProposalStatus): boolean {
  return status === 'draft' || status === 'revision_required';
}
