import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProjectOverview from './ProjectOverview';
import type { ProjectBundle, ProjectSummary } from '../data/types';
import { PROJECT_FIXTURE } from '../data/mock/fixtures';

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

const { listMyProjects, getOverviewBundle } = await import('../data/projectRepo');

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  title: 'Distributed ledger',
  description: 'Append-only records.',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const BUNDLE: ProjectBundle = {
  project: PROJECT,
  tracker: {
    stages: [
      {
        id: 'st-1',
        position: 0,
        status: 'completed',
        name: 'Proposal',
        description: null,
        deliverable: null,
        responsibleRole: null,
        requiresSubmission: false,
        requiresReview: false,
        requiresApproval: false,
        startedAt: '2026-09-30T00:00:00.000Z',
        completedAt: '2026-09-30T00:05:00.000Z',
        dueOffsetDays: null,
        dueAt: null,
        overdue: false,
      },
      {
        id: 'st-2',
        position: 1,
        status: 'active',
        name: 'Design',
        description: null,
        deliverable: 'System design pack',
        responsibleRole: 'student',
        requiresSubmission: true,
        requiresReview: true,
        requiresApproval: true,
        startedAt: '2026-09-30T00:05:00.000Z',
        completedAt: null,
        dueOffsetDays: 21,
        dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        overdue: false,
      },
    ],
    current: null,
  },
  milestones: [
    {
      id: 'm-1',
      projectId: 'proj-1',
      title: 'Literature review',
      description: null,
      position: 0,
      dueAt: null,
      status: 'approved',
      state: 'approved',
      completedAt: '2026-09-25T00:00:00.000Z',
    },
    {
      id: 'm-2',
      projectId: 'proj-1',
      title: 'Design document',
      description: null,
      position: 1,
      dueAt: new Date(Date.now() + 3 * 86_400_000 + 7_200_000).toISOString(),
      status: 'in_progress',
      state: 'in_progress',
      completedAt: null,
    },
    {
      id: 'm-3',
      projectId: 'proj-1',
      title: 'Prototype',
      description: null,
      position: 2,
      dueAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      status: 'pending',
      state: 'pending',
      completedAt: null,
    },
  ],
  supervisor: {
    assignedAt: '2026-09-30T00:00:00.000Z',
    supervisor: {
      id: 'sup-1',
      firstName: 'Helen',
      lastName: 'Brooks',
      email: 'h@t.local',
    },
  },
  usedFallback: false,
};

// The active stage is the tracker's current step (carries §16.5's unmet gates).
BUNDLE.tracker.current = { ...BUNDLE.tracker.stages[1], unmet: [] };

const renderOverview = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProjectOverview />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
  vi.mocked(getOverviewBundle).mockResolvedValue(BUNDLE);
});

describe('ProjectOverview (§16.5, plan 11.3)', () => {
  it('renders the stage tracker beside the milestone bar, never merged', async () => {
    renderOverview();

    expect(await screen.findByText('Process stages')).toBeInTheDocument();
    // Stage side: ✓/●/○ markers with the current stage labelled.
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('System design pack')).toBeInTheDocument();
    // Milestone side: §5.6 approved/total + derived percentage.
    expect(screen.getByText('1 of 3 milestones approved')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('answers who supervises and what is due next', async () => {
    renderOverview();

    expect(await screen.findByText('Helen Brooks')).toBeInTheDocument();
    expect(screen.getByText('h@t.local')).toBeInTheDocument();
    // Current milestone card (first open milestone) and nearest deadline —
    // here the same milestone answers both questions.
    expect(screen.getByText('Current milestone')).toBeInTheDocument();
    expect(screen.getAllByText('Design document')).toHaveLength(2);
    expect(screen.getByText('Next deadline')).toBeInTheDocument();
  });

  it('shows the sample-data banner when the read fell back (§10.4)', async () => {
    vi.mocked(getOverviewBundle).mockResolvedValue({ ...PROJECT_FIXTURE });
    renderOverview();

    expect(await screen.findByText(/Showing sample data/i)).toBeInTheDocument();
  });

  it('surfaces a failed bundle with a retry instead of an empty page', async () => {
    vi.mocked(getOverviewBundle).mockRejectedValue(new Error('offline'));
    renderOverview();

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
