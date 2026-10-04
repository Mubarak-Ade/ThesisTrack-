import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProposalList from './ProposalList';
import { listProposals } from '../data/proposalsRepo';
import type { ProposalListPage } from '../data/types';
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
}));

const PAGE: ProposalListPage = {
  items: [
    {
      id: 'p-1',
      studentId: 's-1',
      projectId: null,
      version: 2,
      title: 'Campus ledger',
      abstract: 'A.',
      body: null,
      status: 'revision_required',
      submittedAt: '2026-09-20T00:00:00.000Z',
      createdAt: '2026-09-12T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
      student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
    },
    {
      id: 'p-2',
      studentId: 's-2',
      projectId: null,
      version: 1,
      title: 'Timetables',
      abstract: 'B.',
      body: null,
      status: 'draft',
      submittedAt: null,
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
      student: { id: 's-2', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@test.local' },
    },
  ],
  total: 2,
  page: 1,
  limit: 10,
  usedFallback: false,
};

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/proposals']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProposalList />
      </QueryClientProvider>
    </MemoryRouter>,
  );

function signIn(role: 'student' | 'supervisor' | 'administrator'): void {
  useAuthStore.setState({
    user: {
      id: role === 'student' ? 's-1' : 'u-1',
      email: `${role}@test.local`,
      firstName: 'Test',
      lastName: role,
      role,
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    status: 'authenticated',
    accessToken: 'token',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listProposals).mockResolvedValue(PAGE);
  signIn('student');
});

describe('ProposalList', () => {
  it('renders rows with status badges and the honest footer', async () => {
    renderList();

    expect(await screen.findByText('Campus ledger')).toBeInTheDocument();
    expect(screen.getByText('Timetables')).toBeInTheDocument();
    expect(screen.getAllByText('Revision required').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 2 of 2 proposals')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /new proposal/i }),
    ).toHaveAttribute('href', '/proposals/new');
  });

  it('filters by status through the API', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Campus ledger');

    await user.click(screen.getByRole('button', { name: 'Draft' }));
    await waitFor(() =>
      expect(listProposals).toHaveBeenCalledWith({ page: 1, limit: 10, status: 'draft' }),
    );
    expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows student names to supervisors, not to students', async () => {
    signIn('supervisor');
    renderList();
    await screen.findByText('Campus ledger');
    expect(screen.getByText(/Ola Nordmann/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new proposal/i })).toBeNull();
  });

  it('offers the create action only to students (empty state)', async () => {
    vi.mocked(listProposals).mockResolvedValue({ ...PAGE, items: [], total: 0 });
    renderList();

    expect(await screen.findByText('No proposals yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new proposal/i }).length).toBeGreaterThan(0);
  });

  it('flags the fixture fallback', async () => {
    vi.mocked(listProposals).mockResolvedValue({ ...PAGE, usedFallback: true });
    renderList();
    expect(await screen.findByText(/showing sample data/i)).toBeInTheDocument();
  });

  it('offers a retry when the read fails', async () => {
    vi.mocked(listProposals).mockRejectedValue(new Error('offline'));
    renderList();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
