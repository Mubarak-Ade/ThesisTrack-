import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import StudentDashboard from './StudentDashboard';
import type { StudentDashboard as DashboardData } from '../data/studentDashboardRepo';
import type { ProposalRef, SupervisorRef } from '../lib/studentState';
import { useAuthStore } from '@/stores/auth';

vi.mock('../data/studentDashboardRepo', () => ({
  getStudentDashboard: vi.fn(),
}));

const { getStudentDashboard } = await import('../data/studentDashboardRepo');

const SUPERVISOR: SupervisorRef = {
  firstName: 'Helen',
  lastName: 'Brooks',
  email: 'h.brooks@test.local',
};

function proposal(status: ProposalRef['status'], title = 'Campus ledger'): ProposalRef {
  return { id: 'p-1', title, status, updatedAt: '2026-10-01T00:00:00.000Z' };
}

function data(overrides: Partial<DashboardData>): DashboardData {
  return {
    state: {
      state: 1,
      hasDraft: false,
      proposal: null,
      project: null,
      supervisor: SUPERVISOR,
    },
    reviewComment: null,
    milestones: [],
    usedFallback: false,
    ...overrides,
  };
}

const renderDashboard = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <StudentDashboard />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: {
      id: 'u-student',
      email: 'student@test.local',
      firstName: 'Ola',
      lastName: 'Nordmann',
      role: 'student',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    status: 'authenticated',
    accessToken: 'token',
  });
  vi.mocked(getStudentDashboard).mockResolvedValue(data({}));
});

describe('StudentDashboard — §16.2 all six states', () => {
  it('State 0 — welcome, supervisor pending, no action', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(
      data({
        state: { state: 0, hasDraft: false, proposal: null, project: null, supervisor: null },
      }),
    );
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByText(/assigning you a supervisor/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create proposal/i })).toBeNull();
    expect(screen.getByText('What happens next')).toBeInTheDocument();
  });

  it('State 1 — assigned with no proposal: Create Proposal', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByText(/don’t have an active project proposal/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create proposal/i })).toHaveAttribute(
      'href',
      '/proposals/new',
    );
  });

  it('State 1 (draft slot) — Continue Draft for an unsubmitted proposal', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(
      data({
        state: {
          state: 1,
          hasDraft: true,
          proposal: proposal('draft'),
          project: null,
          supervisor: SUPERVISOR,
        },
      }),
    );
    renderDashboard();

    expect(await screen.findByText(/draft proposal waiting to be submitted/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue draft/i })).toHaveAttribute(
      'href',
      '/proposals/p-1/edit',
    );
  });

  it('State 2 — under review: title, status chip, View Proposal', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(
      data({
        state: {
          state: 2,
          hasDraft: false,
          proposal: proposal('under_review'),
          project: null,
          supervisor: SUPERVISOR,
        },
      }),
    );
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'My Proposal' })).toBeInTheDocument();
    expect(screen.getByText('Campus ledger')).toBeInTheDocument();
    expect(screen.getByText('Under review')).toBeInTheDocument();
    expect(screen.getByText(/currently being reviewed/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view proposal/i })).toHaveAttribute(
      'href',
      '/proposals/p-1',
    );
  });

  it('State 3 — revision required: reviewer comment + both actions', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(
      data({
        state: {
          state: 3,
          hasDraft: false,
          proposal: proposal('revision_required'),
          project: null,
          supervisor: SUPERVISOR,
        },
        reviewComment: 'Narrow the scope to one faculty.',
      }),
    );
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Action Required' })).toBeInTheDocument();
    expect(screen.getByText(/requires revision/i)).toBeInTheDocument();
    expect(screen.getByText('Narrow the scope to one faculty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view feedback/i })).toHaveAttribute(
      'href',
      '/proposals/p-1',
    );
    expect(screen.getByRole('link', { name: /edit proposal/i })).toHaveAttribute(
      'href',
      '/proposals/p-1/edit',
    );
  });

  it('State 4 — rejected: reason and Create New Proposal', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(
      data({
        state: {
          state: 4,
          hasDraft: false,
          proposal: proposal('rejected'),
          project: null,
          supervisor: SUPERVISOR,
        },
        reviewComment: 'Out of scope for a single semester.',
      }),
    );
    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: 'Proposal Not Approved' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Out of scope for a single semester.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create new proposal/i })).toHaveAttribute(
      'href',
      '/proposals/new',
    );
  });

  it('State 5 — approved project: facts, progress and Open Project', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(
      data({
        state: {
          state: 5,
          hasDraft: false,
          proposal: proposal('approved'),
          project: { id: 'pr-1', title: 'Campus ledger', status: 'active' },
          supervisor: SUPERVISOR,
        },
        milestones: [
          { id: 'm1', title: 'Proposal', status: 'approved', dueAt: null, position: 0 },
          { id: 'm2', title: 'Design', status: 'in_progress', dueAt: null, position: 1 },
          {
            id: 'm3',
            title: 'Implementation',
            status: 'pending',
            dueAt: '2099-01-01T00:00:00.000Z',
            position: 2,
          },
        ],
      }),
    );
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'My Project' })).toBeInTheDocument();
    expect(screen.getByText('Helen Brooks')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 milestones approved/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open project/i })).toHaveAttribute(
      'href',
      '/project/overview',
    );
  });

  it('State 5 without a project row — explains the wait, offers no dead link', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(
      data({
        state: {
          state: 5,
          hasDraft: false,
          proposal: proposal('approved'),
          project: null,
          supervisor: SUPERVISOR,
        },
      }),
    );
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'My Project' })).toBeInTheDocument();
    expect(screen.getByText(/being turned into a project/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open project/i })).toBeNull();
  });

  it('flags fixture fallback with the sample-data banner', async () => {
    vi.mocked(getStudentDashboard).mockResolvedValue(data({ usedFallback: true }));
    renderDashboard();

    expect(await screen.findByText(/showing sample data/i)).toBeInTheDocument();
  });
});
