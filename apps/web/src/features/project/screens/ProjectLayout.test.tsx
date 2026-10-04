import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ProjectLayout from './ProjectLayout';
import type { ProjectSummary } from '../data/types';

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

const { listMyProjects } = await import('../data/projectRepo');

const PROJECT: ProjectSummary = {
  id: 'proj-1',
  title: 'Distributed ledger',
  description: 'Append-only records.',
  status: 'active',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  student: { id: 's-1', firstName: 'Ola', lastName: 'Nordmann', email: 'o@t.local' },
};

const renderLayout = (path = '/project') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/project" element={<ProjectLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<div>overview child</div>} />
            <Route path="milestones" element={<div>milestones child</div>} />
          </Route>
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectLayout (§10.5 My Project ▾)', () => {
  it('shows the loading state while the project resolves', () => {
    vi.mocked(listMyProjects).mockReturnValue(new Promise(() => {}));
    renderLayout();
    expect(screen.getByRole('status')).toHaveTextContent(/loading your project/i);
  });

  it('recovers from a failed read through the retry', async () => {
    const user = userEvent.setup();
    vi.mocked(listMyProjects).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
    renderLayout();

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'Distributed ledger' })).toBeInTheDocument();
  });

  it('explains the legitimate no-project state instead of dead-ending', async () => {
    vi.mocked(listMyProjects).mockResolvedValue([]);
    renderLayout();

    expect(await screen.findByText('You don’t have a project yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to proposals/i })).toHaveAttribute(
      'href',
      '/proposals',
    );
  });

  it('renders the project header and the §16.3 tab inventory', async () => {
    vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
    renderLayout('/project/overview');

    expect(await screen.findByRole('heading', { name: 'Distributed ledger' })).toBeInTheDocument();
    expect(screen.getByText('Ola Nordmann · active')).toBeInTheDocument();

    const tabs = screen.getByRole('navigation', { name: /project sections/i });
    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(tabs).toBeInTheDocument();
    for (const href of [
      '/project/overview',
      '/project/milestones',
      '/project/submissions',
      '/project/feedback',
      '/project/activity',
    ]) {
      expect(hrefs).toContain(href);
    }
    // The active tab is marked, not merely coloured (§16.7).
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
    expect(await screen.findByText('overview child')).toBeInTheDocument();
  });

  it('redirects the bare /project path to the overview tab', async () => {
    vi.mocked(listMyProjects).mockResolvedValue([PROJECT]);
    renderLayout('/project');
    expect(await screen.findByText('overview child')).toBeInTheDocument();
  });
});
