import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProjectSubmissions from './ProjectSubmissions';
import type { ProjectSummary, Submission } from '../data/types';

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

const { listMyProjects, listSubmissions } = await import('../data/projectRepo');

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  title: 'Ledger',
  description: '',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const ROWS: Submission[] = [
  {
    id: 'sub-1',
    projectId: 'proj-1',
    milestoneId: null,
    title: 'Chapter 3 — Data model',
    status: 'revision_required',
    submittedAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    submitter: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
  },
  {
    id: 'sub-2',
    projectId: 'proj-1',
    milestoneId: null,
    title: 'Chapter 1 — Introduction',
    status: 'approved',
    submittedAt: '2026-09-20T00:00:00.000Z',
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    submitter: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
  },
];

const renderScreen = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ProjectSubmissions />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
  vi.mocked(listSubmissions).mockResolvedValue(ROWS);
});

describe('ProjectSubmissions (§16.3 list)', () => {
  it('lists submissions with one status language and links to the detail', async () => {
    renderScreen();

    expect(await screen.findByText('Chapter 3 — Data model')).toBeInTheDocument();
    expect(screen.getByText('Revision required')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();

    const row = screen.getByText('Chapter 1 — Introduction').closest('a');
    expect(row).toHaveAttribute('href', '/project/submissions/sub-2');
    expect(screen.getByText('2 submissions — versions are immutable (I7).')).toBeInTheDocument();
  });

  it('points the primary action at the composer (§11.5)', async () => {
    renderScreen();
    const link = await screen.findByRole('link', { name: /new submission/i });
    expect(link).toHaveAttribute('href', '/project/submissions/new');
  });

  it('shows the honest empty state with the same action', async () => {
    vi.mocked(listSubmissions).mockResolvedValue([]);
    renderScreen();

    expect(await screen.findByText('No submissions')).toBeInTheDocument();
    // Header action + empty-state action — same destination.
    const links = screen.getAllByRole('link', { name: 'New submission' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/project/submissions/new');
    }
    expect(screen.getByText('No work submitted yet.')).toBeInTheDocument();
  });

  it('surfaces a failed list with a retry', async () => {
    vi.mocked(listSubmissions).mockRejectedValue(new Error('offline'));
    renderScreen();

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
