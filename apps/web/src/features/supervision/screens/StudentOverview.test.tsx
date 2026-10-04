import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import StudentDetail from './StudentDetail';
import StudentOverview from './StudentOverview';
import {
  advanceStage,
  getProject,
  getStageTracker,
  listMilestones,
  listCaseload,
} from '../data/supervisionRepo';
import type { ProjectStage } from '../data/types';

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

const { toast } = await import('sonner');

const ENTRY = {
  assignmentId: 'asg-1',
  projectId: 'proj-1',
  assignedAt: '2026-09-15T09:00:00.000Z',
  isPrimary: true,
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'ola@test.local' },
};

const STAGE: ProjectStage = {
  id: 'st-1',
  position: 1,
  status: 'active',
  name: 'Build',
  description: null,
  deliverable: 'Working prototype',
  responsibleRole: 'student',
  requiresSubmission: true,
  requiresReview: false,
  requiresApproval: false,
  startedAt: '2026-09-20T00:00:00.000Z',
  completedAt: null,
  dueOffsetDays: 14,
  dueAt: '2099-01-01T00:00:00.000Z',
  overdue: false,
};

function stubApis(unmet: string[]): void {
  vi.mocked(listCaseload).mockResolvedValue({ students: [ENTRY], usedFallback: false });
  vi.mocked(getProject).mockResolvedValue({
    id: 'proj-1',
    title: 'Campus ledger',
    description: 'Append-only records.',
    status: 'active',
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  });
  vi.mocked(getStageTracker).mockResolvedValue({
    stages: [STAGE],
    current: { ...STAGE, unmet },
  });
  vi.mocked(listMilestones).mockResolvedValue([]);
  vi.mocked(advanceStage).mockResolvedValue({
    stages: [{ ...STAGE, status: 'completed' }],
    current: null,
  });
}

const renderOverview = () =>
  render(
    <MemoryRouter initialEntries={['/supervision/s-1/overview']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/supervision/:studentId" element={<StudentDetail />}>
            <Route path="overview" element={<StudentOverview />} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StudentOverview (§16.5 progress + advance)', () => {
  it('shows the tracker and advances when §11.14 gates pass', async () => {
    const user = userEvent.setup();
    stubApis([]);
    renderOverview();

    expect(await screen.findByText('Stage tracker')).toBeInTheDocument();
    expect(screen.getByText(/all gates pass/i)).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Advance stage' });
    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => expect(advanceStage).toHaveBeenCalledWith('proj-1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('keeps the action disabled with the unmet conditions listed, never hidden (§16.5)', async () => {
    stubApis(['requires_submission', 'requires_review']);
    renderOverview();

    expect(await screen.findByText('Stage tracker')).toBeInTheDocument();
    expect(screen.getByText('Advance stage — waiting for:')).toBeInTheDocument();

    // §16.5: the unmet gates listed in words, right there with the button.
    expect(screen.getByText('A submission made during this stage')).toBeInTheDocument();
    expect(screen.getByText('That submission reviewed')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Advance stage' });
    expect(button).toBeDisabled();
  });

  it('explains the §3.4 zero-stage project instead of pretending', async () => {
    vi.mocked(listCaseload).mockResolvedValue({ students: [ENTRY], usedFallback: false });
    vi.mocked(getProject).mockResolvedValue({
      id: 'proj-1',
      title: 'Campus ledger',
      description: '',
      status: 'active',
      createdAt: '2026-09-12T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    vi.mocked(getStageTracker).mockResolvedValue({ stages: [], current: null });
    vi.mocked(listMilestones).mockResolvedValue([]);
    renderOverview();

    expect(await screen.findByText(/zero workflow stages materialised/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Advance stage' })).toBeNull();
  });
});
