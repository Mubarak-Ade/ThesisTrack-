import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import CaseloadList from './CaseloadList';
import { listCaseload } from '../data/supervisionRepo';
import type { CaseloadPage } from '../data/supervisionRepo';

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

function entry(id: string, first: string, project: string | null, primary = false) {
  return {
    assignmentId: `asg-${id}`,
    projectId: project,
    assignedAt: '2026-09-15T09:00:00.000Z',
    isPrimary: primary,
    student: {
      id,
      firstName: first,
      lastName: 'Nordmann',
      email: `${first.toLowerCase()}@test.local`,
    },
  };
}

const renderList = () =>
  render(
    <MemoryRouter initialEntries={['/supervision']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CaseloadList />
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CaseloadList (§6.2 I13 / plan 12.2)', () => {
  it('renders N students — one card and one drill-in link each', async () => {
    vi.mocked(listCaseload).mockResolvedValue({
      students: [entry('s-1', 'Ola', 'proj-1', true), entry('s-2', 'Kari', null)],
      usedFallback: false,
    } satisfies CaseloadPage);
    renderList();

    expect(await screen.findByText('2 students on your caseload.')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/supervision/s-1',
      '/supervision/s-2',
    ]);
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('No project yet')).toBeInTheDocument();
    expect(screen.getByText('Project assigned')).toBeInTheDocument();
  });

  it('explains an empty caseload instead of dead-ending', async () => {
    vi.mocked(listCaseload).mockResolvedValue({ students: [], usedFallback: false });
    renderList();

    expect(await screen.findByText('No students assigned yet')).toBeInTheDocument();
    expect(
      screen.getByText(/as soon as an administrator assigns you/i),
    ).toBeInTheDocument();
  });

  it('flags fixture answers with the sample-data banner (§10.4)', async () => {
    vi.mocked(listCaseload).mockResolvedValue({
      students: [entry('s-1', 'Ola', 'proj-1')],
      usedFallback: true,
    } satisfies CaseloadPage);
    renderList();

    expect(await screen.findByText(/showing sample data/i)).toBeInTheDocument();
  });
});
