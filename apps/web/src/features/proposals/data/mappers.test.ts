import { describe, expect, it } from 'vitest';

import { mapProposal, mapProposalsPage, mapAttachment, mapReview } from './mappers';

const ROW = {
  id: 'p-1',
  studentId: 's-1',
  projectId: null,
  version: 2,
  title: 'Ledger',
  abstract: 'About ledgers.',
  body: '<p>Body</p>',
  status: 'draft',
  submittedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
};

describe('mapProposal', () => {
  it('maps a well-formed row', () => {
    const mapped = mapProposal(ROW);
    expect(mapped).toMatchObject({
      id: 'p-1',
      version: 2,
      title: 'Ledger',
      status: 'draft',
      body: '<p>Body</p>',
      projectId: null,
      student: { firstName: 'Ola' },
    });
  });

  it('rejects rows missing id, status or title', () => {
    expect(mapProposal({ ...ROW, id: undefined })).toBeNull();
    expect(mapProposal({ ...ROW, status: 'archived' })).toBeNull();
    expect(mapProposal({ ...ROW, title: undefined })).toBeNull();
    expect(mapProposal(null)).toBeNull();
  });

  it('defaults version to 1 and tolerates absent optional fields', () => {
    const mapped = mapProposal({ ...ROW, version: undefined, body: undefined, submittedAt: null });
    expect(mapped?.version).toBe(1);
    expect(mapped?.body).toBeNull();
  });
});

describe('mapProposalsPage', () => {
  it('maps the {proposals, pagination} envelope', () => {
    const page = mapProposalsPage(
      { proposals: [ROW], pagination: { page: 2, limit: 10, total: 31 } },
      { page: 2, limit: 10 },
    );
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(31);
    expect(page.page).toBe(2);
  });

  it('throws on structure drift so the repo can fall back', () => {
    expect(() => mapProposalsPage({ items: [] }, { page: 1, limit: 10 })).toThrow();
    expect(() => mapProposalsPage(null, { page: 1, limit: 10 })).toThrow();
  });
});

describe('mapAttachment / mapReview', () => {
  it('maps an attachment row (I14 fields intact)', () => {
    const mapped = mapAttachment({
      id: 'a-1',
      proposalId: 'p-1',
      proposalVersion: 2,
      originalFilename: 'proposal.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      uploadedBy: 's-1',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(mapped).toMatchObject({ proposalVersion: 2, sizeBytes: 1024 });
  });

  it('rejects attachments without an id or filename', () => {
    expect(mapAttachment({ id: 'a-1' })).toBeNull();
    expect(mapAttachment({ originalFilename: 'x.pdf' })).toBeNull();
  });

  it('maps only known review decisions', () => {
    expect(
      mapReview({
        id: 'r-1',
        decision: 'revision_required',
        comment: 'Narrow it',
        createdAt: '',
        reviewer: {},
      })?.decision,
    ).toBe('revision_required');
    expect(
      mapReview({ id: 'r-2', decision: 'maybe', createdAt: '', reviewer: {} }),
    ).toBeNull();
  });
});
