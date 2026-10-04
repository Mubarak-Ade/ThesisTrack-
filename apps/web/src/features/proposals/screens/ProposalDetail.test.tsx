import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProposalDetail from './ProposalDetail';
import {
  getProposal,
  removeAttachment,
  reviewProposal,
  startProposalReview,
  submitProposal,
} from '../data/proposalsRepo';
import type { Proposal, ProposalDetail as Detail, ProposalReview } from '../data/types';
import { useAuthStore } from '@/stores/auth';

vi.mock('../data/proposalsRepo', () => ({
  listProposals: vi.fn(),
  getProposal: vi.fn(),
  createProposal: vi.fn(),
  patchProposal: vi.fn(),
  submitProposal: vi.fn(),
  uploadAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
  startProposalReview: vi.fn(),
  reviewProposal: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const OWNER: Proposal = {
  id: 'p-1',
  studentId: 's-1',
  projectId: null,
  version: 2,
  title: 'Campus ledger',
  abstract: 'A study of append-only records.',
  body: '<h2>Problem</h2><p>Records drift.</p>',
  status: 'revision_required',
  submittedAt: '2026-09-20T00:00:00.000Z',
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
};

function detailOf(proposal: Proposal, overrides: Partial<Detail> = {}): Detail {
  return {
    proposal,
    attachments: [
      {
        id: 'a-1',
        proposalId: proposal.id,
        proposalVersion: 2,
        originalFilename: 'proposal-v2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 482_113,
        uploadedBy: 's-1',
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ],
    reviews: [
      {
        id: 'r-1',
        decision: 'revision_required',
        comment: 'Narrow the scope.',
        createdAt: '2026-09-28T00:00:00.000Z',
        reviewer: {
          id: 'sup-1',
          firstName: 'Helen',
          lastName: 'Brooks',
          email: 'h.brooks@test.local',
        },
      },
    ],
    usedFallback: false,
    ...overrides,
  };
}

function signIn(userId: string, role: 'student' | 'supervisor' | 'administrator' = 'student'): void {
  useAuthStore.setState({
    user: {
      id: userId,
      email: 'user@test.local',
      firstName: 'Test',
      lastName: 'User',
      role,
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    status: 'authenticated',
    accessToken: 'token',
  });
}

const NEW_REVIEW: ProposalReview = {
  id: 'r-9',
  decision: 'approved',
  comment: null,
  createdAt: '2026-10-04T00:00:00.000Z',
  reviewer: { id: 'sup-1', firstName: 'Helen', lastName: 'Brooks', email: 'h.brooks@test.local' },
};

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/proposals/p-1']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/proposals/:proposalId" element={<ProposalDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProposal).mockResolvedValue(detailOf(OWNER));
  vi.mocked(removeAttachment).mockResolvedValue(undefined);
  vi.mocked(submitProposal).mockResolvedValue({ ...OWNER, status: 'submitted' });
  vi.mocked(startProposalReview).mockResolvedValue({ ...OWNER, status: 'under_review' });
  vi.mocked(reviewProposal).mockResolvedValue({
    proposal: { ...OWNER, status: 'approved' },
    review: NEW_REVIEW,
  });
  signIn('s-1');
});

describe('ProposalDetail', () => {
  it('renders abstract, sanitized body, documents and review history', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Campus ledger' })).toBeInTheDocument();
    expect(screen.getByText('A study of append-only records.')).toBeInTheDocument();
    // Body rendered from the sanitized string (§16.4).
    expect(screen.getByText('Records drift.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Problem' })).toBeInTheDocument();
    expect(screen.getByText('proposal-v2.pdf')).toBeInTheDocument();
    expect(screen.getByText('Narrow the scope.')).toBeInTheDocument();
    expect(screen.getByText(/Helen Brooks/)).toBeInTheDocument();
  });

  it('gives the owning student on a revision an edit path and submit', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute(
      'href',
      '/proposals/p-1/edit',
    );
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeEnabled();
    // Editable (revision_required) → remove works for the owner.
    expect(screen.getByRole('button', { name: 'Remove proposal-v2.pdf' })).toBeEnabled();
  });

  it('locks editing while under review but keeps download (I14)', async () => {
    vi.mocked(getProposal).mockResolvedValue(
      detailOf({ ...OWNER, status: 'under_review' }),
    );
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });

    expect(screen.queryByRole('link', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull();
    expect(screen.getByText(/read-only while under review/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove proposal-v2.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download proposal-v2.pdf' })).toBeEnabled();
  });

  it('shows no remove affordance to a non-owner viewer', async () => {
    signIn('someone-else');
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });

    expect(screen.queryByRole('button', { name: /remove proposal-v2/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download proposal-v2.pdf' })).toBeInTheDocument();
  });

  it('removes an editable document through the repository', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Remove proposal-v2.pdf' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove document' }));
    await waitFor(() => expect(removeAttachment).toHaveBeenCalledWith('a-1'));
  });

  it('renders the honest not-found state on 404 (null detail)', async () => {
    vi.mocked(getProposal).mockResolvedValue(null);
    renderDetail();
    expect(await screen.findByText('That proposal doesn’t exist')).toBeInTheDocument();
  });

  it('offers a retry when the read fails without a fixture', async () => {
    vi.mocked(getProposal).mockRejectedValue(new Error('Network error'));
    renderDetail();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('ProposalDetail — reviewer (§16.4 decision form)', () => {
  it('offers Start review to a non-owner supervisor on a submitted proposal', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(detailOf({ ...OWNER, status: 'submitted' }));
    signIn('sup-1', 'supervisor');
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });

    expect(screen.getByText('Review decision')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start review/i }));
    await waitFor(() => expect(startProposalReview).toHaveBeenCalledWith('p-1'));
  });

  it('shows the student no decision form, even under review', async () => {
    vi.mocked(getProposal).mockResolvedValue(detailOf({ ...OWNER, status: 'under_review' }));
    signIn('s-1');
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });

    expect(screen.queryByText('Review decision')).toBeNull();
  });

  it('requires a comment for a non-approving decision (§11.3)', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(detailOf({ ...OWNER, status: 'under_review' }));
    signIn('sup-1', 'supervisor');
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });

    await user.click(screen.getByRole('radio', { name: /revision required/i }));
    await user.click(screen.getByRole('button', { name: /request revision/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/comment is required/i);
    expect(reviewProposal).not.toHaveBeenCalled();
  });

  it('gates Approved behind the plain confirmation dialog (§16.4)', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(detailOf({ ...OWNER, status: 'under_review' }));
    signIn('sup-1', 'supervisor');
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });

    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('This will create the project and lock the proposal.'),
    ).toBeInTheDocument();
    expect(reviewProposal).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /^approve$/i }));
    await waitFor(() =>
      expect(reviewProposal).toHaveBeenCalledWith('p-1', {
        decision: 'approved',
        comment: undefined,
      }),
    );
  });

  it('sends a commenting decision straight through, no dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(getProposal).mockResolvedValue(detailOf({ ...OWNER, status: 'under_review' }));
    vi.mocked(reviewProposal).mockResolvedValue({
      proposal: { ...OWNER, status: 'revision_required' },
      review: { ...NEW_REVIEW, decision: 'revision_required' },
    });
    signIn('sup-1', 'supervisor');
    renderDetail();
    await screen.findByRole('heading', { name: 'Campus ledger' });

    await user.click(screen.getByRole('radio', { name: /revision required/i }));
    await user.type(screen.getByLabelText(/^comment/i), 'Narrow the scope to one campus.');
    await user.click(screen.getByRole('button', { name: /request revision/i }));

    await waitFor(() =>
      expect(reviewProposal).toHaveBeenCalledWith('p-1', {
        decision: 'revision_required',
        comment: 'Narrow the scope to one campus.',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
