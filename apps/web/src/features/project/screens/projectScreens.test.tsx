import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProjectFeedback from './ProjectFeedback';
import ProjectActivity from './ProjectActivity';
import type { ActivityEntry, FeedbackEntry, ProjectSummary } from '../data/types';
import { useAuthStore } from '@/stores/auth';

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

const {
  listMyProjects,
  listProjectFeedback,
  postFeedback,
  getActivity,
} = await import('../data/projectRepo');

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  title: 'Ledger',
  description: '',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const ENTRY: FeedbackEntry = {
  id: 'f-1',
  projectId: 'proj-1',
  submissionId: null,
  body: 'Start the literature chapter next.',
  createdAt: new Date(Date.now() - 7_200_000).toISOString(),
  updatedAt: new Date(Date.now() - 7_200_000).toISOString(),
  author: { id: 'sup-1', firstName: 'Helen', lastName: 'Brooks', email: 'h@t.local' },
};

const ACTIVITY: ActivityEntry[] = [
  {
    id: 'a-1',
    at: new Date(Date.now() - 7_200_000).toISOString(),
    kind: 'stage.completed',
    actor: { id: 's-1', name: 'Ola Nordmann' },
    summary: 'Stage "Proposal" completed',
  },
  {
    id: 'a-2',
    at: new Date(Date.now() - 7_200_000).toISOString(),
    kind: 'submission.submitted',
    actor: { id: 's-1', name: 'Ola Nordmann' },
    summary: 'Chapter 3 submitted',
  },
];

const wrap = (node: React.ReactNode) =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {node}
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
  vi.mocked(listProjectFeedback).mockResolvedValue([ENTRY]);
  vi.mocked(postFeedback).mockResolvedValue(ENTRY);
  vi.mocked(getActivity).mockResolvedValue(ACTIVITY);
  useAuthStore.setState({
    user: {
      id: 's-1',
      email: 'o@t.local',
      firstName: 'Ola',
      lastName: 'Nordmann',
      role: 'student',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
    },
    status: 'authenticated',
    accessToken: 'token',
  });
});

describe('ProjectFeedback (§11.7 discussion, plan 11.3)', () => {
  it('explains the discussion-vs-decision split and renders the thread', async () => {
    wrap(<ProjectFeedback />);

    expect(await screen.findByText(/Start the literature chapter next\./)).toBeInTheDocument();
    expect(screen.getByText('Helen Brooks')).toBeInTheDocument();
    expect(screen.getByText(/formal decisions live on the submission itself/)).toBeInTheDocument();
  });

  it('posts a message through the API', async () => {
    const user = userEvent.setup();
    wrap(<ProjectFeedback />);

    await screen.findByText(/Start the literature chapter next\./);
    await user.type(screen.getByLabelText(/write to your supervisor/i), 'On it.');
    await user.click(screen.getByRole('button', { name: /post message/i }));

    expect(postFeedback).toHaveBeenCalledWith('proj-1', 'On it.');
  });

  it('shows the empty state with its own hint', async () => {
    vi.mocked(listProjectFeedback).mockResolvedValue([]);
    wrap(<ProjectFeedback />);

    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
    expect(screen.getByText(/say hello or ask the first question/i)).toBeInTheDocument();
  });
});

describe('ProjectActivity (§11.13 derived feed, plan 11.3)', () => {
  it('renders the trail with readable labels and relative times', async () => {
    wrap(<ProjectActivity />);

    expect(await screen.findByText('Stage "Proposal" completed')).toBeInTheDocument();
    expect(screen.getByText('Chapter 3 submitted')).toBeInTheDocument();
    expect(screen.getByText(/Stage completed · Ola Nordmann/)).toBeInTheDocument(); // kind + actor
    expect(screen.getAllByText('2 hours ago')).toHaveLength(2);
    expect(screen.getByText(/never edited by anyone/)).toBeInTheDocument();
  });

  it('shows the empty state before anything happened', async () => {
    vi.mocked(getActivity).mockResolvedValue([]);
    wrap(<ProjectActivity />);

    expect(await screen.findByText('No activity recorded')).toBeInTheDocument();
  });

  it('surfaces a failed feed with a retry', async () => {
    vi.mocked(getActivity).mockRejectedValue(new Error('offline'));
    wrap(<ProjectActivity />);

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
