import type { Proposal, ProposalAttachment, ProposalDetail, ProposalReview } from '../types';

/** §10.4 fixture fallback — sample rows behind the banner, never for writes. */
export const PROPOSAL_FIXTURES: Proposal[] = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    studentId: '00000000-0000-4000-8000-000000000001',
    projectId: null,
    version: 2,
    title: 'Distributed ledger for campus records',
    abstract:
      'A semester-long study of applying an append-only ledger to departmental record keeping.',
    body: '<h2>Problem</h2><p>Departmental records drift across spreadsheets.</p>',
    status: 'revision_required',
    submittedAt: '2026-09-20T09:00:00.000Z',
    createdAt: '2026-09-12T09:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z',
    student: {
      id: '00000000-0000-4000-8000-000000000001',
      firstName: 'Ola',
      lastName: 'Nordmann',
      email: 'student@thesistrack.local',
    },
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    studentId: '00000000-0000-4000-8000-000000000001',
    projectId: null,
    version: 1,
    title: 'Timetable optimisation with constraint solving',
    abstract: 'Formulating the departmental timetable as a constraint satisfaction problem.',
    body: null,
    status: 'draft',
    submittedAt: null,
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
    student: {
      id: '00000000-0000-4000-8000-000000000001',
      firstName: 'Ola',
      lastName: 'Nordmann',
      email: 'student@thesistrack.local',
    },
  },
];

export const ATTACHMENT_FIXTURES: ProposalAttachment[] = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    proposalId: '00000000-0000-4000-8000-0000000000a1',
    proposalVersion: 2,
    originalFilename: 'proposal-v2.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 482_113,
    uploadedBy: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-09-20T09:00:00.000Z',
  },
];

export const REVIEW_FIXTURES: ProposalReview[] = [
  {
    id: '00000000-0000-4000-8000-0000000000c1',
    decision: 'revision_required',
    comment: 'Narrow the scope: one faculty, one record type.',
    createdAt: '2026-09-28T09:00:00.000Z',
    reviewer: {
      id: '00000000-0000-4000-8000-000000000002',
      firstName: 'Helen',
      lastName: 'Brooks',
      email: 'h.brooks@thesistrack.local',
    },
  },
];

/** Detail fixture for the first sample proposal (fallback path only). */
export const PROPOSAL_DETAIL_FIXTURES: Record<string, ProposalDetail> = {
  [PROPOSAL_FIXTURES[0].id]: {
    proposal: PROPOSAL_FIXTURES[0],
    attachments: ATTACHMENT_FIXTURES,
    reviews: REVIEW_FIXTURES,
    usedFallback: true,
  },
  [PROPOSAL_FIXTURES[1].id]: {
    proposal: PROPOSAL_FIXTURES[1],
    attachments: [],
    reviews: [],
    usedFallback: true,
  },
};
