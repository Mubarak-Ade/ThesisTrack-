import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createProposal,
  getProposal,
  listProposals,
  patchProposal,
  removeAttachment,
  reviewProposal,
  startProposalReview,
  submitProposal,
} from './proposalsRepo';
import { PROPOSAL_FIXTURES } from './mock/fixtures';

vi.mock('@/lib/api/http', () => {
  class ApiError extends Error {
    status: number;
    code: string;
    details?: unknown;
    constructor(init: { status: number; code: string; message: string; details?: unknown }) {
      super(init.message);
      this.status = init.status;
      this.code = init.code;
      this.details = init.details;
    }
  }
  return {
    ApiError,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

vi.mock('@/lib/api/files', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
}));

const { api, ApiError } = await import('@/lib/api/http');

const ROW = {
  id: 'p-1',
  studentId: 's-1',
  projectId: null,
  version: 1,
  title: 'Ledger',
  abstract: 'Abstract.',
  body: null,
  status: 'draft',
  submittedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('listProposals', () => {
  it('returns the live page', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      proposals: [ROW],
      pagination: { page: 1, limit: 10, total: 1 },
    });
    const page = await listProposals({ page: 1, limit: 10 });
    expect(page.items[0].id).toBe('p-1');
    expect(page.usedFallback).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/proposals?page=1&limit=10');
  });

  it('passes the status filter through to the API', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ proposals: [], pagination: {} });
    await listProposals({ page: 1, limit: 10, status: 'draft' });
    expect(api.get).toHaveBeenCalledWith('/proposals?page=1&limit=10&status=draft');
  });

  it('falls back to fixtures with usedFallback', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'));
    const page = await listProposals({ page: 1, limit: 10 });
    expect(page.usedFallback).toBe(true);
    expect(page.items).toEqual(PROPOSAL_FIXTURES);
  });
});

describe('getProposal', () => {
  const detailRoutes = {
    proposal: { proposal: ROW },
    attachments: { attachments: [] },
    reviews: { reviews: [] },
  };

  function routeByPath(routes: Record<string, unknown>) {
    return async (path: string) => {
      if (path === '/proposals/p-1') return routes.proposal;
      if (path === '/proposals/p-1/attachments') return routes.attachments;
      if (path === '/proposals/p-1/reviews') return routes.reviews;
      throw new Error(`unexpected ${path}`);
    };
  }

  it('assembles proposal + attachments + reviews', async () => {
    vi.mocked(api.get).mockImplementation(routeByPath(detailRoutes));
    const detail = await getProposal('p-1');
    expect(detail?.proposal.id).toBe('p-1');
    expect(detail?.usedFallback).toBe(false);
  });

  it('returns null only on a real 404 (honest not-found)', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiError({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Proposal not found' }),
    );
    await expect(getProposal('missing')).resolves.toBeNull();
  });

  it('rethrows transport errors instead of faking not-found', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' }),
    );
    await expect(getProposal('p-unknown')).rejects.toThrow('Network error');
  });

  it('falls back to the fixture detail for a fixture id', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    const detail = await getProposal(PROPOSAL_FIXTURES[0].id);
    expect(detail?.usedFallback).toBe(true);
    expect(detail?.reviews).toHaveLength(1);
  });

  it('tolerates failing extras (attachments/reviews degrade to empty)', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/proposals/p-1') return detailRoutes.proposal;
      throw new Error('extra down');
    });
    const detail = await getProposal('p-1');
    expect(detail?.attachments).toEqual([]);
    expect(detail?.reviews).toEqual([]);
  });
});

describe('writes surface errors (never fake success)', () => {
  it('createProposal maps the response', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ proposal: ROW });
    const created = await createProposal({ title: 'Ledger', abstract: 'A.' });
    expect(created.id).toBe('p-1');
    expect(api.post).toHaveBeenCalledWith('/proposals', { title: 'Ledger', abstract: 'A.' });
  });

  it('createProposal rejects a malformed envelope', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({});
    await expect(createProposal({ title: 'x', abstract: 'y' })).rejects.toThrow(
      'Malformed create-proposal response',
    );
  });

  it('patchProposal sends PATCH with the edit fields', async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ proposal: ROW });
    await patchProposal('p-1', { title: 'Ledger v2' });
    expect(api.patch).toHaveBeenCalledWith('/proposals/p-1', { title: 'Ledger v2' });
  });

  it('submitProposal propagates a 422 business error', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'A proposal needs a body or at least one attachment',
      }),
    );
    await expect(submitProposal('p-1')).rejects.toThrow(/body or at least one attachment/);
  });

  it('removeAttachment deletes by id', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ deleted: true });
    await removeAttachment('a-1');
    expect(api.delete).toHaveBeenCalledWith('/proposal-attachments/a-1');
  });
});

describe('review writes (§5.4 / §11.3)', () => {
  it('startProposalReview POSTs the transition', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ proposal: { ...ROW, status: 'under_review' } });
    const out = await startProposalReview('p-1');
    expect(api.post).toHaveBeenCalledWith('/proposals/p-1/start-review');
    expect(out.status).toBe('under_review');
  });

  it('reviewProposal sends the decision and maps both rows', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      proposal: { ...ROW, status: 'approved' },
      review: {
        id: 'r-9',
        decision: 'approved',
        comment: null,
        createdAt: '2026-10-04T00:00:00.000Z',
        reviewer: { id: 'sup-1', firstName: 'Helen', lastName: 'Brooks', email: 'h@t.local' },
      },
    });
    const out = await reviewProposal('p-1', { decision: 'approved' });
    expect(api.post).toHaveBeenCalledWith('/proposals/p-1/review', { decision: 'approved' });
    expect(out.proposal.status).toBe('approved');
    expect(out.review.decision).toBe('approved');
  });

  it('reviewProposal rejects a malformed envelope (never fakes success)', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({});
    await expect(
      reviewProposal('p-1', { decision: 'rejected', comment: 'Out of scope.' }),
    ).rejects.toThrow('Malformed review response');
  });
});
