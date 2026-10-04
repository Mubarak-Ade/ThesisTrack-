import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProjectMilestones from './ProjectMilestones';
import type { Milestone, ProjectSummary } from '../data/types';

vi.mock('../data/projectRepo', () => ({
  listMyProjects: vi.fn(),
  getProject: vi.fn(),
  getStageTracker: vi.fn(),
  getSupervisor: vi.fn(),
  getOverviewBundle: vi.fn(),
  listMilestones: vi.fn(),
  listSubmissions: vi.fn(),
  getSubmission: vi.fn(),
  listVersions: vi.fn(),
  listProjectFeedback: vi.fn(),
  listSubmissionFeedback: vi.fn(),
  listSubmissionReviews: vi.fn(),
  getActivity: vi.fn(),
  createSubmission: vi.fn(),
  patchSubmission: vi.fn(),
  submitSubmission: vi.fn(),
  appendVersion: vi.fn(),
  deleteSubmission: vi.fn(),
  changeMilestoneStatus: vi.fn(),
  postFeedback: vi.fn(),
  postSubmissionFeedback: vi.fn(),
  patchFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  downloadVersion: vi.fn(),
}));

const { listMyProjects, listMilestones, changeMilestoneStatus } = await import(
  '../data/projectRepo'
);

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  title: 'Ledger',
  description: '',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const base: Milestone = {
  id: 'm-1',
  projectId: 'proj-1',
  title: 'Literature review',
  description: 'Survey related work.',
  position: 0,
  dueAt: null,
  status: 'pending',
  state: 'pending',
  completedAt: null,
};

const ROWS: Milestone[] = [
  base,
  { ...base, id: 'm-2', position: 1, title: 'Design document', status: 'in_progress', state: 'in_progress' },
  { ...base, id: 'm-3', position: 2, title: 'Prototype', status: 'submitted', state: 'submitted' },
  {
    ...base,
    id: 'm-4',
    position: 3,
    title: 'Final report',
    status: 'approved',
    state: 'approved',
    completedAt: '2026-10-01T00:00:00.000Z',
  },
];

const renderScreen = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProjectMilestones />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
  vi.mocked(listMilestones).mockResolvedValue(ROWS);
  vi.mocked(changeMilestoneStatus).mockImplementation(async (_id, status) => ({
    ...base,
    status: status as Milestone['status'],
  }));
});

describe('ProjectMilestones (§11.4 student status path)', () => {
  it('lists every milestone with its computed state chip', async () => {
    renderScreen();

    expect(await screen.findByText('Literature review')).toBeInTheDocument();
    expect(screen.getByText('Design document')).toBeInTheDocument();
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument(); // submitted
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
    expect(screen.getByText(/milestones approved \(§5\.6\)/)).toBeInTheDocument();
  });

  it('offers exactly the two transitions a student may take (§11.4)', async () => {
    renderScreen();

    expect(await screen.findByRole('button', { name: 'Start milestone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark submitted' })).toBeInTheDocument();
    // submitted → waits for the supervisor; approved → locked (I6): no buttons.
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('moves a milestone through the API and never locally fakes it', async () => {
    // Hold the request open so the pending affordance is observable.
    vi.mocked(changeMilestoneStatus).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Start milestone' }));

    expect(changeMilestoneStatus).toHaveBeenCalledWith('m-1', 'in_progress');
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeInTheDocument();
  });

  it('explains why an approved milestone has no action (locked)', async () => {
    renderScreen();
    expect(await screen.findByText('Approved — locked (I6).')).toBeInTheDocument();
    expect(screen.getByText(/approval is your supervisor’s decision/)).toBeInTheDocument();
  });

  it('surfaces a rejected transition instead of hiding it (Rule 3)', async () => {
    vi.mocked(changeMilestoneStatus).mockRejectedValue(
      Object.assign(new Error('Cannot move milestone'), { status: 422 }),
    );
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Start milestone' }));
    // The mutation fails loudly; the row keeps its honest state (no fake success).
    expect(changeMilestoneStatus).toHaveBeenCalledWith('m-1', 'in_progress');
    expect(await screen.findByRole('button', { name: 'Start milestone' })).toBeInTheDocument();
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  it('shows the empty state when the supervisor defined nothing yet', async () => {
    vi.mocked(listMilestones).mockResolvedValue([]);
    renderScreen();

    expect(await screen.findByText('No milestones defined yet')).toBeInTheDocument();
  });
});
