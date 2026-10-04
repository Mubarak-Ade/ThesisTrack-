import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SupervisorDashboard from './SupervisorDashboard';
import { getSupervisorDashboard } from '../data/supervisionRepo';
import type { SupervisorDashboard as Dashboard } from '../data/types';

vi.mock('../data/supervisionRepo', () => ({
  listCaseload: vi.fn(),
  getSupervisorDashboard: vi.fn(),
  getProject: vi.fn(),
  getStageTracker: vi.fn(),
  listMilestones: vi.fn(),
  listSubmissions: vi.fn(),
  getSubmissionBundle: vi.fn(),
  listProjectFeedback: vi.fn(),
  advanceStage: vi.fn(),
  createMilestone: vi.fn(),
  patchMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  reorderMilestones: vi.fn(),
  changeMilestoneStatus: vi.fn(),
  reviewSubmission: vi.fn(),
  postFeedback: vi.fn(),
  postSubmissionFeedback: vi.fn(),
  patchFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  downloadVersion: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const PERSON = {
  id: 's-1',
  firstName: 'Ola',
  lastName: 'Nordmann',
  email: 'ola@test.local',
};

const FULL: Dashboard = {
  students: [
    { student: PERSON, projectId: 'proj-1', projectTitle: 'Campus ledger', stageName: 'Build' },
    { student: { ...PERSON, id: 's-2', firstName: 'Kari' }, projectId: null, projectTitle: null, stageName: null },
  ],
  awaitingProposals: [
    {
      id: 'p-9',
      title: 'Awaiting me',
      version: 2,
      status: 'submitted',
      student: PERSON,
      submittedAt: '2026-10-02T10:00:00.000Z',
    },
  ],
  awaitingSubmissions: [
    {
      id: 'sub-1',
      projectId: 'proj-1',
      studentId: 's-1',
      studentName: 'Ola Nordmann',
      title: 'Chapter 2 draft',
      submittedAt: '2026-10-03T16:45:00.000Z',
    },
  ],
  deadlines: [
    {
      milestoneId: 'ms-1',
      projectId: 'proj-1',
      studentId: 's-1',
      studentName: 'Ola Nordmann',
      title: 'Chapter 2',
      dueAt: '2099-01-01T00:00:00.000Z',
      overdue: false,
    },
  ],
  usedFallback: false,
};

const EMPTY: Dashboard = {
  students: [],
  awaitingProposals: [],
  awaitingSubmissions: [],
  deadlines: [],
  usedFallback: false,
};

const renderDash = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SupervisorDashboard />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SupervisorDashboard (§16.3 / plan 12.1)', () => {
  it('shows the review queue with drill-ins, the caseload and deadlines', async () => {
    vi.mocked(getSupervisorDashboard).mockResolvedValue(FULL);
    renderDash();

    expect(await screen.findByText('Work awaiting review')).toBeInTheDocument();
    expect(screen.getByText('Assigned students')).toBeInTheDocument();
    expect(screen.getByText('Upcoming deadlines')).toBeInTheDocument();

    // Queue rows drill where the work lives.
    const reviewLinks = screen
      .getAllByRole('link', { name: /review/i })
      .map((link) => link.getAttribute('href'));
    expect(reviewLinks).toEqual(['/proposals/p-9', '/supervision/s-1/submissions/sub-1']);
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).toContain('/supervision/s-1');
    expect(links).toContain('/supervision/s-2');

    // §6.2 I13: both students get a card, stage or honest "no stage".
    expect(screen.getByText('Campus ledger')).toBeInTheDocument();
    expect(screen.getAllByText('No project yet')).toHaveLength(1);
    expect(screen.getByText('Stage: Build')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2')).toBeInTheDocument();
  });

  it('answers an idle queue and empty caseload with copy, not silence', async () => {
    vi.mocked(getSupervisorDashboard).mockResolvedValue(EMPTY);
    renderDash();

    expect(
      await screen.findByText(/nothing waiting right now/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/no students are assigned to you yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no milestone deadlines are scheduled/i)).toBeInTheDocument();
  });

  it('flags fixture answers with the sample-data banner (§10.4)', async () => {
    vi.mocked(getSupervisorDashboard).mockResolvedValue({ ...FULL, usedFallback: true });
    renderDash();

    expect(await screen.findByText(/showing sample data/i)).toBeInTheDocument();
  });
});
